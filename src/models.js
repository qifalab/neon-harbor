import { VEHICLE_DIMENSIONS, PLAYER_DIMENSIONS } from './world-config.js';
import { applySurfaceFinish } from './surface-finish.js';

/**
 * Original, metre-scale hero assets. Geometry is authored once, then shared by
 * instances. Paint changes per vehicle; wheels and anatomical joints stay live.
 * +Z is forward. Collision and road support use the same dimensions as the art.
 */
const libraries = new WeakMap();

export function createCar(THREE, color = '#375b68', type = 'sport') {
  const library = getLibrary(THREE);
  if (!library.cars.has(type)) library.cars.set(type, [0, 1, 2].map(detail => buildCar(THREE, type, detail)));
  const templates = library.cars.get(type), group = new THREE.Group(), lod = new THREE.LOD();
  group.name = templates[0].name; group.add(lod); lod.autoUpdate = false;
  for (const [tier, distance] of [0, 35, 100].entries()) {
    const model = templates[tier].clone(true); model.visible = tier === 0; lod.addLevel(model, distance, .12);
  }
  const paint = templates[0].getObjectByName('coachwork').material.clone();
  applySurfaceFinish(paint, 'paint');
  paint.color.set(color);
  group.traverse(node => {
    if (node.isMesh && node.material.name === 'automotive-paint') node.material = paint;
  });
  group.userData.wheels = ['rear-left', 'front-left', 'rear-right', 'front-right']
    .map(name => lod.levels[0].object.getObjectByName(`wheel-${name}`));
  group.userData.wheelsAll = lod.levels.flatMap(level => ['rear-left', 'front-left', 'rear-right', 'front-right']
    .map(name => level.object.getObjectByName(`wheel-${name}`)));
  group.userData.lod = lod;
  // Select once using the gameplay camera, keeping shadow passes on the same
  // tier. The physical vehicle footprint never depends on rendering distance.
  group.userData.updateLOD = camera => {
    group.updateWorldMatrix(true, false); lod.updateWorldMatrix(false, false); lod.update(camera);
  };
  group.userData.color = color;
  group.userData.dimensions = VEHICLE_DIMENSIONS;
  group.userData.policeLights = [];
  for (const level of lod.levels) for (const name of ['police-red', 'police-blue']) {
    const light = level.object.getObjectByName(name);
    if (light) { light.material = light.material.clone(); group.userData.policeLights.push(light.material); }
  }
  // Geometry and the neutral material palette belong to the cached blueprint.
  // Removing a traffic instance must never dispose resources used by its peers.
  group.userData.disposeInstance = () => {
    paint.dispose();
    for (const material of group.userData.policeLights) material.dispose();
  };
  return group;
}

/** Original civilian wardrobe: geometry/materials are shared by each outfit. */
export const CHARACTER_STYLES = Object.freeze([
  { id: 'courier', label: '海港信使', jacket: '#555f60', shirt: '#d0c7b1', pants: '#27323c', skin: '#aa785b', hair: '#211e1c', bag: 'sling', cut: 'jacket', hairCut: 'short' },
  { id: 'architect', label: '建筑师', jacket: '#c6b69b', shirt: '#ebdfca', pants: '#373a39', skin: '#cf9b76', hair: '#35271f', bag: 'tote', cut: 'coat', hairCut: 'bob' },
  { id: 'office', label: '通勤上班族', jacket: '#354653', shirt: '#d5dfda', pants: '#29333e', skin: '#ab8068', hair: '#181b1b', bag: 'none', cut: 'jacket', hairCut: 'short' },
  { id: 'student', label: '大学生', jacket: '#71836c', shirt: '#e6dfcb', pants: '#486071', skin: '#e1b397', hair: '#493226', bag: 'backpack', cut: 'knit', hairCut: 'tied' },
  { id: 'artist', label: '独立设计师', jacket: '#a45b44', shirt: '#e5caa5', pants: '#3d4041', skin: '#865b45', hair: '#1e1916', bag: 'sling', cut: 'knit', hairCut: 'curly' },
  { id: 'visitor', label: '访客', jacket: '#62758a', shirt: '#eee2cf', pants: '#aa9a7e', skin: '#d9ae89', hair: '#594934', bag: 'backpack', cut: 'jacket', hairCut: 'bob' },
  { id: 'retired', label: '老街坊', jacket: '#736676', shirt: '#d7c9b2', pants: '#49423a', skin: '#be8c68', hair: '#9b9890', bag: 'none', cut: 'knit', hairCut: 'short' },
  { id: 'chef', label: '茶餐厅店员', jacket: '#dedacb', shirt: '#657977', pants: '#364041', skin: '#986b52', hair: '#292321', bag: 'tote', cut: 'coat', hairCut: 'tied' },
].map(style => Object.freeze(style)));

