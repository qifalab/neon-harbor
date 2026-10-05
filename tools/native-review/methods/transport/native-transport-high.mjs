/** Prepared only. ROOT schedules execution; this file never builds or changes the app. */
import assert from 'node:assert/strict';
import { readFile, writeFile, appendFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const args = {};
const usage = 'node native-transport-high.mjs --root FROZEN_DIST --source-root FROZEN_SOURCE --output NEW_DIR --mode baseline|authored [--kind bus|tram|ferry|all] [--port 5197] [--bridge-path city.sample.transit.authored] [--playwright-root REPO] [--executable-path CHROMIUM_151]';
for (let i = 2; i < process.argv.length; i++) {
  const key = process.argv[i];
  if (key === '--help') { console.log(usage); process.exit(0); }
  assert.ok(['--root','--source-root','--output','--mode','--kind','--port','--bridge-path','--playwright-root','--executable-path'].includes(key) && process.argv[i + 1], usage);
  assert.ok(!Object.hasOwn(args, key.slice(2)), 'duplicate option'); args[key.slice(2)] = process.argv[++i];
}
for (const key of ['root','source-root','output','mode']) assert.ok(args[key], usage);
assert.ok(['baseline','authored'].includes(args.mode), usage);
const kinds = args.kind === 'all' ? ['bus','tram','ferry'] : [args.kind || 'bus'];
assert.ok(kinds.every(k => ['bus','tram','ferry'].includes(k)), usage);
const root = resolve(args.root), sourceRoot = resolve(args['source-root']), output = resolve(args.output);
const port = Number(args.port || 5197), bridgePath = args['bridge-path'] || 'city.sample.transit.authored';
assert.ok(Number.isInteger(port) && port > 0 && port < 65536);
assert.ok(output !== root && !output.startsWith(root + '/') && output !== sourceRoot && !output.startsWith(sourceRoot + '/'), 'output must be outside frozen app trees');
const viewport = { width: 1280, height: 800 }, version = '151.0.7922.34';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const bundleBytes = await readFile(resolve(here, 'method-manifest.json'));
const bundle = JSON.parse(bundleBytes);
const toolSha256 = sha(await readFile(fileURLToPath(import.meta.url)));
assert.equal(toolSha256, bundle.tool.sha256, 'pinned tool bytes');
const canonicalBytes = await readFile(resolve(here, 'canonical-layouts.json'));
assert.equal(sha(canonicalBytes), bundle.canonical.sha256);
const canonical = JSON.parse(canonicalBytes);
const resourcesBytes = await readFile(resolve(here, 'runtime-resources.json'));
assert.equal(sha(resourcesBytes), bundle.resources.sha256);
const resources = JSON.parse(resourcesBytes);
const require = createRequire(resolve(args['playwright-root'] || '/workspace/scratch/neon-harbor', 'package.json'));
const pwPackagePath=require.resolve('playwright-core/package.json'),pwBundlePath=require.resolve('playwright-core/lib/coreBundle');
assert.equal(JSON.parse(await readFile(pwPackagePath,'utf8')).version,bundle.processAdapter.packageVersion);assert.equal(sha(await readFile(pwPackagePath)),bundle.processAdapter.packageSha256);assert.equal(sha(await readFile(pwBundlePath)),bundle.processAdapter.coreBundleSha256,'verified owner-only launch process API source');
const { chromium } = require('@playwright/test');
assert.equal(sha(await readFile(resolve(sourceRoot, 'tools/server.mjs'))), bundle.sourcePins['tools/server.mjs']);
const { createStaticServer } = await import(pathToFileURL(resolve(sourceRoot, 'tools/server.mjs')).href);
assert.equal(sha(await readFile(resolve(root, 'src/harbor-vehicle-models.js'))), bundle.sourcePins['src/harbor-vehicle-models.js'], 'unchanged served canonical layout/radius');
assert.equal(sha(await readFile(resolve(root, 'src/world-config.js'))), bundle.sourcePins['src/world-config.js'], 'unchanged outdoor player radius');
assert.equal(sha(await readFile(resolve(root, 'src/camera.js'))), bundle.sourcePins['src/camera.js'], 'unchanged actual camera');
if (args.mode === 'authored') for (const [path, expected] of Object.entries(bundle.authoredSourcePins)) assert.equal(sha(await readFile(resolve(root, path))), expected, `sealed authored source ${path}`);
await mkdir(output, { recursive: true }); assert.deepEqual(await readdir(output), [], 'new evidence directory required');
const sourceFiles = {};
async function fingerprint(directory, target = sourceFiles) {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await fingerprint(path, target);
    else if (entry.isFile()) target[relative(root, path)] = sha(await readFile(path));
  }
}
await fingerprint(resolve(root, 'src'));await fingerprint(resolve(root,'vendor'));
for (const path of ['index.html','styles.css','favicon.svg']) sourceFiles[path] = sha(await readFile(resolve(root, path)));
const expectedFiles = resources.files.filter(f => kinds.includes(f.kind));
if (args.mode === 'authored') for (const f of expectedFiles) {
  const bytes = await readFile(resolve(root, f.target)); assert.equal(bytes.length, f.bytes); assert.equal(sha(bytes), f.sha256);
}
const buildInfoBytes=await readFile(resolve(root,'build-info.json')),buildInfo=JSON.parse(buildInfoBytes);assert.ok(buildInfo.assets&&typeof buildInfo.assets==='object');
for(const [path,value]of Object.entries(buildInfo.assets))assert.ok(typeof path==='string'&&typeof value==='string'&&/^[a-f0-9]{64}$/.test(value),'complete actual build assets SHA dictionary');
for(const [path,value]of Object.entries(sourceFiles))assert.equal(buildInfo.assets[path],value,`actual source matches build-info ${path}`);
if(args.mode==='authored')for(const f of expectedFiles)assert.equal(buildInfo.assets[f.target],f.sha256);
const assetsDictionaryBytes=Buffer.from(JSON.stringify(buildInfo.assets,null,2)+'\n');
await writeFile(resolve(output,'build-info-original.json'),buildInfoBytes,{flag:'wx'});await writeFile(resolve(output,'assets-dictionary-derived.json'),assetsDictionaryBytes,{flag:'wx'});
async function actualGitIdentity() {
  try {await readdir(resolve(sourceRoot,'.git'));}catch(error){if(error.code==='ENOTDIR'){/* A worktree .git file is also an actual Git marker. */}else if(error.code==='ENOENT')return {head:null,reason:'No .git marker in supplied private source tree; no HEAD inferred from ROOT or build revision'};else return {head:null,reason:{stage:'source Git marker',name:error.name,message:error.message}};}
  try {const result=await promisify(execFile)('git',['-C',sourceRoot,'rev-parse','--verify','HEAD'],{timeout:5000,maxBuffer:1024});const head=result.stdout.trim();assert.ok(/^[a-f0-9]{40}$/.test(head));return {head,method:'read-only git -C actual sourceRoot rev-parse --verify HEAD'};}catch(error){return {head:null,reason:{name:error.name,message:error.message}};}
}
const actualSourceGit=await actualGitIdentity();
const run = { status: 'RUNNING', mode: args.mode, kinds, viewport, requiredBrowser: version, bridgePath,
  toolSha256, manifestSha256: sha(bundleBytes), canonicalSha256: sha(canonicalBytes), resourcesSha256: sha(resourcesBytes),
  sourceRoot, servedRoot: root, actualSourceGit, buildInfo:{sha256:sha(buildInfoBytes),bytes:buildInfoBytes.length,revision:buildInfo.revision??null,revisionIsMetadataNotInferredSourceHead:true,full:buildInfo,assetsDictionarySha256:sha(assetsDictionaryBytes),assetsDictionaryEntries:Object.keys(buildInfo.assets).length}, servedSourceHashes: sourceFiles, cases: [], firstError: null, secondaryErrors: [],
  setup: 'one real welcome-sample/data-sample-stop public location button per fresh context; not Atlas',
  directGameStateWrites: false, directClockWrites: false, directStorageWrites: false, retry: false, buildInvoked: false };
