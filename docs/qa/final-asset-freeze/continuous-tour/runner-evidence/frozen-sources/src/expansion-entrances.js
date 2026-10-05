/** Street doors identify the new addresses. Shared solids use three draws;
 * nearby name plaques are created on demand and released when leaving. */
export function createExpansionEntrances(THREE, root, buildings) {
  const group = new THREE.Group(); group.name = 'Three shores · public entrances'; root.add(group);
  const geometry = new THREE.BoxGeometry(1, 1, 1), transform = new THREE.Object3D();
  const styles = [
    { material: new THREE.MeshStandardMaterial({ color: '#233a3e', roughness: .38, metalness: .25 }), parts: [[0,1.48,0,2.1,2.96,.08]] },
    { material: new THREE.MeshStandardMaterial({ color: '#b6a077', roughness: .49, metalness: .7 }), parts: [[-1.14,1.54,.03,.15,3.08,.14],[1.14,1.54,.03,.15,3.08,.14],[0,3.04,.03,2.4,.16,.14],[0,1.5,.06,.055,2.95,.1],[-.16,1.23,.16,.03,.42,.06],[.16,1.23,.16,.03,.42,.06]] },
    { material: new THREE.MeshStandardMaterial({ color: '#ead8b6', roughness: .65, emissive: '#dcc9a4', emissiveIntensity: .3 }), parts: [[0,3.32,.02,2.4,.42,.1]] },
  ];
  const batches = styles.map(style => {
    const mesh = new THREE.InstancedMesh(geometry, style.material, buildings.length * style.parts.length);
    mesh.receiveShadow = true; mesh.userData.noShadow = true; group.add(mesh); return mesh;
  });
  let interiorId = null;
  const plaques = new Map();
  function writeMatrices(hiddenId) {
    styles.forEach((style, batch) => {
      buildings.forEach((b, index) => style.parts.forEach(([dx,y,dz,sx,sy,sz], partIndex) => {
        const p=b.entryPortal, c=Math.cos(p.yaw), s=Math.sin(p.yaw);
        transform.position.set(p.x+c*dx+s*dz,p.y+y,p.z-s*dx+c*dz); transform.rotation.set(0,p.yaw,0);
        transform.scale.set(...(b.id===hiddenId?[0,0,0]:[sx,sy,sz])); transform.updateMatrix();
        batches[batch].setMatrixAt(index*style.parts.length+partIndex,transform.matrix);
      }));
      batches[batch].instanceMatrix.needsUpdate=true;
    });
  }
  writeMatrices(null); for(const mesh of batches)mesh.computeBoundingSphere();
  function release(id) { const object=plaques.get(id);if(!object)return;object.material.map.dispose();object.material.dispose();object.geometry.dispose();object.removeFromParent();plaques.delete(id); }
  return {
    setInteriorBuilding(id) { if(id===interiorId)return;interiorId=id;writeMatrices(id);if(id)release(id); },
    update(position) {
      if(typeof document==='undefined')return;
      for(const b of buildings) {
        const p=b.entryPortal,distance=Math.hypot(p.x-position.x,p.z-position.z);
        if(distance>90||b.id===interiorId){release(b.id);continue;}
        if(distance>65||plaques.has(b.id))continue;
        const canvas=document.createElement('canvas');canvas.width=512;canvas.height=96;const ctx=canvas.getContext('2d');
        ctx.fillStyle='#ead8b6';ctx.fillRect(0,0,512,96);ctx.fillStyle='#263b3d';ctx.font='500 38px "Noto Sans SC",sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(b.name,256,48,470);
        const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
        const material=new THREE.MeshBasicMaterial({map:texture,side:THREE.FrontSide});
        const plaque=new THREE.Mesh(new THREE.PlaneGeometry(2.3,.43),material);
        plaque.position.set(p.x+Math.sin(p.yaw)*.08,p.y+3.32,p.z+Math.cos(p.yaw)*.08);plaque.rotation.y=p.yaw;plaque.userData.noShadow=true;
        group.add(plaque);plaques.set(b.id,plaque);
      }
    },
    dispose() { for(const id of [...plaques.keys()])release(id);for(const mesh of batches)mesh.dispose();geometry.dispose();for(const style of styles)style.material.dispose();group.removeFromParent(); },
  };
}
