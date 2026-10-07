import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { HarborTransitService } from '../../src/harbor-transit.js';
import { ChaseCamera } from '../../src/camera.js';
import { createHarborVehicleLayout } from '../../src/harbor-vehicle-models.js';
import { ferryControlSnapshot, waitFerryControlFrame, observedFerryMouseTarget } from '../e2e/helpers/ferry-control.js';

// These verified original inputs are repository fixtures, so shallow CI checkouts
// and relocated workspaces run the same source and finite pressure regressions.
const original = fs.readFileSync(new URL('../fixtures/ferry-harbor-sample-original199.spec.txt', import.meta.url), 'utf8');
const candidate = fs.readFileSync(new URL('../e2e/harbor-sample.spec.js', import.meta.url), 'utf8');
const pressureInput = fs.readFileSync(new URL('../fixtures/ferry-lower5-original199-compact.json', import.meta.url), 'utf8');
const provenance = JSON.parse(fs.readFileSync(new URL('../fixtures/ferry-controller-original199-provenance.json', import.meta.url), 'utf8'));
const sha256 = input => createHash('sha256').update(input).digest('hex');
assert.equal(sha256(original), provenance.originalControllerSource.sha256, 'original controller fixture integrity');
assert.equal(sha256(pressureInput), provenance.fixture.sha256, 'observed pressure fixture integrity');
const journal = JSON.parse(pressureInput), checkpoint = journal.at(-1).start;
assert.equal(journal.length, provenance.fixture.originalRows);
assert.equal(journal.filter(row => row.sample).length, provenance.fixture.originalSampleRows);
const target = journal[0].target, measurements = [];
const actualCycles = journal.filter(row => row.sample).map(row => row.sample);
const mouseEntries = actualCycles.flatMap(c => c.inputs).filter(i => i.action === 'mouse.move');
const observedMouseMs = mouseEntries.reduce((n, i) => n + i.completedAt - i.startedAt, 0);
const observedWaitMs = actualCycles.flatMap(c => c.waits).reduce((n, i) => n + i.completedAt - i.startedAt, 0);
const observedSimulationAdvance = journal.at(-1).current.time - checkpoint.time;
const phaseCosts = actualCycles.filter(c => c.current.time > c.before.time).map(c => ({
  start: c.before.time, end: c.current.time,
  frameWallMs: c.waits.reduce((n, w) => n + w.completedAt - w.startedAt, 0) / ((c.current.time - c.before.time) / .25),
  mouseWallMs: c.inputs.filter(i => i.action === 'mouse.move').reduce((n, i) => n + i.completedAt - i.startedAt, 0) || observedMouseMs / mouseEntries.length,
}));
const phaseAt = time => phaseCosts.find(c => time >= c.start && time < c.end) || phaseCosts.at(-1);

const expect = (value, message) => ({ toBe: expected => assert.equal(value, expected, message), toBeLessThan: limit => assert.ok(value < limit, `${message}: ${value} >= ${limit}`) });
const angle = n => Math.atan2(Math.sin(n), Math.cos(n));
const errorRecord = (error, stage) => ({ stage, name: error.name, message: error.message, stack: error.stack });
const compiledWalk = source => vm.runInNewContext(source.slice(source.indexOf('async function walkLocal('), source.indexOf('\nasync function runCabinRoute')) + '\nwalkLocal;',
  { expect, angle, Date, createHarborVehicleLayout, window: globalThis.window, cabinMotion: page => page.evaluate(ferryControlSnapshot), cabinErrorRecord: errorRecord,
    annotateCabinError: () => {}, ferryControlSnapshot, waitFerryControlFrame, observedFerryMouseTarget });

