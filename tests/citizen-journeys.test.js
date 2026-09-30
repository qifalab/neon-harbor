import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { createCityExploration } from '../src/city-exploration.js';
import { CitizenJourneys } from '../src/citizen-journeys.js';
import { TransitService, stationLiftPose, citizenStationAccess } from '../src/metropolis-transit.js';
import { crossingSignal } from '../src/citizen-navigation.js';
import { getRoomDesign } from '../src/metropolis-room-designs.js';
import { createInteriorLayout } from '../src/metropolis-interiors.js';
import { circleOBB, SpatialIndex } from '../src/collision.js';

const city = createCityExploration(THREE, new THREE.Scene(), { streaming: false });
function fixture() {
  const transit = new TransitService();
  const residents = city.people.journeys.residents.map(person => ({ ...person, routine: { ...person.routine }, journey: null }));
  const life = new CitizenJourneys({ residents, buildings: city.buildings, transit, colliders: city.colliders });
  return { transit, residents, life };
}

test('the complete shipped world has legal doorstep routes, unobstructed station entrances and real crossing edges', () => {
  const { life } = fixture(), nav = life.navigation;
  for (const building of city.buildings) {
    const door = { x: building.x, z: building.entrance.z + 1.2 };
    assert.ok(nav.clear(door), `${building.id}: doorstep obstructed`);
    for (const destination of city.buildings) assert.ok(nav.route(door, { x: destination.x, z: destination.entrance.z + 1.2 }), `${building.id} -> ${destination.id}: unreachable`);
    for (const stop of city.transit.stops.filter(stop => stop.entrance.z < -390)) assert.ok(nav.route(door, stop.entrance), `${building.id} -> ${stop.id}: street approach blocked`);
  }
  for (const node of nav.nodes) for (const edge of node.edges) {
    for (let i = 1; i < edge.points.length; i++) assert.ok(nav.clearSegment(edge.points[i - 1], edge.points[i]));
    if (edge.crossing) assert.ok(edge.length >= 38 && edge.length <= 40, 'only marked full-road crossings connect pavements');
  }
});

test('all 240 residents finish real work visits, use all four shared routes, return and rest in actual homes without stranded journeys', () => {
  const { residents, life, transit } = fixture(), boarded = new Set(), worked = new Set(), rested = new Set();
  const firstIdentities = residents.map(person => [person.id, person.identity.name]);
  for (const person of residents) {
    const home = getRoomDesign(person.journey.home.buildingId, person.journey.home.floorId);
    assert.ok(home.rooms.some(room => room.type === 'bedroom'), `${person.id}: a home requires a real bedroom`);
    const work = life.roomGoal(person.journey.work, person);
    assert.ok(!['bedroom', 'bath', 'living'].includes(work.roomType), `${person.id}: work must have actual work facilities`);
    if (work.roomType === 'kitchen') assert.equal(getRoomDesign(work.buildingId, work.floorId).category, 'restaurant');
  }
  for (let tick = 0; tick < 36000; tick++) {
    transit.update(.25); life.update(.25, { hour: tick < 12000 ? 12 : 23 });
    for (const person of residents) {
      if (person.journey.phase === 'riding') boarded.add(person.journey.routeId);
      if (person.journey.phase === 'room-activity') {
        assert.equal(person.insideBuildingId, person.journey.goal.buildingId);
        assert.equal(person.floorId, person.journey.goal.floorId);
        assert.equal(person.roomId, person.journey.goal.roomId);
        if (person.journey.goal.kind === 'home') rested.add(person.id); else if (person.journey.goal.kind === 'work') worked.add(person.id);
      }
    }
  }
  assert.deepEqual(residents.map(person => [person.id, person.identity.name]), firstIdentities);
  assert.equal(worked.size, 240); assert.equal(rested.size, 240);
  assert.deepEqual([...boarded].sort(), ['ferry', 'high-speed', 'light-rail', 'metro']);
  assert.ok(life.statistics.boarded > 60 && life.statistics.alighted > 60 && life.statistics.crossings > 100);
  assert.equal(residents.filter(person => person.journey.phase === 'route-blocked').length, 0);
  assert.ok(life.navigationCache.size <= 96);
  assert.equal(transit.citizenPassengers.size, 0, 'night-time arrivals release their actual fleet reservations');
  assert.ok(residents.every(person => person.journey.phase === 'room-activity' && person.state === 'resting'));
  life.dispose();
});

test('citizens enter a crossing only with enough green time, and traffic yields until its actual walker has left', () => {
  const { residents, life, transit } = fixture(), person = residents[0];
  const crossing = life.navigation.crossings.find(item => item.axis === 'x' && item.x === -320 && item.z === -700);
  Object.assign(person, { x: crossing.x - 20, z: crossing.lane, y: 0, speed: 1.2 });
  const target = { x: crossing.x + 20, z: crossing.lane, y: 0, crossing };
  life.setPath(person, [target], 'walking-to-building', 'test-complete');
  let red = 0; while (crossingSignal(crossing, red).green) red++;
  transit.time = red; life.time = red; life.walk(person, .1, []);
  assert.equal(person.x, crossing.x - 20); assert.equal(person.state, 'waiting');
  let green = red; while (!crossingSignal(crossing, green).green || crossingSignal(crossing, green).remaining < 40) green++;
  life.time = green; life.walk(person, .1, []);
  assert.ok(person.x > crossing.x - 20);
  assert.equal(life.trafficYieldAt({ x: crossing.x, z: crossing.z - 30, y: 0, yaw: 0, speed: 10 }), true);
  for (let frame = 0; frame < 400 && person.journey.path.length; frame++) life.walk(person, .1, []);
  assert.equal(life.crossingClaims.size, 0); assert.equal(life.statistics.crossings, 1);
  assert.equal(life.trafficYieldAt({ x: crossing.x, z: crossing.z - 30, y: 0, yaw: 0, speed: 10 }), false);
});

