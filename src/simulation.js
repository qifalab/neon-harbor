/**
 * Deterministic, renderer-independent game rules. Positions are metres in X/Z;
 * yaw 0 faces +Z. The renderer owns input, sound and localStorage.
 */
import { vehicleGroundSupport } from './ground-support.js';
import { SpatialIndex, CHARACTER_RADIUS, vehicleContacts, circleContacts, circleOBB, moveVehicle, moveCircle } from './collision.js';
import { PLAYER_DIMENSIONS } from './world-config.js';

const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const ROADS = [-240, -160, -80, 0, 80, 160, 240];
const SPAWN = { x: 8, z: 174, yaw: Math.PI };
const SAVE_VERSION = 1;

export const MISSION_DEFS = Object.freeze([
  Object.freeze({
    id: 'harbor-run', title: '港湾速递', kind: 'courier', reward: 850, duration: 150,
    description: '驾驶车辆，按顺序把三份快件送到城市各处。',
    checkpoints: [{ x: 80, z: 160 }, { x: 80, z: 80 }, { x: 160, z: 80 }],
  }),
  Object.freeze({
    id: 'neon-circuit', title: '霓虹环线', kind: 'race', reward: 1500, duration: 100,
    description: '沿着霓虹大道完成五个检查点，在倒计时结束前冲线。',
    checkpoints: [{ x: 0, z: 80 }, { x: -160, z: 80 }, { x: -160, z: -80 }, { x: 80, z: -80 }, { x: 80, z: 160 }],
  }),
  Object.freeze({
    id: 'ghost-signal', title: '幽灵信号', kind: 'escape', reward: 2000, duration: 120,
    description: '驾车到达信号站，甩开追捕，再返回安全屋。',
    checkpoints: [{ x: 0, z: -80 }, { x: 160, z: 160 }],
  }),
]);

export function freshProgress() {
  return { version: SAVE_VERSION, cash: 1200, completed: [], bestTimes: {}, player: { ...SPAWN } };
}

/** Treat saved data as untrusted: damaged/old saves cannot inject invalid physics. */
export function loadProgress(raw, { bounds = 290 } = {}) {
  const fallback = freshProgress();
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!parsed || parsed.version !== SAVE_VERSION || typeof parsed !== 'object') return fallback;
    const ids = new Set(MISSION_DEFS.map(m => m.id));
    const completed = Array.isArray(parsed.completed) ? [...new Set(parsed.completed.filter(id => ids.has(id)))] : [];
    const bestTimes = {};
    for (const id of ids) {
      const time = parsed.bestTimes?.[id];
      if (Number.isFinite(time) && time > 0 && time < 10000) bestTimes[id] = time;
    }
    return {
      version: SAVE_VERSION,
      cash: Math.round(clamp(finite(parsed.cash, fallback.cash), 0, 9999999)),
      completed, bestTimes,
      player: {
        x: clamp(finite(parsed.player?.x, SPAWN.x), -bounds + 5, bounds - 5),
        z: clamp(finite(parsed.player?.z, SPAWN.z), -bounds + 5, bounds - 5),
        yaw: finite(parsed.player?.yaw, SPAWN.yaw) % TAU,
      },
    };
  } catch { return fallback; }
}

export function serializeProgress(progress) {
  return JSON.stringify(loadProgress(progress));
}

function parkedCars() {
  return [
    { id: 'starter', x: 4, z: 160, yaw: Math.PI, type: 'sport', color: 0x386875 },
    { id: 'sunset', x: -4, z: 80, yaw: 0, type: 'sport', color: 0xff805c },
    { id: 'violet', x: 160, z: 4, yaw: Math.PI / 2, type: 'sedan', color: 0xa28aff },
    { id: 'taxi', x: -160, z: -4, yaw: -Math.PI / 2, type: 'sedan', color: 0xffd05d },
    { id: 'marina', x: 80, z: -164, yaw: Math.PI / 2, type: 'sport', color: 0xf86aac },
  ].map(c => ({ ...c, home: { x: c.x, z: c.z, yaw: c.yaw }, speed: 0, vx: 0, vz: 0, health: 100, traffic: false }));
}

