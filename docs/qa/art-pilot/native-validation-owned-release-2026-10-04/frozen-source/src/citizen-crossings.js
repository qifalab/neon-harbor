import { crossingSignal } from './citizen-navigation.js';

/** Marked crossings share their clock with residents. Three instanced draws,
 * no extra realtime lights or per-junction render groups. */
export function createCitizenCrossings(THREE, scene, crossings, colliders) {
  const root = new THREE.Group(); root.name = 'Pedestrian signals · shared crossing clock'; scene.add(root);
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const metal = new THREE.MeshStandardMaterial({ color: '#354749', roughness: .68 });
  const dark = new THREE.MeshStandardMaterial({ color: '#1f3336', roughness: .87 });
  const lensMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const count = crossings.length * 2;
  const posts = new THREE.InstancedMesh(geometry, metal, count), housings = new THREE.InstancedMesh(geometry, dark, count), lenses = new THREE.InstancedMesh(geometry, lensMaterial, count);
  posts.name = 'Crossing posts'; housings.name = 'Pedestrian signal housings'; lenses.name = 'Pedestrian red and green signals';
  const matrix = new THREE.Object3D(), instances = [], color = new THREE.Color();
  for (const crossing of crossings) for (const side of [-1, 1]) {
    const i = instances.length, x = crossing.axis === 'x' ? crossing.x + side * 20.9 : crossing.lane + 3.4;
    const z = crossing.axis === 'x' ? crossing.lane + 3.4 : crossing.z + side * 19.9;
    const yaw = crossing.axis === 'x' ? -side * Math.PI / 2 : side > 0 ? Math.PI : 0;
    matrix.rotation.set(0, yaw, 0); matrix.position.set(x, 1.25, z); matrix.scale.set(.075, 2.5, .075); matrix.updateMatrix(); posts.setMatrixAt(i, matrix.matrix);
    matrix.position.y = 2.27; matrix.scale.set(.3, .54, .16); matrix.updateMatrix(); housings.setMatrixAt(i, matrix.matrix);
    matrix.position.set(x + Math.sin(yaw) * .09, 2.27, z + Math.cos(yaw) * .09); matrix.scale.set(.2, .32, .018); matrix.updateMatrix(); lenses.setMatrixAt(i, matrix.matrix);
    colliders.push({ id: `pedestrian-signal-${i}`, kind: 'signal-post', x, z, hx: .045, hz: .045, minY: 0, maxY: 2.55, physics: true, camera: true });
    instances.push(crossing);
  }
  root.add(posts, housings, lenses);
  for (const mesh of [posts, housings]) { mesh.castShadow = true; mesh.receiveShadow = true; mesh.computeBoundingSphere(); }
  lenses.computeBoundingSphere();
  function update(time, viewer) {
    root.visible = (viewer?.z ?? -900) < -290;
    instances.forEach((crossing, i) => { color.set(crossingSignal(crossing, time).green ? '#9ce8a5' : '#e26a5a'); lenses.setColorAt(i, color); });
    if (lenses.instanceColor) lenses.instanceColor.needsUpdate = true;
  }
  update(0);
  return { root, update, dispose() { root.removeFromParent(); for (const mesh of [posts, housings, lenses]) mesh.dispose(); geometry.dispose(); metal.dispose(); dark.dispose(); lensMaterial.dispose(); } };
}