async function run(source, label, { frameWallMs = 1200, mouseWallMs = 600, fault = null, faultAtFrame = 1, faultRequiresZ = false, canonicalRoute = false, phasedCosts = false } = {}) {
  const service = new HarborTransitService(), stop = service.stops.find(s => s.kind === 'ferry');
  assert.equal(service.interact(stop.board).handled, true);
  // Reach the original legal checkpoint through the real local collision API.
  if (!canonicalRoute) for (let i = 0; i < 300; i++) {
    const dx = checkpoint.local.x - service.passenger.x, dz = checkpoint.local.z - service.passenger.z, gap = Math.hypot(dx, dz);
    if (gap < 1e-9) break; const step = Math.min(.025, gap); service.movePassenger(dx / gap * step, dz / gap * step);
  }
  if (!canonicalRoute) assert.ok(Math.hypot(checkpoint.local.x - service.passenger.x, checkpoint.local.z - service.passenger.z) < 1e-8);
  service.update(canonicalRoute ? 0 : checkpoint.time); const camera = new ChaseCamera(), simulation = { player: { ...service.passengerPose }, inCar: null };
  let orbitYaw = canonicalRoute ? service.vehicle().pose.yaw : checkpoint.cameraYaw, mouseX = 440.32, wall = 1000000000, frames = 0, polls = 0;
  const keys = new Set(), rpc = { evaluate: 0, waitForFunction: 0, jsonValue: 0, dispose: 0, mouseMove: 0, keyDown: 0, keyUp: 0 };
  const rows = [], directionChecks = [], directionStops = [], stepObservations = [], legs = [], doorTransitions = [];
  let faultObservedHeldKeys = null;
  let activeTarget = target, previousDoor = service.vehicle().pose.doorsOpen; let stopAwaitingRelease = false; const dateNow = Date.now;
  camera.update(service.passengerPose, { firstPerson: true, yaw: orbitYaw, pitch: .15 }, .25);
  const updateFrame = () => {
    if (++frames > 5000) throw new Error('fixture frame cap'); wall += phasedCosts ? phaseAt(service.time).frameWallMs : frameWallMs;
    for (let i = 0; i < 15; i++) {
      const before = { ...service.passenger };
      service.update(1 / 60); service.stepPlayer(simulation, 1 / 60,
        { forward: Number(keys.has('w')) - Number(keys.has('s')), strafe: Number(keys.has('d')) - Number(keys.has('a')),
          slow: keys.has('z'), cameraYaw: camera.yaw });
      const local = { ...service.passenger }, layout = service.layout('ferry'), radius = layout.passengerRadius;
      const deck = layout.decks.reduce((a, b) => Math.abs(a.y - local.y) <= Math.abs(b.y - local.y) ? a : b);
      assert.ok(local.x >= deck.minX + radius - .001 && local.x <= deck.maxX - radius + .001, 'source full radius stays inside shell');
      for (const b of layout.blockers) if (local.y + layout.passengerHeight > b.minY + .02 && local.y < b.maxY - .02) {
        const x = Math.max(b.minX, Math.min(local.x, b.maxX)), z = Math.max(b.minZ, Math.min(local.z, b.maxZ));
        assert.ok(Math.hypot(local.x - x, local.z - z) >= radius - .015, 'source radius never occupies actual seat/driver/shell blocker');
      }
      stepObservations.push({ before, local, simulationTime: service.time, heldKeys: [...keys], heightDelta: Math.abs(local.y - before.y) });
      if (previousDoor !== service.vehicle().pose.doorsOpen) { previousDoor = service.vehicle().pose.doorsOpen; doorTransitions.push({ open: previousDoor, simulationTime: service.time, heldKeys: [...keys] }); }
    }
    camera.update(service.passengerPose, { firstPerson: true, yaw: orbitYaw, pitch: .15 }, .25);
  };
  const snapshot = () => {
    const faultActive = fault && frames >= faultAtFrame && (!faultRequiresZ || keys.has('z') && [...keys].some(k => k !== 'z'));
    if (faultActive && faultObservedHeldKeys == null) faultObservedHeldKeys = [...keys];
    const transit = service.snapshot(), revision = fault === 'revision' && faultActive ? 4 : 3;
    if (fault === 'wrong-vessel' && faultActive) transit.ridingVehicleId = 'different-ferry';
    return { started: true, paused: false, simulationTime: service.time, teleportRevision: revision,
      timing: { dt: .25, steps: 15 }, settings: { sensitivity: 1 }, camera: camera.snapshot(), city: { sample: { transit } } };
  };
  globalThis.window = { __NEON__: { snapshot } };
  globalThis.requestAnimationFrame = callback => { const id = ++polls; queueMicrotask(() => { updateFrame(); callback(); }); return id; };
  globalThis.cancelAnimationFrame = () => {};
  Date.now = () => wall;
  const page = {
    async evaluate(fn, arg) {
      assert.equal(stopAwaitingRelease, false, 'stale current-direction observation must release before another control RPC');
      rpc.evaluate++; wall += 20; const value = await fn(arg);
      if (value?.reaimRequired) { stopAwaitingRelease = true; directionStops.push({ frame: frames, time: service.time }); }
      return value;
    },
    async waitForFunction(fn, arg, options) {
      rpc.waitForFunction++; const deadline = wall + options.timeout;
      for (let i = 0; i < 5000; i++) {
        const value = fn(arg); if (value) return { async jsonValue() { rpc.jsonValue++; wall += 20; return value; }, async dispose() { rpc.dispose++; wall += 20; } };
        if (wall >= deadline) throw new Error('fixture original wait timeout'); updateFrame();
      }
      throw new Error('fixture polling cap');
    },
    mouse: { async move(x) { assert.equal(stopAwaitingRelease, false); rpc.mouseMove++; orbitYaw -= (x - mouseX) * .005; mouseX = x; wall += phasedCosts ? phaseAt(service.time).mouseWallMs : mouseWallMs; } },
    keyboard: {
      async down(key) {
        assert.equal(stopAwaitingRelease, false);
        rpc.keyDown++; wall += 6;
        if (key !== 'z') {
          const p = service.passenger, heading = Math.atan2(activeTarget.x - p.x, activeTarget.z - p.z);
          const offset = { w: 0, s: Math.PI, a: Math.PI / 2, d: -Math.PI / 2 }[key];
          directionChecks.push({ time: service.time, error: Math.abs(angle(camera.yaw - (service.vehicle().pose.yaw + heading - offset))) });
        }
        keys.add(key);
      },
      async up(key) {
        rpc.keyUp++; wall += 6; keys.delete(key);
        if (stopAwaitingRelease && key !== 'z') {
          assert.equal(frames, directionStops.at(-1).frame, 'public direction release follows the same observed fixture frame');
          stopAwaitingRelease = false; directionStops.at(-1).directionReleased = true;
        }
      },
    },
  };
  const evidence = { begin: () => ({ diagnosticErrors: [] }), write: async (_, row) => rows.push(row),
    finish: async (_, row) => rows.push(row), deferFinish: (_, row) => rows.push(row) };
  let error = null;
  try {
    const walk = compiledWalk(source), pointer = { x: mouseX, y: 96, orbitYaw };
    if (!canonicalRoute) await walk(page, target, pointer, { precision: true, batchProgress: true, evidence, stage: 'lower', waypoint: 5 });
    else {
      const layout = service.layout('ferry'), stair = layout.stairs[0], door = layout.doors[0];
      const upper = [{ x: 0, z: door.z }, { x: 0, z: stair.bottom.z }, stair.bottom,
        { x: stair.x, z: (stair.startZ + stair.endZ) / 2, y: (stair.fromY + stair.toY) / 2 }, stair.top, { x: 0, z: stair.top.z, y: stair.toY }];
      const lower = [stair.top, upper[3], stair.bottom, { x: 0, z: stair.bottom.z, y: stair.fromY }, { x: 0, z: door.z, y: stair.fromY }, door.inside];
      for (const [stage, route] of [['upper', upper], ['lower', lower]]) for (const [waypoint, next] of route.entries()) {
        activeTarget = next; const started = wall;
        await walk(page, next, pointer, { precision: next.x !== 0, batchProgress: true, evidence, stage, waypoint });
        legs.push({ stage, waypoint, target: next, local: { ...service.passenger }, virtualWallMs: wall - started,
          horizontalGap: Math.hypot(next.x - service.passenger.x, next.z - service.passenger.z),
          heightGap: next.y == null ? null : Math.abs(next.y - service.passenger.y), remainingKeys: [...keys], publicGait: rows.at(-1)?.publicGait });
      }
    }
  }
  catch (caught) { error = caught; }
  finally { Date.now = dateNow; delete globalThis.window; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame; }
  const gap = Math.hypot(activeTarget.x - service.passenger.x, activeTarget.z - service.passenger.z);
  const result = { label, frameWallMs, mouseWallMs, phasedCosts, canonicalRoute, frames, virtualWallMs: wall - 1000000000, rpc,
    totalRpc: Object.values(rpc).reduce((a, b) => a + b, 0), gap, endpoint: { ...service.passenger },
    remainingKeys: [...keys], faultObservedHeldKeys, firstError: error ? errorRecord(error, 'source-fixture-controller') : null,
    maxDirectionErrorAtKeydown: Math.max(0, ...directionChecks.map(c => c.error)), observedDoorOpen: service.vehicle().pose.doorsOpen,
    vehicleYaw: service.vehicle().pose.yaw, globalSimulationTime: service.time,
    vehicleServiceTime: service.vehicle().serviceTime, sourceFrameDt: .25, sourceFixedStepDt: 1 / 60, directionStops, doorTransitions, legs,
    maxHeightDeltaPerFixedStep: Math.max(0, ...stepObservations.map(s => s.heightDelta)),
    intermediateStairSamples: stepObservations.filter(s => s.local.y > service.layout('ferry').deckLevels[0] + .25 && s.local.y < service.layout('ferry').deckLevels[1] - .25).length,
    cycles: rows.filter(r => r.event === 'input-cycle-complete').length,
    publicGait: rows.at(-1)?.publicGait, cycleGaits: rows.filter(r => r.sample).map(r => ({ step: r.sample.step, slow: r.sample.slow, ordinaryApproach: r.sample.ordinaryApproach, before: r.sample.before.local, after: r.sample.current.local })) };
  measurements.push(result); return result;
}