function trafficCars() {
  const route = [{ x: -160, z: 160 }, { x: 160, z: 160 }, { x: 160, z: -160 }, { x: -160, z: -160 }];
  const colors = [0xe7edf7, 0xfaa75a, 0x8095d4, 0xd484af, 0x5cd7bd];
  return Array.from({ length: 10 }, (_, index) => {
    const segment = Math.floor(index / 2.5);
    const progress = (index / 2.5) % 1;
    const from = route[segment], to = route[(segment + 1) % route.length];
    return {
      id: `traffic-${index}`, x: from.x + (to.x - from.x) * progress,
      z: from.z + (to.z - from.z) * progress, yaw: Math.atan2(to.x - from.x, to.z - from.z),
      speed: 10 + index % 4, cruise: 10 + index % 4, type: 'sedan', color: colors[index % colors.length],
      health: 100, traffic: true, route, waypoint: (segment + 1) % route.length, pause: 0,
    };
  });
}

export class GameSimulation {
  constructor({ colliders = [], bounds = 290, save = null, groundHeightAt = () => 0 } = {}) {
    this.colliders = colliders;
    this.bounds = bounds;
    this.groundHeightAt = groundHeightAt;
    this.teleportRevision = 0;
    this.missionDefs = MISSION_DEFS;
    this._initialize(loadProgress(save, { bounds }));
  }

  _initialize(progress) {
    this.player = { ...progress.player, y: 0, health: 100, stamina: 100, vy: 0 };
    this.cars = [...parkedCars(), ...trafficCars()];
    this._contactCooldowns = new Map();
    this._supportCache = new Map();
    for (const car of this.cars) {
      this._groundCar(car);
      if (vehicleContacts(car, this._collisionOptions(car)).length) {
        const safe = this._safePosition(car, true);
        if (safe) { Object.assign(car, safe); this._groundCar(car); }
        else car.health = 0;
      }
    }
    if (circleContacts(this.player, CHARACTER_RADIUS, this._collisionOptions()).length) {
      const safeSpawn = this._safePosition(SPAWN, false);
      if (!safeSpawn) throw new Error('The world has no safe player spawn.');
      Object.assign(this.player, safeSpawn);
    }
    this.player.groundY = this.groundHeightAt(this.player.x, this.player.z);
    this.teleportRevision += 1;
    this.inCar = null;
    this.cash = progress.cash;
    this.completed = new Set(progress.completed);
    this.bestTimes = { ...progress.bestTimes };
    this.wanted = 0;
    this.mission = null;
    this.messages = [];
    this.elapsed = 0;
    this.ammo = 18;
    this.reloadRemaining = 0;
    this.lastShot = null;
    this._fireCooldown = 0;
    this._hitCooldown = 0;
    this._crimeCooldown = 0;
    this._escapeTime = 0;
    this._crimeAge = 999;
    this._jumpHeld = false;
    this._grounded = true;
    this._policeSerial = 0;
    this.saveRevision = 0;
  }

  get activeVehicle() { return this.cars.find(c => c.id === this.inCar) || null; }
  get position() { return this.activeVehicle || this.player; }
  get speed() { return Math.abs(this.activeVehicle?.speed || 0); }
  get nearestCar() {
    return this.cars.filter(c => c.health > 0 && Math.abs(c.speed) < 9 && distance(c, this.player) <= 6)
      .sort((a, b) => distance(a, this.player) - distance(b, this.player))[0] || null;
  }
  get escapeProgress() { return clamp(this._escapeTime / 14, 0, 1); }

  _message(text, type = 'info') {
    this.messages.push({ text, type });
    if (this.messages.length > 20) this.messages.shift();
  }

  _collisionOptions(ignore = null) {
    if (this._indexedColliders !== this.colliders) {
      this._indexedColliders = this.colliders;
      this._spatialIndex = new SpatialIndex(this.colliders);
    }
    return { index: this._spatialIndex, bounds: this.bounds, vehicles: this.cars || [], ignore,
      groundHeightAt: this.groundHeightAt, supportAt: pose => this._supportAt(pose) };
  }

  _blocked(x, z, radius) {
    return circleContacts({ x, z }, radius, { ...this._collisionOptions(), vehicles: [] }).length > 0;
  }

