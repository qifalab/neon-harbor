/**
 * Shared urban materials. All distances below are in world metres, so a
 * stretched/instanced box never stretches its plaster, paving or floorboards.
 * Imports and construction are safe in Node; browser-only image loading is lazy.
 */
const materialCaches = new WeakMap();

// Relief is an art-directed height in metres, not a claimed scanned PBR map.
// The style selects mineral grain, woven fibres, soft leather or brushed metal.
const surfaceDefinitions = {
  stone: { file: 'limestone.webp', metres: 3, rgb: [164, 155, 137], grain: 20, roughness: 0.91, relief: .012, variation: .12 },
  plaster: { file: 'v04/weathered-plaster.webp', metres: 2, rgb: [222, 214, 196], grain: 9, roughness: .94, relief: .009, variation: .11 },
  wood: { file: 'oak.webp', metres: 2, rgb: [139, 94, 55], grain: 15, roughness: .66, relief: .003, variation: .18 },
  tile: { file: 'jade-tile.webp', metres: 1.6, rgb: [37, 93, 77], grain: 8, roughness: .34, relief: .0035, variation: .2 },
  concrete: { metres: 2.4, rgb: [171, 170, 162], grain: 15, roughness: .95, relief: .008, variation: .08 },
  asphalt: { file: 'v04/aggregate-asphalt.webp', metres: 2, rgb: [56, 61, 63], grain: 12, roughness: .97, relief: .016, variation: .07 },
  roof: { metres: 2.4, rgb: [92, 102, 106], grain: 10, roughness: .89, relief: .007, variation: .09 },
  fabric: { file: 'v04/woven-linen.webp', metres: .4, rgb: [218, 209, 190], grain: 15, roughness: .96, relief: .0018, variation: .08, style: 1 },
  leather: { metres: .35, rgb: [230, 225, 212], grain: 17, color: '#754b35', roughness: .53, relief: .0013, variation: .22, style: 2 },
  ceramic: { metres: 1.2, rgb: [228, 226, 213], grain: 3, roughness: .29, relief: .003, variation: .16 },
  steel: { metres: .5, rgb: [221, 224, 225], grain: 4, color: '#a5aeae', roughness: .43, metalness: .83, relief: .0002, variation: .12, style: 3 },
};

// Variants reuse the same texture object/load subscription. Each owns only a
// small material with its own physical scale, tint and surface response.
const materialVariants = {
  upholstery: { source: 'fabric', color: '#ab7558', metres: .45, relief: .0022, roughness: .95 },
  carpet: { source: 'fabric', color: '#546b68', metres: .75, relief: .007, roughness: .99, variation: .05 },
  white: { source: 'plaster', color: '#ede6d7', relief: .003, roughness: .96 },
  timber: { source: 'wood', color: '#c8a17f' },
  walnut: { source: 'wood', color: '#745440', roughness: .61 },
  limestone: { source: 'stone', color: '#d1c8b7' },
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
      if (key === 'ceramic' && (x % 16 === 0 || y % 16 === 0)) relief -= 62;
      if (key === 'fabric') relief += Math.sin(x * Math.PI / 2) * Math.sin(y * Math.PI / 2) * 13;
      if (key === 'steel') relief += Math.sin(y * 1.7) * 5;
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
 * select one projection. Mipmapped albedo supplies restrained relief and
 * roughness variation. The derivative normal respects the scene's metre scale.
 * Microfibres fade before their frequency exceeds a pixel, avoiding shimmer.
 */
function installWorldProjection(material, definition) {
  const { metres, relief = .004, variation = .1, style = 0 } = definition;
  material.userData.metropolisWorldMetres = metres;
  material.userData.metropolisSurface = { relief, roughnessVariation: variation, style };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.metropolisTextureScale = { value: 1 / metres };
    shader.uniforms.metropolisRelief = { value: relief };
    shader.uniforms.metropolisRoughnessVariation = { value: variation };
    shader.uniforms.metropolisSurfaceStyle = { value: style };
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
    shader.fragmentShader = `
      varying vec3 vMetropolisPosition;
      varying vec3 vMetropolisNormal;
      uniform float metropolisTextureScale;
      uniform float metropolisRelief;
      uniform float metropolisRoughnessVariation;
      uniform float metropolisSurfaceStyle;
      // No extra texture fetches: a band-limited fibre/grain response complements
      // the color map, which remains shared by all material instances.
      float metropolisMicrostructure(vec2 p) {
        float frequency = metropolisSurfaceStyle > 2.5 ? 1500.0 : 260.0;
        vec2 q = p * frequency;
        float fade = 1.0 - smoothstep(.55, 2.8, max(fwidth(q.x), fwidth(q.y)));
        float fibres = sin(q.x) * sin(q.y);
        if (metropolisSurfaceStyle > 2.5) fibres = sin(q.y);
        else if (metropolisSurfaceStyle > 1.5) fibres = sin(q.x + sin(q.y * .79)) * sin(q.y + sin(q.x * .63));
        return fibres * fade;
      }
      ${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `float metropolisSurfaceHeight = 0.0;
       float metropolisSurfaceGrain = 0.0;
       #ifdef USE_MAP
         vec3 metropolisWeights = pow(abs(normalize(vMetropolisNormal)), vec3(8.0));
         metropolisWeights /= max(dot(metropolisWeights, vec3(1.0)), 0.0001);
         vec3 metropolisUV = vMetropolisPosition * metropolisTextureScale;
         vec4 metropolisTexel = texture2D(map, metropolisUV.zy) * metropolisWeights.x
           + texture2D(map, metropolisUV.xz) * metropolisWeights.y
           + texture2D(map, metropolisUV.xy) * metropolisWeights.z;
         float metropolisLuminance = dot(metropolisTexel.rgb, vec3(.2126, .7152, .0722));
         metropolisSurfaceGrain = (metropolisLuminance - .35) * 2.0;
         // The generated color is not a measured height field. Low amplitude
         // gives mineral/fibre relief without pretending its colors are geometry.
         metropolisSurfaceHeight = metropolisLuminance * metropolisRelief;
         if (metropolisSurfaceStyle > .5) {
           float metropolisMicro = metropolisMicrostructure(vMetropolisPosition.zy) * metropolisWeights.x
             + metropolisMicrostructure(vMetropolisPosition.xz) * metropolisWeights.y
             + metropolisMicrostructure(vMetropolisPosition.xy) * metropolisWeights.z;
           metropolisSurfaceHeight += metropolisMicro * metropolisRelief * .08;
           metropolisSurfaceGrain += metropolisMicro * .22;
         }
         diffuseColor *= metropolisTexel;
       #endif`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
       roughnessFactor = clamp(roughnessFactor - metropolisSurfaceGrain * metropolisRoughnessVariation, .16, 1.0);`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
       vec3 metropolisDx = dFdx(-vViewPosition);
       vec3 metropolisDy = dFdy(-vViewPosition);
       vec3 metropolisR1 = cross(metropolisDy, normal);
       vec3 metropolisR2 = cross(normal, metropolisDx);
       float metropolisDet = dot(metropolisDx, metropolisR1);
       vec3 metropolisGradient = (dFdx(metropolisSurfaceHeight) * metropolisR1 + dFdy(metropolisSurfaceHeight) * metropolisR2)
         * sign(metropolisDet) / max(abs(metropolisDet), .000001);
       // Limit grazing-angle and tiny-triangle derivatives to a gentle slope.
       normal = normalize(normal - metropolisGradient / max(1.0, length(metropolisGradient) * 2.5));`,
    );
  };
  material.customProgramCacheKey = () => 'metropolis-world-triplanar-relief-v2';
}

