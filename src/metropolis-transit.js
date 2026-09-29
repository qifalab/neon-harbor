/**
 * Clock-driven public transport. Timetables, boarding and passenger height live
 * here rather than in the street simulation: a metro platform is below street
 * level and must never inherit the surface world's ground-height sampler.
 */
const TAU = Math.PI * 2;
const point = (x, z, y = 0) => ({ x, y, z });
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const wrap = (n, limit) => ((n % limit) + limit) % limit;
const cleanPosition = player => player.position || player;

export const TRANSIT_STOPS = Object.freeze([
  { id: 'metro-old', routeId: 'metro', name: '旧城 · 海港广场', entrance: point(16, 250), platform: point(16, 250, -14), berth: point(23, 250, -14.7), kind: 'metro' },
  { id: 'metro-quay', routeId: 'metro', name: '北岸 · 滨海中心', entrance: point(20, -430), platform: point(20, -430, -14), berth: point(27, -430, -14.7), kind: 'metro' },
  { id: 'metro-central', routeId: 'metro', name: '北岸 · 中央公园', entrance: point(20, -850), platform: point(20, -850, -14), berth: point(27, -850, -14.7), kind: 'metro' },
  { id: 'light-quay', routeId: 'light-rail', name: '东岸 · 海滨', entrance: point(660, -560), platform: point(660, -560, 9), berth: point(667, -560, 8.3), kind: 'light-rail' },
  { id: 'light-central', routeId: 'light-rail', name: '东岸 · 科技园', entrance: point(660, -900), platform: point(660, -900, 9), berth: point(667, -900, 8.3), kind: 'light-rail' },
  { id: 'light-hills', routeId: 'light-rail', name: '东岸 · 山海公园', entrance: point(660, -1180), platform: point(660, -1180, 9), berth: point(667, -1180, 8.3), kind: 'light-rail' },
  { id: 'hsr-north', routeId: 'high-speed', name: '北岸 · 城际总站', entrance: point(-672, -1160), platform: point(-690, -1160, 13), berth: point(-699, -1160, 12.3), kind: 'high-speed' },
  { id: 'hsr-old', routeId: 'high-speed', name: '旧城 · 西港站', entrance: point(-276, 180), platform: point(-317, 180, 13), berth: point(-308, 180, 12.3), kind: 'high-speed' },
  { id: 'ferry-south', routeId: 'ferry', name: '旧城 · 天星码头', entrance: point(-160, -282), platform: point(-160, -307, 0.7), berth: point(-160, -320, -0.15), kind: 'ferry' },
  { id: 'ferry-north', routeId: 'ferry', name: '北岸 · 维湾码头', entrance: point(-160, -402), platform: point(-160, -389, 0.7), berth: point(-160, -377, -0.15), kind: 'ferry' },
].map(stop => Object.freeze(stop)));

const stopById = new Map(TRANSIT_STOPS.map(stop => [stop.id, stop]));
const atStop = id => ({ ...stopById.get(id).berth, stopId: id });
export const TRANSIT_ROUTES = Object.freeze([
  { id: 'metro', name: 'M1 · 港湾地铁', color: '#48c5cb', speed: 52, dwell: 9, vehicleLength: 31, deckHeight: 0.8,
    stops: ['metro-old', 'metro-quay', 'metro-central'], nodes: [atStop('metro-old'), atStop('metro-quay'), atStop('metro-central'), point(27, -940, -14.7), point(-3, -965, -14.7), point(-14, -940, -14.7), point(-14, 295, -14.7), point(4, 317, -14.7), point(23, 295, -14.7)] },
  { id: 'light-rail', name: 'L2 · 东岸轻轨', color: '#de965a', speed: 34, dwell: 8, vehicleLength: 20, deckHeight: 0.8,
    stops: ['light-quay', 'light-central', 'light-hills'], nodes: [atStop('light-quay'), atStop('light-central'), atStop('light-hills'), point(667, -1290, 8.3), point(687, -1310, 8.3), point(707, -1290, 8.3), point(707, -475, 8.3), point(687, -455, 8.3), point(667, -475, 8.3)] },
  { id: 'high-speed', name: 'H3 · 山海城际', color: '#96b8ed', speed: 90, dwell: 10, vehicleLength: 44, deckHeight: 0.8,
    stops: ['hsr-north', 'hsr-old'], nodes: [atStop('hsr-north'), point(-699, -440, 12.3), point(-308, -340, 12.3), atStop('hsr-old'), point(-308, 225, 12.3), point(-350, 250, 12.3), point(-730, 250, 12.3), point(-752, 220, 12.3), point(-752, -1255, 12.3), point(-726, -1280, 12.3), point(-699, -1255, 12.3)] },
  { id: 'ferry', name: 'F4 · 维湾渡轮', color: '#77bda2', speed: 8.5, dwell: 10, vehicleLength: 18, deckHeight: 1.43,
    stops: ['ferry-south', 'ferry-north'], nodes: [atStop('ferry-south'), point(-130, -320, -0.15), point(-110, -335, -0.15), point(-110, -363, -0.15), point(-130, -377, -0.15), atStop('ferry-north'), point(-198, -377, -0.15), point(-218, -363, -0.15), point(-218, -335, -0.15), point(-198, -320, -0.15)] },
].map(route => Object.freeze(route)));

/** Round non-station bends while retaining exact berths for doors/gangways. */
function roundedPath(nodes) {
  const result = [];
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[wrap(i - 1, nodes.length)], b = nodes[i], c = nodes[(i + 1) % nodes.length];
    if (b.stopId) { result.push({ ...b }); continue; }
    const radius = Math.min(18, distance(a, b) * 0.25, distance(b, c) * 0.25);
    const mix = (p, q, t) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, z: p.z + (q.z - p.z) * t });
    const before = mix(b, a, radius / distance(a, b)), after = mix(b, c, radius / distance(b, c));
    for (let j = 0; j <= 8; j++) {
      const t = j / 8, left = mix(before, b, t), right = mix(b, after, t);
      result.push(mix(left, right, t));
    }
  }
  return result;
}