  _safePosition(preferred, vehicle, ignore = null) {
    const options = this._collisionOptions(ignore);
    const candidates = [{ ...preferred }];
    for (let radius = 4; radius <= 24; radius += 4) {
      for (let i = 0; i < 16; i++) candidates.push({ ...preferred,
        x: preferred.x + Math.cos(i * TAU / 16) * radius,
        z: preferred.z + Math.sin(i * TAU / 16) * radius });
    }
    for (const z of ROADS) for (const x of ROADS) candidates.push({ x, z, yaw: preferred.yaw || 0 });
    return candidates.find(pose => !(vehicle ? vehicleContacts(pose, options) : circleContacts(pose, CHARACTER_RADIUS, options)).length) || null;
  }

  _supportAt(pose) {
    if (!this._supportCache) this._supportCache = new Map();
    const key = `${pose.x}:${pose.z}:${pose.yaw || 0}`;
    if (!this._supportCache.has(key)) this._supportCache.set(key, vehicleGroundSupport(pose, this.groundHeightAt));
    return this._supportCache.get(key);
  }

  _groundCar(car) {
    Object.assign(car, this._supportAt(car));
  }

  _move(entity, dx, dz, radius) {
    entity.jumpY = entity.y || 0;
    return moveCircle(entity, dx, dz, radius, this._collisionOptions()).contacts.length > 0;
  }

  _moveCar(car, dx, dz, dyaw = 0) {
    const vx = car.vx || 0, vz = car.vz || 0;
    const options = this._collisionOptions(car);
    options.circles = [...(!this.inCar ? [{ ...this.player, radius: CHARACTER_RADIUS, id: 'player' }] : []),
      ...(this.pedestriansAt?.(car) || [])];
    const result = moveVehicle(car, dx, dz, dyaw, options);
    for (const contact of result.contacts) {
      const { normal, obstacle, kind } = contact;
      const ovx = kind === 'vehicle' ? obstacle.vx || 0 : 0;
      const ovz = kind === 'vehicle' ? obstacle.vz || 0 : 0;
      const impact = Math.max(0, -((vx - ovx) * normal.x + (vz - ovz) * normal.z));
      const inward = (car.vx || 0) * normal.x + (car.vz || 0) * normal.z;
      if (inward < 0) { car.vx -= inward * normal.x; car.vz -= inward * normal.z; }
      const key = [car.id, obstacle.id ?? `wall:${this.colliders.indexOf(obstacle)}`].sort().join('|');
      const cooled = !this._contactCooldowns.has(key) || this.elapsed - this._contactCooldowns.get(key) > 1.2;
      if (kind === 'character') {
        if (obstacle.id === 'player' && impact > 5 && this._hitCooldown <= 0) {
          this.player.health = Math.max(0, this.player.health - (car.police ? 18 : 12));
          this._hitCooldown = 1.5;
          this._message('注意来车 · 按 E 进入停靠车辆', 'warning');
        }
        car.pause = Math.max(car.pause || 0, 0.4);
      } else if (kind === 'vehicle') {
        if (car.id !== this.inCar) car.pause = Math.max(car.pause || 0, 0.35);
        if (impact > 6 && cooled && (car.id === this.inCar || obstacle.id === this.inCar)) {
          this._contactCooldowns.set(key, this.elapsed);
          const damage = Math.min(27, impact * 0.65);
          car.health = Math.max(0, car.health - damage);
          obstacle.health = Math.max(0, obstacle.health - damage);
          const other = car.id === this.inCar ? obstacle : car;
          other.pause = Math.max(other.pause || 0, 0.8);
          if ((!other.police || this.wanted === 0) && this._crimeCooldown <= 0) { this._crime(1); this._crimeCooldown = 3; }
          if (other.police) this.player.health = Math.max(0, this.player.health - 9);
        }
      } else if (car.id === this.inCar && impact > 12 && cooled) {
        this._contactCooldowns.set(key, this.elapsed);
        car.health = Math.max(0, car.health - Math.ceil(impact * 0.5));
        this.player.health = Math.max(0, this.player.health - Math.ceil(impact * 0.08));
      }
    }
    if (result.contacts.length) {
      car.speed = (car.vx || 0) * Math.sin(car.yaw) + (car.vz || 0) * Math.cos(car.yaw);
      if (Math.abs(car.speed) < 0.08) car.speed = 0;
    }
    this._groundCar(car);
    return result;
  }

