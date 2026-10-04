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
const usage = 'node tools/capture-sample-review.mjs [--root DIST] [--output DIR] [--port PORT] [--sites shop,warehouse,south-office,east-office|all] [--near-furniture true|false]';
const options = {};
for (let index = 2; index < process.argv.length; index += 2) {
  const flag = process.argv[index], value = process.argv[index + 1];
  if (flag === '--help') { console.log(usage); process.exit(0); }
  if (!['--root', '--output', '--port', '--sites', '--near-furniture'].includes(flag) || !value) throw new Error(usage);
  options[flag.slice(2)] = value;
}
assert.ok(options['near-furniture'] === undefined || ['true', 'false'].includes(options['near-furniture']),
  '--near-furniture accepts only true or false');
const nearFurniture = options['near-furniture'] === 'true';
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
if (nearFurniture) {
  metadata.nearFurniture = { enabled: true, scope: 'warehouse workshop/archive only',
    endpointTolerance: .18, playerRadius: .65,
    targets: 'Actual selected floor layout.parts; fixed south-086 route is verified before key input.' };
  metadata.method += ' Optional near-furniture mode physically walks farther into the warehouse workshop/archive. Targets come from the selected real floor layout.parts; paths are checked against its full-height solids and room bounds before WASD/Z movement. Actual target distances are recorded.';
}
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
/** Optional geometry planning only; the following movement still uses walk().
 * Source modules are checked against the frozen manifest before this is called.
 * Initializing this address's Node programme registry mirrors the browser's
 * actual shell metadata, without changing any browser or game state. */
