import assert from 'node:assert/strict';
import * as THREE from '/workspace/scratch/neon-harbor/vendor/three/three.module.js';
import { createCityExploration } from '/workspace/scratch/neon-harbor/src/city-exploration.js';
import { harborRoutePose } from '/workspace/scratch/neon-harbor/src/harbor-transit.js';
import { circleOBB, moveVehicle } from '/workspace/scratch/neon-harbor/src/collision.js';
import { createHarborLife } from '/tmp/harbor-life-fix/src/harbor-life.js';

// THREE scene construction is CPU-only here. No renderer or WebGL is created.
const city = createCityExploration(THREE, new THREE.Scene(), { streaming: false });
const transport = city.sample.transit;
const life = createHarborLife({ buildings: city.buildings, colliders: city.colliders, transport, hour: 16.5 });
const home = life.agents.find(a => a.home.buildingId === 'south-093').home.anchor;
const path = life.navigation.route(home, transport.stop('harbor-tram-lantern').board);
assert.ok(path.some((p, i) => p.x === 252 && p.z === 144 && path[i - 1]?.x === 230 && path[i - 1]?.z === 144));

const vehicle = transport.vehicle('harbor-tram-1');
vehicle.serviceTime = 111.76;
vehicle.pose = harborRoutePose(transport.route(vehicle.routeId), vehicle.serviceTime);
vehicle.motionSpeed = vehicle.pose.speed;
for (const a of life.agents) a.crossingId = null;
const person = life.agents[0];
Object.assign(person, { x: 235.93460490463215, y: .18, z: 144,
  crossingId: 'harbor-crossing-x:240:146', pathIndex: 0,
  path: [{ x: 252, y: .18, z: 144, crossingId: 'harbor-crossing-x:240:146' }] });
const hookBody = { id: vehicle.id, kind: vehicle.kind, ...vehicle.pose, hx: 1.15, hz: 4.5 };
const collisionBody = { ...hookBody, hx: 1.23, hz: 4.58 };
const next = harborRoutePose(transport.route(vehicle.routeId), vehicle.serviceTime + .05);
const currentOverlap = !!circleOBB({ ...person, radius: .6 }, collisionBody);
const nextOverlap = !!circleOBB({ ...person, radius: .6 }, { ...collisionBody, ...next });
const sweepContacts = moveVehicle({ ...collisionBody }, next.x - collisionBody.x, next.z - collisionBody.z,
  next.yaw - collisionBody.yaw, { bounds: 3000, circles: [{ x: person.x, z: person.z, groundY: .18, y: 0, radius: .6 }] }).contacts.length;
const hook = life.trafficStopDistanceAt(hookBody);
console.log(JSON.stringify({ currentOverlap, nextOverlap, sweepContacts, hookFinite: Number.isFinite(hook), hook: Number.isFinite(hook) ? hook : 'Infinity' }, null, 2));
assert.equal(currentOverlap, false); assert.equal(nextOverlap, true); assert.ok(sweepContacts > 0);
// This is the intended new contract; the reviewed draft currently fails here.
assert.ok(Number.isFinite(hook), 'a true next turning-body contact must remain protected');
