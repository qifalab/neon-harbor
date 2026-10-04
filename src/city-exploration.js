import { northernVehicles } from './traffic.js';
import { createWorld } from './world.js';
import { createMetropolisWorld } from './metropolis-world.js';
import { METROPOLIS_BUILDINGS, METROPOLIS_DISTRICTS, METROPOLIS_ROADS, METROPOLIS_BOUNDS } from './metropolis-catalog.js';
import { createInteriorSystem } from './metropolis-interiors.js';
import { createTransitSystem } from './metropolis-transit.js';
import { createPeopleSystem } from './metropolis-people.js';
import { createCitizenCrossings } from './citizen-crossings.js';
import { createMetropolisInfrastructure } from './metropolis-infrastructure.js';
import { createExpansionEntrances } from './expansion-entrances.js';
import { expansionBuilding } from './expansion-programmes.js';
import { createHarborSkyline } from './harbor-skyline.js';
import { createHarborTransitSystem } from './harbor-transit-renderer.js';
import { createHarborDistrict } from './harbor-district.js';
import { HarborLife } from './harbor-life.js';
import { createHarborLifeRenderer } from './harbor-life-renderer.js';

/** Owns scene transitions so rendering, collision, saving and input agree.
 * The original driving district remains usable without the expansion module.
 * Interior and station collision contexts never replace persistent city data.
 */
