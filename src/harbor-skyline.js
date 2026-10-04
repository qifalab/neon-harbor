/**
 * An authored opposite shore, visible from the existing walkable waterfront.
 * v0.8 opens these towers as real addresses and retains their distant geometry.
 */
import { expandedAddress } from './expansion-programmes.js';
import { applySurfaceFinish } from './surface-finish.js';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// x / z / roof height / width / depth / silhouette / material palette.
// Three uneven, overlapping bands leave breathing room around the landmarks.
const towers = [
  ['channel-house', '海峡大厦', 1138, -1150, 92, 50, 64, 'terrace', 3],
  ['north-light', '北湾灯楼', 1207, -1095, 168, 38, 44, 'lantern', 0],
  ['quarry-residence', '石湾公馆', 1139, -995, 122, 43, 55, 'residential', 4],
  ['eastern-crown', '东湾冠塔', 1210, -928, 238, 48, 46, 'crown', 2],
  ['stone-pier', '石堤中心', 1140, -827, 138, 45, 62, 'terrace', 3],
  ['silver-current', '银流中心', 1227, -763, 284, 52, 48, 'taper', 0],
  ['quay-gardens', '岸庭', 1119, -698, 108, 50, 53, 'residential', 4],
  ['harbor-oval', '海湾椭圆', 1172, -603, 206, 54, 45, 'oval', 1],
  ['stone-ribbon', '石带大厦', 1139, -494, 144, 42, 60, 'terrace', 3],
  ['triangular-exchange', '三棱金融中心', 1211, -429, 328, 59, 56, 'blade', 2],
  ['admiralty-east', '晨钟东座', 1126, -314, 172, 48, 54, 'chamfer', 0],
  ['pearl-spire', '明珠国际中心', 1192, -193, 386, 63, 57, 'crown', 1],
  ['victoria-west', '星湾西座', 1101, -79, 182, 43, 50, 'taper', 2],
  ['victoria-east', '星湾东座', 1162, -15, 226, 46, 53, 'taper', 0],
  ['cloud-sail', '云帆中心', 1111, 118, 296, 64, 51, 'sail', 1],
  ['port-light', '港灯大厦', 1143, 257, 151, 42, 53, 'lantern', 3],
  ['water-gardens', '水岸花园', 1072, 350, 99, 47, 53, 'residential', 4],
  ['southern-arc', '南湾弧塔', 1136, 437, 244, 55, 48, 'oval', 0],
  ['ferry-exchange', '渡湾汇', 1058, 542, 116, 46, 52, 'terrace', 3],
  ['copper-hotel', '铜湾酒店', 1114, 631, 188, 47, 44, 'chamfer', 5],
  ['cape-residence', '海角公寓', 1090, 756, 108, 44, 51, 'residential', 4],
  ['ridge-one', '岭上一号', 1343, -1157, 198, 43, 55, 'residential', 4],
  ['ridge-two', '岭上二号', 1391, -1018, 222, 44, 45, 'residential', 3],
  ['granite-square', '花岗广场', 1321, -879, 173, 64, 71, 'terrace', 3],
  ['flying-bridge', '飞桥中心', 1380, -687, 274, 45, 48, 'blade', 2],
  ['midlevel-twins-a', '松岭双庭南座', 1311, -529, 197, 38, 48, 'residential', 4],
  ['midlevel-twins-b', '松岭双庭北座', 1348, -447, 212, 41, 43, 'residential', 3],
  ['mountain-exchange', '望山金融汇', 1387, -272, 306, 53, 61, 'taper', 0],
  ['upper-garden', '山麓花园', 1289, -116, 156, 39, 44, 'residential', 4],
  ['coastal-court', '滨海雅苑', 1320, 43, 179, 44, 50, 'terrace', 3],
  ['peak-lantern', '山顶灯塔', 1379, 186, 247, 47, 51, 'lantern', 5],
  ['southern-gardens', '南山庭院', 1268, 360, 184, 40, 43, 'residential', 4],
  ['copper-ridge', '铜岭居', 1370, 466, 228, 38, 48, 'residential', 3],
  ['cape-office', '海角商务楼', 1261, 632, 157, 48, 54, 'terrace', 2],
  ['ridge-crown', '岭冠大厦', 1494, -875, 276, 50, 47, 'crown', 0],
  ['east-terraces', '东山台地', 1491, -603, 183, 48, 52, 'residential', 4],
  ['hill-observatory', '望岭中心', 1525, -379, 284, 47, 53, 'oval', 2],
  ['cedar-heights', '杉岭高庭', 1481, -35, 212, 45, 50, 'residential', 3],
  ['eastern-heights', '东峰住宅', 1498, 285, 203, 41, 47, 'residential', 4],
  ['cape-heights', '海角高庭', 1444, 588, 163, 46, 50, 'terrace', 3],
];
// Smaller buildings knit the major towers into an inhabited urban frontage.
// Their lower roofline preserves the individual landmark crowns above them.
const neighborhoodRows = [
  [1147,-1234,74,36,45], [1136,-1084,88,39,44], [1266,-950,66,38,37], [1191,-877,105,39,45],
  [1171,-739,87,33,40], [1121,-635,113,37,39], [1115,-559,91,33,42], [1106,-369,119,36,43],
  [1096,-248,83,39,43], [1071,-141,68,35,39], [1079,43,106,36,39], [1072,190,97,37,40],
  [1126,313,63,38,35], [1035,489,101,36,42], [1060,682,76,40,40], [1093,846,93,36,44],
  [1250,-1274,128,40,46], [1286,-1179,151,34,39], [1322,-1099,119,35,41], [1250,-999,144,36,40],
  [1388,-911,137,41,43], [1322,-811,121,35,47], [1284,-716,164,36,42], [1286,-618,129,39,37],
  [1356,-520,138,36,38], [1267,-414,159,37,39], [1286,-319,119,41,46], [1322,-223,133,38,38],
  [1250,-32,127,34,44], [1286,117,149,38,39], [1322,266,138,36,41], [1318,404,127,34,38],
  [1286,517,154,38,42], [1322,717,142,35,37], [1250,803,112,37,41], [1286,895,128,35,40],
];
const neighborhood = neighborhoodRows.map(([x,z,height,width,depth], i) =>
  [`harbor-neighborhood-${i + 1}`, `东湾街区 ${i + 1}`, x,z,height,width,depth, i % 4 === 0 ? 'terrace' : 'residential', i % 3 === 0 ? 5 : 3 + i % 2]);
