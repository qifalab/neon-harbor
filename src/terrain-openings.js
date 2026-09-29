/** Cut real openings in horizontal terrain. Coordinates remain world metres. */
export function subtractGroundRect(rect, openings) {
  let pieces = [rect];
  for (const hole of openings) pieces = pieces.flatMap(p => {
    const l = Math.max(p.minX, hole.minX), r = Math.min(p.maxX, hole.maxX);
    const n = Math.max(p.minZ, hole.minZ), s = Math.min(p.maxZ, hole.maxZ);
    if (l >= r || n >= s) return [p];
    return [
      {minX:p.minX,maxX:l,minZ:p.minZ,maxZ:p.maxZ},
      {minX:r,maxX:p.maxX,minZ:p.minZ,maxZ:p.maxZ},
      {minX:l,maxX:r,minZ:p.minZ,maxZ:n},
      {minX:l,maxX:r,minZ:s,maxZ:p.maxZ},
    ].filter(q => q.maxX-q.minX > 1e-7 && q.maxZ-q.minZ > 1e-7);
  });
  return pieces;
}

// Triangle clipping preserves the original pavement slope and UVs. Rebuilding
// each rectangle as a bevelled sidewalk would create false ramps at every cut.
export function cutGroundGeometry(THREE, source, worldX, worldZ, openings) {
  source.computeBoundingBox();
  const b = source.boundingBox;
  const holes = openings.filter(h => h.minX < b.max.x+worldX && h.maxX > b.min.x+worldX && h.minZ < b.max.z+worldZ && h.maxZ > b.min.z+worldZ);
  if (!holes.length) return source;
  const g = source.index ? source.toNonIndexed() : source;
  const attributes = Object.entries(g.attributes), stride = attributes.reduce((n,[,a])=>n+a.itemSize,0);
  const read = i => attributes.flatMap(([,a])=>Array.from({length:a.itemSize},(_,j)=>a.array[i*a.itemSize+j]));
  let polygons = [];
  for(let i=0;i<g.attributes.position.count;i+=3) polygons.push([read(i),read(i+1),read(i+2)]);
  function split(poly, axis, boundary) {
    const inside=[],outside=[];
    for(let i=0;i<poly.length;i++) {
      const a=poly[i],c=poly[(i+1)%poly.length],da=a[axis]-boundary,dc=c[axis]-boundary;
      (da>=0?inside:outside).push(a);
      if((da<0&&dc>0)||(da>0&&dc<0)) {
        const t=da/(da-dc),point=a.map((v,j)=>v+(c[j]-v)*t);
        inside.push(point);outside.push(point);
      }
    }
    return [inside,outside];
  }
  for(const h of holes) polygons=polygons.flatMap(poly=>{
    let remainder=poly;const keep=[];
    for(const [axis,boundary,positive] of [[0,h.minX-worldX,true],[0,h.maxX-worldX,false],[2,h.minZ-worldZ,true],[2,h.maxZ-worldZ,false]]) {
      if(remainder.length<3)break;
      const [pos,neg]=split(remainder,axis,boundary);
      const outside=positive?neg:pos;if(outside.length>=3)keep.push(outside);
      remainder=positive?pos:neg;
    }
    return keep;
  });
  const values=[];
  for(const poly of polygons)for(let i=1;i<poly.length-1;i++)values.push(...poly[0],...poly[i],...poly[i+1]);
  const result=new THREE.BufferGeometry();let offset=0;
  for(const [name,a] of attributes) {
    const data=[];for(let i=0;i<values.length;i+=stride)data.push(...values.slice(i+offset,i+offset+a.itemSize));
    result.setAttribute(name,new THREE.Float32BufferAttribute(data,a.itemSize));offset+=a.itemSize;
  }
  if(g!==source)g.dispose();source.dispose();
  result.computeBoundingBox();result.computeBoundingSphere();return result;
}