const warehouseNearPlan = async (building, floorId, room, arrived) => {
  assert.equal(building.id, 'south-086', 'this validated near route is bound to the actual warehouse');
  assert.equal(floorId, 'lobby', 'the checked near route uses the real entrance floor');
  assert.ok(['workshop', 'archive'].includes(room.type));
  const [{ createInteriorLayout }, { expansionBuilding }, { PLAYER_DIMENSIONS }] = await Promise.all([
    import('../src/metropolis-interiors.js'), import('../src/expansion-programmes.js'), import('../src/world-config.js'),
  ]);
  const registered = expansionBuilding({ ...building, id: building.shellId }, 'south', 85);
  assert.equal(registered.programmeUse, 'warehouse');
  const floor = building.floors.find(f => f.id === floorId);
  assert.ok(floor); assert.ok(Math.abs(arrived.position.y - floor.y) < .01);
  const layout = createInteriorLayout(building, floor);
  assert.deepEqual(layout.rooms.find(r => r.id === room.id), room, 'planning uses the actual browser room bounds and doors');
  const parts = layout.parts.filter(p => p.roomId === room.id);
  let targetPart;
  if (room.type === 'workshop') {
    const benches = parts.filter(p => p.kind === 'workbench');
    assert.equal(benches.length, 1, 'the real room has one primary workbench');
    targetPart = benches[0];
  } else {
    const shelves = parts.filter(p => p.kind === 'archive-shelf' && p.sx > 1);
    assert.ok(shelves.length > 0, 'the actual archive has horizontal shelf boards');
    const middleX = shelves[0].x, eyeY = arrived.position.y + 1.62;
    const boxes = parts.filter(p => p.kind === 'archive-box');
    assert.ok(boxes.length > 0, 'the actual archive contains labelled boxes');
    targetPart = boxes.sort((a, b) => Math.abs(a.x - middleX) - Math.abs(b.x - middleX)
      || Math.abs(a.y - eyeY) - Math.abs(b.y - eyeY))[0];
  }
  const expected = room.type === 'workshop'
    ? { kind: 'workbench', x: 180.9, z: -114.58 }
    : { kind: 'archive-box', x: 180.9, z: -109.39 };
  assert.equal(targetPart.kind, expected.kind);
  assert.ok(Math.abs(targetPart.x - expected.x) < .00001 && Math.abs(targetPart.z - expected.z) < .00001,
    'actual furniture matches the geometry for which this route was planned');
  assert.ok(targetPart.x - targetPart.sx / 2 >= room.bounds.minX
    && targetPart.x + targetPart.sx / 2 <= room.bounds.maxX
    && targetPart.z - targetPart.sz / 2 >= room.bounds.minZ
    && targetPart.z + targetPart.sz / 2 <= room.bounds.maxZ, 'actual target fits its real room');
  const target = { x: targetPart.x, y: targetPart.y, z: targetPart.z };
  const point = { x: target.x + (room.type === 'workshop' ? 2.5 : 2.3),
    z: target.z + (room.type === 'workshop' ? 0 : 1.29) };
  const tolerance = .18, playerRadius = PLAYER_DIMENSIONS.radius;
  assert.equal(playerRadius, .65, 'the planned route uses the shipped player radius');
  const nominalCheckedRadius = playerRadius + tolerance;
  const checkedRadius = playerRadius + Math.hypot(tolerance, tolerance);
  assert.ok(point.x - checkedRadius > room.bounds.minX && point.x + checkedRadius < room.bounds.maxX
    && point.z - checkedRadius > room.bounds.minZ && point.z + checkedRadius < room.bounds.maxZ,
  'the near viewpoint and both-axis tolerance fit inside the real room');
  const start = { x: arrived.position.x, z: arrived.position.z };
  const route = [start, { x: point.x, z: start.z }, point];
  for (const p of route) assert.ok(p.x >= room.bounds.minX && p.x <= room.bounds.maxX
    && p.z >= room.bounds.minZ && p.z <= room.bounds.maxZ, 'physical route centres remain in this room');
  const solids = layout.colliders.filter(c => c.physics !== false && c.maxY > floor.y + .000001
    && c.minY < floor.y + PLAYER_DIMENSIONS.height - .000001);
  assert.ok(solids.every(c => !c.yaw), 'the exact segment clearance solver requires these actual axis-aligned solids');
  const segments = route.slice(0, -1).map((from, index) => {
    const to = route[index + 1];
    assert.ok(from.x === to.x || from.z === to.z, 'WASD route segments are cardinal');
    const nearest = solids.map(c => ({ id: c.id, kind: c.kind, distance: Math.hypot(
      Math.max(0, c.x - c.hx - Math.max(from.x, to.x), Math.min(from.x, to.x) - (c.x + c.hx)),
      Math.max(0, c.z - c.hz - Math.max(from.z, to.z), Math.min(from.z, to.z) - (c.z + c.hz)),
    ) })).sort((a, b) => a.distance - b.distance)[0];
    assert.ok(nearest && nearest.distance > checkedRadius,
      'the entire segment clears actual solids, .65 m radius and both .18 m endpoint errors');
    return { from, to, nearestCollider: nearest,
      nominalClearanceMargin: nearest.distance - nominalCheckedRadius,
      bothAxisClearanceMargin: nearest.distance - checkedRadius };
  });
  return { buildingId: building.id, floorId, roomId: room.id, targetPart, target, point,
    playerRadius, endpointTolerance: tolerance, nominalCheckedRadius, checkedRadius,
    bodyHeight: PLAYER_DIMENSIONS.height, route, segments };
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
  // Starting the classic view prepares its street chunks asynchronously. A V
  // sent before controls resume is correctly ignored by the shipped UI.
  await page.waitForFunction(() => {
    const s = window.__NEON__.snapshot();
    return s.started && !s.paused && !s.streaming?.preparing && !s.streaming?.pending;
  });
  await page.locator('#game').focus();
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
      const near = nearFurniture && site === 'warehouse'
        ? await warehouseNearPlan(building, arrived.city.interior.floorId, room, arrived) : null;
      let viewPose = arrived;
      if (near) {
        await event('validated-furniture-near-route', near);
        await faceRoom(page, -Math.PI / 2);
        await walk('x', near.point.x); await walk('z', near.point.z);
        viewPose = await event('physical-furniture-near-approach', { roomId: room.id, point: near.point });
        assert.equal(viewPose.city.interior.currentRoomId, room.id);
      }
      // Default mode retains its original room-arrival viewpoint. Near mode
      // looks toward an actual part after physical movement through the room.
      const toward = near?.target || { x: room.x, z: room.z };
      const yaw = Math.atan2(toward.x - viewPose.position.x, toward.z - viewPose.position.z);
      await faceRoom(page, yaw);
      if (near) {
        const facing = await snapshot(page);
        const actualTargetDistanceXZ = Math.hypot(near.target.x - facing.position.x, near.target.z - facing.position.z);
        const actualEyeToTargetDistance = Math.hypot(near.target.x - facing.camera.position.x,
          near.target.y - facing.camera.position.y, near.target.z - facing.camera.position.z);
        assert.ok(actualTargetDistanceXZ >= 2 && actualTargetDistanceXZ <= 3, 'actual target is two to three horizontal metres away');
        assert.ok(actualEyeToTargetDistance >= 2 && actualEyeToTargetDistance <= 3, 'actual eye-to-part distance is two to three metres');
        await capture(`${site}-${type}-near`, { building: building.id, room, near,
          actualTargetDistanceXZ, actualEyeToTargetDistance });
      } else await capture(`${site}-${type}`, { building: building.id, room });
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
