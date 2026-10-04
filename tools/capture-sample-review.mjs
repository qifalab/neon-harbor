/** Native, real-game review captures. No fixture scene or game-state writes.
 * Build a frozen candidate first, then run this independently from other GPU
 * scenarios. Atlas travel sets up each independent viewpoint; the following
 * doorway, room and exit routes use the shipped E / WASD / Z controls.
 */
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStaticServer } from './server.mjs';
import { snapshot, walkAxis } from '../tests/e2e/helpers/walking.js';
import { faceRoom } from '../tests/e2e/helpers/occupied.js';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const usage = 'node tools/capture-sample-review.mjs [--root DIST] [--output DIR] [--port PORT] [--sites shop,warehouse,south-office,east-office|all]';
const options = {};
for (let index = 2; index < process.argv.length; index += 2) {
  const flag = process.argv[index], value = process.argv[index + 1];
  if (flag === '--help') { console.log(usage); process.exit(0); }
  if (!['--root', '--output', '--port', '--sites'].includes(flag) || !value) throw new Error(usage);
  options[flag.slice(2)] = value;
}
const root = resolve(projectRoot, options.root || 'dist');
const output = resolve(projectRoot, options.output || `test-results/sample-native-${new Date().toISOString().replace(/[:.]/g, '-')}`);
const port = Number(options.port || 5192);
assert.ok(Number.isInteger(port) && port > 0 && port < 65536, 'valid HTTP port');
const allSites = ['shop', 'warehouse', 'south-office', 'east-office'];
const requestedSites = options.sites === 'all' ? allSites : (options.sites || 'shop,warehouse').split(',');
assert.ok(requestedSites.length > 0 && requestedSites.every(site => allSites.includes(site)), 'known sites');
assert.equal(new Set(requestedSites).size, requestedSites.length, 'no duplicate viewpoints');
await mkdir(output, { recursive: true });
assert.deepEqual(await readdir(output), [], 'use a new output directory to preserve earlier evidence');

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const manifestBytes = await readFile(resolve(root, 'build-info.json'));
const manifest = JSON.parse(manifestBytes), manifestSha256 = sha256(manifestBytes);
assert.equal(manifest.version, '0.8.0');
const builtSourceHashes = Object.fromEntries(Object.entries(manifest.assets).filter(([path]) => path.startsWith('src/')));
const sourceHashes = {};
for (const [path, expected] of Object.entries(builtSourceHashes)) {
  sourceHashes[path] = sha256(await readFile(resolve(projectRoot, path)));
  assert.equal(sourceHashes[path], expected, `source must match the frozen build: ${path}`);
  assert.equal(sha256(await readFile(resolve(root, path))), expected, `built source bytes: ${path}`);
}
const methodPaths = ['tools/capture-sample-review.mjs', 'tools/server.mjs',
  'tests/e2e/helpers/walking.js', 'tests/e2e/helpers/occupied.js'];
const methodHashes = Object.fromEntries(await Promise.all(methodPaths.map(async path => [path, sha256(await readFile(resolve(projectRoot, path)))])));
const gitHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot, encoding: 'utf8' }).trim();
const gitStatus = execFileSync('git', ['status', '--porcelain=v1'], { cwd: projectRoot, encoding: 'utf8' });
const viewport = { width: 1280, height: 800 };
const metadata = { status: 'running', startedAt: new Date().toISOString(), root,
  url: `http://127.0.0.1:${port}/`, requestedSites, viewport, deviceScaleFactor: 1,
  builtVersion: manifest.version, buildRevision: manifest.revision, gitHead, gitStatus,
  manifestSha256, assetHashes: manifest.assets, sourceHashes, methodHashes,
  quality: 'high', hour: 16.5, dayCycle: false, firstPerson: true,
  browser: null, backend: 'Chromium WebGL / SwiftShader', captures: [], routes: [], errors: [],
  method: 'Fresh browser and visible settings choose High, freeze 16.5 and set first-person using V if needed. Each address is an independent public Atlas travel setup. E enters the building, ordinary WASD/Z walks through real room doors, and E returns to the street. __NEON__.snapshot() is read-only; no save import, fixture, position, clock or renderer writes.',
  limits: ['Independent address viewpoints do not establish a continuous cross-city route or a 20-minute journey.',
    'PNG files are unedited native 1280 × 800 screenshots of the real game, including its shipped HUD.',
    'Static clock does not freeze traffic, residents or animation frames; simulation timestamps are recorded.',
    'Software-renderer FPS is not hardware performance evidence. These views do not establish AAA art quality.',
    'The workshop, archive and office programmes use shared layouts; photographs do not establish per-building art completion.'] };
