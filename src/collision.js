/** Shared collision geometry in world metres. Renderers and rules use +Z forward. */
import { VEHICLE_DIMENSIONS, PLAYER_DIMENSIONS } from './world-config.js';

export const VEHICLE_SHAPE = Object.freeze({ hx: VEHICLE_DIMENSIONS.halfWidth + 0.03,
  hz: VEHICLE_DIMENSIONS.halfLength + 0.02, height: VEHICLE_DIMENSIONS.height });
export const CHARACTER_RADIUS = PLAYER_DIMENSIONS.radius;
const EPS = 1e-7, SKIN = 0.001, STEP = 0.18;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const axes = body => {
  const s = Math.sin(body.yaw || 0), c = Math.cos(body.yaw || 0);
  return [{ x: c, z: -s }, { x: s, z: c }];
};
const dimensions = body => ({ hx: body.hx ?? VEHICLE_SHAPE.hx, hz: body.hz ?? VEHICLE_SHAPE.hz });

export function vehicleBounds(body, shape = body) {
  const { hx, hz } = dimensions(shape), s = Math.abs(Math.sin(body.yaw || 0)), c = Math.abs(Math.cos(body.yaw || 0));
  return { x: body.x, z: body.z, hx: c * hx + s * hz, hz: s * hx + c * hz };
}

/** SAT minimum separation, with normal pointing from b toward a. Touching is legal. */
export function overlapOBB(a, b) {
  const aa = axes(a), ba = axes(b), ad = dimensions(a), bd = dimensions(b);
  const dx = a.x - b.x, dz = a.z - b.z;
  let depth = Infinity, normal;
  for (const axis of [...aa, ...ba]) {
    const ra = ad.hx * Math.abs(axis.x * aa[0].x + axis.z * aa[0].z) + ad.hz * Math.abs(axis.x * aa[1].x + axis.z * aa[1].z);
    const rb = bd.hx * Math.abs(axis.x * ba[0].x + axis.z * ba[0].z) + bd.hz * Math.abs(axis.x * ba[1].x + axis.z * ba[1].z);
    const projection = dx * axis.x + dz * axis.z;
    const amount = ra + rb - Math.abs(projection);
    if (amount <= EPS) return null;
    if (amount < depth) {
      depth = amount; const sign = projection < 0 ? -1 : 1;
      normal = { x: axis.x * sign, z: axis.z * sign };
    }
  }
  return { normal, depth };
}

/** Circle/OBB contact normal points out of the rectangle toward the circle. */
export function circleOBB(circle, box) {
  const basis = axes(box), d = dimensions(box), radius = circle.radius ?? CHARACTER_RADIUS;
  const ox = circle.x - box.x, oz = circle.z - box.z;
  const x = ox * basis[0].x + oz * basis[0].z, z = ox * basis[1].x + oz * basis[1].z;
  const cx = clamp(x, -d.hx, d.hx), cz = clamp(z, -d.hz, d.hz);
  const dx = x - cx, dz = z - cz, gap = Math.hypot(dx, dz);
  if (gap >= radius - EPS) return null;
  let nx, nz, depth;
  if (gap > EPS) { nx = dx / gap; nz = dz / gap; depth = radius - gap; }
  else if (d.hx - Math.abs(x) < d.hz - Math.abs(z)) { nx = x < 0 ? -1 : 1; nz = 0; depth = radius + d.hx - Math.abs(x); }
  else { nx = 0; nz = z < 0 ? -1 : 1; depth = radius + d.hz - Math.abs(z); }
  return { normal: { x: nx * basis[0].x + nz * basis[1].x, z: nx * basis[0].z + nz * basis[1].z }, depth };
}

