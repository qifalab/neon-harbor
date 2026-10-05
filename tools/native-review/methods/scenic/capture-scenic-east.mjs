/** PREPARED ONLY: one fresh native case, explicit parent GPU GO, no retries.
 * Same method/world poses for baseline and authored runtimes. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, readdir, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createStaticServer } from './server.mjs';
import { snapshot, errorRecord, createInput } from './input.mjs';
import { currentRenderedCamera, phaseTimeout } from './render-readiness.mjs';

const methodRoot = dirname(fileURLToPath(import.meta.url));
const usage = 'cwd ACTUAL_PROJECT: node /tmp/neon-harbor-scenic-east-method-20261004/capture-scenic-east.mjs --case waterfront-day|waterfront-night|east-interior --mode baseline|authored --output NEW_EMPTY_DIR --gpu-go yes [--port 5232] [--reference DAY_OR_BASELINE_METADATA]';
const options = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const [flag, value] = process.argv.slice(i, i + 2);
  if (flag === '--help') { console.log(usage); process.exit(0); }
  assert.ok(['--case', '--mode', '--output', '--gpu-go', '--port', '--reference'].includes(flag) && value, usage);
  options[flag.slice(2)] = value;
}
assert.ok(['waterfront-day', 'waterfront-night', 'east-interior'].includes(options.case), usage);
assert.ok(['baseline', 'authored'].includes(options.mode), usage);
assert.equal(options['gpu-go'], 'yes', 'Preparation does not grant GPU execution permission.');
assert.ok(options.output, usage);
assert.ok(!process.env.CHROMIUM_PATH, 'Use the default Playwright Chromium only.');
const projectRoot = await realpath(process.cwd()), root = await realpath(resolve(projectRoot, 'dist'));
const output = resolve(options.output), port = Number(options.port || 5232);
assert.ok(Number.isInteger(port) && port > 0 && port < 65536);
await mkdir(output, { recursive: true });
assert.ok(relative(projectRoot, await realpath(output)).startsWith('..'), 'Evidence must remain outside frozen project.');
assert.deepEqual(await readdir(output), [], 'A previous result must never be overwritten.');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const hour = options.case === 'waterfront-night' ? 22 : 16.5;
const caseMinutes = options.case === 'east-interior' ? 60 : 15;
const record = { status: 'running', artAcceptance: 'PENDING_HUMAN_NATIVE_REVIEW', case: options.case, mode: options.mode,
  startedAt: new Date().toISOString(), projectRoot, servedRoot: root, methodRoot, runnerPid: process.pid,
  hour, viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, fov: 65, wholeCaseBudgetMinutes: caseMinutes,
  phaseLimitsMs: { normal: 180000, renderedCamera: 60000, inputHold: 120000, pointerLook: 30000, elevator: 900000, cleanup: 30000 },
  geometry: { playerRadius: .65, endpointTolerance: .15, bothAxisCheckRadius: .65 + Math.hypot(.15, .15) },
  inputs: [], events: [], captures: [], plans: [], errors: [], teardownEvents: [], cleanup: [], secondaryErrors: [],
  published: false,
  limitations: ['Independent public harbor-start / Atlas setups are not a continuous journey.',
    'High, original PNG pixels, actual camera/FOV and viewport are recorded; software WebGL does not measure hardware performance.',
    'Clock is set by visible range-input keys; traffic, residents and animation remain live.',
    'All game snapshots are read-only. No scene fixtures, debug setters, position/time/storage writes, request interception or quality drop.',
    'Physical completion and capture are separate from visual approval. No AAA quality claim is made.'] };
const persist = () => writeFile(resolve(output, 'metadata.json'), JSON.stringify(record, null, 2) + '\n');
const deadline = Date.now() + caseMinutes * 60000;
const remaining = (cap = 180000) => { const ms = Math.min(cap, deadline - Date.now()); assert.ok(ms > 0, 'Whole case deadline'); return ms; };
let server, browserServer, browserProcess, browser, context, page, input, primaryError = null, closing = false, playableComplete = false;
const hardStop = setTimeout(() => { record.hardDeadlineReached = true;
  browserServer?.kill().catch(error => record.secondaryErrors.push({ stage: 'hard-deadline-owned-browser-kill', ...errorRecord(error) }));
  server?.closeAllConnections();
}, caseMinutes * 60000);
const diagnostic = s => ({ started: s.started, paused: s.paused, settings: s.settings, position: s.position, camera: s.camera,
  inCar: s.inCar, transitRiding: s.city.transit.riding, sampleTransitRiding: s.city.sample.transit.riding,
  presentation: s.presentation, simulationTime: s.simulationTime, teleportRevision: s.teleportRevision,
  streaming: s.streaming, renderer: s.renderer, interior: s.city.interior, exterior: s.city.exterior,
  hiddenHarborShells: s.city.harbor.hiddenShells });
async function fingerprints() {
  const bytes = await readFile(resolve(root, 'build-info.json')), manifest = JSON.parse(bytes), hashes = {};
  assert.equal(manifest.version, '0.8.0');
  for (const [p, expected] of Object.entries(manifest.assets)) {
    assert.ok(!isAbsolute(p) && !p.split('/').includes('..'), 'Contained asset path');
    assert.equal(sha(await readFile(resolve(root, p))), expected, 'Served asset: ' + p);
    assert.equal(sha(await readFile(resolve(projectRoot, p))), expected, 'Actual project asset: ' + p);
    hashes[p] = expected;
  }
  const methods = {};
  for (const p of ['capture-scenic-east.mjs', 'input.mjs', 'render-readiness.mjs', 'server.mjs']) methods[p] = sha(await readFile(resolve(methodRoot, p)));
  const dependencies = {};
  for (const p of ['package.json', 'package-lock.json']) dependencies[p] = sha(await readFile(resolve(projectRoot, p)));
  return { buildInfoSha256: sha(bytes), hashes, methods, dependencies,
    assetCount: Object.keys(hashes).length, sourceCount: Object.keys(hashes).filter(p => p.startsWith('src/')).length,
    gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot, encoding: 'utf8' }).trim(),
    gitStatus: execFileSync('git', ['status', '--porcelain=v1'], { cwd: projectRoot, encoding: 'utf8' }) };
}
function assertSettings(s) {
  assert.equal(s.started, true); assert.equal(s.paused, false);
  assert.equal(s.settings.quality, 'high'); assert.equal(s.settings.dayCycle, false); assert.equal(s.settings.hour, hour);
  assert.equal(s.settings.firstPerson, true); assert.equal(s.settings.sensitivity, 1);
  assert.ok(!s.inCar && !s.city.transit.riding && !s.city.sample.transit.riding, 'Actual pedestrian game scene');
  assert.equal(s.camera.fov, 65); assert.equal(s.camera.boomLength, 0);
  assert.equal(s.streaming.failed, 0); assert.equal(s.renderer.contextLost, false);
  assert.equal(s.renderer.shadow.enabled, true); assert.equal(s.renderer.shadow.sunCastShadow, true);
  assert.equal(s.renderer.contactOcclusion.enabled, true); assert.equal(s.renderer.contactOcclusion.passes, 3);
  assert.equal(s.renderer.contactOcclusion.fallback, null);
  assert.deepEqual(s.renderer.contactOcclusion.sceneSize, [1280, 800]);
  assert.deepEqual(s.renderer.contactOcclusion.occlusionSize, [640, 400]);
}
async function event(kind, detail = {}, phaseDeadline = Math.min(deadline, Date.now() + 60000)) {
  const initial = await snapshot(page), expectedRevision = initial.teleportRevision;
  const item = { kind, detail, startedAt: new Date().toISOString(), expectedRevision,
    initialCamera: initial.camera, phaseDeadlineAt: new Date(phaseDeadline).toISOString(), status: 'waiting' };
  record.events.push(item); await persist();
  let first = null, result;
  try {
    await page.waitForFunction(currentRenderedCamera, { expectedRevision }, { polling: 'raf', timeout: phaseTimeout(Date.now(), deadline, phaseDeadline) });
    const s = await snapshot(page); assertSettings(s); assert.ok(currentRenderedCamera({ expectedRevision, state: s }));
    item.status = 'observed-current-render'; item.state = diagnostic(s); result = s;
  } catch (error) { first = error; item.status = 'failed'; item.firstError = errorRecord(error); }
  finally { item.finishedAt = new Date().toISOString();
    try { await persist(); } catch (error) { record.secondaryErrors.push({ stage: 'event-persist-' + kind, ...errorRecord(error) }); first ||= error; }
  }
  if (first) throw first; return result;
}
async function capture(label, detail = {}) {
  await page.waitForFunction(() => { const s = window.__NEON__.snapshot();
    return !s.streaming.preparing && !s.streaming.pending && s.renderer.triangles > 0 && !document.querySelector('#toasts .toast');
  }, null, { polling: 'raf', timeout: remaining() });
  await page.evaluate(() => new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok))));
  const before = await event('photo-ready-' + label); assert.equal(before.renderer.shadow.mapResident, true);
  const pixels = await page.locator('#game').evaluate(canvas => { const gl = canvas.getContext('webgl2');
    return { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight, lost: gl.isContextLost(), error: gl.getError(), dpr: devicePixelRatio }; });
  assert.deepEqual(pixels, { width: 1280, height: 800, lost: false, error: 0, dpr: 1 });
  const image = label + '-high.png', pose = label + '-pose.json';
  await page.screenshot({ path: resolve(output, image), timeout: remaining() });
  const after = await snapshot(page); assertSettings(after); assert.deepEqual(after.position, before.position);
  await writeFile(resolve(output, pose), JSON.stringify({ detail, before: diagnostic(before), after: diagnostic(after), pixels }, null, 2) + '\n');
  record.captures.push({ label, detail, image, pose, imageSha256: sha(await readFile(resolve(output, image))),
    poseSha256: sha(await readFile(resolve(output, pose))), pixels, position: after.position, camera: after.camera, simulationTime: after.simulationTime });
  await persist(); console.log('Captured ' + label);
}
async function prompt(text) {
  await page.waitForFunction(text => document.getElementById('interaction')?.textContent.includes(text), text,
    { polling: 'raf', timeout: remaining() });
  record.events.push({ kind: 'actual-visible-E-prompt', text: await page.locator('#interaction').textContent(),
    expected: text, at: new Date().toISOString() }); await persist();
}
async function boot() {
  await page.goto(`http://127.0.0.1:${port}/`, { timeout: remaining() });
  await page.waitForFunction(() => window.__NEON__?.snapshot().ready && !document.getElementById('start').disabled, null, { polling: 'raf', timeout: remaining() });
  const fresh = await snapshot(page); assert.equal(fresh.settings.quality, 'high', 'Fresh-storage shipped default High');
  await page.locator('#welcome-settings').click(); assert.equal(await page.locator('#quality').inputValue(), 'high');
  await page.locator('#quality').selectOption('high'); await page.locator('#volume').press('Home');
  const time = page.locator('#time'); assert.equal(await time.getAttribute('step'), '.1');
  await time.press('End'); for (let i = 0; i < (hour === 22 ? 19 : 74); i++) await time.press('ArrowLeft');
  assert.equal(Number(await time.inputValue()), hour);
  const settings = (await snapshot(page)).settings; assert.equal(settings.hour, hour); assert.equal(settings.dayCycle, false);
  const resetBefore = (await snapshot(page)).presentation.resetCount;
  await page.locator('#reset-save').click(); await page.locator('#confirm-reset').click();
  await page.waitForFunction(count => { const s = window.__NEON__.snapshot(); return s.presentation.resetCount > count
    && !document.getElementById('confirm-reset') && !!document.getElementById('quality') && !s.streaming.preparing && !s.streaming.pending;
  }, resetBefore, { polling: 'raf', timeout: remaining() });
  // Reset retains the paused panel and clears the camera. Resume before waiting for it.
  await page.locator('#resume').click(); await page.locator('#harbor-start').click();
  await page.waitForFunction(() => { const s = window.__NEON__.snapshot(); return s.started && !s.paused && s.settings.firstPerson
    && !document.getElementById('harbor-start').disabled && !s.streaming.preparing && !s.streaming.pending;
  }, null, { polling: 'raf', timeout: remaining() });
  await page.locator('#game').focus();
  const s = await event('real-public-harbor-start', { initialFreshSettings: fresh.settings });
  assert.ok(Math.hypot(s.position.x - 285.5, s.position.z - 42) < .03);
  assert.ok(Math.abs(s.camera.pitch + .06) < .003);
  assert.ok(Math.abs(Math.atan2(Math.sin(s.camera.yaw - Math.PI / 2), Math.cos(s.camera.yaw - Math.PI / 2))) < .003);
}
async function sourceLayout(building, state) {
  const [{ createInteriorLayout }, { expansionBuilding }, { PLAYER_DIMENSIONS }] = await Promise.all([
    import(pathToFileURL(resolve(projectRoot, 'src/metropolis-interiors.js'))),
    import(pathToFileURL(resolve(projectRoot, 'src/expansion-programmes.js'))),
    import(pathToFileURL(resolve(projectRoot, 'src/world-config.js'))) ]);
  assert.equal(PLAYER_DIMENSIONS.radius, .65); assert.equal(PLAYER_DIMENSIONS.height, 1.8);
  expansionBuilding({ ...building, id: building.shellId }, 'east', 11);
  const floor = building.floors.find(f => f.id === state.city.interior.floorId), layout = createInteriorLayout(building, floor);
  assert.deepEqual(layout.rooms, state.city.interior.rooms, 'Plan is the actual active floor and room programme');
  assert.deepEqual(layout.entrance, state.city.interior.entrance);
  assert.equal(layout.elevator.x, state.city.interior.cabin.x); assert.equal(layout.elevator.z, state.city.interior.cabin.z);
  return { layout, floor };
}
async function route(building, label, points) {
  const before = await event('route-plan-' + label), { layout, floor } = await sourceLayout(building, before);
  const solids = layout.colliders.filter(c => c.physics !== false && c.maxY > floor.y + .000001 && c.minY < floor.y + 1.8 - .000001);
  assert.ok(solids.every(c => !c.yaw), 'Axis-aligned static route solver');
  const routePoints = [{ x: before.position.x, z: before.position.z }, ...points];
  const segments = routePoints.slice(0, -1).map((from, i) => {
    const to = routePoints[i + 1]; assert.ok(from.x === to.x || from.z === to.z, 'Cardinal real-input route');
    const nearest = solids.map(c => ({ id: c.id, kind: c.kind, distance: Math.hypot(
      Math.max(0, c.x - c.hx - Math.max(from.x, to.x), Math.min(from.x, to.x) - (c.x + c.hx)),
      Math.max(0, c.z - c.hz - Math.max(from.z, to.z), Math.min(from.z, to.z) - (c.z + c.hz))) })).sort((a, b) => a.distance - b.distance)[0];
    assert.ok(nearest.distance > record.geometry.bothAxisCheckRadius, 'Full segment clears player radius and both-axis .15 endpoint errors');
    return { from, to, nearestCollider: nearest, clearanceMargin: nearest.distance - record.geometry.bothAxisCheckRadius };
  });
  const plan = { label, buildingId: building.id, floorId: floor.id, floorY: floor.y, routePoints, segments, actualEndpoints: [],
    limitation: 'Static active-floor solids only; dynamic cabin safety doors are validated by real open-door input and actual traversal.' };
  record.plans.push(plan); await persist();
  for (const to of points) { const now = await snapshot(page);
    if (Math.abs(to.x - now.position.x) >= .15) await input.walk('x', to.x);
    if (Math.abs(to.z - (await snapshot(page)).position.z) >= .15) await input.walk('z', to.z);
    const actual = await snapshot(page), error = { x: Math.abs(actual.position.x - to.x), z: Math.abs(actual.position.z - to.z) };
    plan.actualEndpoints.push({ target: to, actual: actual.position, error, simulationTime: actual.simulationTime,
      teleportRevision: actual.teleportRevision, floorId: actual.city.interior.floorId, at: new Date().toISOString() });
    assert.ok(error.x < .15 && error.z < .15, 'Both actual waypoint axes must retain the exact source-plan tolerance; no correction retry');
    assert.equal(actual.city.interior.floorId, floor.id); assert.equal(actual.teleportRevision, before.teleportRevision);
  }
  await event('physical-route-complete-' + label);
}
async function room(building, type, label) {
  let s = await event('actual-room-' + type); const r = s.city.interior.rooms.find(r => r.type === type); assert.ok(r);
  const p = s.position;
  await route(building, label + '-enter', [{ x: building.x, z: p.z }, { x: building.x, z: r.entrance.z },
    { x: r.arrival.x, z: r.entrance.z }, { x: r.arrival.x, z: r.arrival.z }]);
  s = await event('physical-room-entry-' + type); assert.equal(s.city.interior.currentRoomId, r.id);
  await input.face(Math.atan2(r.x - s.position.x, r.z - s.position.z), .15);
  await capture(label, { buildingId: building.id, room: r });
  if (type === 'lookout') { await input.face(-Math.PI / 2, .26); await capture('east-observation-waterfront-view', { actualUpperFloor: s.city.interior.floorId, realRoom: r }); }
  await route(building, label + '-return', [{ x: (await snapshot(page)).position.x, z: r.entrance.z }, { x: building.x, z: r.entrance.z }]);
  assert.equal((await snapshot(page)).city.interior.currentRoomId, null);
}
async function elevator(building, destination) {
  let s = await event('lift-approach-' + destination); const cabin = s.city.interior.cabin;
  assert.equal(s.city.interior.elevator.doorOpen, 1);
  await route(building, 'physical-cabin-entry-' + destination, [{ x: building.x, z: s.position.z }, { x: cabin.x, z: s.position.z }, { x: cabin.x, z: cabin.z }]);
  const before = await event('inside-real-elevator-' + destination), phaseDeadline = Math.min(deadline, Date.now() + 900000);
  await prompt('电梯');
  await page.keyboard.press('e'); await page.locator(`[data-floor-id="${destination}"]`).click();
  await page.waitForFunction(id => { const i = window.__NEON__.snapshot().city.interior; return i.floorId === id && !i.moving && i.elevator.doorOpen === 1; }, destination,
    { polling: 'raf', timeout: Math.min(remaining(900000), Math.max(1, phaseDeadline - Date.now())) });
  s = await event('real-elevator-arrival-' + destination, { departure: diagnostic(before) }, phaseDeadline);
  const f = building.floors.find(f => f.id === destination); assert.ok(Math.abs(s.position.y - f.y) < .15);
  assert.ok(s.simulationTime - before.simulationTime < 60, 'Actual elevator simulation completion budget');
  assert.equal(s.city.interior.activeFloors, 3);
  if (destination === 'observation') { await input.face(Math.PI, .15); await capture('east-upper-elevator-cabin', { actualCabin: s.city.interior.cabin, floor: f }); }
  const c = s.city.interior.cabin;
  await route(building, 'physical-cabin-exit-' + destination, [{ x: s.position.x, z: c.doorZ + 1.05 }, { x: building.x, z: c.doorZ + 1.05 }]);
}
async function east() {
  let s = await event('east-address-selection'); const b = s.city.buildings.find(b => b.id === 'east-012');
  assert.ok(b && b.programmeUse === 'office' && b.district === 'east-expansion' && b.height === 386 && b.floors.length === 89);
  record.building = b; await persist();
  await page.locator('#explore-city').click(); await page.locator('[data-visit-building="east-012"]').click();
  await page.waitForFunction(() => { const s = window.__NEON__.snapshot(), b = s.city.buildings.find(b => b.id === 'east-012');
    return !s.paused && !s.streaming.preparing && !s.streaming.pending && !s.city.interior.buildingId && Math.hypot(s.position.x - b.entrance.x, s.position.z - b.entrance.z) < .1;
  }, null, { polling: 'raf', timeout: remaining() });
  await event('one-public-atlas-address-setup', { independentSetup: true, buildingId: b.id });
  await prompt('进入 ' + b.name);
  await page.locator('#game').focus(); await page.keyboard.press('e');
  await page.waitForFunction(() => window.__NEON__.snapshot().city.interior.buildingId === 'east-012', null, { polling: 'raf', timeout: remaining() });
  s = await event('real-E-east-lobby-entry'); assert.equal(s.city.interior.floorId, 'lobby');
  await room(b, 'office', 'east-lobby-office'); await room(b, 'conference', 'east-lobby-conference');
  await elevator(b, 'observation'); await room(b, 'lookout', 'east-upper-lookout'); await elevator(b, 'lobby');
  s = await event('real-lobby-return'); const exit = s.city.interior.entrance;
  // The real central aisle's midpoint keeps each declared physical leg finite;
  // every segment is still checked against this actual lobby's solids.
  await route(b, 'physical-street-door-return', [{ x: exit.x, z: s.position.z }, { x: exit.x, z: b.z }, { x: exit.x, z: exit.z }]);
  await prompt('返回街道');
  await page.keyboard.press('e'); await page.waitForFunction(() => !window.__NEON__.snapshot().city.interior.buildingId, null, { polling: 'raf', timeout: remaining() });
  s = await event('real-E-safe-street-exit'); assert.deepEqual(s.city.exterior, { southInteriorId: null, harborInteriorId: null });
  assert.equal(s.city.harbor.hiddenShells, 0); await input.walk('z', s.position.z + 1.5); await event('real-exterior-walk-after-exit');
}

try {
  await persist(); record.freezeBefore = await fingerprints();
  await writeFile(resolve(output, 'build-info.json'), await readFile(resolve(root, 'build-info.json')));
  for (const p of Object.keys(record.freezeBefore.methods)) await writeFile(resolve(output, p), await readFile(resolve(methodRoot, p)));
  await persist();
  const { chromium } = createRequire(resolve(projectRoot, 'package.json'))('@playwright/test');
  server = await createStaticServer({ root }); await new Promise((ok, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', ok); });
  record.httpServer = { pid: process.pid, address: server.address() };
  const response = await fetch(`http://127.0.0.1:${port}/build-info.json`, { signal: AbortSignal.timeout(remaining(15000)) }); assert.ok(response.ok);
  assert.equal(sha(Buffer.from(await response.arrayBuffer())), record.freezeBefore.buildInfoSha256);
  browserServer = await chromium.launchServer({ headless: true, args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], timeout: remaining(60000) });
  browserProcess = browserServer.process(); browser = await chromium.connect(browserServer.wsEndpoint(), { timeout: remaining(30000) });
  record.browser = { version: browser.version(), executablePath: chromium.executablePath(), ownedPid: browserProcess.pid,
    launchMethod: 'official launchServer/connect', node: process.version,
    launchArgs: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] };
  assert.equal(browser.version(), '151.0.7922.34');
  context = await browser.newContext({ viewport: record.viewport, deviceScaleFactor: 1 }); page = await context.newPage(); page.setDefaultTimeout(remaining());
  page.on('pageerror', error => record.errors.push({ kind: 'pageerror', ...errorRecord(error) }));
  page.on('console', message => { if (message.type() === 'error') record.errors.push({ kind: 'console', message: message.text() }); });
  page.on('response', response => { if (response.status() >= 400) record.errors.push({ kind: 'http', status: response.status(), url: response.url() }); });
  page.on('requestfailed', request => { const item = { kind: 'requestfailed', url: request.url(), failure: request.failure() };
    (closing && item.failure?.errorText === 'net::ERR_ABORTED' ? record.teardownEvents : record.errors).push(item); });
  input = createInput(page, { remaining, record, persist }); await boot();
  if (options.case === 'east-interior') await east(); else await capture(options.case, { publicViewpoint: 'harbor-start', independentSetup: true });
  if (options.reference) {
    const reference = JSON.parse(await readFile(resolve(options.reference))); record.reference = { path: resolve(options.reference), sha256: sha(await readFile(resolve(options.reference))) };
    assert.equal(reference.case === options.case || (reference.case.startsWith('waterfront-') && options.case.startsWith('waterfront-')), true);
    assert.equal(reference.captures.length, record.captures.length, 'Same method capture count');
    for (const [i, a] of record.captures.entries()) { const b = reference.captures[i];
      for (const axis of ['x', 'y', 'z']) assert.ok(Math.abs(a.position[axis] - b.position[axis]) < .15, 'Matched actual world pose');
      assert.ok(Math.abs(Math.atan2(Math.sin(a.camera.yaw - b.camera.yaw), Math.cos(a.camera.yaw - b.camera.yaw))) < .003);
      assert.ok(Math.abs(a.camera.pitch - b.camera.pitch) < .004); assert.equal(a.camera.fov, b.camera.fov); assert.deepEqual(a.pixels, b.pixels);
    }
    record.referencePosesMatched = true;
  }
  assert.deepEqual(record.errors, []); playableComplete = true;
} catch (error) {
  primaryError = error; record.primaryError = errorRecord(error);
  if (page && !page.isClosed()) {
    try { record.failureState = diagnostic(await snapshot(page)); } catch (error) { record.secondaryErrors.push({ stage: 'failure-snapshot', ...errorRecord(error) }); }
    try { await page.screenshot({ path: resolve(output, 'failure-high.png'), timeout: remaining(15000) }); } catch (error) { record.secondaryErrors.push({ stage: 'failure-photo', ...errorRecord(error) }); }
  }
} finally {
  closing = true;
  const closureDeadline = Math.min(deadline, Date.now() + 30000);
  async function close(label, operation) { let timer; const item = { label, startedAt: new Date().toISOString(), timeoutMs: Math.max(1, closureDeadline - Date.now()) };
    try { await Promise.race([Promise.resolve().then(operation), new Promise((_, reject) => timer = setTimeout(() => reject(new Error(label + ' 30s closure deadline')), item.timeoutMs))]); item.status = 'closed'; }
    catch (error) { item.status = 'failed'; item.error = errorRecord(error); primaryError ||= error; }
    finally { clearTimeout(timer); item.finishedAt = new Date().toISOString(); record.cleanup.push(item); } }
  if (context) await close('browser-context', () => context.close());
  if (browser) await close('browser-connection', () => browser.close());
  if (browserServer) await close('owned-browser-server', () => browserServer.close());
  if (browserProcess && browserProcess.exitCode === null && browserProcess.signalCode === null) {
    const error = new Error('Owned browser process survived normal 30s cleanup'); primaryError ||= error;
    record.secondaryErrors.push({ stage: 'owned-child-hard-cleanup', ...errorRecord(error) });
    try { browserProcess.kill('SIGKILL'); } catch (error) { record.secondaryErrors.push({ stage: 'owned-child-kill', ...errorRecord(error) }); }
  }
  if (server) { server.closeAllConnections(); await close('static-server', () => new Promise((ok, reject) => server.close(error => error ? reject(error) : ok()))); }
  if (browserProcess) record.browserProcessAfter = { pid: browserProcess.pid, exitCode: browserProcess.exitCode, signalCode: browserProcess.signalCode };
  try { record.freezeAfter = await fingerprints(); assert.deepEqual(record.freezeAfter, record.freezeBefore); record.freezeUnchanged = true; }
  catch (error) { record.secondaryErrors.push({ stage: 'end-freeze', ...errorRecord(error) }); primaryError ||= error; }
  if (record.errors.length || !playableComplete || record.hardDeadlineReached || Date.now() >= deadline) primaryError ||= new Error('Errors, incomplete route or case deadline');
  record.status = primaryError ? 'failed' : 'capture-complete-art-review-pending'; record.primaryError = primaryError ? errorRecord(primaryError) : null;
  record.closedAt = new Date().toISOString(); record.finishedBeforeDeadline = Date.now() < deadline;
  try { await persist(); } catch (error) { console.error('Final metadata persistence failed', errorRecord(error)); primaryError ||= error; }
  if (record.hardDeadlineReached || Date.now() >= deadline || record.errors.length) {
    primaryError ||= new Error('Late native error or whole-case deadline during final persistence');
    record.status = 'failed'; record.primaryError = errorRecord(primaryError);
    record.finishedBeforeDeadline = Date.now() < deadline; record.errorsAfterFinalization = structuredClone(record.errors);
    try { await persist(); } catch (error) { console.error('Late metadata persistence failed', errorRecord(error)); }
  }
  clearTimeout(hardStop);
}
if (primaryError) { console.error(primaryError.stack); process.exitCode = 1; }
else console.log('Case closed; original pixels await visual review: ' + output);