export function createCharacter(THREE, options = {}) {
  const requested = typeof options === 'number' ? options : options.style ?? 0;
  const styleIndex = typeof requested === 'string' ? Math.max(0, CHARACTER_STYLES.findIndex(style => style.id === requested))
    : ((Math.floor(requested) % CHARACTER_STYLES.length) + CHARACTER_STYLES.length) % CHARACTER_STYLES.length;
  const style = CHARACTER_STYLES[styleIndex], library = getLibrary(THREE);
  if (!library.characters.has(styleIndex)) library.characters.set(styleIndex, [0, 1, 2].map(detail => buildCharacter(THREE, detail, style)));
  const templates = library.characters.get(styleIndex), group = new THREE.Group(), lod = new THREE.LOD();
  group.add(lod); lod.autoUpdate = false; group.name = templates[0].name;
  for (const [tier, distance] of [0, 15, 45].entries()) {
    const model = templates[tier].clone(true); model.visible = tier === 0; lod.addLevel(model, distance, .12);
  }
  group.userData.dimensions = PLAYER_DIMENSIONS;
  group.userData.style = style.id;
  const joints = ['leftLeg', 'rightLeg', 'leftKnee', 'rightKnee', 'leftArm', 'rightArm', 'leftElbow', 'rightElbow'];
  for (const name of joints) group.userData[name] = lod.levels[0].object.getObjectByName(name);
  const syncJoints = tier => {
    if (!tier) return;
    const active = lod.levels[tier].object;
    for (const name of joints) active.getObjectByName(name).rotation.copy(group.userData[name].rotation);
    active.updateMatrixWorld(true);
  };
  // NPC streaming uses observer distance even when no camera is available; both
  // paths preserve the same stable near-skeleton animation API used by the hero.
  group.userData.setDetail = tier => {
    const selected = Math.max(0, Math.min(2, tier));
    for (const [index, level] of lod.levels.entries()) level.object.visible = index === selected;
    syncJoints(selected);
  };
  group.userData.updateLOD = camera => {
    group.updateWorldMatrix(true, false); lod.updateWorldMatrix(false, false); lod.update(camera);
    syncJoints(lod.getCurrentLevel());
  };
  group.userData.disposeInstance = () => {}; // All meshes belong to the wardrobe cache.
  group.userData.lod = lod;
  return group;
}

function getLibrary(THREE) {
  if (!libraries.has(THREE)) libraries.set(THREE, { cars: new Map(), characters: new Map() });
  return libraries.get(THREE);
}

