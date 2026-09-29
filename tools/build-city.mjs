import { mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import * as THREE from '../vendor/three/three.module.js';
import { createWorld } from '../src/world.js';

/** Compile procedural authoring data into actual independently fetchable districts. */
export async function buildCity({ output = fileURLToPath(new URL('../assets/city/chunks/', import.meta.url)) } = {}) {
  const world = createWorld(THREE, new THREE.Scene(), { quality: 'high', streaming: false, openNorth: true });
  const blueprint = world.exportCity();
  await rm(output, { recursive: true, force: true }); await mkdir(output, { recursive: true });
  const entries = [];
  for (const chunk of blueprint.payloads) {
    const text = JSON.stringify(chunk);
    await writeFile(resolve(output, `${chunk.id}.json`), text);
    entries.push({ ...blueprint.chunks.find(meta => meta.id === chunk.id), bytes: Buffer.byteLength(text), instances: chunk.batches.reduce((sum, batch) => sum + batch.transforms.length, 0) });
  }
  await writeFile(resolve(output, 'manifest.json'), JSON.stringify({ version: 1, chunkSize: blueprint.chunkSize, chunks: entries }, null, 2));
  const bytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
  console.log(`Built ${entries.length} city districts (${Math.round(bytes / 1024)} KiB) at ${output}`);
  return { chunks: entries.length, bytes, output };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildCity();
