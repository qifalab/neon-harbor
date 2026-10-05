import * as THREE from '../vendor/three/three.module.js';
import { createCityExploration } from '../src/city-exploration.js';
import { HarborLife } from '../src/harbor-life.js';
import { HarborTransitService } from '../src/harbor-transit.js';
import { RESIDENT_LOOP } from '../src/harbor-resident-loop.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';

const output = resolve(process.argv[2] || 'docs/qa/resident-loop-observation.json');
const sourceHashes = {};
for (const path of ['src/harbor-life.js', 'src/harbor-resident-loop.js', 'src/harbor-transit.js']) {
  sourceHashes[path] = createHash('sha256').update(await readFile(new URL('../' + path, import.meta.url))).digest('hex');
}

// CPU-only observation of the real finite accounts and shared transport
// service. No WebGL renderer, browser, asset import or pose/time setter.
const city = createCityExploration(THREE, new THREE.Scene(), { streaming: false });
const transport = new HarborTransitService({ groundHeightAt: city.groundHeightAt });
const life = new HarborLife({ buildings: city.buildings, colliders: city.colliders, transport, hour: 16.5 });
const loop = life.residentLoop, startedAt = new Date().toISOString();
const baseline = { totalMoney: life.totalMoney, totalGoods: life.totalGoods, residentCash: loop.agent.money,
  employerCash: life.supply.money, shopStock: loop.shop.stock };
const phases = [], payments = [], seenTransactions = new Set(); let previousStage = null;
let firstError = null;
const pose = () => ({ x: loop.agent.x, y: loop.agent.y, z: loop.agent.z, yaw: loop.agent.yaw,
  phase: loop.agent.phase, buildingId: loop.agent.insideBuildingId, floorId: loop.agent.floorId, roomId: loop.agent.roomId });
try {
  for (let tick = 0; tick < 14000 && !loop.state.completedCycles; tick++) {
    const before = pose();
    transport.update(.1, null, { pedestrianDistanceAt: body => life.trafficStopDistanceAt(body) });
    life.update(.1, { hour: 16.5, trafficTime: transport.time, vehicles: transport.trafficBodies });
    if (loop.state.stage !== previousStage) {
      previousStage = loop.state.stage;
      phases.push({ tick: loop.state.ticks, simulationSeconds: loop.state.ticks / 10,
        scheduleAbsoluteHour: loop.absoluteHour, stage: loop.state.stage, pose: pose(),
        waitingReason: loop.state.waitingReason, residentCash: loop.agent.money,
        employerCash: life.supply.money, shopStock: loop.shop.stock });
    }
    for (const tx of life.transactions.filter(tx => tx.agentId === RESIDENT_LOOP.residentId &&
      ['resident-work-wage', 'purchase'].includes(tx.type) && !seenTransactions.has(tx.id))) {
      seenTransactions.add(tx.id);
      payments.push({ transaction: { ...tx }, beforePose: before, afterPose: pose(),
        residentCash: loop.agent.money, employerCash: life.supply.money, shopStock: loop.shop.stock,
        validWorkTicks: loop.state.activeJob?.validTicks ?? 0 });
    }
    if (life.totalMoney !== baseline.totalMoney || life.totalGoods !== baseline.totalGoods)
      throw new Error('Finite money or goods conservation failed');
  }
  if (loop.state.completedCycles !== 1 || loop.state.totalValidWorkTicks !== 700 || loop.state.totalWages !== 6 || loop.state.purchases !== 1)
    throw new Error(`Incomplete bounded resident cycle: ${loop.state.stage}/${loop.state.waitingReason}`);
} catch (error) { firstError = { name: error.name, message: error.message, stack: error.stack }; }
const result = { kind: 'CPU_SOURCE_OBSERVATION', status: firstError ? 'FAILED' : 'COMPLETED',
  nativeAcceptance: 'NOT_RUN', startedAt, completedAt: new Date().toISOString(),
  config: { sourceHashes, residentId: RESIDENT_LOOP.residentId,
    selectedSchedule: { startHour: RESIDENT_LOOP.startHour, secondsPerHour: RESIDENT_LOOP.secondsPerHour },
    fixedPublicShopHour: 16.5, tickSeconds: .1, maximumTicks: 14000, mutualSharedTransportTraffic: true },
  simulationSeconds: loop.state.ticks / 10, baseline,
  final: { totalMoney: life.totalMoney, totalGoods: life.totalGoods, residentCash: loop.agent.money,
    employerCash: life.supply.money, shopStock: loop.shop.stock, pose: pose() },
  phases, payments, diary: loop.publicStatus(), state: life.snapshot(), fleet: transport.exportState(), firstError };
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ status: result.status, simulationSeconds: result.simulationSeconds,
  workSeconds: loop.state.totalValidWorkTicks / 10, wages: loop.state.totalWages, purchases: loop.state.purchases,
  plannedDepartureHour: 7, phases: phases.map(row => [row.stage, row.scheduleAbsoluteHour]),
  totalMoney: life.totalMoney, totalGoods: life.totalGoods, firstError }));
if (firstError) process.exitCode = 1;
