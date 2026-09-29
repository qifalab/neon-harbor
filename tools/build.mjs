import { cp, mkdir, rm, stat, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { buildCity } from './build-city.mjs';
import { buildMetropolis } from './build-metropolis.mjs';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const output = resolve(projectRoot, 'dist');
const entries = ['index.html', 'styles.css', 'favicon.svg', 'src', 'vendor', 'assets'];

await buildCity();
await buildMetropolis();

// Validate source files before replacing an existing deployment artifact.
await Promise.all(entries.map((entry) => stat(resolve(projectRoot, entry))));
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const entry of entries) {
  await cp(resolve(projectRoot, entry), resolve(output, entry), {
    recursive: true,
    dereference: false,
  });
}
// The public smoke check verifies these exact bytes, including newly split
// modules, so stale CDN assets cannot silently pass a newer release's gate.
const assets = {};
async function fingerprint(directory, prefix = '') {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = prefix + entry.name;
    if (entry.isDirectory()) await fingerprint(resolve(directory, entry.name), path + '/');
    else if (entry.isFile()) assets[path] = createHash('sha256').update(await readFile(resolve(directory, entry.name))).digest('hex');
  }
}
await fingerprint(output);
const { version } = JSON.parse(await readFile(resolve(projectRoot, 'package.json'), 'utf8'));
await writeFile(resolve(output, 'build-info.json'), JSON.stringify({ version, revision: process.env.GITHUB_SHA || null, assets }, null, 2) + '\n');
console.log(`Built static game at ${output}`);
