import { getRoomDesign } from './metropolis-room-designs.js';
import { createInteriorLayout, createInteriorStairs } from './metropolis-interiors.js';
import { citizenDayPeriod } from './citizen-life.js';
import { createCitizenNavigation, crossingSignal, CITIZEN_RADIUS } from './citizen-navigation.js';
import { citizenStationAccess, stationLiftPose, metroGroundHeightAt } from './metropolis-transit.js';
import { circleOBB, SpatialIndex } from './collision.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z, (a.y || 0) - (b.y || 0));
const point = (x, z, y = 0) => ({ x, z, y });
const groundDoor = building => point(building.x, building.entrance.z + 1.2);
const homeTypes = new Set(['residential', 'hotel']);
const workTypes = new Set(['office', 'cowork', 'drafting', 'consult', 'lab', 'control', 'workshop', 'archive', 'classroom', 'library', 'reception',
  'trading', 'model', 'pharmacy', 'ward', 'rehab', 'produce', 'fish', 'market', 'fashion', 'tailor', 'ceramics', 'artroom',
  'piano', 'strings', 'drums', 'projection', 'fitness', 'tabletennis', 'robot', 'aquarium', 'cafe', 'tea', 'dining', 'bookshop', 'maritime']);
const workRooms = design => design.rooms.filter(room => workTypes.has(room.type) || (design.category === 'restaurant' && room.type === 'kitchen'));
const meetingTypes = new Set(['living', 'reception', 'waiting', 'cafe', 'tea', 'dining', 'market', 'produce', 'fish', 'bookshop', 'library', 'maritime', 'exhibition']);

/** Persistent door-to-room journeys. Render objects never own a resident's day.
 * Every transition follows a route, a real stair flight or an actual fleet pose.
 * Residents use stairs inside addresses, so they do not commandeer the player's
 * lift or invent an invisible second cabin in that shaft. */
