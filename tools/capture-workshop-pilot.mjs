/** Prepared real-game browser method. Do not run until the parent sends GPU GO.
 * Public Atlas sets one independent starting address. E, cardinal WASD/Z and
 * ordinary pointer drags supply every following door/near-view/exit action.
 * No game, camera, clock, localStorage or debug-state setter is used.
 */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStaticServer } from './server.mjs';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const usage = 'node tools/capture-workshop-pilot.mjs --gpu-go yes [--root dist] [--output NEW_DIR] [--port 5208] [--scenarios normal,404,delay-exit]';
const options = {};
for (let index = 2; index < process.argv.length; index += 2) {
  const flag = process.argv[index], value = process.argv[index + 1];
  if (flag === '--help') { console.log(usage); process.exit(0); }
  assert.ok(['--gpu-go', '--root', '--output', '--port', '--scenarios'].includes(flag) && value, usage);
  options[flag.slice(2)] = value;
}
assert.equal(options['gpu-go'], 'yes', 'Prepared method is gated. Wait for explicit parent GPU GO before passing --gpu-go yes.');
const root = resolve(projectRoot, options.root || 'dist');
const output = resolve(projectRoot, options.output || `test-results/workshop-pilot-${new Date().toISOString().replace(/[:.]/g, '-')}`);
const scenarios = (options.scenarios || 'normal,404,delay-exit').split(',');
assert.ok(scenarios.length && scenarios.every(value => ['normal', '404', 'delay-exit'].includes(value)));
assert.equal(new Set(scenarios).size, scenarios.length);
const port = Number(options.port || 5208); assert.ok(Number.isInteger(port) && port > 0 && port < 65536);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const manifestBytes = await readFile(resolve(root, 'build-info.json')), manifest = JSON.parse(manifestBytes);
const sourceHashes = {};
for (const [path, expected] of Object.entries(manifest.assets)) {
  assert.equal(sha(await readFile(resolve(root, path))), expected, `Built bytes: ${path}`);
  sourceHashes[path] = sha(await readFile(resolve(projectRoot, path)));
  assert.equal(sourceHashes[path], expected, `Rebuild isolated dist before capture: ${path}`);
}
const methodPaths = ['tools/capture-workshop-pilot.mjs', 'tools/server.mjs',
  'tools/workshop-review-helpers/walking.js', 'tools/workshop-review-helpers/occupied.js', 'package.json', 'package-lock.json'];
const methodHashes = Object.fromEntries(await Promise.all(methodPaths.map(async path => [path, sha(await readFile(resolve(projectRoot, path)))])));
await mkdir(output, { recursive: true }); assert.deepEqual(await readdir(output), [], 'Preserve prior original evidence; choose an empty output directory');
await writeFile(resolve(output, 'build-info.json'), manifestBytes);
const viewport = { width: 1280, height: 800 };
const record = { status: 'running', startedAt: new Date().toISOString(), root, viewport, deviceScaleFactor: 1,
  buildInfoSha256: sha(manifestBytes), buildRevision: manifest.revision, sourceHashes, methodHashes,
  gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot, encoding: 'utf8' }).trim(),
  gitStatus: execFileSync('git', ['status', '--porcelain=v1'], { cwd: projectRoot, encoding: 'utf8' }),
  browser: null, scenarios: [],
  method: 'Fresh contexts; visible settings choose High/static16.5; V selects first person. One public Atlas travel locates south-086 per context, explicitly independent setup. E enters/exits; WASD/Z crosses the actual workshop door and approaches its existing furniture. Pointer drags aim from the reached player pose. __NEON__.snapshot() is read-only.',
  limits: ['Prepared method is not executed evidence until status passed and raw screenshots/logs exist.',
    'Atlas setup is not a continuous city route. No coordinate/clock/storage debug writes.',
    'Normal, controlled404 and delayed-exit run sequentially in separate contexts; expected failure errors never enter normal zero-errors result.',
    'renderer.info.memory counts Three GPU resource objects, not driver allocation bytes; FPS on SwiftShader is not hardware performance.',
    'Each rendered asset must synchronously release its own uploaded geometry/PBR/bone objects. Street totals are observed across cycles; dynamic city LOD caches prevent using their equality as an ownership assertion. The original failed strict-baseline run remains archived separately.',
    'Source mesh/texture counts and native screenshots do not establish AAA or complete-harbour art quality.',
    'Delay-exit reports actual abort and disposed fulfilled vice. If chest fetch was aborted, it does not claim a late chest parse completed.'] };
