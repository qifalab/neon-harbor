import { test, expect } from '@playwright/test';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createHarborVehicleLayout } from '../../src/harbor-vehicle-models.js';
import { snapshot, walkAxis } from './helpers/walking.js';
import { faceRoom, frameOccupiedRoom } from './helpers/occupied.js';
import { ferryControlSnapshot, waitFerryControlFrame, observedFerryMouseTarget } from './helpers/ferry-control.js';

// Product menus establish the initial location only. Cabin/stair/pier travel
// and carrying a funded delivery use real inputs and the unmodified game clock.
test.use({ viewport: { width: 512, height: 320 } });
test.setTimeout(600000);
const angle = value => Math.atan2(Math.sin(value), Math.cos(value));
const savedGame = page => page.evaluate(() => JSON.parse(localStorage.getItem('neon-harbor.progress.v1')));
const cabinMotion = page => page.evaluate(() => {
  const s = window.__NEON__.snapshot(), t = s.city.sample.transit;
  return { local: t.passengerLocal, vehicle: t.vehicles.find(v => v.id === t.ridingVehicleId),
    cameraYaw: s.camera?.yaw, sensitivity: s.settings.sensitivity, time: s.simulationTime,
    teleportRevision: s.teleportRevision, deck: t.passengerDeck };
});