function makeTimetable(route) {
  const path = roundedPath(route.nodes), pieces = [], arrivals = [];
  let duration = 0;
  for (let i = 0; i < path.length; i++) {
    const from = path[i], to = path[(i + 1) % path.length];
    const yaw = Math.atan2(to.x - from.x, to.z - from.z);
    if (from.stopId) {
      arrivals.push({ stopId: from.stopId, time: duration });
      pieces.push({ from, to: from, yaw, start: duration, end: duration + route.dwell, stopId: from.stopId });
      duration += route.dwell;
    }
    // Slow down through every tight bend; station arrival/departure has a
    // cosine easing curve so boarding never coincides with a moving train.
    const length = distance(from, to);
    const speed = length < 12 ? Math.min(route.speed, route.id === 'ferry' ? 5 : 17) : route.speed;
    const seconds = Math.max(0.03, length / speed * (from.stopId || to.stopId ? 1.3 : 1));
    pieces.push({ from, to, yaw, start: duration, end: duration + seconds, ease: !!(from.stopId || to.stopId) });
    duration += seconds;
  }
  // Every station begins with a visible vehicle. Fill gaps between these
  // services to guarantee a maximum platform wait below 25 seconds.
  const offsets = arrivals.map(a => a.time).sort((a, b) => a - b);
  const base = [...offsets];
  for (let i = 0; i < base.length; i++) {
    const end = i + 1 < base.length ? base[i + 1] : base[0] + duration;
    const gap = end - base[i], count = Math.ceil(gap / 23);
    for (let j = 1; j < count; j++) offsets.push(wrap(base[i] + gap * j / count, duration));
  }
  return { ...route, path, pieces, arrivals, duration, offsets: offsets.sort((a, b) => a - b) };
}

function poseAt(route, time) {
  const t = wrap(time, route.duration);
  const segment = route.pieces.find(piece => t < piece.end) || route.pieces[route.pieces.length - 1];
  let f = Math.max(0, Math.min(1, (t - segment.start) / (segment.end - segment.start)));
  if (segment.ease) f = (1 - Math.cos(f * Math.PI)) / 2;
  return {
    x: segment.from.x + (segment.to.x - segment.from.x) * f,
    y: segment.from.y + (segment.to.y - segment.from.y) * f,
    z: segment.from.z + (segment.to.z - segment.from.z) * f,
    yaw: segment.yaw, stopId: segment.stopId || null, doorsOpen: !!segment.stopId,
    remaining: segment.end - t,
  };
}

const collider = (id, x, z, hx, hz, minY, maxY, kind = 'transit-barrier') => ({ id, kind, x, z, hx, hz, minY, maxY, physics: true, camera: true });

