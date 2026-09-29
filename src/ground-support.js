/** Four-wheel support with a clearance correction for non-planar curbs. */
import { VEHICLE_DIMENSIONS } from './world-config.js';

const D = VEHICLE_DIMENSIONS;
const HALF_TRACK = D.wheelTrackHalf ?? 0.94;
const FRONT = D.wheelFrontZ ?? 1.4;
const REAR = D.wheelRearZ ?? -1.39;
const TIRE_HALF_WIDTH = 0.1425;
const SKIN_X = 0.03, SKIN_Z = 0.02;
const WHEELS = [[-HALF_TRACK, FRONT], [HALF_TRACK, FRONT], [-HALF_TRACK, REAR], [HALF_TRACK, REAR]];

export function transformVehiclePoint(point, pose) {
  const cr = Math.cos(pose.roll || 0), sr = Math.sin(pose.roll || 0);
  const cp = Math.cos(pose.pitch || 0), sp = Math.sin(pose.pitch || 0);
  const cy = Math.cos(pose.yaw || 0), sy = Math.sin(pose.yaw || 0);
  // Renderer uses Euler YXZ: apply local roll, then pitch, then heading.
  const rx = point.x * cr - point.y * sr;
  const ry = point.x * sr + point.y * cr;
  const py = ry * cp - point.z * sp;
  const pz = ry * sp + point.z * cp;
  return { x: pose.x + rx * cy + pz * sy, y: (pose.y || 0) + py,
    z: pose.z - rx * sy + pz * cy };
}

export function vehicleGroundSupport(pose, groundHeightAt = () => 0) {
  const s = Math.sin(pose.yaw || 0), c = Math.cos(pose.yaw || 0);
  // A city can have a road above another road. Preserve the support layer while
  // sampling every wheel; a ground-level car must not snap onto a flyover.
  const sample = (x, z) => groundHeightAt(pose.x + c * x + s * z, pose.z - s * x + c * z, pose.y || 0);
  const heights = WHEELS.map(([x, z]) => sample(x, z));
  const base = heights.reduce((sum, y) => sum + y, 0) / 4;
  const footprintHeights = [sample(0, 0)];
  for (const x of [-D.halfWidth, D.halfWidth]) for (const z of [-D.halfLength, D.halfLength]) footprintHeights.push(sample(x, z));
  if ([...heights, ...footprintHeights].every(y => Math.abs(y - base) < 1e-7)) {
    return { y: base, pitch: 0, roll: 0, hx: D.halfWidth + SKIN_X, hz: D.halfLength + SKIN_Z,
      minY: base, maxY: base + D.height };
  }
  const slopeZ = ((heights[0] + heights[1]) - (heights[2] + heights[3])) / (2 * (FRONT - REAR));
  const pitch = -Math.atan(slopeZ);
  const slopeX = ((heights[1] + heights[3]) - (heights[0] + heights[2])) / (4 * HALF_TRACK);
  const roll = Math.atan(slopeX / Math.cos(pitch));
  const attitude = { x: pose.x, z: pose.z, yaw: pose.yaw || 0, y: 0, pitch, roll };
  let y = base - slopeZ * (FRONT + REAR) / 2;
  // The fitted plane alone cannot support four wheels on a diagonal curb.
  // Lift only by the maximum actual tire/underside penetration residual.
  const supportPoint = point => {
    const world = transformVehiclePoint(point, attitude);
    y = Math.max(y, groundHeightAt(world.x, world.z, pose.y || 0) - world.y);
  };
  const cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll);
  const radialY = cp * cr, radialZ = -sp, radialLength = Math.hypot(radialY, radialZ);
  for (const [wx, wz] of WHEELS) {
    for (const side of [-TIRE_HALF_WIDTH, TIRE_HALF_WIDTH]) {
      // The analytic lowest point remains accurate as wheel spin rotates its mesh.
      supportPoint({ x: wx + side, y: D.wheelRadius - D.wheelRadius * radialY / radialLength,
        z: wz - D.wheelRadius * radialZ / radialLength });
      for (let i = -16; i <= 16; i++) {
        const angle = i * Math.PI / 32;
        supportPoint({ x: wx + side, y: D.wheelRadius * (1 - Math.cos(angle)),
          z: wz + D.wheelRadius * Math.sin(angle) });
      }
    }
  }
  for (const x of [-0.9, 0.9]) for (const z of [-2.25, 2.25]) supportPoint({ x, y: 0.29, z });
  y += 0.001; // sub-millimetre sampling clearance on curved tire contact patches
  return { y, pitch, roll, ...vehiclePoseEnvelope({ y, pitch, roll }) };
}

/** Conservative bounds for an already-interpolated render pose; does not resample terrain. */
export function vehiclePoseEnvelope({ y = 0, pitch = 0, roll = 0 } = {}) {
  let hx = 0, hz = 0, minY = Infinity, maxY = -Infinity;
  const localPose = { x: 0, z: 0, yaw: 0, y, pitch, roll };
  for (const x of [-D.halfWidth, D.halfWidth]) for (const z of [-D.halfLength, D.halfLength]) for (const height of [0, D.height]) {
    const p = transformVehiclePoint({ x, y: height, z }, localPose);
    hx = Math.max(hx, Math.abs(p.x)); hz = Math.max(hz, Math.abs(p.z));
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  return { hx: hx + SKIN_X, hz: hz + SKIN_Z, minY, maxY };
}
