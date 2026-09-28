import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSimulation, MISSION_DEFS, loadProgress, freshProgress, serializeProgress } from '../src/simulation.js';

function isolated(options) {
  const game = new GameSimulation(options);
  // Traffic is tested separately; isolate mission and collision invariants.
  game.cars = game.cars.filter(car => !car.traffic);
  return game;
}
function tick(game, seconds, input = {}) {
  for (let n = 0; n < Math.ceil(seconds * 60); n++) game.update(1 / 60, input);
}
function board(game) {
  const car = game.cars[0];
  Object.assign(game.player, { x: car.x + 3, z: car.z });
  assert.equal(game.interact(), true);
  return car;
}
function checkpoint(game, point) {
  Object.assign(game.activeVehicle, point, { speed: 0, vx: 0, vz: 0 });
  game.update(1 / 60, {});
}

test('fresh saves have bounded values; corrupt and incompatible saves recover safely', () => {
  assert.deepEqual(loadProgress('{broken'), freshProgress());
  assert.deepEqual(loadProgress({ version: 0, cash: 99 }), freshProgress());
  const loaded = loadProgress({ version: 1, cash: Infinity, completed: ['harbor-run', 'harbor-run', 'fake'],
    player: { x: Infinity, z: -99999, yaw: NaN }, bestTimes: { 'harbor-run': -5 } });
  assert.equal(loaded.cash, 1200);
  assert.deepEqual(loaded.completed, ['harbor-run']);
  assert.equal(loaded.player.x, 8);
  assert.equal(loaded.player.z, -285);
  assert.deepEqual(loaded.bestTimes, {});
  assert.equal(JSON.parse(serializeProgress(loaded)).version, 1);
});

test('walking respects camera orientation, bounds and solid buildings', () => {
  const game = isolated({ colliders: [{ x: 8, z: 166, hx: 10, hz: 1 }] });
  tick(game, 3, { forward: 1, cameraYaw: Math.PI });
  assert.ok(game.player.z >= 167.6, `wall crossed: ${game.player.z}`);
  Object.assign(game.player, { x: 285, z: 230 });
  tick(game, 3, { forward: 1, cameraYaw: Math.PI / 2, sprint: true });
  assert.ok(game.player.x <= 289.35);
});

test('diagonal movement is normalized and sprint consumes stamina', () => {
  const straight = isolated(), diagonal = isolated();
  tick(straight, 1, { forward: 1, cameraYaw: 0 });
  tick(diagonal, 1, { forward: 1, strafe: 1, cameraYaw: 0 });
  assert.ok(Math.abs(Math.hypot(diagonal.player.x - 8, diagonal.player.z - 174) - (straight.player.z - 174)) < 0.01);
  tick(straight, 1, { forward: 1, sprint: true, cameraYaw: 0 });
  assert.ok(straight.player.stamina < 100);
  tick(straight, 2);
  assert.equal(straight.player.stamina, 100);
});

test('strafe-right follows the rendered camera right vector in both directions', () => {
  const game = isolated();
  tick(game, 1, { strafe: 1, cameraYaw: Math.PI });
  assert.ok(game.player.x > 8, 'looking north (-Z), D should move east (+X)');
  Object.assign(game.player, { x: 8, z: 174 });
  tick(game, 1, { strafe: 1, cameraYaw: 0 });
  assert.ok(game.player.x < 8, 'looking south (+Z), D should move west (-X)');
});

test('jump lands, and holding jump does not repeatedly bounce', () => {
  const game = isolated();
  game.update(1 / 60, { jump: true });
  assert.ok(game.player.y > 0);
  tick(game, 2, { jump: true });
  assert.equal(game.player.y, 0);
  game.update(1 / 60, { jump: false });
  game.update(1 / 60, { jump: true });
  assert.ok(game.player.y > 0);
});

test('entering requires proximity; exiting needs low speed and an unobstructed location', () => {
  const game = isolated();
  assert.equal(game.interact(), false);
  const car = board(game);
  car.speed = 15;
  assert.equal(game.interact(), false);
  assert.equal(game.inCar, car.id);
  car.speed = 0;
  assert.equal(game.interact(), true);
  assert.equal(game.inCar, null);
  assert.ok(Math.hypot(game.player.x - car.x, game.player.z - car.z) >= 3.4);
  Object.assign(game.player, { x: car.x, z: car.z });
  game.interact();
  game.colliders = [{ x: car.x, z: car.z, hx: 10, hz: 10 }];
  assert.equal(game.interact(), false);
  assert.equal(game.inCar, car.id);
});