function buildCar(THREE, type, detail = 0) {
  const group = new THREE.Group(); group.name = `Original NH ${type === 'sport' ? 'Aster coupe' : 'Atlas touring'}`;
  const paint = applySurfaceFinish(new THREE.MeshPhysicalMaterial({ color: '#375b68', roughness: 0.32, metalness: 0.36,
    clearcoat: .78, clearcoatRoughness: 0.23, envMapIntensity: .95 }), 'paint');
  paint.name = 'automotive-paint';
  const trim = new THREE.MeshStandardMaterial({ color: '#12191e', roughness: 0.43, metalness: 0.32 });
  const metal = applySurfaceFinish(new THREE.MeshStandardMaterial({ color: '#a4adb3', roughness: 0.31, metalness: 0.88 }), 'metal');
  const leather = applySurfaceFinish(new THREE.MeshStandardMaterial({ color: '#242e32', roughness: 0.72 }), 'leather');
  const glass = new THREE.MeshPhysicalMaterial({ color: '#819fa9', metalness: 0.08, roughness: 0.12,
    transparent: true, opacity: 0.67, depthWrite: false, clearcoat: 1, envMapIntensity: 1.1, side: THREE.DoubleSide });
  const frontLight = new THREE.MeshStandardMaterial({ color: '#e4f2f5', emissive: '#c6e1ec', emissiveIntensity: 1.1, roughness: 0.23 });
  const rearLight = new THREE.MeshStandardMaterial({ color: '#8e202a', emissive: '#c83036', emissiveIntensity: 0.7, roughness: 0.25 });
  const heightOffset = type === 'sport' ? 0 : type === 'van' ? 0.11 : 0.055;
  const density = [1, .35, .12][detail];
  const grid = (rows, columns, point, reverse = false) => gridGeometry(THREE,
    Math.max(3, Math.round(rows * density)), Math.max(4, Math.round(columns * (detail ? .5 : 1))), point, reverse);
  const add = (geometry, material, x = 0, y = 0, z = 0, name = '') => {
    const part = new THREE.Mesh(geometry, material); part.position.set(x, y, z);
    part.name = name; part.castShadow = true; part.receiveShadow = true; group.add(part); return part;
  };
  const rounded = (material, x, y, z, width, height, depth, radius = 0.025) =>
    add(roundedBox(THREE, width, height, depth, radius, detail ? 1 : 4), material, x, y, z);
  const ellipsoid = (material, x, y, z, sx, sy, sz) => {
    const geometry = new THREE.SphereGeometry(1, [20, 12, 8][detail], [12, 8, 6][detail]); geometry.scale(sx, sy, sz);
    return add(geometry, material, x, y, z);
  };
  const line = (material, points, radius = 0.012) => add(tube(THREE, points, radius, density, detail ? 4 : 6), material);

  // Coachwork is a continuously curved cross-section loft, with real wheel-arch
  // openings in its side skins. No stacked rectangular primitives form the shell.
  const profile = [
    [-2.25, .73, .67, .11], [-2.08, .90, .77, .13], [-1.70, .97, .91, .12],
    [-1.39, .985, .96, .13], [-.82, .955, .91, .15], [0, .94, .88, .16],
    [.86, .96, .90, .13], [1.40, .99, .955, .07], [1.88, .95, .78, .15],
    [2.16, .85, .66, .13], [2.25, .73, .62, .09],
  ];
  const shellAt = z => interpolateProfile(profile, z);
  const body = grid(112, 32, (row, col) => {
    const z = -2.25 + row * 4.5, [width, belt, crown] = shellAt(z);
    const theta = col * Math.PI;
    return [width * Math.cos(theta), belt + crown * Math.pow(Math.sin(theta), .6), z];
  });
  add(body, paint, 0, 0, 0, 'coachwork');
  for (const sign of [-1, 1]) {
    add(grid(160, 6, (row, col) => {
      const z = -2.25 + row * 4.5, [width, belt] = shellAt(z);
      let low = .30 + Math.max(0, Math.abs(z) - 1.92) * .28;
      for (const wheelZ of [VEHICLE_DIMENSIONS.wheelRearZ, VEHICLE_DIMENSIONS.wheelFrontZ]) {
        const delta = Math.abs(z - wheelZ), archRadius = .487;
        if (delta < archRadius) low = Math.max(low, VEHICLE_DIMENSIONS.wheelRadius + Math.sqrt(archRadius ** 2 - delta ** 2));
      }
      const y = low + (belt - low) * col;
      return [sign * (width - .028 * (1 - col) ** 2), y, z];
    }, sign < 0), paint);
    // Narrow paint lips trace the cutout, and a recessed liner hides the chassis.
    if (detail < 2) for (const wheelZ of [VEHICLE_DIMENSIONS.wheelRearZ, VEHICLE_DIMENSIONS.wheelFrontZ]) {
      const points = [];
      for (let i = 0; i <= 24; i++) {
        const angle = Math.PI * i / 24;
        const z = wheelZ + Math.cos(angle) * .484;
        points.push([sign * (shellAt(z)[0] + .002), .43 + Math.sin(angle) * .484, z]);
      }
      line(paint, points, .017);
    }
    line(trim, [[sign * .945, .335, -.85], [sign * .935, .325, 0], [sign * .96, .335, .86]], .045);
  }
  rounded(trim, 0, .29, 0, 1.62, .10, 4.2, .04);
  for (const end of [-1, 1]) {
    // Close the complete end of the loft. Bumper trim alone leaves a visible
    // hole between the rear deck and lower fascia from a low chase camera.
    const z = end * 2.25, [width, belt, crown] = shellAt(z);
    add(grid(5, 32, (r, c) => {
      const theta = c * Math.PI, x = width * Math.cos(theta);
      return [x, .39 + r * (belt + crown * Math.pow(Math.sin(theta), .6) - .39), z];
    }, end > 0), paint);
  }
  for (const [z, y, width] of [[2.19, .53, 1.57], [-2.20, .55, 1.62]])
    rounded(paint, 0, y, z, width, .30, .16, .07);

  // A sloping windscreen, long roof and rounded quarter windows share a surface.
  // The opaque roof overlays just its central area; the cabin remains see-through.
  const cabinProfile = [
    [-1.31, .81, 1.025], [-1.12, .81, 1.19 + heightOffset * .6],
    [-.80, .775, 1.415 + heightOffset], [-.52, .75, 1.465 + heightOffset],
    [.13, .728, 1.455 + heightOffset], [.32, .75, 1.39 + heightOffset],
    [.67, .81, 1.145 + heightOffset * .35], [.87, .815, 1.015],
  ];
  const cabinAt = z => interpolateProfile(cabinProfile, z);
  const cabinVertex = (z, u, raise = 0) => {
    const [width, top] = cabinAt(z);
    const x = Math.sin(u * Math.PI / 2) * width;
    const dome = Math.pow(Math.cos(u * Math.PI / 2), .32);
    return [x, 1.005 + (top - 1.005) * dome + raise, z];
  };
  add(grid(44, 30, (r, c) => cabinVertex(-1.31 + r * 2.18, -1 + c * 2), true), glass);
  add(grid(18, 22, (r, c) => cabinVertex(-.79 + r * 1.03, -.66 + c * 1.32, .009), true), paint);
  for (const sign of [-1, 1]) {
    const frontPillar = [], rearPillar = [], sill = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      frontPillar.push(cabinVertex(.25 + t * .59, sign * (.66 + t * .34), .012));
      rearPillar.push(cabinVertex(-.78 - t * .51, sign * (.66 + t * .34), .012));
      sill.push(cabinVertex(-1.30 + t * 2.16, sign, .005));
    }
    line(paint, frontPillar, .031); line(paint, rearPillar, .048); line(metal, sill, .012);
    const bPillar = [];
    for (let i = 0; i <= 8; i++) bPillar.push(cabinVertex(-.43, sign * (.68 + i / 8 * .32), .012));
    line(trim, bPillar, .025);
    // Flush handles and a thin shut-line articulate the door without dark outlines.
    rounded(metal, sign * .957, .865, -.55, .018, .035, .21, .008);
    if (detail < 2) line(trim, [[sign * .965, .92, -.89], [sign * .946, .69, -.84], [sign * .919, .40, -.76],
      [sign * .919, .37, .57], [sign * .954, .75, .68], [sign * .958, .91, .65]], .006);
    line(trim, [[sign * .78, 1.04, .55], [sign * 1.025, 1.012, .48]], .029);
    ellipsoid(paint, sign * 1.045, 1.032, .49, .09, .057, .137);
    ellipsoid(glass, sign * 1.046, 1.032, .371, .074, .044, .013);
  }
  // Recessed intake, machined bars and four-element LED lamps are easy to read
  // from the chase camera without turning into oversized glowing cubes.
  rounded(trim, 0, .53, 2.282, .87, .23, .025, .012);
  if (detail < 2) for (let i = -3; i <= 3; i++) rounded(metal, i * .106, .526, 2.296, .012, .16, .008, .003);
  for (const sign of [-1, 1]) {
    rounded(trim, sign * .65, .545, 2.238, .28, .16, .05, .025);
    if (detail < 2) for (const y of [.515, .55, .585]) rounded(metal, sign * .65, y, 2.265, .22, .008, .008, .003);
    const lamp = rounded(trim, sign * .64, .715, 2.124, .40, .105, .14, .042);
    lamp.rotation.y = sign * .15;
    const led = rounded(frontLight, sign * .64, .744, 2.197, .33, .027, .025, .011);
    led.rotation.y = sign * .15;
    if (detail < 2) for (let i = 0; i < 3; i++) ellipsoid(frontLight, sign * (.52 + i * .095), .708, 2.189, .025, .017, .010);
    rounded(rearLight, sign * .60, .78, -2.137, .52, .070, .034, .015);
    rounded(trim, sign * .62, .365, -2.198, .39, .12, .08, .03);
    const exhaust = new THREE.CylinderGeometry(.065, .065, .12, 16, 1, true); exhaust.rotateX(Math.PI / 2);
    add(exhaust, metal, sign * .62, .365, -2.233);
  }
  rounded(trim, 0, .765, -2.141, .53, .025, .024, .005);
  rounded(metal, 0, .58, -2.291, .43, .12, .012, .011);
  rounded(trim, 0, .58, -2.299, .31, .031, .002, .001);
  // An original, abstract NH lozenge (no third-party automotive branding).
  const emblem = rounded(metal, 0, .74, 2.208, .078, .042, .01, .006); emblem.rotation.z = .24;

  if (detail < 2) for (const x of [-.38, .38]) {
    rounded(leather, x, .73, -.30, .49, .16, .61, .072);
    const seat = rounded(leather, x, .99, -.58, .49, .52, .19, .073); seat.rotation.x = -.14;
    rounded(leather, x, 1.25, -.62, .245, .19, .135, .055);
    for (const dx of [-.20, .20]) ellipsoid(leather, x + dx, .97, -.49, .064, .235, .09);
  }
  if (detail < 2) {
  rounded(leather, 0, .72, -.98, 1.27, .15, .38, .06);
  rounded(leather, 0, 1.015, .54, 1.46, .13, .34, .055);
  rounded(trim, 0, .82, -.06, .21, .19, .76, .04);
  const steeringGeometry = new THREE.TorusGeometry(.16, .017, 8, 28); steeringGeometry.rotateX(-.48);
  add(steeringGeometry, trim, -.39, 1.088, .295);
  rounded(metal, -.39, 1.065, .29, .12, .045, .02, .011);
  }

  // Sharing two wheel meshes preserves distinct rubber/metal response at modest
  // draw-call cost. The torus is exact radius .43 and rolls around local X.
  const wheelArt = buildWheel(THREE, detail);
  for (const [side, sign] of [['left', -1], ['right', 1]]) for (const [axle, z] of [
    ['rear', VEHICLE_DIMENSIONS.wheelRearZ], ['front', VEHICLE_DIMENSIONS.wheelFrontZ],
  ]) {
    const wheel = wheelArt.clone(true); wheel.name = `wheel-${axle}-${side}`;
    wheel.position.set(sign * VEHICLE_DIMENSIONS.wheelTrackHalf, VEHICLE_DIMENSIONS.wheelRadius, z);
    group.add(wheel);
  }
  mergeStaticParts(THREE, group);
  // Keep identifiable coachwork and separate siren materials for runtime flashes.
  group.children.find(child => child.isMesh && child.material === paint).name = 'coachwork';
  if (type === 'police') {
    rounded(trim, 0, 1.545 + heightOffset, -.13, 1.1, .06, .25, .025);
    for (const [x, name, color] of [[-.29, 'police-red', '#ff3c49'], [.29, 'police-blue', '#3984ff']]) {
      const material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.7, roughness: .2 });
      const lamp = rounded(material, x, 1.605 + heightOffset, -.13, .45, .075, .21, .025); lamp.name = name;
    }
  }
  return group;
}

