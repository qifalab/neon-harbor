/** Shared eastern shore and ridge geometry/support, without renderer dependencies. */
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const MOUNTAIN_COLUMNS = 18, MOUNTAIN_ROWS = 72;

export const HARBOR_COAST = Object.freeze([
  [-1320, 1127], [-1140, 1090], [-900, 1097], [-720, 1064], [-520, 1080],
  [-340, 1058], [-120, 1030], [90, 1037], [310, 1004], [520, 989], [730, 1016], [905, 1075],
].map(([z, x]) => Object.freeze({ x, z })));

export function harborCoastX(z) {
  for (let i = 1; i < HARBOR_COAST.length; i++) if (z <= HARBOR_COAST[i].z) {
    const a = HARBOR_COAST[i - 1], b = HARBOR_COAST[i], t = clamp((z - a.z) / (b.z - a.z), 0, 1);
    return a.x + (b.x - a.x) * t;
  }
  return HARBOR_COAST.at(-1).x;
}

/** Rendering and support use the same Float32 vertices and diagonal split.
 * Each caller receives its own arrays so disposing or editing a mesh cannot
 * change the server's terrain support. */
export function createHarborMountainData() {
  const vertices = [], colors = [], indices = [];
  for (let row = 0; row <= MOUNTAIN_ROWS; row++) for (let column = 0; column <= MOUNTAIN_COLUMNS; column++) {
    const x = 1670 + column / MOUNTAIN_COLUMNS * 610, z = -1600 + row / MOUNTAIN_ROWS * 2770;
    const ridge = 230 + 145 * Math.exp(-(((z + 620) / 470) ** 2)) + 122 * Math.exp(-(((z - 290) / 370) ** 2));
    const cross = Math.sin(column / MOUNTAIN_COLUMNS * Math.PI) ** .72;
    const irregular = Math.sin(z * .013 + column * .7) * 19 + Math.cos(z * .032 - column * .9) * 8;
    const y = 2 + Math.max(0, ridge + irregular) * cross;
    vertices.push(x, y, z);
    colors.push(.105 + y * .00016, .16 + y * .00019, .135 + y * .0002);
    if (row < MOUNTAIN_ROWS && column < MOUNTAIN_COLUMNS) {
      const a = row * (MOUNTAIN_COLUMNS + 1) + column, b = a + MOUNTAIN_COLUMNS + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return { positions: new Float32Array(vertices), colors: new Float32Array(colors), indices: new Uint16Array(indices) };
}

const mountainPositions = createHarborMountainData().positions;
function mountainGroundHeightAt(x, z) {
  const p = mountainPositions, stride = MOUNTAIN_COLUMNS + 1;
  const xMin = p[0], xMax = p[MOUNTAIN_COLUMNS * 3];
  const zMin = p[2], zMax = p[MOUNTAIN_ROWS * stride * 3 + 2];
  if (x < xMin || x > xMax || z < zMin || z > zMax) return null;
  const column = Math.min(MOUNTAIN_COLUMNS - 1, Math.floor((x - xMin) / (xMax - xMin) * MOUNTAIN_COLUMNS));
  const row = Math.min(MOUNTAIN_ROWS - 1, Math.floor((z - zMin) / (zMax - zMin) * MOUNTAIN_ROWS));
  const a = (row * stride + column) * 3, b = a + stride * 3;
  const u = clamp((x - p[a]) / (p[a + 3] - p[a]), 0, 1);
  const v = clamp((z - p[a + 2]) / (p[b + 2] - p[a + 2]), 0, 1);
  return u + v <= 1
    ? p[a + 1] + (p[a + 4] - p[a + 1]) * u + (p[b + 1] - p[a + 1]) * v
    : p[b + 4] + (p[b + 1] - p[b + 4]) * (1 - u) + (p[a + 4] - p[b + 4]) * (1 - v);
}

/** Return null outside visible land; water and other world layers retain
 * their own support. The ridge can rise above, or extend beyond, the shore. */
export function harborTerrainGroundHeightAt(x, z) {
  if (![x, z].every(Number.isFinite)) return null;
  const shoreY = z >= HARBOR_COAST[0].z && z <= HARBOR_COAST.at(-1).z && x >= harborCoastX(z) && x <= 2160 ? 3.75 : null;
  const mountainY = mountainGroundHeightAt(x, z);
  return shoreY === null ? mountainY : mountainY === null ? shoreY : Math.max(shoreY, mountainY);
}
