/** A kilometre-wide harbour must retain the contrast of its opposite shore.
 * Keeping this sampling function pure makes the visibility contract measurable.
 */
export function harborAtmosphereAt(hour) {
  const wrappedHour = ((Number.isFinite(hour) ? hour : 14) % 24 + 24) % 24;
  const elevation = Math.sin((wrappedHour - 6) / 12 * Math.PI);
  const twilight = Math.max(0, Math.min(1, elevation / .12));
  const daylight = twilight * twilight * (3 - 2 * twilight);
  const warmth = Math.max(0, Math.min(1, (.5 - Math.max(0, elevation)) / .5)) * daylight;
  return { hour: wrappedHour, elevation, daylight, warmth,
    fogDensity: .00048 + (1 - daylight) * .00012,
    exposure: 1.02 + (1 - daylight) * .10,
    // Urban night needs enough blue sky/city spill to read a kerb or stair.
    // The night sky itself is much dimmer than daylight, so this multiplier
    // preserves dark volumes while keeping water and pavement distinguishable.
    environmentIntensity: .62 - daylight * .08,
    hemisphereIntensity: .48 + daylight * .26,
    keyLightIntensity: .28 + daylight * 2.93,
  };
}

/** Original procedural atmosphere and reflection environment; no remote assets.
 * The sky, PBR reflections, fog and scene lights share the same time palette.
 * World positions and shadow texel stabilization remain owned by main.js.
 */