  update(dt, input = {}) {
    dt = clamp(finite(dt, 0), 0, 0.1);
    if (!dt) return;
    this.elapsed += dt;
    this._supportCache.clear();
    this._fireCooldown = Math.max(0, this._fireCooldown - dt);
    this._hitCooldown = Math.max(0, this._hitCooldown - dt);
    this._crimeCooldown = Math.max(0, this._crimeCooldown - dt);
    this._crimeAge += dt;
    if (this.reloadRemaining > 0) {
      this.reloadRemaining = Math.max(0, this.reloadRemaining - dt);
      if (this.reloadRemaining === 0) { this.ammo = 18; this._message('装填完成'); }
    }
    if (this.activeVehicle) this._drive(dt, input);
    else this._walk(dt, input);
    for (const car of this.cars) {
      if (car.id === this.inCar || car.health <= 0) continue;
      if (car.police) this._updatePolice(car, dt);
      else if (car.traffic) this._updateTraffic(car, dt);
    }
    if (this.activeVehicle) Object.assign(this.player, { x: this.activeVehicle.x, z: this.activeVehicle.z,
      groundY: this.activeVehicle.y, yaw: this.activeVehicle.yaw });
    if (input.fire) this.fire();
    this._updateWanted(dt);
    this._updateMission(dt);
    if (this.player.health <= 0 || (this.activeVehicle && this.activeVehicle.health <= 0)) this._recover();
  }

  _walk(dt, input) {
    const forward = clamp(finite(input.forward, 0), -1, 1);
    const strafe = clamp(finite(input.strafe, 0), -1, 1);
    const camera = finite(input.cameraYaw, this.player.yaw);
    // Looking toward +Z from behind, screen-right is world -X (Three.js Y-up).
    let dx = Math.sin(camera) * forward - Math.cos(camera) * strafe;
    let dz = Math.cos(camera) * forward + Math.sin(camera) * strafe;
    const magnitude = Math.hypot(dx, dz);
    if (magnitude > 1) { dx /= magnitude; dz /= magnitude; }
    const sprinting = input.sprint && this.player.stamina > 1 && magnitude > 0.01;
    const speed = sprinting ? 10.5 : 5.6;
    this.player.stamina = clamp(this.player.stamina + (sprinting ? -22 : 15) * dt, 0, 100);
    this._move(this.player, dx * speed * dt, dz * speed * dt, CHARACTER_RADIUS);
    this.player.groundY = this.groundHeightAt(this.player.x, this.player.z);
    if (magnitude > 0.01) this.player.yaw = Math.atan2(dx, dz);
    if (input.jump && !this._jumpHeld && (this._grounded || this.player.y <= 0.001)) {
      this.player.vy = 7.3;
      this._grounded = false;
    }
    this._jumpHeld = !!input.jump;
    this.player.vy -= 20 * dt;
    let nextY = Math.max(0, this.player.y + this.player.vy * dt);
    const footprint = { x: this.player.x, z: this.player.z, hx: CHARACTER_RADIUS, hz: CHARACTER_RADIUS };
    const obstacles = this._spatialIndex.query(footprint).filter(box => box.physics !== false);
    for (const vehicle of this.cars) {
      if (vehicle.health > 0 && distance(vehicle, this.player) < 6) obstacles.push({ ...vehicle, ...this._supportAt(vehicle) });
    }
    const overlapsFootprint = box => circleOBB({ ...this.player, radius: CHARACTER_RADIUS }, box);
    if (nextY > this.player.y) {
      const oldHead = this.player.groundY + this.player.y + PLAYER_DIMENSIONS.height;
      const nextHead = this.player.groundY + nextY + PLAYER_DIMENSIONS.height;
      for (const box of obstacles) {
        if (!Number.isFinite(box.minY) || box.minY < oldHead - 0.001 || box.minY >= nextHead || !overlapsFootprint(box)) continue;
        nextY = Math.min(nextY, Math.max(0, box.minY - this.player.groundY - PLAYER_DIMENSIONS.height - 0.001));
        this.player.vy = 0;
      }
    } else {
      const oldFeet = this.player.groundY + this.player.y;
      const nextFeet = this.player.groundY + nextY;
      let floor = this.player.groundY;
      for (const box of obstacles) {
        if (!Number.isFinite(box.maxY) || box.maxY > oldFeet + 0.001 || box.maxY < nextFeet - 0.001 || !overlapsFootprint(box)) continue;
        floor = Math.max(floor, box.maxY);
      }
      if (nextFeet <= floor + 0.001) {
        nextY = Math.max(0, floor - this.player.groundY);
        this.player.vy = 0;
        this._grounded = true;
      } else this._grounded = false;
    }
    this.player.y = nextY;
    if (this.player.y === 0) { this.player.vy = 0; this._grounded = true; }
  }