function buildWheel(THREE, detail = 0) {
  const wheel = new THREE.Group();
  const radial = [48, 24, 12][detail];
  const tire = new THREE.TorusGeometry(.3375, .0925, detail ? 8 : 12, radial);
  tire.scale(1, 1, .14 / .0925); tire.rotateY(Math.PI / 2);
  const rubber = new THREE.MeshStandardMaterial({ color: '#171b1e', roughness: .92 });
  const tireMesh = new THREE.Mesh(tire, rubber); tireMesh.castShadow = true; wheel.add(tireMesh);
  const pieces = [];
  const add = (geometry, color) => pieces.push({ geometry, color });
  const disc = new THREE.CylinderGeometry(.281, .281, .208, detail ? radial : 36); disc.rotateZ(Math.PI / 2); add(disc, detail === 2 ? '#9aa4aa' : '#353b40');
  for (const side of [-1, 1]) {
    if (detail === 2) continue;
    const lip = new THREE.TorusGeometry(.266, .012, detail ? 4 : 6, detail ? radial : 36); lip.rotateY(Math.PI / 2); lip.translate(side * .139, 0, 0); add(lip, '#c5cbd0');
    const hub = new THREE.CylinderGeometry(.069, .069, .018, detail ? 8 : 16); hub.rotateZ(Math.PI / 2); hub.translate(side * .14, 0, 0); add(hub, '#a7b0b7');
    for (let spoke = 0; spoke < 5; spoke++) for (const split of detail ? [0] : [-1, 1]) {
      const angle = spoke * Math.PI * 2 / 5 + split * .09;
      const spokeGeometry = roundedBox(THREE, .023, .218, .022, .006, detail ? 1 : 4);
      spokeGeometry.rotateX(angle); spokeGeometry.translate(side * .141, Math.cos(angle) * .151, Math.sin(angle) * .151); add(spokeGeometry, '#b9c2c9');
    }
    if (!detail) for (let hole = 0; hole < 12; hole++) {
      const angle = hole * Math.PI / 6, dot = new THREE.SphereGeometry(.008, 5, 4);
      dot.scale(.25, 1, 1); dot.translate(side * .106, Math.cos(angle) * .22, Math.sin(angle) * .22); add(dot, '#171b1e');
    }
  }
  const alloy = new THREE.Mesh(mergeColoredGeometry(THREE, pieces), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .30, metalness: .78 }));
  alloy.castShadow = true; wheel.add(alloy);
  return wheel;
}

