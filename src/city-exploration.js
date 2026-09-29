import { createWorld } from './world.js';
import { createMetropolisWorld } from './metropolis-world.js';
import { METROPOLIS_BUILDINGS, METROPOLIS_DISTRICTS, METROPOLIS_ROADS, METROPOLIS_BOUNDS } from './metropolis-catalog.js';
import { createInteriorSystem } from './metropolis-interiors.js';
import { createTransitSystem } from './metropolis-transit.js';
import { createPeopleSystem } from './metropolis-people.js';

/** Owns scene transitions so rendering, collision, saving and input agree.
 * The original driving district remains usable without the expansion module.
 * Interior and station collision contexts never replace persistent city data.
 */
export function createCityExploration(THREE, scene, { quality = 'high', streaming = true, onContextChange = () => {} } = {}) {
  const south = createWorld(THREE, scene, { quality, streaming, openNorth: true });
  const north = createMetropolisWorld(THREE, scene, { quality, streaming });
  const interiors = createInteriorSystem(THREE, scene, { buildings: METROPOLIS_BUILDINGS });
  const transit = createTransitSystem(THREE, scene);
  const colliders = [...south.colliders, ...north.colliders, ...transit.colliders];
  const groundHeightAt = (x, z) => north.groundHeightAt(x, z) ?? south.groundHeightAt(x, z);
  const people = createPeopleSystem(THREE, scene, { buildings: METROPOLIS_BUILDINGS, groundHeightAt, colliders });
  const root = new THREE.Group(); root.name = 'Neon Harbor · two shores'; scene.add(root);
  root.add(south.root, north.root);
  let simulation = null, context = null, contextVersion = null, outdoorCars = null, elevatorAnchor = null;

  const person = () => ({ ...simulation.player, y: simulation.player.groundY + simulation.player.y });
  const inside = () => !!interiors.state?.buildingId;
  function addNorthernTraffic() {
    if (simulation.cars.some(c => c.id === 'north-parked-0')) return;
    const colors = [0xa3b5b0, 0xaa7253, 0x417d84, 0xcfba8a, 0x93a2b4, 0xc18d87];
    const makeCar = (id, x, z, extra = {}) => ({ id, x, z, yaw: Math.PI, type: 'sedan', color: colors[Math.abs(Math.round(z)) % colors.length],
      home: { x, z, yaw: Math.PI }, speed: 0, vx: 0, vz: 0, health: 100, traffic: false, ...extra });
    for (let i = 0; i < 6; i++) simulation.cars.push(makeCar(`north-parked-${i}`, 6, -455 - i * 140, { color: colors[i] }));
    for (let row = 0; row < 3; row++) {
      const top = -420 - row * 280, bottom = top - 140;
      const route = [{ x: -640, z: top }, { x: 640, z: top }, { x: 640, z: bottom }, { x: -640, z: bottom }];
      for (let i = 0; i < 4; i++) {
        const from = route[i], to = route[(i + 1) % 4];
        const x = (from.x + to.x) / 2, z = (from.z + to.z) / 2;
        simulation.cars.push(makeCar(`north-traffic-${row}-${i}`, x, z, { yaw: Math.atan2(to.x - from.x, to.z - from.z),
          traffic: true, cruise: 9 + row * 2, speed: 9, route, waypoint: (i + 1) % 4, pause: 0 }));
      }
    }
    for (const car of simulation.cars) if (car.id.startsWith('north-')) simulation._groundCar(car);
  }
  function syncContext(force = false) {
    if (!simulation) return;
    const next = interiors.collisionContext() || transit.collisionContext();
    const nextColliders = next?.colliders || colliders;
    if (force || context?.colliders !== nextColliders || contextVersion !== next?.version) {
      if (next && !outdoorCars) { outdoorCars = simulation.cars; simulation.cars = []; }
      if (!next && outdoorCars) { simulation.cars = outdoorCars; outdoorCars = null; }
      simulation.colliders = nextColliders;
      simulation.groundHeightAt = next?.groundHeightAt || groundHeightAt;
      simulation._supportCache.clear();
      context = next ? { ...next, colliders: nextColliders } : { colliders };
      contextVersion = next?.version;
      onContextChange(nextColliders);
    } else simulation.groundHeightAt = next?.groundHeightAt || groundHeightAt;
    north.setInteriorBuilding?.(interiors.state?.buildingId || null);
  }
  function applyTransition(transition) {
    if (!transition || !simulation) return;
    syncContext(true);
    const p = transition.position || transition;
    if (Number.isFinite(p.x) && Number.isFinite(p.z)) {
      Object.assign(simulation.player, { x: p.x, z: p.z, yaw: p.yaw ?? simulation.player.yaw, y: 0, vy: 0 });
      simulation.player.groundY = transition.groundY ?? simulation.groundHeightAt(p.x, p.z);
      simulation.inCar = null; simulation._grounded = true; simulation._jumpHeld = false;
      simulation.teleportRevision++; simulation.saveRevision++;
    }
  }
  function message(result) { if (result?.message) simulation._message(result.message); }
  function getPrompt() {
    if (!simulation || simulation.inCar) return null;
    if (inside()) return interiors.getPrompt(person());
    const transport = transit.getPrompt(person());
    if (transport) return typeof transport === 'string' ? { kind: 'transit', label: transport } : transport;
    const entrance = interiors.getPrompt(person());
    if (entrance) return entrance;
    const npc = people.getPrompt?.(person());
    return typeof npc === 'string' ? { kind: 'person', label: npc } : npc;
  }
  function interact() {
    if (simulation.inCar) return { handled: false };
    let result;
    if (inside()) result = interiors.interact(person());
    else if (transit.getPrompt(person())) result = transit.interact(person());
    else if (interiors.getPrompt(person())) result = interiors.interact(person());
    else result = people.interact?.(person());
    if (!result) return { handled: false };
    if (typeof result === 'string') result = { handled: true, message: result };
    if(result.type==='conversation')result.handled=true;
    message(result); syncContext(); applyTransition(result.transition);
    return result;
  }
  function selectFloor(id) {
    const result = interiors.selectFloor(id);
    if (!result) return false;
    elevatorAnchor = { x: simulation.player.x, z: simulation.player.z };
    applyTransition(result.transition || result); syncContext();
    return true;
  }
  function leaveSpecialLocation() {
    if (inside()) applyTransition(interiors.exit({force:true}));
    const result = transit.leave?.() || transit.reset?.();
    if (result) applyTransition(result.transition || result);
    syncContext();
  }
  async function travelTo(destination) {
    if (!simulation) return;
    if (simulation.mission || simulation.wanted) {
      simulation._message('请先完成当前委托并解除警戒，再使用快速旅行。', 'warning'); return false;
    }
    const car = simulation.activeVehicle;
    if (car) { car.speed = 0; car.vx = 0; car.vz = 0; simulation.inCar = null; }
    leaveSpecialLocation();
    const position = destination.entrance || destination.entry || destination.position || destination;
    applyTransition({ position, groundY: groundHeightAt(position.x, position.z) });
    await prepare(position);
    simulation._message(`已抵达${destination.name || '目的地'}。按 E 使用入口。`);
    return true;
  }
  async function prepare(position, retry = false) {
    const results = await Promise.all([south[retry ? 'retry' : 'prepare'](position), north[retry && north.retry ? 'retry' : 'prepare'](position)]);
    return { ready: results.every(r => r.ready), failed: results.flatMap(r => Array.isArray(r.failed) ? r.failed : []), loaded: results.reduce((n, r) => n + (r.loaded || 0), 0) };
  }
  function step(dt, input) {
    const interiorResult = interiors.update(dt, person());
    const transitResult = transit.update(dt, simulation.inCar ? simulation.position : person());
    if (interiorResult?.transition || interiorResult?.position) applyTransition(interiorResult.transition || interiorResult);
    if (transitResult?.transition) applyTransition(transitResult.transition);
    syncContext();
    const riding = transit.passengerPose;
    const moving = interiors.state?.moving;
    simulation.update(dt, riding || moving ? { cameraYaw: input.cameraYaw } : input);
    if (riding) {
      Object.assign(simulation.player, { x: riding.x, z: riding.z, groundY: riding.y, yaw: riding.yaw, y: 0, vy: 0 });
    } else if (moving) {
      elevatorAnchor ||= { x: simulation.player.x, z: simulation.player.z };
      const anchor = interiors.state?.elevator?.anchor || elevatorAnchor;
      Object.assign(simulation.player, { x: anchor.x, z: anchor.z, y: 0, vy: 0 });
      simulation.player.groundY = simulation.groundHeightAt(anchor.x, anchor.z);
    } else elevatorAnchor = null;
  }
  function safeSave() {
    const save = simulation.exportSave();
    const building = METROPOLIS_BUILDINGS.find(b => b.id === interiors.state?.buildingId);
    if (building) save.player = { x: building.entrance.x, z: building.entrance.z, yaw: building.entrance.yaw };
    const state = transit.snapshot();
    if (!building && (state.riding || transit.collisionContext())) {
      const stop = transit.stops.find(s => s.id === (state.currentStopId || state.currentStop || state.stationId || transit.boardedStopId)) || transit.stops[0];
      const entry = stop?.entry || stop?.entrance || stop?.surface;
      save.player = entry ? { x: entry.x, z: entry.z, yaw: entry.yaw || Math.PI } : { x: 16, z: 250, yaw: Math.PI };
    }
    return save;
  }
  return {
    root, south, north, interiors, transit, people, colliders, groundHeightAt, bounds: METROPOLIS_BOUNDS,
    buildings: METROPOLIS_BUILDINGS, districts: METROPOLIS_DISTRICTS, roads: METROPOLIS_ROADS,
    walkerRoutes: south.walkerRoutes, landmarks: [...south.landmarks, ...north.landmarks], spawn: south.spawn,
    bind(sim) {
      if(simulation)leaveSpecialLocation(); simulation = sim; addNorthernTraffic();
      simulation.pedestriansAt = p => !inside() && !transit.collisionContext() ? people.getCollisionBodies?.(p, 12) || [] : [];
      syncContext(true);
    },
    get activeContext() { return context; }, get isInside() { return inside(); },
    get riding() { return transit.passengerPose; },
    getPrompt, interact, selectFloor, applyTransition, travelTo, safeSave, step,
    prepare: p => prepare(p), retry: p => prepare(p, true),
    streamAt(position, velocity, dt) { south.streamAt?.(position, velocity, dt); north.update(position, velocity, dt); },
    get streamingStats() {
      const a = south.streamingStats, b = north.streamingStats;
      return { ...a, ready: a.ready && b.ready, failed: (a.failed || 0) + (b.failed || 0), loaded: a.loaded + b.loaded,
        pending: (a.pending || 0) + (b.pending || 0), south: a, north: b };
    },
    districtAt(x, z) {
      if (inside()) return `${METROPOLIS_BUILDINGS.find(b => b.id === interiors.state.buildingId)?.name || ''} · 室内`;
      if (z < -390) return METROPOLIS_DISTRICTS.reduce((a, b) => Math.abs(b.z - z) < Math.abs(a.z - z) ? b : a).name;
      if (z < -290) return '维澜海峡';
      return south.districtAt(x, z);
    },
    update(dt, time, view) {
      south.update(dt, time, view); north.update(view?.position || south.spawn, view?.velocity || {x:0,z:0}, dt);
      people.update(dt, { position: view?.position || south.spawn, hour: time * 24, vehicles: outdoorCars || simulation?.cars || [], paused: dt === 0 });
      if (people.root) people.root.visible = !inside() && !transit.collisionContext();
    },
    setQuality(value) { south.setQuality(value); north.setQuality(value); },
    snapshot() { return { interior: interiors.snapshot(), transit: transit.snapshot(), people: people.snapshot(), buildings: METROPOLIS_BUILDINGS, streaming: north.streamingStats }; },
  };
}
