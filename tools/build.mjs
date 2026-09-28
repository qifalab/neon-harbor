import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const output = resolve(projectRoot, 'dist');
const entries = ['index.html', 'styles.css', 'favicon.svg', 'src', 'vendor'];

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
console.log(`Built static game at ${output}`);
