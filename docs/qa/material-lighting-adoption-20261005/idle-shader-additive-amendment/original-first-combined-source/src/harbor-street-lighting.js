/** Real north-shore luminaires. Lights stay at their physical fixtures; the
 * viewer only selects a small, shadowless pool. No player or world state is
 * changed, and the existing exposure / atmosphere remain authoritative. */
export const STREET_LIGHTING_LIMITS = Object.freeze({ high: 4, balanced: 2, low: 0,
  maxRange: 24, selectionRange: 40, maxIntensity: 240,
  maxFixtureDrawCalls: 2, maxFixtureTriangles: 120, maxFixtureMaterials: 2 });

const clamp01 = value => Math.min(1, Math.max(0, value));
const smooth = (start, end, value) => { const t = clamp01((value - start) / (end - start)); return t * t * (3 - 2 * t); };
export function streetNightFactor(hour) {
  const h = ((Number.isFinite(hour) ? hour : 12) % 24 + 24) % 24;
  return h < 12 ? 1 - smooth(5.8, 7, h) : smooth(17.8, 19, h);
}

export function createHarborStreetLighting(THREE, parent, { buildings, isResident, quality = 'high' }) {
  const root = new THREE.Group(); root.name = 'Owned north street fixture lighting'; parent.add(root);
  const sources = [];
  const chunkFor = b => `north-${Math.floor((b.index % 8) / 2)}-${Math.floor(b.index / 16)}`;
  const register = (b, id, x, y, z, intensity, range, kind) => sources.push(Object.freeze({
    id, buildingId: b.id, chunkId: chunkFor(b), x, y, z, intensity, range, kind,
  }));
  // These positions are the centres of the actual existing 96 lamp heads.
  for (const b of buildings) for (const side of [-1, 1])
    register(b, `${b.id}-street-head-${side}`, b.x + side * 58.7, 8.68, b.z - 44, 110, 22, 'existing-street-head');
  const museum = buildings.find(b => b.id === 'tide-museum');
  if (!museum) throw new Error('North street lighting requires the real tide-museum frontage');
  const museumChunk = chunkFor(museum);
  const canopyZ = museum.z + museum.depth / 2 + 2.6;
  // Both points lie under the existing 12m luminous canopy strip. Its two
  // physical ends provide a broad entrance pool without changing the mesh.
  for (const offset of [-4.5, 4.5])
    register(museum, `tide-museum-canopy-${offset}`, museum.x + offset, 5.86, canopyZ, 220, 24, 'existing-canopy-strip');

  const fixtureGroup = new THREE.Group(); fixtureGroup.name = 'Two tree-mounted quay downlights'; root.add(fixtureGroup);
  const metalParts = [], lenses = [];
  for (const side of [-1, 1]) {
    const x = museum.x + side * 57, z = museum.z + 45, inward = -side;
    // Tree-mounted clamp and bracket: no ground pole. Every added solid is
    // above 3.15m and the original tree geometry / route stay untouched.
    metalParts.push([x, 3.65, z, .56, .22, .56, 0]);
    metalParts.push([x + inward * .7, 3.65, z, 1.4, .12, .12, 0]);
    metalParts.push([x + inward * .43, 3.39, z, .86, .075, .085, inward * .42]);
    metalParts.push([x + inward * 1.45, 3.64, z, .5, .17, .32, 0]);
    lenses.push([x + inward * 1.45, 3.542, z, .42, .028, .25, 0]);
    register(museum, `tide-museum-tree-downlight-${side}`, x + inward * 1.45, 3.50, z, 240, 24, 'tree-mounted-downlight');
  }
  Object.freeze(sources);
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const metal = new THREE.MeshStandardMaterial({ color: '#435451', roughness: .72, metalness: .48 });
  const lens = new THREE.MeshStandardMaterial({ color: '#e8dcc0', roughness: .52, metalness: 0,
    emissive: '#ffd7a3', emissiveIntensity: .06 });
  const dummy = new THREE.Object3D(), meshes = [];
  for (const [parts, material, name] of [[metalParts, metal, 'Tree downlight clamps and brackets'], [lenses, lens, 'Tree downlight recessed lenses']]) {
    const mesh = new THREE.InstancedMesh(geometry, material, parts.length); mesh.name = name;
    mesh.userData.noShadow = true; mesh.userData.streetFixture = true;
    mesh.userData.fixtureTransforms = parts;
    mesh.userData.buildings = parts.map(() => null);
    mesh.castShadow = false; mesh.receiveShadow = true;
    for (let i = 0; i < parts.length; i++) {
      const t = parts[i]; dummy.position.set(t[0], t[1], t[2]); dummy.scale.set(t[3], t[4], t[5]); dummy.rotation.set(0, 0, t[6]);
      dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.computeBoundingSphere(); fixtureGroup.add(mesh); meshes.push(mesh);
  }

  const lights = [], assigned = new Int16Array(4), selected = new Int16Array(4), scores = new Float64Array(4);
  assigned.fill(-1); selected.fill(-1);
  // Construct at most four objects once. Quality alone changes scene light
  // count; day/night and distance keep that count stable and use intensity 0.
  for (let i = 0; i < 4; i++) {
    const light = new THREE.PointLight('#ffd7a3', 0, 24, 2); light.name = `Owned street light slot ${i}`;
    light.castShadow = false; lights.push(light);
  }
  let cap = 0, currentQuality = quality, disposed = false, night = 0, permitted = false, active = 0;
  function setQuality(value) {
    if (disposed) return;
    currentQuality = value; cap = STREET_LIGHTING_LIMITS[value] ?? 0;
    for (let i = 0; i < lights.length; i++) {
      if (i < cap) { if (lights[i].parent !== root) root.add(lights[i]); }
      else { lights[i].intensity = 0; assigned[i] = -1; lights[i].removeFromParent(); }
    }
  }
  setQuality(quality);
  function update(position, viewerPosition, hour, dt = 0, enabled = true) {
    if (disposed) return;
    night = streetNightFactor(hour); permitted = !!(enabled && position);
    fixtureGroup.visible = permitted && isResident(museumChunk);
    lens.emissiveIntensity = .06 + night * .84;
    selected.fill(-1); scores.fill(Infinity); active = 0;
    if (!permitted || cap === 0 || night === 0) {
      for (const light of lights) light.intensity = 0;
      return;
    }
    const view = viewerPosition || position;
    const y = Number.isFinite(view.y) ? view.y : (Number.isFinite(view.groundY) ? view.groundY : 0);
    // Fixed-size insertion selection avoids sort, closures and allocations in
    // the frame loop. A 10% retained-source advantage prevents boundary chatter.
    for (let s = 0; s < sources.length; s++) {
      const source = sources[s]; if (!isResident(source.chunkId)) continue;
      const dx = view.x - source.x, dy = y - source.y, dz = view.z - source.z, distance2 = dx * dx + dy * dy + dz * dz;
      if (distance2 >= STREET_LIGHTING_LIMITS.selectionRange ** 2) continue;
      let retained = false; for (let i = 0; i < cap; i++) if (assigned[i] === s) retained = true;
      const score = distance2 * (retained ? .9 : 1);
      for (let i = 0; i < cap; i++) if (score < scores[i]) {
        for (let j = cap - 1; j > i; j--) { scores[j] = scores[j - 1]; selected[j] = selected[j - 1]; }
        scores[i] = score; selected[i] = s; break;
      }
    }
    const blend = dt > 0 ? 1 - Math.exp(-Math.min(dt, .25) / .18) : 1;
    // Keep an already-selected source in its slot even if proximity order
    // swaps. Reassignment starts at zero rather than moving a lit source.
    for (let i = 0; i < cap; i++) {
      let keep = false; for (let j = 0; j < cap; j++) if (selected[j] === assigned[i]) keep = true;
      if (!keep) { assigned[i] = -1; lights[i].intensity = 0; }
    }
    for (let s = 0; s < cap; s++) {
      if (selected[s] < 0) continue;
      let owner = -1; for (let i = 0; i < cap; i++) if (assigned[i] === selected[s]) owner = i;
      if (owner < 0) for (let i = 0; i < cap; i++) if (assigned[i] < 0) { assigned[i] = selected[s]; owner = i; break; }
    }
    for (let i = 0; i < cap; i++) {
      const light = lights[i], source = sources[assigned[i]];
      if (!source) { light.intensity = 0; continue; }
      light.position.set(source.x, source.y, source.z); light.distance = source.range;
      const distance = Math.hypot(view.x - source.x, y - source.y, view.z - source.z);
      const target = source.intensity * night * (1 - smooth(source.range, STREET_LIGHTING_LIMITS.selectionRange, distance));
      light.intensity += (target - light.intensity) * blend;
      if (light.intensity > .001) active++;
    }
  }
  return { root, sources, update, setQuality,
    snapshot() { return { disposed, quality: currentQuality, poolCapacity: cap, residentLightObjects: lights.filter(l => l.parent === root).length,
      sourceCount: sources.length, enabled: permitted, nightFactor: night, activeLights: active,
      fixtureDrawCalls: fixtureGroup.visible ? 2 : 0, fixtureTriangles: fixtureGroup.visible ? 120 : 0, fixtureMaterials: 2,
      slots: lights.map((light, i) => ({ sourceId: sources[assigned[i]]?.id ?? null, x: light.position.x, y: light.position.y, z: light.position.z,
        intensity: light.intensity, range: light.distance, castShadow: light.castShadow, attached: light.parent === root })) }; },
    dispose() {
      if (disposed) return; disposed = true; active = 0; permitted = false;
      for (const light of lights) { light.intensity = 0; light.removeFromParent(); light.dispose?.(); }
      for (const mesh of meshes) mesh.dispose(); geometry.dispose(); metal.dispose(); lens.dispose(); root.removeFromParent();
    },
  };
}