/** Static spatial hash; arbitrary-size AABBs are indexed into every touched cell. */
export class SpatialIndex {
  constructor(colliders = [], cellSize = 32) {
    this.colliders = colliders; this.cellSize = cellSize; this.cells = new Map();
    for (const collider of colliders) {
      const span = this._span(collider);
      for (let x = span.x0; x <= span.x1; x++) for (let z = span.z0; z <= span.z1; z++) {
        const key = `${x}:${z}`;
        if (!this.cells.has(key)) this.cells.set(key, []);
        this.cells.get(key).push(collider);
      }
    }
  }
  _span(a) { return { x0: Math.floor((a.x - a.hx) / this.cellSize), x1: Math.floor((a.x + a.hx) / this.cellSize),
    z0: Math.floor((a.z - a.hz) / this.cellSize), z1: Math.floor((a.z + a.hz) / this.cellSize) }; }
  query(a) {
    const span = this._span(a), found = new Set();
    for (let x = span.x0; x <= span.x1; x++) for (let z = span.z0; z <= span.z1; z++) {
      for (const box of this.cells.get(`${x}:${z}`) || []) {
        if (Math.abs(a.x - box.x) <= a.hx + box.hx && Math.abs(a.z - box.z) <= a.hz + box.hz) found.add(box);
      }
    }
    return [...found];
  }
}

function supported(body, options, radius) {
  if (radius === undefined && options.supportAt) return { ...body, ...options.supportAt(body) };
  const ground = options.groundHeightAt ? options.groundHeightAt(body.x, body.z) : body.y || 0;
  const minY = ground + (body.jumpY || 0);
  return { ...body, minY, maxY: minY + (radius === undefined ? VEHICLE_SHAPE.height : PLAYER_DIMENSIONS.height) };
}

function heightOverlap(body, obstacle) {
  return body.maxY > (obstacle.minY ?? -Infinity) + EPS && body.minY < (obstacle.maxY ?? Infinity) - EPS;
}

function contactsAt(body, options, radius) {
  const { index, bounds = 290, vehicles = [], circles = [] } = options;
  body = supported(body, options, radius);
  const aabb = radius === undefined ? vehicleBounds(body) : { x: body.x, z: body.z, hx: radius, hz: radius };
  const contacts = [];
  const add = (hit, obstacle, kind) => { if (hit) contacts.push({ ...hit, obstacle, kind }); };
  for (const box of index?.query(aabb) || []) {
    if (box.physics === false) continue;
    if (!heightOverlap(body, box)) continue;
    add(radius === undefined ? overlapOBB(body, box) : circleOBB({ ...body, radius }, box), box, 'static');
  }
  for (const other of vehicles) {
    if (other === options.ignore || other === body || (body.id !== undefined && other.id === body.id) || other.health <= 0) continue;
    const otherPose = supported(other, options);
    const otherBounds = vehicleBounds(otherPose);
    if (Math.abs(aabb.x - otherBounds.x) > aabb.hx + otherBounds.hx || Math.abs(aabb.z - otherBounds.z) > aabb.hz + otherBounds.hz) continue;
    if (!heightOverlap(body, otherPose)) continue;
    add(radius === undefined ? overlapOBB(body, otherPose) : circleOBB({ ...body, radius }, otherPose), other, 'vehicle');
  }
  if (radius === undefined) for (const circle of circles) {
    if (!heightOverlap(body, { minY: (circle.groundY || 0) + (circle.y || 0),
      maxY: (circle.groundY || 0) + (circle.y || 0) + PLAYER_DIMENSIONS.height })) continue;
    const hit = circleOBB(circle, body);
    if (hit) add({ depth: hit.depth, normal: { x: -hit.normal.x, z: -hit.normal.z } }, circle, 'character');
  }
  for (const [value, extent, axis] of [[body.x, aabb.hx, 'x'], [body.z, aabb.hz, 'z']]) {
    if (Math.abs(value) + extent > bounds + EPS) {
      const normal = { x: 0, z: 0 }; normal[axis] = value > 0 ? -1 : 1;
      add({ normal, depth: Math.abs(value) + extent - bounds }, { id: `bounds-${axis}` }, 'bounds');
    }
  }
  return contacts;
}

export const vehicleContacts = (pose, options) => contactsAt(pose, options);
export const circleContacts = (pose, radius, options) => contactsAt(pose, options, radius);

function corners(body) {
  const basis = axes(body), { hx, hz } = dimensions(body);
  return [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([x, z]) => ({
    x: body.x + basis[0].x * x + basis[1].x * z,
    z: body.z + basis[0].z * x + basis[1].z * z,
  }));
}

const cross = (a, b, c) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
function convexHull(points) {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.z - b.z);
  const half = list => {
    const result = [];
    for (const point of list) {
      while (result.length > 1 && cross(result.at(-2), result.at(-1), point) <= 0) result.pop();
      result.push(point);
    }
    return result.slice(0, -1);
  };
  return [...half(sorted), ...half(sorted.reverse())];
}

