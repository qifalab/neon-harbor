/** Original procedural atmosphere and reflection environment; no remote assets.
 * The sky, PBR reflections, fog and scene lights share the same time palette.
 * World positions and shadow texel stabilization remain owned by main.js.
 */
export function createAtmosphere(THREE, renderer, scene) {
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const uniforms = {
    zenith: { value: new THREE.Color() }, horizon: { value: new THREE.Color() },
    ground: { value: new THREE.Color() }, sunColor: { value: new THREE.Color() },
    sunDirection: { value: new THREE.Vector3() }, daylight: { value: 1 },
  };
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false,
    uniforms,
    vertexShader: `varying vec3 viewDirection;
      void main() { viewDirection=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `precision highp float;
      varying vec3 viewDirection;
      uniform vec3 zenith,horizon,ground,sunColor,sunDirection;
      uniform float daylight;
      float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float noise(vec2 p) {
        vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
      }
      void main() {
        vec3 d=normalize(viewDirection);
        float elevation=max(d.y,0.0);
        vec3 color=mix(horizon,zenith,pow(elevation,0.45));
        float alignment=max(dot(d,normalize(sunDirection)),0.0);
        color+=sunColor*(pow(alignment,18.0)*0.18+pow(alignment,160.0)*0.32);
        color+=sunColor*smoothstep(0.99974,0.99991,alignment)*3.0;
        vec2 cloudUV=d.xz/max(d.y+0.17,0.17)*2.7;
        float cloud=noise(cloudUV)*0.57+noise(cloudUV*2.05+11.0)*0.29+noise(cloudUV*4.1-8.0)*0.14;
        float veil=smoothstep(0.56,0.79,cloud)*smoothstep(0.01,0.15,elevation)*(1.0-smoothstep(0.7,1.0,elevation));
        color=mix(color,mix(horizon,vec3(0.92,0.94,0.98),0.65),veil*daylight*0.66);
        color=mix(color,ground,1.0-smoothstep(-0.11,0.0,d.y));
        gl_FragColor=vec4(color,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const geometry = new THREE.SphereGeometry(940, 40, 20);
  const sky = new THREE.Mesh(geometry, material);
  sky.name = 'Atmosphere · sky and cloud veil';
  sky.frustumCulled = false; sky.renderOrder = -1000;
  sky.userData.noShadow = true;
  scene.add(sky);
  scene.background = new THREE.Color('#b8c8ce');
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;

  // A modest radiance map is sufficient for glossy paint and glass reflections.
  // Updating on explicit time changes avoids rebuilding GPU resources per frame.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environmentScene = new THREE.Scene();
  const environmentSky = new THREE.Mesh(geometry, material);
  environmentSky.renderOrder = -1000;
  environmentScene.add(environmentSky);
  let environment = null, previousEnvironmentHour = -Infinity;
  let disposed = false;

  function setPalette(hour) {
    const sunElevation = Math.sin((hour - 6) / 12 * Math.PI);
    // Daylight remains fully established while the sun is above the horizon.
    // A sinusoidal brightness factor made even 16:30 look like overcast dusk.
    const twilight = clamp(sunElevation / 0.12, 0, 1);
    const day = twilight * twilight * (3 - 2 * twilight);
    const warmth = clamp((0.5 - Math.max(0, sunElevation)) / 0.5, 0, 1) * day;
    uniforms.zenith.value.set('#071221').lerp(new THREE.Color('#76a7d2'), day);
    uniforms.horizon.value.set('#15273b').lerp(new THREE.Color('#c9dce9'), day)
      .lerp(new THREE.Color('#e9b591'), warmth * 0.52);
    uniforms.ground.value.set('#0a111c').lerp(new THREE.Color('#737b79'), day);
    uniforms.sunColor.value.set('#ffd9af').multiplyScalar(Math.max(0, sunElevation) > 0 ? 1 : 0);
    // Align the visible solar disc with main's directional light offset.
    uniforms.sunDirection.value.set(-100,95+Math.max(0,sunElevation)*100,-65).normalize();
    uniforms.daylight.value = day;
    return { day, warmth };
  }

  function update(hour, focus, hemi, sun) {
    if (disposed) return;
    const { day, warmth } = setPalette(hour);
    if (focus) sky.position.set(focus.x, 0, focus.z);
    scene.background.copy(uniforms.horizon.value);
    scene.fog.color.copy(uniforms.horizon.value);
    scene.fog.density = 0.00125 + (1 - day) * 0.00045;
    hemi.color.set('#c3d7ec'); hemi.groundColor.set('#575545');
    hemi.intensity = 0.22 + day * 0.58;
    sun.intensity = 0.06 + day * 3.7;
    sun.color.set('#fff2df').lerp(new THREE.Color('#ffc694'), warmth * 0.55);
    renderer.toneMappingExposure = 1.04 + (1 - day) * 0.10;
    if (!environment || Math.abs(hour - previousEnvironmentHour) >= 1) {
      const next = pmrem.fromScene(environmentScene, 0.03, 0.1, 1100);
      scene.environment = next.texture;
      scene.environmentIntensity = 0.3 + day * 0.42;
      environment?.dispose(); environment = next;
      previousEnvironmentHour = hour;
    }
  }

  return {
    update,
    dispose() {
      disposed = true;
      scene.remove(sky); scene.environment = null;
      environment?.dispose(); pmrem.dispose(); geometry.dispose(); material.dispose();
    },
  };
}