test('fast vehicles cannot tunnel through a thin wall', () => {
  const game = isolated({ colliders: [{ x: 4, z: 146, hx: 20, hz: 0.15 }] });
  const car = board(game);
  car.speed = 43; car.vz = -43;
  tick(game, 1, { forward: 1 });
  assert.ok(car.z >= 147.65, `vehicle crossed: ${car.z}`);
  assert.ok(car.health < 100);
});

test('braking reduces speed, reversing and steering remain bounded', () => {
  const game = isolated();
  const car = board(game);
  car.speed = 30;
  tick(game, 0.6, { brake: true });
  assert.ok(car.speed < 5);
  tick(game, 2, { forward: -1, turn: 1 });
  assert.ok(car.speed >= -12 && car.speed < 0);
  assert.ok(Number.isFinite(car.x) && Number.isFinite(car.yaw));
});

test('courier checkpoints require a vehicle and correct order', () => {
  const game = isolated();
  const def = MISSION_DEFS[0];
  game.startMission(def.id);
  Object.assign(game.player, def.checkpoints[0]);
  game.update(1 / 60);
  assert.equal(game.mission.stage, 0);
  board(game);
  checkpoint(game, def.checkpoints[2]);
  assert.equal(game.mission.stage, 0);
  checkpoint(game, def.checkpoints[0]);
  assert.equal(game.mission.stage, 1);
  assert.deepEqual(game.mission.target, def.checkpoints[1]);
});

test('first clear pays exactly once, including after save/reload and replay', () => {
  const game = isolated();
  const def = MISSION_DEFS[0];
  board(game); game.startMission(def.id);
  for (const point of def.checkpoints) checkpoint(game, point);
  assert.equal(game.mission, null);
  assert.equal(game.cash, 1200 + def.reward);
  assert.ok(game.completed.has(def.id));
  assert.ok(game.bestTimes[def.id] > 0);
  const loaded = isolated({ save: JSON.stringify(game.exportSave()) });
  board(loaded); loaded.startMission(def.id);
  assert.equal(loaded.mission.replay, true);
  for (const point of def.checkpoints) checkpoint(loaded, point);
  assert.equal(loaded.cash, game.cash);
});

test('expired missions fail without rewards and cancellation permits retry', () => {
  const game = isolated();
  assert.equal(game.startMission('missing'), false);
  game.startMission('neon-circuit');
  assert.equal(game.startMission('harbor-run'), false);
  game.mission.remaining = 0.01;
  game.update(0.02);
  assert.equal(game.mission, null);
  assert.equal(game.cash, 1200);
  assert.equal(game.startMission('neon-circuit'), true);
  assert.equal(game.cancelMission(), true);
  assert.equal(game.completed.size, 0);
});

test('escape mission waits for wanted to clear before permitting the finish', () => {
  const game = isolated();
  const def = MISSION_DEFS[2];
  board(game); game.startMission(def.id);
  checkpoint(game, def.checkpoints[0]);
  assert.equal(game.wanted, 2);
  assert.equal(game.mission.phase, 'escape');
  checkpoint(game, def.checkpoints[1]);
  assert.ok(game.mission);
  assert.equal(game.completed.has(def.id), false);
  game.cars = game.cars.filter(car => !car.police);
  tick(game, 33);
  assert.equal(game.wanted, 0);
  assert.equal(game.mission, null);
  assert.equal(game.cash, 1200 + def.reward);
});

test('shots consume ammunition, hit cars only along clear sightlines, and trigger pursuit', () => {
  const game = isolated();
  Object.assign(game.player, { x: 4, z: 150, yaw: 0 });
  const target = game.cars[0];
  assert.equal(game.fire(), true);
  assert.equal(target.health, 75);
  assert.equal(game.ammo, 17);
  assert.equal(game.wanted, 1);
  assert.equal(game.fire(), false, 'fire rate must be limited');
  assert.ok(game.cars.some(car => car.police));
  game.colliders = [{ x: 4, z: 155, hx: 3, hz: 1 }];
  tick(game, 0.3);
  game.fire();
  assert.equal(target.health, 75, 'building must block bullets');
});

test('empty magazine reloads without negative ammunition', () => {
  const game = isolated();
  game.ammo = 1;
  game.fire();
  assert.equal(game.ammo, 0);
  assert.ok(game.reloadRemaining > 0);
  assert.equal(game.fire(), false);
  tick(game, 1.9);
  assert.equal(game.ammo, 18);
  assert.equal(game.reloadRemaining, 0);
});

