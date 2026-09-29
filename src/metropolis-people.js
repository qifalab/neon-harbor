import { CHARACTER_STYLES } from './models.js';
import { circleOBB, SpatialIndex } from './collision.js';
import { createCitizenCharacter } from './citizen-appearance.js';
import { createCitizenIdentity, citizenRoutine, citizenDayPeriod, citizenDialogue, CITIZEN_ACTIVITY_LABELS } from './citizen-life.js';

const RADIUS = .37;
export const PEOPLE_BUDGET = Object.freeze({ logicalPerAddress: 5, detailed: 32, distant: 112,
  detailedDistance: 125, distantDistance: 320, spawnPerFrame: 2 });
const wrap = (value, length) => ((value % length) + length) % length;
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const turn = (from, to, amount) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * amount;

/** The 26 m carriageways leave walking lanes 18 m from road centre. A route
 * remains within its own block, so NPCs never silently cross moving traffic. */
export function createPedestrianRoutes(buildings = []) {
  return buildings.map(building => {
    const x = building.x, z = building.z, hx = 62, hz = 52;
    const points = [
      { x: x - hx, z: z + hz }, { x, z: z + hz }, { x: x + hx, z: z + hz },
      { x: x + hx, z }, { x: x + hx, z: z - hz }, { x, z: z - hz },
      { x: x - hx, z: z - hz }, { x: x - hx, z },
    ];
    const lengths = points.map((point, i) => distance(point, points[(i + 1) % points.length]));
    return { id: `walk-${building.id}`, buildingId: building.id, points, lengths,
      length: lengths.reduce((total, length) => total + length, 0) };
  });
}

export function samplePedestrianRoute(route, travel, direction = 1) {
  let remaining = wrap(travel, route.length), index = 0;
  while (index < route.lengths.length - 1 && remaining > route.lengths[index]) remaining -= route.lengths[index++];
  const from = route.points[index], to = route.points[(index + 1) % route.points.length];
  const ratio = remaining / route.lengths[index];
  return { x: from.x + (to.x - from.x) * ratio, z: from.z + (to.z - from.z) * ratio,
    yaw: Math.atan2((to.x - from.x) * direction, (to.z - from.z) * direction), segment: index };
}

/** These three short loops stay on the outside pavement of the perimeter
 * avenue. They deliberately do not invent a crossing through moving traffic. */
export function createTransitWaitingRoute(stop) {
  const side = Math.sign(stop.x) || 1;
  const points = [{ x: stop.x, z: stop.z - 13 }, { x: stop.x, z: stop.z + 13 },
    { x: stop.x + side * .12, z: stop.z + 13 }, { x: stop.x + side * .12, z: stop.z - 13 }];
  const lengths = points.map((point, i) => distance(point, points[(i + 1) % points.length]));
  return { id: `wait-${stop.id}`, buildingId: stop.buildingId, points, lengths, length: lengths.reduce((a, b) => a + b, 0) };
}

/** Stateful logical residents are independent of render instances. Returning to
 * a district resumes its people, while only a bounded nearby set owns skeletons. */