  _drive(dt, input) {
    const car = this.activeVehicle;
    const throttle = clamp(finite(input.forward, 0), -1, 1);
    const turn = clamp(finite(input.turn, 0), -1, 1);
    const maxSpeed = car.type === 'sport' ? 43 : car.police ? 40 : 34;
    if (input.brake) car.speed *= Math.max(0, 1 - 3.5 * dt);
    else if (throttle) car.speed += throttle * (car.type === 'sport' ? 23 : 18) * dt;
    else car.speed *= Math.max(0, 1 - 0.72 * dt);
    car.speed = clamp(car.speed, -12, maxSpeed);
    if (Math.abs(car.speed) < 0.04) car.speed = 0;
    const steering = (0.45 + clamp(Math.abs(car.speed) / 11, 0, 1)) * (input.brake ? 1.5 : 1);
    const dyaw = Math.abs(car.speed) > 0.2 ? turn * steering * Math.sign(car.speed) * dt : 0;
    const grip = Math.min(1, dt * (input.brake ? 3.5 : 11));
    car.vx = finite(car.vx, 0) + (Math.sin(car.yaw) * car.speed - finite(car.vx, 0)) * grip;
    car.vz = finite(car.vz, 0) + (Math.cos(car.yaw) * car.speed - finite(car.vz, 0)) * grip;
    this._moveCar(car, car.vx * dt, car.vz * dt, dyaw);
    Object.assign(this.player, { x: car.x, z: car.z, y: 0, yaw: car.yaw, vy: 0 });
    this.player.stamina = Math.min(100, this.player.stamina + dt * 15);
  }

  _driveNPC(car, target, speed, dt) {
    const gap = distance(car, target);
    const desiredYaw = Math.atan2(target.x - car.x, target.z - car.z);
    const error = angleDelta(desiredYaw, car.yaw);
    const dyaw = clamp(error, -2.5 * dt, 2.5 * dt);
    const amount = Math.min(gap, speed * dt);
    // Slow at turns; motion follows the continuously swept heading.
    const movement = amount * Math.max(0, Math.cos(error));
    car.vx = Math.sin(car.yaw + dyaw) * movement / dt;
    car.vz = Math.cos(car.yaw + dyaw) * movement / dt;
    car.speed = movement / dt;
    return this._moveCar(car, car.vx * dt, car.vz * dt, dyaw);
  }

  _updateTraffic(car, dt) {
    if (car.pause > 0) { car.pause -= dt; car.speed = 0; car.vx = 0; car.vz = 0; return; }
    const target = car.route[car.waypoint];
    if (distance(car, target) < 1) { car.waypoint = (car.waypoint + 1) % car.route.length; return; }
    this._driveNPC(car, target, car.cruise, dt);
  }

  _crime(amount = 1) {
    const old = this.wanted;
    this.wanted = Math.min(5, this.wanted + amount);
    this._crimeAge = 0;
    this._escapeTime = 0;
    if (this.wanted !== old) this._message(`警戒等级 ${this.wanted} · 离开巡逻车视线可摆脱追捕`, 'warning');
    this._ensurePolice();
  }

  _ensurePolice() {
    const desired = Math.min(4, this.wanted + 1);
    const active = this.cars.filter(c => c.police && c.health > 0);
    for (let i = active.length; i < desired; i++) {
      // All arrival points are road intersections outside the immediate view.
      const candidates = ROADS.flatMap(x => ROADS.map(z => ({ x, z })))
        .filter(p => distance(p, this.position) > 100 && distance(p, this.position) < 220 &&
          !vehicleContacts({ ...p, yaw: 0 }, this._collisionOptions()).length);
      if (!candidates.length) return;
      const point = candidates[(this._policeSerial * 13 + 7) % candidates.length];
      this.cars.push({ id: `police-${++this._policeSerial}`, ...point, yaw: 0, speed: 0,
        type: 'police', color: 0x14243d, health: 100, traffic: false, police: true,
        path: [], reroute: 0, pause: 0 });
    }
  }