/** A translated OBB sweeps the convex hull of its endpoints. During rotation,
 * each corner follows an arc outside its chord: the sagitta is a conservative
 * padding for the entire arc, including grazing contacts between legal poses. */
function polygonContact(polygon, box, padding = 0) {
  const boxPoints = corners(box), center = polygon.reduce((p, v) => ({ x: p.x + v.x / polygon.length, z: p.z + v.z / polygon.length }), { x: 0, z: 0 });
  let depth = Infinity, normal;
  const normals = [...axes(box)];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length], length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length > EPS) normals.push({ x: (a.z - b.z) / length, z: (b.x - a.x) / length });
  }
  for (const axis of normals) {
    const values = polygon.map(p => p.x * axis.x + p.z * axis.z);
    const other = boxPoints.map(p => p.x * axis.x + p.z * axis.z);
    const minA = Math.min(...values) - padding, maxA = Math.max(...values) + padding;
    const minB = Math.min(...other), maxB = Math.max(...other);
    if (maxA - minB <= EPS || maxB - minA <= EPS) return null;
    const amount = Math.min(maxA - minB, maxB - minA);
    if (amount < depth) {
      depth = amount;
      const sign = (center.x - box.x) * axis.x + (center.z - box.z) * axis.z < 0 ? -1 : 1;
      normal = { x: axis.x * sign, z: axis.z * sign };
    }
  }
  return { normal, depth };
}

function closestPoint(point, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, length = dx * dx + dz * dz;
  const t = length > EPS * EPS ? clamp(((point.x - a.x) * dx + (point.z - a.z) * dz) / length, 0, 1) : 0;
  return { x: a.x + dx * t, z: a.z + dz * t };
}

function polygonCircle(polygon, circle, padding = 0) {
  let closest, gap = Infinity, inside = true;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    if (cross(a, b, circle) < 0) inside = false;
    const point = closestPoint(circle, a, b), d = Math.hypot(point.x - circle.x, point.z - circle.z);
    if (d < gap) { gap = d; closest = point; }
  }
  const radius = (circle.radius ?? CHARACTER_RADIUS) + padding;
  if (!inside && gap >= radius - EPS) return null;
  const divisor = Math.max(gap, EPS), sign = inside ? -1 : 1;
  return { depth: inside ? radius + gap : radius - gap,
    normal: { x: (closest.x - circle.x) / divisor * sign, z: (closest.z - circle.z) / divisor * sign } };
}

/** Capsule/OBB intersection: rectangle, segment-normal and corner-normal axes
 * cover straight circle travel exactly, including a grazing rounded corner. */
function capsuleContact(start, end, radius, box) {
  const boxPoints = corners(box), normals = [...axes(box)];
  const dx = end.x - start.x, dz = end.z - start.z, length = Math.hypot(dx, dz);
  if (length > EPS) normals.push({ x: -dz / length, z: dx / length });
  for (const point of boxPoints) {
    const nearest = closestPoint(point, start, end), nx = nearest.x - point.x, nz = nearest.z - point.z, gap = Math.hypot(nx, nz);
    if (gap > EPS) normals.push({ x: nx / gap, z: nz / gap });
  }
  let depth = Infinity, normal;
  for (const axis of normals) {
    const a = start.x * axis.x + start.z * axis.z, b = end.x * axis.x + end.z * axis.z;
    const values = boxPoints.map(p => p.x * axis.x + p.z * axis.z);
    const minA = Math.min(a, b) - radius, maxA = Math.max(a, b) + radius;
    const minB = Math.min(...values), maxB = Math.max(...values);
    if (maxA - minB <= EPS || maxB - minA <= EPS) return null;
    const amount = Math.min(maxA - minB, maxB - minA);
    if (amount < depth) {
      depth = amount;
      const sign = ((start.x + end.x) / 2 - box.x) * axis.x + ((start.z + end.z) / 2 - box.z) * axis.z < 0 ? -1 : 1;
      normal = { x: axis.x * sign, z: axis.z * sign };
    }
  }
  return { depth, normal };
}