const err = (error, stage) => ({ stage, name: error?.name || '', message: error?.message || String(error), stack: error?.stack || null });
function preserve(error, stage) { if (!run.firstError) run.firstError = err(error, stage); else run.secondaryErrors.push(err(error, stage)); }
async function bounded(operation, ms, label) {
  let timer;
  try { return await Promise.race([Promise.resolve().then(operation), new Promise((_,reject) => { timer = setTimeout(() => reject(new Error(`${label} exceeded ${ms} ms`)), ms); })]); }
  finally { clearTimeout(timer); }
}
let server, browser, ownedBrowser = null;
function captureOwnedLaunch(browser) {
  const impl=browser._connection?.toImpl?.(browser),browserProcess=impl?.options?.browserProcess,child=browserProcess?.process;
  assert.ok(child&&Number.isInteger(child.pid)&&child.pid>0&&child.pid!==process.pid&&typeof browserProcess.kill==='function','actual owned launch child required');
  ownedBrowser={browserProcess,child,pid:child.pid,kill:()=>browserProcess.kill()};return {pid:child.pid,adapter:'pinned1.62.1 in-process toImpl(browser).options.browserProcess',scope:'this exact actual chromium.launch child and its owned descendants'};
}
async function killOwnedLaunchAfterCloseFailure() {
  const start=Date.now();let error=null,confirmed=false;
  try {
    assert.ok(ownedBrowser&&ownedBrowser.browserProcess.process===ownedBrowser.child&&ownedBrowser.child.pid===ownedBrowser.pid,'captured launch ownership remains exact');
    if(ownedBrowser.child.exitCode!==null||ownedBrowser.child.signalCode!==null)confirmed=true;
    else {await bounded(()=>ownedBrowser.kill(),5000,'owned launch force-kill');confirmed=ownedBrowser.child.exitCode!==null||ownedBrowser.child.signalCode!==null;assert.ok(confirmed,'owned launch child exit confirmed after kill');}
  }catch(problem){error=err(problem,'owned launch force-kill');preserve(problem,'owned launch force-kill');}
  (run.cleanup ||= []).push({label:'owned launch force-kill after browser.close failure',pid:ownedBrowser?.pid??null,limit:5000,elapsedMs:Date.now()-start,confirmed,error,scope:'captured actual launch only; no process search or global kill'});
}
try {
  server = await createStaticServer({ root });
  await bounded(() => new Promise((ok,reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', ok); }), 15000, 'server.listen');
  browser = await chromium.launch({ headless: true, ...(args['executable-path'] ? { executablePath: args['executable-path'] } : {}), args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--enable-webgl'], timeout: 30000 });
  run.ownedLaunch=captureOwnedLaunch(browser);
  run.actualBrowser = { version: browser.version(), executable: args['executable-path'] || chromium.executablePath(), node: process.version };
  assert.equal(browser.version(), version);
  for (const kind of kinds) {
    const result = await captureCase(kind); run.cases.push(result);
    if (result.firstError) { run.firstError = { ...result.firstError, kind }; run.secondaryErrors.push(...result.secondaryErrors.map(error => ({...error,kind}))); break; }
  }
} catch (error) { preserve(error, 'run'); }
finally {
  for (const [label, close, limit] of [['browser.close', () => browser?.close(), 30000], ['server.close', () => server?.listening ? new Promise((ok,reject) => server.close(error => error ? reject(error) : ok())) : Promise.resolve(), 10000]]) {
    const start = Date.now(); let failure = null;
    try { await bounded(close, limit, label); } catch (error) { failure = err(error, label); preserve(error, label); }
    (run.cleanup ||= []).push({ label, limit, startedAt: new Date(start).toISOString(), elapsedMs: Date.now() - start, confirmed: !failure, error: failure });
    if(failure&&label==='browser.close')await killOwnedLaunchAfterCloseFailure();
    if(failure&&label==='server.close')try{server?.closeAllConnections();(run.cleanup ||= []).push({label:'owned server.closeAllConnections',called:true,scope:'this run static server only'});}catch(error){preserve(error,'owned server.closeAllConnections');}
  }
  try { const after = {}; await fingerprint(resolve(root, 'src'), after);await fingerprint(resolve(root,'vendor'),after); for (const path of ['index.html','styles.css','favicon.svg']) after[path] = sha(await readFile(resolve(root,path))); run.servedSourceHashesAfter = after;run.buildInfoSha256After=sha(await readFile(resolve(root,'build-info.json')));assert.equal(run.buildInfoSha256After,sha(buildInfoBytes),'build-info exact bytes unchanged'); assert.deepEqual(after,sourceFiles,'frozen served source remains exact through run'); } catch(error) { preserve(error,'source closure'); }
  run.status = run.firstError || run.cases.length !== kinds.length ? 'FAILED' : 'PASSED';
  try { await writeFile(resolve(output, 'run.json'), JSON.stringify(run, null, 2) + '\n', { flag: 'wx' }); } catch(error) { preserve(error,'run diagnostic write'); run.status='FAILED'; console.error(JSON.stringify({firstError:run.firstError,secondaryErrors:run.secondaryErrors})); }
  if (run.status !== 'PASSED') process.exitCode = 1;
}

async function captureCase(kind) {
  const folder = resolve(output, kind); await mkdir(folder);
  const started = Date.now(), budget = kind === 'ferry' ? 3000000 : 2400000, deadline = started + budget;
  const record = { kind, status: 'RUNNING', budget, startedAt: new Date(started).toISOString(), mode: args.mode,
    toolSha256, manifestSha256: sha(bundleBytes), photos: [], photoAttempts: [], motion: [], events: [], cleanup: [], firstError: null, secondaryErrors: [], diagnostics: [], resourceResponses: [], aimPhases: [], berthWaits: [], progressDiagnosticFailures: [] };
  const keep = (error, stage) => { if (!record.firstError) record.firstError = err(error, stage); else record.secondaryErrors.push(err(error, stage)); };
  const remaining = cap => { const ms = Math.min(cap, deadline - Date.now()); assert.ok(ms > 0, 'fixed case wall deadline'); return ms; };
  const events = [], responseJobs = []; let context, page, video, activePointer = null;
  async function event(stage, data = {}) {
    const row = { at: new Date().toISOString(), stage, ...data }; record.events.push(row);
    try { await bounded(()=>appendFile(resolve(folder, 'events.jsonl'), JSON.stringify(row) + '\n'),2000,'host event diagnostic'); }
    catch (error) { const diagnostic=err(error,'write event');record.diagnostics.push(diagnostic);if(record.firstError)record.secondaryErrors.push(diagnostic);try { console.error(JSON.stringify(row)); } catch {} }
  }
  async function renderedCameraReady(phase,phaseDeadline) {
    const cap=Math.min(phaseDeadline-Date.now(),deadline-Date.now());assert.ok(cap>0,'original transition phase deadline');
    await page.waitForFunction(()=>{const s=window.__NEON__.snapshot(),c=s.camera,finitePoint=p=>p&&['x','y','z'].every(k=>Number.isFinite(p[k]));return s.started&&!s.paused&&!s.streaming?.preparing&&c&&finitePoint(c.position)&&finitePoint(c.target)&&finitePoint(c.focus)&&[c.yaw,c.pitch,c.fov].every(Number.isFinite)&&c.fov===65;},null,{polling:'raf',timeout:cap});
    const observed=await page.evaluate(()=>{const s=window.__NEON__.snapshot();return {camera:s.camera,simulationTime:s.simulationTime,revision:s.teleportRevision,stationID:s.city.sample.transit.stationId,ridingVehicleId:s.city.sample.transit.ridingVehicleId};});
    assert.ok(Date.now()<phaseDeadline&&Date.now()<deadline,'camera observation retains original phase/whole deadline');record.events.push({stage:phase,at:new Date().toISOString(),meaning:'current finite post-transition rendered first-person camera; ChaseCamera.reset returns null until next actual frame',observed});
  }
  const read = () => page.evaluate(() => window.__NEON__.snapshot());
  const transit = s => s.city.sample.transit;
  const vehicle = (s, id) => transit(s).vehicles.find(v => v.id === id);
  const bridge = s => bridgePath.split('.').reduce((value, key) => value?.[key], s);
  const localOf = (p, v) => { const dx=p.x-v.x,dz=p.z-v.z,c=Math.cos(v.yaw),n=Math.sin(v.yaw); return {x:dx*c-dz*n,y:p.y-(v.y||0),z:dx*n+dz*c,yaw:Number.isFinite(p.yaw)?p.yaw-v.yaw:null}; };
  const worldOf = (p,v) => ({x:v.x+Math.cos(v.yaw)*p.x+Math.sin(v.yaw)*p.z,y:(v.y||0)+p.y,z:v.z-Math.sin(v.yaw)*p.x+Math.cos(v.yaw)*p.z});
  const angle = n => Math.atan2(Math.sin(n), Math.cos(n));
  const distance = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);
  const healthy = s => { assert.equal(s.settings.quality,'high');assert.equal(s.settings.hour,16.5);assert.equal(s.settings.dayCycle,false);assert.equal(s.settings.firstPerson,true);assert.equal(s.renderer.contextLost,false);assert.equal(s.settings.sensitivity,1); };
  async function pointer() {
    const box=await page.locator('#game').boundingBox();
    const p={x:box.x+box.width*.86,y:box.y+box.height*.30,orbitYaw:null};
    await page.mouse.move(p.x,p.y);await page.mouse.down();activePointer=p;
    // The public pointerdown handler resets orbit to the camera rendered at
    // that input event. Read its actual origin after the event, since an
    // automatic passenger follow can advance between earlier RPCs.
    const s=await read();healthy(s);
    assert.ok(s.started&&!s.paused&&Number.isFinite(s.camera?.yaw),'actual unpaused pointer origin');
    p.orbitYaw=s.camera.yaw;
    record.events.push({stage:'public-pointerdown-fresh-origin',at:new Date().toISOString(),
      camera:s.camera,simulationTime:s.simulationTime,revision:s.teleportRevision});
    return p;
  }
  const progressOf = (s,id=null) => {
    const t=transit(s),v=id?vehicle(s,id):null;
    return {ready:s.ready,started:s.started,paused:s.paused,simulationTime:s.simulationTime,timing:s.timing,teleportRevision:s.teleportRevision,
      position:s.position,camera:s.camera,stationID:t.stationId,ridingVehicleId:t.ridingVehicleId,passengerLocal:t.passengerLocal,passengerDeck:t.passengerDeck,
      vehicle:v?Object.fromEntries(['id','x','y','z','yaw','stopId','doorsOpen','remaining','nextStopId','secondsToArrival','serviceTime','delay','held','trafficState','speed'].map(k=>[k,v[k]])):null,
          fleet:id?null:t.vehicles.map(v=>Object.fromEntries(['id','kind','stopId','doorsOpen','remaining','nextStopId','secondsToArrival','serviceTime','delay','held','trafficState','speed'].map(k=>[k,v[k]])))};
  };
  async function observePhaseProgress(phase,when,id=null,phaseDeadline=null,primary=null) {
    const cap=Math.min(10000,deadline-Date.now(),phaseDeadline==null?Infinity:phaseDeadline-Date.now());
    if(cap<=0){phase.progress.push({when,status:'SKIPPED_DEADLINE',at:new Date().toISOString()});return;}
    if(primary&&activePointer){phase.progress.push({when,status:'SKIPPED_POINTER_RELEASE_UNCONFIRMED',at:new Date().toISOString()});return;}
    try {
      const observed=await bounded(()=>page.evaluate(id=>{
        const s=window.__NEON__.snapshot(),t=s.city.sample.transit,v=id?t.vehicles.find(v=>v.id===id):t.vehicles.find(v=>v.id===t.ridingVehicleId);
        return {ready:s.ready,started:s.started,paused:s.paused,simulationTime:s.simulationTime,timing:s.timing,teleportRevision:s.teleportRevision,
          position:s.position,camera:s.camera,stationID:t.stationId,ridingVehicleId:t.ridingVehicleId,passengerLocal:t.passengerLocal,passengerDeck:t.passengerDeck,
          vehicle:v?Object.fromEntries(['id','x','y','z','yaw','stopId','doorsOpen','remaining','nextStopId','secondsToArrival','serviceTime','delay','held','trafficState','speed'].map(k=>[k,v[k]])):null,
          fleet:id?null:t.vehicles.map(v=>Object.fromEntries(['id','kind','stopId','doorsOpen','remaining','nextStopId','secondsToArrival','serviceTime','delay','held','trafficState','speed'].map(k=>[k,v[k]])))};
      },id),cap,`${phase.type} ${when} progress diagnostic`);
      phase.progress.push({when,status:'OBSERVED',at:new Date().toISOString(),observed});
    }catch(error){const diagnostic=err(error,`${phase.type} ${when} progress diagnostic`);phase.diagnosticErrors.push(diagnostic);record.secondaryErrors.push(diagnostic);if(!primary)record.progressDiagnosticFailures.push(diagnostic);}
  }
  async function aim(p,yaw,pitch=.15,{acceptCurrent=false}={}) {
    let currentFrame=null;
    const phaseDeadline=Date.now()+remaining(60000),phase={type:'aim',target:{yaw,pitch},budgetMs:60000,startedAt:new Date().toISOString(),status:'RUNNING',progress:[],diagnosticErrors:[],firstError:null};record.aimPhases.push(phase);
    try {
      await bounded(async()=>{
        const s=await read();phase.progress.push({when:'before-input',status:'OBSERVED',at:new Date().toISOString(),observed:progressOf(s)});
        // Cabin walking may reuse a fresh actual rendered camera when it
        // already satisfies the identical original aim predicate.
        if(acceptCurrent&&Number.isFinite(s.camera?.yaw)&&Number.isFinite(s.camera?.pitch)
          &&Math.abs(angle(s.camera.yaw-yaw))<.025&&Math.abs(s.camera.pitch-pitch)<.003) {
          assert.ok(Date.now()<phaseDeadline&&Date.now()<deadline,'finite aim phase/whole deadline');
          phase.skippedPointerInput=true;phase.satisfiedBy='fresh-read-only-current-camera-original-predicate';
          currentFrame=s;return;
        }
        p.x-=angle(yaw-p.orbitYaw)/(.005*s.settings.sensitivity);p.y+=(pitch-s.camera.pitch)/(.003*s.settings.sensitivity);
        await page.mouse.move(p.x,p.y);p.orbitYaw=yaw;
        const cap=Math.min(phaseDeadline-Date.now(),deadline-Date.now());assert.ok(cap>0,'finite aim phase/whole deadline');
        await page.waitForFunction(({yaw,pitch})=>{const c=window.__NEON__.snapshot().camera;return Math.abs(Math.atan2(Math.sin(c.yaw-yaw),Math.cos(c.yaw-yaw)))<.025&&Math.abs(c.pitch-pitch)<.003;},{yaw,pitch},{polling:'raf',timeout:cap});
        assert.ok(Date.now()<phaseDeadline&&Date.now()<deadline,'finite aim phase/whole deadline');
      },Math.max(1,Math.min(phaseDeadline-Date.now(),deadline-Date.now())),'finite aim phase');
      phase.status='SATISFIED';return currentFrame;
    }catch(error){phase.firstError=err(error,'aim');phase.status='FAILED';await releasePointer(error);await observePhaseProgress(phase,'timeout',null,null,error);throw error;}
    finally{phase.finishedAt=new Date().toISOString();}
  }
  // Ferry cabin only: serialize the original consumed control fields rather
  // than the city's resource catalogue. The game snapshot itself is read-only.
  function ferryCabinControlSnapshot() {
    const s=window.__NEON__.snapshot(),t=s.city.sample.transit,v=t.vehicles.find(v=>v.id===t.ridingVehicleId);
    return {ready:s.ready,started:s.started,paused:s.paused,settings:s.settings,renderer:{contextLost:s.renderer.contextLost},
      position:s.position,camera:s.camera,timing:s.timing,simulationTime:s.simulationTime,teleportRevision:s.teleportRevision,
      city:{sample:{transit:{stationId:t.stationId,riding:t.riding,ridingVehicleId:t.ridingVehicleId,passengerLocal:t.passengerLocal,
        passengerDeck:t.passengerDeck,phase:t.phase,vehicles:v?[v]:[]}}}};
  }
  function ferryCabinRelativeAimObservation(a) {
    const s=window.__NEON__.snapshot(),t=s.city.sample.transit,p=t.passengerLocal,v=t.vehicles.find(v=>v.id===t.ridingVehicleId);
    const state={ready:s.ready,started:s.started,paused:s.paused,settings:s.settings,renderer:{contextLost:s.renderer.contextLost},
      position:s.position,camera:s.camera,timing:s.timing,simulationTime:s.simulationTime,teleportRevision:s.teleportRevision,
      city:{sample:{transit:{stationId:t.stationId,riding:t.riding,ridingVehicleId:t.ridingVehicleId,passengerLocal:p,
        passengerDeck:t.passengerDeck,phase:t.phase,vehicles:v?[v]:[]}}}};
    if(Date.now()>=a.phaseDeadline||Date.now()>=a.localDeadline||Date.now()>=a.wholeDeadline)return {status:'FAILED',failure:'original finite Ferry aim/local/whole deadline',state};
    if(s.teleportRevision!==a.revision)return {status:'FAILED',failure:'original cabin teleport revision',state};
    if(!t.riding||t.ridingVehicleId!==a.vehicleId||!p||!v)return {status:'FAILED',failure:'original riding vehicle/passenger unavailable',state};
    if(!['x','y','z'].every(k=>Number.isFinite(p[k]))||!Number.isFinite(v.yaw)||!Number.isFinite(s.simulationTime))return {status:'FAILED',failure:'actual finite passenger/elapsed snapshot',state};
    const angle=n=>Math.atan2(Math.sin(n),Math.cos(n)),localHeading=Math.atan2(a.target.x-p.x,a.target.z-p.z),desired=v.yaw+localHeading-a.offset;
    if(Number.isFinite(s.camera?.yaw)&&Number.isFinite(s.camera?.pitch)&&Math.abs(angle(s.camera.yaw-desired))<.025&&Math.abs(s.camera.pitch-a.pitch)<.003)return {status:'MATCHED_FRESH_RELATIVE',state,localHeading,desired};
    // A moving ship can invalidate the requested absolute camera before it
    // settles. Return only for another real mouse aim; never for movement.
    // A forecast is only a public mouse request. If the real camera reaches
    // that request while the current vessel-relative predicate is still false,
    // another public reaim is needed even when the vessel has stopped turning.
    if(Number.isFinite(a.requestedMouseYaw)&&Number.isFinite(s.camera?.yaw)&&Number.isFinite(s.camera?.pitch)
        &&Math.abs(angle(s.camera.yaw-a.requestedMouseYaw))<.025&&Math.abs(s.camera.pitch-a.pitch)<.003)
      return {status:'PUBLIC_RELATIVE_REAIM_REQUIRED',state,localHeading,desired};
    if(Math.abs(angle(desired-a.requestedYaw))>=.025)return {status:'PUBLIC_RELATIVE_REAIM_REQUIRED',state,localHeading,desired};
    return false;
  }
  // The next mouse target uses only the two already observed control
  // frames. Prediction never satisfies a movement or camera assertion.
  function ferryObservedOneFrameMouseTarget(previous,current,desired) {
    const v=vehicle(current,transit(current).ridingVehicleId),dt=current.timing?.dt;
    if(!previous)return {mouseYaw:desired,advance:0,compensation:0,basis:'unknown-first-sample-no-anticipation'};
    const oldV=vehicle(previous,transit(previous).ridingVehicleId),elapsed=current.simulationTime-previous.simulationTime;
    if(!oldV||oldV.id!==v.id||current.teleportRevision!==previous.teleportRevision||!Number.isFinite(elapsed)||elapsed<=0||elapsed>.250001||!Number.isFinite(dt)||dt<=0||dt>.250001)
      return {mouseYaw:desired,advance:0,compensation:0,basis:'unavailable-discontinuous-control-sample-no-anticipation'};
    const observedDelta=angle(v.yaw-oldV.yaw);
    if(!Number.isFinite(observedDelta)||Math.abs(observedDelta)>.125)return {mouseYaw:desired,advance:0,compensation:0,basis:'nonfinite-or-large-observed-yaw-jump-no-anticipation'};
    const limit=Math.min(Math.abs(observedDelta),.125),advance=Math.max(-limit,Math.min(limit,observedDelta*Math.min(1,dt/elapsed))),weight=-Math.expm1(-12*dt),forecast=desired+advance,
      correction=angle(forecast-current.camera.yaw)*(1/weight-1),compensation=Math.max(-limit,Math.min(limit,correction));
    if(!Number.isFinite(advance)||!Number.isFinite(compensation)||!(weight>0))return {mouseYaw:desired,advance:0,compensation:0,basis:'nonfinite-source-response-no-anticipation'};
    return {mouseYaw:forecast+compensation,advance,compensation,observedDelta,observedSimulationDelta:elapsed,actualFrameDt:dt,dampingWeight:weight,
      basis:'two-observed-contiguous-same-vessel-frames-one-frame-bounded-public-mouse'};
  }
  async function aimFerryCabin(p,target,key,{revision,vehicleId,layout,localDeadline}) {
    const pitch=.15,offset={w:0,s:Math.PI,a:Math.PI/2,d:-Math.PI/2}[key],phaseDeadline=Math.min(Date.now()+remaining(60000),localDeadline),
      phase={type:'ferry-relative-cabin-aim',target:{local:target,key,pitch},budgetMs:60000,startedAt:new Date().toISOString(),status:'RUNNING',progress:[],diagnosticErrors:[],firstError:null};record.aimPhases.push(phase);
    const checked=s=>{healthy(s);assert.ok(s.started&&!s.paused,'actual unpaused Ferry cabin aim');assert.equal(s.teleportRevision,revision,'original cabin teleport revision');assert.ok(transit(s).riding&&transit(s).ridingVehicleId===vehicleId&&vehicle(s,vehicleId),'original riding vehicle/passenger unavailable');radiusGuard(s,layout);assert.ok(Number.isFinite(s.simulationTime)&&Number.isFinite(vehicle(s,vehicleId).yaw),'actual finite Ferry control state');};
    try {
      let matched=null;
      await bounded(async()=>{
        let s=await page.evaluate(ferryCabinControlSnapshot),previousControlFrame=p.ferryMatchedControlFrame||null;checked(s);
        while(!matched) {
          const cap=Math.min(phaseDeadline-Date.now(),localDeadline-Date.now(),deadline-Date.now());assert.ok(cap>0,'original finite Ferry aim/local/whole deadline');
          const before=transit(s).passengerLocal,localHeading=Math.atan2(target.x-before.x,target.z-before.z),desired=vehicle(s,vehicleId).yaw+localHeading-offset;
          phase.progress.push({when:'fresh-relative-before-public-input',status:'OBSERVED',at:new Date().toISOString(),desired,localHeading,observed:progressOf(s,vehicleId)});
          if(Number.isFinite(s.camera?.yaw)&&Number.isFinite(s.camera?.pitch)&&Math.abs(angle(s.camera.yaw-desired))<.025&&Math.abs(s.camera.pitch-pitch)<.003){phase.satisfiedBy='same-fresh-frame-original-relative-camera-predicate';matched=s;break;}
          const mouseTarget=ferryObservedOneFrameMouseTarget(previousControlFrame,s,desired);
          phase.progress.push({when:'bounded-observed-public-mouse-target',status:'PUBLIC_INPUT_ONLY_NOT_ACCEPTANCE',at:new Date().toISOString(),...mouseTarget,actualCurrentDesired:desired});
          previousControlFrame=s;
          p.x-=angle(mouseTarget.mouseYaw-p.orbitYaw)/(.005*s.settings.sensitivity);p.y+=(pitch-s.camera.pitch)/(.003*s.settings.sensitivity);
          await page.mouse.move(p.x,p.y);p.orbitYaw=mouseTarget.mouseYaw;
          const waitCap=Math.min(phaseDeadline-Date.now(),localDeadline-Date.now(),deadline-Date.now());assert.ok(waitCap>0,'original finite Ferry aim/local/whole deadline');
          const handle=await page.waitForFunction(ferryCabinRelativeAimObservation,{target,offset,pitch,requestedYaw:desired,requestedMouseYaw:mouseTarget.mouseYaw,revision,vehicleId,phaseDeadline,localDeadline,wholeDeadline:deadline},{polling:'raf',timeout:waitCap});
          let observed;try{observed=await handle.jsonValue();}finally{await handle.dispose();}
          assert.ok(Date.now()<phaseDeadline&&Date.now()<localDeadline&&Date.now()<deadline,'original finite Ferry aim/local/whole deadline');
          assert.ok(!observed.failure,observed.failure||'fresh-relative Ferry aim');s=observed.state;checked(s);
          phase.progress.push({when:'fresh-relative-readonly-waiter',status:observed.status,at:new Date().toISOString(),desired:observed.desired,localHeading:observed.localHeading,observed:progressOf(s,vehicleId)});
          if(observed.status==='MATCHED_FRESH_RELATIVE'){assert.ok(Math.abs(angle(s.camera.yaw-observed.desired))<.025&&Math.abs(s.camera.pitch-pitch)<.003,'original relative-camera predicate on returned control frame');matched=s;}
          else assert.equal(observed.status,'PUBLIC_RELATIVE_REAIM_REQUIRED','wrong camera requires public reaim before any movement');
        }
      },Math.max(1,Math.min(phaseDeadline-Date.now(),localDeadline-Date.now(),deadline-Date.now())),'finite Ferry relative aim phase');
      phase.status='SATISFIED';p.ferryMatchedControlFrame=matched;return matched;
    }catch(error){phase.firstError=err(error,'Ferry relative cabin aim');phase.status='FAILED';await releasePointer(error);await observePhaseProgress(phase,'timeout',vehicleId,null,error);throw error;}
    finally{phase.finishedAt=new Date().toISOString();}
  }
  // Bus-specific successor. The preceding Ferry helpers remain byte-identical.
  function busCabinRelativeAimObservation(a) {
    const s=window.__NEON__.snapshot(),t=s.city.sample.transit,p=t.passengerLocal,v=t.vehicles.find(v=>v.id===t.ridingVehicleId);
    const state={ready:s.ready,started:s.started,paused:s.paused,settings:s.settings,renderer:{contextLost:s.renderer.contextLost},
      position:s.position,camera:s.camera,timing:s.timing,simulationTime:s.simulationTime,teleportRevision:s.teleportRevision,
      city:{sample:{transit:{stationId:t.stationId,riding:t.riding,ridingVehicleId:t.ridingVehicleId,passengerLocal:p,
        passengerDeck:t.passengerDeck,phase:t.phase,vehicles:v?[v]:[]}}}};
    if(Date.now()>=a.phaseDeadline||Date.now()>=a.localDeadline||Date.now()>=a.wholeDeadline)return {status:'FAILED',failure:'original finite relative-cabin aim/local/whole deadline',state};
    if(s.teleportRevision!==a.revision)return {status:'FAILED',failure:'original cabin teleport revision',state};
    if(!t.riding||t.ridingVehicleId!==a.vehicleId||!p||!v)return {status:'FAILED',failure:'original riding vehicle/passenger unavailable',state};
    if(!['x','y','z'].every(k=>Number.isFinite(p[k]))||!Number.isFinite(v.yaw)||!Number.isFinite(s.simulationTime))return {status:'FAILED',failure:'actual finite passenger/elapsed snapshot',state};
    const angle=n=>Math.atan2(Math.sin(n),Math.cos(n)),localHeading=Math.atan2(a.target.x-p.x,a.target.z-p.z),desired=v.yaw+localHeading-a.offset;
    if(Number.isFinite(s.camera?.yaw)&&Number.isFinite(s.camera?.pitch)&&Math.abs(angle(s.camera.yaw-desired))<.025&&Math.abs(s.camera.pitch-a.pitch)<.003)return {status:'MATCHED_FRESH_RELATIVE',state,localHeading,desired};
    // A moving vehicle can invalidate the requested absolute camera before it
    // settles. Return only for another real mouse aim; never for movement.
    if(Math.abs(angle(desired-a.requestedYaw))>=.025)return {status:'PUBLIC_RELATIVE_REAIM_REQUIRED',state,localHeading,desired};
    // Bus turn exit can make a bounded one-frame mouse proposal overshoot.
    // A later actual frame at that proposal is grounds for public reaim only.
    // It cannot satisfy the unchanged fresh relative .025/.003 MATCHED guard.
    if(Number.isFinite(a.busRequestedMouseYaw)&&s.simulationTime>a.requestedSimulationTime
      &&Math.abs(angle(s.camera.yaw-a.busRequestedMouseYaw))<.025)
      return {status:'PUBLIC_RELATIVE_REAIM_REQUIRED',state,localHeading,desired};
    return false;
  }
  function busObservedOneFrameMouseTarget(previous,current,desired) {
    const v=vehicle(current,transit(current).ridingVehicleId),dt=current.timing?.dt;
    if(!previous)return {mouseYaw:desired,advance:0,compensation:0,basis:'unknown-first-sample-no-anticipation'};
    const oldV=vehicle(previous,transit(previous).ridingVehicleId),elapsed=current.simulationTime-previous.simulationTime;
    if(!oldV||oldV.id!==v.id||current.teleportRevision!==previous.teleportRevision||!Number.isFinite(elapsed)||elapsed<=0||elapsed>.250001||!Number.isFinite(dt)||dt<=0||dt>.250001)
      return {mouseYaw:desired,advance:0,compensation:0,basis:'unavailable-discontinuous-control-sample-no-anticipation'};
    // Bus harborRoutePose's piecewise derivative is <= .642262123 rad/s;
    // at the unchanged .25s maximum frame its observed yaw advance is <= .161.
    // This bounds a public mouse proposal, never camera/movement acceptance.
    const proposalLimit=.161,observedDelta=angle(v.yaw-oldV.yaw);
    if(!Number.isFinite(observedDelta)||Math.abs(observedDelta)>proposalLimit)return {mouseYaw:desired,advance:0,compensation:0,basis:'nonfinite-or-large-observed-yaw-jump-no-anticipation'};
    const limit=Math.min(Math.abs(observedDelta),proposalLimit),advance=Math.max(-limit,Math.min(limit,observedDelta*Math.min(1,dt/elapsed))),weight=-Math.expm1(-12*dt),forecast=desired+advance,
      correction=angle(forecast-current.camera.yaw)*(1/weight-1),compensation=Math.max(-limit,Math.min(limit,correction));
    if(!Number.isFinite(advance)||!Number.isFinite(compensation)||!(weight>0))return {mouseYaw:desired,advance:0,compensation:0,basis:'nonfinite-source-response-no-anticipation'};
    return {mouseYaw:forecast+compensation,advance,compensation,observedDelta,observedSimulationDelta:elapsed,actualFrameDt:dt,dampingWeight:weight,
      basis:'two-observed-contiguous-same-vehicle-frames-one-frame-bounded-public-mouse',proposalLimit};
  }
  async function aimBusCabin(p,target,key,{revision,vehicleId,layout,localDeadline}) {
    const pitch=.15,offset={w:0,s:Math.PI,a:Math.PI/2,d:-Math.PI/2}[key],phaseDeadline=Math.min(Date.now()+remaining(60000),localDeadline),
      phase={type:`${kind}-relative-cabin-aim`,target:{local:target,key,pitch},budgetMs:60000,startedAt:new Date().toISOString(),status:'RUNNING',progress:[],diagnosticErrors:[],firstError:null};record.aimPhases.push(phase);
    const checked=s=>{healthy(s);assert.ok(s.started&&!s.paused,'actual unpaused relative cabin aim');assert.equal(s.teleportRevision,revision,'original cabin teleport revision');assert.ok(transit(s).riding&&transit(s).ridingVehicleId===vehicleId&&vehicle(s,vehicleId),'original riding vehicle/passenger unavailable');radiusGuard(s,layout);assert.ok(Number.isFinite(s.simulationTime)&&Number.isFinite(vehicle(s,vehicleId).yaw),'actual finite relative cabin control state');};
    try {
      let matched=null;
      await bounded(async()=>{
        let s=await page.evaluate(ferryCabinControlSnapshot),previousControlFrame=p.busMatchedControlFrame||null;checked(s);
        while(!matched) {
          const cap=Math.min(phaseDeadline-Date.now(),localDeadline-Date.now(),deadline-Date.now());assert.ok(cap>0,'original finite relative-cabin aim/local/whole deadline');
          const before=transit(s).passengerLocal,localHeading=Math.atan2(target.x-before.x,target.z-before.z),desired=vehicle(s,vehicleId).yaw+localHeading-offset;
          phase.progress.push({when:'fresh-relative-before-public-input',status:'OBSERVED',at:new Date().toISOString(),desired,localHeading,observed:progressOf(s,vehicleId)});
          if(Number.isFinite(s.camera?.yaw)&&Number.isFinite(s.camera?.pitch)&&Math.abs(angle(s.camera.yaw-desired))<.025&&Math.abs(s.camera.pitch-pitch)<.003){phase.satisfiedBy='same-fresh-frame-original-relative-camera-predicate';matched=s;break;}
          const mouseTarget=busObservedOneFrameMouseTarget(previousControlFrame,s,desired);
          phase.progress.push({when:'bounded-observed-public-mouse-target',status:'PUBLIC_INPUT_ONLY_NOT_ACCEPTANCE',at:new Date().toISOString(),...mouseTarget,actualCurrentDesired:desired});
          previousControlFrame=s;
          p.x-=angle(mouseTarget.mouseYaw-p.orbitYaw)/(.005*s.settings.sensitivity);p.y+=(pitch-s.camera.pitch)/(.003*s.settings.sensitivity);
          await page.mouse.move(p.x,p.y);p.orbitYaw=mouseTarget.mouseYaw;
          const waitCap=Math.min(phaseDeadline-Date.now(),localDeadline-Date.now(),deadline-Date.now());assert.ok(waitCap>0,'original finite relative-cabin aim/local/whole deadline');
          const handle=await page.waitForFunction(busCabinRelativeAimObservation,{target,offset,pitch,requestedYaw:desired,revision,vehicleId,phaseDeadline,localDeadline,wholeDeadline:deadline,...(kind==='bus'?{busRequestedMouseYaw:mouseTarget.mouseYaw,requestedSimulationTime:s.simulationTime}:{})},{polling:'raf',timeout:waitCap});
          let observed;try{observed=await handle.jsonValue();}finally{await handle.dispose();}
          assert.ok(Date.now()<phaseDeadline&&Date.now()<localDeadline&&Date.now()<deadline,'original finite relative-cabin aim/local/whole deadline');
          assert.ok(!observed.failure,observed.failure||'fresh-relative cabin aim');s=observed.state;checked(s);
          phase.progress.push({when:'fresh-relative-readonly-waiter',status:observed.status,at:new Date().toISOString(),desired:observed.desired,localHeading:observed.localHeading,observed:progressOf(s,vehicleId)});
          if(observed.status==='MATCHED_FRESH_RELATIVE'){assert.ok(Math.abs(angle(s.camera.yaw-observed.desired))<.025&&Math.abs(s.camera.pitch-pitch)<.003,'original relative-camera predicate on returned control frame');matched=s;}
          else assert.equal(observed.status,'PUBLIC_RELATIVE_REAIM_REQUIRED','wrong camera requires public reaim before any movement');
        }
      },Math.max(1,Math.min(phaseDeadline-Date.now(),localDeadline-Date.now(),deadline-Date.now())),'finite relative cabin aim phase');
      phase.status='SATISFIED';p.busMatchedControlFrame=matched;return matched;
    }catch(error){phase.firstError=err(error,'relative cabin aim');phase.status='FAILED';await releasePointer(error);await observePhaseProgress(phase,'timeout',vehicleId,null,error);throw error;}
    finally{phase.finishedAt=new Date().toISOString();}
  }
  function busCabinHeldObservation(a) {
    const s=window.__NEON__.snapshot(),t=s.city.sample.transit,p=t.passengerLocal,v=t.vehicles.find(v=>v.id===t.ridingVehicleId);
    const finish=(reason,failure=null)=>({reason,failure,observations:a.observations,initialSimulationTime:a.baseSimulationTime,lastObservedLocal:p,lastSimulationTime:s.simulationTime});
    if(Date.now()>=a.localDeadline||Date.now()>=a.wholeDeadline)return finish('original-deadline','original local/whole deadline');
    if(s.teleportRevision!==a.revision)return finish('revision-failure','original cabin teleport revision');
    if(t.ridingVehicleId!==a.vehicleId||!p||!v)return finish('riding-failure','original riding vehicle/passenger unavailable');
    if(!['x','y','z'].every(k=>Number.isFinite(p[k]))||!Number.isFinite(s.simulationTime))return finish('nonfinite-failure','actual finite passenger/elapsed snapshot');
    const radius=a.layout.passengerRadius,deck=a.layout.decks.reduce((x,y)=>Math.abs(x.y-p.y)<=Math.abs(y.y-p.y)?x:y);
    if(!(p.x>=deck.minX+radius-.001&&p.x<=deck.maxX-radius+.001))return finish('radius-failure','original full passenger radius stays inside shell');
    for(const b of a.layout.blockers)if(p.y+a.layout.passengerHeight>b.minY+.02&&p.y<b.maxY-.02){const x=Math.max(b.minX,Math.min(p.x,b.maxX)),z=Math.max(b.minZ,Math.min(p.z,b.maxZ));if(!(Math.hypot(p.x-x,p.z-z)>=radius-.015))return finish('blocker-failure','actual original-radius body does not occupy a seat/driver blocker');}
    a.geometricMetres+=Math.hypot(p.x-a.lastLocal.x,p.z-a.lastLocal.z);a.lastLocal={x:p.x,y:p.y,z:p.z};
    const held=a.heldBefore+Math.max(0,s.simulationTime-a.baseSimulationTime),metres=a.metresBefore+a.geometricMetres,gap=Math.hypot(a.target.x-p.x,a.target.z-p.z);
    a.observations.push({local:{x:p.x,y:p.y,z:p.z},simulationTime:s.simulationTime,revision:s.teleportRevision,heldSeconds:held,geometricMetres:metres,horizontalGap:gap});
    if(!(held<metres/.3+3))return finish('stall-failure','original real held-input stall guard');
    if(a.busPrecisionNear?gap<.06:gap<=(a.ordinaryApproach?.7:.3))return finish('public-near-endpoint-correction');
    const angle=n=>Math.atan2(Math.sin(n),Math.cos(n));
    if(!Number.isFinite(s.camera?.yaw)||Math.abs(angle(s.camera.yaw-(v.yaw+a.localHeading-a.offset)))>=.025)return finish('public-direction-reaim');
    return false;
  }
  async function releasePointer(primary) {
    if (!activePointer) return;
    try { await bounded(()=>page.mouse.up(),5000,'mouse.up');activePointer=null; }
    catch (error) { if (primary) record.secondaryErrors.push(err(error,'mouse.up')); else throw error; }
  }
  // Only the Tram exterior can enter this finite public walking correction.
  // A max catch-up ground step is .8*.25=.2m. Near a point it can jump across
  // the original .06m ball. A short tangent step followed by an actual-heading
  // step changes that lattice without changing gait, physics or the target.
  async function groundPublicPointCorrection(target,p,initial,localDeadline) {
    const revision=initial.teleportRevision,start=initial.position,restoreYaw=initial.camera.yaw,correction={type:'finite-public-two-dimensional-ground-precision',target,maxPublicPulses:8,initialPosition:start,samples:[],finalPosition:null};let current=initial;
    const cap=()=>{const ms=Math.min(localDeadline-Date.now(),deadline-Date.now());assert.ok(ms>0,'original ground local/whole deadline');return ms;};
    try {
      for(let n=0;distance(current.position,target)>=.06&&n<8;n++) {
        cap();healthy(current);assert.equal(current.teleportRevision,revision,'original ground teleport revision');
        const before=current.position,dx=target.x-before.x,dz=target.z-before.z,gap=distance(before,target),longFrame=Number.isFinite(current.timing?.dt)&&.8*current.timing.dt>=.12,
          tangent=longFrame&&gap<.75*(.8*current.timing.dt),yaw=Math.atan2(dx,dz)+(tangent?Math.PI/2:0),cycle={n,before,gap,tangent,publicYaw:yaw,inputs:[],after:null,firstError:null};let first=null;
        await bounded(()=>aim(p,yaw),Math.min(60000,cap()),'original ground public mouse phase');cap();
        const aligned=await read();healthy(aligned);assert.equal(aligned.teleportRevision,revision);assert.ok(Math.abs(angle(aligned.camera.yaw-yaw))<.025,'original actual ground public camera direction');
        try {cycle.inputs.push({action:'down',key:'z'});await page.keyboard.down('z');cycle.inputs.push({action:'down',key:'w'});await page.keyboard.down('w');await page.waitForFunction(({before,revision})=>{const s=window.__NEON__.snapshot();if(s.teleportRevision!==revision)throw new Error('original ground teleport revision');return Math.hypot(s.position.x-before.x,s.position.z-before.z)>.009;},{before:aligned.position,revision},{polling:'raf',timeout:cap()});}
        catch(error){first=error;cycle.firstError=err(error,'public ground point movement');}
        finally {for(const k of ['w','z'])try{await page.keyboard.up(k);cycle.inputs.push({action:'up',key:k,confirmed:true});}catch(error){cycle.inputs.push({action:'up',key:k,confirmed:false,error:err(error,'keyup')});if(!first)first=error;else record.secondaryErrors.push(err(error,`public ground point keyup ${k}`));}}
        correction.samples.push(cycle);if(first)throw first;
        current=await read();cap();healthy(current);assert.equal(current.teleportRevision,revision);cycle.after=current.position;cycle.afterSimulationTime=current.simulationTime;
        assert.ok(['x','y','z'].every(k=>Number.isFinite(current.position[k])),'actual finite ground position');
        assert.ok(distance(start,current.position)<.65,'finite public ground correction stays within one original outdoor body radius of its start');
      }
      assert.ok(distance(current.position,target)<.06,'original final two-dimensional photo point precision');
      await bounded(()=>aim(p,restoreYaw),Math.min(60000,cap()),'original ground camera restoration');cap();current=await read();assert.equal(current.teleportRevision,revision);assert.ok(distance(current.position,target)<.06,'original point remains precise after public camera restoration');correction.finalPosition=current.position;
      return {current,correction};
    }finally{record.groundPublicPointCorrections ||= [];record.groundPublicPointCorrections.push(correction);}
  }
  async function groundAxis(axis,target,p=null) {
    const initial=await read(), localDeadline=Date.now()+remaining(120000),samples=[];let current=initial,first=null,coarse=null,precisionStart=initial.position[axis],simulationBudgetSeconds=null;
    const localRemaining=()=>{const ms=Math.min(localDeadline-Date.now(),deadline-Date.now());assert.ok(ms>0,'original shared ground waypoint deadline');return ms;};
    try {
      // The ferry's public entrance is 24 real metres from its board point.
      // One ordinary cardinal hold reaches the same route's precision region;
      // both phases consume the original shared 120-second local deadline.
      if(kind==='ferry'&&Math.abs(target-current.position[axis])>3.2) {
        const sign=Math.sign(target-current.position[axis]),yaw=current.camera.yaw;
        const choices=[{key:'w',x:Math.sin(yaw),z:Math.cos(yaw)},{key:'s',x:-Math.sin(yaw),z:-Math.cos(yaw)},{key:'d',x:-Math.cos(yaw),z:Math.sin(yaw)},{key:'a',x:Math.cos(yaw),z:-Math.sin(yaw)}].sort((a,b)=>sign*(b[axis]-a[axis]));
        assert.ok(Math.abs(choices[0][axis])>.995,'cardinal real walking');
        const key=choices[0].key,before=current.position[axis],coarseTarget=target-sign*2.2;let cycleError=null;
        coarse={stage:'coarse',before,coarseTarget,key,precision:false,minimumProgress:.15,inputs:[],guardBaseline:{simulationTime:current.simulationTime,meaning:'before-action observation; conservative input timing baseline'}};
        try { coarse.inputs.push({action:'down',key});await page.keyboard.down(key);await page.waitForFunction(({axis,before,sign,coarseTarget})=>{const value=window.__NEON__.snapshot().position[axis];return sign*(value-before)>.15&&sign*(value-coarseTarget)>=0;},{axis,before,sign,coarseTarget},{polling:'raf',timeout:localRemaining()}); }
        catch(error){cycleError=error;coarse.firstError=err(error,'ground coarse movement');}
        finally {try{await page.keyboard.up(key);coarse.inputs.push({action:'up',key,confirmed:true});}catch(error){coarse.inputs.push({action:'up',key,confirmed:false,error:err(error,'keyup')});if(!cycleError)cycleError=error;else record.secondaryErrors.push(err(error,`ground coarse keyup ${key}`));}}
        // An unconfirmed release goes straight to original case cleanup.
        if(cycleError)throw cycleError;
        current=await read();assert.equal(current.teleportRevision,initial.teleportRevision);coarse.after=current.position;coarse.afterSimulationTime=current.simulationTime;
        assert.ok(Date.now()<localDeadline,'coarse release/observation stays inside the original local deadline');
      }
      precisionStart=current.position[axis];
      for(let n=0;Math.abs(current.position[axis]-target)>=.06&&n<1800;n++) {
        assert.ok(Date.now()<localDeadline);
        const last=samples.at(-1),previous=samples.at(-2);
        if(kind==='tram'&&axis==='x'&&p&&last?.after&&previous?.after&&Math.abs(current.position[axis]-previous.before)<.001&&Math.sign(last.after[axis]-target)!==Math.sign(previous.after[axis]-target)) {
          const result=await groundPublicPointCorrection({x:target,z:initial.position.z},p,current,localDeadline);current=result.current;samples.push({stage:'finite-public-two-dimensional-ground-precision',...result.correction});break;
        }
        const sign=Math.sign(target-current.position[axis]),gap=Math.abs(target-current.position[axis]);
        const yaw=current.camera.yaw,choices=[{key:'w',x:Math.sin(yaw),z:Math.cos(yaw)},{key:'s',x:-Math.sin(yaw),z:-Math.cos(yaw)},{key:'d',x:-Math.cos(yaw),z:Math.sin(yaw)},{key:'a',x:Math.cos(yaw),z:-Math.sin(yaw)}].sort((a,b)=>sign*(b[axis]-a[axis]));
        assert.ok(Math.abs(choices[0][axis])>.995,'cardinal real walking');const key=choices[0].key,before=current.position[axis],step=Math.min(.15,Math.max(.009,gap-.03));let cycleError=null;
        const cycle={n,before,key,step,inputs:[]};
        try { cycle.inputs.push({action:'down',key:'z'});await page.keyboard.down('z');cycle.inputs.push({action:'down',key});await page.keyboard.down(key);await page.waitForFunction(({axis,before,sign,step})=>sign*(window.__NEON__.snapshot().position[axis]-before)>step,{axis,before,sign,step},{polling:'raf',timeout:Math.max(1,localDeadline-Date.now())}); }
        catch(error){cycleError=error;cycle.firstError=err(error,'ground movement');}
        finally { for(const k of [key,'z'])try{await page.keyboard.up(k);cycle.inputs.push({action:'up',key:k,confirmed:true});}catch(error){cycle.inputs.push({action:'up',key:k,confirmed:false,error:err(error,'keyup')});if(!cycleError)cycleError=error;else record.secondaryErrors.push(err(error,`ground keyup ${k}`));} }
        samples.push(cycle);if(cycleError)throw cycleError;current=await read();assert.equal(current.teleportRevision,initial.teleportRevision);cycle.after=current.position;
      }
      assert.ok(Math.abs(current.position[axis]-target)<.06);
      if(kind==='ferry') {
        assert.ok(Date.now()<localDeadline,'all ground phases retain the original shared local deadline');
        simulationBudgetSeconds=Math.abs(precisionStart-initial.position[axis])/5.6+Math.abs(target-precisionStart)/.8+5;
        assert.ok(current.simulationTime-initial.simulationTime<simulationBudgetSeconds,'actual ground route stalled beyond its finite physical movement budget');
      }
    } catch(error){first=error;throw error;}
    finally {record.motion.push({stage:`ground-${axis}`,target,localBudget:120000,maxIterations:1800,coarse,precisionStart,simulationBudgetSeconds,
      initialPosition:initial.position,lastObservedPosition:current.position,initialSimulationTime:initial.simulationTime,lastObservedSimulationTime:current.simulationTime,
      samples,firstError:first?err(first,'ground movement'):null});}
  }
  function radiusGuard(state, layout) {
    const p=transit(state).passengerLocal;assert.ok(p);const radius=layout.passengerRadius;
    const deck=layout.decks.reduce((a,b)=>Math.abs(a.y-p.y)<=Math.abs(b.y-p.y)?a:b);
    assert.ok(p.x>=deck.minX+radius-.001&&p.x<=deck.maxX-radius+.001,'original full passenger radius stays inside shell');
    for(const b of layout.blockers)if(p.y+layout.passengerHeight>b.minY+.02&&p.y<b.maxY-.02){const x=Math.max(b.minX,Math.min(p.x,b.maxX)),z=Math.max(b.minZ,Math.min(p.z,b.maxZ));assert.ok(Math.hypot(p.x-x,p.z-z)>=radius-.015,'actual original-radius body does not occupy a seat/driver blocker');}
  }
  // Read-only browser RAF observer. Its argument owns only protocol diagnostics;
  // no world/input/clock/camera state is written from inside the page.
  function cabinHeldObservation(a) {
    const s=window.__NEON__.snapshot(),t=s.city.sample.transit,p=t.passengerLocal,v=t.vehicles.find(v=>v.id===t.ridingVehicleId);
    const finish=(reason,failure=null)=>({reason,failure,observations:a.observations,initialSimulationTime:a.baseSimulationTime,lastObservedLocal:p,lastSimulationTime:s.simulationTime});
    if(Date.now()>=a.localDeadline||Date.now()>=a.wholeDeadline)return finish('original-deadline','original local/whole deadline');
    if(s.teleportRevision!==a.revision)return finish('revision-failure','original cabin teleport revision');
    if(t.ridingVehicleId!==a.vehicleId||!p||!v)return finish('riding-failure','original riding vehicle/passenger unavailable');
    if(!['x','y','z'].every(k=>Number.isFinite(p[k]))||!Number.isFinite(s.simulationTime))return finish('nonfinite-failure','actual finite passenger/elapsed snapshot');
    const radius=a.layout.passengerRadius,deck=a.layout.decks.reduce((x,y)=>Math.abs(x.y-p.y)<=Math.abs(y.y-p.y)?x:y);
    if(!(p.x>=deck.minX+radius-.001&&p.x<=deck.maxX-radius+.001))return finish('radius-failure','original full passenger radius stays inside shell');
    for(const b of a.layout.blockers)if(p.y+a.layout.passengerHeight>b.minY+.02&&p.y<b.maxY-.02){const x=Math.max(b.minX,Math.min(p.x,b.maxX)),z=Math.max(b.minZ,Math.min(p.z,b.maxZ));if(!(Math.hypot(p.x-x,p.z-z)>=radius-.015))return finish('blocker-failure','actual original-radius body does not occupy a seat/driver blocker');}
    a.geometricMetres+=Math.hypot(p.x-a.lastLocal.x,p.z-a.lastLocal.z);a.lastLocal={x:p.x,y:p.y,z:p.z};
    const held=a.heldBefore+Math.max(0,s.simulationTime-a.baseSimulationTime),metres=a.metresBefore+a.geometricMetres,gap=Math.hypot(a.target.x-p.x,a.target.z-p.z);
    a.observations.push({local:{x:p.x,y:p.y,z:p.z},simulationTime:s.simulationTime,revision:s.teleportRevision,heldSeconds:held,geometricMetres:metres,horizontalGap:gap});
    if(!(held<metres/.3+3))return finish('stall-failure','original real held-input stall guard');
    if(a.ferryNearDeckHold?gap<.06:gap<=(a.ferryLongitudinalHold?1.2:a.ordinaryApproach?.7:.3))return finish('public-near-endpoint-correction');
    const angle=n=>Math.atan2(Math.sin(n),Math.cos(n));
    const checkedLocalHeading=a.ferryNearDeckHold?Math.atan2(a.target.x-p.x,a.target.z-p.z):a.localHeading;
    if(!Number.isFinite(s.camera?.yaw)||Math.abs(angle(s.camera.yaw-(v.yaw+checkedLocalHeading-a.offset)))>=.025)return finish('public-direction-reaim');
    return false;
  }
  // Conservative actual-layout capsule bound: no same-height blocker may
  // overlap the axis-aligned hull of this straight deck segment plus the full
  // original passenger radius. No collision or target tolerance is relaxed.
  function ferryFreeSameDeckSegment(layout,before,target) {
    if(!['x','y','z'].every(k=>Number.isFinite(before[k])&&Number.isFinite(target[k])))return false;
    const deck=layout.decks.find(d=>Math.abs(before.y-d.y)<.015&&Math.abs(target.y-d.y)<.015);
    if(!deck)return false;
    const r=layout.passengerRadius,minX=Math.min(before.x,target.x)-r,maxX=Math.max(before.x,target.x)+r,
      minZ=Math.min(before.z,target.z)-r,maxZ=Math.max(before.z,target.z)+r;
    if(minX<deck.minX-.001||maxX>deck.maxX+.001||minZ<deck.minZ-.001||maxZ>deck.maxZ+.001)return false;
    if((deck.holes||[]).some(h=>maxX>h.minX&&minX<h.maxX&&maxZ>h.minZ&&minZ<h.maxZ))return false;
    return layout.blockers.every(b=>!(before.y+layout.passengerHeight>b.minY+.02&&before.y<b.maxY-.02)
      ||maxX<b.minX||minX>b.maxX||maxZ<b.minZ||minZ>b.maxZ);
  }
  async function walkLocal(target,p,layout,stage,{precision=true}={}) {
    const initial=await read(), revision=initial.teleportRevision, initialLocal=transit(initial).passengerLocal, localBudget=kind==='ferry'&&!precision&&Math.abs(target.x-initialLocal.x)<.06&&Math.abs(target.z-initialLocal.z)>=12?300000:150000, localDeadline=Date.now()+remaining(localBudget), samples=[initial];let current=initial,held=0,metres=0;
    let first=null,allMovementReleased=true,failureDiagnostic=null;const precisionModifier={key:'z',scope:'precision-local-leg-only',downAttempted:false,downConfirmed:false,releaseConfirmed:null,inputs:[]};
    try {
      for(let n=0;distance(target,transit(current).passengerLocal)>=.06&&n<1800;n++) {
        assert.ok(Date.now()<localDeadline);let before=transit(current).passengerLocal,v=vehicle(current,transit(current).ridingVehicleId),dx=target.x-before.x,dz=target.z-before.z;
        const key=Math.abs(dx)>Math.abs(dz)?dx>0?'a':'d':dz>0?'w':'s',offset={w:0,s:Math.PI,a:Math.PI/2,d:-Math.PI/2}[key];
        let desired=v.yaw+Math.atan2(dx,dz)-offset;const reusedFrame=kind==='bus'?await aimBusCabin(p,target,key,{revision,vehicleId:transit(current).ridingVehicleId,layout,localDeadline}):kind==='ferry'?await aimFerryCabin(p,target,key,{revision,vehicleId:transit(current).ridingVehicleId,layout,localDeadline}):await aim(p,desired,.15,{acceptCurrent:true});
        if(kind==='bus'||kind==='ferry'){current=reusedFrame;before=transit(current).passengerLocal;v=vehicle(current,transit(current).ridingVehicleId);dx=target.x-before.x;dz=target.z-before.z;desired=v.yaw+Math.atan2(dx,dz)-offset;}
        // Bus ordinary input is only a far single-axis approach on one actual deck.
        // Stair rise/descent targets retain slow gait. The source's unchanged
        // 2.25m/s*.25s=.5625m max frame stays below twice the original .7m handoff.
        const busSameDeckOrdinaryApproach=kind==='bus'&&(Math.abs(dx)<.06||Math.abs(dz)<.06)&&distance(target,before)>.7&&layout.decks.some(deck=>Math.abs(before.y-deck.y)<.015&&Math.abs(target.y-deck.y)<.015);
        const ferryFlatDeckOrdinaryApproach=kind==='ferry'&&!precision&&!precisionModifier.downAttempted&&target.x===0&&distance(target,before)>.7&&ferryFreeSameDeckSegment(layout,before,target);
        const ordinaryApproach=ferryFlatDeckOrdinaryApproach||precision&&!precisionModifier.downAttempted&&(busSameDeckOrdinaryApproach||kind==='tram'&&Math.abs(dx)<.06&&Math.abs(dz)>.7||kind==='ferry'&&(Math.abs(dx)<.06||Math.abs(dz)<.06)&&distance(target,before)>.7);
        const slow=ordinaryApproach?false:precision||distance(target,before)<1.2;
        // Ferry long centre-hall input retains the original ordinary/near1.2 gait.
        const ferryLongitudinalHold=kind==='ferry'&&!precision&&!ferryFlatDeckOrdinaryApproach&&Math.abs(dx)<.06&&Math.abs(dz)>1.2;
        const ferryNearDeckHold=kind==='ferry'&&!precision&&slow&&distance(target,before)>.06&&ferryFreeSameDeckSegment(layout,before,target);
        // Original Bus slow gait moves at most .075m/frame, less than twice
        // the original .06m endpoint radius. Observe its near hold every RAF
        // through the unchanged radius/revision/relative-direction/stall guards.
        const busPrecisionNear=kind==='bus'&&precision&&distance(target,before)<=.3;
        const cycle={n,before,key,slow,desired,inputs:[],waits:[],releaseConfirmed:true};let cycleError=null,guardBeforeAction=null,heldProbe=null;
        try {guardBeforeAction=reusedFrame||await read();cycle.guardBaseline={simulationTime:guardBeforeAction.simulationTime,meaning:'before-action snapshot; conservative held-input guard baseline, not exact input-event start'};if(slow){if(precision){if(!precisionModifier.downAttempted){precisionModifier.downAttempted=true;precisionModifier.inputs.push({action:'down',key:'z'});cycle.inputs.push({action:'down',key:'z',scope:'precision-local-leg'});await page.keyboard.down('z');precisionModifier.downConfirmed=true;}else cycle.slowModifierAlreadyHeld=true;}else{cycle.inputs.push({action:'down',key:'z'});await page.keyboard.down('z');}}cycle.inputs.push({action:'down',key});await page.keyboard.down(key);if((precision&&distance(target,before)>.3&&(kind==='bus'||kind==='tram'||kind==='ferry'))||ferryFlatDeckOrdinaryApproach||ferryLongitudinalHold||ferryNearDeckHold||busPrecisionNear){
          cycle.publicHeldControl=ferryFlatDeckOrdinaryApproach?'ordinary public Ferry free same-deck canonical centre approach to .7m, then original slow .3m/s':busPrecisionNear?'original public Bus precision gait to original .06m actual endpoint':ferryNearDeckHold?'original slow public Ferry same-deck free-segment gait through actual RAF to strict .06m endpoint':ferryLongitudinalHold?'original ordinary public Ferry centre-hall gait to1.2m, then original slow near correction':ordinaryApproach?'ordinary public gait to .7m, then original slow near correction':'ordinary slow key through actual RAF observations, then original near correction';
          const cap=Math.min(localDeadline-Date.now(),deadline-Date.now());assert.ok(cap>0,'original finite local/whole movement deadline');
          heldProbe=await page.waitForFunction(kind==='bus'?busCabinHeldObservation:cabinHeldObservation,{revision,vehicleId:transit(guardBeforeAction).ridingVehicleId,layout,target,localHeading:Math.atan2(dx,dz),offset,localDeadline,wholeDeadline:deadline,baseSimulationTime:guardBeforeAction.simulationTime,heldBefore:held,metresBefore:metres,geometricMetres:0,lastLocal:{...transit(guardBeforeAction).passengerLocal},observations:[],...(ordinaryApproach?{ordinaryApproach:true}:{}),...(ferryLongitudinalHold?{ferryLongitudinalHold:true}:{}),...(ferryNearDeckHold?{ferryNearDeckHold:true}:{}),...(busPrecisionNear?{busPrecisionNear:true}:{})},{polling:'raf',timeout:cap});
        }else await page.waitForFunction(before=>{const p=window.__NEON__.snapshot().city.sample.transit.passengerLocal;return p&&Math.hypot(p.x-before.x,p.z-before.z)>.009;},before,{polling:'raf',timeout:Math.max(1,localDeadline-Date.now())});}
        catch(error){cycleError=error;cycle.firstError=err(error,'movement');}
        finally {for(const k of [key,...(slow&&!precision?['z']:[])]){try{await page.keyboard.up(k);cycle.inputs.push({action:'up',key:k,confirmed:true});}catch(error){cycle.releaseConfirmed=false;allMovementReleased=false;cycle.inputs.push({action:'up',key:k,confirmed:false,error:err(error,'keyup')});if(!cycleError)cycleError=error;else record.secondaryErrors.push(err(error,`cabin keyup ${k}`));}}}
        // Release the actual movement key before any handle/diagnostic RPC.
        if(heldProbe&&cycle.releaseConfirmed){
          try{cycle.actualHeldObservation=await heldProbe.jsonValue();if(cycle.actualHeldObservation.failure)throw new Error(cycle.actualHeldObservation.failure);}
          catch(error){if(!cycleError)cycleError=error;else record.secondaryErrors.push(err(error,'held RAF diagnostic'));}
          finally{try{await heldProbe.dispose();}catch(error){if(!cycleError)cycleError=error;else record.secondaryErrors.push(err(error,'held RAF handle dispose'));}}
        }
        if(cycleError){cycle.firstError ||= err(cycleError,'release');samples.push(cycle);throw cycleError;}
        current=await read();if(kind==='ferry')assert.ok(Date.now()<localDeadline,'declared finite Ferry local deadline after confirmed release');assert.equal(current.teleportRevision,revision);radiusGuard(current,layout);
        held+=Math.max(0,current.simulationTime-guardBeforeAction.simulationTime);metres+=distance(before,transit(current).passengerLocal);
        assert.ok(held<metres/.3+3,'original real held-input stall guard');cycle.after=transit(current).passengerLocal;cycle.heldSeconds=held;cycle.geometricMetres=metres;samples.push(cycle);
      }
      assert.ok(distance(target,transit(current).passengerLocal)<.06,'original physical local endpoint');if(target.y!=null)assert.ok(Math.abs(transit(current).passengerLocal.y-target.y)<.15);assert.equal(current.teleportRevision,revision);
    } catch(error){first=error;throw error;}
    finally {
      let modifierReleaseError=null;
      if(precisionModifier.downAttempted){
        try{await page.keyboard.up('z');precisionModifier.releaseConfirmed=true;precisionModifier.inputs.push({action:'up',key:'z',confirmed:true});}
        catch(error){precisionModifier.releaseConfirmed=false;precisionModifier.inputs.push({action:'up',key:'z',confirmed:false,error:err(error,'precision modifier keyup')});modifierReleaseError=error;if(!first)first=error;else record.secondaryErrors.push(err(error,'precision modifier keyup'));}
      }
      if(first&&(kind==='bus'||kind==='tram'||kind==='ferry')) {
        const cap=Math.min(4900,deadline-Date.now());
        const modifierReleased=!precisionModifier.downAttempted||precisionModifier.releaseConfirmed===true;
        if(!allMovementReleased||!modifierReleased)failureDiagnostic={status:'SKIPPED_RELEASE_UNCONFIRMED'};
        else if(cap<=0)failureDiagnostic={status:'SKIPPED_ORIGINAL_WHOLE_DEADLINE'};
        else try {
          const observed=await bounded(()=>page.evaluate(()=>{
            const s=window.__NEON__.snapshot(),t=s.city.sample.transit,v=t.vehicles.find(v=>v.id===t.ridingVehicleId);
            return {ready:s.ready,paused:s.paused,position:s.position,camera:s.camera,timing:s.timing,
              simulationTime:s.simulationTime,teleportRevision:s.teleportRevision,ridingVehicleId:t.ridingVehicleId,
              local:t.passengerLocal,deck:t.passengerDeck,vehicle:v?{id:v.id,yaw:v.yaw,stopId:v.stopId,remaining:v.remaining}:null};
          }),cap,'released cabin first-failure readonly diagnostic');
          failureDiagnostic={status:'OBSERVED_AFTER_CONFIRMED_KEYUP',budgetMs:cap,observed};
        }catch(error){failureDiagnostic={status:'FAILED_SECONDARY',budgetMs:cap,error:err(error,'released first-failure diagnostic')};record.secondaryErrors.push(err(error,'released first-failure diagnostic'));}
      }
      record.motion.push({stage,target,precision,localBudget,maxIterations:1800,initialLocal:transit(initial).passengerLocal,lastObservedLocal:transit(current).passengerLocal,samples,precisionModifier,...((kind==='bus'||kind==='tram'||kind==='ferry')?{failureDiagnostic}:{}),firstError:first?err(first,'local movement'):null});
      if(modifierReleaseError&&first===modifierReleaseError)throw modifierReleaseError;
    }
  }
  async function waitBerth(id, stopId=null,{minimumRemaining=null}={}) {
    assert.ok(minimumRemaining===null||kind==='ferry'&&minimumRemaining===3.25,'only the fixed Ferry photo OPEN reserve amendment');
    const berthBudgetMs=kind==='tram'||kind==='ferry'?1200000:600000;
    const phaseDeadline=Date.now()+remaining(berthBudgetMs),phase={type:'berth',vehicleId:id,requiredStopId:stopId,budgetMs:berthBudgetMs,startedAt:new Date().toISOString(),status:'RUNNING',progress:[],diagnosticErrors:[],firstError:null};
    if(kind==='tram'){phase.originalBudgetMs=600000;phase.budgetAmendment='finite-tram-normal-service-observed-wall-rate';}
    if(kind==='ferry'){phase.originalBudgetMs=600000;phase.budgetAmendment='explicit-finite-ferry-original600-failure-observed-service-progress';}
    if(minimumRemaining!==null)phase.photoOpenReserve={minimumRemainingSeconds:minimumRemaining,originalGeneralBerthMinimumStrictlyGreaterThan:2,source:'actual recorded Ferry photo maximum3.0sim seconds plus one.25sim frame'};
    record.berthWaits.push(phase);
    await observePhaseProgress(phase,'before-wait',id,phaseDeadline);
    try {
      const cap=Math.min(phaseDeadline-Date.now(),deadline-Date.now());assert.ok(cap>0,'finite berth phase/whole deadline');
      await page.waitForFunction(({id,stopId,minimumRemaining})=>{const t=window.__NEON__.snapshot().city.sample.transit,enough=v=>minimumRemaining===null?v.remaining>2:v.remaining>=minimumRemaining,v=id?t.vehicles.find(v=>v.id===id):t.vehicles.find(v=>v.stopId===stopId&&v.doorsOpen&&enough(v));return v?.stopId&&(!stopId||v.stopId===stopId)&&v.doorsOpen&&enough(v);},{id,stopId,minimumRemaining},{polling:'raf',timeout:cap});
      assert.ok(Date.now()<phaseDeadline&&Date.now()<deadline,'finite berth phase/whole deadline');phase.status='SATISFIED';
    }catch(error){phase.firstError=err(error,'scheduled berth');phase.status='FAILED';await releasePointer(error);await observePhaseProgress(phase,'timeout',id,null,error);throw error;}
    finally{phase.finishedAt=new Date().toISOString();}
  }
  function observedResources(state,id,near) {
    const b=bridge(state); if(args.mode==='baseline'){assert.ok(!b||!b.fleet?.some(v=>v.authored));return {bridge:b||null,actor:null,pool:null};}
    assert.ok(b&&!b.disposed);assert.equal(b.loadSource,'default-same-origin-sha256');
    const actor=b.fleet.find(v=>v.id===id);assert.ok(actor?.authored&&actor.wanted&&!actor.failed&&actor.quality==='high');
    assert.ok(Number.isInteger(actor.poolGeneration)&&actor.poolGeneration>0);assert.ok(Number.isInteger(actor.instanceGeneration)&&actor.instanceGeneration>0);
    const pool=b.pools.find(p=>p.generation===actor.poolGeneration&&p.kind===kind);assert.ok(pool?.loaded&&pool.settled&&!pool.closed&&!pool.failed);assert.ok(pool.users>0);
    if(near)assert.equal(actor.visibleLod,0,'actual visible authored LOD0');
    const owned=pool.resourceStats;assert.ok(owned?.geometryCount>0&&owned.textureCount>0&&owned.imageCount>0);assert.ok(owned.images.length===owned.imageCount);
    for(const image of owned.images){assert.equal(image.actualImageBitmap,true,'actual native ImageBitmap');assert.equal(image.cpuPlaceholder,false);assert.ok(image.hasClose&&image.width>0&&image.height>0);}
    assert.equal(actor.instanceResourceStats.geometryAndTexturesOwnedByPoolGeneration,pool.generation);assert.ok(actor.instanceResourceStats.materialCount>0);
    return {bridge:b,actor,pool};
  }
  async function validateResources(id) {
    await page.waitForFunction(({mode,path,id})=>{const s=window.__NEON__.snapshot(),b=path.split('.').reduce((v,k)=>v?.[k],s);if(mode==='baseline')return !b||!b.fleet?.some(v=>v.authored);const actor=b?.fleet?.find(v=>v.id===id),pool=b?.pools?.find(p=>p.generation===actor?.poolGeneration);return !!actor?.authored&&!actor.failed&&actor.visibleLod===0&&!!pool?.loaded&&pool.settled&&!pool.failed&&!b.disposed;},{mode:args.mode,path:bridgePath,id},{polling:'raf',timeout:remaining(30000)});
  }
  function photoPose(state,id,target,relativeYaw,bodyYaw,immediateBoardedLower=false) {
    healthy(state);if(transit(state).riding)radiusGuard(state,canonical[kind].layout);const v=vehicle(state,id);
    if(immediateBoardedLower) {
      assert.ok(kind==='bus'||kind==='tram','immediate lower phase is only Bus/Tram');
      assert.ok(transit(state).riding&&transit(state).ridingVehicleId===id,'lower photo remains on the same actual boarded vehicle');
      assert.equal(transit(state).passengerDeck,'lower','lower photo uses the original lower deck');
      assert.ok(v&&v.kind===kind&&['x','y','z','yaw','serviceTime','speed'].every(k=>Number.isFinite(v[k])),'actual finite current matching vehicle');
      assert.equal(v.doorsOpen,!!v.stopId,'actual dock/travel door phase is consistent');
      assert.equal(transit(state).phase,v.stopId?'docked':'moving','actual dock or travel phase, without a berth wait');
    }else assert.ok(v?.stopId&&v.doorsOpen,'photo captures actual open berth');
    const body=transit(state).riding?transit(state).passengerLocal:localOf(state.position,v),eye=localOf(state.camera.position,v);
    assert.ok(distance(body,target)<.06,'same declared local photo body point');assert.ok(Math.abs(body.y-target.y)<.15);
    assert.ok(Math.abs(angle(state.camera.yaw-v.yaw-relativeYaw))<.025);assert.ok(Math.abs(state.camera.pitch-.15)<.003);assert.ok(distance(eye,body)<.06);assert.ok(Math.abs(eye.y-body.y-1.62)<.025);
    return {body,eye,vehicle:v,resources:observedResources(state,id,true)};
  }
  async function photo(stage,id,target,relativeYaw,bodyYaw,p) {
    const attempt={stage,target,relativeYaw,bodyYawReferenceOnly:bodyYaw,vehicleId:id,mode:args.mode,status:'RUNNING',toolSha256,manifestSha256:sha(bundleBytes)};record.photoAttempts.push(attempt);
    const immediateBoardedLower=stage==='lower'&&(kind==='bus'||kind==='tram');
    if(immediateBoardedLower)attempt.phaseAmendment='same-boarded-lower-local-pose-current-dock-or-travel-no-extra-berth-wait';
    try {
      if(!immediateBoardedLower)await waitBerth(id,null,kind==='ferry'?{minimumRemaining:3.25}:{});await validateResources(id);const aligned=await read();if(kind==='ferry')attempt.photoOpenReserve={minimumRemainingSecondsAtWait:3.25,actualRemainingAtPostResourceCameraRead:vehicle(aligned,id).remaining,actualStopId:vehicle(aligned,id).stopId};await aim(p,vehicle(aligned,id).yaw+relativeYaw);
      const before=await read();attempt.before=before;const proofBefore=photoPose(before,id,target,relativeYaw,bodyYaw,immediateBoardedLower);attempt.proofBefore=proofBefore;
      const path=resolve(folder,`${stage}.png`);attempt.imageFile=`${stage}.png`;await page.screenshot({path,timeout:remaining(90000)});attempt.screenshotCompleted=true;
      const after=await read();attempt.after=after;const proofAfter=photoPose(after,id,target,relativeYaw,bodyYaw,immediateBoardedLower);attempt.proofAfter=proofAfter;
      if(args.mode==='authored'){assert.equal(proofAfter.resources.actor.instanceGeneration,proofBefore.resources.actor.instanceGeneration);assert.equal(proofAfter.resources.actor.poolGeneration,proofBefore.resources.actor.poolGeneration);}
      const pose={stage,target,relativeYaw,bodyYawReferenceOnly:bodyYaw,bodyYawAsserted:false,actualBodyLocal:proofBefore.body,actualEyeLocal:proofBefore.eye,stationID:transit(before).stationId,vehicleId:id,actualBerth:{...proofBefore.vehicle},before,after,proofBefore,proofAfter,mode:args.mode,worldPositionEqualityAcrossRunsNotAsserted:true,imageSha256:sha(await readFile(path)),toolSha256,manifestSha256:sha(bundleBytes)};
      await writeFile(resolve(folder,`${stage}-pose.json`),JSON.stringify(pose,null,2)+'\n');attempt.status='PASSED';attempt.imageSha256=pose.imageSha256;record.photos.push({stage,file:`${stage}.png`,imageSha256:pose.imageSha256,poseFile:`${stage}-pose.json`});await event(`photo-${stage}`,{vehicleId:id,stationID:pose.stationID,body:proofBefore.body,eye:proofBefore.eye,poolGeneration:proofBefore.resources.actor?.poolGeneration,instanceGeneration:proofBefore.resources.actor?.instanceGeneration});
    }catch(error){attempt.status='FAILED';attempt.firstError=err(error,`photo-${stage}`);throw error;}
  }
  try {
    await bounded(async()=>{
      context=await browser.newContext({viewport,deviceScaleFactor:1,recordVideo:{dir:resolve(folder,'video'),size:viewport}});page=await context.newPage();video=page.video();page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(90000);
      page.on('pageerror',error=>events.push(err(error,'pageerror')));page.on('console',message=>{if(message.type()==='error')events.push({stage:'console',message:message.text()});});
      page.on('response',response=>{if(response.status()>=400)events.push({stage:'HTTP',url:response.url(),status:response.status()});let url;try{url=new URL(response.url());}catch(error){events.push(err(error,'response URL'));return;}const f=resources.files.find(f=>url.pathname==='/'+f.target);if(f){const job=(async()=>{try{const bytes=await response.body();const got={url:response.url(),status:response.status(),bytes:bytes.length,sha256:sha(bytes),expected:f};record.resourceResponses.push(got);assert.equal(got.status,200);assert.equal(got.bytes,f.bytes);assert.equal(got.sha256,f.sha256);}catch(error){events.push(err(error,'transport resource response'));}})();responseJobs.push(job);}});
      await page.goto(`http://127.0.0.1:${port}/`);await page.locator('#start').waitFor({state:'visible',timeout:remaining(90000)});await page.waitForFunction(()=>!document.querySelector('#start').disabled,null,{timeout:remaining(90000)});
      const defaults=await read();assert.equal(defaults.settings.quality,'high');assert.equal(defaults.settings.hour,16.5);
      await page.locator('#welcome-settings').click();await page.locator('#quality').selectOption('high');await page.locator('#cycle').uncheck();assert.equal(Number(await page.locator('#time').inputValue()),16.5);await page.locator('#time').press('ArrowRight');await page.locator('#time').press('ArrowLeft');await page.locator('#resume').click();
      await page.locator('#welcome-sample').click();await page.locator('#sample-stops').waitFor({state:'visible'});
      const setup=await read(),stop=transit(setup).stops.find(s=>s.kind===kind);assert.ok(stop);const route=transit(setup).routes.find(r=>r.id===stop.routeId),toId=route.stops[(route.stops.indexOf(stop.id)+(kind==='ferry'?1:2))%route.stops.length],to=transit(setup).stops.find(s=>s.id===toId);
      const publicPlan={bus:['harbor-bus-courtyard','harbor-bus-lantern'],tram:['harbor-tram-lantern','harbor-tram-quay'],ferry:['harbor-ferry-south','harbor-ferry-north']}[kind];assert.equal(stop.id,publicPlan[0]);assert.equal(to.id,publicPlan[1]);record.publicPlan=publicPlan;
      record.publicInitialStop=stop;record.destinationStop=to;record.canonical=canonical[kind];const publicSetupDeadline=Date.now()+remaining(90000);await page.locator(`[data-sample-stop="${stop.id}"]`).click();await page.waitForFunction(()=>{const s=window.__NEON__.snapshot();return s.started&&!s.paused&&!s.streaming?.preparing;},null,{timeout:Math.max(1,publicSetupDeadline-Date.now())});
      if(!(await read()).settings.firstPerson)await page.keyboard.press('v');await renderedCameraReady('public-stop-current-rendered-camera',publicSetupDeadline);healthy(await read());await page.locator('#game').focus();
      record.actualGraphics=await page.locator('#game').evaluate(canvas=>{const g=canvas.getContext('webgl2'),d=g.getExtension('WEBGL_debug_renderer_info');return {width:g.drawingBufferWidth,height:g.drawingBufferHeight,renderer:g.getParameter(g.RENDERER),unmaskedRenderer:d?g.getParameter(d.UNMASKED_RENDERER_WEBGL):null,lost:g.isContextLost()};});assert.equal(record.actualGraphics.width,1280);assert.equal(record.actualGraphics.height,800);assert.equal(record.actualGraphics.lost,false);
      let p=await pointer();await aim(p,0);await groundAxis('x',stop.board.x);await groundAxis('z',stop.board.z);await releasePointer(null);
      const {layout,spec}=canonical[kind],door=layout.doors.find(d=>d.id===stop.doorId),outerGap=kind==='ferry'?2.0:1.0,outLocal={x:door.side*(spec.halfWidth+outerGap),y:(kind==='ferry'?stop.board.y:0)-(stop.berth.y||0),z:door.z},outWorld=worldOf(outLocal,stop.berth);
      if(kind==='ferry')assert.ok(distance(outWorld,stop.board)<.001,'ferry exterior photo remains on actual public pier board point');record.exteriorMethod={outerGap,outLocal,outWorld,outdoorRadius:.65};
      assert.ok(outerGap>=.65+.20+.06,'unchanged outdoor radius .65 plus margin and endpoint allowance');p=await pointer();await aim(p,0);await groundAxis('x',outWorld.x,p);await groundAxis('z',outWorld.z);
      await waitBerth(null,stop.id);const boardingState=await read(),boardingVehicle=transit(boardingState).vehicles.find(v=>v.stopId===stop.id&&v.doorsOpen);assert.ok(boardingVehicle);
      await photo('exterior',boardingVehicle.id,outLocal,door.side<0?Math.PI/2:-Math.PI/2,-door.side*Math.PI/2,p);await releasePointer(null);const beforeE=await read(),open=vehicle(beforeE,boardingVehicle.id);assert.equal(open.stopId,stop.id);assert.ok(open.doorsOpen&&open.remaining>.6);assert.ok(distance(beforeE.position,stop.board)<2.6);const boardingDeadline=Date.now()+remaining(30000);await page.keyboard.press('e');await page.waitForFunction(id=>window.__NEON__.snapshot().city.sample.transit.ridingVehicleId===id,boardingVehicle.id,{timeout:Math.max(1,boardingDeadline-Date.now())});await renderedCameraReady('boarding-E-current-rendered-camera',boardingDeadline);
      const boarded=await read(),id=transit(boarded).ridingVehicleId,revision=boarded.teleportRevision,stair=layout.stairs[0];assert.equal(transit(boarded).passengerDeck,'lower');record.boarded=boarded;
      const upperRoute=[{x:0,z:door.z,y:stair.fromY},{x:0,z:stair.bottom.z,y:stair.fromY},stair.bottom,{x:stair.x,z:(stair.startZ+stair.endZ)/2,y:(stair.fromY+stair.toY)/2},stair.top,{x:0,z:stair.top.z,y:stair.toY}];
      p=await pointer();let routeError=null;
      try{for(const [i,target]of upperRoute.entries()){await walkLocal(target,p,layout,`upper-${i}`,{precision:kind!=='ferry'||target.x!==0});if(i===0)await photo('lower',id,target,0,Math.PI/2,p);}const upper=await read();assert.equal(transit(upper).passengerDeck,'upper');assert.equal(upper.teleportRevision,revision);assert.ok(record.motion.some(m=>m.samples?.some(s=>s.after?.y>stair.fromY+.25&&s.after?.y<stair.toY-.25)),'continuous actual stair samples');await photo('upper',id,upperRoute.at(-1),0,stair.x<0?Math.PI/2:-Math.PI/2,p);}
      catch(error){routeError=error;throw error;}finally{await releasePointer(routeError);}
      const upperOpen=await read(),upperVehicle=vehicle(upperOpen,id);assert.ok(upperVehicle.stopId&&upperVehicle.doorsOpen&&upperVehicle.remaining>.6);await page.keyboard.press('e');const denied=await read();assert.equal(transit(denied).ridingVehicleId,id);assert.equal(transit(denied).passengerDeck,'upper');await event('upper-E-refused',{stationID:transit(denied).stationId,vehicleId:id,actualLocal:transit(denied).passengerLocal});
      const exitDoor=layout.doors.find(d=>d.id===to.doorId);const lowerRoute=[stair.top,{x:stair.x,z:(stair.startZ+stair.endZ)/2,y:(stair.fromY+stair.toY)/2},stair.bottom,{x:0,z:stair.bottom.z,y:stair.fromY},{x:0,z:exitDoor.z,y:stair.fromY},exitDoor.inside];p=await pointer();routeError=null;
      try{for(const[i,target]of lowerRoute.entries())await walkLocal(target,p,layout,`lower-${i}`,{precision:kind!=='ferry'||target.x!==0});}catch(error){routeError=error;throw error;}finally{await releasePointer(routeError);}
      const ready=await read();assert.equal(transit(ready).passengerDeck,'lower');assert.ok(distance(transit(ready).passengerLocal,exitDoor.inside)<.06);assert.equal(ready.teleportRevision,revision);await waitBerth(id,to.id);
      const arrived=await read();assert.equal(arrived.teleportRevision,revision);assert.ok(arrived.simulationTime>boarded.simulationTime);assert.ok(distance(arrived.position,boarded.position)>10);assert.equal(transit(arrived).currentStopId,to.id);assert.ok(distance(transit(arrived).passengerLocal,exitDoor.inside)<.06);await page.keyboard.press('e');await page.waitForFunction(()=>!window.__NEON__.snapshot().city.sample.transit.riding,null,{timeout:remaining(30000)});const outside=await read();healthy(outside);assert.ok(distance(outside.position,to.board)<.15);record.alighted=outside;await event('correct-lower-open-berth-E-exit',{stationID:transit(arrived).stationId,destination:to.id,actualWorldPosition:outside.position});
      await Promise.all(responseJobs);assert.deepEqual(events,[]);if(args.mode==='baseline')assert.equal(record.resourceResponses.length,0);else for(const f of expectedFiles.filter(f=>f.kind===kind))assert.ok(record.resourceResponses.some(r=>r.sha256===f.sha256),'each actual requested tier response hash');
    },budget,'fixed whole case');
  }catch(error){keep(error,'case');}
  finally {
    try{await releasePointer(record.firstError);}catch(error){keep(error,'pointer cleanup');}
    if(record.firstError)try{await bounded(()=>event('first-error-before-context-close',{firstError:record.firstError,secondaryErrors:record.secondaryErrors}),2000,'first-error diagnostic before context.close');}catch(error){record.diagnostics.push(err(error,'first-error diagnostic before context.close'));keep(error,'first-error diagnostic before context.close');}
    const closeStart=Date.now();let closeError=null;
    try{await bounded(()=>context?.close(),30000,'context.close');}catch(error){closeError=err(error,'context.close');keep(error,'context.close');}
    record.cleanup.push({operation:'context.close',budget:30000,elapsedMs:Date.now()-closeStart,confirmed:!closeError,error:closeError,originalFirstError:record.firstError});
    record.runtimeErrors=events;record.elapsedMs=Date.now()-started;if(record.elapsedMs>budget)keep(new Error('full case including context finalization exceeded fixed budget'),'case-budget');
    for(const attempt of record.photoAttempts)if(attempt.screenshotCompleted&&!attempt.imageSha256)try{attempt.imageSha256=sha(await readFile(resolve(folder,attempt.imageFile)));}catch(error){record.secondaryErrors.push(err(error,`partial photo ${attempt.stage} hash`));}
    record.videoPath=null;
    if(video)try{record.videoPath=await bounded(()=>video.path(),3000,'video.path');const bytes=await readFile(record.videoPath);record.video={path:record.videoPath,bytes:bytes.length,sha256:sha(bytes)};}catch(error){keep(error,'video finalization');}
    if(record.progressDiagnosticFailures.length&&!record.firstError)keep(new Error('required phase progress diagnostic failed'),'phase-progress-diagnostics');
    if(record.diagnostics.length&&!record.firstError)keep(new Error('host evidence writes failed'),'diagnostics');
    record.status=record.firstError?'FAILED':'PASSED';
    for(const [file,value]of [['motion.json',{toolSha256,manifestSha256:sha(bundleBytes),motion:record.motion,firstError:record.firstError,secondaryErrors:record.secondaryErrors}],['case.json',record]])try{await writeFile(resolve(folder,file),JSON.stringify(value,null,2)+'\n');}catch(error){keep(error,`write ${file}`);record.status='FAILED';console.error(JSON.stringify({kind,firstError:record.firstError,secondaryErrors:record.secondaryErrors}));}

  }
  return record;
}