test('wanted decays outside patrol sight and stays active inside sight', () => {
  const game = isolated();
  game.fire();
  game.cars = game.cars.filter(car => !car.police);
  tick(game, 19);
  assert.equal(game.wanted, 0);
  game.fire();
  const cop = game.cars.find(car => car.police);
  Object.assign(cop, { x: game.player.x + 30, z: game.player.z, pause: 999 });
  tick(game, 20);
  assert.equal(game.wanted, 1);
  assert.equal(game.escapeProgress, 0);
});

test('police movement remains on roads and cannot cross buildings', () => {
  const game = isolated({ colliders: [{ x: 40, z: 40, hx: 27, hz: 27 }] });
  Object.assign(game.player, { x: 80, z: 80 });
  game.fire();
  const cop = game.cars.find(car => car.police);
  Object.assign(cop, { x: 0, z: 0, path: [], reroute: 0 });
  for (let n = 0; n < 600; n++) {
    game.update(1 / 60);
    assert.ok(!(cop.x > 11.5 && cop.x < 68.5 && cop.z > 11.5 && cop.z < 68.5));
  }
});

test('traffic moves on its route and a vehicle collision raises wanted', () => {
  const game = new GameSimulation();
  const traffic = game.cars.find(car => car.traffic);
  const initialX = traffic.x;
  game.update(0.1);
  assert.notEqual(traffic.x, initialX);
  const car = board(game);
  Object.assign(traffic, { x: car.x, z: car.z - 1.5, pause: 10, speed: 0 });
  car.speed = 20; car.vz = -20;
  game.update(0.01);
  assert.ok(game.wanted > 0);
  assert.ok(car.health < 100);
});

test('recovery clears transient state and charges only available funds', () => {
  const game = isolated();
  const car = board(game);
  game.startMission('harbor-run');
  game.cash = 50;
  game.player.health = 0;
  game.wanted = 2;
  game.update(1 / 60);
  assert.equal(game.player.health, 100);
  assert.equal(game.cash, 0);
  assert.equal(game.inCar, null);
  assert.equal(game.wanted, 0);
  assert.equal(game.mission, null);
  assert.equal(car.health, 100);
});

test('repair charges only when needed and disallows repairs during pursuit', () => {
  const game = isolated();
  const car = board(game);
  assert.equal(game.repair(), false);
  car.health = 20; game.wanted = 1;
  assert.equal(game.repair(), false);
  game.wanted = 0;
  assert.equal(game.repair(), true);
  assert.equal(car.health, 100);
  assert.equal(game.cash, 1050);
});

test('repair never charges a healthy pedestrian with no nearby vehicle', () => {
  const game = isolated();
  assert.equal(game.nearestCar, null);
  assert.equal(game.repair(), false);
  assert.equal(game.cash, 1200);
  game.player.health = 75;
  assert.equal(game.repair(), true, 'an injured pedestrian can still buy medical recovery');
  assert.equal(game.player.health, 100);
  assert.equal(game.cash, 1050);
});

test('reset restores a fresh game and discarded runtime state is absent from saves', () => {
  const game = isolated();
  game.startMission('harbor-run'); game.fire();
  const save = game.exportSave();
  assert.equal('mission' in save, false);
  assert.equal('wanted' in save, false);
  game.completed.add('harbor-run'); game.cash = 50000;
  game.reset();
  assert.equal(game.completed.size, 0);
  assert.equal(game.cash, 1200);
  assert.equal(game.mission, null);
  assert.equal(game.wanted, 0);
});

test('vehicle bumpers remain solid during a damage cooldown without oscillating while throttle is held', async () => {
  const { overlapOBB } = await import('../src/collision.js');
  const game = isolated();
  const car = board(game), parked = game.cars[1];
  Object.assign(car, { yaw: 0, speed: 0, vx: 0, vz: 0 });
  Object.assign(parked, { x: car.x, z: car.z + 12, yaw: 0 });
  game._hitCooldown = 999;
  const positions = [];
  for (let i = 0; i < 360; i++) {
    game.update(1 / 60, { forward: 1 });
    assert.equal(overlapOBB(car, parked), null, 'damage cooldown must never disable solidity');
    if (i > 300) positions.push(car.z);
  }
  assert.ok(Math.max(...positions) - Math.min(...positions) < 0.005, 'held throttle should rest at contact without bounce');
  assert.ok(car.speed >= 0, 'a collision must not reverse the vehicle velocity');
});

test('parked cars block a walking character with their full bumper footprint', () => {
  const game = isolated();
  const parked = game.cars[0];
  Object.assign(game.player, { x: parked.x, z: parked.z + 6 });
  tick(game, 3, { forward: 1, cameraYaw: Math.PI });
  assert.ok(game.player.z >= parked.z + 2.32 + 0.65 - 0.001);
});

