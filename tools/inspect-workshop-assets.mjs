import { readFile, writeFile } from 'node:fs/promises';
import * as THREE from '../vendor/three/three.module.js';
import { GLTFLoader } from '../vendor/three/addons/loaders/GLTFLoader.js';

/** CPU-only parser: substitute JPEG decode with Texture placeholders. Geometry,
 * skins, node transforms, materials and texture references use the real loader.
 * This deliberately does not claim image decoding or WebGL correctness. */
export async function parseWorkshopAssetCPU(bytes) {
  const loader = new GLTFLoader();
  loader.register(parser => ({ name: 'CPU_texture_reference_validation', loadTexture: async index => {
    const definition = parser.json.textures[index], image = parser.json.images[definition.source];
    const payload = await parser.getDependency('bufferView', image.bufferView);
    if (image.mimeType !== 'image/jpeg' || new Uint8Array(payload)[0] !== 0xff || new Uint8Array(payload)[1] !== 0xd8)
      throw new Error('The embedded texture must contain acquired JPEG bytes');
    const texture = new THREE.Texture(); texture.flipY = false;
    texture.userData.cpuPlaceholder = true; texture.userData.embeddedBytes = payload.byteLength;
    parser.associations.set(texture, { textures: index });
    return texture;
  } }));
  const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return loader.parseAsync(data, '');
}

export function inspectScene(scene) {
  scene.updateMatrixWorld(true);
  let triangles = 0, meshes = 0, skinnedMeshes = 0, vertices = 0;
  const materials = new Set(), textures = new Set(), geometries = new Set();
  scene.traverse(object => {
    if (!object.isMesh) return;
    meshes++; if (object.isSkinnedMesh) { skinnedMeshes++; object.skeleton.update(); }
    const geometry = object.geometry, position = geometry.attributes.position;
    geometries.add(geometry); vertices += position.count;
    triangles += (geometry.index?.count ?? position.count) / 3;
    for (const attribute of Object.values(geometry.attributes)) {
      for (let i = 0; i < attribute.array.length; i++) if (!Number.isFinite(attribute.array[i])) throw new Error('Non-finite geometry');
    }
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      if (!material.map || !material.normalMap || !material.roughnessMap || !material.metalnessMap)
        throw new Error('Original PBR channels missing');
      if (material.map.colorSpace !== THREE.SRGBColorSpace || material.normalMap.colorSpace !== THREE.NoColorSpace)
        throw new Error('PBR texture colour space mismatch');
    }
  });
  const bounds = new THREE.Box3().setFromObject(scene, true), size = bounds.getSize(new THREE.Vector3());
  if (![...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite)) throw new Error('Invalid scene bounds');
  return { triangles, meshes, skinnedMeshes, vertices, geometryCount: geometries.size,
    materialCount: materials.size, textureCount: textures.size,
    potentialColourPassDrawCalls: meshes, bounds: { min: bounds.min.toArray(), max: bounds.max.toArray(), size: size.toArray() },
    validationScope: 'CPU geometry/skin/node/PBR references; JPEG decoding and WebGL excluded' };
}

if (process.argv[1]?.endsWith('inspect-workshop-assets.mjs')) {
  const records = [];
  for (const id of ['bench_vice_01', 'metal_tool_chest']) {
    const bytes = await readFile(new URL(`../assets/harbor/workshop/${id}.glb`, import.meta.url));
    const result = await parseWorkshopAssetCPU(bytes);
    records.push({ id, bytes: bytes.length, ...inspectScene(result.scene) });
  }
  const text = JSON.stringify({ threeRevision: THREE.REVISION, models: records }, null, 2) + '\n';
  await writeFile(new URL('../docs/qa/art-pilot/cpu-asset-inspection.json', import.meta.url), text);
  console.log(text);
}