/** Public, renderer-independent state machine used by the game and tests. */
export class TransitService {
  constructor({ onMessage = null } = {}) {
    this.time = 0;
    this.routes = TRANSIT_ROUTES.map(makeTimetable);
    this.stops = TRANSIT_STOPS.map(stop => {
      const isFerry = stop.kind === 'ferry', northFerry = stop.id === 'ferry-north';
      const board = isFerry ? point(stop.platform.x, stop.platform.z + (northFerry ? 3 : -3), stop.platform.y) : { ...stop.platform };
      const exit = isFerry ? point(stop.platform.x, stop.platform.z + (northFerry ? -5 : 8), stop.platform.y) : point(stop.platform.x, stop.platform.z + 21, stop.platform.y);
      const exitDirection = northFerry ? -1 : 1;
      const streetExit = { ...stop.entrance, z: stop.entrance.z + 3.5 * exitDirection, yaw: northFerry ? Math.PI : 0 };
      const p = stop.platform, hx = isFerry ? 13 : 4, hz = isFerry ? 10 : (stop.kind === 'high-speed' ? 33 : 27);
      const walls = [
        collider(`${stop.id}-end-north`, p.x, p.z - hz, hx, 0.18, p.y, p.y + 1.35),
        collider(`${stop.id}-end-south`, p.x, p.z + hz, hx, 0.18, p.y, p.y + 1.35),
        collider(`${stop.id}-edge-west`, p.x - hx, p.z, 0.18, hz, p.y, p.y + 1.35),
        collider(`${stop.id}-edge-east`, p.x + hx, p.z, 0.18, hz, p.y, p.y + 1.35),
      ];
      const cameraOnly = (id, x, z, width, depth, low, high) => ({ ...collider(id, x, z, width, depth, low, high, 'transit-camera'), physics: false });
      if (stop.kind === 'metro') {
        walls.push(cameraOnly(`${stop.id}-roof`, p.x + 2, p.z, 11, hz + 4, p.y + 4.175, p.y + 4.825));
        walls.push(cameraOnly(`${stop.id}-back-wall`, p.x - 7.5, p.z, 0.35, hz + 4, p.y, p.y + 4.2));
        walls.push(cameraOnly(`${stop.id}-track-wall`, p.x + 12, p.z, 0.35, hz + 4, p.y, p.y + 4.2));
      } else if (!isFerry) {
        walls.push(cameraOnly(`${stop.id}-canopy`, p.x, p.z, 5, hz + 2, p.y + 4.4, p.y + 4.75));
      } else {
        const side = northFerry ? 1 : -1;
        walls.push(cameraOnly(`${stop.id}-canopy`, p.x, p.z - side * 3, 8.5, 4, p.y + 3.15, p.y + 3.35));
      }
      return { ...stop, board, exit, streetExit, halfWidth: hx, halfLength: hz, colliders: walls };
    });
    this.vehicles = this.routes.flatMap(route => route.offsets.map((offset, index) => ({ id: `${route.id}-${index + 1}`, routeId: route.id, offset, pose: poseAt(route, offset) })));
    this.activeStopId = null;
    this.ridingVehicleId = null;
    this.boardedStopId = null;
    this.ridingColliders = this.stops.flatMap(stop => stop.colliders.filter(c => c.physics === false));
    this.onMessage = onMessage;
  }
  route(id) { return this.routes.find(route => route.id === id); }
  stop(id) { return this.stops.find(stop => stop.id === id); }
  get riding() { return !!this.ridingVehicleId; }
  get boardingState() { return this.riding ? 'riding' : this.activeStopId ? 'platform' : 'street'; }
  get passengerPose() {
    const vehicle = this.vehicles.find(v => v.id === this.ridingVehicleId);
    if (!vehicle) return null;
    const deck = this.route(vehicle.routeId).deckHeight;
    // Stand on the open forward deck of ferries and beside the main carriage
    // window on rail services; the camera can see the city through the glass.
    const offset = vehicle.routeId === 'ferry' ? 0 : -0.65;
    const longitudinal = vehicle.routeId === 'ferry' ? 7.2 : vehicle.routeId === 'high-speed' ? 0 : 3;
    return { x: vehicle.pose.x + Math.cos(vehicle.pose.yaw) * offset + Math.sin(vehicle.pose.yaw) * longitudinal, y: vehicle.pose.y + deck,
      z: vehicle.pose.z - Math.sin(vehicle.pose.yaw) * offset + Math.cos(vehicle.pose.yaw) * longitudinal, yaw: vehicle.pose.yaw };
  }
  collisionContext() {
    if (this.riding) {
      const groundY = this.passengerPose.y;
      return { id: 'transit-riding', groundY, colliders: this.ridingColliders, groundHeightAt: () => groundY };
    }
    const stop = this.stop(this.activeStopId);
    if (!stop) return null;
    const groundY = stop.platform.y;
    return { id: stop.id, groundY, colliders: stop.colliders, groundHeightAt: () => groundY };
  }
  platformTransition(stop, position = stop.exit) {
    const context = this.collisionContext();
    return { position: { ...position, yaw: Math.PI }, ...context };
  }
  nextArrival(stopId) {
    const stop = this.stop(stopId);
    if (!stop) return null;
    const route = this.route(stop.routeId), arrival = route.arrivals.find(a => a.stopId === stopId);
    let seconds = Infinity;
    for (const vehicle of this.vehicles.filter(v => v.routeId === route.id)) {
      if (vehicle.pose.stopId === stopId) return 0;
      seconds = Math.min(seconds, wrap(arrival.time - this.time - vehicle.offset, route.duration));
    }
    return Math.max(0, seconds);
  }
  getPrompt(player) {
    const position = cleanPosition(player);
    if (this.riding) {
      const vehicle = this.vehicles.find(v => v.id === this.ridingVehicleId);
      return vehicle.pose.stopId ? `E 下车 · ${this.stop(vehicle.pose.stopId).name}（停靠 ${Math.ceil(vehicle.pose.remaining)} 秒）` : `${this.route(vehicle.routeId).name} 行驶中 · 到站后按 E 下车`;
    }
    const stop = this.stop(this.activeStopId);
    if (stop) {
      if (distance(position, stop.exit) < 3.7) return `E 离开${stop.kind === 'ferry' ? '码头' : '站台'} · 返回 ${stop.name}`;
      const away = distance(position, stop.board);
      if (away > 6) return `前往${stop.kind === 'ferry' ? '登船' : '候车'}区 ${Math.ceil(away)} 米 · ${this.route(stop.routeId).name}`;
      const vehicle = this.vehicles.find(v => v.pose.stopId === stop.id && v.routeId === stop.routeId);
      return vehicle ? `E ${stop.kind === 'ferry' ? '登船' : '上车'} · ${this.route(stop.routeId).name}（${Math.ceil(vehicle.pose.remaining)} 秒后出发）` : `${this.route(stop.routeId).name} · 下一班 ${Math.ceil(this.nextArrival(stop.id))} 秒`;
    }
    const entrance = this.stops.find(s => distance(position, s.entrance) < 5.3 && Math.abs((position.y || 0) - s.entrance.y) < 3);
    return entrance ? `E 进入 ${entrance.name} · ${this.route(entrance.routeId).name}` : null;
  }
  interact(player) {
    const position = cleanPosition(player);
    if (this.riding) {
      const vehicle = this.vehicles.find(v => v.id === this.ridingVehicleId);
      if (!vehicle.pose.stopId) return { handled: true, message: '正在行驶，请等到站后再下车。' };
      const stop = this.stop(vehicle.pose.stopId);
      this.ridingVehicleId = null;
      this.activeStopId = stop.id;
      return { handled: true, transition: this.platformTransition(stop, stop.board), message: `已到达 ${stop.name}。前往出口返回街道。` };
    }
    const active = this.stop(this.activeStopId);
    if (active) {
      if (distance(position, active.exit) < 3.7) {
        this.activeStopId = null;
        const exit = { ...active.streetExit };
        return { handled: true, transition: { position: exit, groundY: 0, colliders: null, groundHeightAt: null, id: 'street' }, message: `${active.name} · 已返回街道` };
      }
      if (distance(position, active.board) > 6) return { handled: true, message: '沿地面标记前往候车区。' };
      const vehicle = this.vehicles.find(v => v.pose.stopId === active.id && v.routeId === active.routeId && v.pose.remaining > 0.7);
      if (!vehicle) return { handled: true, message: `下一班还有 ${Math.ceil(this.nextArrival(active.id))} 秒。` };
      this.ridingVehicleId = vehicle.id;
      this.boardedStopId = active.id;
      this.activeStopId = null;
      return { handled: true, transition: { position: this.passengerPose, ...this.collisionContext() }, message: `已乘坐 ${this.route(vehicle.routeId).name}，到站后按 E 下车。` };
    }
    const entrance = this.stops.find(s => distance(position, s.entrance) < 5.3 && Math.abs((position.y || 0) - s.entrance.y) < 3);
    if (!entrance) return { handled: false };
    this.activeStopId = entrance.id;
    // Arrival is offset from the exit button, making the boarding path the
    // first visible action and preventing an accidental double-E exit.
    const spawn = { ...entrance.board, z: entrance.board.z + (entrance.kind === 'ferry' ? 0 : 10) };
    return { handled: true, transition: this.platformTransition(entrance, spawn), message: `${entrance.name} · 按站台箭头前往候车区` };
  }
  update(dt) {
    if (Number.isFinite(dt) && dt > 0) this.time += dt;
    for (const vehicle of this.vehicles) vehicle.pose = poseAt(this.route(vehicle.routeId), this.time + vehicle.offset);
    return {}; // Riding updates are continuous poses, never teleport transitions.
  }
  /** Exit hooks let fast travel/load/reset restore street collision safely. */
  leave() {
    const vehicle = this.vehicles.find(v => v.id === this.ridingVehicleId);
    const stop = this.stop(this.activeStopId || vehicle?.pose.stopId || this.boardedStopId);
    this.activeStopId = null; this.ridingVehicleId = null; this.boardedStopId = null;
    return stop ? { handled: true, transition: { id: 'street', position: { ...stop.streetExit }, groundY: 0, colliders: null, groundHeightAt: null } } : { handled: false };
  }
  reset() { return this.leave(); }
  snapshot() {
    const vehicle = this.vehicles.find(v => v.id === this.ridingVehicleId);
    const stopId = this.activeStopId || vehicle?.pose.stopId || null;
    const route = vehicle ? this.route(vehicle.routeId) : this.stop(stopId) ? this.route(this.stop(stopId).routeId) : null;
    let secondsToArrival = 0, nextStopId = null;
    if (vehicle && !vehicle.pose.stopId) {
      const upcoming = route.arrivals.map(a => ({ id: a.stopId, seconds: wrap(a.time - this.time - vehicle.offset, route.duration) })).sort((a, b) => a.seconds - b.seconds)[0];
      secondsToArrival = upcoming.seconds; nextStopId = upcoming.id;
    } else if (this.activeStopId) secondsToArrival = this.nextArrival(this.activeStopId);
    const phase = vehicle ? vehicle.pose.stopId ? 'docked' : 'moving' : this.activeStopId ? 'waiting' : 'street';
    return { activeStation: stopId ? this.stop(stopId) : null, currentStopId: stopId, stationId: stopId, vehicleId: this.ridingVehicleId,
      boardedStopId: this.boardedStopId, phase, status: ({ docked: '到站停靠', moving: '行驶中', waiting: '站台候车', street: '街道' })[phase],
      label: route?.name || '', secondsToArrival, nextStopId, time: this.time, riding: this.riding, ridingVehicleId: this.ridingVehicleId, currentStop: this.activeStopId, boardingState: this.boardingState,
      passengerPose: this.passengerPose, routes: this.routes.map(route => ({ id: route.id, name: route.name, duration: route.duration, fleet: route.offsets.length })),
      stops: this.stops.map(stop => ({ id: stop.id, name: stop.name, routeId: stop.routeId, kind: stop.kind, entrance: { ...stop.entrance }, entry: { ...stop.entrance }, platform: { ...stop.platform }, board: { ...stop.board }, exit: { ...stop.exit }, streetExit: { ...stop.streetExit }, nextArrival: this.nextArrival(stop.id) })),
      vehicles: this.vehicles.map(vehicle => ({ id: vehicle.id, routeId: vehicle.routeId, ...vehicle.pose })) };
  }
}