export const HARBOR_TOWERS = Object.freeze([...towers, ...neighborhood].map(([id, name, x, z, height, width, depth, style, palette], index) =>
  Object.freeze({ id, name, x, z, height, width, depth, style, palette, index, scenic: true, baseY: 4, neighborhood: index >= towers.length })));

export const HARBOR_VIEWPOINTS = Object.freeze([
  Object.freeze({ id: 'victoria-panorama', name: '星湾全景海滨', kind: 'viewpoint', walkable: true,
    description: '从旧城海滨步道望向宽阔海湾。明珠国际中心、云帆中心与三棱金融中心在山前形成多层天际线。',
    entrance: Object.freeze({ x: 285.5, z: 42, y: .18, yaw: Math.PI / 2 }),
    lookAt: Object.freeze({ x: 1175, y: 135, z: -105 }) }),
  Object.freeze({ id: 'victoria-north-promenade', name: '东岸观港长廊', kind: 'viewpoint', walkable: true,
    description: '沿潮光海滨东侧长廊步行，隔水观看前排滨水楼群、后排高楼与连续山脊。',
    entrance: Object.freeze({ x: 727, z: -463, y: 0, yaw: Math.PI / 2 }),
    lookAt: Object.freeze({ x: 1200, y: 100, z: -325 }) }),
  Object.freeze({ id: 'victoria-channel-view', name: '航道眺望台', kind: 'viewpoint', walkable: true,
    description: '从旧城北端海滨望向东湾北部。货轮航道、银流中心与层叠住宅共同构成另一幅城市剖面。',
    entrance: Object.freeze({ x: 285.5, z: -241, y: .18, yaw: Math.atan2(889.5, -409) }),
    lookAt: Object.freeze({ x: 1175, y: 115, z: -650 }) }),
]);

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

/** Actual model profiles, in height/width/depth fractions. Rounded corners and
 * changes in these rings affect the silhouette, not just a painted facade. */
export function harborTowerProfile(tower) {
  const sets = {
    chamfer: [[0, 1, 1], [.07, 1, 1], [.86, 1, 1], [.97, .86, .86], [1, .78, .78]],
    taper: [[0, 1, 1], [.05, 1, 1], [.36, .93, .95], [.69, .79, .87], [.92, .62, .73], [1, .46, .6]],
    crown: [[0, 1, 1], [.09, 1, 1], [.39, .98, .98], [.72, .88, .9], [.89, .74, .8], [.955, .53, .67], [1, .28, .48]],
    terrace: [[0, 1.1, 1.06], [.12, 1.1, 1.06], [.12, 1, .94], [.49, 1, .94], [.49, .79, .83], [.8, .79, .83], [.8, .59, .69], [1, .59, .69]],
    residential: [[0, 1.08, 1.06], [.09, 1.08, 1.06], [.09, 1, 1], [.93, 1, 1], [.93, .77, .8], [1, .77, .8]],
    lantern: [[0, 1, 1], [.1, 1, 1], [.85, .92, .92], [.85, 1.04, 1.04], [.96, 1.04, 1.04], [1, .66, .66]],
    oval: [[0, .91, .91], [.1, 1, 1], [.65, 1, 1], [.87, .93, .93], [.96, .75, .8], [1, .39, .5]],
    sail: Array.from({ length: 13 }, (_, i) => {
      const h = i / 12; return [h, .12 + .88 * Math.cos(h * Math.PI / 2), 1 - h * .3, Math.sin(h * Math.PI / 2) * .33];
    }),
    blade: [[0, 1, 1], [.08, 1, 1], [.84, 1, 1], [1, .69, .76]],
  };
  return (sets[tower.style] || sets.chamfer).map(p => [...p]);
}

function towerPerimeter(tower) {
  if (tower.style === 'oval') return Array.from({ length: 32 }, (_, i) => {
    const angle = -Math.PI * 2 * i / 32; return [Math.cos(angle) * .5, Math.sin(angle) * .5];
  });
  if (tower.style === 'blade') return [[-.5, -.43], [-.31, -.5], [.5, .21], [.39, .49], [-.5, .25]];
  const bevel = tower.style === 'residential' ? .035 : .13;
  return [[-.5 + bevel, -.5], [-.5, -.5 + bevel], [-.5, .5 - bevel], [-.5 + bevel, .5],
    [.5 - bevel, .5], [.5, .5 - bevel], [.5, -.5 + bevel], [.5 - bevel, -.5]];
}