test('actual original lower5 checkpoint reaches the original endpoint through source collision/camera/service using fewer controller RPCs', async () => {
  const old = await run(original, 'original199'), next = await run(candidate, 'candidate');
  assert.equal(next.firstError, null, JSON.stringify(next)); assert.ok(next.gap < .06); assert.deepEqual(next.remainingKeys, []);
  assert.ok(next.maxDirectionErrorAtKeydown < .025, JSON.stringify(next));
  assert.ok(next.totalRpc < old.totalRpc, JSON.stringify({ old, next }));
});

test('recorded-pressure cost envelope completes the original lower5 endpoint within the unchanged finite deadline', async () => {
  const result = await run(candidate, 'recorded-event-cost-envelope', {
    frameWallMs: observedWaitMs / (observedSimulationAdvance / .25), mouseWallMs: observedMouseMs / mouseEntries.length });
  assert.deepEqual(result.remainingKeys, []); assert.ok(result.maxDirectionErrorAtKeydown < .025);
  assert.equal(result.firstError, null, JSON.stringify(result)); assert.ok(result.gap < .06);
  assert.ok(result.virtualWallMs < 150000, 'original finite modeled deadline cannot silently expand');
  const handoff = result.publicGait.transitions.find(t => t.from === 'ordinary-public-WASD' && t.to === 'original-Z-slow');
  assert.ok(handoff && handoff.gap <= .7 && handoff.gap >= .7 - 2.25 * .25);
  assert.ok(result.cycleGaits.some(c => c.ordinaryApproach && !c.slow));
  assert.ok(result.cycleGaits.some(c => !c.ordinaryApproach && c.slow));
});

