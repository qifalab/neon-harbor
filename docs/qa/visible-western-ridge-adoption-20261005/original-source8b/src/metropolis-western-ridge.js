import { applySurfaceFinish } from './surface-finish.js';

/** Original, editable recipe for the ten decorative west-channel mountains.
 * This mesh supplies no collision or walking support. All old hill bounds,
 * and the twelve northern cone vertices/world normals, remain unchanged.
 */
export const WESTERN_RIDGE_RECIPE = Object.freeze({
  version: 1, angularSegments: 32, radialRings: 12, hills: 10,
  maxHillTriangles: 3000, maxWesternTriangles: 30000, maxPreparedBytes: 300000,
  finish: Object.freeze({ kind: 'mineral', scale: .015, strength: .45 }),
  palette: Object.freeze({ grass: '#50674e', grassWarm: '#657153', soil: '#71684f', rock: '#858879' }),
});

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const gaussian = (v, width) => Math.exp(-((v / width) ** 2));

/** Broad wandering spine, lower shoulder/spur and an incised curved drainage.
 * Every sample belongs to a continuous height field, rather than moving cone
 * vertices with independent random noise. The submerged skirt closes it.
 */
function ridgeSample(u, v, hill) {
  const phase = hill * .71, r2 = u * u + v * v;
  const spineX = -.12 + .085 * Math.sin(v * 2.6 + phase) + .035 * Math.sin(v * 5.1 - phase);
  const longitudinal = .72 + .28 * gaussian(v - .11 * Math.sin(phase), .66);
  const spine = .62 * gaussian(u - spineX, .30) * longitudinal;
  const shoulder = .27 * gaussian(u + .39, .30) * gaussian(v - .17, .61);
  const spur = .30 * gaussian(u - .36, .25) * gaussian(v + .32 + .08 * Math.cos(phase), .49);
  const drainageX = .13 + .085 * Math.sin(v * 3.3 + phase * .6);
  const drainage = .16 * gaussian(u - drainageX, .075) * gaussian(v - .16, .71);
  const foothill = .18 + .045 * Math.cos(v * 4.2 + phase) * Math.cos(u * 3.5 - phase);
  return {
    height: Math.max(0, .001 + foothill + spine + shoulder + spur - drainage) * Math.max(0, 1 - r2) ** .72,
    drainage: clamp(drainage / .16),
  };
}

function expectedTransform(i) {
  return i < 10
    ? [-860 - i % 3 * 55, 35 + i % 4 * 12, -580 - i * 86, 70 + i % 3 * 18, 95 + i % 4 * 28, 85, 0, 0, 0]
    : [-780 + (i - 10) * 142, 30 + (i - 10) % 3 * 14, -1490 - (i - 10) % 2 * 35, 132, 140 + (i - 10) % 4 * 30, 148, 0, 0, 0];
}

function validateSourceBatch(batch, sourceGeometry) {
  if (batch.kind !== 'cone' || batch.material !== 'leaves' || batch.transforms.length !== 22 ||
      !Array.isArray(batch.buildings) || batch.buildings.length !== 22 || batch.buildings.some(id => id !== null) || sourceGeometry.type !== 'ConeGeometry' ||
      sourceGeometry.parameters.radius !== 1 || sourceGeometry.parameters.height !== 1 ||
      sourceGeometry.parameters.radialSegments !== 12 || sourceGeometry.parameters.heightSegments !== 1 ||
      sourceGeometry.parameters.openEnded || sourceGeometry.parameters.thetaStart !== 0 ||
      sourceGeometry.parameters.thetaLength !== Math.PI * 2 || sourceGeometry.index.count !== 72)
    throw new Error('Western ridge requires the original permanent 22-hill cone/leaves batch');
  for (let i = 0; i < 22; i++) {
    const expected = expectedTransform(i), actual = batch.transforms[i];
    if (actual.length !== 9 || actual.some((n, j) => !Number.isFinite(n) || Math.abs(n - expected[j]) > 1e-9))
      throw new Error(`Western ridge source transform changed at hill ${i}`);
  }
}

function installMountainSurface(material) {
  applySurfaceFinish(material, WESTERN_RIDGE_RECIPE.finish.kind, WESTERN_RIDGE_RECIPE.finish);
  const previousCompile = material.onBeforeCompile, previousKey = material.customProgramCacheKey();
  material.onBeforeCompile = shader => {
    previousCompile(shader);
    shader.vertexShader = shader.vertexShader.replace('#include <common>',
      '#include <common>\nattribute vec2 mountainSurface;\nvarying vec2 vMountainSurface;');
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvMountainSurface = mountainSurface;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>',
      '#include <common>\nvarying vec2 vMountainSurface;');
    // Surface response is per vertex. Northern originals have mask zero,
    // so their uniform .93 response receives no extra grain/tone/relief.
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>',
      '#include <roughnessmap_fragment>\nroughnessFactor = vMountainSurface.x;');
    shader.fragmentShader = shader.fragmentShader.replace('roughnessFactor = clamp(roughnessFactor +',
      'roughnessFactor = clamp(roughnessFactor + vMountainSurface.y *');
    shader.fragmentShader = shader.fragmentShader.replace('diffuseColor.rgb *= 1.0 +',
      'diffuseColor.rgb *= 1.0 + vMountainSurface.y *');
    shader.fragmentShader = shader.fragmentShader.replace('float nhRelief = nhDetail *',
      'float nhRelief = vMountainSurface.y * nhDetail *');
  };
  material.customProgramCacheKey = () => `${previousKey}:western-ridge-v1:surface-mask`;
  material.userData.westernMountainSurface = { recipeVersion: 1, worldBaked: true, northernFinishMask: 0 };
  material.needsUpdate = true;
}