export class CitizenJourneys {
  constructor({ residents, buildings, transit, colliders = [] }) {
    this.residents = residents; this.buildings = buildings; this.transit = transit;
    this.navigation = createCitizenNavigation(colliders); this.time = transit.time;
    this.lastTransitTime = transit.time; this.navigationCache = new Map(); this.crossingClaims = new Map();
    this.statistics = { completedVisits: 0, completedCommutes: 0, boarded: 0, alighted: 0, crossings: 0, entered: 0, rested: 0, worked: 0 };
    const homeFloors = building => building.floors.filter(floor => {
      const design = getRoomDesign(building.id, floor.id);
      return homeTypes.has(design.category) && design.rooms.some(room => room.type === 'bedroom');
    });
    const homes = buildings.filter(building => homeFloors(building).length);
    const workFloors = building => building.floors.filter(floor => floor.level <= 8 && floor.id !== 'observation' && workRooms(getRoomDesign(building.id, floor.id)).length)
      .sort((a, b) => (a.id === 'workplace' ? -1 : b.id === 'workplace' ? 1 : a.level - b.level));
    const workplaces = buildings.filter(building => workFloors(building).length);
    for (const resident of residents) {
      const seed = resident.identity.seed, home = homeTypes.has(getRoomDesign(resident.building.id, 'workplace').category) ? resident.building : homes[seed % homes.length];
      const available = homeFloors(home);
      const homeFloor = available[Math.floor(seed / homes.length) % Math.min(8, available.length)];
      const workAddress = workFloors(resident.building).length ? resident.building : workplaces.reduce((a, b) =>
        distance(resident.building, b) < distance(resident.building, a) ? b : a);
      const availableWork = workFloors(workAddress), workFloor = availableWork[seed % availableWork.length];
      resident.y = 0; resident.insideBuildingId = null; resident.floorId = null;
      resident.journey = { phase: 'street-activity', home: { buildingId: home.id, floorId: homeFloor.id, kind: 'home' },
        work: { buildingId: workAddress.id, floorId: workFloor.id, kind: 'work' },
        goal: null, path: [], pathIndex: 0, dwell: 14 + seed % 23, history: [], visits: 0, cycle: 0,
        ticket: null, stationId: null, routeId: null, originStopId: null, destinationStopId: null, crossingId: null, blockedFor: 0 };
    }
  }
  building(id) { return this.buildings.find(building => building.id === id); }
  floorNavigation(building, floorId) {
    const key = `${building.id}/${floorId}`;
    if (!this.navigationCache.has(key)) {
      const floor = building.floors.find(item => item.id === floorId), layout = createInteriorLayout(building, floor);
      const rooms = layout.rooms.map(room => {
        const side = Math.sign(room.x - building.x), candidates = room.accessPoints?.map(item => ({ ...item, y: floor.y })) || [];
        candidates.push(point(room.arrival.x + side * 1.25, room.arrival.z, floor.y), point(room.arrival.x, room.arrival.z, floor.y));
        const index = new SpatialIndex(layout.colliders);
        const anchor = candidates.find(candidate => !index.query({ ...candidate, hx: .6, hz: .6 }).some(box =>
          box.minY < floor.y + 1.8 && box.maxY > floor.y + .05 && circleOBB({ ...candidate, radius: CITIZEN_RADIUS + .05 }, box)));
        return { ...room, anchor: anchor || point(room.arrival.x, room.arrival.z, floor.y) };
      });
      // Retain only navigation and collision, never the full furniture/label data.
      this.navigationCache.set(key, { floor, entrance: { ...layout.entrance, y: floor.y }, rooms });
      if (this.navigationCache.size > 96) this.navigationCache.delete(this.navigationCache.keys().next().value);
    }
    return this.navigationCache.get(key);
  }
  roomGoal(goal, resident) {
    const building = this.building(goal.buildingId), data = this.floorNavigation(building, goal.floorId);
    const design = getRoomDesign(building.id, goal.floorId), eligibleWork = new Set(workRooms(design).map(room => room.id));
    const candidates = data.rooms.filter(room => goal.kind === 'home' ? ['living', 'bedroom'].includes(room.type)
      : goal.kind === 'work' ? eligibleWork.has(room.id) : meetingTypes.has(room.type));
    if (!candidates.length && goal.kind !== 'errand') throw new Error(`No ${goal.kind} room at ${building.id}/${goal.floorId}`);
    const room = candidates[resident.person % Math.max(1, candidates.length)] || data.rooms[0];
    return { ...goal, roomId: room.id, roomName: room.name, roomType: room.type, room, floor: data.floor, building };
  }
  setPath(resident, path, phase, next) {
    const j = resident.journey;
    j.path = path || []; j.pathIndex = 0; j.phase = phase; j.next = next; j.blockedFor = 0;
    resident.state = j.path.length ? 'walking' : 'waiting';
  }
  selectGoal(resident, hour) {
    const j = resident.journey, period = citizenDayPeriod(hour);
    let goal;
    if (period === 3) goal = j.home;
    else if (period === 1 && j.cycle % 2 === 1) {
      const building = this.buildings[(resident.block + (resident.person % 2 ? 1 : 8)) % this.buildings.length];
      goal = { kind: 'errand', buildingId: building.id, floorId: 'lobby' };
    } else goal = j.work;
    // The travelling role also has real appointments on the opposite shore.
    // Ferries/high-speed routes return to the same north-shore room afterward.
    if (resident.person === 2 && j.cycle % 2 === 1 && period !== 3) {
      const routeId = ['ferry', 'metro', 'light-rail', 'high-speed'][resident.block % 4];
      const stops = this.transit.stops.filter(stop => stop.routeId === routeId && stop.entrance.z < -390);
      const origin = stops.reduce((a, b) => distance(resident, b.entrance) < distance(resident, a.entrance) ? b : a);
      const destination = this.transit.stops.find(stop => stop.routeId === routeId && stop.id !== origin.id);
      j.excursion = { originStopId: origin.id, destinationStopId: destination.id, returning: false };
    } else j.excursion = null;
    j.goal = this.roomGoal(goal, resident); j.cycle++; resident.cycle = j.cycle;
    resident.routine.period = period;
    resident.routine.purpose = `${goal.kind === 'home' ? '返回' : goal.kind === 'errand' ? '前往办事' : '前往工作'} ${j.goal.building.name} · ${j.goal.roomName}`;
    if (resident.insideBuildingId) this.leaveBuilding(resident); else this.beginStreet(resident);
  }
  leaveBuilding(resident) {
    const building = this.building(resident.insideBuildingId), floor = building.floors.find(item => item.id === resident.floorId);
    const data = this.floorNavigation(building, floor.id), room = data.rooms.find(item => item.id === resident.roomId);
    const path = [];
    resident.journey.traversingBuildingId = building.id;
    // A clinical workstation may stand away from the doorway's centre line.
    // Return to the actual arrival point before crossing the partition door.
    if (room) { path.push(point(room.arrival.x, room.arrival.z, floor.y), point(building.x, room.arrival.z, floor.y)); }
    const flights = createInteriorStairs(building).filter(flight => flight.toY <= floor.y + .001).reverse();
    for (const flight of flights) path.push(point(building.x, flight.top.z, flight.toY), flight.top, { ...flight.bottom, stair: flight }, point(building.x, flight.bottom.z, flight.fromY));
    path.push({ ...this.floorNavigation(building, 'lobby').entrance }, groundDoor(building));
    this.setPath(resident, path, 'leaving-building', 'street');
  }
  chooseCommute(resident) {
    const j = resident.journey;
    if (j.excursion) return { origin: this.transit.stop(j.excursion.originStopId), destination: this.transit.stop(j.excursion.destinationStopId) };
    const target = groundDoor(j.goal.building), direct = distance(resident, target), candidates = [];
    for (const route of this.transit.routes) {
      const stops = this.transit.stops.filter(stop => stop.routeId === route.id && stop.entrance.z < -390);
      if (stops.length < 2) continue;
      const origin = stops.reduce((a, b) => distance(resident, b.entrance) < distance(resident, a.entrance) ? b : a);
      const destination = stops.reduce((a, b) => distance(target, b.entrance) < distance(target, a.entrance) ? b : a);
      if (origin.id === destination.id) continue;
      const walking = distance(resident, origin.entrance) + distance(target, destination.entrance);
      if (walking < direct * .82 || (resident.person === 2 && walking < direct + 180)) candidates.push({ origin, destination, walking });
    }
    return candidates.sort((a, b) => a.walking - b.walking)[0] || null;
  }
  beginStreet(resident, finalLeg = false) {
    const j = resident.journey;
    resident.insideBuildingId = null; resident.floorId = null; resident.roomId = null; resident.y = 0;
    const commute = finalLeg ? null : this.chooseCommute(resident);
    if (commute) {
      j.originStopId = commute.origin.id; j.destinationStopId = commute.destination.id; j.routeId = commute.origin.routeId;
      if (distance(resident, commute.origin.entrance) < .25) return this.enterStation(resident, commute.origin);
      this.setPath(resident, this.navigation.route(resident, commute.origin.entrance), 'walking-to-station', 'station-entry');
    } else this.setPath(resident, this.navigation.route(resident, groundDoor(j.goal.building)), 'walking-to-building', 'building-entry');
    if (!j.path.length) { j.phase = 'route-blocked'; resident.state = 'waiting'; }
  }
  enterBuilding(resident) {
    const j = resident.journey, building = j.goal.building, path = [{ ...this.floorNavigation(building, 'lobby').entrance }];
    j.traversingBuildingId = building.id;
    const flights = createInteriorStairs(building).filter(flight => flight.toY <= j.goal.floor.y + .001);
    for (const flight of flights) path.push(point(building.x, flight.bottom.z, flight.fromY), flight.bottom, { ...flight.top, stair: flight }, point(building.x, flight.top.z, flight.toY));
    path.push(point(building.x, j.goal.room.arrival.z, j.goal.floor.y), point(j.goal.room.arrival.x, j.goal.room.arrival.z, j.goal.floor.y), j.goal.room.anchor);
    this.setPath(resident, path, 'entering-building', 'room-activity');
  }
  enterStation(resident, stop, reverse = false) {
    const j = resident.journey, access = citizenStationAccess(stop); j.stationId = stop.id;
    if (Array.isArray(access)) this.setPath(resident, reverse ? [...access].reverse() : access, reverse ? 'leaving-station' : 'entering-station', reverse ? 'street-after-station' : 'platform');
    else if (reverse) this.setPath(resident, [...access.platform].reverse(), 'walking-to-access-lift', 'lift-wait-down');
    else this.setPath(resident, access.street, 'walking-to-access-lift', 'lift-wait-up');
  }
  arrive(resident) {
    const j = resident.journey, next = j.next; j.path = []; j.pathIndex = 0;
    if (next === 'street') return this.beginStreet(resident);
    if (next === 'building-entry') return this.enterBuilding(resident);
    if (next === 'station-entry') return this.enterStation(resident, this.transit.stop(j.originStopId));
    if (next === 'platform') { j.phase = 'waiting-transit'; resident.state = 'waiting-transit'; return; }
    if (next === 'lift-wait-up' || next === 'lift-wait-down') { j.phase = next; resident.state = 'waiting'; return; }
    if (next === 'lift-boarded-up' || next === 'lift-boarded-down') { j.phase = next === 'lift-boarded-up' ? 'access-lift-up' : 'access-lift-down'; resident.state = 'waiting'; return; }
    if (next === 'street-after-station') {
      j.stationId = null;
      if (j.excursion && !j.excursion.returning) {
        j.excursion.returning = true; j.phase = 'shore-appointment'; j.dwell = 25 + resident.identity.seed % 20;
        resident.state = 'photographing'; return;
      }
      if (j.excursion) j.excursion = null;
      return this.beginStreet(resident, true);
    }
    if (next === 'room-activity') {
      resident.floorId = j.goal.floorId; resident.roomId = j.goal.roomId;
      j.phase = 'room-activity'; j.dwell = (j.goal.kind === 'home' ? 100 : j.goal.kind === 'work' ? 70 : 35) + resident.identity.seed % 43;
      resident.state = j.goal.kind === 'home' ? 'resting' : j.goal.kind === 'work' ? 'working' : /cafe|tea|dining/.test(j.goal.roomType) ? 'refreshments' : 'shopping';
      j.visits++; this.statistics.completedVisits++;
      if (j.goal.kind === 'home') this.statistics.rested++; else if (j.goal.kind === 'work') this.statistics.worked++;
      j.history.push({ time: this.time, buildingId: j.goal.buildingId, floorId: j.goal.floorId, roomId: j.goal.roomId, kind: j.goal.kind });
      if (j.history.length > 8) j.history.shift();
    }
  }
  walk(resident, dt, vehicles) {
    const j = resident.journey, target = j.path[j.pathIndex]; if (!target) return this.arrive(resident);
    const speed = Math.max(.85, resident.speed) * 1.18, gap = distance(resident, target);
    const crossing = target.crossing;
    if (crossing && j.crossingId !== crossing.id) {
      const signal = crossingSignal(crossing, this.time);
      const needed = gap / speed + 2;
      if (!signal.green || signal.remaining < needed) { resident.state = 'waiting'; return; }
      j.crossingId = crossing.id; this.crossingClaims.set(resident.id, crossing);
    }
    const amount = Math.min(gap, dt * speed), fraction = gap > 1e-6 ? amount / gap : 1;
    const candidate = { x: resident.x + (target.x - resident.x) * fraction, z: resident.z + (target.z - resident.z) * fraction,
      y: resident.y + ((target.y || 0) - resident.y) * fraction };
    if (target.stair) {
      const flight = target.stair;
      const steps = Math.ceil(Math.max(0, Math.min(1, (flight.startZ - candidate.z) / flight.run)) * flight.treadCount - 1e-7);
      candidate.y = flight.fromY + Math.max(0, steps) * flight.rise / flight.treadCount;
    }
    const activeStation = j.stationId && this.transit.stop(j.stationId);
    if (activeStation?.kind === 'metro' && /entering-station|leaving-station/.test(j.phase)) candidate.y = metroGroundHeightAt(activeStation, candidate.x, candidate.z, resident.y);
    const street = /walking-to-station|walking-to-building/.test(j.phase);
    if (street && vehicles.some(vehicle => vehicle.health > 0 && Math.abs((vehicle.y || 0) - candidate.y) < 2 &&
      Math.abs(vehicle.x - candidate.x) < 5 && Math.abs(vehicle.z - candidate.z) < 6 && circleOBB({ ...candidate, radius: .85 }, vehicle))) {
      resident.state = 'waiting'; return;
    }
    resident.yaw = Math.atan2(target.x - resident.x, target.z - resident.z);
    Object.assign(resident, candidate); resident.state = 'walking'; resident.phase += amount * 6.8;
    if (j.traversingBuildingId) {
      const building = this.building(j.traversingBuildingId);
      const indoors = resident.y > .1 || resident.z <= building.z + building.depth / 2 + .1;
      if (j.phase === 'entering-building' && indoors && !resident.insideBuildingId) { resident.insideBuildingId = building.id; this.statistics.entered++; }
      if (j.phase === 'leaving-building' && !indoors) { resident.insideBuildingId = null; resident.floorId = null; }
    }
    if (resident.insideBuildingId) {
      const building = this.building(resident.insideBuildingId);
      resident.floorId = building.floors.reduce((a, b) => Math.abs(b.y - resident.y) < Math.abs(a.y - resident.y) ? b : a).id;
    }
    if (amount >= gap - 1e-6) {
      j.pathIndex++;
      if (crossing) { j.crossingId = null; this.crossingClaims.delete(resident.id); this.statistics.crossings++; }
      if (j.pathIndex === j.path.length) this.arrive(resident);
    }
  }
  update(dt, { hour = 12, vehicles = [] } = {}) {
    if (!(dt > 0)) return;
    this.time = this.transit.time;
    for (const resident of this.residents) {
      const j = resident.journey;
      resident.routine.period = citizenDayPeriod(hour);
      if (j.path.length) { this.walk(resident, dt, vehicles); continue; }
      if (['street-activity', 'room-activity', 'shore-appointment'].includes(j.phase)) {
        if (resident.interactionUntil > this.time) { resident.state = 'greeting'; continue; }
        j.dwell -= dt;
        if (j.phase === 'room-activity' && j.goal.kind === 'home' && citizenDayPeriod(hour) === 3) continue;
        // Stay at work during the two work periods; a timed activity finishing
        // is not a reason to leave the address and immediately re-enter it.
        if (j.phase === 'room-activity' && j.goal.kind === 'work' && [0, 2].includes(citizenDayPeriod(hour))) {
          resident.state = j.dwell % 80 < -68 ? 'stretching' : 'working';
          continue;
        }
        if (j.dwell > 0 && !(j.phase === 'room-activity' && ((citizenDayPeriod(hour) === 3) !== (j.goal.kind === 'home')))) continue;
        if (j.phase === 'shore-appointment') {
          const original = j.excursion.originStopId;
          j.excursion.originStopId = j.excursion.destinationStopId; j.excursion.destinationStopId = original;
          this.beginStreet(resident); continue;
        }
        this.selectGoal(resident, hour); continue;
      }
      if (j.phase === 'route-blocked') { j.blockedFor += dt; if (j.blockedFor > 8) this.beginStreet(resident); continue; }
      if (j.phase === 'waiting-transit') {
        const ticket = this.transit.reserveCitizen(resident.id, j.stationId);
        if (!ticket) continue;
        j.ticket = ticket; j.phase = 'boarding'; resident.state = 'walking';
        j.boardingPath = this.transit.citizenBoardingPath(j.stationId, ticket.vehicleId, ticket.slot).slice(1); j.boardingIndex = 0;
      }
      if (j.phase === 'boarding' || j.phase === 'alighting') {
        const target = j.boardingPath[j.boardingIndex], gap = distance(resident, target), t = gap > 1e-7 ? Math.min(1, dt * 2.3 / gap) : 1;
        Object.assign(resident, { x: resident.x + (target.x - resident.x) * t, y: resident.y + (target.y - resident.y) * t,
          z: resident.z + (target.z - resident.z) * t, yaw: Math.atan2(target.x - resident.x, target.z - resident.z) });
        resident.state = 'walking'; resident.phase += dt * 12;
        if (t === 1) j.boardingIndex++;
        if (j.boardingIndex === j.boardingPath.length) {
          if (j.phase === 'boarding') { this.transit.confirmCitizen(resident.id); this.statistics.boarded++; j.phase = 'riding'; resident.state = 'commuting'; }
          else { this.transit.releaseCitizen(resident.id); j.ticket = null; this.statistics.alighted++; this.statistics.completedCommutes++; this.enterStation(resident, this.transit.stop(j.stationId), true); }
        }
        continue;
      }
      if (j.phase === 'riding') {
        const pose = this.transit.citizenPose(j.ticket.vehicleId, j.ticket.slot); Object.assign(resident, pose); resident.state = 'commuting';
        const vehicle = this.transit.vehicles.find(item => item.id === j.ticket.vehicleId);
        if (vehicle.pose.stopId !== j.destinationStopId) continue;
        const stop = this.transit.stop(j.destinationStopId), path = this.transit.citizenBoardingPath(stop.id, j.ticket.vehicleId, j.ticket.slot).reverse();
        const seconds = path.slice(1).reduce((sum, point, index) => sum + distance(point, path[index]), 0) / 2.3;
        if (vehicle.pose.remaining < seconds + .5) continue;
        j.phase = 'alighting'; j.stationId = stop.id; j.boardingPath = path.slice(1); j.boardingIndex = 0;
        continue;
      }
      if (j.phase.startsWith('lift-wait-')) {
        const stop = this.transit.stop(j.stationId), lift = stationLiftPose(stop, this.time), up = j.phase.endsWith('up');
        const cabin = citizenStationAccess(stop).cabin;
        const seconds = distance(resident, { ...cabin, y: up ? 0 : stop.platform.y }) / (Math.max(.85, resident.speed) * 1.18);
        if (!lift.open || lift.level !== (up ? 'street' : 'platform') || lift.remaining < seconds + .5) continue;
        this.setPath(resident, [{ ...cabin, y: up ? 0 : stop.platform.y }], 'access-lift-boarding', up ? 'lift-boarded-up' : 'lift-boarded-down'); continue;
      }
      if (j.phase === 'access-lift-up' || j.phase === 'access-lift-down') {
        const stop = this.transit.stop(j.stationId), lift = stationLiftPose(stop, this.time), up = j.phase.endsWith('up'); resident.y = lift.y;
        if (!lift.open || lift.level !== (up ? 'platform' : 'street')) continue;
        const access = citizenStationAccess(stop);
        this.setPath(resident, up ? access.platform : [...access.street].reverse().concat({ ...stop.entrance }), 'access-lift-exit', up ? 'platform' : 'street-after-station');
      }
    }
  }
  trafficYieldAt(car) {
    if (Math.abs(car.y || 0) > 2) return false;
    for (const crossing of this.crossingClaims.values()) {
      const dx = crossing.x - car.x, dz = crossing.z - car.z;
      const forward = dx * Math.sin(car.yaw) + dz * Math.cos(car.yaw), across = dx * Math.cos(car.yaw) - dz * Math.sin(car.yaw);
      if (forward > -12 && forward < Math.max(38, car.speed * car.speed / 8 + 20) && Math.abs(across) < 25) return true;
    }
    return false;
  }
  snapshot() { return { ...this.statistics, navigation: this.navigation.snapshot(), navigationFloors: this.navigationCache.size,
    phases: Object.fromEntries([...new Set(this.residents.map(person => person.journey.phase))].map(phase => [phase, this.residents.filter(person => person.journey.phase === phase).length])) }; }
  dispose() { for (const resident of this.residents) this.transit.releaseCitizen(resident.id); this.navigationCache.clear(); this.crossingClaims.clear(); }
}