export function createCityExploration(THREE, scene, { quality = 'high', streaming = true, onContextChange = () => {} } = {}) {
  const south = createWorld(THREE, scene, { quality, streaming, openNorth: true });
  const north = createMetropolisWorld(THREE, scene, { quality, streaming });
  const transit = createTransitSystem(THREE, scene);
  const infrastructure = createMetropolisInfrastructure(THREE, scene, { quality });
  const harbor = createHarborSkyline(THREE, scene, { quality });
  const buildings = [...METROPOLIS_BUILDINGS, ...south.buildings.map((b, i) => expansionBuilding(b, 'south', i)), ...harbor.towers.map((b, i) => expansionBuilding(b, 'east', i))];
  const districts = [...METROPOLIS_DISTRICTS, { id: 'south-expansion', name: '南岸旧城', x: -120, z: 100 }, { id: 'east-expansion', name: '东湾天际线', x: 1300, z: -250 }];
  const streetGroundHeightAt = (x, z, currentY = 0) => infrastructure.groundHeightAt(x, z, currentY) ?? harbor.groundHeightAt(x, z) ?? north.groundHeightAt(x, z) ?? south.groundHeightAt(x, z);
  const sampleTransit = createHarborTransitSystem(THREE, scene, { groundHeightAt: streetGroundHeightAt });
  const groundHeightAt = (x, z, currentY = 0) => sampleTransit.groundHeightAt(x, z, currentY) ?? streetGroundHeightAt(x, z, currentY);
  const sampleDistrict = createHarborDistrict(THREE, scene, { buildings: south.buildings, groundHeightAt, quality });
  const colliders = [...south.colliders, ...north.colliders, ...transit.colliders, ...infrastructure.colliders, ...harbor.colliders, ...sampleTransit.colliders, ...sampleDistrict.colliders];
  for (const b of buildings.filter(b => b.shellId)) b.entrance = safeEntrance(b, colliders, groundHeightAt);
  const interiors = createInteriorSystem(THREE, scene, { buildings });
  const harborLife = new HarborLife({ buildings, colliders, transport: sampleTransit });
  const lifeRenderer = createHarborLifeRenderer(THREE, scene, harborLife, { groundHeightAt });
  const people = createPeopleSystem(THREE, scene, { buildings: METROPOLIS_BUILDINGS, groundHeightAt, colliders, transit, streetStops: infrastructure.metadata.streetLifeStops || [] });
  const crossings = createCitizenCrossings(THREE, scene, people.journeys.navigation.crossings, colliders);
  const root = new THREE.Group(); root.name = 'Neon Harbor · two shores'; scene.add(root);
  root.add(south.root, north.root, infrastructure.root, harbor.root, crossings.root, sampleTransit.root, sampleDistrict.root, lifeRenderer.root);
  const sample = { transit: sampleTransit, district: sampleDistrict, life: harborLife, lifeRenderer };
  const entryMarkers = createExpansionEntrances(THREE, root, buildings.filter(b => b.shellId));
  let simulation = null, context = null, contextVersion = null, outdoorCars = null, elevatorAnchor = null;

  const person = () => ({ ...simulation.player, y: simulation.player.groundY + simulation.player.y });
  const inside = () => !!interiors.state?.buildingId;
  function addNorthernTraffic() {
    if (simulation.cars.some(c => c.id === 'north-parked-0')) return;
    simulation.cars.push(...northernVehicles());
    for (const car of simulation.cars) if (car.id.startsWith('north-')) simulation._groundCar(car);
  }
  function syncContext(force = false) {
    if (!simulation) return;
    const next = interiors.collisionContext() || sampleTransit.collisionContext() || transit.collisionContext();
    const isolateCars = !!next;
    if (isolateCars && !outdoorCars) { outdoorCars = simulation.cars; simulation.cars = []; }
    if (!isolateCars && outdoorCars) { simulation.cars = outdoorCars; outdoorCars = null; }
    const nextColliders = next?.colliders || colliders;
    if (force || context?.colliders !== nextColliders || contextVersion !== next?.version) {
      simulation.colliders = nextColliders;
      simulation.groundHeightAt = next?.groundHeightAt || groundHeightAt;
      simulation._supportCache.clear();
      context = next ? { ...next, colliders: nextColliders } : { colliders };
      contextVersion = next?.version;
      onContextChange(nextColliders);
    } else simulation.groundHeightAt = next?.groundHeightAt || groundHeightAt;
    const active = buildings.find(b => b.id === interiors.state?.buildingId);
    north.setInteriorBuilding?.(active && !active.shellId ? active.id : null);
    south.setInteriorBuilding?.(active?.district === 'south-expansion' ? active.shellId : null);
    harbor.setInteriorBuilding?.(active?.district === 'east-expansion' ? active.shellId : null);
    entryMarkers.setInteriorBuilding(active?.id || null);
    sampleDistrict.setInteriorBuilding(active?.shellId || null);
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
    if (inside()) return interiors.getPrompt(person()) || (people.getPrompt?.(simulation.player) ? { kind: 'person', label: people.getPrompt(simulation.player) } : null);
    const samplePrompt = sampleTransit.getPrompt(person());
    if (samplePrompt) return samplePrompt;
    const dailyPrompt = harborLife.getPrompt(person());
    if (dailyPrompt?.kind === 'harbor-delivery') return dailyPrompt;
    const transport = transit.getPrompt(person());
    if (transport) return typeof transport === 'string' ? { kind: 'transit', label: transport } : transport;
    const entrance = interiors.getPrompt(person());
    if (entrance) return entrance;
    if (dailyPrompt) return dailyPrompt;
    const npc = people.getPrompt?.(simulation.player);
    return typeof npc === 'string' ? { kind: 'person', label: npc } : npc;
  }
  function interact() {
    if (simulation.inCar) return { handled: false };
    let result;
    if (inside()) { result = interiors.interact(person()); if (!result.handled) result = people.interact?.(simulation.player); }
    else if (sampleTransit.getPrompt(person())) result = sampleTransit.interact(person());
    else if (harborLife.getPrompt(person())?.kind === 'harbor-delivery') result = harborLife.interact(person(), { cash: simulation.cash });
    else if (transit.getPrompt(person())) result = transit.interact(person());
    else if (interiors.getPrompt(person())) result = interiors.interact(person());
    else if (harborLife.getPrompt(person())) result = harborLife.interact(person(), { cash: simulation.cash });
    else result = people.interact?.(simulation.player);
    if (!result) return { handled: false };
    if (typeof result === 'string') result = { handled: true, message: result };
    if(result.type==='conversation')result.handled=true;
    if (Number.isFinite(result.cashDelta) && result.cashDelta) { simulation.cash += result.cashDelta; simulation.saveRevision++; }
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
    if (sampleTransit.riding) { const sampleExit = sampleTransit.leave(); if (sampleExit?.transition) applyTransition(sampleExit.transition); }
    syncContext();
  }
  async function travelTo(destination) {
    if (!simulation) return;
    if (harborLife.activeDelivery) {
      simulation._message('手里有待送货物，请步行、驾驶或乘坐公共交通送到柜台，再使用快速旅行。', 'warning'); return false;
    }
    if (simulation.mission || simulation.wanted) {
      simulation._message('请先完成当前委托并解除警戒，再使用快速旅行。', 'warning'); return false;
    }
    const car = simulation.activeVehicle;
    if (car) { car.speed = 0; car.vx = 0; car.vz = 0; simulation.inCar = null; }
    leaveSpecialLocation();
    const rawPosition = destination.entrance || destination.entry || destination.position || destination;
    const position=destination.kind==='metro'?{...rawPosition,yaw:0}:rawPosition;
    applyTransition({ position, groundY: groundHeightAt(position.x, position.z) });
    await prepare(position);
    simulation._message(`已抵达${destination.name || '目的地'}。${destination.kind==='metro'?'沿入口楼梯步行下行，无需按 E。':destination.walkable ? '沿步道自由探索。' : '按 E 使用入口。'}`);
    return true;
  }
  async function prepare(position, retry = false) {
    const results = await Promise.all([south[retry ? 'retry' : 'prepare'](position), north[retry && north.retry ? 'retry' : 'prepare'](position)]);
    return { ready: results.every(r => r.ready), failed: results.flatMap(r => Array.isArray(r.failed) ? r.failed : []), loaded: results.reduce((n, r) => n + (r.loaded || 0), 0) };
  }
  let currentHour = 16.5;
  function step(dt, input) {
    const interiorResult = interiors.update(dt, person());
    if(interiorResult?.floorChanged)message(interiorResult);
    const transitResult = transit.update(dt, simulation.inCar || inside() ? null : person());
    sampleTransit.update(dt, simulation.inCar || inside() || transit.collisionContext() ? null : person(), {
      traffic: outdoorCars || simulation.cars,
      pedestrianDistanceAt: body => Math.min(people.journeys.trafficStopDistanceAt(body), harborLife.trafficStopDistanceAt(body)),
    });
    harborLife.update(dt, { hour: currentHour, trafficTime: sampleTransit.time, vehicles: [...(outdoorCars || simulation.cars), ...sampleTransit.trafficBodies] });
    if (interiorResult?.transition || interiorResult?.position) applyTransition(interiorResult.transition || interiorResult);
    if (transitResult?.transition) applyTransition(transitResult.transition);
    syncContext();
    const riding = sampleTransit.passengerPose || transit.passengerPose;
    const moving = interiors.state?.moving;
    simulation.update(dt, riding || moving ? { cameraYaw: input.cameraYaw } : input);
    if (outdoorCars) simulation.updateStoredTraffic(dt, { cars: outdoorCars, colliders, groundHeightAt });
    if (sampleTransit.riding) sampleTransit.stepPlayer(simulation, dt, input);
    else if (riding) {
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
    save.harborLife = harborLife.snapshot(); save.harborTransit = sampleTransit.exportState();
    const building = buildings.find(b => b.id === interiors.state?.buildingId);
    if (building) save.player = { x: building.entrance.x, z: building.entrance.z, yaw: building.entrance.yaw };
    const state = transit.snapshot();
    if (!building && (state.riding || transit.collisionContext())) {
      const stop = transit.stops.find(s => s.id === (state.currentStopId || state.currentStop || state.stationId || transit.boardedStopId)) || transit.stops[0];
      const entry = stop?.entry || stop?.entrance || stop?.surface;
      save.player = entry ? { x: entry.x, z: entry.z, yaw: entry.yaw || Math.PI } : { x: 16, z: 250, yaw: Math.PI };
    }
    if (!building && sampleTransit.riding) {
      const entry = sampleTransit.boardedStop?.entrance;
      if (entry) save.player = { x: entry.x, z: entry.z, yaw: entry.yaw || 0 };
    }
    if (!building && !state.riding && !transit.collisionContext() && !sampleTransit.riding) {
      const pose = simulation.activeVehicle || { ...simulation.player, y: simulation.player.groundY };
      const deck = infrastructure.supportAt(pose.x, pose.z, pose.y);
      if (deck?.height > .5 && deck.entrance) save.player = { ...deck.entrance };
    }
    return save;
  }
  return {
    root, south, north, interiors, transit, sample, infrastructure, harbor, people, colliders, groundHeightAt, bounds: METROPOLIS_BOUNDS,
    get vehicles() { return outdoorCars || simulation?.cars || []; },
    buildings, districts, roads: METROPOLIS_ROADS,
    walkerRoutes: south.walkerRoutes, landmarks: [...south.landmarks, ...north.landmarks, ...infrastructure.landmarks, ...harbor.landmarks], spawn: south.spawn,
    bind(sim, { save = null, hour = 16.5 } = {}) {
      if(simulation)leaveSpecialLocation(); simulation = sim; addNorthernTraffic();
      let restored; try { restored = typeof save === 'string' ? JSON.parse(save) : save; } catch { restored = null; }
      harborLife.reset({ hour }); sampleTransit.resetService();
      sampleTransit.restoreState(restored?.harborTransit);
      if (restored?.harborLife) harborLife.restore(restored.harborLife);
      currentHour = hour;
      simulation.pedestriansAt = p => !inside() && !transit.collisionContext() && !sampleTransit.riding ? [...(people.getCollisionBodies?.(p, 12) || []), ...harborLife.getCollisionBodies(p, 12)] : [];
      simulation.isolatedPlayer = () => inside() || !!transit.collisionContext() || sampleTransit.riding;
      simulation.externalVehicles = car => !car && simulation.isolatedPlayer() ? [] : sampleTransit.trafficBodies.map(body => ({ ...body, externalBody: true }));
      simulation.trafficYieldAt = car => people.trafficYieldAt(car) || harborLife.trafficYieldAt(car);
      simulation.trafficClock = car => car.z > -290 ? sampleTransit.time : simulation.elapsed;
      simulation.trafficStopDistanceAt = car => Math.min(people.journeys.trafficStopDistanceAt(car), harborLife.trafficStopDistanceAt(car), sampleTransit.trafficStopDistanceAt(car));
      syncContext(true);
    },
    get activeContext() { return context; }, get isInside() { return inside(); },
    get riding() { return sampleTransit.passengerPose || transit.passengerPose; },
    getPrompt, interact, selectFloor, applyTransition, travelTo, safeSave, step,
    prepare: p => prepare(p), retry: p => prepare(p, true),
    streamAt(position, velocity, dt) { south.streamAt?.(position, velocity, dt); north.update(position, velocity, dt); },
    get streamingStats() {
      const a = south.streamingStats, b = north.streamingStats;
      const stats = { ...a, ready: a.ready && b.ready, south: a, north: b };
      for (const key of ['failed', 'loaded', 'pending', 'requested', 'unloaded', 'disposedInstances', 'residentInstances', 'residentMeshes', 'bytes', 'residentBytes', 'maxResidentChunks'])
        stats[key] = (a[key] || 0) + (b[key] || 0);
      // Preserve old-island IDs while making north-shore counters and membership
      // agree; two independent caches must not masquerade as a single old cache.
      for (const key of ['activeChunks', 'targetChunks', 'failedChunks', 'historicalFailedChunks'])
        stats[key] = [...(a[key] || []), ...(b[key] || []).map(id => `north:${id}`)];
      return stats;
    },
    districtAt(x, z) {
      if (inside()) return `${buildings.find(b => b.id === interiors.state.buildingId)?.name || ''} · 室内`;
      if (sampleTransit.riding) return sampleTransit.route(sampleTransit.vehicle().routeId).name;
      if (x > 980) return '东湾天际线';
      if(x>272&&x<295&&z>-280&&z<285)return '星湾全景海滨';
      const deck = infrastructure.supportAt(x, z, simulation?.activeVehicle?.y ?? simulation?.player.groundY ?? 0);
      if (deck?.height > .5) return infrastructure.landmarks.find(l => l.id === deck.id)?.name || '高架道路';
      if (z < -390) return METROPOLIS_DISTRICTS.reduce((a, b) => Math.abs(b.z - z) < Math.abs(a.z - z) ? b : a).name;
      if (z < -290) return '维澜海峡';
      return south.districtAt(x, z);
    },
    update(dt, time, view) {
      currentHour = time * 24;
      south.update(dt, time, { ...view, trafficTime: sampleTransit.time }); north.update(view?.position || south.spawn, view?.velocity || {x:0,z:0}, dt);
      north.updateWater(dt,time*24);harbor.update(view?.position || south.spawn,dt,time);
      infrastructure.update(view?.position || south.spawn, dt);
      entryMarkers.update(view?.position || south.spawn);
      sampleDistrict.update(view?.position || south.spawn, dt, time);
      lifeRenderer.update({ position: view?.position || south.spawn, interior: interiors.snapshot() }, dt);
      crossings.update(transit.time, view?.position || south.spawn);
      people.update(dt, { position: view?.position || south.spawn, hour: time * 24, vehicles: outdoorCars || simulation?.cars || [], paused: dt === 0, interior: interiors.snapshot() });
      if (people.root) people.root.visible = !interiors.state.moving;
    },
    updateRenderVisibility(camera) {
      // Physics, streaming, clocks, lighting and material quality keep running.
      // Only a camera wholly enclosed by the closed opaque cabin can skip the
      // city behind it. Re-evaluate every frame, including opening and travel.
      const enclosed = interiors.cameraInClosedCabin(camera);
      root.visible = !enclosed; transit.root.visible = !enclosed;
      return enclosed;
    },
    setQuality(value) { south.setQuality(value); north.setQuality(value); infrastructure.setQuality(value); harbor.setQuality(value); sampleDistrict.setQuality(value); },
    snapshot() { return { interior: interiors.snapshot(), transit: transit.snapshot(), sample: { transit: sampleTransit.snapshot(), life: { ...harborLife.summary(), agents: harborLife.agents.map(a => ({ id: a.id, name: a.name, role: a.role, phase: a.phase, activity: a.activity, x: a.x, y: a.y, z: a.z, insideBuildingId: a.insideBuildingId, floorId: a.floorId, transit: a.transit })) }, district: sampleDistrict.snapshot(), renderer: lifeRenderer.snapshot() }, infrastructure: infrastructure.metadata, harbor: harbor.snapshot(), people: people.snapshot(), buildings, exterior: { southInteriorId: south.interiorBuildingId, harborInteriorId: harbor.snapshot().interiorBuildingId }, streaming: north.streamingStats,
      renderVisibility: { outdoor: root.visible, transit: transit.root.visible } }; },
  };
}

/** Select an unobstructed doorway apron and exit route from real outdoor solids.
 * This only chooses public entrances; it never disables a nearby obstacle. */
function safeEntrance(building, colliders, groundHeightAt) {
  const extent = building.district === 'east-expansion' ? .67 : .5;
  const halfWidth = (building.exteriorWidth || building.width) * extent, halfDepth = (building.exteriorDepth || building.depth) * extent;
  for (const apron of [3, 4.5, 6, 8]) {
    for (const [nx, nz] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) for (const offset of [0, -.22, .22, -.4, .4]) {
      const p = { x: building.x + nx * (halfWidth + apron) + nz * building.width * offset,
        z: building.z + nz * (halfDepth + apron) + nx * building.depth * offset, yaw: Math.atan2(-nx, -nz) };
      const clear = [1 - apron, 2 - apron, 0, .3, building.exitOffset].every(step => {
        const x = p.x + nx * step, z = p.z + nz * step, y = groundHeightAt(x, z);
        return !colliders.some(c => c.physics !== false && c.maxY > y + .2 && c.minY < y + 1.8 &&
          Math.hypot(Math.max(0, Math.abs(x - c.x) - c.hx), Math.max(0, Math.abs(z - c.z) - c.hz)) < .55);
      });
      if (clear) {
        const doorExtent = building.district === 'east-expansion' ? .65 : .5;
        building.entryPortal = { x: p.x - nx * (apron + halfWidth - (building.exteriorWidth || building.width) * doorExtent - .08), z: p.z - nz * (apron + halfDepth - (building.exteriorDepth || building.depth) * doorExtent - .08), y: building.baseY || 0, yaw: Math.atan2(nx, nz) };
        building.exitPosition = { x: p.x + nx * building.exitOffset, z: p.z + nz * building.exitOffset, yaw: Math.atan2(nx, nz) };
        return { ...p, y: groundHeightAt(p.x, p.z) };
      }
    }
  }
  throw new Error(`No clear entrance apron for ${building.id}`);
}