/** Build the shared-material station/track batches and animated fleet. */
export function createTransitSystem(THREE, scene, options = {}) {
  const service = new TransitService(options), root = new THREE.Group(), staticRoot = new THREE.Group();
  root.name = 'Metropolis · public transport'; staticRoot.name = 'Stations, viaducts and rails'; root.add(staticRoot); scene.add(root);
  const colliders = [], materials = new Map(), batches = new Map(), boxGeometry = new THREE.BoxGeometry(1, 1, 1), dummy = new THREE.Object3D();
  const palette = { concrete: '#a29f94', floor: '#c8c9bd', dark: '#2f414b', glass: '#658794', silver: '#c9d2cf', brass: '#b99a63', stripe: '#e9c16c', white: '#e0e5dd', seat: '#426f72', wood: '#98785b', water: '#5d918d', rubber: '#212c31', red: '#f1756b', light: '#f8e6b3' };
  function material(key) {
    if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color: palette[key] || key,
      roughness: key === 'glass' ? 0.2 : key === 'silver' ? 0.35 : 0.8, metalness: ['silver', 'brass'].includes(key) ? 0.65 : 0.08,
      ...(key === 'light' ? { emissive: '#ffdc9c', emissiveIntensity: 0.75 } : {}),
      ...(key === 'glass' ? { transparent: true, opacity: 0.38, depthWrite: false } : {}) }));
    return materials.get(key);
  }
  function stamp(key, x, y, z, sx, sy, sz, yaw = 0) {
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push([x, y, z, sx, sy, sz, yaw]);
  }
  function obstacle(key, x, y, z, sx, sy, sz, id) {
    stamp(key, x, y, z, sx, sy, sz);
    colliders.push(collider(id || `transit-static-${colliders.length}`, x, z, sx / 2, sz / 2, y - sy / 2, y + sy / 2, 'transit-station'));
  }
  function sign(text, x, y, z, width, color, parent = staticRoot, yaw = 0, cameraId = null) {
    const height = width * 160 / 1024;
    if (cameraId) {
      // A sign is a real surface: raising it can still place it across the
      // chase-camera boom. Register its rendered extent before canvas setup
      // so browser and headless collision geometry remain identical.
      const c = Math.abs(Math.cos(yaw)), q = Math.abs(Math.sin(yaw));
      colliders.push({ ...collider(cameraId, x, z, width * c / 2 + 0.04 * q, width * q / 2 + 0.04 * c, y - height / 2, y + height / 2, 'transit-sign'), physics: false });
    }
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 160;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#132b35'; ctx.fillRect(0, 0, 1024, 160); ctx.fillStyle = color || '#78cfca'; ctx.fillRect(0, 0, 12, 160);
    ctx.fillStyle = '#f1f5ef'; ctx.font = '600 55px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 512, 80, 980);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width * 160 / 1024), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
    mesh.position.set(x, y, z); mesh.rotation.y = yaw; mesh.name = text; parent.add(mesh);
  }
  function railEdge(x, z, width, depth, y, key = 'silver') {
    // Open railings preserve the city/harbor views from raised platforms.
    stamp(key, x, y + 1.05, z, width, 0.075, depth);
    const length = Math.max(width, depth), alongX = width >= depth;
    for (let t = -length / 2; t <= length / 2 + 0.01; t += 2.3)
      stamp(key, x + (alongX ? t : 0), y + 0.52, z + (alongX ? 0 : t), 0.055, 1.04, 0.055);
  }
  const roadBelow = (x, z) => z < -390 && x > -710 && x < 710 && [-420, -560, -700, -840, -980, -1120, -1260].some(road => Math.abs(z - road) < 15);
  function station(stop) {
    const p = stop.platform, e = stop.entrance, route = service.route(stop.routeId), color = route.color;
    if (stop.kind === 'ferry') {
      const north = stop.id === 'ferry-north', side = north ? 1 : -1;
      obstacle('wood', p.x, p.y - 0.25, p.z, 26, 0.5, 20, `${stop.id}-pier-deck`);
      for (let x = -12; x <= 12; x += 0.6) stamp('dark', p.x + x, p.y + 0.012, p.z, 0.027, 0.024, 19.8);
      // Keep the atlas/save entrance on an actual street landing. Extending
      // the raised gangway past this point would embed arriving feet in wood.
      const towardPier = Math.sign(p.z - e.z);
      const streetEnd = e.z + towardPier * 1.5, pierEnd = p.z + towardPier;
      const mid = (streetEnd + pierEnd) / 2;
      obstacle('wood', p.x, 0.3, mid, 7, 0.5, Math.abs(pierEnd - streetEnd), `${stop.id}-access-walkway`);
      for (const dx of [-13, 13]) railEdge(p.x + dx, p.z, 0.06, 20, p.y);
      // A bright gangway identifies the exact boarding position.
      stamp('silver', p.x, p.y + 0.03, p.z + side * 10, 3.7, 0.1, 6);
      for (const dx of [-10, -5, 5, 10]) {
        stamp('dark', p.x + dx, -0.1, p.z + side * 7, 0.4, 3.3, 0.4);
        stamp('brass', p.x + dx, p.y + 0.22, p.z + side * 7, 0.48, 0.42, 0.48);
      }
      stamp('white', p.x, p.y + 3.25, p.z - side * 3, 17, 0.2, 8);
      for (const dx of [-7.5, 7.5]) for (const dz of [-3, 3]) stamp('dark', p.x + dx, p.y + 1.6, p.z - side * 3 + dz, 0.16, 3.2, 0.16);
      sign(`${stop.name}  F4 / FERRY`, p.x, p.y + 2.8, p.z - side * 6.8, 12, color);
      sign('E · 渡轮候船厅 / PIER', e.x, 4.2, e.z, 10, color, staticRoot, 0, `${stop.id}-entrance-sign`);
      for (const dx of [-4.6, 4.6]) obstacle('dark', e.x + dx, 2.1, e.z, 0.18, 4.2, 0.18, `${stop.id}-entrance-post-${dx}`);
      sign('E 登船 · BOARD', p.x, p.y + 1.7, p.z + side * 8, 5, color);
      sign('E 出口 / EXIT', stop.exit.x, p.y + 1.8, stop.exit.z + 0.3, 4.5, '#e9c16c');
      return;
    }
    // Compact street vestibules stay outside the road lanes. The elevator is
    // the explicit transition between street collision and platform collision.
    const vestibuleX = e.x + 4.2;
    obstacle('concrete', vestibuleX, 0.13, e.z, 5.2, 0.26, 7);
    obstacle('glass', vestibuleX - 2.5, 1.8, e.z, 0.14, 3.3, 7);
    obstacle('glass', vestibuleX + 2.5, 1.8, e.z, 0.14, 3.3, 7);
    obstacle('dark', vestibuleX, 3.55, e.z, 5.4, 0.25, 7.2);
    for (const dz of [-3.4, 3.4]) obstacle('silver', vestibuleX + 2.3, 1.75, e.z + dz, 0.2, 3.5, 0.2);
    stamp(color, vestibuleX, 2.8, e.z - 3.54, 4.8, 0.12, 0.06);
    sign(`${route.name} · E 进入`, e.x, 3.9, e.z + 0.2, 11.5, color);
    sign('LIFT / 无障碍电梯', vestibuleX, 2.85, e.z + 3.58, 4.6, color);
    const hx = stop.halfWidth, hz = stop.halfLength;
    stamp('floor', p.x, p.y - 0.32, p.z, hx * 2, 0.64, hz * 2);
    for (const dx of [-hx + 0.5, hx - 0.5]) stamp('stripe', p.x + dx, p.y + 0.025, p.z, 0.42, 0.05, hz * 2 - 2);
    for (let z = -hz + 2; z <= hz - 2; z += 1.6) for (const dx of [-hx + 0.5, hx - 0.5])
      stamp('brass', p.x + dx, p.y + 0.052, p.z + z, 0.44, 0.025, 0.08);
    for (const dz of [-hz, hz]) railEdge(p.x, p.z + dz, hx * 2, 0.05, p.y);
    const trainSide = Math.sign(stop.berth.x - p.x);
    railEdge(p.x - trainSide * hx, p.z, 0.05, hz * 2, p.y);
    // Platform screen doors have a clear opening at the boarding zone. The
    // invisible safety collider at that edge remains until E boards the train.
    for (const dz of [-hz / 2 - 3, hz / 2 + 3]) {
      stamp('glass', p.x + trainSide * hx, p.y + 0.9, p.z + dz, 0.1, 1.8, hz - 6);
      stamp('silver', p.x + trainSide * hx, p.y + 1.85, p.z + dz, 0.12, 0.1, hz - 6);
    }
    if (stop.kind === 'metro') {
      stamp('concrete', p.x + 2, p.y + 4.5, p.z, 22, 0.65, hz * 2 + 8);
      stamp('concrete', p.x - 7.5, p.y + 2.1, p.z, 0.7, 4.2, hz * 2 + 8);
      stamp('dark', p.x + 12, p.y + 2.1, p.z, 0.7, 4.2, hz * 2 + 8);
      for (let dz = -hz + 4; dz <= hz - 4; dz += 9) {
        stamp('light', p.x, p.y + 4.08, p.z + dz, 0.3, 0.06, 6);
        stamp(color, p.x - 7.1, p.y + 1.4, p.z + dz, 0.08, 0.22, 7);
      }
      const light = new THREE.PointLight('#c8f0ee', 32, 52, 1.2); light.position.set(p.x, p.y + 3.5, p.z); root.add(light);
    } else {
      stamp('white', p.x, p.y + 4.5, p.z, 10, 0.2, hz * 2 + 4);
      stamp('glass', p.x, p.y + 4.64, p.z, 5, 0.08, hz * 2);
      for (let dz = -hz + 5; dz <= hz - 4; dz += 11) {
        stamp('dark', p.x - trainSide * 3.4, p.y + 2.2, p.z + dz, 0.18, 4.4, 0.18);
        stamp('light', p.x, p.y + 4.35, p.z + dz, 6, 0.06, 0.14);
        if (!roadBelow(p.x, p.z + dz)) obstacle('concrete', p.x, (p.y - 0.6) / 2, p.z + dz, 1.2, p.y - 0.6, 1.2);
      }
      // Transparent lift shaft makes the elevated station connection legible.
      stamp('glass', vestibuleX, p.y / 2, e.z, 4.5, p.y, 5.4);
      stamp('silver', (vestibuleX + p.x) / 2, p.y - 0.2, e.z + 20, Math.abs(vestibuleX - p.x) + 3, 0.35, 4);
    }
    for (const dz of [-14, 12]) {
      stop.colliders.push(collider(`${stop.id}-bench-${dz}`, p.x - trainSide * 1.7, p.z + dz, 0.63, 1.7, p.y, p.y + 1.45, 'transit-bench'));
      stamp('wood', p.x - trainSide * 1.7, p.y + 0.48, p.z + dz, 1.1, 0.16, 3.4);
      stamp('wood', p.x - trainSide * 2.25, p.y + 0.95, p.z + dz, 0.12, 0.92, 3.4);
      for (const lz of [-1.2, 1.2]) stamp('dark', p.x - trainSide * 1.7, p.y + 0.21, p.z + dz + lz, 0.7, 0.42, 0.1);
    }
    sign(`${stop.name}   ${route.name}`, p.x - trainSide * 2.2, p.y + 2.8, p.z - 8, 9, color);
    sign('E 上车 / BOARD', p.x, p.y + 2.65, p.z, 4.8, color);
    sign('E 出口 / EXIT ↑', stop.exit.x, p.y + 2.7, stop.exit.z, 5, '#e9c16c');
    for (let dz = 3; dz <= 18; dz += 3) stamp(color, p.x, p.y + 0.04, p.z + dz, 0.4, 0.03, 0.9);
  }
  for (const stop of service.stops) station(stop);

  // One instanced rail/deck batch per material serves the entire network.
  for (const route of service.routes) {
    if (route.id === 'ferry') continue;
    for (let i = 0; i < route.path.length; i++) {
      const a = route.path[i], b = route.path[(i + 1) % route.path.length], length = distance(a, b);
      const yaw = Math.atan2(b.x - a.x, b.z - a.z), x = (a.x + b.x) / 2, z = (a.z + b.z) / 2, y = a.y;
      stamp(route.id === 'metro' ? 'dark' : 'concrete', x, y - 0.38, z, 5.3, 0.55, length + 0.2, yaw);
      for (const dx of [-0.82, 0.82]) stamp('silver', x + Math.cos(yaw) * dx, y + 0.03, z - Math.sin(yaw) * dx, 0.07, 0.12, length + 0.1, yaw);
      for (let d = 0; d < length; d += 2.8) {
        const t = d / length;
        stamp('wood', a.x + (b.x - a.x) * t, y - 0.06, a.z + (b.z - a.z) * t, 2.7, 0.14, 0.25, yaw);
      }
      if (route.id === 'metro') {
        // Continuous tunnel linings make the ride readable below the city.
        // Keep station ends open so the lining never crosses a platform.
        const trimA = a.stopId ? 35 : 0, trimB = b.stopId ? 35 : 0;
        const liningLength = length - trimA - trimB;
        if (liningLength > 0.1) {
          const t = (trimA + liningLength / 2) / length;
          const tx = a.x + (b.x - a.x) * t, tz = a.z + (b.z - a.z) * t;
          stamp('concrete', tx, y + 4.65, tz, 7, 0.4, liningLength + 0.2, yaw);
          for (const side of [-1, 1]) {
            stamp('concrete', tx + Math.cos(yaw) * side * 3.4, y + 2.15, tz - Math.sin(yaw) * side * 3.4, 0.28, 4.3, liningLength + 0.2, yaw);
            stamp(route.color, tx + Math.cos(yaw) * side * 3.22, y + 1.15, tz - Math.sin(yaw) * side * 3.22, 0.06, 0.12, liningLength + 0.2, yaw);
          }
          for (let d = trimA + 4; d < length - trimB; d += 18) {
            const q = d / length;
            stamp('light', a.x + (b.x - a.x) * q, y + 4.41, a.z + (b.z - a.z) * q, 2.8, 0.065, 0.25, yaw);
          }
        }
      }
      if (route.id !== 'metro' && length > 20) for (let d = 14; d < length; d += 42) {
        const t = d / length, px = a.x + (b.x - a.x) * t, pz = a.z + (b.z - a.z) * t;
        if (!roadBelow(px, pz)) obstacle('concrete', px, (y - 0.8) / 2, pz, 1.35, y - 0.8, 1.35);
        stamp('silver', px + Math.cos(yaw) * 2.25, y + 2.8, pz - Math.sin(yaw) * 2.25, 0.13, 5.5, 0.13);
        stamp('silver', px, y + 5.4, pz, 4.6, 0.11, 0.11, yaw);
      }
      if (route.id !== 'metro') stamp('dark', x, y + 5.25, z, 0.025, 0.025, length + 0.2, yaw);
    }
  }
  for (const [key, rows] of batches) {
    const mesh = new THREE.InstancedMesh(boxGeometry, material(key), rows.length); mesh.name = `Transit static · ${key}`;
    rows.forEach(([x, y, z, sx, sy, sz, yaw], index) => { dummy.position.set(x, y, z); dummy.rotation.set(0, yaw, 0); dummy.scale.set(sx, sy, sz); dummy.updateMatrix(); mesh.setMatrixAt(index, dummy.matrix); });
    mesh.castShadow = !['glass', 'light'].includes(key); mesh.receiveShadow = true; mesh.computeBoundingSphere(); staticRoot.add(mesh);
  }
  const fleet = new Map();
  const wheelGeometry = new THREE.CylinderGeometry(0.34, 0.34, 0.18, 10);
  const buoyGeometry = new THREE.TorusGeometry(0.34, 0.095, 6, 16);
  function meshBox(parent, key, x, y, z, sx, sy, sz) {
    const mesh = new THREE.Mesh(boxGeometry, material(key)); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); mesh.castShadow = key !== 'glass'; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function buildRailVehicle(route) {
    const group = new THREE.Group(), doors = [];
    const cars = route.id === 'high-speed' ? 3 : 2, carLength = route.vehicleLength / cars - 0.8;
    for (let index = 0; index < cars; index++) {
      const cz = (index - (cars - 1) / 2) * (carLength + 0.8), half = carLength / 2;
      meshBox(group, 'silver', 0, 0.58, cz, 3.1, 0.4, carLength);
      meshBox(group, 'white', 0, 3.0, cz, 3.2, 0.24, carLength);
      meshBox(group, 'dark', 0, 0.29, cz, 2.75, 0.3, carLength - 1.6);
      for (const side of [-1, 1]) {
        meshBox(group, route.color, side * 1.56, 1.05, cz, 0.1, 0.44, carLength);
        meshBox(group, 'silver', side * 1.56, 2.72, cz, 0.1, 0.38, carLength);
        for (let wz = -half + 1.2; wz <= half - 1; wz += 1.65) {
          meshBox(group, 'glass', side * 1.56, 1.94, cz + wz, 0.06, 1.1, 1.46);
          meshBox(group, 'dark', side * 1.59, 1.95, cz + wz + 0.77, 0.08, 1.25, 0.08);
          meshBox(group, 'seat', side * 0.98, 1.02, cz + wz, 0.62, 0.16, 1.35);
          meshBox(group, 'seat', side * 1.22, 1.33, cz + wz, 0.1, 0.64, 1.35);
        }
        for (const dz of [-half + 2.8, half - 2.8]) {
          const door = meshBox(group, 'silver', side * 1.62, 1.74, cz + dz, 0.065, 2.05, 1.05);
          const window = meshBox(door, 'glass', 0, 0.13, 0, 1.08, 0.46, 0.76);
          window.castShadow = false;
          doors.push({ mesh: door, z: cz + dz, side: Math.sign(dz) });
          meshBox(group, 'brass', side * 0.6, 1.92, cz + dz, 0.035, 2.15, 0.035);
        }
      }
      for (const z of [-half + 2, half - 2]) for (const side of [-1, 1]) {
        const wheel = new THREE.Mesh(wheelGeometry, material('rubber'));
        wheel.rotation.z = Math.PI / 2; wheel.position.set(side * 1.25, 0.3, cz + z); group.add(wheel);
      }
      meshBox(group, 'silver', 0, 3.26, cz, 2.0, 0.26, carLength * 0.3);
      for (const z of [-half, half]) {
        meshBox(group, 'glass', 0, 1.99, cz + z, 2.76, 1.4, 0.075);
        meshBox(group, 'white', 0, 1.02, cz + z, 3.05, 0.65, 0.16);
        for (const side of [-1, 1]) meshBox(group, 'light', side * 1.0, 1.16, cz + z + Math.sign(z) * 0.09, 0.38, 0.15, 0.035);
      }
      meshBox(group, 'light', 0, 2.81, cz, 0.26, 0.04, carLength - 2);
      meshBox(group, 'brass', 0, 2.6, cz, 0.035, 0.035, carLength - 1);
    }
    group.userData.doors = doors;
    return group;
  }
  function buildFerry() {
    const group = new THREE.Group();
    meshBox(group, '#395b65', 0, 0.26, 0, 6.6, 1.5, 17.5);
    meshBox(group, 'white', 0, 0.95, 0, 7.0, 0.32, 18.2);
    meshBox(group, 'wood', 0, 1.31, 0, 6.7, 0.15, 17.6);
    meshBox(group, '#77bda2', 0, 2.2, 0, 4.6, 1.7, 9.8);
    for (const side of [-1, 1]) {
      for (let z = -4; z <= 4; z += 1.5) meshBox(group, 'glass', side * 2.34, 2.35, z, 0.06, 1.1, 1.3);
      meshBox(group, 'silver', side * 3.2, 2.1, 0, 0.065, 0.065, 17.3);
      for (let z = -8; z <= 8; z += 1.6) meshBox(group, 'silver', side * 3.2, 1.71, z, 0.045, 0.8, 0.045);
      for (const z of [-6, 6]) {
        meshBox(group, 'wood', side * 1.55, 1.85, z, 2.3, 0.16, 0.7);
        meshBox(group, 'wood', side * 1.55, 2.13, z - 0.3, 2.3, 0.55, 0.09);
      }
      for (const z of [-6.7, 0, 6.7]) {
        const buoy = new THREE.Mesh(buoyGeometry, material('red'));
        buoy.rotation.y = Math.PI / 2; buoy.position.set(side * 3.3, 1.72, z); group.add(buoy);
      }
    }
    meshBox(group, 'white', 0, 3.18, 0, 5.6, 0.22, 11);
    meshBox(group, 'glass', 0, 2.42, 5.0, 4.4, 1.0, 0.07);
    meshBox(group, 'dark', 0, 3.74, -3.3, 0.65, 1.0, 1.1);
    meshBox(group, 'silver', 0, 4.0, 2.5, 0.07, 1.5, 0.07);
    meshBox(group, 'light', 0, 4.7, 2.5, 0.3, 0.18, 0.18);
    meshBox(group, 'light', -3.35, 2.0, 4.8, 0.08, 0.15, 0.15);
    meshBox(group, 'red', 3.35, 2.0, 4.8, 0.08, 0.15, 0.15);
    // The forward outer deck remains open for the passenger and forward view.
    group.userData.doors = [];
    return group;
  }
  function batchVehicle(group) {
    const animated = new Set(group.userData.doors.map(door => door.mesh)), buckets = new Map();
    for (const child of [...group.children]) {
      if (!child.isMesh || animated.has(child)) continue;
      child.updateMatrix();
      const key = `${child.geometry.uuid}:${child.material.uuid}`;
      if (!buckets.has(key)) buckets.set(key, { geometry: child.geometry, material: child.material, matrices: [], shadow: child.castShadow });
      buckets.get(key).matrices.push(child.matrix.clone());
      group.remove(child);
    }
    for (const batch of buckets.values()) {
      const mesh = new THREE.InstancedMesh(batch.geometry, batch.material, batch.matrices.length);
      batch.matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
      mesh.castShadow = batch.shadow; mesh.receiveShadow = true; mesh.computeBoundingSphere(); group.add(mesh);
    }
    const moving = new Map();
    for (const door of animated) {
      for (const node of [door, ...door.children]) {
        const key = `${node.geometry.uuid}:${node.material.uuid}`;
        if (!moving.has(key)) moving.set(key, { geometry: node.geometry, material: node.material, entries: [] });
        moving.get(key).entries.push({ door, node });
      }
      group.remove(door);
    }
    group.userData.doorBatches = [];
    for (const batch of moving.values()) {
      const mesh = new THREE.InstancedMesh(batch.geometry, batch.material, batch.entries.length);
      mesh.frustumCulled = false; mesh.castShadow = true; group.add(mesh);
      group.userData.doorBatches.push({ mesh, entries: batch.entries });
    }
  }
  for (const vehicle of service.vehicles) {
    const route = service.route(vehicle.routeId), mesh = route.id === 'ferry' ? buildFerry() : buildRailVehicle(route);
    batchVehicle(mesh); mesh.name = `${route.name} · ${vehicle.id}`; root.add(mesh); fleet.set(vehicle.id, mesh);
  }
  const updateService = service.update.bind(service);
  const doorMatrix = new THREE.Matrix4();
  service.setViewer = viewer => { service.viewer = viewer; };
  service.update = (dt, viewer = service.viewer) => {
    const result = updateService(dt);
    const view = viewer ? cleanPosition(viewer) : null;
    for (const vehicle of service.vehicles) {
      const mesh = fleet.get(vehicle.id), pose = vehicle.pose;
      mesh.position.set(pose.x, pose.y, pose.z); mesh.rotation.y = pose.yaw;
      mesh.visible = !view || vehicle.id === service.ridingVehicleId || distance(view, pose) < 700;
      if (view && vehicle.routeId === 'metro' && view.y > -5) mesh.visible = false;
      for (const door of mesh.userData.doors) {
        door.mesh.position.z = door.z + (pose.doorsOpen ? 0.9 * door.side : 0); door.mesh.updateMatrix();
      }
      for (const batch of mesh.userData.doorBatches || []) {
        batch.entries.forEach(({ door, node }, index) => {
          node.updateMatrix();
          doorMatrix.copy(door.matrix);
          if (node !== door) doorMatrix.multiply(node.matrix);
          batch.mesh.setMatrixAt(index, doorMatrix);
        });
        batch.mesh.instanceMatrix.needsUpdate = true;
      }
    }
    return result;
  };
  service.root = root;
  service.colliders = colliders;
  service.fleet = fleet;
  service.staticBatchCount = batches.size;
  service.update(0);
  return service;
}
