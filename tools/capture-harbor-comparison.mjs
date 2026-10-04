import { chromium } from '@playwright/test';
import { createStaticServer } from './server.mjs';
import { fileURLToPath } from 'node:url';
import { resolve, basename } from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

// Capture a known v0.7 build first, then a frozen v0.8 build into the same output.
// Game state is changed solely through visible UI controls. __NEON__ is read-only.
const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2), version = args.shift(), options = {};
const usage = 'Usage: node tools/capture-harbor-comparison.mjs v07|v08 [--root DIST_DIR] [--output DIR] [--port PORT]';
if (version === '--help') { console.log(usage); process.exit(0); }
if (!['v07', 'v08'].includes(version)) throw new Error(usage);
for (let i = 0; i < args.length; i += 2) {
  if (!['--root', '--output', '--port'].includes(args[i]) || !args[i + 1]) throw new Error(usage);
  options[args[i].slice(2)] = args[i + 1];
}
if (version === 'v07' && !options.root) throw new Error('v07 requires --root pointing to the independently built baseline dist');
const root = resolve(projectRoot, options.root || 'dist');
const port = Number(options.port || (version === 'v07' ? 5187 : 5188));
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid HTTP port');
const output = resolve(projectRoot, options.output || 'test-results/harbor-comparison');
const viewport = { width: 1280, height: 800 };
await mkdir(output, { recursive: true });
const manifestBytes = await readFile(`${root}/build-info.json`), manifest = JSON.parse(manifestBytes);
assert.equal(manifest.version, version === 'v07' ? '0.7.0' : '0.8.0');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const manifestHash = sha256(manifestBytes);
const server = await createStaticServer({ root });
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
let browser;
const errors = [], captures = [], startedAt = new Date().toISOString();
try {
  browser = await chromium.launch({ headless: true,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: [
    '--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  ] });
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  page.setDefaultTimeout(180000); page.setDefaultNavigationTimeout(180000);
  page.on('pageerror', error => errors.push({ type: 'pageerror', message: error.message }));
  page.on('console', message => { if (message.type() === 'error') errors.push({ type: 'console', message: message.text() }); });
  page.on('response', response => { if (response.status() >= 400) errors.push({ type: 'http', status: response.status(), url: response.url() }); });
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => !document.getElementById('harbor-start').disabled
    && window.__NEON__?.snapshot().ready);
  console.log(`${version}: ready; setting fixed High/daytime through UI`);
  await page.locator('#welcome-settings').click();
  await page.locator('#quality').selectOption('high');
  await page.locator('#cycle').uncheck();
  assert.equal(Number(await page.locator('#time').inputValue()), 16.5,
    'Fresh browser starts at 16.5; no storage or game-state injection is allowed');
  // A pair of genuine range-key events explicitly applies the same exact hour.
  await page.locator('#time').press('ArrowLeft');
  await page.locator('#time').press('ArrowRight');
  await page.locator('#volume').press('Home');
  await page.locator('#resume').click();
  await page.locator('#harbor-start').click();
  await page.waitForFunction(() => {
    const state = window.__NEON__.snapshot();
    return state.started && !state.paused && !state.streaming?.preparing
      && !state.streaming?.pending && Math.abs(state.position.x - 285.5) < .01
      && state.camera?.boomLength === 0;
  });
  await page.waitForFunction(() => !document.querySelector('#toasts .toast'));
  const snapshot = () => page.evaluate(() => window.__NEON__.snapshot());
  const initial = await snapshot();
  assert.equal(initial.settings.firstPerson, true);
  assert.equal(initial.settings.quality, 'high');
  assert.equal(initial.settings.dayCycle, false);
  assert.equal(initial.settings.hour, 16.5);
  assert.equal(initial.city.harbor.quality, 'high');
  assert.equal(initial.streaming?.failed || 0, 0);
  const capture = async (label, hour) => {
    await page.waitForFunction(expected => {
      const state = window.__NEON__.snapshot();
      return state.settings.hour === expected && !state.settings.dayCycle
        && state.settings.quality === 'high' && !state.paused && !state.streaming?.pending
        && state.camera?.boomLength === 0;
    }, hour);
    // Observe another rendered frame without writing game state or changing time.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const before = await snapshot();
    const file = `${output}/${version}-harbor-${label}-high.png`;
    await page.screenshot({ path: file, timeout: 180000 });
    const after = await snapshot();
    assert.deepEqual(after.position, initial.position);
    assert.deepEqual(after.camera, initial.camera);
    assert.equal(after.settings.hour, hour);
    assert.equal(after.settings.dayCycle, false);
    const snapshotFile = `${output}/${version}-harbor-${label}-snapshot.json`;
    await writeFile(snapshotFile, JSON.stringify({ before, after }, null, 2));
    const record = { label, hour, file: basename(file), snapshotFile: basename(snapshotFile), screenshotSha256: sha256(await readFile(file)),
      position: after.position, camera: after.camera, settings: after.settings,
      streaming: after.streaming, harbor: after.city.harbor, renderer: after.renderer,
      fps: after.fps, timing: after.timing, simulationTime: after.simulationTime };
    captures.push(record);
    console.log(`${version}: captured ${label} at ${hour}, ${after.renderer.calls} reported renderer calls`);
  };
  await capture('day', 16.5);
  await page.keyboard.press('Escape');
  await page.locator('[data-tab="settings"]').click();
  await page.locator('#time').press('End');
  assert.equal(Number(await page.locator('#time').inputValue()), 23.9);
  await page.locator('#cycle').uncheck();
  await page.locator('#resume').click();
  await page.waitForFunction(() => window.__NEON__.snapshot().city.harbor.night > .8);
  await capture('night', 23.9);
  assert.equal(sha256(await readFile(`${root}/build-info.json`)), manifestHash,
    'The build must remain frozen throughout capture');
  assert.deepEqual(errors, []);
  const metadata = { version, builtVersion: manifest.version, startedAt,
    reproductionTool: 'tools/capture-harbor-comparison.mjs',
    completedAt: new Date().toISOString(), root, url: `http://127.0.0.1:${port}/`, viewport,
    deviceScaleFactor: 1, quality: 'high', dayCycle: false, manifestSha256: manifestHash,
    buildRevision: manifest.revision, assetHashes: manifest.assets,
    browser: browser.version(), backend: 'Chromium WebGL / SwiftShader',
    method: 'Fresh browser; visible settings UI sets High, disables day cycle and selects 16.5/23.9. Harbor start button selects the same real walkable viewpoint and default first-person camera. No game-state writes.',
    limitation: 'World clock and camera are fixed. Moving boats, traffic and water are not animation-frame locked; their simulation timestamps are recorded. Software-renderer FPS is not hardware performance evidence.',
    captures, errors };
  await writeFile(`${output}/${version}-metadata.json`, JSON.stringify(metadata, null, 2));
  if (version === 'v08') {
    const baseline = JSON.parse(await readFile(`${output}/v07-metadata.json`, 'utf8'));
    assert.deepEqual(metadata.viewport, baseline.viewport);
    assert.equal(metadata.deviceScaleFactor, baseline.deviceScaleFactor);
    assert.equal(metadata.browser, baseline.browser, 'Use the same Chromium version for the comparison');
    for (const [index, current] of captures.entries()) {
      const prior = baseline.captures[index];
      assert.equal(current.hour, prior.hour); assert.equal(current.settings.quality, prior.settings.quality);
      assert.deepEqual(current.position, prior.position); assert.deepEqual(current.camera, prior.camera);
    }
    await writeFile(`${output}/comparison-verification.json`, JSON.stringify({
      result: 'passed', sameViewport: true, sameDeviceScaleFactor: true, sameBrowserVersion: true, samePosition: true,
      sameCamera: true, sameHour: true, highQualityBoth: true, dayCycleDisabledBoth: true,
      errors: [], baselineManifestSha256: baseline.manifestSha256, candidateManifestSha256: manifestHash,
    }, null, 2));
    console.log('Matched baseline: exact same position, camera, hour, High quality and viewport.');
  }
} catch (error) {
  await writeFile(`${output}/${version}-failure.json`, JSON.stringify({ error: error.stack, errors, captures }, null, 2));
  throw error;
} finally {
  await browser?.close(); await new Promise(resolve => server.close(resolve));
}
