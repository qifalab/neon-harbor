import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import * as THREE from '../../vendor/three/three.module.js';
import { createWorld } from '../../src/world.js';
import { VEHICLE_DIMENSIONS, PLAYER_DIMENSIONS } from '../../src/world-config.js';

// Input/geometry regressions use a modest viewport on CI's software GPU.
// Default-HIGH visual review is captured separately at desktop resolution.
test.use({ viewport: { width: 800, height: 500 }, video: { mode: 'on', size: { width: 640, height: 400 } } });
test.setTimeout(240000);

// Check the browser against the shipped geometry, independently of the runtime's
// collision helpers. Input always comes through the public keyboard/mouse/UI.
const world = createWorld(THREE, new THREE.Scene(), { quality: 'balanced' });
const snapshot = page => page.evaluate(() => window.__NEON__.snapshot());
const angleDifference = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

async function boot(page, player, onReady) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`); });
  await page.goto('/');
  await expect(page.locator('#start')).toBeEnabled();
  if (onReady) await onReady(await snapshot(page));
  await page.locator('#welcome-settings').click();
  await page.locator('#quality').selectOption('low');
  if (player) {
    await page.locator('#save-file').setInputFiles({
      name: 'stability-route.json', mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ version: 1, cash: 1200, completed: [], bestTimes: {}, player })),
    });
    await expect(page.locator('#toasts')).toContainText('进度已导入');
  }
  await page.locator('#resume').click();
  await page.locator('#start').click();
  await expect(page.locator('#game')).toBeFocused();
  return errors;
}

async function travel(page, keys, predicate) {
  const started = (await snapshot(page)).simulationTime;
  for (const key of keys) await page.keyboard.down(key);
  try {
    await page.waitForFunction(`(() => {
      const state = window.__NEON__.snapshot();
      if (state.simulationTime - ${started} > 12) throw new Error('Movement exceeded its simulated-time budget');
      return (${predicate.toString()})(state);
    })()`, null, { polling: 'raf', timeout: 45000 });
  } catch (error) {
    const state = await snapshot(page);
    error.message += `\nReal input diagnostics: ${JSON.stringify({ position: state.position,
      paused: state.paused, fps: state.fps, simulationTime: state.simulationTime, renderer: state.renderer,
      streaming: state.streaming })}`;
    throw error;
  } finally { for (const key of keys) await page.keyboard.up(key); }
}

/** Collect rendered frames, not timer-based screenshots or mutations to game state. */
async function record(page, { seconds = 0, frames = 0, untilVehicleDamaged = null } = {}) {
  return page.evaluate(({ seconds, frames, untilVehicleDamaged }) => new Promise((resolve, reject) => {
    const samples = [], start = window.__NEON__.snapshot().simulationTime;
    const deadline = setTimeout(() => reject(new Error('Simulation did not advance during real input')), 45000);
    function capture() {
      const s = window.__NEON__.snapshot();
      samples.push({ time: s.simulationTime, position: s.position, speed: s.speed,
        inCar: s.inCar, cars: s.cars, presentation: s.presentation, camera: s.camera,
        streaming: s.streaming, timing: s.timing, fps: s.fps, renderer: s.renderer });
      if ((untilVehicleDamaged && s.cars.some(car => car.id === untilVehicleDamaged && car.health < 100)) ||
          (frames && samples.length >= frames) || (seconds && s.simulationTime - start >= seconds)) {
        clearTimeout(deadline); resolve(samples);
      } else requestAnimationFrame(capture);
    }
    requestAnimationFrame(capture);
  }), { seconds, frames, untilVehicleDamaged });
}

async function recordInput(page, keys, observation) {
  for (const key of keys) await page.keyboard.down(key);
  try { return await record(page, typeof observation === 'number' ? { seconds: observation } : observation); }
  finally { for (const key of keys) await page.keyboard.up(key); }
}

async function attachMetrics(testInfo, name, metrics) {
  const path = testInfo.outputPath('stability-metrics.json');
  await writeFile(path, JSON.stringify(metrics, null, 2));
  await testInfo.attach(name, { path, contentType: 'application/json' });
}

function cameraPenetrations(camera) {
  const p = camera.position, radius = camera.clearanceRadius - .015;
  return world.colliders.filter(b => b.camera !== false &&
    Math.hypot(Math.max(Math.abs(p.x - b.x) - b.hx, 0),
      Math.max(b.minY - p.y, 0, p.y - b.maxY),
      Math.max(Math.abs(p.z - b.z) - b.hz, 0)) < radius);
}

function vehiclePenetration(body, box) {
  if (box.physics === false || box.minY >= (body.y || 0) + VEHICLE_DIMENSIONS.height || box.maxY <= (body.y || 0) + .2) return 0;
  const c = Math.cos(body.yaw), s = Math.sin(body.yaw), hx = VEHICLE_DIMENSIONS.halfWidth, hz = VEHICLE_DIMENSIONS.halfLength;
  const axes = [[1, 0], [0, 1], [c, -s], [s, c]];
  return Math.min(...axes.map(([x, z]) => {
    const carRadius = hx * Math.abs(x * c - z * s) + hz * Math.abs(x * s + z * c);
    return carRadius + box.hx * Math.abs(x) + box.hz * Math.abs(z) - Math.abs((body.x - box.x) * x + (body.z - box.z) * z);
  }));
}

function assertPresentation(samples) {
  expect(samples.length).toBeGreaterThan(1);
  let maximumFocusError = 0, maximumTargetLag = 0, maximumPenetration = 0;
  for (const sample of samples) {
    const { subject, renderedSubject } = sample.presentation;
    for (const pose of [subject, renderedSubject, sample.camera.position, sample.camera.target]) {
      expect([pose.x, pose.y, pose.z].every(Number.isFinite)).toBe(true);
    }
    const focusError = Math.hypot(sample.camera.focus.x - subject.x, sample.camera.focus.z - subject.z);
    maximumFocusError = Math.max(maximumFocusError, focusError);
    // Body and camera focus must use the same interpolated pose on every frame.
    expect(Math.hypot(renderedSubject.x - subject.x, renderedSubject.y - subject.y, renderedSubject.z - subject.z)).toBeLessThan(.001);
    expect(Math.abs(angleDifference(renderedSubject.yaw, subject.yaw))).toBeLessThan(.001);
    expect(focusError).toBeLessThan(.001);
    const lag = Math.hypot(sample.camera.target.x - subject.x, sample.camera.target.z - subject.z);
    maximumTargetLag = Math.max(maximumTargetLag, lag);
    expect(lag).toBeLessThan(3);
    expect(cameraPenetrations(sample.camera).map(b => b.id)).toEqual([]);
    if (sample.inCar) {
      for (const body of [sample.cars.find(car => car.id === sample.inCar), renderedSubject]) {
        const deepest = world.colliders.reduce((worst, box) => {
          const depth = vehiclePenetration(body, box);
          return depth > worst.depth ? { depth, id: box.id } : worst;
        }, { depth: 0, id: null });
        maximumPenetration = Math.max(maximumPenetration, deepest.depth);
        expect(deepest.depth, `Car intersects ${deepest.id} by ${deepest.depth.toFixed(3)}m`).toBeLessThan(.02);
      }
    }
  }
  return { frames: samples.length, maximumFocusError, maximumTargetLag, maximumPenetration,
    minimumObservedFPS: Math.min(...samples.map(s => s.fps)),
    maximumObservedFPS: Math.max(...samples.map(s => s.fps)),
    maximumDrawCalls: Math.max(...samples.map(s => s.renderer.calls)),
    maximumTriangles: Math.max(...samples.map(s => s.renderer.triangles)) };
}

test('driving and steering share one render pose; pause/resume and exit remain stable', async ({ page }, testInfo) => {
  const errors = await boot(page);
  await travel(page, ['w'], s => s.position.z < 164);
  await page.keyboard.press('e');
  await expect.poll(async () => (await snapshot(page)).inCar).toBe('starter');
  await travel(page, ['w'], s => s.speed > 13);
  const left = await recordInput(page, ['a'], .75);
  const right = await recordInput(page, ['d'], .75);
  expect(Math.abs(angleDifference(left.at(-1).position.yaw, left[0].position.yaw))).toBeGreaterThan(.35);
  expect(Math.abs(angleDifference(right.at(-1).position.yaw, right[0].position.yaw))).toBeGreaterThan(.2);
  const metrics = assertPresentation([...left, ...right]);
  await page.screenshot({ path: 'test-results/screenshots/06-stable-driving.png' });
  await travel(page, ['Space'], s => s.speed < .04);
  await page.keyboard.press('Escape');
  const paused = await record(page, { frames: 4 });
  for (const frame of paused.slice(1)) {
    expect(frame.time).toBe(paused[0].time);
    expect(frame.camera).toEqual(paused[0].camera);
    expect(frame.presentation.subject).toEqual(paused[0].presentation.subject);
  }
  await page.locator('#resume').click();
  const resumed = await record(page, { seconds: .25 });
  expect(Math.hypot(resumed.at(-1).position.x - paused[0].position.x,
    resumed.at(-1).position.z - paused[0].position.z)).toBeLessThan(.05);
  await page.keyboard.press('e');
  await expect.poll(async () => (await snapshot(page)).inCar).toBeNull();
  const exited = await snapshot(page);
  for (const car of exited.cars) {
    const dx = exited.position.x - car.x, dz = exited.position.z - car.z;
    const c = Math.cos(car.yaw), s = Math.sin(car.yaw);
    const gap = Math.hypot(Math.max(Math.abs(dx * c - dz * s) - VEHICLE_DIMENSIONS.halfWidth, 0),
      Math.max(Math.abs(dx * s + dz * c) - VEHICLE_DIMENSIONS.halfLength, 0));
    expect(gap).toBeGreaterThanOrEqual(PLAYER_DIMENSIONS.radius - .02);
  }
  expect(errors).toEqual([]);
  await attachMetrics(testInfo, 'driving-stability-metrics', metrics);
});

test('a fast steering approach stops the full car body outside the generated buildings', async ({ page }, testInfo) => {
  const errors = await boot(page, { x: 8, z: 164, yaw: Math.PI });
  await page.keyboard.press('e');
  await expect.poll(async () => (await snapshot(page)).inCar).toBe('starter');
  let approach;
  // Keep the throttle held through the turn so control/renderer latency does not
  // insert a coast before this route reaches the clear section of the façade.
  await page.keyboard.down('w');
  try {
    await page.waitForFunction(() => window.__NEON__.snapshot().position.z < 142,
      null, { polling: 'raf', timeout: 20000 });
    expect((await snapshot(page)).speed).toBeGreaterThan(25);
    await page.keyboard.down('d');
    try { approach = await record(page, { untilVehicleDamaged: 'starter' }); }
    finally { await page.keyboard.up('d'); }
  } finally { await page.keyboard.up('w'); }
  const car = approach.at(-1).cars.find(car => car.id === 'starter');
  expect(car.health).toBeLessThan(100);
  // An oblique impact preserves tangential sliding; verify a substantial loss
  // relative to the measured approach speed rather than requiring a full stop.
  const peakSpeed = Math.max(...approach.map(frame => frame.speed));
  expect(peakSpeed).toBeGreaterThan(25);
  expect(approach.at(-1).speed).toBeLessThan(peakSpeed * .6);
  const contact = approach.flatMap(frame => world.colliders.filter(box => box.kind === 'building')
    .map(box => ({ building: box.id, separation: -vehiclePenetration(frame.cars.find(c => c.id === 'starter'), box) })))
    .sort((a, b) => a.separation - b.separation)[0];
  expect(contact.separation, 'The route must actually contact a building, not just damage a roadside prop').toBeLessThan(.12);
  const metrics = assertPresentation(approach);
  expect(errors).toEqual([]);
  await attachMetrics(testInfo, 'wall-contact-metrics', { ...metrics, contact, peakSpeed, impactSpeed: approach.at(-1).speed, health: car.health });
});

test('orbiting beside a real façade retracts the camera and walking cannot enter it', async ({ page }, testInfo) => {
  const wall = world.colliders.find(b => b.kind === 'building' && b.x === -187 && b.z === 133);
  expect(wall).toBeTruthy();
  const spawn = { x: wall.x, z: wall.z + wall.hz + 1.4, yaw: Math.PI };
  const errors = await boot(page, spawn);
  const canvas = await page.locator('#game').boundingBox();
  // Start on the unobstructed right side: the minimap covers the lower left at
  // compact desktop widths. Pointer capture then keeps the entire orbit on game.
  await page.mouse.move(canvas.x + canvas.width * .88, canvas.y + canvas.height * .5);
  await page.mouse.down();
  await expect(page.locator('#game')).toBeFocused();
  // Half an orbit turns the camera boom into the wall while the player stays still.
  await page.mouse.move(canvas.x + canvas.width * .88 - Math.PI / .005,
    canvas.y + canvas.height * .5, { steps: 20 });
  await page.mouse.up();
  const orbit = await record(page, { seconds: .65 });
  expect(orbit.some(frame => frame.camera.obstructed)).toBe(true);
  expect(orbit.at(-1).camera.boomLength).toBeLessThan(orbit.at(-1).camera.desiredBoomLength - 1);
  const metrics = assertPresentation(orbit);
  await page.screenshot({ path: 'test-results/screenshots/07-wall-camera.png' });
  await page.keyboard.press('c');
  // Recentring is deliberately damped. Start the straight walking assertion
  // when the visible camera has finished turning, rather than assuming a snap.
  await page.waitForFunction(() => Math.abs(Math.atan2(
    Math.sin(window.__NEON__.snapshot().camera.yaw - Math.PI),
    Math.cos(window.__NEON__.snapshot().camera.yaw - Math.PI))) < .002,
  null, { polling: 'raf', timeout: 20000 });
  const walk = await recordInput(page, ['w'], .65);
  const final = walk.at(-1).position;
  expect(spawn.z - final.z).toBeGreaterThan(.3);
  expect(final.z - (wall.z + wall.hz)).toBeGreaterThanOrEqual(PLAYER_DIMENSIONS.radius - .01);
  expect(Math.abs(final.x - spawn.x)).toBeLessThan(.05);
  assertPresentation(walk);
  expect(errors).toEqual([]);
  await attachMetrics(testInfo, 'camera-clearance-metrics', metrics);
});

test('driving streams real city resources and evicts distant detail within the cache limit', async ({ page }, testInfo) => {
  const chunkResponses = [];
  page.on('response', response => {
    if (/\/assets\/city\/chunks\/[^/]+\.json(?:\?|$)/.test(response.url())) chunkResponses.push(response);
  });
  let initial;
  const errors = await boot(page, undefined, state => {
    initial = state.streaming;
    expect(state.settings.quality).toBe('high');
    expect(initial.ready).toBe(true);
    expect(initial.failed).toBe(0);
    expect(initial.pending).toBe(0);
    expect(initial.loaded).toBeGreaterThan(0);
    expect(initial.targetChunks.every(id => initial.activeChunks.includes(id))).toBe(true);
  });
  await travel(page, ['w'], s => s.position.z < 164);
  await page.keyboard.press('e');
  await expect.poll(async () => (await snapshot(page)).inCar).toBe('starter');
  const route = [];
  // Cross multiple 80m neighbourhoods through the normal driving controls.
  // Sampling by simulation duration remains meaningful under CI software GPU.
  for (let segment = 0; segment < 12 && (await snapshot(page)).position.z > -60; segment++) {
    route.push(...await recordInput(page, ['w'], .75));
  }
  expect((await snapshot(page)).position.z).toBeLessThan(-60);
  await travel(page, ['Space'], state => state.speed < .04);
  await page.waitForFunction(() => {
    const s = window.__NEON__.snapshot().streaming;
    return s.pending === 0 && s.unloaded > 0 && s.targetChunks.every(id => s.activeChunks.includes(id));
  }, null, { polling: 'raf', timeout: 20000 });
  const final = (await snapshot(page)).streaming;
  expect(final.failed).toBe(0);
  expect(final.requested).toBeGreaterThan(initial.requested);
  expect(final.bytes).toBeGreaterThan(initial.bytes);
  expect(final.residentBytes).toBeGreaterThan(0);
  expect(final.unloaded).toBeGreaterThan(0);
  expect(initial.activeChunks.some(id => !final.activeChunks.includes(id))).toBe(true);
  for (const { streaming, position } of route) {
    expect(streaming.failed).toBe(0);
    expect(streaming.loaded).toBeLessThanOrEqual(streaming.maxResidentChunks);
    expect(streaming.residentMeshes).toBeGreaterThan(0);
    const currentDistrict = `${Math.floor((position.x + 320) / 80)}_${Math.floor((position.z + 320) / 80)}`;
    expect(streaming.activeChunks, `Near street detail missing in ${currentDistrict}`).toContain(currentDistrict);
  }
  expect(final.disposedInstances).toBeGreaterThan(0);
  // These responses are south-shore files; the aggregate also includes the
  // independent north-shore cache retained for distant silhouettes.
  expect(chunkResponses.length).toBeGreaterThan(initial.south.loaded);
  // Reading the actual response bodies proves these are fetched detail assets,
  // rather than visibility toggles over a fully preconstructed city.
  const payloadSizes = await Promise.all(chunkResponses.map(async response => {
    expect(response.status()).toBe(200);
    return (await response.body()).byteLength;
  }));
  expect(payloadSizes.every(size => size > 0)).toBe(true);
  expect(errors).toEqual([]);
  await attachMetrics(testInfo, 'city-streaming-metrics', {
    requestedChunks: chunkResponses.length,
    responseBytes: payloadSizes.reduce((sum, size) => sum + size, 0),
    maximumLoadedChunks: Math.max(...route.map(s => s.streaming.loaded)),
    initial, final,
  });
});