function buildCharacter(THREE, detail = 0, style = CHARACTER_STYLES[0]) {
  const root = new THREE.Group(); root.name = `${style.label} · original anatomical model`;
  const colors = { skin: '#aa785b', skinLight: '#bf8f70', hair: '#211e1c', jacket: '#545e60',
    seam: '#353f40', shirt: '#c2b8a5', pants: '#202b35', stitch: '#54616a', shoe: '#343a3b', sole: '#a4a59b', eyes: '#282725', ...style };
  colors.skinLight = '#' + new THREE.Color(style.skin).lerp(new THREE.Color('#f5dcc4'), .12).getHexString();
  colors.seam = '#' + new THREE.Color(style.jacket).multiplyScalar(.72).getHexString();
  colors.stitch = '#' + new THREE.Color(style.pants).lerp(new THREE.Color('#c3b8a0'), .14).getHexString();
  const collection = new Map();
  const density = [1, .4, .2][detail];
  const loft = (profile, rows, columns) => loftY(THREE, profile,
    Math.max(3, Math.round(rows * density)), Math.max(6, Math.round(columns * (detail ? .5 : 1))));
  const put = (parent, geometry, color) => {
    if (!collection.has(parent)) collection.set(parent, new Map());
    const finish = ['skin','skinLight'].includes(color) ? 'skin'
      : ['jacket','shirt','pants','seam','stitch'].includes(color) ? 'fabric' : color === 'shoe' ? 'leather' : 'neutral';
    const batches=collection.get(parent);
    if (!batches.has(finish)) batches.set(finish, []);
    // Small folds belong to the cloth mesh, not a glossy colour texture. Keep
    // joints and the original collision envelope unchanged at every LOD.
    if (finish === 'fabric' && detail === 0 && geometry.attributes.position.count > 180) {
      const positions=geometry.attributes.position, normals=geometry.attributes.normal;
      geometry.computeBoundingBox();const box=geometry.boundingBox;
      for(let i=0;i<positions.count;i++) {
        const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i);
        const edge=Math.sin(Math.PI*(y-box.min.y)/Math.max(.001,box.max.y-box.min.y));
        const fold=(Math.sin(y*64+x*19)*.0015+Math.sin(y*113-z*37)*.0007)*edge;
        positions.setXYZ(i,x+normals.getX(i)*fold,y,z+normals.getZ(i)*fold);
      }
      positions.needsUpdate=true;geometry.computeVertexNormals();
    }
    batches.get(finish).push({ geometry, color: colors[color] || color });
  };
  const oval = (parent, color, x, y, z, sx, sy, sz, segments = 16) => {
    if (detail === 2 && Math.max(sx, sy, sz) < .038) return;
    const geometry = new THREE.SphereGeometry(1, detail ? Math.max(6, Math.round(segments * .5)) : segments,
      [12, 8, 6][detail]); geometry.scale(sx, sy, sz); geometry.translate(x, y, z); put(parent, geometry, color);
  };
  const rounded = (parent, color, x, y, z, w, h, d, r = .02) => {
    const geometry = roundedBox(THREE, w, h, d, r, detail ? 1 : 4); geometry.translate(x, y, z); put(parent, geometry, color);
  };
  const stroke = (parent, color, points, radius = .004) => {
    if (detail === 2 && radius < .014) return;
    put(parent, tube(THREE, points, radius, density, detail ? 4 : 6), color);
  };
  const joint = (parent, name, x, y, z) => { const node = new THREE.Group(); node.name = name; node.position.set(x, y, z); parent.add(node); return node; };
  const torso = loft([[style.cut === 'coat' ? .81 : .90, style.cut === 'coat' ? .192 : .15, .102], [.98, .17, .11], [1.13, .175, .123],
    [1.26, .205, .128], [1.35, .224, .112], [1.40, .155, .088]], 32, 24);
  put(root, torso, 'jacket');
  oval(root, 'pants', 0, .915, 0, .177, .107, .117);
  oval(root, 'skin', 0, 1.435, 0, .054, .070, .054);
  // Facial silhouette uses chin, cheekbones, brow, nose and ears, rather than a
  // cube wearing sunglasses. The ears/nose also make heading legible in motion.
  put(root, loft([[1.47, .055, .058], [1.50, .078, .080], [1.55, .101, .092],
    [1.62, .112, .104], [1.69, .109, .098], [1.735, .077, .073], [1.764, .018, .024]], 28, 28), 'skin');
  for (const sign of [-1, 1]) {
    oval(root, 'skin', sign * .116, 1.599, -.004, .022, .039, .022);
    oval(root, '#b8b6aa', sign * .042, 1.631, .096, .013, .004, .004, 12);
    if (detail === 0) {
      stroke(root, 'skinLight', [[sign * .028, 1.636, .097], [sign * .042, 1.639, .099], [sign * .057, 1.636, .094]], .0025);
      oval(root, 'skinLight', sign * .065, 1.594, .078, .029, .017, .011, 12);
    }
    oval(root, 'eyes', sign * .042, 1.631, .101, .005, .0045, .0025, 12);
    stroke(root, 'hair', [[sign * .025, 1.651, .101], [sign * .045, 1.655, .100], [sign * .061, 1.651, .089]], .004);
  }
  oval(root, 'skinLight', 0, 1.611, .102, .014, .035, .022);
  oval(root, 'skin', 0, 1.589, .116, .021, .013, .020);
  stroke(root, '#865e4a', [[-.022, 1.553, .088], [0, 1.551, .094], [.022, 1.553, .088]], .003);
  // Cropped, swept-back hair cap, leaving the forehead and ears exposed.
  const hair = gridGeometry(THREE, detail ? 6 : 16, detail ? 12 : 32, (r, c) => {
    const phi = c * Math.PI * 2, front = Math.sin(phi);
    const theta = r * (1.68 - .30 * Math.max(0, front) + (style.hairCut === 'bob' ? .65 : .12) * Math.max(0, -front));
    return [Math.cos(phi) * Math.sin(theta) * .122, 1.667 + Math.cos(theta) * .123,
      -.008 + Math.sin(phi) * Math.sin(theta) * .114];
  });
  put(root, hair, 'hair');
  if (style.hairCut === 'tied') {
    oval(root, 'hair', 0, 1.646, -.135, .065, .070, .063);
    oval(root, 'hair', 0, 1.558, -.136, .036, .094, .030);
  }
  if (style.hairCut === 'curly' && detail < 2) for (let i = 0; i < 12; i++) {
    const angle = i * Math.PI / 6;
    oval(root, 'hair', Math.cos(angle) * .098, 1.711 + (i % 2) * .019, Math.sin(angle) * .081 - .008, .030, .044, .031, 8);
  }
  for (let i = -3; i <= 3; i++) stroke(root, 'hair', [[i * .027, 1.77, .005], [i * .03, 1.752, -.055], [i * .025, 1.716, -.1]], .006);

  if (style.cut !== 'knit') {
    rounded(root, 'shirt', 0, 1.31, .113, .095, .17, .019, .012);
    for (const sign of [-1, 1]) {
      stroke(root, 'seam', [[sign * .055, 1.407, .043], [sign * .081, 1.36, .12], [sign * .025, 1.20, .13]], .018);
      stroke(root, 'seam', [[sign * .162, 1.33, .082], [sign * .142, 1.20, .089], [sign * .145, 1.04, .084]], .005);
      stroke(root, 'stitch', [[sign * .111, 1.14, .112], [sign * .119, 1.073, .110]], .003);
    }
    stroke(root, '#727c7d', [[0, .962, .114], [0, 1.09, .129], [0, 1.29, .13]], .003);
    if (style.cut === 'coat' && detail < 2) for (const y of [.98, 1.09, 1.20]) oval(root, 'seam', .04, y, .124, .008, .008, .003, 8);
  } else {
    // Rounded crewneck, ribbed hem and shoulder seams distinguish knitwear.
    stroke(root, 'shirt', [[-.074, 1.401, .067], [0, 1.375, .095], [.074, 1.401, .067]], .013);
    stroke(root, 'seam', [[-.17, 1.31, .073], [-.195, 1.34, .051], [-.204, 1.367, .007]], .004);
    if (detail === 0) for (let i = -5; i <= 5; i++) stroke(root, 'seam', [[i * .026, .933, .106], [i * .026, .965, .111]], .002);
  }
  rounded(root, 'seam', 0, .947, 0, .306, .043, .215, .021);
  if (style.bag === 'sling') {
    oval(root, '#4a4540', .025, 1.14, -.126, .142, .187, .067);
    stroke(root, '#685d51', [[-.145, 1.36, -.05], [-.13, 1.38, .045], [-.025, 1.20, .141], [.15, .985, .056]], .012);
  } else if (style.bag === 'backpack') {
    rounded(root, '#534e42', 0, 1.13, -.167, .26, .34, .13, .055);
    rounded(root, '#736b57', 0, 1.067, -.241, .21, .15, .035, .024);
    for (const sign of [-1, 1]) stroke(root, '#6e6654', [[sign * .11, 1.00, -.14], [sign * .144, 1.34, -.05], [sign * .142, 1.36, .07], [sign * .145, 1.07, .099]], .012);
  } else if (style.bag === 'tote') {
    rounded(root, '#b2a58b', .20, .91, -.095, .10, .30, .25, .037);
    stroke(root, '#897b62', [[.20, 1.025, -.17], [.196, 1.36, -.02], [.20, 1.025, .01]], .009);
  }

  for (const [side, sign] of [['left', -1], ['right', 1]]) {
    const leg = joint(root, `${side}Leg`, sign * .103, .91, 0);
    put(leg, loft([[ -.42, .074, .079], [-.26, .086, .094], [-.09, .095, .11], [.015, .091, .107]], 18, 16), 'pants');
    const knee = joint(leg, `${side}Knee`, 0, -.42, 0);
    oval(knee, 'pants', 0, .005, .003, .070, .058, .073);
    put(knee, loft([[-.345, .063, .064], [-.24, .063, .066], [-.09, .073, .082], [.005, .073, .077]], 16, 16), 'pants');
    stroke(knee, 'stitch', [[sign * .064, -.05, 0], [sign * .059, -.18, 0], [sign * .055, -.31, 0]], .003);
    // Sole sits 5mm over ground; the visual bounds are tested against the capsule.
    oval(knee, 'sole', 0, -.4375, .043, .080, .0475, .145);
    oval(knee, 'shoe', 0, -.414, .047, .077, .053, .138);
    for (let lace = 0; lace < 3; lace++) stroke(knee, '#9c9f98', [[-.041, -.368, .005 + lace * .025], [0, -.363, .018 + lace * .025], [.041, -.368, .005 + lace * .025]], .003);

    const arm = joint(root, `${side}Arm`, sign * .234, 1.345, 0);
    const sleeve = loft([[-.265, .061, .065], [-.12, .070, .076], [0, .085, .085]], 14, 16);
    sleeve.translate(sign * .017, 0, 0); put(arm, sleeve, 'jacket');
    oval(arm, 'jacket', sign * .01, -.015, 0, .085, .091, .083);
    const elbow = joint(arm, `${side}Elbow`, sign * .018, -.27, 0);
    oval(elbow, 'jacket', 0, .013, 0, .061, .061, .065);
    put(elbow, loft([[-.207, .044, .047], [-.12, .053, .058], [.01, .058, .061]], 14, 16), 'jacket');
    rounded(elbow, 'seam', 0, -.201, 0, .09, .043, .097, .016);
    oval(elbow, 'skin', 0, -.250, .009, .040, .061, .034);
    for (let finger = 0; finger < 4; finger++) oval(elbow, 'skin', -.024 + finger * .016, -.298, .019, .009, .033 - Math.abs(finger - 1.5) * .004, .012, 8);
    oval(elbow, 'skinLight', -sign * .039, -.253, .037, .016, .036, .018, 10);
    if (side === 'left') rounded(elbow, '#747b7c', 0, -.215, .048, .045, .039, .011, .005);
  }
  // Nine shared meshes retain separate knees/elbows while drawing each colored
  // limb in one call; every surface has smooth analytic/interpolated normals.
  const wardrobe = new Map();
  for (const [parent, batches] of collection) for (const [finish,pieces] of batches) {
    if(!wardrobe.has(finish)) {
      const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:finish==='skin'?.61:finish==='fabric'?.94:finish==='leather'?.66:.83});
      material.name=`Character · ${finish}`;
      if(finish!=='neutral')applySurfaceFinish(material,finish);
      wardrobe.set(finish,material);
    }
    const mesh = new THREE.Mesh(mergeColoredGeometry(THREE, pieces), wardrobe.get(finish));
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh);
  }
  return root;
}