test('walking ignores a destroyed invisible vehicle', () => {
  const game = isolated();
  const parked = game.cars[0];
  parked.health = 0;
  Object.assign(game.player, { x: parked.x, z: parked.z + 6 });
  tick(game, 2, { forward: 1, cameraYaw: Math.PI });
  assert.ok(game.player.z < parked.z - 2.32);
});

test('entering a nearby car cannot teleport through a thin wall', () => {
  const game = isolated();
  const parked = game.cars[0];
  Object.assign(game.player, { x: parked.x, z: parked.z + 4 });
  game.colliders = [{ x: parked.x, z: parked.z + 2.5, hx: 3, hz: 0.05 }];
  assert.equal(game.nearestCar.id, parked.id);
  assert.equal(game.interact(), false);
  assert.equal(game.inCar, null);
});

test('an exit destination beyond a thin wall is rejected even if the destination itself is clear', () => {
  const game = isolated();
  const car = board(game);
  game.colliders = [{ x: car.x - 2, z: car.z, hx: 0.05, hz: 4 }];
  assert.equal(game.interact(), true);
  assert.ok(game.player.x > car.x, 'exit must use the clear right side instead of crossing the left wall');
});

test('unsafe saved positions use a validated fallback, including when the default spawn is blocked', async () => {
  const { circleContacts, SpatialIndex, CHARACTER_RADIUS } = await import('../src/collision.js');
  const colliders = [{ x: 8, z: 174, hx: 8, hz: 8 }, { x: 80, z: 80, hx: 12, hz: 12 }];
  const game = isolated({ colliders, save: { version: 1, cash: 777, completed: [], player: { x: 80, z: 80, yaw: 0 } } });
  assert.equal(circleContacts(game.player, CHARACTER_RADIUS, { index: new SpatialIndex(colliders), bounds: game.bounds, vehicles: game.cars }).length, 0);
  assert.equal(game.cash, 777);
});

test('oncoming NPC traffic stops at contact instead of passing through other traffic', async () => {
  const { overlapOBB } = await import('../src/collision.js');
  const game = isolated();
  const route = [{ x: -20, z: 0 }, { x: 20, z: 0 }];
  const common = { z: 0, health: 100, speed: 12, cruise: 12, traffic: true, type: 'sedan', route, pause: 0 };
  game.cars = [{ ...common, id: 'east', x: -12, yaw: Math.PI / 2, waypoint: 1 },
    { ...common, id: 'west', x: 12, yaw: -Math.PI / 2, waypoint: 0 }];
  for (let i = 0; i < 600; i++) {
    game.update(1 / 60);
    assert.equal(overlapOBB(game.cars[0], game.cars[1]), null);
  }
  assert.ok(game.cars[0].x < game.cars[1].x);
});

test('jumping beneath a canopy clamps upward motion without horizontal ejection', () => {
  const game = isolated({ colliders: [{ x: 8, z: 174, hx: 5, hz: 5, minY: 2.24, maxY: 2.52 }] });
  const x = game.player.x, z = game.player.z;
  for (let i = 0; i < 120; i++) {
    game.update(1 / 60, { jump: true });
    assert.ok(game.player.y + game.player.groundY + 1.8 <= 2.24 + 1e-6, 'head must stay below canopy');
    assert.equal(game.player.x, x);
    assert.equal(game.player.z, z);
  }
  assert.equal(game.player.y, 0);
});

test('a jump can land on a low solid, remain supported and jump again without being ejected', () => {
  const game = isolated({ colliders: [{ x: 8, z: 171.5, hx: 2, hz: 0.8, minY: 0, maxY: 0.5 }] });
  const x = game.player.x;
  // Rise above the bench before moving over it.
  for (let i = 0; i < 14; i++) game.update(1 / 60, { jump: true });
  for (let i = 0; i < 24; i++) game.update(1 / 60, { forward: 1, cameraYaw: Math.PI });
  const z = game.player.z;
  for (let i = 0; i < 100; i++) game.update(1 / 60);
  assert.equal(game.player.x, x);
  assert.ok(Math.abs(game.player.z - z) < 0.001, 'falling onto a seat must not eject the player sideways');
  assert.ok(Math.abs(game.player.y - 0.5) < 0.001, `bench support lost at ${game.player.y}`);
  game.update(1 / 60, { jump: true });
  assert.ok(game.player.y > 0.5, 'supported player must be able to jump off the bench');
});

test('an entirely obstructed world fails explicitly instead of placing the player inside a wall', () => {
  assert.throws(() => new GameSimulation({ colliders: [{ x: 0, z: 0, hx: 400, hz: 400 }], bounds: 290 }), /safe player spawn/);
});