  _roadRoute(from, target) {
    const nearest = value => ROADS.reduce((best, n) => Math.abs(n - value) < Math.abs(best - value) ? n : best, ROADS[0]);
    const sx = nearest(from.x), sz = nearest(from.z);
    const tx = nearest(target.x), tz = nearest(target.z);
    const points = [];
    // Reach an intersection along the road already occupied, then follow the grid.
    if (Math.abs(from.x - sx) < Math.abs(from.z - sz)) points.push({ x: sx, z: sz });
    else points.push({ x: sx, z: sz });
    points.push({ x: tx, z: sz }, { x: tx, z: tz });
    if (Math.abs(target.x - tx) < 9) points.push({ x: tx, z: target.z });
    else if (Math.abs(target.z - tz) < 9) points.push({ x: target.x, z: tz });
    return points.filter((p, index) => index === 0 || distance(p, points[index - 1]) > 0.1);
  }

  _updatePolice(car, dt) {
    if (car.pause > 0) { car.pause -= dt; car.speed = 0; car.vx = 0; car.vz = 0; return; }
    if (!this.wanted) { car.speed = 0; car.vx = 0; car.vz = 0; return; }
    car.reroute -= dt;
    // Only recalculate at a waypoint; replanning mid-block would cut diagonally.
    if (!car.path.length || (car.reroute <= 0 && distance(car, car.path[0]) < 0.5)) {
      car.path = this._roadRoute(car, this.position).filter(p => distance(p, car) > 0.5);
      car.reroute = 1.8;
    }
    const target = car.path[0];
    if (!target) { car.speed = 0; return; }
    const gap = distance(car, target);
    if (gap < 0.6) { car.path.shift(); return; }
    const result = this._driveNPC(car, target, 17 + this.wanted * 2.5, dt);
    if (result.contacts.some(contact => contact.kind === 'static' || contact.kind === 'bounds')) {
      car.path = []; car.reroute = 0;
    }
  }

  _lineClear(a, b) {
    const steps = Math.ceil(distance(a, b) / 2);
    for (let n = 1; n < steps; n++) {
      const t = n / steps;
      if (this._blocked(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, 0.08)) return false;
    }
    return true;
  }

  _updateWanted(dt) {
    if (!this.wanted) return;
    const visible = this.cars.some(car => car.police && car.health > 0 &&
      distance(car, this.position) < 62 && this._lineClear(car, this.position));
    if (visible || this._crimeAge < 4) this._escapeTime = 0;
    else this._escapeTime += dt;
    if (this._escapeTime >= 14) {
      this.wanted = Math.max(0, this.wanted - 1);
      this._escapeTime = 0;
      this._message(this.wanted ? `警戒下降 · 剩余 ${this.wanted} 级` : '追捕解除 · 你已脱离视线', 'success');
    }
    // Nearby patrols apprehend a stationary driver; driving away remains possible.
    const near = this.cars.some(car => car.police && car.health > 0 && distance(car, this.position) < 5);
    if (near && this.speed < 2 && this._hitCooldown <= 0) {
      this.player.health = Math.max(0, this.player.health - 12);
      this._hitCooldown = 1;
    }
  }