export function createAtmosphere(THREE, renderer, scene) {
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
        color+=sunColor*(pow(alignment,18.0)*0.12+pow(alignment,160.0)*0.24);
        color+=sunColor*smoothstep(0.99974,0.99991,alignment)*3.0;
        vec2 cloudUV=d.xz/max(d.y+0.17,0.17)*2.7;
        float cloud=noise(cloudUV)*0.57+noise(cloudUV*2.05+11.0)*0.29+noise(cloudUV*4.1-8.0)*0.14;
        float veil=smoothstep(0.56,0.79,cloud)*smoothstep(0.01,0.15,elevation)*(1.0-smoothstep(0.7,1.0,elevation));
        color=mix(color,mix(horizon,vec3(0.92,0.94,0.98),0.65),veil*daylight*0.42);
        color=mix(color,ground,1.0-smoothstep(-0.11,0.0,d.y));
        gl_FragColor=vec4(color,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const geometry = new THREE.SphereGeometry(2800, 40, 20);
  const sky = new THREE.Mesh(geometry, material);
  sky.name = 'Atmosphere · sky and cloud veil';
  sky.frustumCulled = false; sky.renderOrder = -1000;
  sky.userData.noShadow = true;
  scene.add(sky);
  scene.background = new THREE.Color('#b8c8ce');
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;

  // A modest radiance map is sufficient for glossy paint and glass reflections.
  // The city in this map is a coarse, local approximation, not a live rendering
  // of the street. One instanced draw adds the actual surrounding building mass
  // without rendering interiors, traffic or thousands of facade components.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environmentScene = new THREE.Scene();
  const environmentSky = new THREE.Mesh(geometry, material);
  environmentSky.renderOrder = -1000;
  environmentScene.add(environmentSky);
  const proxyGeometry = new THREE.BoxGeometry(1, 1, 1);
  const proxyNormals = proxyGeometry.getAttribute('normal');
  const proxyFaceColors = new Float32Array(proxyNormals.count * 3);
  const proxyLight = new THREE.Vector3(-100, 150, -65).normalize();
  for (let i = 0; i < proxyNormals.count; i++) {
    const directional = Math.max(0, proxyNormals.getX(i) * proxyLight.x
      + proxyNormals.getY(i) * proxyLight.y + proxyNormals.getZ(i) * proxyLight.z);
    const radiance = .48 + .38 * directional + .14 * Math.max(0, proxyNormals.getY(i));
    proxyFaceColors.set([radiance, radiance, radiance], i * 3);
  }
  proxyGeometry.setAttribute('color', new THREE.BufferAttribute(proxyFaceColors, 3));
  const proxyMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const maxProxies = 64;
  const proxies = new THREE.InstancedMesh(proxyGeometry, proxyMaterial, maxProxies);
  proxies.name = 'Approximate nearby building reflection volumes';
  proxies.count = 0;
  proxies.frustumCulled = false;
  environmentScene.add(proxies);
  const proxyTransform = new THREE.Object3D(), proxyColor = new THREE.Color();
  const previousProbeFocus = new THREE.Vector3(Infinity, Infinity, Infinity);
  const probeFocus = new THREE.Vector3();
  let buildings = [], proxiesDirty = false;
  let environment = null, previousEnvironmentHour = -Infinity, previousEnvironmentDaylight = -1;
  let disposed = false;

  function setBuildings(nextBuildings) {
    if (disposed) return;
    buildings = (nextBuildings || []).filter(building =>
      Number.isFinite(building.x) && Number.isFinite(building.z)
      && ['width', 'depth', 'height'].every(key => Number.isFinite(building[key]) && building[key] > 0));
    proxiesDirty = true;
  }

  function updateProxies(day) {
    const nearest = buildings.map(building => {
      const dx = Math.max(0, Math.abs(building.x - probeFocus.x) - building.width / 2);
      const dz = Math.max(0, Math.abs(building.z - probeFocus.z) - building.depth / 2);
      const baseY = Number.isFinite(building.baseY) ? building.baseY : 0;
      // A closed proxy cannot represent a furnished interior. Omitting the
      // containing shell prevents that proxy from covering the whole probe.
      const inside = dx === 0 && dz === 0 && probeFocus.y >= baseY && probeFocus.y <= baseY + building.height;
      return { building, baseY, distance: dx * dx + dz * dz, inside };
    }).filter(item => !item.inside && item.distance <= 1500 * 1500)
      .sort((a, b) => a.distance - b.distance).slice(0, maxProxies);
    for (let index = 0; index < nearest.length; index++) {
      const { building, baseY } = nearest[index];
      proxyTransform.position.set(building.x - probeFocus.x,
        baseY + building.height / 2 - probeFocus.y, building.z - probeFocus.z);
      proxyTransform.scale.set(building.width, building.height, building.depth);
      proxyTransform.updateMatrix();
      proxies.setMatrixAt(index, proxyTransform.matrix);
      // Basic materials store approximate outgoing radiance. They must not
      // inherit the main scene's exposure or require a second light rig.
      proxyColor.set(building.color || '#84969b').multiplyScalar(.12 + day * .76);
      proxies.setColorAt(index, proxyColor);
    }
    proxies.count = nearest.length;
    proxies.instanceMatrix.needsUpdate = true;
    if (proxies.instanceColor) proxies.instanceColor.needsUpdate = true;
  }

  function setPalette(hour) {
    const palette = harborAtmosphereAt(hour);
    const { daylight: day, warmth, elevation: sunElevation } = palette;
    // A blue upper sky and lighter, cooler horizon give the harbour a visible
    // air/water separation. The initial grey-blue palette washed both into the
    // same clay colour in the actual 800 px first-person waterfront capture.
    uniforms.zenith.value.set('#142840').lerp(new THREE.Color('#5e8faf'), day);
    uniforms.horizon.value.set('#2d435d').lerp(new THREE.Color('#b6ccdc'), day)
      .lerp(new THREE.Color('#deb398'), warmth * 0.44);
    uniforms.ground.value.set('#253544').lerp(new THREE.Color('#737975'), day);
    uniforms.sunColor.value.set('#ffd9af').multiplyScalar(Math.max(0, sunElevation) > 0 ? 1 : 0);
    // Align the visible solar disc with main's directional light offset.
    uniforms.sunDirection.value.set(-100,95+Math.max(0,sunElevation)*100,-65).normalize();
    uniforms.daylight.value = day;
    return palette;
  }

  function update(hour, focus, hemi, sun) {
    if (disposed) return;
    const { hour: wrappedHour, daylight: day, warmth, fogDensity, exposure, environmentIntensity, hemisphereIntensity, keyLightIntensity } = setPalette(hour);
    if (focus) sky.position.set(focus.x, focus.y || 0, focus.z);
    scene.background.copy(uniforms.horizon.value);
    scene.fog.color.copy(uniforms.horizon.value);
    scene.fog.density = fogDensity;
    hemi.color.set('#9aadc6').lerp(new THREE.Color('#bdd4e5'), day);
    hemi.groundColor.set('#475466').lerp(new THREE.Color('#635d50'), day);
    hemi.intensity = hemisphereIntensity;
    sun.intensity = keyLightIntensity;
    // At night the existing directional source becomes a soft cool fill. It
    // preserves surface orientation rather than bathing the city in daylight.
    sun.color.set('#b5cce7').lerp(new THREE.Color('#fff2df'), day)
      .lerp(new THREE.Color('#ffc694'), warmth * .55);
    renderer.toneMappingExposure = exposure;
    scene.environmentIntensity = environmentIntensity;
    probeFocus.set(Number.isFinite(focus?.x) ? focus.x : 0,
      (Number.isFinite(focus?.y) ? focus.y : 0) + 1.5, Number.isFinite(focus?.z) ? focus.z : 0);
    const travelled = Math.hypot(probeFocus.x - previousProbeFocus.x, probeFocus.z - previousProbeFocus.z) >= 60
      || Math.abs(probeFocus.y - previousProbeFocus.y) >= 12;
    const hourDelta = Math.abs(wrappedHour - previousEnvironmentHour);
    const timeChanged = Math.min(hourDelta, 24 - hourDelta) >= 1 || Math.abs(day - previousEnvironmentDaylight) >= .18;
    if (!environment || proxiesDirty || (buildings.length && travelled) || timeChanged) {
      updateProxies(day);
      const next = pmrem.fromScene(environmentScene, 0.03, 0.1, 3200);
      scene.environment = next.texture;
      environment?.dispose(); environment = next;
      previousProbeFocus.copy(probeFocus);
      proxiesDirty = false;
      previousEnvironmentHour = wrappedHour;
      previousEnvironmentDaylight = day;
    }
  }

  return {
    update,
    setBuildings,
    dispose() {
      disposed = true;
      scene.remove(sky); scene.environment = null;
      environment?.dispose(); pmrem.dispose(); geometry.dispose(); material.dispose();
      proxies.dispose(); proxyGeometry.dispose(); proxyMaterial.dispose();
    },
  };
}