const persist = () => writeFile(resolve(output, 'metadata.json'), JSON.stringify(record, null, 2) + '\n');
await persist();
// Only after the explicit flag and all frozen-build checks load browser tools.
let chromium, snapshot, walkAxis, faceRoom, server;
let browser, currentPage, currentScenario;
const totalDeadline = Date.now() + 60 * 60 * 1000;
let scenarioDeadline = totalDeadline;
const deadlineJobs = [];
async function stopForDeadline(scope, close) {
  scope.hardDeadlineReached = true; scope.timeoutLastObservedEvent = currentScenario?.events.at(-1) || null;
  // At most 4 s extra for failure preservation; never extend playable input.
  try {
    if (currentPage && snapshot) scope.timeoutSnapshot = await Promise.race([snapshot(currentPage),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Deadline snapshot unavailable within2s')), 2000))]);
  } catch (error) { scope.timeoutSnapshotFailure = error.message; }
  try {
    if (currentPage) { const name = scope === record ? 'whole-method' : scope.name;
      const filename = `${name}-deadline-original.png`;
      await currentPage.screenshot({ path: resolve(output, filename), timeout: 2000 }); scope.timeoutImage = filename; }
  } catch (error) { scope.timeoutImageFailure = error.message; }
  finally { await close(); }
}
const hardStop = setTimeout(() => { const job = stopForDeadline(record, () => browser?.close()); deadlineJobs.push(job); job.catch(() => {}); }, 60 * 60 * 1000);
const remaining = (limit = 180000) => { const budget = Math.min(limit, totalDeadline - Date.now(), scenarioDeadline - Date.now()); assert.ok(budget > 0, 'Finite scenario/60-minute whole-method budget'); return budget; };
const turn = (page, yaw) => faceRoom(page, yaw, { timeout: remaining(30000), settleTimeout: remaining(15000) });

function assertSettings(state) {
  assert.equal(state.settings.quality, 'high'); assert.equal(state.settings.dayCycle, false);
  assert.equal(state.settings.hour, 16.5); assert.equal(state.settings.firstPerson, true); assert.equal(state.paused, false);
  assert.equal(state.settings.sensitivity, 1, 'Copied native mouse helper assumes the fresh default sensitivity');
  assert.equal(state.streaming?.failed || 0, 0);
  assert.equal(state.renderer.contextLost, false); assert.equal(state.renderer.shadow.enabled, true);
  assert.equal(state.renderer.shadow.sunCastShadow, true);
  assert.equal(state.renderer.contactOcclusion.enabled, true); assert.equal(state.renderer.contactOcclusion.passes, 3);
  assert.equal(state.renderer.contactOcclusion.fallback, null);
  assert.deepEqual(state.renderer.contactOcclusion.sceneSize, [1280, 800]);
  assert.deepEqual(state.renderer.contactOcclusion.occlusionSize, [640, 400]);
}
function assertReady(state) {
  const pilot = state.city.interior.workshopPilot; assert.ok(pilot);
  assert.equal(pilot.status, 'ready'); assert.equal(pilot.assetCount, 2); assert.equal(pilot.fallbackVisible, false);
  assert.deepEqual(pilot.errors, []);
  const sum = key => pilot.resources.reduce((total, resource) => total + resource[key], 0);
  assert.equal(sum('meshes'), 11); assert.equal(sum('triangles'), 16224); assert.equal(sum('geometries'), 11);
  assert.equal(sum('textures'), 6); assert.equal(sum('decodedTextures'), 6);
  for (const resource of pilot.resources) for (const image of resource.images) {
    assert.equal(image.decoded, true); assert.equal(image.width, 1024); assert.equal(image.height, 1024);
    assert.ok(['ImageBitmap', 'HTMLImageElement'].includes(image.decoderObject), 'Real browser decoder objects, not CPU placeholders');
  }
  return pilot;
}
async function event(page, kind, detail = {}) {
  const state = await snapshot(page); assertSettings(state);
  currentScenario.events.push({ kind, at: new Date().toISOString(), detail, position: state.position,
    camera: state.camera, simulationTime: state.simulationTime, teleportRevision: state.teleportRevision,
    buildingId: state.city.interior.buildingId, roomId: state.city.interior.currentRoomId,
    renderer: state.renderer, pilot: state.city.interior.workshopPilot,
    lifecycle: state.city.interior.workshopPilotEvents });
  await persist(); return state;
}
async function walk(page, axis, target) {
  await turn(page, Math.PI); const before = await snapshot(page);
  await walkAxis(page, axis, target, { precision: true, tolerance: .18, timeout: remaining(120000) });
  const after = await event(page, 'physical-WASD-Z', { axis, target, from: before.position });
  assert.equal(after.teleportRevision, before.teleportRevision, 'Physical approach cannot teleport'); return after;
}
async function boot(page) {
  await page.goto(`http://127.0.0.1:${port}/`, { timeout: remaining() });
  await page.waitForFunction(() => window.__NEON__?.snapshot().ready && !document.getElementById('start').disabled, null, { timeout: remaining() });
  await page.locator('#welcome-settings').click(); await page.locator('#quality').selectOption('high');
  await page.locator('#cycle').uncheck(); assert.equal(Number(await page.locator('#time').inputValue()), 16.5);
  // Keyboard activation of the shipped settings UI commits the default time.
  await page.locator('#time').press('ArrowLeft'); await page.locator('#time').press('ArrowRight');
  await page.locator('#volume').press('Home'); await page.locator('#resume').click(); await page.locator('#start').click();
  await page.waitForFunction(() => { const s = window.__NEON__.snapshot(); return s.started && !s.paused && !s.streaming?.preparing && !s.streaming?.pending; }, null, { timeout: remaining() });
  await page.locator('#game').focus(); if (!(await snapshot(page)).settings.firstPerson) await page.keyboard.press('v');
  await page.waitForFunction(() => window.__NEON__.snapshot().settings.firstPerson, null, { timeout: remaining() });
  await page.locator('#explore-city').click(); await page.locator('#atlas-search').fill('Old Quarter 86');
  await page.locator('[data-visit-building="south-086"]').click();
  await page.waitForFunction(() => { const s = window.__NEON__.snapshot(), b = s.city.buildings.find(b => b.id === 'south-086');
    return !s.paused && !s.city.interior.buildingId && !s.streaming?.preparing && !s.streaming?.pending && Math.hypot(s.position.x - b.entrance.x, s.position.z - b.entrance.z) < .1; }, null, { timeout: remaining() });
  await event(page, 'independent-public-Atlas-location-setup', { address: 'south-086', continuousJourney: false });
}
async function enterWorkshop(page) {
  await turn(page, Math.PI);
  assert.ok((await page.locator('#interaction').textContent()).includes('进入'), 'Actual exterior E prompt');
  await page.keyboard.press('e');
  await page.waitForFunction(() => window.__NEON__.snapshot().city.interior.buildingId === 'south-086', null, { timeout: remaining() });
  const inside = await event(page, 'real-E-entry'); assert.equal(inside.city.interior.floorId, 'lobby');
  const room = inside.city.interior.rooms.find(item => item.type === 'workshop'); assert.ok(room);
  await walk(page, 'x', 200); await walk(page, 'z', room.entrance.z);
  await walk(page, 'x', room.arrival.x);
  assert.equal((await snapshot(page)).city.interior.currentRoomId, room.id);
  await event(page, 'physical-real-room-door-entry', { room }); return room;
}
async function exitStreet(page, { fromChest = false } = {}) {
  // Avoid the workbench: the tool-box viewpoint returns east before turning.
  const state = await snapshot(page);
  if (fromChest || state.position.x < 182.8) await walk(page, 'x', 182.8);
  await walk(page, 'z', -115); await walk(page, 'x', 200);
  const exit = (await snapshot(page)).city.interior.entrance; await walk(page, 'z', exit.z);
  assert.ok((await page.locator('#interaction').textContent()).includes('返回街道'), 'Actual interior E exit prompt');
  await page.keyboard.press('e');
  await page.waitForFunction(() => !window.__NEON__.snapshot().city.interior.buildingId, null, { timeout: remaining() });
  const outside = await event(page, 'real-E-street-exit');
  assert.equal(outside.city.interior.workshopPilot, null);
  assert.deepEqual(outside.city.exterior, { southInteriorId: null, harborInteriorId: null });
  return outside;
}
async function stableMemory(page, label) {
  const samples = [], deadline = Date.now() + remaining(120000); let stable = 0, previous = null;
  while (Date.now() < deadline && stable < 4) {
    await page.waitForTimeout(1000); const state = await snapshot(page); assertSettings(state);
    assert.equal(state.city.interior.buildingId, null); assert.equal(state.city.interior.workshopPilot, null);
    const memory = { ...state.renderer.memory };
    assert.ok(Number.isInteger(memory.geometries) && Number.isInteger(memory.textures));
    samples.push({ at: new Date().toISOString(), memory, programs: state.renderer.programs,
      position: state.position, simulationTime: state.simulationTime, pendingChunks: state.streaming?.pending || 0 });
    stable = JSON.stringify(memory) === previous && !state.streaming?.pending ? stable + 1 : 1;
    previous = JSON.stringify(memory);
  }
  assert.ok(stable >= 4, 'Memory must actually settle; do not invent or widen a tolerance');
  const result = { label, samples, stableMemory: samples.at(-1).memory };
  currentScenario.memory.push(result); await persist(); return result.stableMemory;
}
function assertAssetRelease(event, { rendered }) {
  assert.equal(event.kind, 'asset-released');
  const vice = event.assetId === 'bench_vice_01';
  assert.ok(vice || event.assetId === 'metal_tool_chest');
  assert.equal(event.resourceRelease.geometries, vice ? 4 : 7);
  assert.equal(event.resourceRelease.textures, 3);
  assert.equal(event.resourceRelease.boneTextures, rendered && vice ? 1 : 0);
  assert.equal(event.resourceRelease.closedImages, 3);
  const release = event.rendererRelease;
  assert.equal(release.scope, 'single synchronous asset disposal');
  assert.equal(release.attachedAtRelease, rendered);
  assert.equal(release.available, true, 'Unavailable diagnostics must fail validation, never invent zero');
  assert.deepEqual(release.readErrors, []);
  for (const sample of [release.before, release.after]) {
    assert.ok(Number.isInteger(sample?.geometries) && Number.isInteger(sample?.textures), 'Actual renderer counter copies required');
  }
  assert.deepEqual(release.difference, rendered
    ? { geometries: vice ? 4 : 7, textures: vice ? 4 : 3 }
    : { geometries: 0, textures: 0 }, rendered
    ? 'Rendered owned model synchronously releases its actual uploaded geometry/PBR/bone texture objects'
    : 'Decoded but never attached/rendered model releases CPU objects without inventing GPU allocations');
}
function assertRenderedVisitReleased(state, sequenceAfter = 0) {
  const releases = state.city.interior.workshopPilotEvents.filter(event => event.kind === 'asset-released' && event.sequence > sequenceAfter);
  assert.deepEqual(releases.map(event => event.assetId).sort(), ['bench_vice_01', 'metal_tool_chest']);
  for (const release of releases) assertAssetRelease(release, { rendered: true });
  return releases;
}
async function aim(page, target) {
  const state = await snapshot(page), eye = state.camera.position;
  await turn(page, Math.atan2(target.x - eye.x, target.z - eye.z));
  const current = await snapshot(page);
  const horizontal = Math.hypot(target.x - current.camera.position.x, target.z - current.camera.position.z);
  const pitch = .15 + Math.asin(Math.max(-1, Math.min(1, (current.camera.position.y - target.y) / horizontal)));
  const box = await page.locator('#game').boundingBox(), x = box.x + box.width * .65, y = box.y + box.height * .25;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x, y + (pitch - current.camera.pitch) / .003); await page.mouse.up();
  await page.waitForFunction(pitch => Math.abs(window.__NEON__.snapshot().camera.pitch - pitch) < .004, pitch, { timeout: remaining(15000) });
}
async function capture(page, label, { requireReady = true, target = null } = {}) {
  await page.waitForFunction(() => { const s = window.__NEON__.snapshot(); return !s.streaming?.preparing && !s.streaming?.pending && s.renderer.triangles > 0 && !document.querySelector('#toasts .toast'); }, null, { timeout: remaining() });
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  const before = await snapshot(page); assertSettings(before); if (requireReady) assertReady(before);
  assert.equal(before.renderer.shadow.mapResident, true, 'Actual High directional shadow target exists');
  // One explicit capture checkpoint reads/drains GL errors. The hot snapshot
  // never calls getError, so routine polling cannot hide graphics errors.
  const gl = await page.locator('#game').evaluate(canvas => { const context = canvas.getContext('webgl2');
    const info = context.getExtension('WEBGL_debug_renderer_info');
    return { width: context.drawingBufferWidth, height: context.drawingBufferHeight,
      contextLost: context.isContextLost(), errorAtCapture: context.getError(), version: context.getParameter(context.VERSION),
      renderer: info ? context.getParameter(info.UNMASKED_RENDERER_WEBGL) : context.getParameter(context.RENDERER) }; });
  assert.equal(gl.width, 1280); assert.equal(gl.height, 800); assert.equal(gl.contextLost, false); assert.equal(gl.errorAtCapture, 0);
  const file = `${currentScenario.name}-${label}-high.png`; await page.screenshot({ path: resolve(output, file), timeout: remaining() });
  const after = await snapshot(page); assert.deepEqual(after.position, before.position);
  const poseFile = `${currentScenario.name}-${label}-pose.json`;
  const detail = { before, after, gl, target,
    targetDistanceXZ: target ? Math.hypot(target.x - after.position.x, target.z - after.position.z) : null,
    eyeDistance: target ? Math.hypot(target.x - after.camera.position.x, target.y - after.camera.position.y, target.z - after.camera.position.z) : null };
  await writeFile(resolve(output, poseFile), JSON.stringify(detail, null, 2) + '\n');
  currentScenario.captures.push({ file, sha256: sha(await readFile(resolve(output, file))), poseFile,
    poseSha256: sha(await readFile(resolve(output, poseFile))), gl, quality: 'high', originalPixels: [1280, 800] }); await persist();
}
async function waitReady(page) {
  await page.waitForFunction(() => window.__NEON__.snapshot().city.interior.workshopPilot?.status === 'ready', null, { timeout: remaining() });
  return assertReady(await snapshot(page));
}
async function nearViews(page, { photographs = false, cycle = 0 } = {}) {
  await waitReady(page); await walk(page, 'x', 182.8); await walk(page, 'z', -114.58);
  const vice = assertReady(await snapshot(page)).bounds.find(box => box.id === 'bench_vice_01');
  const viceTarget = Object.fromEntries(['x', 'y', 'z'].map((axis, i) => [axis, (vice.min[i] + vice.max[i]) / 2]));
  await aim(page, viceTarget);
  if (photographs) await capture(page, `cycle${cycle}-vice-near`, { target: viceTarget });
  assert.equal((await snapshot(page)).city.interior.workshopPilot.boneTextureCount, 1, 'Real rendered retained vice skin allocates one shared bone texture');
  await walk(page, 'z', -117.7); await walk(page, 'x', 181.2);
  const chest = assertReady(await snapshot(page)).bounds.find(box => box.id === 'metal_tool_chest');
  const chestTarget = Object.fromEntries(['x', 'y', 'z'].map((axis, i) => [axis, (chest.min[i] + chest.max[i]) / 2]));
  await aim(page, chestTarget);
  if (photographs) await capture(page, `cycle${cycle}-chest-near`, { target: chestTarget });
  await event(page, 'actual-11mesh-6texture-near-verification', { cycle, viceTarget, chestTarget });
}

try {
  [{ chromium }, { snapshot, walkAxis }, { faceRoom }] = await Promise.all([
    import('@playwright/test'), import('./workshop-review-helpers/walking.js'), import('./workshop-review-helpers/occupied.js'),
  ]);
  server = await createStaticServer({ root });
  await new Promise((done, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', done); });
  browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  record.browser = { version: browser.version(), executable: 'Playwright-installed Chromium', backend: 'Actual GL renderer recorded per screenshot', node: process.version };
  assert.equal(browser.version(), '151.0.7922.34', 'Same specified browser as source308 native review');
  for (const name of scenarios) {
    const phaseMinutes = name === 'normal' ? 40 : 10;
    scenarioDeadline = Math.min(totalDeadline, Date.now() + phaseMinutes * 60 * 1000);
    const scenario = { name, status: 'running', context: 'fresh isolated browser context', phaseBudgetMinutes: phaseMinutes,
      events: [], captures: [], memory: [], errors: [], expectedErrors: [], teardownEvents: [], injection: [], lifecycleAfterExit: null };
    currentScenario = scenario;
    record.scenarios.push(currentScenario); await persist();
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 }); const page = await context.newPage(); currentPage = page;
    let closing = false;
    const phaseStop = setTimeout(() => { const job = stopForDeadline(scenario, () => context.close()); deadlineJobs.push(job); job.catch(() => {}); }, remaining(phaseMinutes * 60 * 1000));
    page.setDefaultTimeout(180000); page.setDefaultNavigationTimeout(180000);
    const chestPath = '/assets/harbor/workshop/metal_tool_chest.glb';
    const expectedNetwork = (url, text, type) => name !== 'normal' && url.includes(chestPath) &&
      (name === '404' ? type === 'http404' || /404/.test(text) : type === 'aborted' || /ERR_ABORTED|aborted/i.test(text));
    page.on('pageerror', error => scenario.errors.push({ type: 'pageerror', message: error.message }));
    page.on('console', message => { if (message.type() !== 'error') return;
      const item = { type: 'console', message: message.text(), url: message.location().url };
      (expectedNetwork(item.url, item.message, '') ? scenario.expectedErrors : scenario.errors).push(item); });
    page.on('response', response => { if (response.status() < 400) return;
      const item = { type: 'http', status: response.status(), url: response.url() };
      (expectedNetwork(item.url, '', response.status() === 404 ? 'http404' : '') ? scenario.expectedErrors : scenario.errors).push(item); });
    page.on('requestfailed', request => { const item = { type: 'requestfailed', url: request.url(), message: request.failure()?.errorText || '' };
      if (closing && /ERR_ABORTED|aborted/i.test(item.message)) { scenario.teardownEvents.push(item); return; }
      (expectedNetwork(item.url, item.message, /ERR_ABORTED|aborted/i.test(item.message) ? 'aborted' : '') ? scenario.expectedErrors : scenario.errors).push(item); });
    const held = [];
    if (name === '404') await page.route(`**${chestPath}`, route => route.fulfill({ status: 404, contentType: 'text/plain', body: 'Deliberate isolated missing workshop chest' }));
    if (name === 'delay-exit') await page.route(`**${chestPath}`, route => {
      scenario.injection.push({ kind: 'GLB-response-held', url: route.request().url(), at: new Date().toISOString() });
      held.push(route); // Network interception only; normal case has no route.
    });
    try {
      await boot(page); await enterWorkshop(page);
      if (name === 'normal') {
        // Observe the warmed street total, and assert owned disposal in the
        // synchronous release interval where no city render/update can mix in.
        await nearViews(page, { photographs: true, cycle: 0 }); await exitStreet(page, { fromChest: true });
        assertRenderedVisitReleased(await snapshot(page));
        const baseline = await stableMemory(page, 'warm-outside-baseline');
        currentScenario.baseline = baseline;
        currentScenario.globalMemoryObservations = [];
        for (let cycle = 1; cycle <= 3; cycle++) {
          const before = await snapshot(page), sequenceAfter = before.city.interior.workshopPilotEvents.at(-1)?.sequence || 0;
          await enterWorkshop(page);
          await nearViews(page, { photographs: cycle === 3, cycle });
          await exitStreet(page, { fromChest: true });
          const state = await snapshot(page);
          const releases = assertRenderedVisitReleased(state, sequenceAfter);
          const after = await stableMemory(page, `actual-E-exit-reentry-cycle-${cycle}`);
          currentScenario.globalMemoryObservations.push({ cycle, baseline, after,
            difference: { geometries: after.geometries - baseline.geometries, textures: after.textures - baseline.textures },
            ownedReleaseEvents: releases,
            interpretation: 'Observed global Three object totals; dynamic LOD caches are outside this pilot ownership assertion. No city-wide leak or driver allocation conclusion.' });
          assert.equal(state.teleportRevision - before.teleportRevision, 2, 'Only public E entry/exit context transitions');
          await persist();
        }
      } else if (name === '404') {
        await page.waitForFunction(() => window.__NEON__.snapshot().city.interior.workshopPilot?.status === 'failed', null, { timeout: remaining() });
        const failed = (await snapshot(page)).city.interior.workshopPilot;
        assert.equal(failed.assetCount, 0); assert.equal(failed.fallbackVisible, true);
        assert.ok(failed.errors.some(error => error.includes('HTTP 404'))); assert.equal(failed.releasedAssets, 1, 'Fulfilled vice is disposed when other official asset fails');
        const rejectedVisit = (await snapshot(page)).city.interior.workshopPilotEvents.filter(event => event.kind === 'asset-released');
        assert.equal(rejectedVisit.length, 1); assertAssetRelease(rejectedVisit[0], { rendered: false });
        await walk(page, 'x', 182.8); await walk(page, 'z', -114.58);
        await aim(page, { x: 180.35, y: 1.275, z: -114.58 });
        await capture(page, 'expected-primitive-fallback', { requireReady: false });
        await exitStreet(page); currentScenario.lifecycleAfterExit = (await snapshot(page)).city.interior.workshopPilotEvents;
        assert.ok(currentScenario.expectedErrors.some(error => error.type === 'http' && error.status === 404));
      } else {
        await page.waitForFunction(() => { const s = window.__NEON__.snapshot(); return s.city.interior.workshopPilot?.status === 'loading' &&
          s.city.interior.workshopPilotEvents.some(event => event.kind === 'asset-decoded' && event.assetId === 'bench_vice_01' && event.resources.decodedTextures === 3); }, null, { timeout: remaining() });
        assert.equal(held.length, 1); const waiting = await snapshot(page);
        assert.equal(waiting.city.interior.workshopPilot.assetCount, 0); assert.equal(waiting.city.interior.workshopPilot.fallbackVisible, true);
        await event(page, 'decoded-vice-waits-for-controlled-delayed-chest');
        await exitStreet(page);
        const chestBytes = await readFile(resolve(root, 'assets/harbor/workshop/metal_tool_chest.glb'));
        for (const route of held) {
          try { await route.fulfill({ status: 200, contentType: 'model/gltf-binary', body: chestBytes });
            currentScenario.injection.push({ kind: 'delayed-response-release-attempt', outcome: 'fulfill accepted after E exit' });
          } catch (error) {
            currentScenario.injection.push({ kind: 'delayed-response-release-attempt', outcome: 'fulfill attempt failed',
              abortEvidence: scenario.expectedErrors.filter(item => item.type === 'requestfailed' && /ERR_ABORTED|aborted/i.test(item.message)), message: error.message });
          }
        }
        await page.waitForFunction(() => window.__NEON__.snapshot().city.interior.workshopPilotEvents.some(event =>
          event.kind === 'asset-released' && event.assetId === 'bench_vice_01' && event.disposed), null, { timeout: remaining() });
        const after = await snapshot(page); assert.equal(after.city.interior.workshopPilot, null);
        currentScenario.lifecycleAfterExit = after.city.interior.workshopPilotEvents;
        const disposed = currentScenario.lifecycleAfterExit.find(event => event.kind === 'disposed');
        const released = currentScenario.lifecycleAfterExit.find(event => event.kind === 'asset-released' && event.assetId === 'bench_vice_01');
        assert.ok(released.sequence > disposed.sequence, 'Actual completed vice resources released after the floor was disposed');
        assert.equal(released.resourceRelease.geometries, 4); assert.equal(released.resourceRelease.textures, 3);
        assert.ok(released.resourceRelease.closedImages >= 3, 'Actual decoded ImageBitmaps closed after exit');
        assertAssetRelease(released, { rendered: false });
        currentScenario.abortVsLateParse = { fulfilledViceDecoded: true, fulfilledViceReleasedAfterDisposed: true,
          delayedChestAbortEvidence: scenario.expectedErrors.filter(item => item.type === 'requestfailed' && /ERR_ABORTED|aborted/i.test(item.message)),
          delayedChestDecodedAfterExit: after.city.interior.workshopPilotEvents.some(event => event.kind === 'asset-decoded' && event.assetId === 'metal_tool_chest' && event.disposed),
          note: 'A rejected/aborted chest is not recorded as a successful late parse. The actual lifecycle list determines the result.' };
        if (currentScenario.abortVsLateParse.delayedChestDecodedAfterExit) {
          const chestRelease = currentScenario.lifecycleAfterExit.find(event => event.kind === 'asset-released' && event.assetId === 'metal_tool_chest' && event.disposed);
          assert.ok(chestRelease && chestRelease.sequence > disposed.sequence, 'A true late chest parse must also be released');
          assert.equal(chestRelease.resourceRelease.geometries, 7); assert.equal(chestRelease.resourceRelease.textures, 3);
          assert.ok(chestRelease.resourceRelease.closedImages >= 3);
          assertAssetRelease(chestRelease, { rendered: false });
          currentScenario.abortVsLateParse.lateChestReleased = true;
        }
        await event(page, 'delayed-exit-no-floor-resurrection');
      }
      assert.deepEqual(currentScenario.errors, [], `${name}: unexpected page/shader/HTTP/request errors are forbidden`);
    } catch (error) {
      scenario.failure = error.stack;
      scenario.status = 'failed';
      await persist(); // Preserve the first assertion before optional capture.
      try { scenario.failureSnapshot = await snapshot(page); }
      catch (captureError) { scenario.failureSnapshotError = captureError.stack || String(captureError); }
      await persist();
      const filename = `${name}-failure-original.png`;
      scenario.failureImageAttempt = { file: filename, timeoutMs: 30000, startedAt: new Date().toISOString() };
      await persist();
      try { await page.screenshot({ path: resolve(output, filename), timeout: 30000 });
        scenario.failureImage = filename;
        scenario.failureImageAttempt.status = 'captured';
        scenario.failureImageAttempt.sha256 = sha(await readFile(resolve(output, filename)));
      } catch (captureError) {
        scenario.failureImageAttempt.status = 'failed';
        scenario.failureImageAttempt.error = captureError.stack || String(captureError);
      }
      scenario.failureImageAttempt.completedAt = new Date().toISOString();
      await persist();
      throw error;
    } finally { closing = true; clearTimeout(phaseStop); await context.close(); currentPage = null; }
    assert.deepEqual(scenario.errors, [], `${name}: include unexpected teardown errors before marking passed`);
    assert.ok(!scenario.hardDeadlineReached && !record.hardDeadlineReached && Date.now() < scenarioDeadline, 'A timeout cannot be marked passed');
    scenario.status = 'passed'; scenario.completedAt = new Date().toISOString(); await persist();
  }
  assert.equal(sha(await readFile(resolve(root, 'build-info.json'))), record.buildInfoSha256);
  for (const [path, expected] of Object.entries(sourceHashes)) {
    assert.equal(sha(await readFile(resolve(projectRoot, path))), expected, `Source stayed frozen: ${path}`);
    assert.equal(sha(await readFile(resolve(root, path))), expected, `Served bytes stayed frozen: ${path}`);
  }
  for (const [path, expected] of Object.entries(methodHashes)) assert.equal(sha(await readFile(resolve(projectRoot, path))), expected, `Method stayed frozen: ${path}`);
  assert.ok(!record.hardDeadlineReached && Date.now() < totalDeadline, 'Whole-method timeout cannot be marked passed');
  clearTimeout(hardStop);
  record.status = 'passed'; record.completedAt = new Date().toISOString(); await persist();
} catch (error) {
  record.status = 'failed'; record.failure = error.stack;
  if (currentScenario) currentScenario.status = 'failed';
  // Scenario capture already ran before its context closed. Do not silently
  // retry the screenshot or replace the first assertion with capture errors.
  if (currentScenario?.failure) record.failureCapture = { scenario: currentScenario.name,
    snapshotRecorded: !!currentScenario.failureSnapshot,
    snapshotError: currentScenario.failureSnapshotError || null,
    imageAttempt: currentScenario.failureImageAttempt || null };
  else if (currentPage) {
    try { record.failureSnapshot = await snapshot(currentPage); }
    catch (captureError) { record.failureSnapshotError = captureError.stack || String(captureError); }
    const filename = 'failure-original.png';
    record.failureImageAttempt = { file: filename, timeoutMs: 30000, startedAt: new Date().toISOString() };
    await persist();
    try { await currentPage.screenshot({ path: resolve(output, filename), timeout: 30000 });
      record.failureImageAttempt.status = 'captured';
      record.failureImageAttempt.sha256 = sha(await readFile(resolve(output, filename)));
    } catch (captureError) { record.failureImageAttempt.status = 'failed';
      record.failureImageAttempt.error = captureError.stack || String(captureError); }
    record.failureImageAttempt.completedAt = new Date().toISOString();
  } else record.failureCaptureUnavailable = 'No live page remains; no capture was retried.';
  await persist(); throw error;
} finally { clearTimeout(hardStop); await browser?.close(); if (server) await new Promise(done => server.close(done));
  if (deadlineJobs.length) { await Promise.allSettled(deadlineJobs);
    if (record.hardDeadlineReached || currentScenario?.hardDeadlineReached) {
      record.status = 'failed'; if (currentScenario) currentScenario.status = 'failed';
      record.failure ||= 'Hard deadline reached during finalization';
    }
    await persist(); } }
