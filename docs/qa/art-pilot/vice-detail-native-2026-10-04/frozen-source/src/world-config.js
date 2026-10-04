/** Shared world-space dimensions: one metre is one simulation/rendering unit. */
export const WORLD_BOUNDS = 290;
export const ROAD_CENTERS = Object.freeze([-240, -160, -80, 0, 80, 160, 240]);
export const VEHICLE_DIMENSIONS = Object.freeze({
  halfWidth: 1.15,
  halfLength: 2.3,
  height: 1.75,
  wheelRadius: 0.43,
  wheelTrackHalf: 0.94,
  wheelFrontZ: 1.4,
  wheelRearZ: -1.39,
});
export const PLAYER_DIMENSIONS = Object.freeze({ radius: 0.65, height: 1.8 });