function interpolateProfile(points, t) {
  let segment = 0;
  while (segment < points.length - 2 && points[segment + 1][0] < t) segment++;
  const b = points[segment], c = points[segment + 1], a = points[Math.max(0, segment - 1)], d = points[Math.min(points.length - 1, segment + 2)];
  const u = Math.max(0, Math.min(1, (t - b[0]) / (c[0] - b[0])));
  return b.slice(1).map((value, i) => {
    const k = i + 1;
    const smooth = .5 * ((2 * value) + (-a[k] + c[k]) * u + (2 * a[k] - 5 * value + 4 * c[k] - d[k]) * u * u + (-a[k] + 3 * value - 3 * c[k] + d[k]) * u * u * u);
    return Math.max(Math.min(value, c[k]), Math.min(Math.max(value, c[k]), smooth));
  });
}

function gridGeometry(THREE, rows, columns, point, reverse = false) {
  const positions = [], uv = [], indices = [];
  for (let r = 0; r <= rows; r++) for (let c = 0; c <= columns; c++) {
    positions.push(...point(r / rows, c / columns)); uv.push(c / columns, r / rows);
    if (r === rows || c === columns) continue;
    const a = r * (columns + 1) + c, b = a + 1, e = a + columns + 1, d = e + 1;
    indices.push(...(reverse ? [a, e, b, b, e, d] : [a, b, e, b, d, e]));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

function loftY(THREE, profile, rows, columns) {
  const geometry = gridGeometry(THREE, rows, columns, (r, c) => {
    const y = profile[0][0] + (profile.at(-1)[0] - profile[0][0]) * r;
    const [width, depth] = interpolateProfile(profile, y), angle = c * Math.PI * 2;
    return [Math.cos(angle) * width, y, Math.sin(angle) * depth];
  }, true);
  // Closed cuffs/necklines prevent a camera looking through the open tube ends.
  const pieces = [{ geometry }];
  for (const [ring, direction] of [[profile[0], -1], [profile.at(-1), 1]]) {
    const cap = new THREE.CircleGeometry(1, columns); cap.rotateX(-direction * Math.PI / 2);
    cap.scale(ring[1], 1, ring[2]); cap.translate(0, ring[0], 0); pieces.push({ geometry: cap });
  }
  return mergeColoredGeometry(THREE, pieces, false);
}

function roundedBox(THREE, width, height, depth, radius, subdivisions = 4) {
  const geometry = new THREE.BoxGeometry(width, height, depth, subdivisions, subdivisions, subdivisions);
  const position = geometry.attributes.position, normal = geometry.attributes.normal;
  const r = Math.min(radius, width / 2, height / 2, depth / 2), limits = [width / 2 - r, height / 2 - r, depth / 2 - r];
  for (let i = 0; i < position.count; i++) {
    const p = [position.getX(i), position.getY(i), position.getZ(i)];
    const inner = p.map((value, k) => Math.max(-limits[k], Math.min(limits[k], value)));
    const delta = p.map((value, k) => value - inner[k]), length = Math.hypot(...delta) || 1;
    position.setXYZ(i, ...inner.map((value, k) => value + delta[k] / length * r));
    normal.setXYZ(i, ...delta.map(value => value / length));
  }
  return geometry;
}

function tube(THREE, points, radius, density = 1, sides = 6) {
  const curve = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point)));
  return new THREE.TubeGeometry(curve, Math.max(3, Math.round(points.length * 2 * density)), radius, sides, false);
}