  interact() {
    const car = this.activeVehicle;
    if (car) {
      if (Math.abs(car.speed) > 9) { this._message('请先减速，再下车', 'warning'); return false; }
      const right = { x: Math.cos(car.yaw), z: -Math.sin(car.yaw) };
      const front = { x: Math.sin(car.yaw), z: Math.cos(car.yaw) };
      const options = [
        { x: car.x + right.x * 3.5, z: car.z + right.z * 3.5 },
        { x: car.x - right.x * 3.5, z: car.z - right.z * 3.5 },
        { x: car.x - front.x * 4.5, z: car.z - front.z * 4.5 },
        { x: car.x + front.x * 4.5, z: car.z + front.z * 4.5 },
      ];
      const exit = options.find(point => {
        if (circleContacts(point, CHARACTER_RADIUS, this._collisionOptions()).length) return false;
        // Sweep from the door sill, excluding only the car being exited.
        const length = distance(point, car), nx = (point.x - car.x) / length, nz = (point.z - car.z) / length;
        const start = { x: car.x + nx * 1.25, z: car.z + nz * 1.25, y: 0 };
        const others = this.cars.filter(other => other.id !== car.id);
        const result = moveCircle(start, point.x - start.x, point.z - start.z, CHARACTER_RADIUS,
          { ...this._collisionOptions(), vehicles: others });
        return !result.contacts.length && distance(start, point) < 0.02;
      });
      if (!exit) { this._message('车门被挡住了，请把车开到空旷处', 'warning'); return false; }
      Object.assign(this.player, exit, { y: 0, vy: 0 });
      car.speed = 0; car.vx = 0; car.vz = 0;
      this.inCar = null; this.teleportRevision += 1;
      this.player.groundY = this.groundHeightAt(this.player.x, this.player.z);
      this._message('已下车 · WASD 移动，Shift 冲刺');
      return true;
    }
    const nearest = this.nearestCar;
    if (!nearest) { this._message('靠近停靠车辆，按 E 上车'); return false; }
    const path = { ...this.player };
    const approach = moveCircle(path, nearest.x - path.x, nearest.z - path.z, CHARACTER_RADIUS,
      { ...this._collisionOptions(), vehicles: this.cars.filter(other => other.id !== nearest.id) });
    if (approach.contacts.length) { this._message('车辆入口被挡住，请绕到车门旁', 'warning'); return false; }
    nearest.traffic = false; nearest.police = false;
    this.inCar = nearest.id; this.teleportRevision += 1;
    nearest.speed = 0; nearest.vx = 0; nearest.vz = 0;
    Object.assign(this.player, { x: nearest.x, z: nearest.z, y: 0, vy: 0, yaw: nearest.yaw });
    this._message('已上车 · WASD 驾驶，空格刹车，E 下车');
    return true;
  }

  fire() {
    if (this._fireCooldown > 0 || this.reloadRemaining > 0) return false;
    if (this.ammo <= 0) { this.reloadRemaining = 1.8; return false; }
    this.ammo -= 1;
    this._fireCooldown = 0.28;
    const origin = this.position;
    const yaw = origin.yaw;
    const candidates = this.cars.filter(car => car.id !== this.inCar && car.health > 0 &&
      distance(car, origin) < 85 && Math.abs(angleDelta(Math.atan2(car.x - origin.x, car.z - origin.z), yaw)) < 0.065 &&
      this._lineClear(origin, car)).sort((a, b) => distance(a, origin) - distance(b, origin));
    const hit = candidates[0];
    if (hit) { hit.health = Math.max(0, hit.health - 25); hit.pause = 1; }
    this.lastShot = { at: this.elapsed, x: origin.x, z: origin.z, yaw, targetId: hit?.id || null };
    if (this._crimeCooldown <= 0) { this._crime(1); this._crimeCooldown = 3; }
    else { this._crimeAge = 0; this._escapeTime = 0; }
    if (!this.ammo) { this.reloadRemaining = 1.8; this._message('弹匣已空 · 正在装填'); }
    return true;
  }

  startMission(id) {
    const def = MISSION_DEFS.find(item => item.id === id);
    if (!def) return false;
    if (this.mission) { this._message('请先完成或放弃当前任务', 'warning'); return false; }
    this.mission = { id, title: def.title, kind: def.kind, stage: 0, remaining: def.duration,
      duration: def.duration, target: { ...def.checkpoints[0] }, objective: '', reward: def.reward,
      startedAt: this.elapsed, replay: this.completed.has(id), phase: 'checkpoints' };
    this._setObjective();
    this._message(`${def.title} · ${this.mission.replay ? '重玩挑战，不重复发放首通奖励' : `首通奖励 $${def.reward}`}`);
    return true;
  }

  cancelMission() {
    if (!this.mission) return false;
    this._message(`已放弃「${this.mission.title}」，可重新挑战`);
    this.mission = null;
    return true;
  }

  _setObjective() {
    const mission = this.mission;
    const def = MISSION_DEFS.find(m => m.id === mission.id);
    if (mission.kind === 'escape') {
      mission.objective = mission.phase === 'escape' ? '甩开追捕 · 脱离警车视线，等待警戒归零' :
        mission.stage === 0 ? '驾驶车辆，到达信号站' : '驾驶车辆，返回滨海安全屋';
    } else mission.objective = `${mission.kind === 'race' ? '驾驶冲线' : '驾驶送达'} · 检查点 ${mission.stage + 1} / ${def.checkpoints.length}`;
  }