export function createHarborTowerGeometry(THREE, tower) {
  const perimeter = towerPerimeter(tower), profiles = harborTowerProfile(tower), vertices = [], uvs = [], indices = [];
  const n = perimeter.length, distances = [0];
  for (let i = 0; i < n; i++) {
    const a = perimeter[i], b = perimeter[(i + 1) % n];
    distances.push(distances.at(-1) + Math.hypot((b[0] - a[0]) * tower.width, (b[1] - a[1]) * tower.depth));
  }
  for (const [h, width, depth, shift = 0] of profiles) for (let i = 0; i <= n; i++) {
    const p = perimeter[i % n];
    // An inclined crown makes the triangular exchange's silhouette asymmetric.
    const top = tower.style === 'blade' && h === 1 ? h - .13 * (p[1] + .5) : h;
    vertices.push((p[0] * width + shift) * tower.width, top * tower.height, p[1] * depth * tower.depth);
    uvs.push(distances[i], top * tower.height);
  }
  for (let ring = 0; ring < profiles.length - 1; ring++) for (let i = 0; i < n; i++) {
    const a = ring * (n + 1) + i, b = a + n + 1;
    indices.push(a, a + 1, b, a + 1, b + 1, b);
  }
  // Flat, closed roof; separate cap vertices keep edge normals crisp.
  const cap = vertices.length / 3, p = profiles.at(-1), ringStart = (profiles.length - 1) * (n + 1);
  let centerY = 0;
  for (let i = 0; i < n; i++) centerY += vertices[(ringStart + i) * 3 + 1] / n;
  vertices.push((p[3] || 0) * tower.width, centerY, 0); uvs.push(0, centerY);
  for (let i = 0; i <= n; i++) { const a = (ringStart + i) * 3; vertices.push(...vertices.slice(a, a + 3)); uvs.push(distances[i], centerY); }
  for (let i = 0; i < n; i++) indices.push(cap, cap + i + 1, cap + i + 2);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

const facadePalettes = ['#527888', '#668391', '#4e6979', '#a59c8e', '#929d91', '#9e8c73'];
function facadeMaterial(THREE, palette, nightUniform) {
  const material = new THREE.MeshStandardMaterial({ color: facadePalettes[palette], roughness: palette < 3 ? .27 : .77,
    metalness: palette < 3 ? .08 : .025, emissive: '#ffd3a1', emissiveIntensity: 0 });
  material.userData.harborFacade = true;
  material.onBeforeCompile = shader => {
    shader.uniforms.harborNight = nightUniform;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vHarborMeters;\nvarying float vHarborSeed;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvHarborMeters = uv;\nvHarborSeed = modelMatrix[3].x * .014 + modelMatrix[3].z * .047;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      varying vec2 vHarborMeters;
      varying float vHarborSeed;
      uniform float harborNight;
      float harborHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      // Exact box filtering of a periodic aperture preserves emitted energy
      // when a real window occupies only part of a screen pixel.
      float harborPulseIntegral(float x, float duty) { return floor(x) * duty + min(fract(x), duty); }
      float harborFilteredAperture(float x, float duty, float footprint) {
        float width = max(footprint, .001);
        return clamp((harborPulseIntegral(x + width * .5, duty) - harborPulseIntegral(x - width * .5, duty)) / width, 0.0, 1.0);
      }
    `).replace('#include <color_fragment>', `#include <color_fragment>
      vec2 harborGrid = vHarborMeters / vec2(${palette < 3 ? '1.8, 3.9' : '2.8, 3.35'});
      vec2 harborCell = fract(harborGrid);
      vec2 harborAA = max(fwidth(harborGrid), vec2(.007));
      vec2 harborInset = smoothstep(vec2(.07), vec2(.07) + harborAA, harborCell)
        * (1.0 - smoothstep(vec2(.90, .78) - harborAA, vec2(.90, .78), harborCell));
      float harborWindow = harborInset.x * harborInset.y;
      float harborDistant = 1.0 - smoothstep(.24, 1.1, max(harborAA.x, harborAA.y));
      float harborVariation = harborHash(floor(harborGrid) + vec2(vHarborSeed, vHarborSeed * 3.7));
      vec3 harborGlass = diffuseColor.rgb * (.40 + harborVariation * .29);
      vec3 harborWall = diffuseColor.rgb * ${palette < 3 ? '.86' : '1.08'};
      // Four-bay structural modules and mechanical-floor spandrels retain
      // facade depth once the individual metre-scale panes become subpixel.
      // This is a filtered second scale, not a flat-color distant substitute.
      vec2 harborModules = vHarborMeters / vec2(${palette < 3 ? '7.2, 15.6' : '5.6, 10.05'});
      vec2 harborModuleAA = max(fwidth(harborModules), vec2(.007));
      vec2 harborModuleCell = fract(harborModules);
      vec2 harborModuleInset = smoothstep(vec2(.045), vec2(.045) + harborModuleAA * .75, harborModuleCell)
        * (1.0 - smoothstep(vec2(.96, .90) - harborModuleAA * .75, vec2(.96, .90), harborModuleCell));
      float harborRecess = harborModuleInset.x * harborModuleInset.y;
      vec3 harborCoarse = mix(diffuseColor.rgb * ${palette < 3 ? '.94' : '1.02'}, diffuseColor.rgb * ${palette < 3 ? '.45' : '.51'}, harborRecess);
      diffuseColor.rgb = mix(harborCoarse, mix(harborWall, harborGlass, harborWindow), harborDistant);
      // Occupancy is organised at building scale, never randomly switched per
      // tiny pane. This prevents an entire skyline becoming white pixel noise.
      // The area-filtered small panes remain inside these coherent lit areas.
      float harborPaneArea = harborFilteredAperture(harborGrid.x + .07, .72, harborAA.x)
        * harborFilteredAperture(harborGrid.y + .08, .60, harborAA.y);
      float harborBuildingPhase = fract(vHarborSeed * .071);
      ${palette < 3 ? `
      // About three occupied storeys out of each twelve form one continuous
      // office zone, with large unlit wings and long runs of dark floors.
      vec2 harborOfficeZones = vHarborMeters / vec2(21.6, 46.8)
        + vec2(harborBuildingPhase * .41, harborBuildingPhase);
      vec2 harborOfficeAA = max(fwidth(harborOfficeZones), vec2(.001));
      float harborLitFloors = harborFilteredAperture(harborOfficeZones.y, .265, harborOfficeAA.y);
      float harborOccupiedWings = harborFilteredAperture(harborOfficeZones.x, .74, harborOfficeAA.x);
      float harborOccupancy = harborLitFloors * harborOccupiedWings;
      vec3 harborInteriorLight = mix(vec3(.90, .70, .45), vec3(.70, .78, .81), harborBuildingPhase * .42);
      ` : `
      // Only selected six-bay/six-storey residential zones are occupied. Their
      // neighbouring warm windows read as homes, rather than isolated stars.
      vec2 harborResidenceZones = vHarborMeters / vec2(16.8, 20.1);
      float harborOccupiedHomes = step(.76, harborHash(floor(harborResidenceZones)
        + vec2(vHarborSeed * 1.7, vHarborSeed)));
      vec2 harborHomeWindows = vHarborMeters / vec2(8.4, 6.7)
        + vec2(harborBuildingPhase, harborBuildingPhase * .3);
      vec2 harborHomeAA = max(fwidth(harborHomeWindows), vec2(.001));
      float harborHomeArea = harborFilteredAperture(harborHomeWindows.x, .66, harborHomeAA.x)
        * harborFilteredAperture(harborHomeWindows.y, .62, harborHomeAA.y);
      float harborOccupancy = harborOccupiedHomes * harborHomeArea;
      vec3 harborInteriorLight = vec3(.93, .59, .28);
      `}
      float harborWindowLight = harborOccupancy * harborPaneArea;
      float harborBand = .5 + .5 * sin(vHarborMeters.y * .028 + vHarborMeters.x * .012);
      diffuseColor.rgb += vec3(.03, .045, .055) * harborWindow * harborBand;
    `).replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance += harborInteriorLight * harborWindowLight * harborNight * ${palette < 3 ? '.78' : '.68'};
    `);
  };
  material.customProgramCacheKey = () => `harbor-meter-facade-v4-${palette < 3 ? 'office' : 'domestic'}`;
  return material;
}