test('working periods keep residents at their real posts and the night change starts a walk home without resetting position', () => {
  const { residents, life, transit } = fixture();
  for (let tick = 0; tick < 4000; tick++) { transit.update(.25); life.update(.25, { hour: 8 }); }
  const atWork = residents.map(person => ({ x: person.x, y: person.y, z: person.z, cycle: person.journey.cycle, room: person.roomId }));
  assert.ok(residents.every(person => person.journey.phase === 'room-activity' && person.journey.goal.kind === 'work'));
  for (let tick = 0; tick < 1200; tick++) { transit.update(.25); life.update(.25, { hour: 17 }); }
  assert.deepEqual(residents.map(person => ({ x: person.x, y: person.y, z: person.z, cycle: person.journey.cycle, room: person.roomId })), atWork);
  transit.update(.25); life.update(.25, { hour: 23 });
  assert.ok(residents.every(person => person.journey.goal.kind === 'home' && person.journey.phase === 'leaving-building'));
  assert.deepEqual(residents.map(person => ({ x: person.x, y: person.y, z: person.z })), atWork.map(({ x, y, z }) => ({ x, y, z })));
  life.dispose();
});

test('every assigned home and workplace has a clear arrival and departure through its actual room door', () => {
  const { residents, life } = fixture();
  for (const person of residents) for (const kind of ['home', 'work']) {
    const goal = life.roomGoal(person.journey[kind], person), room = goal.room;
    const layout = createInteriorLayout(goal.building, goal.floor), index = new SpatialIndex(layout.colliders);
    Object.assign(person, { x: room.anchor.x, y: goal.floor.y, z: room.anchor.z,
      insideBuildingId: goal.buildingId, floorId: goal.floorId, roomId: goal.roomId });
    life.leaveBuilding(person);
    const corridor = person.journey.path.findIndex(point => Math.abs(point.x - goal.building.x) < .001 && Math.abs(point.y - goal.floor.y) < .001);
    assert.ok(corridor >= 0, 'departure reaches the real central corridor');
    const path = [room.arrival, room.anchor, ...person.journey.path.slice(0, corridor + 1)];
    for (let segment = 1; segment < path.length; segment++) {
      const a = path[segment - 1], b = path[segment], steps = Math.max(1, Math.ceil(Math.hypot(a.x - b.x, a.z - b.z) / .15));
      for (let step = 0; step <= steps; step++) {
        const position = { x: a.x + (b.x - a.x) * step / steps, z: a.z + (b.z - a.z) * step / steps, radius: .37 };
        const obstruction = index.query({ ...position, hx: .5, hz: .5 }).find(box => box.physics !== false &&
          box.minY < goal.floor.y + 1.8 && box.maxY > goal.floor.y + .05 && circleOBB(position, box));
        assert.equal(obstruction, undefined, `${person.id}/${kind}/${room.type}: ${obstruction?.kind} blocks the real door route`);
      }
    }
  }
  life.dispose();
});

test('boarding paths align with real carriage doors and keep passengers out of carriage gaps and the ferry cabin', () => {
  const transit = new TransitService();
  for (const stop of transit.stops) {
    const vehicle = transit.vehicles.find(vehicle => vehicle.pose.stopId === stop.id);
    for (let slot = 0; slot < (stop.kind === 'ferry' ? 9 : 12); slot++) {
      const pose = transit.citizenPose(vehicle.id, slot), path = transit.citizenBoardingPath(stop.id, vehicle.id, slot);
      assert.deepEqual(path[0], stop.board); assert.deepEqual(path.at(-1), pose);
      const localZ = (pose.x - vehicle.pose.x) * Math.sin(vehicle.pose.yaw) + (pose.z - vehicle.pose.z) * Math.cos(vehicle.pose.yaw);
      if (stop.kind === 'ferry') assert.ok(localZ > 6.8 && localZ < 8.5);
      else {
        const route = transit.route(vehicle.routeId), cars = route.id === 'high-speed' ? 3 : 2, length = route.vehicleLength / cars - .8;
        assert.ok(Array.from({ length: cars }, (_, index) => (index - (cars - 1) / 2) * (length + .8)).some(center => Math.abs(localZ - center) < length / 2 - .3));
      }
    }
  }
});

test('elevated station lift poses have continuous movement, real landings and enough door time to walk aboard', () => {
  for (const stop of city.transit.stops.filter(stop => stop.kind === 'light-rail' || stop.kind === 'high-speed')) {
    const access = citizenStationAccess(stop); assert.ok(access.street.length >= 3 && access.platform.length >= 4);
    let previous = stationLiftPose(stop, 0);
    for (let frame = 1; frame <= 26 * 60; frame++) {
      const pose = stationLiftPose(stop, frame / 60);
      assert.ok(Math.abs(pose.y - previous.y) < .05);
      if (pose.open) assert.ok(pose.y === 0 || pose.y === stop.platform.y);
      previous = pose;
    }
  }
});
