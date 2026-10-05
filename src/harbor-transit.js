/** Playable original street transport. Timetables and passenger coordinates are
 * independent of visibility; vehicle interiors use their authored local metres. */
import { SpatialIndex, moveCircle, overlapOBB } from './collision.js';
import { HARBOR_VEHICLE_SPECS, createHarborVehicleLayout } from './harbor-vehicle-models.js';
import { intersectionSignal } from './traffic.js';
import { ROAD_CENTERS, VEHICLE_DIMENSIONS } from './world-config.js';

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const wrap = (n, size) => ((n % size) + size) % size;
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const point = (x, z, y = 0, stopId = null) => ({ x, y, z, ...(stopId ? { stopId } : {}) });
const positionOf = p => p?.position || p;
const inside = (b, x, z, inset = 0) => x >= b.minX + inset && x <= b.maxX - inset && z >= b.minZ + inset && z <= b.maxZ - inset;
const STOP_LINE = 15, ROAD_CLEARANCE = .08, BRAKING = 6, ACCELERATION = 2.8;
export const HARBOR_PIER_SEGMENTS = Object.freeze([
  { bank: 'south', startZ: -280, endZ: -288, fromY: 0, toY: 1.3 },
  { bank: 'south', startZ: -288, endZ: -304.8, fromY: 1.3, toY: 1.3 },
  { bank: 'north', startZ: -400, endZ: -394, fromY: 0, toY: 2.1 },
  { bank: 'north', startZ: -394, endZ: -386, fromY: 2.1, toY: 2.1 },
  { bank: 'north', startZ: -386, endZ: -380.5, fromY: 2.1, toY: 1.3 },
  { bank: 'north', startZ: -380.5, endZ: -379.7, fromY: 1.3, toY: 1.3 },
].map(Object.freeze));

export function harborLocalToWorld(p, pose) {
  const c = Math.cos(pose.yaw || 0), s = Math.sin(pose.yaw || 0);
  return { x: pose.x + c * p.x + s * p.z, y: (pose.y || 0) + (p.y || 0), z: pose.z - s * p.x + c * p.z,
    yaw: (pose.yaw || 0) + (p.yaw || 0) };
}
export function harborWorldToLocal(p, pose) {
  const c = Math.cos(pose.yaw || 0), s = Math.sin(pose.yaw || 0), dx = p.x - pose.x, dz = p.z - pose.z;
  return { x: dx * c - dz * s, y: (p.y || 0) - (pose.y || 0), z: dx * s + dz * c,
    yaw: (p.yaw || 0) - (pose.yaw || 0) };
}

/** Actual curb lanes of the existing 22 m streets, rather than a renamed
 * elevated railway. The two tram tracks are eight metres either side of x=240. */
export const HARBOR_ROUTES = Object.freeze([
  { id: 'harbor-bus', kind: 'bus', name: '12 · 潮汐街巴士', englishName: 'Tide Street Bus', color: '#356b68', speed: 13, dwell: 11, fleet: 2,
    nodes: [point(152, 120, 0, 'harbor-bus-courtyard'), point(152, 168), point(200, 168, 0, 'harbor-bus-market'), point(248, 168),
      point(248, 60, 0, 'harbor-bus-lantern'), point(248, -80, 0, 'harbor-bus-workshop'), point(248, -168),
      point(200, -168, 0, 'harbor-bus-south'), point(152, -168), point(152, -80, 0, 'harbor-bus-garden')] },
  { id: 'harbor-tram', kind: 'tram', name: '08 · 灯湾街电车', englishName: 'Lantern Street Tram', color: '#ad684b', speed: 12, dwell: 12, fleet: 2,
    nodes: [point(248, 100, 0, 'harbor-tram-lantern'), point(248, -40, 0, 'harbor-tram-workshop'), point(248, -180, 0, 'harbor-tram-quay'),
      point(248, -224), point(232, -224), point(232, 144), point(248, 144)] },
  { id: 'harbor-ferry', kind: 'ferry', name: '03 · 河口渡轮', englishName: 'Estuary Ferry', color: '#405b56', speed: 7, dwell: 16, fleet: 1,
    nodes: [point(227.2, -309.5, 0, 'harbor-ferry-south'), point(253, -309.5), point(269, -329), point(269, -354),
      point(247, -375), point(212.8, -375, 0, 'harbor-ferry-north'), point(187, -375), point(171, -354), point(171, -329), point(193, -309.5)] },
].map(r => Object.freeze({ ...r, nodes: Object.freeze(r.nodes.map(Object.freeze)) })));

const STOP_NAMES = {
  'harbor-bus-courtyard': '潮庭里', 'harbor-bus-market': '南街市集', 'harbor-bus-lantern': '灯湾街', 'harbor-bus-workshop': '工坊街',
  'harbor-bus-south': '潮汐仓街', 'harbor-bus-garden': '榕影花园', 'harbor-tram-lantern': '灯湾书店',
  'harbor-tram-workshop': '工坊街口', 'harbor-tram-quay': '河口南堤', 'harbor-ferry-south': '河口南码头', 'harbor-ferry-north': '河口北码头',
};

function roundedPath(nodes, kind) {
  const result = [];
  const mix = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[wrap(i - 1, nodes.length)], b = nodes[i], c = nodes[(i + 1) % nodes.length];
    if (b.stopId) { result.push({ ...b }); continue; }
    const radius = Math.min(kind === 'tram' ? 6 : 14, distance(a, b) * .27, distance(b, c) * .27);
    const from = mix(b, a, radius / distance(a, b)), to = mix(b, c, radius / distance(b, c));
    for (let j = 0; j <= 12; j++) { const t = j / 12; result.push(mix(mix(from, b, t), mix(b, to, t), t)); }
  }
  return result;
}