function bindSurface(THREE, material, surface, definition) {
  material.map = surface.texture;
  material.userData.metropolisTextureStatus = surface.status;
  installWorldProjection(material, definition);
  surface.materials.add(material);
  material.addEventListener('dispose', () => surface.materials.delete(material));

  // Three's default clone omits shader callbacks. Preserve the projection and
  // shared asynchronous texture subscription for per-building color variants.
  material.clone = function cloneMetropolisSurface() {
    const clone = THREE.MeshStandardMaterial.prototype.clone.call(this);
    bindSurface(THREE, clone, surface, definition);
    return clone;
  };
}

function loadBrowserTexture(THREE, key, definition, surface) {
  if (!definition.file || typeof document === 'undefined' || typeof Image === 'undefined') return;
  surface.status = 'loading';
  for (const material of surface.materials) material.userData.metropolisTextureStatus = 'loading';
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
    for (const material of surface.materials) material.userData.metropolisTextureStatus = 'fallback';
  }
}

/** Return the same material set for each Three namespace; caller owns no textures. */
export function createMetropolisMaterials(THREE) {
  if (materialCaches.has(THREE)) return materialCaches.get(THREE);
  const materials = {};
  const surfaces = new Map();
  for (const [key, definition] of Object.entries(surfaceDefinitions)) {
    const surface = { texture: fallbackTexture(THREE, key, definition), materials: new Set(), status: 'fallback' };
    const material = new THREE.MeshStandardMaterial({ color: definition.color || '#ffffff', roughness: definition.roughness, metalness: definition.metalness || 0 });
    material.name = `metropolis-${key}`;
    material.userData.metropolisTextureStatus = 'fallback';
    bindSurface(THREE, material, surface, definition);
    materials[key] = material;
    surfaces.set(key, surface);
  }
  for (const [key, variant] of Object.entries(materialVariants)) {
    const definition = { ...surfaceDefinitions[variant.source], ...variant };
    const material = new THREE.MeshStandardMaterial({ color: definition.color || '#ffffff', roughness: definition.roughness, metalness: definition.metalness || 0 });
    material.name = `metropolis-${key}`;
    bindSurface(THREE, material, surfaces.get(variant.source), definition);
    materials[key] = material;
  }

  const solidDefinitions = {
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
  // Existing elevators, railings and furniture automatically gain steel detail.
  materials.metal = materials.steel.clone();
  materials.metal.name = 'metropolis-metal';
  materials.metal.color.set('#8b9394');
  materialCaches.set(THREE, materials);
  for (const [key, surface] of surfaces) loadBrowserTexture(THREE, key, surfaceDefinitions[key], surface);
  return materials;
}
