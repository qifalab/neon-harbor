import { harborAtmosphereAt } from './atmosphere.js';

const waterStates = new WeakMap();

/** Original water surface using Three's PBR reflection/lighting pipeline.
 * Three analytic wave bands disturb the normal in WORLD metres. They do not
 * stretch with a 2 km ocean plane or a small instanced inlet, and their screen
 * derivatives fade unresolved waves instead of shimmering at the horizon.
 * This reflects the sky environment, not a claimed planar building reflection.
 */
export function createHarborWaterMaterial(THREE) {
  const material = new THREE.MeshStandardMaterial({
    color: '#315e70', roughness: .23, metalness: .04, envMapIntensity: 1.15,
  });
  material.name = 'Harbour · wind ripples and sky reflection';
  const state = {
    time: { value: 0 },
    dayColor: new THREE.Color('#315e70'), nightColor: new THREE.Color('#243e4e'),
    duskColor: new THREE.Color('#526877'),
  };
  waterStates.set(material, state);
  material.userData.harborWater = { worldMetres: true, waveBands: 3, reflection: 'sky-environment' };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.harborWaterTime = state.time;
    shader.vertexShader = `varying vec3 vHarborWaterPosition;\n${shader.vertexShader}`.replace(
      '#include <project_vertex>',
      `vec4 harborPosition = vec4(transformed, 1.0);
       #ifdef USE_BATCHING
         harborPosition = batchingMatrix * harborPosition;
       #endif
       #ifdef USE_INSTANCING
         harborPosition = instanceMatrix * harborPosition;
       #endif
       vHarborWaterPosition = (modelMatrix * harborPosition).xyz;
       #include <project_vertex>`,
    );
    shader.fragmentShader = `
      varying vec3 vHarborWaterPosition;
      uniform float harborWaterTime;
      vec3 harborWave(vec2 direction, float frequency, float amplitude, float speed) {
        // Bend wave fronts with a slower transverse swell. Its analytic
        // gradient keeps the normal continuous without ruler-straight bands.
        vec2 crossDirection = vec2(-direction.y, direction.x);
        float crossPhase = dot(vHarborWaterPosition.xz, crossDirection) * frequency * .31 - harborWaterTime * speed * .17;
        float phase = dot(vHarborWaterPosition.xz, direction) * frequency + harborWaterTime * speed + sin(crossPhase) * 1.05;
        vec2 slope = direction * frequency + crossDirection * cos(crossPhase) * frequency * .3255;
        float resolved = 1.0 - smoothstep(.5, 2.5, fwidth(phase));
        return vec3(sin(phase) * amplitude, cos(phase) * amplitude * slope) * resolved;
      }
      ${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
       vec3 harborWaves = harborWave(vec2(.94, .342), .31, .10, .43)
         + harborWave(vec2(-.447, .894), 1.71, .033, -.69)
         + harborWave(vec2(.707, .707), 3.87, .008, 1.12);
       vec3 harborWorldNormal = inverseTransformDirection(normal, viewMatrix);
       vec3 harborSlope = vec3(harborWaves.y, 0.0, harborWaves.z);
       normal = normalize(normal - mat3(viewMatrix) * harborSlope * abs(harborWorldNormal.y));
       roughnessFactor = clamp(roughnessFactor + harborWaves.x * .18, .18, .34);`,
    );
  };
  material.customProgramCacheKey = () => 'harbor-world-metre-waves-v2';
  material.clone = () => {
    const clone = createHarborWaterMaterial(THREE);
    clone.copy(material);
    waterStates.get(clone).time.value = state.time.value;
    return clone;
  };
  return material;
}

/** `time` is elapsed simulation seconds; `hour` is local scene time, 0–24. */
export function updateHarborWaterMaterial(material, time, hour) {
  const state = waterStates.get(material);
  if (!state) return false;
  // Never reset phase at an arbitrary short period: that causes visible jumps.
  state.time.value = Number.isFinite(time) ? time : state.time.value;
  const { daylight, warmth } = harborAtmosphereAt(hour);
  material.color.copy(state.nightColor).lerp(state.dayColor, daylight).lerp(state.duskColor, warmth * .30);
  return true;
}