test('original observed per-cycle pressure phases still reach lower5 without changing the original deadline', async () => {
  const result = await run(candidate, 'recorded-per-cycle-phase-cost-envelope', { phasedCosts: true });
  assert.equal(result.firstError, null, JSON.stringify(result)); assert.ok(result.gap < .06);
  assert.ok(result.virtualWallMs < 150000); assert.deepEqual(result.remainingKeys, []);
});

test('all12 canonical source legs retain continuous physical stair height, full radius and confirmed key releases', async () => {
  const result = await run(candidate, 'canonical12-actual-source-stairs', { canonicalRoute: true });
  assert.equal(result.firstError, null, JSON.stringify(result)); assert.equal(result.legs.length, 12);
  for (const leg of result.legs) {
    assert.ok(leg.horizontalGap < .06); if (leg.heightGap != null) assert.ok(leg.heightGap < .15);
    assert.deepEqual(leg.remainingKeys, []); assert.ok(leg.virtualWallMs < 150000);
  }
  assert.ok(result.intermediateStairSamples > 0);
  assert.ok(result.maxHeightDeltaPerFixedStep < .04, 'physical stair height is continuous at source fixed steps');
  assert.ok(result.maxDirectionErrorAtKeydown < .025); assert.deepEqual(result.remainingKeys, []);
});