  _updateMission(dt) {
    const mission = this.mission;
    if (!mission) return;
    mission.remaining = Math.max(0, mission.remaining - dt);
    if (mission.remaining <= 0) {
      this._message(`「${mission.title}」时间耗尽 · 可重新挑战`, 'warning');
      this.mission = null; return;
    }
    const def = MISSION_DEFS.find(item => item.id === mission.id);
    if (mission.phase === 'escape') {
      if (this.wanted === 0) {
        mission.phase = 'checkpoints'; mission.stage = 1;
        mission.target = { ...def.checkpoints[1] }; this._setObjective();
        this._message('追捕已解除，返回滨海安全屋', 'success');
      }
      return;
    }
    if (!this.activeVehicle || distance(this.position, mission.target) > 11) return;
    if (mission.kind === 'escape' && mission.stage === 0) {
      mission.phase = 'escape'; this._crime(2); this._setObjective();
      this._message('信号已截获 · 警戒升级，甩开追捕！', 'warning');
      return;
    }
    mission.stage += 1;
    if (mission.stage >= def.checkpoints.length) { this._finishMission(def); return; }
    mission.target = { ...def.checkpoints[mission.stage] };
    this._setObjective();
    this._message(`检查点 ${mission.stage} / ${def.checkpoints.length} 已完成`, 'success');
  }

  _finishMission(def) {
    const time = this.elapsed - this.mission.startedAt;
    const firstClear = !this.completed.has(def.id);
    this.completed.add(def.id);
    if (firstClear) this.cash += def.reward;
    if (time > 0 && (!this.bestTimes[def.id] || time < this.bestTimes[def.id])) this.bestTimes[def.id] = time;
    this.mission = null;
    this.saveRevision += 1;
    this._message(`「${def.title}」完成${firstClear ? ` · +$${def.reward}` : ' · 已记录本次成绩'}`, 'success');
  }

  repair() {
    const car = this.activeVehicle || this.nearestCar;
    if (this.wanted) { this._message('追捕中无法维修，请先解除警戒', 'warning'); return false; }
    if ((!car || car.health >= 100) && this.player.health >= 100) { this._message('状态完好，无需维修'); return false; }
    if (this.cash < 150) { this._message('维修需要 $150', 'warning'); return false; }
    this.cash -= 150;
    this.player.health = 100;
    if (car) car.health = 100;
    this.saveRevision += 1;
    this._message('车辆与生命值已恢复 · -$150', 'success');
    return true;
  }

  _recover() {
    const car = this.activeVehicle;
    if (car) {
      const safe = this._safePosition(car.home || { x: 4, z: 160, yaw: Math.PI }, true, car);
      if (safe) Object.assign(car, safe);
      this._groundCar(car);
      car.health = safe ? 100 : 0; car.speed = 0; car.vx = 0; car.vz = 0;
    }
    const cost = Math.min(200, this.cash);
    this.cash -= cost;
    const safeSpawn = this._safePosition(SPAWN, false);
    if (!safeSpawn) throw new Error('The world has no safe recovery spawn.');
    this.player = { ...safeSpawn, y: 0, vy: 0, health: 100, stamina: 100 };
    this.player.groundY = this.groundHeightAt(this.player.x, this.player.z);
    this.teleportRevision += 1;
    this._grounded = true;
    this.inCar = null; this.wanted = 0; this._escapeTime = 0; this._crimeAge = 999;
    this.mission = null;
    this._hitCooldown = 4;
    this.saveRevision += 1;
    this._message(`已在滨海安全屋恢复 · 救援费用 $${cost}`, 'warning');
  }

  exportSave() {
    // Always resume safely on foot. Runtime pursuits and mission rewards are never saved in flight.
    return { version: SAVE_VERSION, cash: Math.round(this.cash), completed: [...this.completed],
      bestTimes: { ...this.bestTimes }, player: { x: this.position.x, z: this.position.z, yaw: this.position.yaw } };
  }

  reset() {
    this._initialize(freshProgress());
    this.saveRevision += 1;
    this._message('新旅程已开始', 'success');
  }
}
