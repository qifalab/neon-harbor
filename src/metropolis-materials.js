/**
 * Shared urban materials. All distances below are in world metres, so a
 * stretched/instanced box never stretches its plaster, paving or floorboards.
 * Imports and construction are safe in Node; browser-only image loading is lazy.
 */
const materialCaches = new WeakMap();

const surfaceDefinitions = {
  stone: { file: 'limestone.webp', metres: 3, rgb: [164, 155, 137], grain: 20, roughness: 0.91 },
  plaster: { file: 'lime-plaster.webp', metres: 2.5, rgb: [222, 214, 196], grain: 9, roughness: 0.97 },
  wood: { file: 'oak.webp', metres: 2, rgb: [139, 94, 55], grain: 15, roughness: 0.68 },
  tile: { file: 'jade-tile.webp', metres: 1.6, rgb: [37, 93, 77], grain: 8, roughness: 0.31 },
  concrete: { metres: 2.4, rgb: [171, 170, 162], grain: 15, roughness: 0.96 },
  asphalt: { metres: 2, rgb: [56, 61, 63], grain: 12, roughness: 0.99 },
  roof: { metres: 2.4, rgb: [92, 102, 106], grain: 10, roughness: 0.86 },
};

function configureTexture(THREE, texture) {
  // Mirror-repeat closes imperfect generated-image edges without stretched UVs.
  texture.wrapS = texture.wrapT = THREE.MirroredRepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

function fallbackTexture(THREE, key, definition) {
  const size = 64;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Fixed hash rather than Math.random keeps server tests and reloads stable.
      let hash = Math.imul(x + 13, 374761393) ^ Math.imul(y + 37, 668265263);
      hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d);
      hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b);
      const noise = ((hash ^ (hash >>> 16)) >>> 0) / 4294967295 - 0.5;
      let relief = noise * definition.grain;
      if (key === 'wood') relief += Math.sin(x * 2 + Math.sin(y * 0.21)) * 7;
      if (key === 'tile' && (x % 8 === 0 || y % 8 === 0)) relief += 35;
      if (key === 'stone' && (y % 16 === 0 || (x + (y < 32 ? 8 : 0)) % 32 === 0)) relief -= 18;
      const offset = (y * size + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        pixels[offset + channel] = Math.max(0, Math.min(255, definition.rgb[channel] + relief));
      }
      pixels[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.name = `metropolis-${key}-procedural-fallback`;
  return configureTexture(THREE, texture);
}

/**
 * Triplanar projection uses world coordinates and world normals after instance
 * transforms. Rounded/canted features blend the three projections; box faces
 * select one projection. This is color detail, not a fabricated PBR scan.
 */
function installWorldProjection(material, metres) {
  material.userData.metropolisWorldMetres = metres;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.metropolisTextureScale = { value: 1 / metres };
    shader.vertexShader = `varying vec3 vMetropolisPosition;\nvarying vec3 vMetropolisNormal;\n${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <defaultnormal_vertex>',
      `#include <defaultnormal_vertex>
       vMetropolisNormal = inverseTransformDirection(transformedNormal, viewMatrix);`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `vec4 metropolisWorldPosition = vec4(transformed, 1.0);
       #ifdef USE_BATCHING
         metropolisWorldPosition = batchingMatrix * metropolisWorldPosition;
       #endif
       #ifdef USE_INSTANCING
         metropolisWorldPosition = instanceMatrix * metropolisWorldPosition;
       #endif
       vMetropolisPosition = (modelMatrix * metropolisWorldPosition).xyz;
       #include <project_vertex>`,
    );
    shader.fragmentShader = `varying vec3 vMetropolisPosition;\nvarying vec3 vMetropolisNormal;\nuniform float metropolisTextureScale;\n${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#ifdef USE_MAP
         vec3 metropolisWeights = pow(abs(normalize(vMetropolisNormal)), vec3(8.0));
         metropolisWeights /= max(dot(metropolisWeights, vec3(1.0)), 0.0001);
         vec3 metropolisUV = vMetropolisPosition * metropolisTextureScale;
         vec4 metropolisTexel = texture2D(map, metropolisUV.zy) * metropolisWeights.x
           + texture2D(map, metropolisUV.xz) * metropolisWeights.y
           + texture2D(map, metropolisUV.xy) * metropolisWeights.z;
         diffuseColor *= metropolisTexel;
       #endif`,
    );
  };
  material.customProgramCacheKey = () => 'metropolis-world-triplanar-v1';
}