function sweptContacts(start, end, options, radius) {
  const a = supported(start, options, radius), b = supported(end, options, radius);
  const middle = supported({ ...start, x: (start.x + end.x) / 2, z: (start.z + end.z) / 2,
    yaw: ((start.yaw || 0) + (end.yaw || 0)) / 2 }, options, radius);
  const height = { minY: Math.min(a.minY, b.minY, middle.minY), maxY: Math.max(a.maxY, b.maxY, middle.maxY) };
  const shape = { hx: Math.max(dimensions(a).hx, dimensions(b).hx, dimensions(middle).hx),
    hz: Math.max(dimensions(a).hz, dimensions(b).hz, dimensions(middle).hz) };
  const padding = radius === undefined ? Math.hypot(shape.hx, shape.hz) * (1 - Math.cos(((end.yaw || 0) - (start.yaw || 0)) / 2)) : radius;
  const polygon = radius === undefined ? convexHull([...corners({ ...a, ...shape }), ...corners({ ...b, ...shape })]) : [a, b];
  const xs = polygon.map(p => p.x), zs = polygon.map(p => p.z);
  const lowX = Math.min(...xs) - padding, highX = Math.max(...xs) + padding;
  const lowZ = Math.min(...zs) - padding, highZ = Math.max(...zs) + padding;
  const aabb = { x: (lowX + highX) / 2, z: (lowZ + highZ) / 2, hx: (highX - lowX) / 2, hz: (highZ - lowZ) / 2 };
  const hits = [], add = (hit, obstacle, kind) => { if (hit) hits.push({ ...hit, obstacle, kind }); };
  const contact = box => radius === undefined ? polygonContact(polygon, box, padding) : capsuleContact(a, b, radius, box);
  for (const box of options.index?.query(aabb) || []) {
    if (box.physics === false || !heightOverlap(height, box)) continue;
    add(contact(box), box, 'static');
  }
  for (const other of options.vehicles || []) {
    if (other === options.ignore || other === start || (start.id !== undefined && other.id === start.id) || other.health <= 0) continue;
    const otherPose = supported(other, options), otherBounds = vehicleBounds(otherPose);
    if (Math.abs(aabb.x - otherBounds.x) > aabb.hx + otherBounds.hx || Math.abs(aabb.z - otherBounds.z) > aabb.hz + otherBounds.hz || !heightOverlap(height, otherPose)) continue;
    add(contact(otherPose), other, 'vehicle');
  }
  if (radius === undefined) for (const circle of options.circles || []) {
    const minY = (circle.groundY || 0) + (circle.y || 0);
    if (heightOverlap(height, { minY, maxY: minY + PLAYER_DIMENSIONS.height })) add(polygonCircle(polygon, circle, padding), circle, 'character');
  }
  const bounds = options.bounds ?? 290;
  for (const [min, max, axis] of [[lowX, highX, 'x'], [lowZ, highZ, 'z']]) {
    if (min < -bounds - EPS || max > bounds + EPS) {
      const normal = { x: 0, z: 0 }; normal[axis] = max > bounds ? -1 : 1;
      add({ normal, depth: Math.max(-bounds - min, max - bounds) }, { id: `bounds-${axis}` }, 'bounds');
    }
  }
  return hits;
}