/** One material and one static draw for west replacements + untouched north.
 * World-space baking is limited to this permanent, building-free batch. Shared
 * building cones, leaves on trees, and streamed chunk data are never changed.
 */
export function createWesternMountainBatch(THREE, batch, sourceGeometry, sourceMaterial) {
  validateSourceBatch(batch, sourceGeometry);
  const angular = WESTERN_RIDGE_RECIPE.angularSegments, rings = WESTERN_RIDGE_RECIPE.radialRings;
  const topVertices = 1 + angular * rings, hillVertices = topVertices + angular + 1;
  const hillTriangles = angular + (rings - 1) * angular * 2 + angular * 3;
  const vertexCount = 10 * hillVertices + 12 * sourceGeometry.getAttribute('position').count;
  const triangleCount = 10 * hillTriangles + 12 * sourceGeometry.index.count / 3;
  // Allocate final buffers once. No temporary full-mesh JS vertex/index arrays,
  // normal copies, UVs, textures, or GPU resources are needed by this producer.
  const positions = new Float32Array(vertexCount * 3), normals = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3), surface = new Float32Array(vertexCount * 2);
  const indices = new Uint16Array(triangleCount * 3), heightScratch = new Float64Array(topVertices);
  const hillRanges = []; let nextVertex = 0, nextIndex = 0;
  const addVertex = (x, y, z) => { const index = nextVertex++; positions[index * 3] = x; positions[index * 3 + 1] = y; positions[index * 3 + 2] = z; return index; };
  const triangle = (a, b, c) => { indices[nextIndex++] = a; indices[nextIndex++] = b; indices[nextIndex++] = c; };
  const polarPoint = index => {
    if (index === 0) return [0, 0];
    const theta = ((index - 1) % angular) / angular * Math.PI * 2;
    const r = (1 + Math.floor((index - 1) / angular)) / rings;
    return [r * Math.cos(theta), r * Math.sin(theta)];
  };
  for (let hill = 0; hill < 10; hill++) {
    const t = batch.transforms[hill], start = nextVertex, firstTriangle = nextIndex / 3;
    let maxHeight = 0;
    for (let sample = 0; sample < topVertices; sample++) {
      const [u, v] = polarPoint(sample), h = ridgeSample(u, v, hill).height;
      heightScratch[sample] = h; maxHeight = Math.max(maxHeight, h);
    }
    for (let sample = 0; sample < topVertices; sample++) {
      const [u, v] = polarPoint(sample), h = heightScratch[sample] / maxHeight, minY = t[1] - t[4] / 2;
      // Preserve exact submerged minimum and summit maximum. The top surface
      // meets a skirt one metre above the old bottom, below the water plane.
      addVertex(t[0] + u * t[3], minY + 1 + h * (t[4] - 1), t[2] + v * t[5]);
    }
    const circle = (ring, angle) => start + 1 + (ring - 1) * angular + (angle % angular);
    for (let angle = 0; angle < angular; angle++) triangle(start, circle(1, angle + 1), circle(1, angle));
    for (let ring = 1; ring < rings; ring++) for (let angle = 0; angle < angular; angle++) {
      const a = circle(ring, angle), b = circle(ring, angle + 1), c = circle(ring + 1, angle), d = circle(ring + 1, angle + 1);
      triangle(a, b, c); triangle(b, d, c);
    }
    const bottomRing = nextVertex;
    for (let angle = 0; angle < angular; angle++) {
      const theta = angle / angular * Math.PI * 2;
      addVertex(t[0] + Math.cos(theta) * t[3], t[1] - t[4] / 2, t[2] + Math.sin(theta) * t[5]);
    }
    const bottomCenter = addVertex(t[0], t[1] - t[4] / 2, t[2]);
    for (let angle = 0; angle < angular; angle++) {
      const next = (angle + 1) % angular, a = circle(rings, angle), b = circle(rings, next), c = bottomRing + angle, d = bottomRing + next;
      triangle(a, b, c); triangle(c, b, d); triangle(bottomCenter, c, d);
    }
    hillRanges.push({ hill, firstVertex: start, vertices: nextVertex - start, firstTriangle, triangles: nextIndex / 3 - firstTriangle });
  }
  const dummy = new THREE.Object3D(), normalMatrix = new THREE.Matrix3(), p = new THREE.Vector3(), n = new THREE.Vector3();
  const sourcePosition = sourceGeometry.getAttribute('position'), sourceNormal = sourceGeometry.getAttribute('normal');
  const setTransform = t => { dummy.position.set(t[0], t[1], t[2]); dummy.scale.set(t[3], t[4], t[5]); dummy.rotation.set(t[6], t[7], t[8]); dummy.updateMatrix(); normalMatrix.getNormalMatrix(dummy.matrix); };
  for (let hill = 10; hill < 22; hill++) {
    const start = nextVertex, firstTriangle = nextIndex / 3; setTransform(batch.transforms[hill]);
    for (let vertex = 0; vertex < sourcePosition.count; vertex++) {
      p.fromBufferAttribute(sourcePosition, vertex).applyMatrix4(dummy.matrix); addVertex(p.x, p.y, p.z);
    }
    for (const index of sourceGeometry.index.array) indices[nextIndex++] = start + index;
    hillRanges.push({ hill, firstVertex: start, vertices: sourcePosition.count, firstTriangle, triangles: nextIndex / 3 - firstTriangle });
  }
  if (nextVertex !== vertexCount || nextIndex !== indices.length) throw new Error('Western ridge producer wrote an incomplete buffer');
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1)); geometry.computeVertexNormals();
  // Northern originals use their original transformed, smooth cone normals;
  // recomputing normals on welded triangles would alter those twelve hills.
  for (const range of hillRanges.slice(10)) {
    setTransform(batch.transforms[range.hill]);
    for (let vertex = 0; vertex < sourceNormal.count; vertex++) {
      n.fromBufferAttribute(sourceNormal, vertex).applyNormalMatrix(normalMatrix);
      n.toArray(normals, (range.firstVertex + vertex) * 3);
    }
  }
  const palette = Object.fromEntries(Object.entries(WESTERN_RIDGE_RECIPE.palette).map(([key, value]) => [key, new THREE.Color(value)]));
  const color = new THREE.Color(), northColor = sourceMaterial.color;
  for (let vertex = 0; vertex < vertexCount; vertex++) {
    if (vertex >= 10 * hillVertices) { color.copy(northColor); surface[vertex * 2] = sourceMaterial.roughness; surface[vertex * 2 + 1] = 0; }
    else {
      const hill = Math.floor(vertex / hillVertices), t = batch.transforms[hill];
      const x = positions[vertex * 3], y = positions[vertex * 3 + 1], z = positions[vertex * 3 + 2];
      const top = vertex % hillVertices < topVertices, h = top ? clamp((y - (t[1] - t[4] / 2) - 1) / (t[4] - 1)) : 0;
      const drainage = top ? ridgeSample((x - t[0]) / t[3], (z - t[2]) / t[5], hill).drainage : 0;
      const slope = 1 - Math.abs(normals[vertex * 3 + 1]);
      const rock = clamp(smoothstep(.22, .66, slope) * .78 + smoothstep(.67, .96, h) * .44);
      const soil = clamp(drainage * smoothstep(.13, .40, slope) * .66 + (1 - smoothstep(.04, .22, h)) * .42);
      const warmth = .5 + .5 * Math.sin(x * .041 + z * .016) * Math.cos(z * .029 - x * .008);
      color.copy(palette.grass).lerp(palette.grassWarm, warmth * .35).lerp(palette.soil, soil).lerp(palette.rock, rock);
      color.multiplyScalar(.96 + .055 * Math.sin(x * .075 + z * .023));
      surface[vertex * 2] = (.98 * (1 - soil) + .94 * soil) * (1 - rock) + .86 * rock;
      surface[vertex * 2 + 1] = 1;
    }
    color.toArray(colors, vertex * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('mountainSurface', new THREE.BufferAttribute(surface, 2));
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  const preparedBytes = indices.byteLength + Object.values(geometry.attributes).reduce((sum, attribute) => sum + attribute.array.byteLength, 0);
  const westernTriangles = hillRanges.slice(0, 10).reduce((sum, h) => sum + h.triangles, 0);
  if (preparedBytes + heightScratch.byteLength > WESTERN_RIDGE_RECIPE.maxPreparedBytes || westernTriangles > WESTERN_RIDGE_RECIPE.maxWesternTriangles || hillRanges.slice(0, 10).some(h => h.triangles > WESTERN_RIDGE_RECIPE.maxHillTriangles)) {
    geometry.dispose(); throw new Error('Western ridge exceeds its finite geometry budget');
  }
  const material = sourceMaterial.clone(); material.name = 'metropolis-western-ridge'; material.color.set('#ffffff'); material.vertexColors = true;
  installMountainSurface(material);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.westernRidge = { recipeVersion: 1, sourceHills: 22, authoredWesternHills: 10, retainedNorthernHills: 12, decorativeOnly: true, preparedBytes, producerTypedArrayBytes: preparedBytes + heightScratch.byteLength, producerScratchBytes: heightScratch.byteLength, triangles: triangleCount, westernTriangles, hillRanges };
  return mesh;
}