function mergeStaticParts(THREE, group) {
  const batches = new Map();
  for (const mesh of [...group.children]) {
    if (!mesh.isMesh) continue;
    mesh.updateMatrix(); const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrix);
    if (!batches.has(mesh.material)) batches.set(mesh.material, []);
    batches.get(mesh.material).push({ geometry }); group.remove(mesh); mesh.geometry.dispose();
  }
  for (const [material, pieces] of batches) {
    const mesh = new THREE.Mesh(mergeColoredGeometry(THREE, pieces, false), material);
    mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
  }
}

function mergeColoredGeometry(THREE, pieces, colored = true) {
  const positions = [], normals = [], colors = [];
  for (const { geometry, color } of pieces) {
    const expanded = geometry.index ? geometry.toNonIndexed() : geometry;
    const position = expanded.attributes.position, normal = expanded.attributes.normal;
    const rgb = colored ? new THREE.Color(color) : null;
    for (let i = 0; i < position.count; i++) {
      positions.push(position.getX(i), position.getY(i), position.getZ(i));
      normals.push(normal.getX(i), normal.getY(i), normal.getZ(i));
      if (colored) colors.push(rgb.r, rgb.g, rgb.b);
    }
    if (expanded !== geometry) expanded.dispose(); geometry.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  if (colored) merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return merged;
}