export function compileHarborRoute(route) {
  const path = roundedPath(route.nodes, route.kind), pieces = [], arrivals = [];
  let duration = 0;
  for (let i = 0; i < path.length; i++) {
    const from = path[i], to = path[(i + 1) % path.length], yaw = Math.atan2(to.x - from.x, to.z - from.z);
    if (from.stopId) {
      arrivals.push({ stopId: from.stopId, time: duration });
      pieces.push({ from, to: from, yaw, start: duration, end: duration + route.dwell, stopId: from.stopId }); duration += route.dwell;
    }
    const length = distance(from, to), ease = !!(from.stopId || to.stopId);
    const bendSpeed = length < 4 ? Math.min(route.speed, route.kind === 'tram' ? 5 : 6) : route.speed;
    const seconds = Math.max(.002, length / bendSpeed * (ease ? 1.57 : 1));
    pieces.push({ from, to, yaw, start: duration, end: duration + seconds, ease }); duration += seconds;
  }
  const offsets = [0];
  if (route.fleet > 1) offsets.push(arrivals[Math.floor(arrivals.length / 2)].time);
  return { ...route, path, pieces, arrivals, duration, offsets, stops: arrivals.map(a => a.stopId) };
}

export function harborRoutePose(route, serviceTime) {
  const phase = wrap(serviceTime, route.duration), i = route.pieces.findIndex(p => phase < p.end), piece = route.pieces[i < 0 ? route.pieces.length - 1 : i];
  const f0 = clamp((phase - piece.start) / (piece.end - piece.start), 0, 1), f = piece.ease ? (1 - Math.cos(f0 * Math.PI)) / 2 : f0;
  const previous = route.pieces[wrap(i - 1, route.pieces.length)], next = route.pieces[(i + 1) % route.pieces.length];
  const angle = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
  const fromYaw = piece.stopId || previous.stopId ? piece.yaw : piece.yaw - angle(previous.yaw, piece.yaw) / 2;
  const toYaw = piece.stopId || next.stopId ? piece.yaw : piece.yaw + angle(piece.yaw, next.yaw) / 2;
  const upcoming = route.arrivals.map(a => ({ ...a, seconds: wrap(a.time - phase, route.duration) })).sort((a, b) => a.seconds - b.seconds)[0];
  return { x: piece.from.x + (piece.to.x - piece.from.x) * f, y: piece.from.y + (piece.to.y - piece.from.y) * f,
    z: piece.from.z + (piece.to.z - piece.from.z) * f, yaw: fromYaw + angle(fromYaw, toYaw) * f,
    stopId: piece.stopId || null, doorsOpen: !!piece.stopId, remaining: piece.end - phase,
    nextStopId: piece.stopId || upcoming.stopId, secondsToArrival: piece.stopId ? 0 : upcoming.seconds,
    speed: piece.stopId ? 0 : distance(piece.from, piece.to) / (piece.end - piece.start) * (piece.ease ? Math.PI / 2 * Math.sin(f0 * Math.PI) : 1) };
}

/** The height is continuous along the staircase and its two short landings.
 * A deck change requires walking through that route; E never changes floors. */
export function harborPassengerSupport(layout, x, z, currentY = layout.deckLevels[0]) {
  for (const stair of layout.stairs) {
    const direction = Math.sign(stair.endZ - stair.startZ), start = stair.startZ - direction * .44, end = stair.endZ + direction * .44;
    if (Math.abs(x - stair.x) <= stair.width / 2 + .005 && z >= Math.min(start, end) && z <= Math.max(start, end)) {
      const t = clamp((z - stair.startZ) / (stair.endZ - stair.startZ), 0, 1), height = stair.fromY + t * stair.rise;
      // The upper deck can cross above the bottom landing, but only the
      // matching height may enter the flight or its lower landing.
      if (Math.abs(height - currentY) < .65 || t > .8 && currentY > (stair.fromY + stair.toY) / 2) return height;
    }
  }
  const candidates = layout.walkSurfaces.filter(b => inside(b, x, z)).map(b => b.y);
  if (!candidates.length) return null;
  return candidates.reduce((a, b) => Math.abs(a - currentY) <= Math.abs(b - currentY) ? a : b);
}

function localColliders(layout) {
  const result = layout.blockers.map(b => ({ ...b, physics: true, camera: b.kind === 'shell' }));
  // E uses the physical lower-deck portal. Ordinary walking stays inside the
  // moving cabin, including while its door is open during a station dwell.
  for (const d of layout.doors) result.push({ id: `${d.id}-boarding-edge`, kind: 'door', x: d.x, z: d.z, hx: .06, hz: d.width / 2,
    minY: d.sillY, maxY: d.sillY + d.height, physics: true, camera: false });
  return result;
}