async function boot(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`); });
  await page.goto('/');
  try { await expect(page.locator('#start')).toBeEnabled({ timeout: 90000 }); }
  catch (error) { error.message += `\nStartup errors: ${JSON.stringify(errors)}`; throw error; }
  expect((await snapshot(page)).settings.quality).toBe('high');
  await page.locator('#welcome-settings').click();
  await page.locator('#quality').selectOption('low');
  await page.locator('#resume').click();
  await page.locator('#welcome-sample').click();
  await expect(page.locator('#sample-stops')).toBeVisible();
  return errors;
}

async function publicStart(page, selector) {
  await page.locator(selector).click();
  await expect(page.locator('#panel')).not.toBeVisible({ timeout: 60000 });
  await expect(page.locator('#game')).toBeFocused();
}

async function openSettings(page) {
  if (!(await page.locator('#panel').isVisible())) await page.keyboard.press('Escape');
  await page.locator('[data-tab="settings"]').click();
  expect((await snapshot(page)).paused).toBe(true);
}

async function saveThroughUI(page) {
  await openSettings(page);
  const download = page.waitForEvent('download');
  await page.locator('#export-save').click();
  await download;
  return savedGame(page);
}

async function captureHigh(page, info, name) {
  await openSettings(page);
  await page.locator('#quality').selectOption('high');
  await page.locator('#resume').click();
  await page.waitForFunction(() => window.__NEON__.snapshot().renderer.triangles > 0, null, { polling: 'raf' });
  const file = info.outputPath(`${name}.png`);
  await page.screenshot({ path: file, timeout: 90000 });
  await info.attach(name, { path: file, contentType: 'image/png' });
  const s = await snapshot(page);
  const pose = { quality: s.settings.quality, hour: s.settings.hour, position: s.position, camera: s.camera,
    simulationTime: s.simulationTime, sample: s.city.sample, room: s.city.interior.currentRoomId,
    renderer: s.renderer, viewport: page.viewportSize() };
  const poseFile = info.outputPath(`${name}-pose.json`);
  await writeFile(poseFile, JSON.stringify(pose, null, 2));
  await info.attach(`${name}-pose`, { path: poseFile, contentType: 'application/json' });
  expect(s.settings.quality).toBe('high');
  expect(await page.locator('#game').evaluate(canvas => canvas.getContext('webgl2').isContextLost())).toBe(false);
  await openSettings(page);
  await page.locator('#quality').selectOption('low');
  await page.locator('#resume').click();
}

// A held real pointer keeps the cabin camera manual instead of automatically
// following the changed passenger facing direction after two seconds.
async function cabinPointer(page) {
  await page.waitForFunction(() => {
    const s = window.__NEON__.snapshot();
    return s.city.sample.transit.passengerLocal && Number.isFinite(s.camera?.yaw);
  }, null, { polling: 'raf', timeout: 15000 });
  const box = await page.locator('#game').boundingBox();
  const pointer = { x: box.x + box.width * .86, y: box.y + box.height * .30 };
  await page.mouse.move(pointer.x, pointer.y); await page.mouse.down();
  pointer.orbitYaw = (await cabinMotion(page)).cameraYaw;
  return pointer;
}

function cabinErrorRecord(error, stage) {
  return { stage, name: error?.name || '', message: error?.message || String(error), stack: error?.stack || null };
}

// Write each cabin phase and input cycle while it happens. A failed attachment
// still leaves the partial journal in test output for the CI artifact uploader.
function createCabinEvidence(info, kind) {
  let serial = 0;
  const deferred = [];
  const begin = (stage, waypoint, target = null) => ({
    name: `${kind}-${stage}-${waypoint ?? 'route'}-${++serial}-cabin-evidence`,
    stage, waypoint, target, diagnosticErrors: [],
  });
  async function write(phase, event) {
    const row = { kind, stage: phase.stage, waypoint: phase.waypoint, wallTime: Date.now(), ...event };
    try {
      phase.path ||= info.outputPath(`${phase.name}.jsonl`);
      await mkdir(dirname(phase.path), { recursive: true });
      await appendFile(phase.path, `${JSON.stringify(row)}\n`);
    }
    catch (error) {
      phase.diagnosticErrors.push({ error, record: cabinErrorRecord(error, 'write cabin journal') });
      try { console.log(JSON.stringify({ cabinDiagnosticWriteFailed: true, ...row,
        diagnosticErrors: phase.diagnosticErrors.map(item => item.record) })); } catch {}
    }
  }
  async function finish(phase, event) {
    await write(phase, { event: 'cabin-end', ...event,
      diagnosticErrors: phase.diagnosticErrors.map(item => item.record) });
    try { await info.attach(phase.name, { path: phase.path, contentType: 'application/x-ndjson' }); }
    catch (error) {
      phase.diagnosticErrors.push({ error, record: cabinErrorRecord(error, 'attach cabin journal') });
      await write(phase, { event: 'cabin-attachment-failed', firstError: event.firstError || null,
        diagnosticErrors: phase.diagnosticErrors.map(item => item.record) });
    }
  }
  // No serialization, file IO or browser RPC here: the original failure must
  // reach route pointer cleanup promptly when a key release is unconfirmed.
  const deferFinish = (phase, event) => deferred.push({ phase, event });
  async function flushDeferred() {
    const records = [];
    for (const { phase, event } of deferred.splice(0)) {
      await finish(phase, { ...event, deferredReleaseFailure: true });
      records.push({ name: phase.name, path: phase.path,
        diagnosticErrors: phase.diagnosticErrors });
    }
    return records;
  }
  return { begin, write, finish, deferFinish, flushDeferred };
}

function annotateCabinError(error, diagnostics) {
  try {
    if (error && typeof error.message === 'string') error.message += `\nCabin diagnostics: ${JSON.stringify(diagnostics)}`;
  } catch {
    // Diagnostic encoding or annotation must not throw over the original error.
  }
}

async function walkLocal(page, target, pointer, { precision = true, batchProgress = false, evidence, stage, waypoint } = {}) {
  const phase = evidence.begin(stage, waypoint, target);
  const samples = [], secondaryErrors = [];
  let start = null, current = null, deadline = null, movementError = null, releaseUnconfirmed = false;
  const ferryControl = batchProgress, ferryPrecision = ferryControl && precision;
  const precisionModifier = { key: 'z', held: false, downAttempted: false, releaseConfirmed: null, inputs: [] };
  const publicGait = { phase: null, transitions: [] };
  const ferryLayout = ferryControl ? createHarborVehicleLayout('ferry') : null;
  async function releasePrecisionModifier(inputs = precisionModifier.inputs) {
    if (!precisionModifier.held) return;
    const entry = { action: 'keyboard.up', params: { key: 'z' }, startedAt: Date.now(), completedAt: null, error: null };
    inputs.push(entry);
    try { await page.keyboard.up('z'); entry.completedAt = Date.now(); precisionModifier.held = false; precisionModifier.releaseConfirmed = true; }
    catch (error) { entry.completedAt = Date.now(); entry.error = cabinErrorRecord(error, 'release z'); precisionModifier.releaseConfirmed = false; releaseUnconfirmed = true; throw error; }
  }
  await evidence.write(phase, { event: 'cabin-start', target, precision, batchProgress });
  try {
    start = ferryControl ? await page.evaluate(ferryControlSnapshot) : await cabinMotion(page); current = start; samples.push(start);
    // Ferry control spends one rendered frame per public input. A software
    // renderer can take several minutes while retaining the same simulation
    // budget; keep a finite cap, but leave enough wall-clock for the original
    // real-input route to finish under CI contention.
    deadline = Date.now() + 420000;
    await evidence.write(phase, { event: 'cabin-start-pose', target, start, deadline });
    for (let step = 0; Math.hypot(target.x - current.local.x, target.z - current.local.z) >= .06 && step < 1800; step++) {
      expect(Date.now(), 'local walking retains its wall-clock deadline').toBeLessThan(deadline);
      let before = current, dx = target.x - current.local.x, dz = target.z - current.local.z;
      const distance = Math.hypot(dx, dz);
      const key = Math.abs(dx) > Math.abs(dz) ? dx > 0 ? 'a' : 'd' : dz > 0 ? 'w' : 's';
      const offset = { w: 0, s: Math.PI, a: Math.PI / 2, d: -Math.PI / 2 }[key];
      let desired = current.vehicle.yaw + Math.atan2(dx, dz) - offset;
      const delta = angle(desired - pointer.orbitYaw);
      let slow = precision || distance < 1.2, ordinaryApproach = false;
      // Batch only precision ferry movement far from the endpoint. This is a
      // small real-input stride, not a position or simulation-clock write.
      const batched = batchProgress && precision && distance >= .45;
      const stride = batched ? distance >= 1.2 ? .15 : .075 : .009;
      const inputs = [], waits = [];
      let cycleError = null, keyAttempted = false, slowAttempted = false, triggerHandle = null, trigger = null;
      let keyReleaseConfirmed = false, slowReleaseConfirmed = false;
      const preserve = (error, errorStage) => {
        if (!cycleError) cycleError = error;
        else if (error !== cycleError) secondaryErrors.push(cabinErrorRecord(error, errorStage));
      };
      async function input(action, params, operation) {
        const record = { action, params, startedAt: Date.now(), completedAt: null, error: null };
        inputs.push(record);
        try { await operation(); record.completedAt = Date.now(); }
        catch (error) { record.completedAt = Date.now(); record.error = cabinErrorRecord(error, action); throw error; }
      }
      async function wait(label, operation) {
        const record = { label, startedAt: Date.now(), completedAt: null, error: null };
        waits.push(record);
        try { const result = await operation(); record.completedAt = Date.now(); return result; }
        catch (error) { record.completedAt = Date.now(); record.error = cabinErrorRecord(error, label); throw error; }
      }
      try {
        if (ferryControl) {
          // Native8a3 starts with one fresh compact frame. Only the actual
          // matched frame returned by this aim becomes the action baseline;
          // previous observed frames propose public mouse input only.
          current = await wait('fresh-relative Ferry compact control', () => page.evaluate(ferryControlSnapshot));
          expect(Date.now(), 'original finite Ferry local deadline before aim').toBeLessThan(deadline);
          expect(current.teleportRevision, 'original cabin teleport revision').toBe(start.teleportRevision);
          expect(current.riding && current.ridingVehicleId === start.vehicle.id && current.vehicle?.id === start.vehicle.id,
            'original riding vehicle/passenger unavailable').toBe(true);
          expect(current.started && !current.paused, 'actual unpaused Ferry cabin aim').toBe(true);
          expect(current.local && ['x', 'y', 'z'].every(k => Number.isFinite(current.local[k])) &&
            Number.isFinite(current.vehicle.yaw) && Number.isFinite(current.time), 'actual finite Ferry control frame').toBe(true);
          dx = target.x - current.local.x; dz = target.z - current.local.z;
          desired = current.vehicle.yaw + Math.atan2(dx, dz) - offset;
          let frame = { current, desired, localHeading: Math.atan2(dx, dz),
            status: Number.isFinite(current.cameraYaw) && Math.abs(angle(current.cameraYaw - desired)) < .025 &&
              Number.isFinite(current.cameraPitch) && Math.abs(current.cameraPitch - .15) < .003
              ? 'MATCHED_FRESH_RELATIVE' : 'PUBLIC_RELATIVE_REAIM_REQUIRED' };
          let previous = pointer.ferryPreviousControlFrame || pointer.ferryObservedFrame || null;
          while (frame.status !== 'MATCHED_FRESH_RELATIVE') {
            // No directional key is held during reaim. Release Z as well when
            // the fresh observation discovers stale direction/camera state.
            await releasePrecisionModifier(inputs);
            const forecast = observedFerryMouseTarget(previous, frame.current, frame.desired); previous = frame.current;
            pointer.x -= angle(forecast.yaw - pointer.orbitYaw) / (.005 * frame.current.sensitivity);
            pointer.y += (.15 - frame.current.cameraPitch) / (.003 * frame.current.sensitivity);
            await input('mouse.move', { x: pointer.x, y: pointer.y, actualDesired: frame.desired, mouseTargetOnly: forecast }, () => page.mouse.move(pointer.x, pointer.y));
            pointer.orbitYaw = forecast.yaw;
            frame = await wait('fresh-relative Ferry camera', () => page.evaluate(waitFerryControlFrame,
              { mode: 'aim', target, offset, pitch: .15, requestedYaw: frame.desired, revision: start.teleportRevision, vehicleId: start.vehicle.id, deadline }));
          }
          current = frame.current; before = current; desired = frame.desired;
          dx = target.x - current.local.x; dz = target.z - current.local.z; pointer.ferryObservedFrame = current;
          pointer.ferryPreviousControlFrame = frame.previousControlFrame || previous;
          const gap = Math.hypot(dx, dz), sameFlatDeck = ferryLayout.decks.some(deck =>
            Math.abs(current.local.y - deck.y) < .02 && target.y != null && Math.abs(target.y - deck.y) < .02);
          const meetsStair = ferryLayout.stairs.some(stair => {
            const minX = stair.x - stair.width / 2 - ferryLayout.passengerRadius;
            const maxX = stair.x + stair.width / 2 + ferryLayout.passengerRadius;
            const minZ = Math.min(stair.startZ, stair.endZ) - ferryLayout.passengerRadius;
            const maxZ = Math.max(stair.startZ, stair.endZ) + ferryLayout.passengerRadius;
            return Math.max(current.local.x, target.x) >= minX && Math.min(current.local.x, target.x) <= maxX &&
              Math.max(current.local.z, target.z) >= minZ && Math.min(current.local.z, target.z) <= maxZ;
          });
          // Existing native8a3 public ordinary approach, limited to an aligned
          // flat deck segment outside the stair envelope. Actual .7m handoff
          // returns to original Z gait and the original .06m endpoint.
          ordinaryApproach = ferryPrecision && !precisionModifier.downAttempted && sameFlatDeck && !meetsStair &&
            (Math.abs(dx) < .06 || Math.abs(dz) < .06) && gap > .7;
          slow = ferryPrecision ? !ordinaryApproach : precision || gap < 1.2;
          const gait = slow ? 'original-Z-slow' : 'ordinary-public-WASD';
          if (gait !== publicGait.phase) {
            publicGait.transitions.push({ from: publicGait.phase, to: gait, local: { ...current.local },
              gap, simulationTime: current.time, vehicleServiceTime: current.vehicle.serviceTime });
            publicGait.phase = gait;
          }
        } else if (Math.abs(delta) > .002) {
          pointer.x -= delta / (.005 * current.sensitivity);
          await input('mouse.move', { x: pointer.x, y: pointer.y }, () => page.mouse.move(pointer.x, pointer.y));
          pointer.orbitYaw = desired;
          await wait('camera yaw', () => page.waitForFunction(yaw => {
            const actual = window.__NEON__.snapshot().camera.yaw;
            return Math.abs(Math.atan2(Math.sin(actual - yaw), Math.cos(actual - yaw))) < .025;
          }, desired, { polling: 'raf', timeout: Math.min(15000, Math.max(1, deadline - Date.now())) }));
        }
        if (ferryControl) expect(Date.now(), 'original finite Ferry local deadline before real input').toBeLessThan(deadline);
        if (slow) {
          slowAttempted = !ferryPrecision;
          if (!ferryPrecision || !precisionModifier.held) {
            if (ferryPrecision) { precisionModifier.held = true; precisionModifier.downAttempted = true; precisionModifier.releaseConfirmed = null; }
            await input('keyboard.down', { key: 'z' }, () => page.keyboard.down('z'));
          }
        }
        keyAttempted = true;
        await input('keyboard.down', { key }, () => page.keyboard.down(key));
        if (ferryControl) {
          trigger = await wait('real current-relative local progress', () => page.evaluate(waitFerryControlFrame,
            { mode: 'progress', before, target, stride, batched, direction: { x: dx / Math.hypot(dx, dz), z: dz / Math.hypot(dx, dz) },
              localHeading: Math.atan2(dx, dz), ordinaryApproach, offset, pitch: .15, revision: start.teleportRevision, vehicleId: start.vehicle.id, deadline }));
          pointer.ferryPreviousControlFrame = trigger.previousControlFrame || before;
        }
        else triggerHandle = await wait('real local progress', () => page.waitForFunction(({ before, target, stride, batched, direction, vehicleId }) => {
          const s = window.__NEON__.snapshot(), transit = s.city.sample.transit;
          const p = transit.passengerLocal, vehicle = transit.vehicles.find(v => v.id === vehicleId);
          if (!p || !vehicle) return false;
          const mx = p.x - before.local.x, mz = p.z - before.local.z;
          const moved = Math.hypot(mx, mz), projected = mx * direction.x + mz * direction.z;
          const remaining = Math.hypot(target.x - p.x, target.z - p.z);
          const yawChange = Math.abs(Math.atan2(Math.sin(vehicle.yaw - before.vehicle.yaw), Math.cos(vehicle.yaw - before.vehicle.yaw)));
          // A turning vessel may change the local direction while a real key is
          // held. Release after small actual movement and steer again promptly.
          const stopReason = remaining < .06 ? 'endpoint'
            : batched && moved > .009 && yawChange > .05 ? 'vehicle-yaw-change'
            : (batched ? projected > stride : moved > .009) ? 'real-progress' : null;
          return stopReason && { local: { ...p }, vehicleYaw: vehicle.yaw, cameraYaw: s.camera?.yaw,
            simulationTime: s.simulationTime, teleportRevision: s.teleportRevision, deck: transit.passengerDeck,
            moved, projected, remaining, yawChange, stopReason };
        }, { before, target, stride, batched, direction: { x: dx / distance, z: dz / distance }, vehicleId: current.vehicle.id },
        { polling: 'raf', timeout: Math.max(1, deadline - Date.now()) }));
      } catch (error) { preserve(error, 'movement'); }
      finally {
        if (keyAttempted) {
          try { await input('keyboard.up', { key }, () => page.keyboard.up(key)); keyReleaseConfirmed = true; }
          catch (error) { preserve(error, `release ${key}`); }
        }
        if (slowAttempted) {
          try { await input('keyboard.up', { key: 'z' }, () => page.keyboard.up('z')); slowReleaseConfirmed = true; }
          catch (error) { preserve(error, 'release z'); }
        }
        if (ferryPrecision && (cycleError || trigger?.reaimRequired)) {
          try { await releasePrecisionModifier(inputs); } catch (error) { preserve(error, 'release precision z after current-direction stop'); }
        }
      }
      const releaseState = { direction: { key, attempted: keyAttempted, confirmed: keyAttempted ? keyReleaseConfirmed : null },
        slow: { key: 'z', attempted: slowAttempted, confirmed: slowAttempted ? slowReleaseConfirmed : null },
        allRequiredConfirmed: (!keyAttempted || keyReleaseConfirmed) && (!slowAttempted || slowReleaseConfirmed) &&
          (!ferryPrecision || precisionModifier.releaseConfirmed !== false) };
      releaseUnconfirmed = !releaseState.allRequiredConfirmed;
      // A failed release leaves input state unknown. Do not spend another
      // browser roundtrip on jsonValue, handle disposal or pose diagnostics;
      // the failing test's context closure owns any remaining remote handle.
      if (triggerHandle && !releaseUnconfirmed) {
        try { trigger = await triggerHandle.jsonValue(); }
        catch (error) { phase.diagnosticErrors.push({ error, record: cabinErrorRecord(error, 'read movement trigger') }); }
        finally {
          try { await triggerHandle.dispose(); }
          catch (error) { phase.diagnosticErrors.push({ error, record: cabinErrorRecord(error, 'dispose movement trigger') }); }
        }
      }
      if (!cycleError && !releaseUnconfirmed) {
        try {
          current = ferryControl ? await page.evaluate(ferryControlSnapshot) : await cabinMotion(page);
          expect(current.teleportRevision, 'cabin movement must not relocate the player').toBe(start.teleportRevision);
        } catch (error) { preserve(error, 'post-release pose and revision'); }
      }
      const sample = { ...current, step, target, before, current, key, slow, stride, batched, desired, inputs, waits, trigger, releaseState,
        ...(ferryControl ? { ordinaryApproach, publicGait: publicGait.phase } : {}),
        triggerObservation: releaseUnconfirmed ? 'unread: key release unconfirmed; handle left to context closure' : triggerHandle ? 'actual trigger read after confirmed key releases' : trigger ? 'actual compact trigger returned; direction key then released before diagnostics' : 'no trigger handle',
        endStateObservation: cycleError ? 'last successful cabinMotion; not a new failure-time read' : 'actual cabinMotion after key release' };
      samples.push(sample);
      if (releaseUnconfirmed) throw cycleError;
      await evidence.write(phase, { event: cycleError ? 'input-cycle-failed' : 'input-cycle-complete', sample,
        firstError: cycleError ? cabinErrorRecord(cycleError, 'first cycle error') : null, secondaryErrors });
      if (cycleError) throw cycleError;
    }
    expect(Math.hypot(target.x - current.local.x, target.z - current.local.z), 'actual local waypoint reached').toBeLessThan(.06);
    if (target.y != null) expect(Math.abs(current.local.y - target.y)).toBeLessThan(.15);
  } catch (error) { movementError = error; }
  finally {
    if (ferryPrecision) try { await releasePrecisionModifier(); }
    catch (error) { if (!movementError) movementError = error; else secondaryErrors.push(cabinErrorRecord(error, 'final precision z release')); }
  }
  const result = { target, start, current, deadline, samples,
    status: releaseUnconfirmed ? 'release-unconfirmed' : movementError ? 'failed' : 'movement-complete',
    firstError: movementError ? cabinErrorRecord(movementError, 'first movement error') : null, secondaryErrors,
    ...(ferryPrecision ? { precisionModifier } : {}), ...(ferryControl ? { publicGait } : {}) };
  if (releaseUnconfirmed) {
    evidence.deferFinish(phase, result);
    throw movementError;
  }
  await evidence.finish(phase, result);
  const diagnosticErrors = phase.diagnosticErrors.map(item => item.record);
  if (movementError) {
    annotateCabinError(movementError, { target, start, current, samples, secondaryErrors, diagnosticErrors, evidencePath: phase.path });
    throw movementError;
  }
  if (phase.diagnosticErrors.length) {
    const firstDiagnosticError = phase.diagnosticErrors[0].error;
    annotateCabinError(firstDiagnosticError, { movementSucceeded: true, diagnosticErrors, evidencePath: phase.path });
    throw firstDiagnosticError;
  }
  return samples;
}

async function runCabinRoute(page, evidence, stage, routeBody) {
  const phase = evidence.begin(`${stage}-route`, null);
  let movementError = null, cleanupError = null;
  const secondaryErrors = [];
  await evidence.write(phase, { event: 'route-start' });
  try { await routeBody(); } catch (error) { movementError = error; }
  finally {
    try { await page.mouse.up(); }
    catch (error) {
      if (movementError) secondaryErrors.push(cabinErrorRecord(error, 'release route pointer'));
      else cleanupError = error;
    }
  }
  const firstError = movementError || cleanupError;
  let deferredJournals = [];
  try {
    const flushed = await evidence.flushDeferred();
    deferredJournals = flushed.map(item => ({ name: item.name, path: item.path,
      diagnosticErrors: item.diagnosticErrors.map(error => error.record) }));
    for (const item of flushed) phase.diagnosticErrors.push(...item.diagnosticErrors);
  } catch (error) {
    phase.diagnosticErrors.push({ error, record: cabinErrorRecord(error, 'flush deferred cabin journal') });
  }
  await evidence.finish(phase, { event: 'route-end', status: firstError ? 'failed' : 'complete',
    firstError: firstError ? cabinErrorRecord(firstError, movementError ? 'first movement error' : 'pointer cleanup error') : null,
    secondaryErrors, deferredJournals });
  const diagnosticErrors = phase.diagnosticErrors.map(item => item.record);
  if (firstError) {
    annotateCabinError(firstError, { route: stage, secondaryErrors, diagnosticErrors, deferredJournals, evidencePath: phase.path });
    throw firstError;
  }
  if (phase.diagnosticErrors.length) {
    const firstDiagnosticError = phase.diagnosticErrors[0].error;
    annotateCabinError(firstDiagnosticError, { routeSucceeded: true, diagnosticErrors, evidencePath: phase.path });
    throw firstDiagnosticError;
  }
}

for (const kind of ['bus', 'tram', 'ferry']) {
  test(`${kind}: public boarding, physical upper-deck stairs, travel and lower-door alighting`, async ({ page }, info) => {
    // The preserved 220 trace completed all 12 waypoints and the alighting E,
    // then its 900 s total expired before the first final assertion sampled.
    // Add a finite 180 s reserve equal to the existing final arrival cap; local
    // deadlines, real inputs, precision and assertions remain unchanged.
    // The complete ferry route is intentionally serial. Loaded GitHub runners
    // can spend over eighteen minutes across its twelve real-input legs while
    // the page remains live; retain finite per-leg and test-level caps without
    // turning a stalled route into an unbounded wait.
    if (kind === 'ferry') test.setTimeout(2400000);
    const errors = await boot(page), layout = createHarborVehicleLayout(kind), stair = layout.stairs[0], door = layout.doors[0];
    // Return only the fields consumed by this transit scenario. The complete
    // transit state and all physical alighting assertions remain unchanged.
    const transitSnapshot = () => page.evaluate(() => {
      const s = window.__NEON__.snapshot();
      return { position: s.position, simulationTime: s.simulationTime, teleportRevision: s.teleportRevision,
        city: { sample: { transit: s.city.sample.transit }, interior: { buildingId: s.city.interior.buildingId } } };
    });
    const stop = (await transitSnapshot()).city.sample.transit.stops.find(s => s.kind === kind);
    await publicStart(page, `[data-sample-stop="${stop.id}"]`);
    if (kind === 'ferry') {
      await faceRoom(page, Math.PI);
      // The pier's full-radius collision envelope can leave the capsule just
      // inside the boarding trigger rather than on the authored centre point.
      // Accept that physical standing position; E and the later deck/door
      // assertions still prove the actual boarding route.
      await walkAxis(page, 'z', stop.board.z, { precision: true, tolerance: .75, timeout: 120000 });
      expect((await transitSnapshot()).position.y).toBeCloseTo(stop.board.y, 1);
    }
    await page.waitForFunction(id => window.__NEON__.snapshot().city.sample.transit.vehicles.some(v => v.stopId === id && v.remaining > 2),
      stop.id, { polling: 'raf', timeout: 180000 });
    await page.keyboard.press('e');
    await expect.poll(async () => (await transitSnapshot()).city.sample.transit.riding).toBe(true);
    const boarded = await transitSnapshot(), vehicleId = boarded.city.sample.transit.ridingVehicleId, revision = boarded.teleportRevision;
    console.log(JSON.stringify({ stage: `${kind}-boarded`, vehicleId, stopId: stop.id, time: boarded.simulationTime,
      local: boarded.city.sample.transit.passengerLocal }));
    expect(boarded.city.sample.transit.passengerDeck).toBe('lower');
    expect(boarded.city.sample.transit.passengerLocal.y).toBeCloseTo(layout.deckLevels[0], 2);
    const samples = [], route = [{ x: 0, z: door.z }, { x: 0, z: stair.bottom.z }, stair.bottom,
      { x: stair.x, z: (stair.startZ + stair.endZ) / 2, y: (stair.fromY + stair.toY) / 2 }, stair.top, { x: 0, z: stair.top.z, y: stair.toY }];
    const cabinEvidence = createCabinEvidence(info, kind);
    let pointer;
    await runCabinRoute(page, cabinEvidence, 'upper', async () => {
      pointer = await cabinPointer(page);
      for (const [waypoint, target] of route.entries()) {
        const reached = await walkLocal(page, target, pointer, { precision: kind !== 'ferry' || target.x !== 0,
          batchProgress: kind === 'ferry', evidence: cabinEvidence, stage: 'upper', waypoint });
        samples.push(...reached);
        console.log(JSON.stringify({ stage: `${kind}-upper-waypoint`, target, local: reached.at(-1).local, time: reached.at(-1).time }));
      }
    });
    const upper = await transitSnapshot();
    expect(upper.city.sample.transit.passengerDeck).toBe('upper');
    expect(samples.some(s => s.local.y > stair.fromY + .25 && s.local.y < stair.toY - .25)).toBe(true);
    expect(upper.teleportRevision).toBe(revision);
    await page.keyboard.press('e');
    expect((await transitSnapshot()).city.sample.transit.ridingVehicleId).toBe(vehicleId);
    await captureHigh(page, info, `${kind}-upper-deck-high`);
    await runCabinRoute(page, cabinEvidence, 'lower', async () => {
      pointer = await cabinPointer(page);
      for (const [waypoint, target] of [stair.top, { x: stair.x, z: (stair.startZ + stair.endZ) / 2, y: (stair.fromY + stair.toY) / 2 }, stair.bottom,
        { x: 0, z: stair.bottom.z, y: stair.fromY }, { x: 0, z: door.z, y: stair.fromY }, door.inside].entries()) {
        const reached = await walkLocal(page, target, pointer, { precision: kind !== 'ferry' || target.x !== 0,
          batchProgress: kind === 'ferry', evidence: cabinEvidence, stage: 'lower', waypoint });
        samples.push(...reached);
        console.log(JSON.stringify({ stage: `${kind}-lower-waypoint`, target, local: reached.at(-1).local, time: reached.at(-1).time }));
      }
    });
    expect((await transitSnapshot()).city.sample.transit.passengerDeck).toBe('lower');
    // Run 20 completed every cabin waypoint while the vessel was returning
    // south. At ~2 seconds per rendered frame, the capped simulation clock
    // needs more than 180 wall seconds to dwell south and reach the north
    // again. Keep the real next-stop predicate and a finite 15-minute cap.
    const arrivalTimeout = kind === 'ferry' ? 900000 : 180000;
    await page.waitForFunction(({ id, from }) => {
      const v = window.__NEON__.snapshot().city.sample.transit.vehicles.find(v => v.id === id);
      return v.stopId && v.stopId !== from && v.doorsOpen && v.remaining > 2;
    }, { id: vehicleId, from: stop.id }, { polling: 'raf', timeout: arrivalTimeout });
    const arrival = await transitSnapshot(), destination = arrival.city.sample.transit.stops.find(s => s.id === arrival.city.sample.transit.currentStopId);
    expect(arrival.simulationTime).toBeGreaterThan(boarded.simulationTime);
    expect(arrival.teleportRevision).toBe(revision);
    expect(Math.hypot(arrival.position.x - boarded.position.x, arrival.position.z - boarded.position.z)).toBeGreaterThan(10);
    await page.keyboard.press('e');
    await expect.poll(async () => (await transitSnapshot()).city.sample.transit.riding).toBe(false);
    const outside = await transitSnapshot();
    console.log(JSON.stringify({ stage: `${kind}-alighted`, destination: destination.id, time: outside.simulationTime, position: outside.position }));
    expect(outside.position.x).toBeCloseTo(destination.board.x, 1);
    expect(outside.position.z).toBeCloseTo(destination.board.z, 1);
    expect(outside.city.interior.buildingId).toBeNull();
    expect(errors).toEqual([]);
    const evidence = info.outputPath(`${kind}-physical-route.json`);
    await writeFile(evidence, JSON.stringify({ kind, vehicleId, from: stop.id, to: destination.id, boardedTime: boarded.simulationTime,
      arrivalTime: arrival.simulationTime, initialSetup: 'one public sample-menu location button',
      arrival: { position: arrival.position, teleportRevision: arrival.teleportRevision, local: arrival.city.sample.transit.passengerLocal,
        vehicle: arrival.city.sample.transit.vehicles.find(v => v.id === vehicleId), time: arrival.simulationTime },
      outside: { position: outside.position, teleportRevision: outside.teleportRevision, riding: outside.city.sample.transit.riding,
        interiorBuildingId: outside.city.interior.buildingId, time: outside.simulationTime },
      keyboard: 'real WASD and Z keys with real manual mouse steering', positionWrites: false, clockWrites: false, samples }, null, 2));
    await info.attach(`${kind}-physical-route`, { path: evidence, contentType: 'application/json' });
  });
}

test('funded cargo and a real purchase persist across reload, with physical delivery and the actual High shop room', async ({ page }, info) => {
  const errors = await boot(page);
  await publicStart(page, '[data-sample-supply]');
  await expect(page.locator('#interaction')).toContainText('货栈领货');
  const initial = await snapshot(page), job = initial.city.sample.life.availableJobs[0];
  expect(job.quantity).toBeGreaterThan(0); expect(job.reward).toBe(12);
  await page.keyboard.press('e');
  await expect.poll(async () => (await snapshot(page)).city.sample.life.activeDelivery?.id).toBe(job.id);
  const carrying = await saveThroughUI(page), cargo = carrying.harborLife.jobs.find(j => j.id === job.id);
  console.log(JSON.stringify({ stage: 'cargo-funded-and-saved', jobId: job.id, quantity: cargo.quantity,
    escrow: cargo.escrow, time: carrying.harborTransit.time }));
  expect(cargo).toMatchObject({ status: 'picked-up', carrierId: 'player', escrow: 12, quantity: job.quantity });
  expect(carrying.harborLife.transactions.filter(t => t.type === 'pickup' && t.jobId === job.id)).toHaveLength(1);
  expect(carrying.harborLife.transactions.find(t => t.type === 'pickup' && t.jobId === job.id))
    .toMatchObject({ shopId: job.shopId, from: job.shopId, to: 'harbor-supply', amount: job.wholesale,
      quantity: job.quantity, product: job.product, escrow: 12 });
  expect((await snapshot(page)).city.sample.life.totalMoney).toBe(initial.city.sample.life.initialMoney);
  expect((await snapshot(page)).city.sample.life.totalGoods).toBe(initial.city.sample.life.initialGoods);
  await page.reload();
  await expect(page.locator('#start')).toBeEnabled({ timeout: 90000 });
  const restored = await snapshot(page);
  expect(restored.city.sample.life.activeDelivery).toMatchObject({ id: job.id, quantity: job.quantity, escrow: 12 });
  expect(restored.city.sample.transit.time).toBeCloseTo(carrying.harborTransit.time, 3);
  expect(restored.city.sample.life.totalMoney).toBe(restored.city.sample.life.initialMoney);
  expect(restored.city.sample.life.totalGoods).toBe(restored.city.sample.life.initialGoods);
  await page.locator('#start').click();
  await expect(page.locator('#game')).toBeFocused();
  const loaded = await snapshot(page), revision = loaded.teleportRevision;
  await faceRoom(page, Math.PI);
  // Read the actual pickup location; its counter can move independently of the
  // building entrance. Offset the central alley from resident queues, then use
  // the marked x=226 crossing and a pavement point clear of the lamppost.
  expect(job.shopId).toBe('harbor-produce');
  const supplyBuilding = loaded.city.buildings.find(b => b.id === 'south-089');
  const recipientBuilding = loaded.city.buildings.find(b => b.id === 'south-095');
  const alleyZ = supplyBuilding.entrance.z + .7, pavementZ = Math.floor(recipientBuilding.z / 80) * 80 - 12.5;
  for (const p of [{ x: loaded.position.x, z: alleyZ }, { x: 201, z: alleyZ }, { x: 201, z: pavementZ },
    { x: 226, z: pavementZ }, { x: 226, z: job.destination.z }]) {
    await walkAxis(page, 'x', p.x, { precision: true, tolerance: .18, timeout: 90000 });
    await walkAxis(page, 'z', p.z, { precision: true, tolerance: .18, timeout: 90000 });
    expect((await snapshot(page)).teleportRevision).toBe(revision);
  }
  await expect(page.locator('#interaction')).toContainText('交货');
  await page.keyboard.press('e');
  await expect.poll(async () => (await snapshot(page)).city.sample.life.activeDelivery).toBeNull();
  const delivered = await saveThroughUI(page), completed = delivered.harborLife.jobs.find(j => j.id === job.id);
  console.log(JSON.stringify({ stage: 'cargo-delivered-and-saved', jobId: job.id, cash: delivered.cash, time: delivered.harborTransit.time }));
  expect(completed).toMatchObject({ status: 'delivered', carrierId: 'player', escrow: 0 });
  expect(delivered.cash).toBe(carrying.cash + job.reward);
  expect(delivered.harborLife.player.earnedCash).toBe(carrying.harborLife.player.earnedCash + job.reward);
  expect(delivered.harborLife.player.completed).toBe(carrying.harborLife.player.completed + 1);
  expect(delivered.harborLife.shops.find(s => s.id === job.shopId).received).toBeGreaterThanOrEqual(job.quantity);
  expect(delivered.harborLife.transactions.filter(t => t.type === 'delivery' && t.jobId === job.id)).toHaveLength(1);
  await page.locator('#resume').click();
  await page.waitForFunction(id => {
    const shop = window.__NEON__.snapshot().city.sample.life.shops.find(s => s.id === id);
    return shop.open && shop.staff > 0 && shop.stock > 0;
  }, job.shopId, { polling: 'raf', timeout: 180000 });
  const beforePurchase = await snapshot(page), shop = beforePurchase.city.sample.life.shops.find(s => s.id === job.shopId);
  await expect(page.locator('#interaction')).toContainText('购买');
  await page.keyboard.press('e');
  await expect.poll(async () => (await snapshot(page)).city.sample.life.playerInventory[job.product])
    .toBe(beforePurchase.city.sample.life.playerInventory[job.product] + 1);
  const purchased = await saveThroughUI(page);
  expect(purchased.cash).toBe(beforePurchase.cash - shop.price);
  expect(purchased.harborLife.player.spentCash).toBe(delivered.harborLife.player.spentCash + shop.price);
  expect(purchased.harborLife.player.inventory[job.product]).toBe(delivered.harborLife.player.inventory[job.product] + 1);
  expect(purchased.harborLife.transactions.filter(t => t.type === 'delivery' && t.jobId === job.id)).toHaveLength(1);
  expect(purchased.harborLife.transactions.filter(t => t.type === 'player-purchase' && t.shopId === job.shopId)).toHaveLength(1);
  expect((await snapshot(page)).city.sample.life.totalMoney).toBe(initial.city.sample.life.initialMoney);
  expect((await snapshot(page)).city.sample.life.totalGoods).toBe(initial.city.sample.life.initialGoods);
  await page.locator('#resume').click();
  await page.waitForFunction(() => {
    const d = window.__NEON__.snapshot().city.sample.district;
    return d.scannedMapsLoaded === d.scannedMapsExpected && d.scannedMapErrors.length === 0;
  }, null, { polling: 'raf', timeout: 45000 });
  const storefront = await snapshot(page), building = storefront.city.buildings.find(b => b.id === 'south-095');
  expect(storefront.city.sample.district.residentFrontages).toContain('tideleaf-market');
  await captureHigh(page, info, 'produce-frontage-high');
  await faceRoom(page, Math.PI);
  await walkAxis(page, 'z', building.entrance.z, { precision: true, tolerance: .18 });
  await walkAxis(page, 'x', building.entrance.x, { precision: true, tolerance: .18 });
  await expect(page.locator('#interaction')).toContainText('进入');
  await page.keyboard.press('e');
  await expect.poll(async () => (await snapshot(page)).city.interior.buildingId).toBe(building.id);
  const interior = (await snapshot(page)).city.interior, room = interior.rooms.find(r => r.type === 'produce');
  expect(room).toBeTruthy();
  await walkAxis(page, 'x', building.x, { precision: true, tolerance: .18 });
  await walkAxis(page, 'z', room.entrance.z, { precision: true, tolerance: .18 });
  await walkAxis(page, 'x', room.entrance.x + Math.sign(room.x - building.x) * 1.6, { precision: true, tolerance: .18 });
  expect((await snapshot(page)).city.interior.currentRoomId).toBe(room.id);
  // Public V gives the small room an unobstructed actual eye-level photograph.
  if (!(await snapshot(page)).settings.firstPerson) await page.keyboard.press('v');
  expect((await snapshot(page)).settings.firstPerson).toBe(true);
  await frameOccupiedRoom(page, room, building.x);
  await captureHigh(page, info, 'produce-shop-room-high');
  const finalSave = await saveThroughUI(page);
  await page.reload();
  await expect(page.locator('#start')).toBeEnabled({ timeout: 90000 });
  const end = await snapshot(page);
  expect(end.city.sample.life.activeDelivery).toBeNull();
  expect(end.cash).toBe(finalSave.cash);
  expect(end.city.sample.life.playerInventory).toEqual(finalSave.harborLife.player.inventory);
  expect(end.city.sample.transit.time).toBeCloseTo(finalSave.harborTransit.time, 3);
  expect(end.city.sample.life.statistics.deliveries).toBe(finalSave.harborLife.statistics.deliveries);
  expect(errors).toEqual([]);
  const evidence = info.outputPath('funded-cargo-save-evidence.json');
  await writeFile(evidence, JSON.stringify({ job, carrying, delivered, purchased, finalSave, clockWrites: false, positionWrites: false }, null, 2));
  await info.attach('funded-cargo-save-evidence', { path: evidence, contentType: 'application/json' });
});