export function createPeopleSystem(THREE, scene, {
  buildings = [], groundHeightAt = () => 0, colliders = [], streetStops = [],
} = {}) {
  const root = new THREE.Group(); root.name = 'Metropolis street life'; scene.add(root);
  const routes = createPedestrianRoutes(buildings), residents = [], models = new Map(), pool = [];
  const residentsByBlock = routes.map(() => []), candidates = [], near = [], active = new Set();
  const collisionGrid = new Map(), collisionBucketPool = [], collisionCellSize = 16;
  let collisionIndexReady = false;
  const index = new SpatialIndex(colliders.filter(box => box.physics !== false &&
    (box.minY ?? 0) < 1.8 && (box.maxY ?? 4) > .22));
  const blocked = (point, vehicles = [], clearance = RADIUS) => {
    for (const box of index.query({ ...point, hx: clearance, hz: clearance })) {
      if (circleOBB({ ...point, radius: clearance }, box)) return true;
    }
    for (const vehicle of vehicles) {
      if (vehicle.health <= 0 || Math.abs(point.x - vehicle.x) > 5 || Math.abs(point.z - vehicle.z) > 5) continue;
      if (Math.abs((vehicle.groundY ?? vehicle.y ?? 0) - groundHeightAt(point.x, point.z)) > 2) continue;
      if (circleOBB({ ...point, radius: clearance + .5 }, vehicle)) return true;
    }
    return false;
  };
  for (const [block, building] of buildings.entries()) {
    for (let person = 0; person < PEOPLE_BUDGET.logicalPerAddress; person++) {
      const stop = person === 2 ? streetStops.find(candidate => candidate.buildingId === building.id) : null;
      const route = stop ? createTransitWaitingRoute(stop) : routes[block];
      const social = person >= 3, seed = block * 13 + person * 7, direction = block % 2 ? -1 : 1;
      const identity = createCitizenIdentity(building, block, person), routine = citizenRoutine(identity, 12);
      if (stop) { routine.activity = 'waiting-transit'; routine.purpose = `在${stop.name}停靠湾查看线路、等同行的人`; }
      let travel = stop ? 13 + (seed % 3 - 1) * 1.3 : wrap(person * route.length / 3 + block * 19, route.length);
      let point = samplePedestrianRoute(route, travel, direction);
      if (social) {
        travel = route.lengths[0] - 11 + (person - 3) * 1.7;
        point = samplePedestrianRoute(route, travel, direction);
        point.yaw = person === 3 ? Math.PI / 2 : -Math.PI / 2;
      }
      // A prop may occupy a preferred spot. Find a legal starting point on the
      // same pavement rather than spawning a resident inside a planter or wall.
      for (let attempt = 0; blocked(point) && attempt < 160; attempt++) {
        travel = wrap(travel + 3, route.length); point = samplePedestrianRoute(route, travel, direction);
      }
      if (blocked(point)) continue;
      const resident = { id: `resident-${building.id}-${person}`, block, person, building, route,
        x: point.x, z: point.z, yaw: point.yaw, homeYaw: point.yaw, travel, direction, social,
        identity, routine, stop, cycle: 0, style: identity.style, height: identity.height,
        speed: (identity.age === 'elder' ? .76 : .91) + (seed % 9) * .054,
        phase: seed * .67, state: social ? 'talking' : person === 0 ? 'walking' : routine.activity === 'talking' ? 'reading' : routine.activity,
        gait: 0, pause: social ? 12 + seed % 9 : person === 0 ? 0 : 6 + seed % 12, blockedFor: 0,
        destination: social ? travel : routine.waypoint * route.length,
        groupId: social ? `conversation-${building.id}` : null, interactionUntil: 0, dialogue: 0 };
      resident.view = { resident, distance: Infinity };
      resident.collisionBody = { id: resident.id, x: resident.x, z: resident.z, y: 0, groundY: 0, radius: .48 };
      residents.push(resident); residentsByBlock[block].push(resident);
    }
  }
  const farGeometry = makeDistantGeometry(THREE);
  const farMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .89 });
  const distant = new THREE.InstancedMesh(farGeometry, farMaterial, PEOPLE_BUDGET.distant);
  distant.name = 'Distant citizens · one draw call'; distant.count = 0; distant.frustumCulled = false;
  distant.instanceMatrix.setUsage(THREE.DynamicDrawUsage); root.add(distant);
  const marker = new THREE.Object3D(), color = new THREE.Color(), distantTint = new THREE.Color('#d6cbbd');
  let time = 0, lastPosition = { x: 0, z: 0 }, lastHour = 12, released = false, visibleFar = 0;
  for (const resident of residents) if (resident.state === 'walking') chooseDestination(resident, 12);

  function release(id) {
    const model = models.get(id); if (!model) return;
    root.remove(model); models.delete(id); model.visible = false;
    // Every mesh references immutable wardrobe geometry, so releasing an entity
    // must not dispose a template still used by another resident or the player.
    if (pool.length < PEOPLE_BUDGET.detailed) pool.push(model);
  }
  function materialize(resident) {
    const styleName = CHARACTER_STYLES[resident.style].id;
    const reuse = pool.findIndex(model => model.userData.style === styleName);
    const model = reuse < 0 ? createCitizenCharacter(THREE, resident.style) : pool.splice(reuse, 1)[0];
    model.name = `${resident.identity.name} · ${resident.identity.role} · ${resident.building.name}`;
    model.userData.residentId = resident.id; model.visible = true;
    model.userData.setCitizen(resident.identity); root.add(model); models.set(resident.id, model);
    return model;
  }
  function animate(model, resident, dt, nearDistance) {
    const walking = resident.state === 'walking', target = walking ? .42 * resident.identity.stride : 0;
    resident.gait += (target - resident.gait) * (1 - Math.exp(-dt * 9));
    const joints = model.userData, swing = Math.sin(resident.phase) * resident.gait;
    joints.leftLeg.rotation.x = swing; joints.rightLeg.rotation.x = -swing;
    joints.leftKnee.rotation.x = Math.max(0, swing) * 1.05;
    joints.rightKnee.rotation.x = Math.max(0, -swing) * 1.05;
    joints.leftArm.rotation.x = -swing * .72; joints.rightArm.rotation.x = swing * .72;
    const talking = resident.state === 'talking' || resident.state === 'greeting';
    joints.leftElbow.rotation.x = -.15 - Math.max(0, -swing) * .25;
    joints.rightElbow.rotation.x = talking ? -.58 - Math.sin(time * 1.3 + resident.phase) * .16 : -.15 - Math.max(0, swing) * .25;
    joints.rightArm.rotation.z = talking ? -.09 + Math.sin(time * .9 + resident.phase) * .035 : 0;
    joints.leftArm.rotation.z = 0;
    if (['reading', 'working', 'waiting-transit', 'shopping'].includes(resident.state)) {
      joints.leftArm.rotation.x = -.24; joints.leftElbow.rotation.x = -1.10;
      joints.rightElbow.rotation.x = resident.state === 'reading' ? -.82 : -.45;
    } else if (resident.state === 'photographing') {
      joints.leftArm.rotation.x = -.50; joints.rightArm.rotation.x = -.46;
      joints.leftElbow.rotation.x = -1.74; joints.rightElbow.rotation.x = -1.64;
    } else if (resident.state === 'refreshments') {
      joints.leftArm.rotation.x = -.18; joints.leftElbow.rotation.x = -1.35 + Math.sin(time * .55 + resident.phase) * .30;
    } else if (resident.state === 'stretching') {
      joints.leftArm.rotation.z = .60 + Math.sin(time * .65 + resident.phase) * .30;
      joints.rightArm.rotation.z = -joints.leftArm.rotation.z;
    } else if (walking && ['book', 'parcel'].includes(resident.identity.prop)) {
      joints.leftArm.rotation.x = -.12; joints.leftElbow.rotation.x = -.72;
    }
    model.position.set(resident.x, groundHeightAt(resident.x, resident.z) + Math.sin(resident.phase * 2) * resident.gait * .012, resident.z);
    model.rotation.set(resident.identity.age === 'elder' ? .025 : 0, resident.yaw,
      Math.sin(walking ? resident.phase : time * 1.7 + resident.phase) * (walking ? .012 : .0025));
    model.userData.setDetail(nearDistance < 18 ? 0 : nearDistance < 52 ? 1 : 2);
    model.userData.updateCitizenProps(resident.state, nearDistance);
  }

  function chooseDestination(resident, hour, advance = false) {
    if (advance) resident.cycle++;
    resident.routine = citizenRoutine(resident.identity, hour, resident.cycle);
    let destination = resident.routine.waypoint * resident.route.length;
    if (resident.stop) {
      resident.routine.activity = 'waiting-transit'; resident.routine.purpose = `在${resident.stop.name}停靠湾查看线路、等同行的人`;
      destination = resident.cycle % 2 ? (resident.identity.seed % 2 ? 5 : 21) : 13 + (resident.cycle % 3 - 1) * 1.6;
    } else if (resident.social && resident.cycle % 3 === 0) {
      destination = resident.route.lengths[0] - 11 + (resident.person - 3) * 1.7;
      resident.routine.activity = 'talking'; resident.routine.purpose = '与街坊在楼前碰面';
    } else {
      // Short errands have visible beginnings and endings. A far scheduled
      // landmark is approached in 30–62 m street legs instead of making every
      // activity wait for a complete four-minute lap of a city block.
      const forwards = wrap(destination - resident.travel, resident.route.length);
      const backwards = resident.route.length - forwards;
      const leg = 30 + resident.identity.seed % 33;
      if (Math.min(forwards, backwards) > leg) destination = wrap(resident.travel + (forwards < backwards ? leg : -leg), resident.route.length);
    }
    // Activity anchors are sampled on the very same collision-tested pavement
    // loop as walking. Street furniture can displace a stop along that loop.
    for (let attempt = 0; attempt < 24; attempt++) {
      if (!blocked(samplePedestrianRoute(resident.route, destination))) break;
      destination = wrap(destination + 4, resident.route.length);
    }
    resident.destination = destination;
    const forwards = wrap(destination - resident.travel, resident.route.length);
    resident.direction = forwards <= resident.route.length / 2 ? 1 : -1;
    resident.pause = 0;
  }

  function update(dt, { position = lastPosition, hour = lastHour, paused = false, vehicles = [] } = {}) {
    if (released) return;
    dt = paused ? 0 : Math.max(0, Math.min(.1, Number.isFinite(dt) ? dt : 0));
    lastPosition = position; lastHour = hour; time += dt;
    // A pavement route never leaves its block. Its only possible neighbours
    // are the other four local residents, avoiding a city-wide map every frame.
    const crowded = (resident, point) => {
      for (const other of residentsByBlock[resident.block]) {
        if (other === resident) continue;
        const dx = point.x - other.x, dz = point.z - other.z;
        if (dx * dx + dz * dz < .85 * .85) return true;
      }
      return false;
    };
    for (const resident of residents) {
      if (dt === 0) continue;
      if (resident.routine.period !== citizenDayPeriod(hour)) chooseDestination(resident, hour);
      if (resident.interactionUntil > time) {
        resident.state = 'greeting';
        resident.yaw = turn(resident.yaw, Math.atan2(position.x - resident.x, position.z - resident.z), 1 - Math.exp(-dt * 5));
        continue;
      }
      resident.pause = Math.max(0, resident.pause - dt);
      if (resident.pause > 0) {
        if (resident.state === 'greeting') resident.state = resident.routine.activity;
        if (resident.state === 'talking') {
          const partner = residentsByBlock[resident.block].find(other => other !== resident && other.groupId === resident.groupId && distance(other, resident) < 3);
          if (partner) resident.homeYaw = Math.atan2(partner.x - resident.x, partner.z - resident.z);
          else resident.state = 'reading';
        }
        resident.yaw = turn(resident.yaw, resident.homeYaw, 1 - Math.exp(-dt * 3));
        continue;
      }
      if (resident.state !== 'walking' && resident.state !== 'waiting') chooseDestination(resident, hour, true);
      const pace = resident.speed * resident.routine.pace;
      const remaining = wrap((resident.destination - resident.travel) * resident.direction, resident.route.length);
      const arrived = remaining <= dt * pace + .02;
      const travel = arrived ? resident.destination : wrap(resident.travel + dt * pace * resident.direction, resident.route.length);
      const point = samplePedestrianRoute(resident.route, travel, resident.direction);
      if (blocked(point, vehicles) || crowded(resident, point)) {
        resident.state = 'waiting'; resident.blockedFor += dt;
        if (resident.blockedFor > 3.5) { resident.direction *= -1; resident.blockedFor = 0; }
        continue;
      }
      resident.blockedFor = 0; resident.state = 'walking'; resident.travel = travel;
      resident.x = point.x; resident.z = point.z;
      resident.yaw = turn(resident.yaw, point.yaw, 1 - Math.exp(-dt * 6));
      resident.phase += dt * pace * 6.8;
      if (arrived) {
        resident.pause = resident.routine.dwell; resident.state = resident.routine.activity;
        resident.homeYaw = Math.atan2(resident.building.x - resident.x, resident.building.z - resident.z);
        // A conversation needs a nearby person. Reading is an honest fallback
        // when a partner has already continued their day.
        const partner = residentsByBlock[resident.block].find(other => other !== resident && distance(other, resident) < 3);
        if (resident.state === 'talking') {
          if (partner) resident.homeYaw = Math.atan2(partner.x - resident.x, partner.z - resident.z);
          else resident.state = 'reading';
        }
      }
    }
    if (dt > 0 || !collisionIndexReady) rebuildCollisionIndex();
    candidates.length = 0; near.length = 0; active.clear();
    for (const resident of residents) {
      const dx = resident.x - position.x, dz = resident.z - position.z, d2 = dx * dx + dz * dz;
      if (d2 > PEOPLE_BUDGET.distantDistance ** 2) continue;
      resident.view.distance = Math.sqrt(d2); candidates.push(resident.view);
    }
    candidates.sort((a, b) => a.distance - b.distance);
    for (const item of candidates) {
      if (item.distance >= PEOPLE_BUDGET.detailedDistance || near.length >= PEOPLE_BUDGET.detailed) break;
      near.push(item); active.add(item.resident.id);
    }
    for (const id of models.keys()) if (!active.has(id)) release(id);
    let spawned = 0;
    for (const item of near) {
      let model = models.get(item.resident.id);
      if (!model && spawned < PEOPLE_BUDGET.spawnPerFrame) { model = materialize(item.resident); spawned++; }
      if (model) animate(model, item.resident, dt, item.distance);
    }
    visibleFar = 0;
    for (const { resident } of candidates) {
      if (models.has(resident.id) || visibleFar === PEOPLE_BUDGET.distant) continue;
      marker.position.set(resident.x, groundHeightAt(resident.x, resident.z), resident.z);
      marker.rotation.set(0, resident.yaw, resident.state === 'walking' ? Math.sin(resident.phase) * .02 : 0);
      marker.scale.set(resident.height * resident.identity.build, resident.height, resident.height); marker.updateMatrix(); distant.setMatrixAt(visibleFar, marker.matrix);
      color.set(CHARACTER_STYLES[resident.style].jacket).lerp(distantTint, .55);
      distant.setColorAt(visibleFar, color); visibleFar++;
    }
    distant.count = visibleFar; distant.instanceMatrix.needsUpdate = true;
    if (distant.instanceColor) distant.instanceColor.needsUpdate = true;
  }

  function nearest(player) {
    if (!player || Math.abs((player.y || 0) + (player.groundY || 0) - groundHeightAt(player.x, player.z)) > 2.5) return null;
    let result = null, range = 3.2;
    for (const resident of residents) {
      const d = distance(resident, player);
      if (d < range) { result = resident; range = d; }
    }
    return result;
  }
  function getPrompt(player) {
    const resident = nearest(player);
    return resident ? `与${resident.identity.name} · ${resident.identity.role}交谈` : null;
  }
  function interact(player) {
    const resident = nearest(player); if (!resident) return null;
    resident.interactionUntil = time + 7;
    const building = resident.building;
    return { type: 'conversation', id: resident.id, name: `${resident.identity.name} · ${resident.identity.role}`,
      message: citizenDialogue(resident, lastHour, resident.dialogue++), buildingId: building.id,
      role: resident.identity.role, district: resident.identity.districtName, purpose: resident.routine.purpose,
      target: { x: building.entrance?.x ?? building.x, z: building.entrance?.z ?? building.z } };
  }
  function snapshot() {
    return { logical: residents.length, detailed: models.size, distant: visibleFar, pooled: pool.length,
      conversations: new Set(residents.filter(person => person.social).map(person => person.groupId)).size,
      styles: new Set(residents.map(person => CHARACTER_STYLES[person.style].id)).size,
      identities: new Set(residents.map(person => person.identity.name)).size,
      activities: Object.fromEntries(Object.keys(CITIZEN_ACTIVITY_LABELS).map(state => [state, residents.filter(person => person.state === state).length])),
      time, people: residents.map(person => ({ id: person.id, x: person.x, z: person.z, yaw: person.yaw,
        state: person.state, style: CHARACTER_STYLES[person.style].id, groupId: person.groupId, buildingId: person.building.id,
        name: person.identity.name, role: person.identity.role, district: person.identity.districtName,
        purpose: person.routine.purpose, event: person.routine.event, period: person.routine.period,
        activity: CITIZEN_ACTIVITY_LABELS[person.state], cycle: person.cycle, destination: person.destination,
        streetStop: person.stop?.id || null,
        materialized: models.has(person.id) })) };
  }
  function rebuildCollisionIndex() {
    for (const bucket of collisionGrid.values()) { bucket.length = 0; collisionBucketPool.push(bucket); }
    collisionGrid.clear();
    for (const resident of residents) {
      const body = resident.collisionBody;
      body.x = resident.x; body.z = resident.z; body.groundY = groundHeightAt(resident.x, resident.z);
      const key = `${Math.floor(body.x / collisionCellSize)}:${Math.floor(body.z / collisionCellSize)}`;
      let bucket = collisionGrid.get(key);
      if (!bucket) { bucket = collisionBucketPool.pop() || []; collisionGrid.set(key, bucket); }
      bucket.push(body);
    }
    collisionIndexReady = true;
  }
  function getCollisionBodies(position = lastPosition, radius = 100) {
    if (released) return [];
    if (!collisionIndexReady) rebuildCollisionIndex();
    // Each car requests a small local region on every physics step. Reusing
    // body records and querying 16 m cells avoids 33 × 240 full-city scans.
    const bodies = [], x0 = Math.floor((position.x - radius) / collisionCellSize), x1 = Math.floor((position.x + radius) / collisionCellSize);
    const z0 = Math.floor((position.z - radius) / collisionCellSize), z1 = Math.floor((position.z + radius) / collisionCellSize);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const bucket = collisionGrid.get(`${x}:${z}`); if (!bucket) continue;
      for (const body of bucket) {
        const dx = body.x - position.x, dz = body.z - position.z;
        if (dx * dx + dz * dz < radius * radius) bodies.push(body);
      }
    }
    return bodies;
  }
  function dispose() {
    if (released) return;
    released = true; scene.remove(root); root.clear(); models.clear(); pool.length = 0;
    distant.dispose(); farGeometry.dispose(); farMaterial.dispose();
    collisionGrid.clear(); collisionBucketPool.length = 0; candidates.length = 0; near.length = 0; active.clear();
  }
  return { root, routes, update, snapshot, getPrompt, interact, getCollisionBodies, dispose };
}

