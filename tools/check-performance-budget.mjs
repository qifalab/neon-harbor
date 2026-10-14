import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const budget = JSON.parse(await readFile(resolve(root, 'config/performance-budgets.json'), 'utf8'));
const target = process.argv.includes('--dist') || process.env.NEON_BUDGET_TARGET === 'dist' ? 'dist' : '.';

async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'test-results' || entry.name === 'playwright-report') continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) result.push(...await files(path));
    else if (entry.isFile()) result.push({ path, bytes: (await stat(path)).size });
  }
  return result;
}

const all = await files(resolve(root, target));
const under = name => all.filter(file => file.path.startsWith(resolve(root, target, name) + '/'));
const sum = list => list.reduce((total, file) => total + file.bytes, 0);
const assets = under('assets');
const vendor = under('vendor');
const source = under('src');
const checks = [
  ['assetsBytes', sum(assets), budget.assetsBytes],
  ['assetFileCount', assets.length, budget.assetFileCount],
  ['largestAssetBytes', Math.max(0, ...assets.map(file => file.bytes)), budget.largestAssetBytes],
  ['vendorBytes', sum(vendor), budget.vendorBytes],
  ['sourceBytes', sum(source), budget.sourceBytes],
];
if (target === 'dist') checks.push(['distBytes', sum(all), budget.distBytes]);
const failures = checks.filter(([, actual, limit]) => actual > limit);
const report = Object.fromEntries(checks.map(([key, actual, limit]) => [key, { actual, limit, ok: actual <= limit }]));
console.log(JSON.stringify({ target, root: relative(process.cwd(), resolve(root, target)), report }, null, 2));
if (failures.length) {
  console.error(`Performance budget exceeded: ${failures.map(([key]) => key).join(', ')}`);
  process.exitCode = 1;
}
