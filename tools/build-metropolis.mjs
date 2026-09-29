import { mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import * as THREE from '../vendor/three/three.module.js';
import { createMetropolisWorld } from '../src/metropolis-world.js';

/** Materialize north-shore detail as independent, cacheable static payloads. */
export async function buildMetropolis({ output=fileURLToPath(new URL('../assets/metropolis/chunks/',import.meta.url)) }={}) {
  const world=createMetropolisWorld(THREE,new THREE.Scene(),{quality:'high',streaming:false});
  const blueprint=world.exportCity();
  await rm(output,{recursive:true,force:true});await mkdir(output,{recursive:true});
  const entries=[];
  for(const chunk of blueprint.payloads) {
    const source=JSON.stringify(chunk);await writeFile(resolve(output,`${chunk.id}.json`),source);
    entries.push({...blueprint.chunks.find(meta=>meta.id===chunk.id),bytes:Buffer.byteLength(source),instances:chunk.batches.reduce((sum,batch)=>sum+batch.transforms.length,0)});
  }
  await writeFile(resolve(output,'manifest.json'),JSON.stringify({version:1,chunkSize:blueprint.chunkSize,chunks:entries},null,2));
  world.dispose();
  const bytes=entries.reduce((sum,entry)=>sum+entry.bytes,0);
  console.log(`Built ${entries.length} north-shore districts (${Math.round(bytes/1024)} KiB) at ${output}`);
  return {chunks:entries.length,bytes,output};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await buildMetropolis();