test('wrong vessel and revision observations fail without leaving a direction or precision modifier held', async () => {
  for (const fault of ['revision', 'wrong-vessel']) for (const faultAtFrame of [4, 12]) {
    const result = await run(candidate, `${fault}-frame${faultAtFrame}`, { fault, faultAtFrame, faultRequiresZ: faultAtFrame === 12 }); assert.ok(result.firstError); assert.deepEqual(result.remainingKeys, []);
    assert.ok(result.firstError.message.includes(fault === 'revision' ? 'teleport revision' : 'riding vehicle'));
    assert.ok(result.faultObservedHeldKeys.some(k => k !== 'z'));
    if (faultAtFrame === 12) assert.ok(result.faultObservedHeldKeys.includes('z'), 'actual fault occurs with the precision modifier held');
  }
});

test('higher finite wall pressure retains failure and releases the actual held direction and Z', async () => {
  const result = await run(candidate, 'explicit12000-frame-pressure-negative', { frameWallMs: 12000, mouseWallMs: 10 });
  assert.ok(result.firstError?.message.includes('finite Ferry control deadline'), JSON.stringify(result));
  assert.deepEqual(result.remainingKeys, []); assert.ok(result.virtualWallMs < 440000);
});

test('public route, E, destination, High captures and original failure remain literal', () => {
  // The evidence writer now creates its output directory before appending a
  // journal, and the pier accepts the physical standing boundary inside its
  // boarding trigger. Ignore those two narrow harness changes while keeping
  // the public route, inputs and capture flow pinned to the original.
  const normalizePublicHarness = source => source
    .replace('      await mkdir(dirname(phase.path), { recursive: true });\n', '')
    .replace(/    \/\/ The complete ferry route is intentionally serial\.[\s\S]*?    if \(kind === 'ferry'\) test\.setTimeout\(2400000\);\n/, `    if (kind === 'ferry') test.setTimeout(1080000);\n`)
    .replace(/    \/\/ Run 20 completed every cabin waypoint while the vessel was returning[\s\S]*?    const arrivalTimeout = kind === 'ferry' \? 900000 : 180000;\n/, '')
    .replace("    }, { id: vehicleId, from: stop.id }, { polling: 'raf', timeout: arrivalTimeout });", "    }, { id: vehicleId, from: stop.id }, { polling: 'raf', timeout: 180000 });")
    .replace(`      // The pier's full-radius collision envelope can leave the capsule just
      // inside the boarding trigger rather than on the authored centre point.
      // Accept that physical standing position; E and the later deck/door
      // assertions still prove the actual boarding route.
      await walkAxis(page, 'z', stop.board.z, { precision: true, tolerance: .75, timeout: 120000 });
`, `      await walkAxis(page, 'z', stop.board.z, { precision: true, tolerance: .18, timeout: 120000 });
`);
  assert.equal(normalizePublicHarness(candidate.slice(candidate.indexOf('\nasync function runCabinRoute'))), original.slice(original.indexOf('\nasync function runCabinRoute')));
  assert.equal(normalizePublicHarness(candidate.slice(candidate.indexOf('async function boot('), candidate.indexOf('async function walkLocal('))),
    original.slice(original.indexOf('async function boot('), original.indexOf('async function walkLocal(')));
  assert.equal(journal.at(-1).firstError.message, 'page.waitForFunction: Timeout 921ms exceeded.');
  assert.equal(journal.at(-1).current.local.x, -2.5134263526561598);
});

test.after(() => {
  if (process.env.FERRY_CONTROL_MEASUREMENTS) fs.writeFileSync(process.env.FERRY_CONTROL_MEASUREMENTS, JSON.stringify({
    fixtureScope: 'Actual199 HarborTransitService/stepPlayer and ChaseCamera; original legal checkpoint; virtual protocol/RAF cost model, not real hardware/CI timing',
    actualOriginalTiming: { mouseEntries: mouseEntries.length, observedMouseMs, observedWaitMs, observedSimulationAdvance,
      phaseCosts,
      perMouseCostMs: observedMouseMs / mouseEntries.length, perCappedSourceFrameWaitCostMs: observedWaitMs / (observedSimulationAdvance / .25),
      limitation: 'Original JSONL has event costs and before/after simulationTime, not per-RAF timestamps during each RPC; this finite event-cost envelope does not claim exact browser scheduling replay',
      originalFirstFailure: journal.at(-1).firstError },
    measurements }, null, 2) + '\n');
});
