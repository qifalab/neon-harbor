import { METROPOLIS_ROADS } from './metropolis-catalog.js';
import { SpatialIndex, circleOBB } from './collision.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const CITIZEN_RADIUS = .37;
export const CROSSING_CYCLE = 132;
export function crossingSignal(crossing, time) {
  const offset = ((Math.round(crossing.x / 160) + Math.round(crossing.z / 140)) % 3 + 3) % 3 * 11;
  const phase = ((time + offset) % CROSSING_CYCLE + CROSSING_CYCLE) % CROSSING_CYCLE;
  const start = crossing.axis === 'x' ? 0 : 66;
  const remaining = start + 60 - phase;
  return { green: phase >= start && phase < start + 60, remaining: Math.max(0, remaining), phase };
}

/** A shared graph of real pavements and the marked crossings at intersections.
 * Edges are collision checked once, including detours around street furniture.
 * No direct building-to-building line may cut through a road or a city block. */
export function createCitizenNavigation(colliders = []) {
  const index = new SpatialIndex(colliders.filter(box => box.physics !== false && (box.minY ?? 0) < 1.8 && (box.maxY ?? 4) > .22));
  const clear = (point, radius = CITIZEN_RADIUS + .12) => {
    for (const box of index.query({ ...point, hx: radius, hz: radius })) {
      if (circleOBB({ ...point, radius }, box)) return false;
    }
    return true;
  };
  const clearSegment = (a, b) => {
    const steps = Math.max(1, Math.ceil(distance(a, b) / .6));
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      if (!clear({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })) return false;
    }
    return true;
  };
  const polyline = (a, b, sideways = 0) => {
    const vertical = Math.abs(a.z - b.z) > Math.abs(a.x - b.x);
    const points = sideways ? [a, { x: a.x + (vertical ? sideways : 0), z: a.z + (vertical ? 0 : sideways) },
      { x: b.x + (vertical ? sideways : 0), z: b.z + (vertical ? 0 : sideways) }, b] : [a, b];
    return points.every((point, i) => !i || clearSegment(points[i - 1], point)) ? points : null;
  };
  const nodes = [], byId = new Map(), crossings = [], blockedEdges = [], cache = new Map();
  for (const [column, x] of METROPOLIS_ROADS.vertical.entries()) for (const [row, z] of METROPOLIS_ROADS.horizontal.entries()) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const node = { id: `${column}:${row}:${sx}:${sz}`, x: x + sx * 20, z: z + sz * 19, y: 0, edges: [] };
      nodes.push(node); byId.set(node.id, node);
    }
  }
  function connect(a, b, crossing = null, offsets = [0]) {
    if (!a || !b) return;
    let points = null;
    for (const offset of offsets) { points = polyline(a, b, offset); if (points) break; }
    if (!points) { blockedEdges.push([a.id, b.id]); return; }
    const length = points.slice(1).reduce((sum, point, i) => sum + distance(points[i], point), 0);
    a.edges.push({ to: b.id, points, length, crossing });
    b.edges.push({ to: a.id, points: [...points].reverse(), length, crossing });
  }
  const at = (col, row, sx, sz) => byId.get(`${col}:${row}:${sx}:${sz}`);
  for (const [column, x] of METROPOLIS_ROADS.vertical.entries()) for (const [row, z] of METROPOLIS_ROADS.horizontal.entries()) {
    for (const side of [-1, 1]) {
      const eastWest = { id: `cross-x-${column}-${row}-${side}`, axis: 'x', x, z, lane: z + side * 19 };
      const northSouth = { id: `cross-z-${column}-${row}-${side}`, axis: 'z', x, z, lane: x + side * 20 };
      crossings.push(eastWest, northSouth);
      connect(at(column, row, -1, side), at(column, row, 1, side), eastWest);
      connect(at(column, row, side, -1), at(column, row, side, 1), northSouth);
      connect(at(column, row, side, -1), at(column, row + 1, side, 1), null, [0, -side * 2, -side * 4, -side * 5.5]);
      connect(at(column, row, 1, side), at(column + 1, row, -1, side), null, [0, -side * 2, -side * 4, -side * 5]);
    }
  }
  function connector(a, b) {
    for (const offset of [0, 2, -2, 4, -4]) { const points = polyline(a, b, offset); if (points) return points; }
    // Orthogonal alternatives stay on the already occupied local pavement.
    for (const bend of [{ x: a.x, z: b.z }, { x: b.x, z: a.z }]) if (clearSegment(a, bend) && clearSegment(bend, b)) return [a, bend, b];
    return null;
  }
  function nearest(point) {
    return [...nodes].sort((a, b) => distance(a, point) - distance(b, point)).slice(0, 10)
      .map(node => ({ node, points: connector(point, node) })).find(candidate => candidate.points);
  }
  function edgesBetween(start, end) {
    const key = `${start.id}/${end.id}`;
    if (cache.has(key)) return cache.get(key);
    const cost = new Map([[start.id, 0]]), parents = new Map(), open = [{ id: start.id, cost: 0 }];
    while (open.length) {
      open.sort((a, b) => b.cost - a.cost); const current = open.pop();
      if (current.cost !== cost.get(current.id)) continue;
      if (current.id === end.id) break;
      for (const edge of byId.get(current.id).edges) {
        const candidate = current.cost + edge.length;
        if (candidate >= (cost.get(edge.to) ?? Infinity)) continue;
        cost.set(edge.to, candidate); parents.set(edge.to, { from: current.id, edge }); open.push({ id: edge.to, cost: candidate });
      }
    }
    if (!cost.has(end.id)) return null;
    const result = []; let id = end.id;
    while (id !== start.id) { const { from, edge } = parents.get(id); result.unshift(edge); id = from; }
    if (cache.size > 1000) cache.clear(); cache.set(key, result); return result;
  }
  function route(start, goal) {
    const a = nearest(start), b = nearest(goal); if (!a || !b) return null;
    const edges = edgesBetween(a.node, b.node); if (!edges) return null;
    const points = a.points.slice(1).map(point => ({ x: point.x, z: point.z, y: 0 }));
    for (const edge of edges) edge.points.slice(1).forEach(point => points.push({ x: point.x, z: point.z, y: 0, ...(edge.crossing ? { crossing: edge.crossing } : {}) }));
    [...b.points].reverse().slice(1).forEach(point => points.push({ x: point.x, z: point.z, y: 0 }));
    return points;
  }
  return { route, clear, clearSegment, connector, nodes, crossings, blockedEdges,
    snapshot: () => ({ nodes: nodes.length, edges: nodes.reduce((n, node) => n + node.edges.length, 0) / 2, blocked: blockedEdges.length, cachedRoutes: cache.size }) };
}