const persist = () => writeFile(resolve(output, 'metadata.json'), JSON.stringify(metadata, null, 2) + '\n');
await writeFile(resolve(output, 'build-info.json'), manifestBytes);
await persist();
const server = await createStaticServer({ root });
await new Promise((ok, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', ok); });
let browser, page, activeRoute;

const fixedSettings = state => {
  assert.equal(state.settings.quality, 'high');
  assert.equal(state.settings.dayCycle, false);
  assert.equal(state.settings.hour, 16.5);
  assert.equal(state.settings.firstPerson, true);
  assert.equal(state.paused, false);
  assert.equal(state.streaming?.failed || 0, 0);
};
const event = async (kind, detail = {}) => {
  const state = await snapshot(page); fixedSettings(state);
  const record = { kind, at: new Date().toISOString(), detail,
    position: state.position, camera: state.camera, simulationTime: state.simulationTime,
    teleportRevision: state.teleportRevision, buildingId: state.city.interior.buildingId,
    floorId: state.city.interior.floorId, currentRoomId: state.city.interior.currentRoomId };
  activeRoute.events.push(record); await persist(); return state;
};
const walk = async (axis, target) => {
  // A larger wall-clock allowance accounts for native High on SwiftShader;
  // the shared walker retains its real simulation-time stall checks.
  const before = await snapshot(page);
  await walkAxis(page, axis, target, { timeout: 240000, tolerance: .18, precision: true });
  const after = await event('physical-walk', { axis, target, before: before.position });
  assert.equal(after.teleportRevision, before.teleportRevision, 'walking must not teleport');
  return after;
};
const capture = async (label, detail) => {
  await page.waitForFunction(() => {
    const s = window.__NEON__.snapshot();
    return !s.streaming?.preparing && !s.streaming?.pending && s.renderer.triangles > 0
      && !document.querySelector('#toasts .toast');
  }, null, { polling: 'raf', timeout: 180000 });
  await page.evaluate(() => new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok))));
  const before = await snapshot(page); fixedSettings(before);
  assert.equal(before.renderer.contactOcclusion.enabled, true);
  assert.equal(before.renderer.contactOcclusion.passes, 3);
  assert.equal(before.renderer.contactOcclusion.fallback, null);
  const pixels = await page.locator('#game').evaluate(canvas => {
    const gl = canvas.getContext('webgl2');
    return { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight, lost: gl.isContextLost(), error: gl.getError() };
  });
  assert.deepEqual(pixels, { width: viewport.width, height: viewport.height, lost: false, error: 0 });
  const image = `${label}-high.png`, pose = `${label}-pose.json`;
  await page.screenshot({ path: resolve(output, image), timeout: 180000 });
  const after = await snapshot(page); fixedSettings(after);
  assert.deepEqual(after.position, before.position, 'photography does not move the player');
  await writeFile(resolve(output, pose), JSON.stringify({ detail, before, after, pixels }, null, 2) + '\n');
  metadata.captures.push({ label, detail, image, imageSha256: sha256(await readFile(resolve(output, image))),
    pose, poseSha256: sha256(await readFile(resolve(output, pose))), pixels,
    position: after.position, camera: after.camera, simulationTime: after.simulationTime,
    buildingId: after.city.interior.buildingId, currentRoomId: after.city.interior.currentRoomId,
    renderer: after.renderer, fps: after.fps, timing: after.timing });
  await persist(); console.log(`Captured ${label} (${after.renderer.calls} reported calls).`);
};

