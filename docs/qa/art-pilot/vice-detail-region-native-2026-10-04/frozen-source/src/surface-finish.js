/**
 * Metre-scale surface response for original procedural assets. The finish is
 * anchored to each mesh (it cannot slide when a car or a limb moves), needs no
 * UV unwrap, and filters each frequency against the pixel footprint. Fine
 * detail fades before it can sparkle or form moire at distance.
 *
 * These are small surface variations, not scanned textures or subsurface skin.
 */
export const SURFACE_FINISHES = Object.freeze(Object.fromEntries(Object.entries({
  automotive: { frequency: 185, relief: .000022, roughness: .035, tone: .010, weave: 0 },
  skin:       { frequency: 330, relief: .000055, roughness: .075, tone: .028, weave: 0 },
  cloth:      { frequency: 520, relief: .00016,  roughness: .105, tone: .038, weave: .62 },
  leather:    { frequency: 240, relief: .00012,  roughness: .095, tone: .030, weave: 0 },
  metal:      { frequency: 290, relief: .000025, roughness: .085, tone: .008, weave: .15 },
  mineral:    { frequency: 105, relief: .00023,  roughness: .110, tone: .045, weave: 0 },
  rubber:     { frequency: 220, relief: .00010,  roughness: .045, tone: .023, weave: 0 },
  hair:       { frequency: 420, relief: .00007,  roughness: .070, tone: .023, weave: .9 },
}).map(([key, value]) => [key, Object.freeze(value)])));

const glslFloat = value => Number(value).toFixed(8);

/** Attach after cloning: Three.js Material.clone() does not copy shader hooks. */
export function applySurfaceFinish(material, kind, { scale = 1, strength = 1 } = {}) {
  const preset = SURFACE_FINISHES[kind];
  if (!preset) throw new RangeError(`Unknown surface finish: ${kind}`);
  if (!Number.isFinite(scale) || scale <= 0 || !Number.isFinite(strength) || strength < 0)
    throw new RangeError('Surface scale must be positive and strength non-negative');
  const settings = { kind, scale, strength };
  material.userData.surfaceFinish = settings;
  // Idempotent deliberately: reattaching a cloned finish must not inject it twice.
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>',
      '#include <common>\nvarying vec3 vNHSurfacePosition;');
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvNHSurfacePosition = position;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vNHSurfacePosition;
// Filter regular fibres; irregular surfaces use smooth value noise below so
// large furniture panels and stone floors do not show repeating stripes.
float nhSurfaceWave(vec3 p, vec3 direction, float frequency, float phase) {
  float a = dot(p, direction) * frequency * 6.2831853 + phase;
  return sin(a);
}
float nhSurfaceBand(vec3 p, float frequency) {
  vec3 q = p * frequency;
  float footprint = max(length(dFdx(q)), length(dFdy(q)));
  return 1.0 - smoothstep(0.25, 0.8, footprint);
}
float nhSurfaceHash(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z) * 2.0 - 1.0;
}
float nhSurfaceNoise(vec3 p, float frequency) {
  vec3 q = p * frequency, cell = floor(q), f = fract(q);
  vec3 w = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = mix(nhSurfaceHash(cell), nhSurfaceHash(cell + vec3(1,0,0)), w.x);
  float b = mix(nhSurfaceHash(cell + vec3(0,1,0)), nhSurfaceHash(cell + vec3(1,1,0)), w.x);
  float c = mix(nhSurfaceHash(cell + vec3(0,0,1)), nhSurfaceHash(cell + vec3(1,0,1)), w.x);
  float d = mix(nhSurfaceHash(cell + vec3(0,1,1)), nhSurfaceHash(cell + vec3(1,1,1)), w.x);
  return mix(mix(a, b, w.y), mix(c, d, w.y), w.z);
}
float nhSurfaceGrain(vec3 p, float frequency) {
  return nhSurfaceNoise(p, frequency) * 0.75
    + nhSurfaceNoise(p + vec3(0.57, 0.19, 0.73), frequency * 2.03) * 0.25;
}
vec3 nhSurfaceNormal(vec3 surfacePosition, vec3 surfaceNormal, float relief, float band) {
  vec3 dx = dFdx(surfacePosition), dy = dFdy(surfacePosition);
  vec3 rx = cross(dy, surfaceNormal), ry = cross(surfaceNormal, dx);
  float determinant = dot(dx, rx);
  vec3 gradient = (dFdx(relief) * rx + dFdy(relief) * ry)
    * sign(determinant) * band / max(abs(determinant), 0.00000001);
  return normalize(surfaceNormal - gradient);
}`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
vec3 nhPosition = vNHSurfacePosition * ${glslFloat(scale)};
float nhBroad = nhSurfaceGrain(nhPosition, 18.0) * nhSurfaceBand(nhPosition, 36.54);
float nhDetailBand = nhSurfaceBand(nhPosition, ${glslFloat(preset.frequency * 2.03)});
float nhFine = nhSurfaceGrain(nhPosition, ${glslFloat(preset.frequency)});
float nhWeave = nhSurfaceWave(nhPosition, vec3(0.97, 0.05, 0.24), ${glslFloat(preset.frequency)}, 0.0)
  * nhSurfaceWave(nhPosition, vec3(0.02, 0.99, 0.14), ${glslFloat(preset.frequency * .91)}, 1.1);
float nhDetail = mix(nhFine, nhWeave, ${glslFloat(preset.weave)});
roughnessFactor = clamp(roughnessFactor + (nhBroad * 0.45 + nhDetail * nhDetailBand * 0.55)
  * ${glslFloat(preset.roughness * strength)}, 0.045, 1.0);
diffuseColor.rgb *= 1.0 + (nhBroad * 0.7 + nhDetail * nhDetailBand * 0.3) * ${glslFloat(preset.tone * strength)};
float nhRelief = nhDetail * ${glslFloat(preset.relief * strength / scale)};`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>',
      '#include <normal_fragment_maps>\nnormal = nhSurfaceNormal(-vViewPosition, normal, nhRelief, nhDetailBand);');
  };
  material.customProgramCacheKey = () => `nh-surface-v1:${kind}:${scale}:${strength}`;
  material.needsUpdate = true;
  return material;
}

export function cloneSurfaceMaterial(material) {
  const cloned = material.clone(), settings = material.userData.surfaceFinish;
  return settings ? applySurfaceFinish(cloned, settings.kind, settings) : cloned;
}