function move(body, dx, dz, dyaw, options, radius) {
  const start = { x: body.x, z: body.z, yaw: body.yaw || 0 };
  const contacts = [], seen = new Set();
  const record = hits => {
    for (const hit of hits) {
      const key = `${hit.kind}:${hit.obstacle.id ?? options.index?.colliders.indexOf(hit.obstacle)}:${Math.round(hit.normal.x * 10)}:${Math.round(hit.normal.z * 10)}`;
      if (!seen.has(key)) { seen.add(key); contacts.push(hit); }
    }
  };
  // Repair legacy/intersecting positions before normal movement; this is also
  // needed for externally restored saves and simultaneous dynamic contacts.
  for (let n = 0; n < 8; n++) {
    const hits = contactsAt(body, options, radius);
    if (!hits.length) break;
    const deepest = hits.reduce((a, b) => a.depth > b.depth ? a : b);
    record([deepest]);
    body.x += deepest.normal.x * (deepest.depth + SKIN);
    body.z += deepest.normal.z * (deepest.depth + SKIN);
  }
  const bodyShape = dimensions(supported(body, options, radius));
  const cornerRadius = radius ?? Math.hypot(bodyShape.hx, bodyShape.hz);
  const steps = Math.max(1, Math.ceil((Math.hypot(dx, dz) + Math.abs(dyaw) * cornerRadius) / STEP));
  let sx = dx / steps, sz = dz / steps, blockedRotation = false;
  for (let n = 0; n < steps; n++) {
    if (dyaw && radius === undefined) {
      const yaw = body.yaw || 0, rotation = dyaw / steps;
      const candidate = { ...body, yaw: yaw + rotation };
      const hits = sweptContacts(body, candidate, options);
      if (!hits.length) body.yaw = candidate.yaw;
      else {
        // Rotation can sweep a nose into a wall even when both centres are safe.
        // A bounded search finds the last legal angle without pushing/bouncing.
        record(hits); blockedRotation = true;
        let lo = 0, hi = 1;
        for (let j = 0; j < 12; j++) {
          const mid = (lo + hi) / 2;
          if (sweptContacts(body, { ...body, yaw: yaw + rotation * mid }, options).length) hi = mid;
          else lo = mid;
        }
        body.yaw = yaw + rotation * lo;
      }
    }
    const previous = { ...body };
    const candidate = { ...body, x: body.x + sx, z: body.z + sz };
    const requestedDistance = Math.hypot(sx, sz);
    let rejectedCorrection = false;
    for (let iteration = 0; iteration < 6; iteration++) {
      const hits = contactsAt(candidate, options, radius);
      if (!hits.length) break;
      const hit = hits.reduce((a, b) => a.depth > b.depth ? a : b);
      record([hit]);
      candidate.x += hit.normal.x * (hit.depth + SKIN);
      candidate.z += hit.normal.z * (hit.depth + SKIN);
      // Raised support can activate an overhead volume while our X/Z centre is
      // already beneath it. That is a blocked step, not permission to eject the
      // player/car to the far edge of an awning several metres away.
      if (Math.hypot(candidate.x - previous.x, candidate.z - previous.z) > requestedDistance + 2 * SKIN) {
        rejectedCorrection = true;
        break;
      }
      // Preserve the tangential part, rather than reversing the engine speed.
      const inward = sx * hit.normal.x + sz * hit.normal.z;
      if (inward < 0) { sx -= inward * hit.normal.x; sz -= inward * hit.normal.z; }
    }
    if (!rejectedCorrection && !contactsAt(candidate, options, radius).length) {
      const sweep = sweptContacts(previous, candidate, options, radius);
      if (!sweep.length) { body.x = candidate.x; body.z = candidate.z; }
      else {
        // Endpoint projection can jump across a convex corner. Stop at the first
        // contact of the whole path, then carry only tangent motion onward.
        record(sweep);
        let lo = 0, hi = 1;
        for (let j = 0; j < 14; j++) {
          const mid = (lo + hi) / 2;
          const point = { ...previous, x: previous.x + (candidate.x - previous.x) * mid,
            z: previous.z + (candidate.z - previous.z) * mid };
          if (sweptContacts(previous, point, options, radius).length) hi = mid;
          else lo = mid;
        }
        const length = Math.hypot(candidate.x - previous.x, candidate.z - previous.z);
        const safe = Math.max(0, lo - SKIN / Math.max(length, SKIN));
        body.x = previous.x + (candidate.x - previous.x) * safe;
        body.z = previous.z + (candidate.z - previous.z) * safe;
        for (const { normal } of sweep) {
          const inward = sx * normal.x + sz * normal.z;
          if (inward < 0) { sx -= inward * normal.x; sz -= inward * normal.z; }
        }
      }
    } else { body.x = previous.x; body.z = previous.z; }
  }
  return { contacts, blockedRotation, movedX: body.x - start.x, movedZ: body.z - start.z,
    yawDelta: (body.yaw || 0) - start.yaw };
}

export function moveVehicle(pose, dx, dz, dyaw = 0, options = {}) {
  return move(pose, dx, dz, dyaw, { ...options, ignore: pose }, undefined);
}
export function moveCircle(pose, dx, dz, radius = CHARACTER_RADIUS, options = {}) {
  return move(pose, dx, dz, 0, { ...options, ignore: pose }, radius);
}