function bindSurface(THREE, material, surface, metres) {
  material.map = surface.texture;
  installWorldProjection(material, metres);
  surface.materials.add(material);
  material.addEventListener('dispose', () => surface.materials.delete(material));

  // Three's default clone omits shader callbacks. Preserve the projection and
  // shared asynchronous texture subscription for per-building color variants.
  material.clone = function cloneMetropolisSurface() {
    const clone = THREE.MeshStandardMaterial.prototype.clone.call(this);
    bindSurface(THREE, clone, surface, metres);
    return clone;
  };
}

function loadBrowserTexture(THREE, key, definition, surface) {
  if (!definition.file || typeof document === 'undefined' || typeof Image === 'undefined') return;
  surface.status = 'loading';
  const url = new URL(`../assets/materials/${definition.file}`, import.meta.url).href;
  try {
    new THREE.TextureLoader().load(url, (texture) => {
      configureTexture(THREE, texture);
      texture.name = `metropolis-${key}-generated-albedo`;
      const fallback = surface.texture;
      surface.texture = texture;
      surface.status = 'ready';
      for (const material of surface.materials) {
        material.map = texture;
        material.userData.metropolisTextureStatus = 'ready';
        material.needsUpdate = true;
      }
      fallback.dispose();
    }, undefined, () => {
      surface.status = 'fallback';
      for (const material of surface.materials) material.userData.metropolisTextureStatus = 'fallback';
    });
  } catch {
    // A blocked image/CSP/browser API leaves the deterministic surface visible.
    surface.status = 'fallback';
  }
}

/** Return the same material set for each Three namespace; caller owns no textures. */
export function createMetropolisMaterials(THREE) {
  if (materialCaches.has(THREE)) return materialCaches.get(THREE);
  const materials = {};
  const surfaces = [];
  for (const [key, definition] of Object.entries(surfaceDefinitions)) {
    const surface = { texture: fallbackTexture(THREE, key, definition), materials: new Set(), status: 'fallback' };
    const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: definition.roughness, metalness: 0 });
    material.name = `metropolis-${key}`;
    material.userData.metropolisTextureStatus = 'fallback';
    bindSurface(THREE, material, surface, definition.metres);
    materials[key] = material;
    surfaces.push([key, definition, surface]);
  }

  const solidDefinitions = {
    metal: { color: '#8b9394', roughness: 0.39, metalness: 0.78 },
    brass: { color: '#9d7948', roughness: 0.38, metalness: 0.75 },
    // Opaque glazing avoids the sorting artifacts of thousands of transparent
    // facade panes. Interior windows may opt into transparency on a clone.
    glass: { color: '#577b83', roughness: 0.18, metalness: 0.42 },
    glassDark: { color: '#233b46', roughness: 0.22, metalness: 0.46 },
    light: { color: '#ffe5ad', emissive: '#ffd397', emissiveIntensity: 0.6, roughness: 0.5 },
    leaves: { color: '#426647', roughness: 0.93, metalness: 0, side: THREE.DoubleSide },
  };
  for (const [key, definition] of Object.entries(solidDefinitions)) {
    materials[key] = new THREE.MeshStandardMaterial(definition);
    materials[key].name = `metropolis-${key}`;
  }
  materialCaches.set(THREE, materials);
  for (const [key, definition, surface] of surfaces) loadBrowserTexture(THREE, key, definition, surface);
  return materials;
}
