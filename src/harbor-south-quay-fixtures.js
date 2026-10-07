/** Two small luminaires attached to existing south-quay structures. This owner
 * follows outdoor demand, independently of north building chunks. No ground
 * poles, colliders, textures, quality changes or extra light objects are added. */
export const SOUTH_QUAY_FIXTURE_OWNER = Object.freeze({ id: 'south-quay-attached-fixtures',
  x: 235, z: -292, loadRadius: 72, unloadRadius: 96, drawCalls: 2, triangles: 84, materials: 2 });

const part = (x, y, z, width, height, depth) => Object.freeze({ x, y, z, width, height, depth });
export const SOUTH_QUAY_FIXTURES = Object.freeze([
  Object.freeze({ id: 'south-ferry-signpost-light', support: 'harbor-ferry-south-pole',
    // Existing steel pole: (222.2, 2.9, -304), .11 x 3.2 x .11, top 4.5m.
    mount: part(222.2, 4.30, -304, .19, .19, .18),
    housing: part(222.2, 4.30, -303.81, .46, .24, .22),
    lens: part(222.2, 4.255, -303.697, .34, .09, 0),
    source: Object.freeze({ id: 'south-ferry-signpost-light', buildingId: null, chunkId: null,
      ownerId: SOUTH_QUAY_FIXTURE_OWNER.id, x: 222.2, y: 4.255, z: -303.67,
      intensity: 220, range: 24, kind: 'existing-signpost-attached-luminaire' }) }),
  Object.freeze({ id: 'south-quay-wall-light', support: 'south-north-edge-boundary-wall',
    // Actual wall at z=-290: y[-.03,.87], front face -289.7. Mount embeds
    // in that face; the shallow housing projects .085m, with no ground post.
    mount: part(240, .69, -289.725, .32, .12, .06),
    housing: part(240, .69, -289.665, .54, .16, .10),
    lens: part(240, .69, -289.612, .40, .075, 0),
    source: Object.freeze({ id: 'south-quay-wall-light', buildingId: null, chunkId: null,
      ownerId: SOUTH_QUAY_FIXTURE_OWNER.id, x: 240, y: .69, z: -289.595,
      // A small walkway optic, not an isotropic 220 cd flood against its own
      // wall. Its cone aims down and away from the wall; the casing is not
      // relied on to cast a shadow. Intensity is candela (Three decay 2).
      intensity: 12, range: 12, kind: 'existing-wall-attached-luminaire',
      distribution: Object.freeze({ type: 'spot', angle: Math.PI / 4.5, penumbra: .65, decay: 2,
        target: Object.freeze({ x: 240, y: .03, z: -288.8 }) }) }) }),
]);

function geometry(THREE, positions) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere(); return g;
}
function triangle(out, a, b, c) { out.push(...a, ...b, ...c); }
function housing(out, p, bevel) {
  const w = p.width / 2, h = p.height / 2, d = p.depth / 2;
  const rim = [[-w + bevel, -h], [w - bevel, -h], [w, -h + bevel], [w, h - bevel],
    [w - bevel, h], [-w + bevel, h], [-w, h - bevel], [-w, -h + bevel]];
  const front = rim.map(([x, y]) => [p.x + x, p.y + y, p.z + d]);
  const back = rim.map(([x, y]) => [p.x + x, p.y + y, p.z - d]);
  for (let i = 1; i < 7; i++) { triangle(out, front[0], front[i], front[i + 1]); triangle(out, back[0], back[i + 1], back[i]); }
  for (let i = 0; i < 8; i++) { const j = (i + 1) % 8; triangle(out, front[i], back[i], back[j]); triangle(out, front[i], back[j], front[j]); }
}
function box(out, p) {
  const x = p.width / 2, y = p.height / 2, z = p.depth / 2;
  const v = [[-x,-y,-z],[x,-y,-z],[x,y,-z],[-x,y,-z],[-x,-y,z],[x,-y,z],[x,y,z],[-x,y,z]]
    .map(([a,b,c]) => [p.x + a, p.y + b, p.z + c]);
  for (const [a,b,c,d] of [[0,3,2,1],[4,5,6,7],[0,4,7,3],[1,2,6,5],[0,1,5,4],[3,7,6,2]]) {
    triangle(out,v[a],v[b],v[c]); triangle(out,v[a],v[c],v[d]);
  }
}
function lens(out, p) {
  const w = p.width / 2, h = p.height / 2;
  const a = [p.x-w,p.y-h,p.z], b = [p.x+w,p.y-h,p.z], c = [p.x+w,p.y+h,p.z], d = [p.x-w,p.y+h,p.z];
  triangle(out,a,b,c); triangle(out,a,c,d);
}