try {
  // Always use the Playwright-installed Chromium. CHROMIUM_PATH is deliberately
  // not consulted: the controlled review requires the same browser build.
  browser = await chromium.launch({ headless: true, args: [
    '--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  ] });
  metadata.browser = { version: browser.version(), executable: 'Playwright Chromium', node: process.version };
  assert.equal(browser.version(), '151.0.7922.34', 'use the specified Chromium for native review');
  page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  page.setDefaultTimeout(180000); page.setDefaultNavigationTimeout(180000);
  page.on('pageerror', error => metadata.errors.push({ type: 'pageerror', message: error.message }));
  page.on('console', message => { if (message.type() === 'error') metadata.errors.push({ type: 'console', message: message.text() }); });
  page.on('response', response => { if (response.status() >= 400) metadata.errors.push({ type: 'http', status: response.status(), url: response.url() }); });
  await page.goto(metadata.url);
  await page.waitForFunction(() => window.__NEON__?.snapshot().ready && !document.getElementById('start').disabled);
  await page.locator('#welcome-settings').click();
  await page.locator('#quality').selectOption('high');
  await page.locator('#cycle').uncheck();
  assert.equal(Number(await page.locator('#time').inputValue()), 16.5, 'fresh public settings start at 16.5');
  await page.locator('#time').press('ArrowLeft'); await page.locator('#time').press('ArrowRight');
  await page.locator('#volume').press('Home');
  await page.locator('#resume').click(); await page.locator('#start').click();
  if (!(await snapshot(page)).settings.firstPerson) await page.keyboard.press('v');
  await page.waitForFunction(() => {
    const s = window.__NEON__.snapshot();
    return s.started && !s.paused && !s.streaming?.preparing && !s.streaming?.pending && s.settings.firstPerson;
  });
  const buildings = (await snapshot(page)).city.buildings;
  const choose = site => site === 'shop' ? buildings.find(b => b.id === 'south-090')
    : site === 'warehouse' ? buildings.find(b => b.id === 'south-086' && b.programmeUse === 'warehouse')
    : buildings.find(b => b.district === (site === 'south-office' ? 'south-expansion' : 'east-expansion') && b.programmeUse === 'office');
  for (const site of requestedSites) {
    const building = choose(site); assert.ok(building, `${site}: actual building programme exists`);
    activeRoute = { site, buildingId: building.id, name: building.name, programmeUse: building.programmeUse,
      setup: 'Independent public Atlas travel to the real door; not part of a continuous journey.', events: [], status: 'running' };
    metadata.routes.push(activeRoute); console.log(`Review route ${site}: ${building.id} ${building.name}`);
    await page.locator('#explore-city').click();
    await page.locator(`[data-visit-building="${building.id}"]`).click();
    await page.waitForFunction(id => {
      const s = window.__NEON__.snapshot(), b = s.city.buildings.find(b => b.id === id);
      return !s.paused && !s.streaming?.preparing && !s.streaming?.pending
        && !s.city.interior.buildingId && Math.hypot(s.position.x-b.entrance.x, s.position.z-b.entrance.z) < .1;
    }, building.id);
    await event('public-atlas-viewpoint-setup', { entrance: building.entrance });
    await faceRoom(page, Math.PI);
    if (site === 'shop') {
      const f = (await snapshot(page)).city.sample.district.frontages.find(f => f.shellId === building.shellId);
      assert.ok(f && f.angle === 0, 'the sample noodle shop has a front-facing authored street facade');
      await walk('z', building.entrance.z + 5);
      await page.waitForFunction(id => {
        const d = window.__NEON__.snapshot().city.sample.district;
        return d.residentFrontages.includes(id) && d.scannedMapsLoaded === 6 && d.scannedMapErrors.length === 0;
      }, f.id);
      await capture('shop-street', { frontage: f, building: building.id });
      await walk('z', building.entrance.z);
    }
    assert.ok((await page.locator('#interaction').textContent()).includes(`进入 ${building.name}`), 'the real target door offers E entry');
    await page.keyboard.press('e');
    await page.waitForFunction(id => window.__NEON__.snapshot().city.interior.buildingId === id, building.id);
    const inside = await event('real-E-building-entry');
    assert.equal(inside.city.interior.floorId, building.floors[0].id);
    assert.equal(inside.city.interior.floorType, site === 'shop' ? 'restaurant' : site === 'warehouse' ? 'gallery' : 'office');
    const expectedTypes = site === 'shop' ? ['dining'] : site === 'warehouse' ? ['workshop', 'archive'] : ['office'];
    for (const type of expectedTypes) {
      const room = (await snapshot(page)).city.interior.rooms.find(r => r.type === type);
      assert.ok(room, `${building.id}: real ${type} room exists`);
      await faceRoom(page, Math.PI);
      await walk('x', building.x); await walk('z', room.entrance.z);
      await walk('x', room.arrival.x); await walk('z', room.arrival.z);
      const arrived = await event('physical-room-door-entry', { room });
      assert.equal(arrived.city.interior.currentRoomId, room.id);
      // The camera looks from the reachable arrival strip toward the furniture,
      // using an ordinary mouse drag, not a substituted review camera.
      const toward = { x: room.x, z: room.z };
      const yaw = Math.atan2(toward.x - arrived.position.x, toward.z - arrived.position.z);
      await faceRoom(page, yaw);
      await capture(`${site}-${type}`, { building: building.id, room });
      await faceRoom(page, Math.PI);
      await walk('z', room.entrance.z); await walk('x', building.x);
      const leftRoom = await event('physical-room-door-exit', { roomId: room.id });
      assert.equal(leftRoom.city.interior.currentRoomId, null, 'the room door supports a physical return to the passage');
    }
    const exit = (await snapshot(page)).city.interior.entrance;
    await walk('x', exit.x); await walk('z', exit.z);
    assert.ok((await page.locator('#interaction').textContent()).includes('返回街道'), 'the interior door offers the public E exit');
    await page.keyboard.press('e');
    await page.waitForFunction(() => !window.__NEON__.snapshot().city.interior.buildingId);
    const outside = await event('real-E-street-exit');
    assert.deepEqual(outside.city.exterior, { southInteriorId: null, harborInteriorId: null });
    assert.equal(outside.city.harbor.hiddenShells, 0);
    await walk('z', outside.position.z + 1.5);
    activeRoute.status = 'passed'; await persist();
  }
  assert.equal(sha256(await readFile(resolve(root, 'build-info.json'))), manifestSha256, 'build remains frozen');
  for (const [path, expected] of Object.entries(sourceHashes)) {
    assert.equal(sha256(await readFile(resolve(projectRoot, path))), expected, `source remained frozen: ${path}`);
    assert.equal(sha256(await readFile(resolve(root, path))), expected, `served source remained frozen: ${path}`);
  }
  assert.deepEqual(metadata.errors, [], 'no page, shader console or HTTP errors');
  metadata.status = 'passed'; metadata.completedAt = new Date().toISOString(); await persist();
  console.log(`Native review captured ${metadata.captures.length} images in ${basename(output)}.`);
} catch (error) {
  metadata.status = 'failed'; metadata.completedAt = new Date().toISOString(); metadata.failure = error.stack;
  if (activeRoute) activeRoute.status = 'failed';
  try { metadata.failureSnapshot = await snapshot(page); } catch {}
  try { await page?.screenshot({ path: resolve(output, 'failure-original.png'), timeout: 180000 }); } catch {}
  await persist(); throw error;
} finally {
  await browser?.close(); await new Promise(ok => server.close(ok));
}