export class HarborTransitService {
  constructor({ onMessage = null, groundHeightAt = () => 0 } = {}) {
    this.time = 0; this.onMessage = onMessage; this.streetGroundHeightAt = groundHeightAt;
    this.routes = HARBOR_ROUTES.map(compileHarborRoute); this.layouts = new Map(['bus', 'tram', 'ferry'].map(k => [k, createHarborVehicleLayout(k)]));
    this.localPhysics = new Map([...this.layouts].map(([k, layout]) => [k, { colliders: localColliders(layout), index: new SpatialIndex(localColliders(layout)) }]));
    this.vehicles = this.routes.flatMap(route => route.offsets.map((offset, index) => ({ id: `${route.id}-${index + 1}`, routeId: route.id, kind: route.kind,
      offset, serviceTime: offset, delay: 0, distanceTravelled: 0, pose: harborRoutePose(route, offset), held: null, motionSpeed: 0, junction: null, trafficState: 'dwell' })));
    this.stops = this.routes.flatMap(route => route.arrivals.map(arrival => {
      const pose = harborRoutePose(route, arrival.time), layout = this.layouts.get(route.kind), door = layout.doors[0];
      const portal = harborLocalToWorld({ x: door.x, y: door.sillY, z: door.z }, pose), outside = harborLocalToWorld({ x: door.x + door.side * 3.0, y: door.sillY, z: door.z }, pose);
      const ferry = route.kind === 'ferry', north = arrival.stopId.endsWith('north');
      const board = ferry ? point(220, north ? -380.5 : -304, 1.3) : { ...outside, y: this.streetGroundHeightAt(outside.x, outside.z) };
      const entrance = ferry ? point(220, north ? -400 : -280) : { ...board };
      return { id: arrival.stopId, routeId: route.id, kind: route.kind, name: STOP_NAMES[arrival.stopId], berth: { ...pose }, board, platform: { ...board }, portal,
        entrance, entry: { ...entrance }, exit: { ...board }, streetExit: { ...entrance, yaw: north ? Math.PI : 0 }, doorId: door.id, walkable: true };
    }));
    this.ridingVehicleId = null; this.boardedStopId = null; this.passenger = null; this.passengerJump = 0; this.jumpVelocity = 0; this.jumpHeld = false;
    this.activeStopId = null; this.citizenPassengers = new Map(); this.citizenBoardings = 0; this.version = 0;
    this.colliders = []; this.ridingWorldColliders = [];
  }
  route(id) { return this.routes.find(r => r.id === id); }
  stop(id) { return this.stops.find(s => s.id === id); }
  vehicle(id = this.ridingVehicleId) { return this.vehicles.find(v => v.id === id); }
  layout(kindOrId = this.ridingVehicleId) { return this.layouts.get(this.vehicle(kindOrId)?.kind || kindOrId); }
  get riding() { return !!this.ridingVehicleId; }
  get passengerPose() { const v = this.vehicle(); return v && this.passenger ? harborLocalToWorld({ ...this.passenger, y: this.passenger.y + this.passengerJump }, v.pose) : null; }
  get boardedStop() { return this.stop(this.boardedStopId); }
  get trafficBodies() {
    return this.vehicles.filter(v => v.kind !== 'ferry').map(v => {
      const spec = HARBOR_VEHICLE_SPECS[v.kind], p = v.pose;
      return { id: v.id, kind: v.kind, x: p.x, z: p.z, y: p.y, yaw: p.yaw, hx: spec.halfWidth + .08, hz: spec.halfLength + .08,
        minY: p.y, maxY: p.y + spec.height, speed: v.held ? 0 : p.speed, vx: Math.sin(p.yaw) * (v.held ? 0 : p.speed),
        vz: Math.cos(p.yaw) * (v.held ? 0 : p.speed), health: 100, traffic: true };
    });
  }
  collisionContext() {
    if (!this.riding) return null;
    const v = this.vehicle(), groundY = v.pose.y + this.passenger.y;
    return { id: `harbor-vehicle:${v.id}`, version: this.version, colliders: this.ridingWorldColliders, groundY, radius: this.layout(v.kind).passengerRadius,
      groundHeightAt: (x, z, currentY = groundY) => {
        const p = harborWorldToLocal({ x, z, y: currentY }, v.pose);
        const height = harborPassengerSupport(this.layout(v.kind), p.x, p.z, p.y);
        return height === null ? this.streetGroundHeightAt(x, z, currentY) : v.pose.y + height;
      } };
  }
  get cameraColliders() {
    const v = this.vehicle(); if (!v) return [];
    const layout = this.layout(v.kind), result = layout.blockers.filter(b => b.kind === 'shell').map(b => {
      const p = harborLocalToWorld({ x: b.x, z: b.z, y: 0 }, v.pose);
      return { ...b, x: p.x, z: p.z, yaw: v.pose.yaw, minY: b.minY + v.pose.y, maxY: b.maxY + v.pose.y, physics: false, camera: true };
    });
    for (const deck of layout.decks) result.push({ id: `${v.id}-${deck.id}-roof`, x: v.pose.x, z: v.pose.z, yaw: v.pose.yaw,
      hx: (deck.maxX - deck.minX) / 2, hz: (deck.maxZ - deck.minZ) / 2, minY: v.pose.y + deck.ceilingY, maxY: v.pose.y + deck.ceilingY + .075, physics: false, camera: true });
    return result;
  }
  /** Piers are ordinary world support. The southern access rises over the
   * existing sea walls; the northern wall is two metres high, so its footbridge
   * first rises to 2.1 m, then descends to the ferry's lower-deck gangway. */
  groundHeightAt(x, z, currentY = 0) {
    if (Math.abs(x - 220) > 3.3) return null;
    const segment = HARBOR_PIER_SEGMENTS.find(s => z >= Math.min(s.startZ, s.endZ) && z <= Math.max(s.startZ, s.endZ));
    if (segment) return segment.fromY + (segment.toY - segment.fromY) * (z - segment.startZ) / (segment.endZ - segment.startZ);
    return null;
  }
  nextArrival(stopId) {
    const stop = this.stop(stopId); if (!stop) return null;
    const route = this.route(stop.routeId), arrival = route.arrivals.find(a => a.stopId === stopId);
    return Math.min(...this.vehicles.filter(v => v.routeId === route.id).map(v => v.pose.stopId === stopId ? 0 : wrap(arrival.time - v.serviceTime, route.duration)));
  }
  planJourney(fromStopId, toStopId) {
    const from = this.stop(fromStopId), to = this.stop(toStopId);
    if (!from || !to || from.routeId !== to.routeId || from.id === to.id) return null;
    return { routeId: from.routeId, fromStopId, toStopId, nextArrival: this.nextArrival(fromStopId), board: { ...from.board }, alight: { ...to.board } };
  }
  boardCitizen(id, stopId, destinationStopId, { slot = 0 } = {}) {
    if (this.citizenPassengers.has(id)) return this.citizenPassengers.get(id);
    const journey = this.planJourney(stopId, destinationStopId); if (!journey) return null;
    const v = this.vehicles.find(v => v.routeId === journey.routeId && v.pose.stopId === stopId && v.pose.remaining > .6 && !v.held);
    if (!v) return null;
    const ticket = { vehicleId: v.id, routeId: v.routeId, fromStopId: stopId, toStopId: destinationStopId, slot, phase: 'riding' };
    this.citizenPassengers.set(id, ticket); this.citizenBoardings++; return ticket;
  }
  citizenPose(idOrVehicleId, slot = 0) {
    const ticket = this.citizenPassengers.get(idOrVehicleId), v = this.vehicle(ticket?.vehicleId || idOrVehicleId); if (!v) return null;
    const layout = this.layout(v.kind), aisle = layout.aislePaths.find(p => p.deckId === 'lower'), a = aisle.waypoints[0], b = aisle.waypoints.at(-1);
    const z = a.z + (b.z - a.z) * (.18 + ((ticket?.slot ?? slot) % 5) * .14);
    return harborLocalToWorld({ x: 0, y: layout.deckLevels[0], z, yaw: 0 }, v.pose);
  }
  citizenArrival(id) { const t = this.citizenPassengers.get(id), v = this.vehicle(t?.vehicleId); return t && v?.pose.stopId === t.toStopId ? { ...this.stop(t.toStopId).board } : null; }
  releaseCitizen(id) { this.citizenPassengers.delete(id); }
  confirmCitizen(id) { const ticket = this.citizenPassengers.get(id); if (ticket) ticket.phase = 'riding'; }
  holdDoors(vehicleId, seconds = 3) {
    const v = this.vehicle(vehicleId); if (!v?.pose.stopId || !Number.isFinite(seconds)) return false;
    v.doorHoldUntil = Math.max(v.doorHoldUntil || 0, this.time + clamp(seconds, 0, 20)); return true;
  }
  citizenBoardingPath(stopId, vehicleId, slot = 0) {
    const stop = this.stop(stopId), v = this.vehicle(vehicleId); if (!stop || !v || v.pose.stopId !== stopId) return null;
    const door = this.layout(v.kind).doors.find(d => d.id === stop.doorId), insidePoint = harborLocalToWorld(door.inside, v.pose);
    return [{ ...stop.board }, harborLocalToWorld(door.outside, v.pose), insidePoint,
      harborLocalToWorld({ x: 0, y: door.sillY, z: door.z }, v.pose), this.citizenPose(vehicleId, slot)];
  }
  getPrompt(player) {
    const p = positionOf(player); if (!p) return null;
    if (this.riding) {
      const v = this.vehicle(), stop = this.stop(v.pose.stopId), exit = this.availableExit();
      if (exit) return { kind: 'harbor-transit', label: `E 下车 · ${stop.name} · ${Math.ceil(v.pose.remaining)} 秒后出发` };
      return { kind: 'harbor-transit', label: stop ? `${stop.name} · 步行到下层车门按 E 下车` : `${this.route(v.routeId).name} · 可在车内走动，到站从下层车门下车` };
    }
    const stop = this.stops.find(s => distance(p, s.board) < 4.6 && Math.abs((p.y ?? p.groundY ?? 0) - s.board.y) < 1.5);
    if (!stop) return null;
    const v = this.vehicles.find(v => v.pose.stopId === stop.id);
    return { kind: 'harbor-transit', stopId: stop.id, label: v ? `E ${stop.kind === 'ferry' ? '登船' : '上车'} · ${this.route(stop.routeId).name}（${Math.ceil(v.pose.remaining)} 秒）`
      : `${stop.name} · ${this.route(stop.routeId).name} · 下一班约 ${Math.ceil(this.nextArrival(stop.id))} 秒` };
  }
  availableExit() {
    const v = this.vehicle(); if (!v?.pose.stopId || !this.passenger || this.passengerJump > .1) return null;
    const stop = this.stop(v.pose.stopId), layout = this.layout(v.kind);
    if (Math.abs(this.passenger.y - layout.deckLevels[0]) > .22) return null;
    return layout.doors.find(d => d.id === stop.doorId && distance(this.passenger, d.inside) < 1.25) || null;
  }
  interact(player) {
    const p = positionOf(player); if (!p) return { handled: false };
    if (this.riding) {
      const v = this.vehicle(), stop = this.stop(v.pose.stopId);
      if (!stop) return { handled: true, message: '车辆正在行驶；到站后从下层车门下车。' };
      if (!this.availableExit()) return { handled: true, message: '请沿楼梯步行回下层，靠近停靠侧车门按 E 下车。' };
      this.ridingVehicleId = null; this.passenger = null; this.passengerJump = 0; this.jumpVelocity = 0; this.version++;
      return { handled: true, transition: { id: 'street', position: { ...stop.board, yaw: stop.berth.yaw + Math.PI / 2 }, groundY: stop.board.y }, message: `已到达 ${stop.name}。` };
    }
    const stop = this.stops.find(s => distance(p, s.board) < 4.6 && Math.abs((p.y ?? p.groundY ?? 0) - s.board.y) < 1.5);
    if (!stop) return { handled: false };
    if (distance(p, stop.board) > 2.6) return { handled: true, message: '靠近候车标记和停靠侧车门，再按 E 上车。' };
    const v = this.vehicles.find(v => v.pose.stopId === stop.id && v.pose.remaining > .6);
    if (!v) return { handled: true, message: `${stop.name} · 下一班约 ${Math.ceil(this.nextArrival(stop.id))} 秒。` };
    const layout = this.layout(v.kind), door = layout.doors.find(d => d.id === stop.doorId);
    this.ridingVehicleId = v.id; this.boardedStopId = stop.id; this.passenger = { ...door.inside, yaw: 0 };
    this.passengerJump = 0; this.jumpVelocity = 0; this.jumpHeld = false; this.version++;
    return { handled: true, transition: { position: this.passengerPose, groundY: v.pose.y + this.passenger.y, id: `harbor-vehicle:${v.id}` },
      message: `已乘坐 ${this.route(v.routeId).name}。WASD 在两层车厢内走动，沿楼梯上楼；到站从下层车门按 E 下车。` };
  }
  /** Movement is swept through the authored seats and shell, in local space.
   * Looking outside changes camera yaw, never resets the passenger to a seat. */
  movePassenger(dx, dz, { jump = false, dt = 0 } = {}) {
    const v = this.vehicle(); if (!v) return null;
    const layout = this.layout(v.kind), p = this.passenger, physics = this.localPhysics.get(v.kind), start = { ...p };
    p.groundY = p.y; p.jumpY = this.passengerJump;
    const support = (x, z, y) => harborPassengerSupport(layout, x, z, y) ?? y;
    const result = moveCircle(p, dx, dz, layout.passengerRadius, { index: physics.index, groundHeightAt: support, bounds: 30 });
    const height = harborPassengerSupport(layout, p.x, p.z, p.y);
    // The side doors and staircase cutout are real boundaries. An unsupported
    // candidate cannot fall through a deck or escape the moving vehicle.
    if (height === null) { p.x = start.x; p.z = start.z; p.y = start.y; }
    else p.y = height;
    if (jump && !this.jumpHeld && this.passengerJump <= .001) this.jumpVelocity = 4.5;
    this.jumpHeld = jump;
    if (dt > 0) {
      this.jumpVelocity -= 16 * dt;
      this.passengerJump = Math.max(0, this.passengerJump + this.jumpVelocity * dt);
      const deck = layout.decks.reduce((a, b) => Math.abs(a.y - p.y) <= Math.abs(b.y - p.y) ? a : b);
      const onFlight = layout.stairs.some(s => Math.abs(p.x - s.x) <= s.width / 2 && p.z >= Math.min(s.startZ, s.endZ) && p.z <= Math.max(s.startZ, s.endZ));
      const ceiling = onFlight ? layout.decks.at(-1).ceilingY : deck.ceilingY;
      const clearance = Math.max(0, ceiling - p.y - layout.passengerHeight - .015);
      if (this.passengerJump >= clearance) { this.passengerJump = clearance; this.jumpVelocity = Math.min(0, this.jumpVelocity); }
      if (this.passengerJump <= 0) this.jumpVelocity = 0;
    }
    delete p.groundY; delete p.jumpY;
    return { ...result, local: { ...p }, world: this.passengerPose };
  }
  stepPlayer(simulation, dt, input = {}) {
    if (!this.riding) return false;
    const v = this.vehicle(), camera = Number.isFinite(input.cameraYaw) ? input.cameraYaw : simulation.player.yaw;
    const yaw = camera - v.pose.yaw, forward = clamp(input.forward || 0, -1, 1), strafe = clamp(input.strafe || 0, -1, 1);
    let dx = Math.sin(yaw) * forward - Math.cos(yaw) * strafe, dz = Math.cos(yaw) * forward + Math.sin(yaw) * strafe;
    const length = Math.hypot(dx, dz); if (length > 1) { dx /= length; dz /= length; }
    const speed = input.slow ? .3 : input.sprint ? 3.4 : 2.25, seconds = clamp(Number.isFinite(dt) ? dt : 0, 0, .25);
    if (length > .01) this.passenger.yaw = Math.atan2(dx, dz);
    this.movePassenger(dx * speed * seconds, dz * speed * seconds, { jump: !!input.jump, dt: seconds });
    const world = this.passengerPose;
    Object.assign(simulation.player, { x: world.x, z: world.z, yaw: world.yaw, groundY: v.pose.y + this.passenger.y, y: this.passengerJump, vy: this.jumpVelocity });
    simulation.inCar = null; simulation._grounded = this.passengerJump <= .001;
    return true;
  }
  trafficStopDistanceAt(car) {
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw); let nearest = Infinity;
    for (const body of this.trafficBodies) {
      if (body.id === car.id || Math.abs((car.y || 0) - body.y) > 2) continue;
      const dx = body.x - car.x, dz = body.z - car.z, along = dx * fx + dz * fz, across = Math.abs(dx * fz - dz * fx);
      const relative = body.yaw - car.yaw, acrossExtent = Math.abs(Math.cos(relative)) * body.hx + Math.abs(Math.sin(relative)) * body.hz;
      const alongExtent = Math.abs(Math.sin(relative)) * body.hx + Math.abs(Math.cos(relative)) * body.hz;
      if (along > 0 && along < 50 && across < acrossExtent + 1.4) nearest = Math.min(nearest, Math.max(0, along - alongExtent - 3.3));
    }
    return nearest;
  }
  conflict(vehicle, candidate, traffic) {
    if (vehicle.kind === 'ferry' || vehicle.pose.stopId) return null;
    const spec = HARBOR_VEHICLE_SPECS[vehicle.kind], body = { ...candidate, hx: spec.halfWidth + .22, hz: spec.halfLength + .5 };
    const fx = Math.sin(candidate.yaw), fz = Math.cos(candidate.yaw);
    const otherTransit = this.vehicles.filter(v => v.id !== vehicle.id && v.kind !== 'ferry').map(v => {
      const s = HARBOR_VEHICLE_SPECS[v.kind]; return { ...v.pose, id: v.id, kind: v.kind, hx: s.halfWidth, hz: s.halfLength, health: 100 };
    });
    for (const other of [...traffic, ...otherTransit]) {
      if (other.health <= 0 || Math.abs((other.y || 0) - candidate.y) > 2) continue;
      const dx = other.x - candidate.x, dz = other.z - candidate.z, along = dx * fx + dz * fz, across = Math.abs(dx * fz - dz * fx);
      const sameDirection = Math.cos((other.yaw || 0) - candidate.yaw) > .7;
      if (sameDirection && along > 0 && across < spec.halfWidth + (other.hx || 1.2) && along < spec.halfLength + (other.hz || 2.3) + Math.max(1.8, candidate.speed * .8)) return 'following';
      const predicted = { ...other, x: other.x + (other.vx || Math.sin(other.yaw || 0) * (other.speed || 0)) * .4,
        z: other.z + (other.vz || Math.cos(other.yaw || 0) * (other.speed || 0)) * .4, hx: other.hx || 1.2, hz: other.hz || 2.3 };
      if (overlapOBB(body, predicted)) {
        // Tram has priority at shared intersections. Identical services order
        // by ID, so two crossing vehicles never both wait for one another.
        if (other.kind && !sameDirection && (vehicle.kind === 'tram' && other.kind === 'bus' || vehicle.kind === other.kind && vehicle.id < other.id)) continue;
        return 'junction';
      }
    }
    return null;
  }
  junctionGap(vehicle, pose = vehicle.pose, junction = vehicle.junction) {
    if (!junction) return Infinity;
    const spec = HARBOR_VEHICLE_SPECS[vehicle.kind], s = Math.abs(Math.sin(pose.yaw)), c = Math.abs(Math.cos(pose.yaw));
    const extent = junction.axis === 'x' ? spec.halfLength * s + spec.halfWidth * c : spec.halfLength * c + spec.halfWidth * s;
    return (junction[junction.axis] - pose[junction.axis]) * junction.direction - STOP_LINE - extent - ROAD_CLEARANCE;
  }
  streetControl(vehicle, pedestrianDistanceAt) {
    if (vehicle.kind === 'ferry') return { distance: Infinity, reason: null, red: false };
    const p = vehicle.pose, spec = HARBOR_VEHICLE_SPECS[vehicle.kind];
    if (vehicle.junction?.committed) {
      const s = Math.abs(Math.sin(p.yaw)), c = Math.abs(Math.cos(p.yaw));
      const hx = c * spec.halfWidth + s * spec.halfLength, hz = s * spec.halfWidth + c * spec.halfLength;
      if (Math.abs(p.x - vehicle.junction.x) > 16 + hx || Math.abs(p.z - vehicle.junction.z) > 16 + hz) vehicle.junction = null;
    }
    if (!vehicle.junction) {
      const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw), axis = Math.abs(fx) > .94 ? 'x' : Math.abs(fz) > .94 ? 'z' : null;
      if (axis) {
        const direction = Math.sign(axis === 'x' ? fx : fz), across = axis === 'x' ? p.z : p.x;
        const crossingRoad = ROAD_CENTERS.reduce((a, b) => Math.abs(b - across) < Math.abs(a - across) ? b : a);
        if (Math.abs(crossingRoad - across) <= 11.5) {
          const upcoming = ROAD_CENTERS.map(at => ({ at, along: (at - p[axis]) * direction })).filter(j => j.along > 0 && j.along < 65).sort((a, b) => a.along - b.along)[0];
          if (upcoming) vehicle.junction = { x: axis === 'x' ? upcoming.at : crossingRoad, z: axis === 'z' ? upcoming.at : crossingRoad, axis, direction, committed: false };
        }
      }
    }
    const gap = this.junctionGap(vehicle);
    // A previously admitted vehicle clears the whole junction even when the
    // light changes or the route bends. This admission survives save/load.
    if (vehicle.junction && gap < -.005) vehicle.junction.committed = true;
    // A green phase cannot admit a conflicting approach while an admitted
    // bus/tram is still clearing this intersection. Same-approach followers
    // retain the physical headway checks; conflicting turns could otherwise
    // commit on successive phases and trap each other's rear body.
    const occupied = vehicle.junction && !vehicle.junction.committed && this.vehicles.some(other =>
      other !== vehicle && other.kind !== 'ferry' && other.junction?.committed &&
      other.junction.x === vehicle.junction.x && other.junction.z === vehicle.junction.z &&
      (other.junction.axis !== vehicle.junction.axis || other.junction.direction !== vehicle.junction.direction));
    const red = !!vehicle.junction && !vehicle.junction.committed && (occupied || intersectionSignal(this.time, vehicle.junction.x, vehicle.junction.z, vehicle.junction.axis) !== 'green');
    let freeDistance = red ? Math.max(0, gap - .001) : Infinity, reason = occupied ? 'junction' : red ? 'signal' : null;
    if (typeof pedestrianDistanceAt === 'function') {
      const body = { id: vehicle.id, kind: vehicle.kind, ...p, hx: spec.halfWidth, hz: spec.halfLength, speed: vehicle.motionSpeed, health: 100 };
      const pedestrian = pedestrianDistanceAt(body);
      // Existing street hooks return the sedan-centre stopping gap. Account
      // for this vehicle's longer front before consuming that shared hook.
      const clear = Number.isFinite(pedestrian) ? Math.max(0, pedestrian - Math.max(0, spec.halfLength - VEHICLE_DIMENSIONS.halfLength) - ROAD_CLEARANCE) : Infinity;
      if (clear <= freeDistance) { freeDistance = clear; reason = Number.isFinite(clear) ? 'pedestrian' : reason; }
    }
    return { distance: freeDistance, reason, red };
  }
  update(dt, player = null, { traffic = [], pedestrianDistanceAt = null } = {}) {
    const seconds = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    const steps = Math.max(1, Math.ceil(seconds / .05)), step = seconds / steps;
    for (let n = 0; n < steps; n++) {
      this.time += step;
      for (const v of this.vehicles) {
        if (!step) continue;
        const route = this.route(v.routeId), full = harborRoutePose(route, v.serviceTime + step), nominalDistance = distance(v.pose, full);
        if (v.pose.stopId && (v.doorHoldUntil || 0) > this.time && v.pose.remaining <= .8) {
          v.delay += step; v.held = 'boarding'; v.trafficState = 'boarding'; v.motionSpeed = 0; v.pose = { ...v.pose, speed: 0 }; continue;
        }
        const control = this.streetControl(v, pedestrianDistanceAt);
        let advance = step, next = full;
        if (v.kind !== 'ferry' && nominalDistance > 1e-9) {
          // Reserve this step's travel as well as the remaining braking run,
          // so an ordinary approach slows before the final hard safety clamp.
          const nominalSpeed = nominalDistance / step, brakingStep = BRAKING * step;
          const target = Math.min(nominalSpeed, Math.max(0, Math.sqrt(2 * BRAKING * control.distance + brakingStep ** 2) - brakingStep));
          const speed = Math.min(nominalSpeed, Math.max(v.motionSpeed - BRAKING * step, Math.min(target, v.motionSpeed + ACCELERATION * step)));
          const allowedDistance = Math.min(control.distance, speed * step);
          const legal = pose => distance(v.pose, pose) <= allowedDistance + 1e-8 && (!control.red || this.junctionGap(v, pose) >= .0005);
          if (!legal(full)) {
            let low = 0, high = step;
            for (let i = 0; i < 14; i++) { const middle = (low + high) / 2; if (legal(harborRoutePose(route, v.serviceTime + middle))) low = middle; else high = middle; }
            advance = low; next = harborRoutePose(route, v.serviceTime + advance);
          }
        }
        const moved = distance(v.pose, next); next.speed = moved / step;
        const conflict = this.conflict(v, next, traffic);
        if (conflict) { v.delay += step; v.held = conflict; v.trafficState = conflict; v.motionSpeed = 0; v.pose = { ...v.pose, speed: 0 }; }
        else {
          v.delay += step - advance; v.distanceTravelled += moved; v.serviceTime += advance; v.motionSpeed = next.speed; v.pose = next;
          v.held = advance < 1e-7 && control.reason ? control.reason : null; v.trafficState = control.reason || (next.stopId ? 'dwell' : 'cruise');
          if (v.junction && !v.junction.committed && !control.red && this.junctionGap(v) < 0) v.junction.committed = true;
        }
      }
    }
    const p = positionOf(player); this.activeStopId = !this.riding && p ? this.stops.find(s => distance(p, s.board) < 5)?.id || null : null;
    return {};
  }
  leave() {
    const stop = this.boardedStop || this.stop(this.activeStopId);
    this.ridingVehicleId = null; this.passenger = null; this.passengerJump = 0; this.jumpVelocity = 0; this.activeStopId = null; this.version++;
    return stop ? { handled: true, transition: { id: 'street', position: { ...stop.streetExit }, groundY: 0 } } : { handled: false };
  }
  reset() { return this.leave(); }
  resetService() {
    this.ridingVehicleId = null; this.boardedStopId = null; this.activeStopId = null; this.passenger = null;
    this.passengerJump = 0; this.jumpVelocity = 0; this.jumpHeld = false; this.citizenPassengers.clear(); this.citizenBoardings = 0;
    this.syncTime(0, { force: true });
    for (const v of this.vehicles) { v.distanceTravelled = 0; v.doorHoldUntil = 0; }
    this.version++; return true;
  }
  exportState() {
    return { version: 1, time: this.time, vehicles: this.vehicles.map(v => ({ id: v.id, serviceTime: v.serviceTime, delay: v.delay, distanceTravelled: v.distanceTravelled, doorHoldUntil: v.doorHoldUntil || 0,
      motionSpeed: v.motionSpeed, held: v.held, trafficState: v.trafficState, junction: v.junction && { ...v.junction } })),
      boardedStopId: this.boardedStopId, citizenPassengers: [...this.citizenPassengers].map(([id, ticket]) => ({ id, ...ticket })), citizenBoardings: this.citizenBoardings };
  }
  restoreState(data) {
    if (!data || data.version !== 1 || !Number.isFinite(data.time) || data.time < 0) return false;
    if (data.vehicles !== undefined && !Array.isArray(data.vehicles) || data.citizenPassengers !== undefined && !Array.isArray(data.citizenPassengers)) return false;
    this.time = data.time;
    for (const v of this.vehicles) {
      const saved = data.vehicles?.find(s => s?.id === v.id);
      v.serviceTime = Number.isFinite(saved?.serviceTime) && saved.serviceTime >= 0 ? saved.serviceTime : this.time + v.offset;
      v.delay = Number.isFinite(saved?.delay) && saved.delay >= 0 ? saved.delay : 0;
      v.distanceTravelled = Number.isFinite(saved?.distanceTravelled) ? Math.max(0, saved.distanceTravelled) : 0;
      v.doorHoldUntil = Number.isFinite(saved?.doorHoldUntil) ? Math.max(0, saved.doorHoldUntil) : 0;
      v.pose = harborRoutePose(this.route(v.routeId), v.serviceTime);
      v.motionSpeed = Number.isFinite(saved?.motionSpeed) ? clamp(saved.motionSpeed, 0, this.route(v.routeId).speed * 1.2) : v.pose.speed;
      v.pose.speed = v.motionSpeed; v.held = ['signal', 'pedestrian', 'following', 'junction', 'boarding'].includes(saved?.held) ? saved.held : null;
      v.trafficState = ['signal', 'pedestrian', 'following', 'junction', 'boarding', 'dwell', 'cruise'].includes(saved?.trafficState) ? saved.trafficState : v.pose.stopId ? 'dwell' : 'cruise';
      const j = saved?.junction;
      v.junction = j && ROAD_CENTERS.includes(j.x) && ROAD_CENTERS.includes(j.z) && ['x', 'z'].includes(j.axis) && [-1, 1].includes(j.direction)
        ? { x: j.x, z: j.z, axis: j.axis, direction: j.direction, committed: j.committed === true } : null;
    }
    this.citizenPassengers.clear();
    for (const t of Array.isArray(data.citizenPassengers) ? data.citizenPassengers.slice(0, 100) : []) {
      if (!t || typeof t !== 'object') continue;
      const v = this.vehicle(t.vehicleId), from = this.stop(t.fromStopId), to = this.stop(t.toStopId);
      if (typeof t.id !== 'string' || !t.id || t.id.length > 100 || !v || !from || !to || from.routeId !== v.routeId || to.routeId !== v.routeId || from.id === to.id) continue;
      this.citizenPassengers.set(t.id, { vehicleId: v.id, routeId: v.routeId, fromStopId: from.id, toStopId: to.id,
        slot: Number.isInteger(t.slot) ? clamp(t.slot, 0, 99) : 0, phase: ['boarding', 'riding', 'alighting'].includes(t.phase) ? t.phase : 'riding' });
    }
    this.citizenBoardings = Number.isInteger(data.citizenBoardings) ? clamp(data.citizenBoardings, 0, 10000000) : this.citizenPassengers.size;
    this.boardedStopId = this.stop(data.boardedStopId)?.id || null; this.ridingVehicleId = null; this.passenger = null;
    return true;
  }
  syncTime(time, { force = false } = {}) {
    if (!Number.isFinite(time) || time < 0 || this.riding && !force) return false;
    this.time = time;
    for (const v of this.vehicles) { v.serviceTime = time + v.offset; v.delay = 0; v.pose = harborRoutePose(this.route(v.routeId), v.serviceTime); v.motionSpeed = v.pose.speed; v.held = null; v.junction = null; v.trafficState = v.pose.stopId ? 'dwell' : 'cruise'; }
    return true;
  }
  snapshot() {
    const v = this.vehicle(), stopId = v?.pose.stopId || this.activeStopId, layout = v && this.layout(v.kind);
    const deckId = layout && this.passenger ? layout.decks.reduce((a, b) => Math.abs(a.y - this.passenger.y) <= Math.abs(b.y - this.passenger.y) ? a : b).id : null;
    return { time: this.time, riding: this.riding, ridingVehicleId: this.ridingVehicleId, vehicleId: this.ridingVehicleId, boardedStopId: this.boardedStopId,
      currentStopId: stopId || null, stationId: stopId || null, currentStop: stopId || null, activeStation: this.stop(stopId) || null,
      phase: v ? v.pose.stopId ? 'docked' : 'moving' : this.activeStopId ? 'waiting' : 'street', status: v ? v.pose.stopId ? '到站停靠' : '行驶中' : '街道',
      label: v ? this.route(v.routeId).name : '', nextStopId: v?.pose.nextStopId || null, secondsToArrival: v?.pose.secondsToArrival || (this.activeStopId ? this.nextArrival(this.activeStopId) : 0),
      passengerPose: this.passengerPose, passengerLocal: this.passenger && { ...this.passenger }, passengerDeck: deckId,
      routes: this.routes.map(r => ({ id: r.id, kind: r.kind, name: r.name, englishName: r.englishName, duration: r.duration, fleet: r.offsets.length, atGrade: r.kind !== 'ferry', stops: [...r.stops] })),
      stops: this.stops.map(s => ({ ...s, entrance: { ...s.entrance }, entry: { ...s.entry }, board: { ...s.board }, nextArrival: this.nextArrival(s.id) })),
      vehicles: this.vehicles.map(v => ({ id: v.id, routeId: v.routeId, kind: v.kind, ...v.pose, delay: v.delay, serviceTime: v.serviceTime, held: v.held, trafficState: v.trafficState, junction: v.junction && { ...v.junction } })),
      citizenPassengers: [...this.citizenPassengers].map(([id, t]) => ({ id, ...t })), citizenBoardings: this.citizenBoardings };
  }
}