export function createSouthQuayFixtureOwner(THREE, parent) {
  let live = null, disposed = false, generations = 0, disposedGenerations = 0;
  function load() {
    const metalPositions = [], lensPositions = [];
    for (const fixture of SOUTH_QUAY_FIXTURES) {
      box(metalPositions, fixture.mount); housing(metalPositions, fixture.housing, .025); lens(lensPositions, fixture.lens);
    }
    const root = new THREE.Group(); root.name = 'Owned south quay attached luminaires';
    root.userData.ownerId = SOUTH_QUAY_FIXTURE_OWNER.id; root.userData.generation = ++generations;
    const metal = new THREE.MeshStandardMaterial({ color: '#435451', roughness: .56, metalness: .72, envMapIntensity: .62 });
    const glass = new THREE.MeshStandardMaterial({ color: '#e8dcc0', roughness: .32, metalness: 0, envMapIntensity: .38,
      emissive: '#ffd7a3', emissiveIntensity: .06 });
    const solids = new THREE.Mesh(geometry(THREE, metalPositions), metal);
    const lenses = new THREE.Mesh(geometry(THREE, lensPositions), glass);
    solids.name = 'South attached luminaire bevelled housings and mounts'; lenses.name = 'South attached luminaire recessed lenses';
    for (const mesh of [solids, lenses]) {
      mesh.userData.noShadow = true; mesh.userData.streetFixture = true; mesh.userData.ownerId = SOUTH_QUAY_FIXTURE_OWNER.id;
      mesh.castShadow = false; mesh.receiveShadow = true; root.add(mesh);
    }
    parent.add(root); live = { root, solids, lenses, metal, glass };
  }
  function release() {
    if (!live) return;
    const owned = live; live = null; owned.root.removeFromParent();
    owned.solids.geometry.dispose(); owned.lenses.geometry.dispose(); owned.metal.dispose(); owned.glass.dispose(); disposedGenerations++;
  }
  return {
    get resident() { return !!live; },
    release,
    update(position, enabled, cap, night) {
      if (disposed) return;
      const radius = live ? SOUTH_QUAY_FIXTURE_OWNER.unloadRadius : SOUTH_QUAY_FIXTURE_OWNER.loadRadius;
      if (!enabled || !position || !Number.isFinite(position.x) || !Number.isFinite(position.z) || cap === 0 ||
          (position.x - SOUTH_QUAY_FIXTURE_OWNER.x) ** 2 + (position.z - SOUTH_QUAY_FIXTURE_OWNER.z) ** 2 >= radius ** 2) { release(); return; }
      if (!live) load(); live.glass.emissiveIntensity = .06 + night * .84;
    },
    snapshot() { return { id: SOUTH_QUAY_FIXTURE_OWNER.id, resident: !!live, disposed, generations, disposedGenerations,
      drawCalls: live ? SOUTH_QUAY_FIXTURE_OWNER.drawCalls : 0, triangles: live ? SOUTH_QUAY_FIXTURE_OWNER.triangles : 0,
      materials: live ? SOUTH_QUAY_FIXTURE_OWNER.materials : 0, meshes: live ? 2 : 0, geometries: live ? 2 : 0,
      loadRadius: SOUTH_QUAY_FIXTURE_OWNER.loadRadius, unloadRadius: SOUTH_QUAY_FIXTURE_OWNER.unloadRadius }; },
    dispose() { if (disposed) return; disposed = true; release(); },
  };
}