/** Low-polygon, properly proportioned silhouettes are merged once, then drawn
 * through one instanced batch. Near people retain all eight articulated joints. */
function makeDistantGeometry(THREE) {
  const positions = [], normals = [], colors = [];
  const parts = [
    [0, 1.155, 0, .207, .28, .115, '#b9b8b3'],
    [0, 1.64, 0, .111, .14, .103, '#d7baa0'],
    [-.103, .49, 0, .07, .46, .072, '#4d5255'], [.103, .49, 0, .07, .46, .072, '#4d5255'],
    [-.259, 1.08, 0, .054, .27, .057, '#b2b2ae'], [.259, 1.08, 0, .054, .27, .057, '#b2b2ae'],
    [0, 1.735, -.014, .11, .053, .10, '#34302b'],
  ];
  for (const [x, y, z, sx, sy, sz, tint] of parts) {
    const indexed = new THREE.SphereGeometry(1, 6, 4); indexed.scale(sx, sy, sz); indexed.translate(x, y, z);
    const geometry = indexed.toNonIndexed(), position = geometry.attributes.position, normal = geometry.attributes.normal;
    const color = new THREE.Color(tint);
    for (let i = 0; i < position.count; i++) {
      positions.push(position.getX(i), position.getY(i), position.getZ(i));
      normals.push(normal.getX(i), normal.getY(i), normal.getZ(i)); colors.push(color.r, color.g, color.b);
    }
    geometry.dispose(); indexed.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeBoundingSphere(); return geometry;
}