/** Sinuous, connected terrain, not repeated cone props in the shipping lane. */
function mountainGeometry(THREE) {
  const vertices = [], colors = [], indices = [], columns = 18, rows = 72;
  for (let row = 0; row <= rows; row++) for (let column = 0; column <= columns; column++) {
    const x = 1540 + column / columns * 610, z = -1600 + row / rows * 2770;
    const ridge = 230 + 145 * Math.exp(-(((z + 620) / 470) ** 2)) + 122 * Math.exp(-(((z - 290) / 370) ** 2));
    const cross = Math.sin(column / columns * Math.PI) ** .72;
    const irregular = Math.sin(z * .013 + column * .7) * 19 + Math.cos(z * .032 - column * .9) * 8;
    const y = 2 + Math.max(0, ridge + irregular) * cross;
    vertices.push(x, y, z);
    const color = new THREE.Color().setRGB(.105 + y * .00016, .16 + y * .00019, .135 + y * .0002);
    colors.push(color.r, color.g, color.b);
    if (row < rows && column < columns) { const a = row * (columns + 1) + column, b = a + columns + 1; indices.push(a, b, a + 1, a + 1, b, b + 1); }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

/** All visible massing stays resident. Facade accessories and waterfront
 * furniture are recreated near the viewer, then actually disposed on leaving.
 * No quality mode substitutes fewer or shorter skyline buildings. */
export function createHarborSkyline(THREE, scene, { quality = 'high' } = {}) {
  const root = new THREE.Group(); root.name = 'Star Bay · authored eastern skyline'; scene.add(root);
  const buildings=HARBOR_TOWERS.map(t=>{
    const use=t.style==='residential'?'home':'office';
    const address=expandedAddress({id:`east-${use}-${String(t.index+1).padStart(3,'0')}`,name:t.name,englishName:`East Bay ${t.index+1}`,x:t.x,z:t.z,width:t.width,depth:t.depth,height:t.height,color:facadePalettes[t.palette],index:t.index,baseY:t.baseY,district:'east-bay',style:t.style});
    return Object.freeze({...address,towerId:t.id,entrance:Object.freeze({...address.entrance,z:t.z+t.depth*.645+3})});
  });
  let interiorBuilding=null;
  const colliders = [], geometries = new Set(), materials = new Set(), towerMeshes = [], detailResidents = new Map();
  const nightUniform = { value: 0 }, boxGeometry = new THREE.BoxGeometry(1, 1, 1), cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 12);
  const sphereGeometry = new THREE.SphereGeometry(1, 12, 7), temp = new THREE.Object3D();
  for (const g of [boxGeometry, cylinderGeometry, sphereGeometry]) geometries.add(g);
  const facadeMaterials = facadePalettes.map((_, i) => facadeMaterial(THREE, i, nightUniform));
  facadeMaterials.forEach(m => materials.add(m));
  const solidMaterials = {};
  const colors = { stone: '#a9a99c', dark: '#374449', metal: '#647373', brass: '#a39670', wood: '#8e7860',
    leaves: '#445d4b', glass: '#5f777d', light: '#d9c8a7', mountain: '#536960', crownWarm: '#b5afa0', crownCool: '#a3b2b9' };
  for (const [key, color] of Object.entries(colors)) {
    solidMaterials[key] = new THREE.MeshStandardMaterial({ color, roughness: ['glass', 'metal', 'brass'].includes(key) ? .42 : .87,
      metalness: ['metal', 'brass'].includes(key) ? .5 : key === 'glass' ? .26 : .015 });
    materials.add(solidMaterials[key]);
    if(['stone','wood'].includes(key))applySurfaceFinish(solidMaterials[key],'mineral',{world:true});
    if(['metal','brass'].includes(key))applySurfaceFinish(solidMaterials[key],'metal',{world:true});
  }
  solidMaterials.light.emissive.set('#ffe0b0'); solidMaterials.light.emissiveIntensity = .12;
  solidMaterials.crownWarm.name = 'harbor-crown-warm'; solidMaterials.crownWarm.emissive.set('#ffd494');
  solidMaterials.crownCool.name = 'harbor-crown-cool'; solidMaterials.crownCool.emissive.set('#c3ddff');
  solidMaterials.glass.emissive.set('#edd4af'); solidMaterials.glass.emissiveIntensity = 0;
  let currentQuality = quality, elapsed = 0, lastViewer = { x: 285.5, z: 42 }, disposedInstances = 0, detailLoads = 0;
  function part(pools, key, x, y, z, width, height, depth, rotation = {}, kind = 'box') {
    const id = `${kind}:${key}`;
    if (!pools.has(id)) pools.set(id, { kind, key, transforms: [] });
    pools.get(id).transforms.push([x, y, z, width, height, depth, rotation.x || 0, rotation.y || 0, rotation.z || 0]);
  }
  function buildBatches(pools, name) {
    const group = new THREE.Group(); group.name = name;
    for (const batch of pools.values()) {
      const geometry = batch.kind === 'cylinder' ? cylinderGeometry : batch.kind === 'sphere' ? sphereGeometry : boxGeometry;
      const mesh = new THREE.InstancedMesh(geometry, solidMaterials[batch.key], batch.transforms.length);
      mesh.name = `${name} · ${batch.key}`;
      mesh.userData.originalTransforms=batch.transforms;
      batch.transforms.forEach((p, i) => { temp.position.set(p[0], p[1], p[2]); temp.scale.set(p[3], p[4], p[5]); temp.rotation.set(p[6], p[7], p[8]); temp.updateMatrix(); mesh.setMatrixAt(i, temp.matrix); });
      mesh.userData.noShadow = true; mesh.castShadow = false; mesh.receiveShadow = true; mesh.computeBoundingSphere(); group.add(mesh);
    }
    applyInteriorVisibility(group);return group;
  }
  function applyInteriorVisibility(target=root) {
    target.traverse(mesh=>{
      if(mesh.userData.harborTowerId)mesh.visible=mesh.userData.harborTowerId!==interiorBuilding?.towerId;
      const transforms=mesh.userData.originalTransforms;if(!mesh.isInstancedMesh||!transforms)return;
      transforms.forEach((p,i)=>{
        const hidden=interiorBuilding&&Math.abs(p[0]-interiorBuilding.x)<interiorBuilding.width*.70&&
          Math.abs(p[2]-interiorBuilding.z)<interiorBuilding.depth*.70&&p[1]>=interiorBuilding.baseY&&p[3]<interiorBuilding.width*1.5&&p[5]<interiorBuilding.depth*1.5;
        temp.position.set(p[0],p[1],p[2]);temp.rotation.set(p[6],p[7],p[8]);temp.scale.set(hidden?0:p[3],hidden?0:p[4],hidden?0:p[5]);temp.updateMatrix();mesh.setMatrixAt(i,temp.matrix);
      });mesh.instanceMatrix.needsUpdate=true;
    });
  }
  function lightBeam(pools, key, a, b, thickness) {
    const line = b.clone().sub(a), center = a.clone().add(b).multiplyScalar(.5);
    temp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), line.clone().normalize());
    part(pools, key, center.x, center.y, center.z, thickness, line.length(), thickness,
      { x: temp.rotation.x, y: temp.rotation.y, z: temp.rotation.z });
  }
  const permanent = new Map();
  // One continuous coast with a lower masonry seawall and a broad waterfront.
  const shore = new THREE.Shape(); shore.moveTo(HARBOR_COAST[0].x, -HARBOR_COAST[0].z);
  for (const p of HARBOR_COAST.slice(1)) shore.lineTo(p.x, -p.z);
  shore.lineTo(2160, -HARBOR_COAST.at(-1).z); shore.lineTo(2160, -HARBOR_COAST[0].z); shore.closePath();
  const shoreGeometry = new THREE.ShapeGeometry(shore); shoreGeometry.rotateX(-Math.PI / 2); geometries.add(shoreGeometry);
  const land = new THREE.Mesh(shoreGeometry, solidMaterials.stone); land.position.y = 3.75; land.name = 'East Bay · walkable shore'; land.receiveShadow=true;root.add(land);
  for (let i = 1; i < HARBOR_COAST.length; i++) {
    const a = HARBOR_COAST[i - 1], b = HARBOR_COAST[i], dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
    part(permanent, 'stone', (a.x + b.x) / 2, 1.7, (a.z + b.z) / 2, 2.3, 4.1, length + .4, { y: Math.atan2(dx, dz) });
    part(permanent, 'dark', (a.x + b.x) / 2 - .4, .25, (a.z + b.z) / 2, .25, 1.2, length + .4, { y: Math.atan2(dx, dz) });
  }
  for (const tower of HARBOR_TOWERS) {
    colliders.push({id:`${tower.id}-shell`,kind:'east-building',x:tower.x,z:tower.z,hx:tower.width/2,hz:tower.depth/2,minY:tower.baseY,maxY:tower.baseY+tower.height,physics:true,camera:true});
    colliders.push({id:`${tower.id}-podium`,kind:'east-podium',x:tower.x,z:tower.z,hx:tower.width*.645,hz:tower.depth*.645,minY:tower.baseY,maxY:tower.baseY+14.8,physics:true,camera:true});
    const geometry = createHarborTowerGeometry(THREE, tower); geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, facadeMaterials[tower.palette]); mesh.position.set(tower.x, tower.baseY, tower.z);
    mesh.name = tower.name; mesh.userData.harborTowerId = tower.id; mesh.userData.noShadow = true; mesh.receiveShadow = true; root.add(mesh); towerMeshes.push(mesh);
    const podiumHeight = tower.style === 'residential' ? 9.8 : 14.8;
    part(permanent, 'stone', tower.x, tower.baseY + podiumHeight / 2, tower.z, tower.width * 1.29, podiumHeight, tower.depth * 1.29);
    part(permanent, 'dark', tower.x, tower.baseY + podiumHeight * .52, tower.z, tower.width * 1.3, 4.4, tower.depth * 1.3);
    part(permanent, 'stone', tower.x, tower.baseY + podiumHeight + .3, tower.z, tower.width * 1.34, .6, tower.depth * 1.34);
    if (tower.style === 'crown') {
      const top = tower.baseY + tower.height;
      part(permanent, 'metal', tower.x, top + 8, tower.z, .75, 19, .75);
      part(permanent, 'light', tower.x, top + 18.1, tower.z, .7, 1.3, .7);
      // Slender crown ribs have real taper and do not turn into a giant cube.
      for (const sign of [-1, 1]) for (const side of [-1, 1]) {
        const dx = sign * tower.width * .26, dz = side * tower.depth * .25, low = top - tower.height * .09;
        const target = new THREE.Vector3(sign * tower.width * .1 - dx, top - low + 4, side * tower.depth * .15 - dz);
        temp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), target.clone().normalize());
        part(permanent, 'metal', tower.x + dx + target.x / 2, low + target.y / 2, tower.z + dz + target.z / 2, .85, target.length(), .85,
          { x: temp.rotation.x, y: temp.rotation.y, z: temp.rotation.z });
      }
    }
    if (tower.style === 'blade') {
      // Exposed diagonal braces on the harbor-facing surface use metre scale.
      const x = tower.x - tower.width * .507;
      for (let j = 0; j < 4; j++) {
        const ya = tower.baseY + 18 + j * (tower.height - 36) / 4, yb = ya + (tower.height - 36) / 4;
        const za = tower.z + (j % 2 ? -.35 : .2) * tower.depth, zb = tower.z + (j % 2 ? .2 : -.35) * tower.depth;
        const angle = Math.atan2(zb - za, yb - ya);
        part(permanent, tower.id === 'triangular-exchange' && j >= 2 ? 'crownCool' : 'metal', x, (ya + yb) / 2, (za + zb) / 2,
          1, Math.hypot(yb - ya, zb - za), 1, { x: angle });
      }
    }
    // Selected landmark fixtures follow the real crown geometry. These small
    // physical luminaires are separate from the office-window emission.
    if (['pearl-spire', 'cloud-sail', 'silver-current'].includes(tower.id)) {
      const profile = harborTowerProfile(tower), isSail = tower.style === 'sail';
      for (let ring = 1; ring < profile.length; ring++) {
        const a = profile[ring - 1], b = profile[ring];
        if (a[0] < (isSail ? .5 : .65)) continue;
        for (const sign of [-1, 1]) {
          const p = new THREE.Vector3(tower.x + (-a[1] / 2 + (a[3] || 0)) * tower.width - .18,
            tower.baseY + a[0] * tower.height, tower.z + sign * a[2] * tower.depth * .35);
          const q = new THREE.Vector3(tower.x + (-b[1] / 2 + (b[3] || 0)) * tower.width - .18,
            tower.baseY + b[0] * tower.height, tower.z + sign * b[2] * tower.depth * .35);
          lightBeam(permanent, isSail ? 'crownWarm' : 'crownCool', p, q, .85);
        }
      }
    }
    if (tower.style === 'lantern' && !tower.neighborhood) {
      for (const h of [.86, .95]) {
        const perimeter = towerPerimeter(tower);
        for (let i = 0; i < perimeter.length; i++) {
          const a = perimeter[i], b = perimeter[(i + 1) % perimeter.length];
          lightBeam(permanent, 'crownWarm', new THREE.Vector3(tower.x + a[0] * tower.width * 1.047, tower.baseY + tower.height * h, tower.z + a[1] * tower.depth * 1.047),
            new THREE.Vector3(tower.x + b[0] * tower.width * 1.047, tower.baseY + tower.height * h, tower.z + b[1] * tower.depth * 1.047), .55);
        }
      }
    }
  }
  // Low, articulated frontage and yacht sheds maintain a human-scale base.
  for (let i = 0; i < 17; i++) {
    const z = -1130 + i * 115, x = harborCoastX(z) + 29, roof = [9, 14, 11, 17, 8][i % 5];
    part(permanent, 'stone', x, 4 + roof / 2, z, 26, roof, 66);
    part(permanent, 'glass', x - 13.1, 8.7, z, .22, 5.9, 61);
    for (let bay = -3; bay <= 3; bay++) part(permanent, 'stone', x - 13.3, 8.3, z + bay * 9, .55, 8.4, .6);
    part(permanent, 'metal', x, 4 + roof + .36, z, 28.2, .72, 69);
  }
  // Sail-shell convention roof at water's edge, broken into curved strips.
  for (let i = 0; i < 18; i++) {
    const angle = (i + .5) / 18 * Math.PI, x = 1071 + Math.cos(angle) * 28;
    part(permanent, 'stone', x, 12 + Math.sin(angle) * 19, -20, 5.6, .65, 77, { z: -angle + Math.PI / 2 });
  }
  root.add(buildBatches(permanent, 'Harbour podiums · permanent'));
  const mountains = mountainGeometry(THREE); geometries.add(mountains);
  const mountainMaterial = new THREE.MeshStandardMaterial({ color: '#b2b9a9', vertexColors: true, roughness: 1 }); materials.add(mountainMaterial);
  const mountain = new THREE.Mesh(mountains, mountainMaterial); mountain.name = 'Continuous eastern mountain ridge'; mountain.userData.noShadow = true; root.add(mountain);

  // Public viewing instruments sit on the existing accessible shores. Their
  // small, explicit colliders leave the entire 3 m walking route clear.
  const promenadeFeatures = HARBOR_VIEWPOINTS.map(view => ({ id: view.id, x: view.entrance.x + 2.8, z: view.entrance.z + 4.8, y: view.entrance.y }));
  for (const p of promenadeFeatures) {
    colliders.push({ id: `${p.id}-telescope`, kind: 'harbor-telescope', x: p.x, z: p.z, hx: .48, hz: .38, minY: p.y, maxY: p.y + 1.56, physics: true, camera: true });
    colliders.push({ id: `${p.id}-plinth`, kind: 'harbor-viewing-plinth', x: p.x - .3, z: p.z + 1.8, hx: .38, hz: .33, minY: p.y, maxY: p.y + 1.52, physics: true, camera: true });
  }

  function towerDetail(tower, sharedPool = null) {
    const pool = sharedPool || new Map(), x = tower.x, z = tower.z, h = tower.height, base = tower.baseY;
    // Recessed vertical fins remain proportionate to the 3.35/3.9 m storeys.
    if (tower.style === 'residential') {
      for (let y = 18; y < h * .9; y += 6.7) for (const dz of [-tower.depth * .34, 0, tower.depth * .34]) {
        part(pool, 'stone', x - tower.width / 2 - .85, base + y, z + dz, 2.15, .22, tower.depth * .25);
        part(pool, 'metal', x - tower.width / 2 - 1.92, base + y + .51, z + dz, .07, .83, tower.depth * .25);
        part(pool, 'dark', x - tower.width / 2 - .05, base + y + 1.3, z + dz, .15, 2.3, tower.depth * .2);
      }
    } else {
      const profiles = harborTowerProfile(tower);
      for (let ring = 1; ring < profiles.length; ring++) {
        const [lo, wa, da, sa = 0] = profiles[ring - 1], [hi, wb, db, sb = 0] = profiles[ring];
        if (hi === lo) continue;
        for (const side of [-1, 1]) for (const q of [-.32, 0, .32]) {
          const a = new THREE.Vector3(x + (-wa / 2 + sa) * tower.width - .15, base + lo * h, z + q * da * tower.depth);
          const b = new THREE.Vector3(x + (-wb / 2 + sb) * tower.width - .15, base + hi * h, z + q * db * tower.depth);
          if (side === 1) { a.x += wa * tower.width; b.x += wb * tower.width; }
          const line = b.clone().sub(a); temp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), line.clone().normalize());
          const p = a.add(b).multiplyScalar(.5);
          part(pool, 'metal', p.x, p.y, p.z, .26, line.length(), .26, { x: temp.rotation.x, y: temp.rotation.y, z: temp.rotation.z });
        }
      }
    }
    const roof = base + h;
    if (['terrace', 'residential', 'chamfer'].includes(tower.style)) {
      for (const dz of [-tower.depth * .17, tower.depth * .17]) {
        part(pool, 'dark', x, roof + 1, z + dz, tower.width * .27, 2, 5);
        for (let q = -2; q <= 2; q++) part(pool, 'metal', x + q * 1.6, roof + 2.08, z + dz, 1.1, .15, 3.2);
      }
    }
    for (const sign of [-1, 1]) for (const dz of [-tower.depth * .42, tower.depth * .42]) {
      part(pool, 'stone', x + sign * tower.width * .56, base + 15.5, z + dz, 2.5, 1, 5);
      part(pool, 'leaves', x + sign * tower.width * .56, base + 16.5, z + dz, 1.6, 1.1, 2.1, {}, 'sphere');
    }
    return sharedPool || buildBatches(pool, `${tower.name} · streamed facade accessories`);
  }
  function promenadeDetail(p) {
    const pool = new Map();
    part(pool, 'dark', p.x, p.y + .11, p.z, .46, .22, .46, {}, 'cylinder');
    part(pool, 'brass', p.x, p.y + .73, p.z, .095, 1.3, .095, {}, 'cylinder');
    for (const dz of [-.115, .115]) {
      part(pool, 'brass', p.x + .08, p.y + 1.43, p.z + dz, .085, .57, .085, { z: Math.PI / 2 - .12 }, 'cylinder');
      part(pool, 'dark', p.x - .23, p.y + 1.39, p.z + dz, .071, .075, .071, { z: Math.PI / 2 }, 'cylinder');
    }
    // An engraved brass compass in the pavement; one quiet material rather
    // than an oversized floating sign competing with the skyline.
    part(pool, 'brass', p.x - 2.8, p.y + .009, p.z - 4.8, .032, .016, 3.1);
    part(pool, 'brass', p.x - 2.8, p.y + .009, p.z - 4.8, 3.1, .016, .032);
    part(pool, 'stone', p.x - .3, p.y + .72, p.z + 1.8, .58, 1.44, .56);
    part(pool, 'brass', p.x - .3, p.y + 1.47, p.z + 1.8, .75, .045, .64, { z: -.15 });
    return buildBatches(pool, `${p.id} · promenade viewing instruments`);
  }
  const spatialTowers = new Map();
  for (const tower of HARBOR_TOWERS) {
    const id = `harbor-detail-${Math.floor((tower.x - 1000) / 320)}-${Math.floor((tower.z + 1400) / 330)}`;
    if (!spatialTowers.has(id)) spatialTowers.set(id, []); spatialTowers.get(id).push(tower);
  }
  const detailSpecs = [
    ...[...spatialTowers.entries()].map(([id, members]) => {
      const x = members.reduce((n, t) => n + t.x, 0) / members.length, z = members.reduce((n, t) => n + t.z, 0) / members.length;
      const radius = Math.max(...members.map(t => Math.hypot(t.x - x, t.z - z)));
      return { id, x, z, near: 1075 + radius, far: 1205 + radius,
        create() { const pool = new Map(); for (const tower of members) towerDetail(tower, pool); return buildBatches(pool, `${id} · streamed facade accessories`); } };
    }),
    ...promenadeFeatures.map(p => ({ id: p.id, x: p.x, z: p.z, near: 180, far: 225, create: () => promenadeDetail(p) })),
  ];
  function unloadDetail(id) {
    const group = detailResidents.get(id); if (!group) return;
    group.traverse(mesh => { if (mesh.isInstancedMesh) { disposedInstances += mesh.count; mesh.dispose(); } });
    group.removeFromParent(); group.clear(); detailResidents.delete(id);
  }
  function update(viewer, dt = 0, time = .6) {
    const v = viewer?.position || viewer; if (v && Number.isFinite(v.x) && Number.isFinite(v.z)) lastViewer = v;
    elapsed += Math.max(0, dt);
    const hour = time <= 1 ? time * 24 : time;
    nightUniform.value = 1 - clamp(Math.sin((hour - 6) / 12 * Math.PI) * 4, 0, 1);
    solidMaterials.light.emissiveIntensity = .12 + nightUniform.value * .75;
    solidMaterials.crownWarm.emissiveIntensity = nightUniform.value * 2.6;
    solidMaterials.crownCool.emissiveIntensity = nightUniform.value * 2.1;
    solidMaterials.glass.emissiveIntensity = nightUniform.value * .35;
    for (const spec of detailSpecs) {
      const distance = Math.hypot(lastViewer.x - spec.x, lastViewer.z - spec.z);
      if (distance < spec.near && !detailResidents.has(spec.id)) { const group = spec.create(); root.add(group); detailResidents.set(spec.id, group); detailLoads++; }
      else if (distance > spec.far && detailResidents.has(spec.id)) unloadDetail(spec.id);
    }
  }
  function snapshot() {
    let residentInstances = 0, residentMeshes = 0;
    for (const group of detailResidents.values()) group.traverse(mesh => { if (mesh.isInstancedMesh) { residentInstances += mesh.count; residentMeshes++; } });
    return { towers: HARBOR_TOWERS.length, landmarkTowers: towers.length, neighborhoodBuildings: neighborhood.length,
      towerIds: HARBOR_TOWERS.map(t => t.id), maximumRoofHeight: Math.max(...HARBOR_TOWERS.map(t => t.height)),
      viewpoints: HARBOR_VIEWPOINTS, quality: currentQuality, permanentTowers: towerMeshes.length, detailLoads, residentDetailGroups: detailResidents.size,
      residentInstances, residentMeshes, disposedInstances, night: nightUniform.value, scenicOppositeShore: false, enterableBuildings:buildings.length,elapsed };
  }
  const api = { root, colliders, landmarks: HARBOR_VIEWPOINTS, viewpoints: HARBOR_VIEWPOINTS, towers: HARBOR_TOWERS,buildings,
    groundHeightAt: (x,z) => z>=HARBOR_COAST[0].z&&z<=HARBOR_COAST.at(-1).z&&x>=harborCoastX(z)&&x<=2160?3.75:null,
    supportAt: () => null, update, snapshot,
    setInteriorBuilding(id) { const next=buildings.find(b=>b.id===id)||null;if(next===interiorBuilding)return;interiorBuilding=next;applyInteriorVisibility(); },
    setQuality(value) { currentQuality = value; },
    dispose() { for (const id of [...detailResidents.keys()]) unloadDetail(id); root.traverse(mesh => { if (mesh.isInstancedMesh) mesh.dispose(); });
      root.removeFromParent(); for (const g of geometries) g.dispose(); for (const m of materials) m.dispose(); root.clear(); },
  };
  Object.defineProperty(api, 'metadata', { get: snapshot });
  update(lastViewer, 0, .6);
  return api;
}
