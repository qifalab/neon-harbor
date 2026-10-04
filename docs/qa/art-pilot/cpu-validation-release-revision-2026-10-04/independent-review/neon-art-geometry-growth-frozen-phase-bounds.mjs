import fs from 'node:fs';
import { HARBOR_ROUTES, compileHarborRoute, harborRoutePose } from '/workspace/scratch/neon-harbor-art-pilot/docs/qa/art-pilot/native-validation-2026-10-04/frozen-source/src/harbor-transit.js';
const d = JSON.parse(fs.readFileSync('/tmp/neon-art-geometry-growth-frozen-cpu-probe.json'));
const routes = new Map(HARBOR_ROUTES.map(route => [route.kind, compileHarborRoute(route)]));
const failure = d.fullSnapshots.failure;
const references = Object.values(d.fullSnapshots);
const selected = d.timeline.filter(event => event.simulationTime >= 64 && event.simulationTime <= 68);
const dist = (point, eye) => Math.hypot(point.x - eye.x, (point.y || 0) - eye.y, point.z - eye.z);
const bounds = [];
for (const event of selected) for (const vehicle of failure.sampleFleet) {
  const route = routes.get(vehicle.kind);
  let low = route.offsets[vehicle.id.endsWith('-2') ? 1 : 0], high = low + event.simulationTime;
  for (const reference of references) {
    const saved = reference.sampleFleet.find(v => v.id === vehicle.id), delta = event.simulationTime - reference.simulationTime;
    if (delta >= 0) { low = Math.max(low, saved.serviceTime); high = Math.min(high, saved.serviceTime + delta); }
    else { low = Math.max(low, saved.serviceTime + delta); high = Math.min(high, saved.serviceTime); }
  }
  const segments = [];
  const eye = event.camera.position;
  let minimum = Infinity, maximum = -Infinity, minPoint = null;
  const cycleStart = Math.floor(low / route.duration), cycleEnd = Math.floor(high / route.duration);
  for (let cycle = cycleStart; cycle <= cycleEnd; cycle++) for (const piece of route.pieces) {
    const start = Math.max(low, piece.start + cycle * route.duration), end = Math.min(high, piece.end + cycle * route.duration);
    if (end < start) continue;
    const a = harborRoutePose(route, start), b = harborRoutePose(route, end);
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const length2 = dx * dx + dy * dy + dz * dz;
    const u = length2 ? Math.max(0, Math.min(1, ((eye.x - a.x) * dx + (eye.y - a.y) * dy + (eye.z - a.z) * dz) / length2)) : 0;
    const nearest = { x: a.x + dx * u, y: a.y + dy * u, z: a.z + dz * u };
    if (dist(nearest, eye) < minimum) { minimum = dist(nearest, eye); minPoint = nearest; }
    maximum = Math.max(maximum, dist(a, eye), dist(b, eye));
    segments.push({ serviceTimeStart: start, serviceTimeEnd: end, from: { x: a.x, y: a.y, z: a.z }, to: { x: b.x, y: b.y, z: b.z } });
  }
  bounds.push({ eventKind: event.kind, simulationTime: event.simulationTime, camera: eye, vehicle: vehicle.id, serviceTimeRange: [low, high], exactDistanceExtremaOverAllowedRoutePieces: [minimum, maximum], minimumDistancePose: minPoint, nearEntryThreshold: vehicle.kind === 'ferry' ? 85 * .88 : 42 * .88, nearExitThreshold: vehicle.kind === 'ferry' ? 85 : 42, segments });
}
const output = { method: 'Bounds only, not a replay. Actual closed run snapshots constrain serviceTime by monotonicity and maximum rate 1. Distances evaluated on every intersected compiled piece; easing maps monotonically along each straight piece. No actual intermediate fleet, prior LOD hysteresis, camera-frustum visibility or first-upload UUID history is inferred.', bounds };
fs.writeFileSync('/tmp/neon-art-geometry-growth-frozen-phase-bounds.json', JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify(bounds.map(({ segments, ...record }) => record), null, 2));
