/** Source-only prepared extra. ROOT schedules native execution. No build/acquisition. */
import assert from 'node:assert/strict';
import { readFile, writeFile, appendFile, mkdir, readdir, readlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), args = {};
const usage = 'node native-transport-ownership-extra.mjs --mode authored --kind bus|tram|ferry --root FROZEN_DIST --source-root FROZEN_SOURCE --output NEW_DIR [--port 5198] [--playwright-root PROVIDER] [--executable-path CHROMIUM_151]';
for (let i = 2; i < process.argv.length; i++) {
  const key = process.argv[i];
  if (key === '--help') { console.log(usage); process.exit(0); }
  assert.ok(['--mode','--kind','--root','--source-root','--output','--port','--playwright-root','--executable-path'].includes(key) && process.argv[i + 1], usage);
  assert.ok(!Object.hasOwn(args, key.slice(2)), 'duplicate option'); args[key.slice(2)] = process.argv[++i];
}
for (const key of ['mode','kind','root','source-root','output']) assert.ok(args[key], usage);
assert.equal(args.mode, 'authored', 'authored-only ownership extra');
assert.ok(['bus','tram','ferry'].includes(args.kind), usage);
const kind = args.kind, root = resolve(args.root), sourceRoot = resolve(args['source-root']), output = resolve(args.output);
const port = Number(args.port || 5198), viewport = {width:1280,height:800}, browserVersion = '151.0.7922.34';
assert.ok(Number.isInteger(port) && port > 0 && port < 65536);
assert.ok(output !== root && !output.startsWith(root + '/') && output !== sourceRoot && !output.startsWith(sourceRoot + '/'), 'output outside frozen app trees');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const manifestBytes = await readFile(resolve(here,'method-manifest.json')), manifest = JSON.parse(manifestBytes);
const toolSha256 = sha(await readFile(fileURLToPath(import.meta.url)));
assert.equal(toolSha256, manifest.tool.sha256, 'exact prepared method source');
const resourcesBytes = await readFile(resolve(here,'runtime-resources.json'));
assert.equal(sha(resourcesBytes), manifest.resources.sha256);
const resources = JSON.parse(resourcesBytes), expectedFiles = resources.files.filter(f => f.kind === kind);
assert.equal(resources.files.length,9); assert.equal(expectedFiles.length,3);
assert.equal(new Set(resources.files.map(f => f.target)).size,9);
const require = createRequire(resolve(args['playwright-root'] || '/workspace/scratch/neon-harbor','package.json'));
const pwPackagePath = require.resolve('playwright-core/package.json'), pwBundlePath = require.resolve('playwright-core/lib/coreBundle');
assert.equal(JSON.parse(await readFile(pwPackagePath,'utf8')).version,manifest.processAdapter.packageVersion);
assert.equal(sha(await readFile(pwPackagePath)),manifest.processAdapter.packageSha256);
assert.equal(sha(await readFile(pwBundlePath)),manifest.processAdapter.coreBundleSha256,'reviewed exact-owned launch adapter source');
const {chromium} = require('@playwright/test');
for (const [path,expected] of Object.entries(manifest.servedSourcePins)) assert.equal(sha(await readFile(resolve(root,path))),expected,`sealed served ${path}`);
assert.equal(sha(await readFile(resolve(sourceRoot,'tools/server.mjs'))),manifest.serverSha256);
const {createStaticServer} = await import(pathToFileURL(resolve(sourceRoot,'tools/server.mjs')).href);
await mkdir(output,{recursive:true}); assert.deepEqual(await readdir(output),[],'new empty evidence directory');
const sourceFiles = {};
async function fingerprint(directory,target=sourceFiles) {
  for (const entry of (await readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
    const path = resolve(directory,entry.name);
    if (entry.isDirectory()) await fingerprint(path,target);
    else if (entry.isFile()) target[relative(root,path)] = sha(await readFile(path));
  }
}
await fingerprint(resolve(root,'src')); await fingerprint(resolve(root,'vendor'));
for (const path of ['index.html','styles.css','favicon.svg']) sourceFiles[path] = sha(await readFile(resolve(root,path)));
const buildBytes = await readFile(resolve(root,'build-info.json')), build = JSON.parse(buildBytes);
assert.ok(build.assets && typeof build.assets === 'object');
for (const [path,value] of Object.entries(build.assets)) assert.ok(typeof path === 'string' && /^[a-f0-9]{64}$/.test(value),'actual complete assets SHA dictionary');
for (const [path,value] of Object.entries(sourceFiles)) assert.equal(build.assets[path],value,`served source matches build ${path}`);
// All nine maps are authoritative; only the selected kind must be decoded in this case.
for (const f of resources.files) {
  const bytes = await readFile(resolve(root,f.target)); assert.equal(bytes.length,f.bytes); assert.equal(sha(bytes),f.sha256);
  assert.equal(build.assets[f.target],f.sha256);
}
const dictionaryBytes = Buffer.from(JSON.stringify(build.assets,null,2)+'\n');
await writeFile(resolve(output,'build-info-original.json'),buildBytes,{flag:'wx'});
await writeFile(resolve(output,'assets-dictionary-derived.json'),dictionaryBytes,{flag:'wx'});
async function actualGitIdentity() {
  try { await readdir(resolve(sourceRoot,'.git')); }
  catch (error) { if (error.code !== 'ENOTDIR') return {head:null,reason:error.code === 'ENOENT' ? 'No supplied sourceRoot .git; no ROOT/build revision inference' : error.message}; }
  try { const result = await promisify(execFile)('git',['-C',sourceRoot,'rev-parse','--verify','HEAD'],{timeout:5000,maxBuffer:1024}); const head=result.stdout.trim(); assert.ok(/^[a-f0-9]{40}$/.test(head)); return {head,method:'actual sourceRoot read-only rev-parse'}; }
  catch (error) { return {head:null,reason:error.message}; }
}
const record = {status:'RUNNING',caseId:`ownership-${kind}`,kind,mode:'authored',toolSha256,manifestSha256:sha(manifestBytes),resourcesSha256:sha(resourcesBytes),sourceRoot,servedRoot:root,
  actualSourceGit:await actualGitIdentity(),buildInfo:{sha256:sha(buildBytes),revision:build.revision??null,revisionIsMetadataNotInferredSourceHead:true,assetsDictionarySha256:sha(dictionaryBytes),assetsDictionaryEntries:Object.keys(build.assets).length,full:build},
  sourceHashesBefore:sourceFiles,viewport,requiredBrowser:browserVersion,events:[],auditEvents:[],samples:[],responses:[],photos:[],cleanup:[],firstError:null,secondaryErrors:[],diagnosticErrors:[],
  setup:'one actual welcome-sample/data-sample-stop; no boarding; public High-Low-High',directGameStateWrites:false,directClockWrites:false,directStorageWrites:false,retry:false,
  releaseScope:'same controller/pool identity only; no global memory, VRAM, all-LOD upload or art acceptance claim',
  exactOnceBoundary:'Post-call lifecycle audit and pinned source Set iteration derived per-resource call counts; no independent per-UUID dispose listener or global close hook.',
  shaderCompileTime:{available:false,reason:'Pinned current snapshot exposes no shader compile duration; zero is never invented. Actual shader console errors and GL getError results recorded.'}};
const errorRow = (error,stage) => ({stage,name:error?.name||'',message:error?.message||String(error),stack:error?.stack||null});
function keep(error,stage) { const row=errorRow(error,stage); if (!record.firstError) record.firstError=row; else record.secondaryErrors.push(row);record.status='FAILED'; }
async function bounded(operation,ms,label) {
  let timer; try { return await Promise.race([Promise.resolve().then(operation),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label} exceeded ${ms} ms`)),Math.max(1,ms));})]); }
  finally { clearTimeout(timer); }
}
async function event(stage,data={}) {
  const row={at:new Date().toISOString(),stage,...data}; record.events.push(row);
  try { await bounded(()=>appendFile(resolve(output,'events.jsonl'),JSON.stringify(row)+'\n'),2000,'event diagnostic'); }
  catch(error) { record.diagnosticErrors.push(errorRow(error,'event diagnostic')); if(record.firstError)keep(error,'event diagnostic'); try{console.error(JSON.stringify(row));}catch{} }
}
let server,browser,context,page,video,owned=null,totalTimer,serverClosePromise=null;
const started = Date.now(), deadline = started+1200000, actionDeadline = deadline-30000;
record.startedAt=new Date(started).toISOString();record.budgetMs=1200000;record.cleanupReservationMs=30000;
const actionRemaining = cap => {const ms=Math.min(cap,actionDeadline-Date.now());assert.ok(ms>0,'fixed 20min case reserves last30s for owned cleanup');return ms;};
let controllerId=null,lastSequence=null; const auditBySequence=new Map(), responseJobs=[],runtimeErrors=[];
record.runtimeErrors=runtimeErrors;
function runtimeError(row) {
  runtimeErrors.push(row);const actual={stage:row.stage,name:row.name||'NativeRuntimeError',message:row.message||JSON.stringify(row),stack:row.stack||null};
  if(!record.firstError)record.firstError=actual;else record.secondaryErrors.push(actual);record.status='FAILED';
}
function beginOwnServerClose() {
  if(serverClosePromise)return serverClosePromise;if(!server?.listening)return Promise.resolve();
  serverClosePromise=new Promise((ok,reject)=>server.close(error=>error?reject(error):ok()));
  serverClosePromise.catch(()=>{});return serverClosePromise;
}
function interruptOwnServer() {
  void beginOwnServerClose().catch(error=>keep(error,'own server forced close'));
  try{server?.closeAllConnections();}catch(error){keep(error,'own server connections');}
}
function captureOwnedLaunch() {
  const browserProcess=browser._connection?.toImpl?.(browser)?.options?.browserProcess, child=browserProcess?.process;
  assert.ok(child&&Number.isInteger(child.pid)&&child.pid>0&&child.pid!==process.pid&&typeof browserProcess.kill==='function');
  owned={browserProcess,child,pid:child.pid,kill:()=>browserProcess.kill()};
  record.ownedLaunch={pid:child.pid,adapter:'pinned1.62.1 toImpl(browser).options.browserProcess',scope:'this actual launch child only'};
}
async function forceOwnedExit(cap,reason) {
  const begin=Date.now();let problem=null,confirmed=false;
  try {
    assert.ok(owned&&owned.browserProcess.process===owned.child&&owned.child.pid===owned.pid,'exact captured owner');
    if(owned.child.exitCode!==null||owned.child.signalCode!==null)confirmed=true;
    else {await bounded(()=>owned.kill(),Math.min(5000,Math.max(1,cap)),'owned kill');confirmed=owned.child.exitCode!==null||owned.child.signalCode!==null;assert.ok(confirmed,'actual launched child exit confirmation');}
  }catch(error){problem=errorRow(error,'owned forced exit');keep(error,'owned forced exit');}
  record.cleanup.push({operation:'owned forced exit',reason,pid:owned?.pid??null,elapsedMs:Date.now()-begin,confirmed,error:problem,exitCode:owned?.child.exitCode??null,signalCode:owned?.child.signalCode??null});
}
function collectAudit(bridge) {
  assert.equal(bridge.loadSource,'default-same-origin-sha256');assert.equal(bridge.disposed,false);
  if(controllerId===null){controllerId=bridge.controllerId;record.controllerId=controllerId;}
  assert.equal(bridge.controllerId,controllerId,'same actual controller');
  assert.equal(bridge.audit.eventLimit,64);
  const rows=bridge.audit.events;
  for(const row of rows){assert.equal(row.controllerId,controllerId);assert.ok(Number.isInteger(row.sequence)&&row.sequence>0);}
  if(lastSequence===null){lastSequence=rows.length?rows[0].sequence-1:bridge.audit.lastSequence;record.auditStart={firstRetainedSequence:rows[0]?.sequence??null,eventsDroppedBeforeObserver:bridge.audit.eventsDropped,priorHistoryNotClaimed:true};}
  for(const row of rows.filter(r=>r.sequence>lastSequence)) {
    assert.equal(row.sequence,lastSequence+1,'audit sequence gap: do not infer missing release history');
    lastSequence=row.sequence;auditBySequence.set(row.sequence,row);record.auditEvents.push(row);
    if(row.type==='pool-load-failed'||(row.type==='pool-settled'&&row.failed))throw new Error(`Actual C load failure: ${JSON.stringify(row)}`);
  }
  assert.equal(lastSequence,bridge.audit.lastSequence,'current audit tail fully collected');
  for(const p of [...bridge.pools,...bridge.pending])assert.ok(!p.failed&&!p.failure,`actual pool failure ${JSON.stringify(p)}`);
  for(const f of bridge.fleet)assert.ok(!f.failed&&!f.failure,`actual fleet attach failure ${JSON.stringify(f)}`);
}
async function read(stage) {
  const s=await bounded(()=>page.evaluate(()=>{const s=window.__NEON__.snapshot();return {ready:s.ready,started:s.started,paused:s.paused,settings:s.settings,position:s.position,camera:s.camera,inCar:s.inCar,simulationTime:s.simulationTime,teleportRevision:s.teleportRevision,presentation:s.presentation,streaming:s.streaming,renderer:s.renderer,timing:s.timing,city:{sample:{transit:s.city.sample.transit}}};}),actionRemaining(30000),'read-only actual snapshot');
  const b=s.city.sample.transit.authored;assert.ok(b,'actual sealed C bridge required');collectAudit(b);
  assert.equal(s.renderer.contextLost,false);assert.equal(s.settings.hour,16.5);assert.equal(s.settings.dayCycle,false);assert.equal(s.inCar,null);
  assert.deepEqual(runtimeErrors,[],'actual page/console/HTTP/response errors');
  if(stage)record.samples.push({stage,at:new Date().toISOString(),state:s});
  return s;
}
async function waitState(stage,cap,predicate) {
  const phaseDeadline=Date.now()+actionRemaining(cap);
  for(let n=0;n<7200;n++){
    assert.ok(Date.now()<phaseDeadline,`${stage} phase deadline`);const s=await read();
    if(predicate(s)){record.samples.push({stage,at:new Date().toISOString(),state:s});await event(stage,{simulationTime:s.simulationTime,revision:s.teleportRevision,auditTail:lastSequence});return s;}
    await new Promise(ok=>setTimeout(ok,100));
  }
  throw new Error(`${stage} bounded observation count exhausted`);
}
const transit=s=>s.city.sample.transit,bridge=s=>transit(s).authored;
function nativeImages(ownedStats) {
  assert.ok(ownedStats&&ownedStats.geometryCount>0&&ownedStats.textureCount>0&&ownedStats.imageCount>0);
  for(const [count,ids] of [['geometryCount','geometryUUIDs'],['templateMaterialCount','templateMaterialUUIDs'],['textureCount','textureUUIDs']])assert.equal(new Set(ownedStats[ids]).size,ownedStats[count]);
  assert.equal(ownedStats.images.length,ownedStats.imageCount);assert.equal(new Set(ownedStats.images.map(v=>v.id)).size,ownedStats.imageCount);
  for(const i of ownedStats.images){assert.equal(i.actualImageBitmap,true);assert.equal(i.cpuPlaceholder,false);assert.equal(i.hasClose,true);assert.ok(i.width>0&&i.height>0);}
}
async function settledHigh(stage,cap) {
  const s=await waitState(stage,cap,s=>s.started&&!s.paused&&!s.streaming?.preparing&&s.settings.quality==='high'&&bridge(s).pools.some(p=>p.kind===kind&&p.loaded&&p.settled&&!p.closed&&p.users>0)&&bridge(s).pending.length===0&&bridge(s).pools.every(p=>p.loaded&&p.settled&&!p.closed)&&bridge(s).fleet.some(f=>f.kind===kind&&f.authored));
  for(const p of bridge(s).pools)nativeImages(p.resourceStats);
  assert.equal(s.renderer.shadow.enabled,true);assert.equal(s.renderer.shadow.sunCastShadow,true);assert.equal(s.renderer.shadow.mapResident,true);
  const ao=s.renderer.contactOcclusion;assert.equal(ao.supported,true);assert.equal(ao.enabled,true);assert.equal(ao.quality,'high');assert.ok(ao.samples>0);assert.ok(ao.passes>=3);
  return s;
}
async function ordinaryFrames(stage,initial,quality) {
  return waitState(stage,90000,s=>s.started&&!s.paused&&s.settings.quality===quality&&s.teleportRevision===initial.teleportRevision&&s.simulationTime>initial.simulationTime&&s.presentation.elapsed>initial.presentation.elapsed);
}
async function faceActualPublicVehicle(stop) {
  const s=await waitState('actual-public-open-berth-no-boarding',180000,s=>!s.paused&&!!s.camera&&transit(s).vehicles.some(v=>v.kind===kind&&v.stopId===stop.id&&v.doorsOpen));
  const v=transit(s).vehicles.find(v=>v.kind===kind&&v.stopId===stop.id&&v.doorsOpen);assert.ok(v);
  const dx=v.x-s.camera.position.x,dz=v.z-s.camera.position.z,yaw=Math.atan2(dx,dz),pitch=.15;
  const delta=Math.atan2(Math.sin(yaw-s.camera.yaw),Math.cos(yaw-s.camera.yaw)),box=await page.locator('#game').boundingBox();assert.ok(box);
  const x=box.x+box.width*.82,y=box.y+box.height*.35;await page.mouse.move(x,y);await page.mouse.down();let first=null;
  try{await page.mouse.move(x-delta/(.005*s.settings.sensitivity),y+(pitch-s.camera.pitch)/(.003*s.settings.sensitivity));}
  catch(error){first=error;throw error;}
  finally{try{await bounded(()=>page.mouse.up(),actionRemaining(5000),'real pointer release');}catch(error){if(first){keep(first,'real camera input');keep(error,'pointer cleanup');}else throw error;}}
  const aimed=await waitState('actual-mouse-face-public-vehicle',15000,s=>!s.paused&&s.camera&&Math.abs(Math.atan2(Math.sin(s.camera.yaw-yaw),Math.cos(s.camera.yaw-yaw)))<.025&&Math.abs(s.camera.pitch-pitch)<.003);
  assert.equal(aimed.teleportRevision,s.teleportRevision);record.actualVehicleLook={id:v.id,kind:v.kind,publicStop:stop.id,vehiclePose:v,cameraBefore:s.camera,cameraAfter:aimed.camera,positionBefore:s.position,positionAfter:aimed.position,noBoarding:true};
  const submitted=await ordinaryFrames('actual-viewed-C-public-vehicle-rendered-frame',aimed,'high');
  const actor=bridge(submitted).fleet.find(f=>f.id===v.id);assert.ok(actor?.authored&&actor.poolGeneration>0,'actual viewed vehicle uses C owned pool');
  assert.equal(actor.visibleLod,0,'public close view actual C near tier');record.actualVehicleLook.afterSubmittedFrame={actor,renderer:submitted.renderer,presentation:submitted.presentation,simulationTime:submitted.simulationTime};
  return submitted;
}
async function publicQuality(quality) {
  await page.locator('#pause').click();await page.locator('[data-tab="settings"]').click();await page.locator('#quality').selectOption(quality);
  const paused=await read(`public-${quality}-selected-paused`);assert.equal(paused.paused,true);assert.equal(paused.settings.quality,quality);
  await page.locator('#resume').click();return ordinaryFrames(`actual-${quality}-ordinary-frames`,paused,quality);
}
async function graphics(stage,quality) {
  const s=await read(`${stage}-before-GL-query`);
  const actual=await bounded(()=>page.locator('#game').evaluate(canvas=>{const g=canvas.getContext('webgl2'),d=g.getExtension('WEBGL_debug_renderer_info');return {css:[innerWidth,innerHeight],drawing:[g.drawingBufferWidth,g.drawingBufferHeight],attributes:g.getContextAttributes(),renderer:g.getParameter(g.RENDERER),unmaskedRenderer:d?g.getParameter(d.UNMASKED_RENDERER_WEBGL):null,contextLost:g.isContextLost(),sampleBuffers:g.getParameter(g.SAMPLE_BUFFERS),samples:g.getParameter(g.SAMPLES),actualGetError:g.getError()};}),actionRemaining(30000),'native GL diagnostics');
  record.graphics||=[];record.graphics.push({stage,actual,snapshotRenderer:s.renderer,queryBoundary:'getError is an explicit native diagnostic which consumes GL error queue; no GL setters or fail injection'});
  assert.deepEqual(actual.css,[1280,800]);assert.equal(actual.contextLost,false);assert.equal(actual.actualGetError,0,'actual WebGL error query result');
  assert.equal(s.settings.quality,quality);if(quality==='high')assert.deepEqual(actual.drawing,[1280,800]);
  return {state:s,actual};
}
async function photo(stage) {
  const path=resolve(output,`${stage}.png`),before=await read(`${stage}-before`);
  await page.screenshot({path,timeout:actionRemaining(90000)});const after=await read(`${stage}-after`);
  assert.equal(after.teleportRevision,before.teleportRevision);record.photos.push({stage,file:`${stage}.png`,sha256:sha(await readFile(path)),before,after});await event(`photo-${stage}`);
}
function releasesFor(pool,baseline,allRows) {
  const rows=allRows.filter(e=>e.sequence>baseline&&e.poolGeneration===pool.generation&&e.kind===pool.kind);
  const closed=rows.filter(e=>e.type==='pool-close-requested'),shared=rows.filter(e=>e.type==='shared-released');
  assert.equal(closed.length,1,'this captured settled pool close exactly once');assert.equal(shared.length,1,'this captured settled pool shared post-call audit exactly once');
  const e=shared[0];assert.equal(e.reason,'cold-last-user-or-controller');assert.equal(e.activeInstancesAtRelease,0);assert.equal(e.allAuthoredInstancesDetached,true);
  assert.deepEqual(e.owned,pool.resourceStats,'original exact same pool resource identities');
  const r=e.rendererRelease;assert.equal(r.scope,'single synchronous authored pool disposal');assert.equal(r.available,true);assert.deepEqual(r.readErrors,[]);
  for(const key of ['geometries','textures']){assert.ok(Number.isInteger(r.before[key])&&Number.isInteger(r.after[key]));assert.equal(r.difference[key],r.before[key]-r.after[key]);assert.ok(r.difference[key]>=0);}
  assert.ok(r.difference.geometries<=Math.min(e.owned.geometryCount,r.before.geometries));assert.ok(r.difference.textures<=Math.min(e.owned.textureCount,r.before.textures));
  assert.equal(e.imageRelease.length,e.owned.imageCount);assert.equal(new Set(e.imageRelease.map(i=>i.id)).size,e.owned.imageCount);
  for(const before of e.owned.images){const image=e.imageRelease.find(i=>i.id===before.id);assert.ok(image);assert.equal(image.actualImageBitmap,true);assert.equal(image.cpuPlaceholder,false);assert.equal(image.closeCalled,true);assert.equal(image.widthAfter,0);assert.equal(image.heightAfter,0);}
  const perResource={geometry:e.owned.geometryUUIDs.map(id=>({id,sourceAuditedReleaseCallCount:1})),texture:e.owned.textureUUIDs.map(id=>({id,sourceAuditedReleaseCallCount:1})),templateMaterial:e.owned.templateMaterialUUIDs.map(id=>({id,sourceAuditedReleaseCallCount:1})),bitmap:e.imageRelease.map(i=>({id:i.id,postCallCloseRecordCount:1,widthAfter:i.widthAfter,heightAfter:i.heightAfter}))};
  return {kind:pool.kind,generation:pool.generation,closeEvent:closed[0],sharedEvent:e,perResource,independentDisposeListenerCountsAvailable:false,uploadedResourceUpperBounds:{geometries:Math.min(e.owned.geometryCount,r.before.geometries),textures:Math.min(e.owned.textureCount,r.before.textures),meaning:'same-pool unique owned identities and actual pre-release renderer counters bound possible uploaded resources; exact uploaded identity count is unavailable; unrendered tiers not claimed uploaded'}};
}
async function caseActions() {
  context=await browser.newContext({viewport,deviceScaleFactor:1,recordVideo:{dir:resolve(output,'video'),size:viewport}});page=await context.newPage();video=page.video();page.setDefaultTimeout(30000);page.setDefaultNavigationTimeout(90000);
  page.on('pageerror',error=>runtimeError(errorRow(error,'pageerror')));page.on('console',message=>{if(message.type()==='error')runtimeError({stage:'console',message:message.text()});});
  page.on('response',response=>{if(response.status()>=400)runtimeError({stage:'HTTP',status:response.status(),url:response.url()});let u;try{u=new URL(response.url());}catch{return;}const f=resources.files.find(f=>u.pathname==='/'+f.target);if(!f)return;const phase=record.responsePhase||'initial';responseJobs.push((async()=>{try{const bytes=await response.body(),row={phase,url:response.url(),status:response.status(),bytes:bytes.length,sha256:sha(bytes),expected:f};record.responses.push(row);assert.equal(row.status,200);assert.equal(row.bytes,f.bytes);assert.equal(row.sha256,f.sha256);}catch(error){runtimeError(errorRow(error,'authoritative C HTTP response'));}})());});
  await page.goto(`http://127.0.0.1:${port}/`);await page.waitForFunction(()=>window.__NEON__?.snapshot().ready&&!document.querySelector('#start').disabled,null,{timeout:actionRemaining(300000)});
  await page.locator('#welcome-settings').click();await page.locator('#quality').selectOption('high');await page.locator('#cycle').uncheck();assert.equal(Number(await page.locator('#time').inputValue()),16.5);await page.locator('#time').press('ArrowRight');await page.locator('#time').press('ArrowLeft');await page.locator('#resume').click();
  await page.locator('#welcome-sample').click();await page.locator('#sample-stops').waitFor({state:'visible'});
  const available=await bounded(()=>page.evaluate(()=>window.__NEON__.snapshot()),actionRemaining(30000),'public stop listing');const stop=transit(available).stops.find(s=>s.kind===kind);assert.ok(stop);
  const expectedStop={bus:'harbor-bus-courtyard',tram:'harbor-tram-lantern',ferry:'harbor-ferry-south'}[kind];assert.equal(stop.id,expectedStop);record.publicStop=stop;
  await page.locator(`[data-sample-stop="${stop.id}"]`).click();
  const high=await settledHigh('initial-high-all-current-pools-settled',300000), revision=high.teleportRevision;record.initialHigh=high;
  if(!high.settings.firstPerson)await page.keyboard.press('v');
  await waitState('public-V-current-rendered-first-person-camera',90000,s=>{const c=s.camera,point=p=>p&&['x','y','z'].every(k=>Number.isFinite(p[k]));return !s.paused&&s.settings.firstPerson&&c&&c.fov===65&&point(c.position)&&point(c.focus)&&Number.isFinite(c.yaw)&&Number.isFinite(c.pitch);});
  await faceActualPublicVehicle(stop);
  await ordinaryFrames('initial-high-real-ordinary-frames',high,'high');await graphics('01-high-loaded','high');await photo('01-high-loaded');
  const beforeLow=await read('before-low-same-pool-baseline');record.beforeLow=beforeLow;const poolBaseline=bridge(beforeLow).pools,instanceBaseline=bridge(beforeLow).fleet.filter(f=>f.authored),releaseBaseline=bridge(beforeLow).audit.lastSequence;
  for(const p of poolBaseline){assert.ok(p.loaded&&p.settled&&!p.closed&&p.users>0);nativeImages(p.resourceStats);}
  assert.ok(poolBaseline.some(p=>p.kind===kind));
  record.responsePhase='low';await publicQuality('low');
  const low=await waitState('low-all-C-owned-pools-and-instances-released',120000,s=>!s.paused&&s.settings.quality==='low'&&bridge(s).pools.length===0&&bridge(s).pending.length===0&&bridge(s).fleet.every(f=>!f.authored&&!f.wanted&&f.poolGeneration===null));
  assert.equal(low.teleportRevision,revision);assert.equal(low.renderer.shadow.enabled,false);assert.equal(low.renderer.contactOcclusion.enabled,false);assert.equal(low.renderer.contactOcclusion.samples,0);
  const rows=[...auditBySequence.values()];record.samePoolReleases=poolBaseline.map(p=>releasesFor(p,releaseBaseline,rows));
  const selectedRelease=record.samePoolReleases.find(r=>r.kind===kind);assert.ok(selectedRelease.sharedEvent.rendererRelease.difference.geometries>0,'selected kind actual uploaded geometry counter release must be observed');assert.ok(selectedRelease.sharedEvent.rendererRelease.difference.textures>0,'selected kind actual uploaded texture counter release must be observed');
  record.sameInstanceReleases=instanceBaseline.map(f=>{const matches=rows.filter(e=>e.sequence>releaseBaseline&&e.type==='instance-released'&&e.id===f.id&&e.poolGeneration===f.poolGeneration&&e.instanceGeneration===f.instanceGeneration);assert.equal(matches.length,1);assert.deepEqual(matches[0].instanceOwned,f.instanceResourceStats);assert.equal(new Set(matches[0].instanceOwned.materialUUIDs).size,matches[0].instanceOwned.materialCount);return {id:f.id,poolGeneration:f.poolGeneration,instanceGeneration:f.instanceGeneration,event:matches[0],sourceAuditedMaterialReleaseCounts:matches[0].instanceOwned.materialUUIDs.map(id=>({id,sourceAuditedReleaseCallCount:1}))};});
  await graphics('02-low-released','low');await photo('02-low-released');record.lowReleased=low;
  const restartBaseline=lastSequence;record.responsePhase='reloaded-high';await publicQuality('high');
  const returned=await settledHigh('high-new-generation-real-decode',300000);assert.equal(returned.teleportRevision,revision);const oldSelected=poolBaseline.find(p=>p.kind===kind),newSelected=bridge(returned).pools.find(p=>p.kind===kind);assert.ok(newSelected.generation>oldSelected.generation);
  for(const p of bridge(returned).pools){nativeImages(p.resourceStats);const old=poolBaseline.find(o=>o.kind===p.kind);if(old){assert.ok(p.generation>old.generation);for(const i of p.resourceStats.images)assert.ok(!old.resourceStats.images.some(o=>o.id===i.id),'new actual ImageBitmap identities');}}
  const newRows=[...auditBySequence.values()].filter(e=>e.sequence>restartBaseline&&e.poolGeneration===newSelected.generation&&e.kind===kind);
  for(const tier of [0,1,2])assert.equal(newRows.filter(e=>e.type==='pool-lod-decoded'&&e.tier===tier&&!e.closed).length,1,'three actual new-generation decoded tiers');
  assert.equal(newRows.filter(e=>e.type==='pool-ready').length,1);assert.equal(newRows.filter(e=>e.type==='pool-settled'&&!e.closed&&!e.failed).length,1);
  for(const f of bridge(returned).fleet.filter(f=>f.kind===kind&&f.authored)){assert.equal(f.poolGeneration,newSelected.generation);assert.ok(f.instanceGeneration>Math.max(0,...instanceBaseline.map(i=>i.instanceGeneration)));}
  await ordinaryFrames('restored-high-actual-rendered-frames',returned,'high');const restored=await graphics('03-high-reloaded','high');await photo('03-high-reloaded');record.highReloaded=returned;
  const initialAO=record.initialHigh.renderer.contactOcclusion,returnedAO=restored.state.renderer.contactOcclusion;assert.equal(returnedAO.enabled,true);assert.equal(returnedAO.supported,true);assert.equal(returnedAO.samples,initialAO.samples);assert.equal(returnedAO.technique,initialAO.technique);assert.deepEqual(returnedAO.sceneSize,initialAO.sceneSize);assert.equal(restored.state.renderer.shadow.enabled,true);assert.equal(restored.state.renderer.shadow.sunCastShadow,true);assert.equal(restored.state.renderer.shadow.mapResident,true);
  await bounded(()=>Promise.all(responseJobs),actionRemaining(30000),'actual C response evidence drain');assert.deepEqual(runtimeErrors,[]);
  for(const phase of ['initial','reloaded-high'])for(const f of expectedFiles)assert.ok(record.responses.some(r=>r.phase===phase&&r.expected.target===f.target&&r.sha256===f.sha256),'selected kind all3tier HTTP verified in each generation phase');
  const final=await read('final-live-high-no-late-failure');for(const r of record.samePoolReleases)assert.equal(record.auditEvents.filter(e=>e.sequence>releaseBaseline&&e.type==='shared-released'&&e.kind===r.kind&&e.poolGeneration===r.generation).length,1,'same old pool not released twice later');
  record.finalHigh=final;await event('same-pool-release-and-new-generation-complete',{releaseScope:record.releaseScope,independentDisposeListenerCountsAvailable:false,shaderCompileTime:record.shaderCompileTime});
}
try {
  totalTimer=setTimeout(()=>{keep(new Error('fixed20min total deadline including owned cleanup exceeded'),'total-deadline');if(owned)void forceOwnedExit(5000,'fixed total deadline').catch(error=>keep(error,'deadline owned cleanup'));interruptOwnServer();},1200000);
  server=await createStaticServer({root});await bounded(()=>new Promise((ok,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',ok);}),actionRemaining(15000),'server.listen');
  browser=await chromium.launch({headless:true,...(args['executable-path']?{executablePath:args['executable-path']}:{}),args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--enable-webgl'],timeout:actionRemaining(30000)});captureOwnedLaunch();assert.equal(browser.version(),browserVersion);
  record.actualBrowser={version:browser.version(),requestedExecutable:args['executable-path']||null,chromiumExecutablePathDefaultQuery:chromium.executablePath(),defaultQueryIsNotProofOfActualHeadlessLaunch:true,node:process.version,providerPackage:pwPackagePath,providerCoreBundle:pwBundlePath};
  const cmdline=await bounded(()=>readFile(`/proc/${owned.pid}/cmdline`),actionRemaining(5000),'actual launch proc cmdline');record.actualBrowser.proc={pid:owned.pid,exe:await bounded(()=>readlink(`/proc/${owned.pid}/exe`),actionRemaining(5000),'actual launch proc executable'),cmdline:cmdline.toString().split('\0').filter(Boolean),cmdlineSha256:sha(cmdline),source:'actual captured own child /proc, not default executable query'};
  await bounded(caseActions,actionRemaining(1170000),'ownership action deadline reserves cleanup');
}catch(error){keep(error,'ownership case');}
finally {
  const cleanupStarted=Date.now(),cleanupDeadline=Math.min(deadline,cleanupStarted+30000);record.cleanupStartedAt=new Date(cleanupStarted).toISOString();
  if(record.firstError)try{await bounded(()=>event('first-error-before-owned-closure',{firstError:record.firstError,secondaryErrors:record.secondaryErrors}),Math.max(1,Math.min(2000,cleanupDeadline-Date.now())),'first-error diagnostic');}catch(error){keep(error,'first-error diagnostic');}
  let browserCloseFailed=false;
  for(const [operation,close]of [['context.close',()=>context?.close()],['browser.close',()=>browser?.close()],['server.close',()=>beginOwnServerClose()]]){
    const begin=Date.now();let failure=null;
    const startedClose=operation==='server.close'?close():null; // Always stop this listener even when its wait budget was consumed.
    try{assert.ok(cleanupDeadline>Date.now(),'shared owned cleanup30/total remaining');await bounded(startedClose?()=>startedClose:close,cleanupDeadline-Date.now(),operation);}catch(error){failure=errorRow(error,operation);keep(error,operation);if(operation==='browser.close')browserCloseFailed=true;}
    record.cleanup.push({operation,sharedBudgetMs:30000,elapsedMs:Date.now()-begin,confirmed:!failure,error:failure});
    if(failure&&operation==='context.close')await forceOwnedExit(Math.max(1,Math.min(5000,cleanupDeadline-Date.now())),'context.close failure');
    if(failure&&operation==='server.close')interruptOwnServer();
  }
  if(owned&&(browserCloseFailed||(owned.child.exitCode===null&&owned.child.signalCode===null)))await forceOwnedExit(Math.max(1,Math.min(5000,cleanupDeadline-Date.now())),'unconfirmed owned child after closure');
  if(owned)record.actualChildExit={pid:owned.pid,confirmed:owned.child.exitCode!==null||owned.child.signalCode!==null,exitCode:owned.child.exitCode,signalCode:owned.child.signalCode};
  if(owned&&!record.actualChildExit.confirmed)keep(new Error('actual launched child exit remains unconfirmed'),'owned closure');
  record.closedAt=new Date().toISOString();record.elapsedThroughOwnedCloseMs=Date.now()-started;if(record.elapsedThroughOwnedCloseMs>1200000)keep(new Error('20min including owned closure exceeded'),'case-budget');
  if(video)try{const path=await bounded(()=>video.path(),2000,'final owned video.path'),bytes=await bounded(()=>readFile(path),2000,'raw video evidence read');record.video={path,bytes:bytes.length,sha256:sha(bytes)};}catch(error){keep(error,'video evidence');}
  try{const after={};await fingerprint(resolve(root,'src'),after);await fingerprint(resolve(root,'vendor'),after);for(const path of ['index.html','styles.css','favicon.svg'])after[path]=sha(await readFile(resolve(root,path)));assert.deepEqual(after,sourceFiles,'frozen source/vendor byte closure');assert.equal(sha(await readFile(resolve(root,'build-info.json'))),sha(buildBytes),'actual build-info unchanged');record.sourceHashesAfter=after;}catch(error){keep(error,'source closure');}
  record.shaderCompileErrors={source:'actual captured console/pageerror messages; shader errors identified from original message text, never duration/FPS inferred',rows:runtimeErrors.filter(e=>/shader|WebGLProgram|compile|LINK_STATUS|VALIDATE_STATUS/i.test(e.message||'')),allNativeRuntimeErrorCount:runtimeErrors.length};record.shaderCompileErrors.count=record.shaderCompileErrors.rows.length;
  if(record.diagnosticErrors.length&&!record.firstError)keep(new Error('host event diagnostics failed'),'diagnostics');record.status=record.firstError?'FAILED':'RECORDED_PENDING_MANUAL_REVIEW';record.finalElapsedMs=Date.now()-started;if(record.finalElapsedMs>1200000){keep(new Error('full case/evidence exceeded20min'),'final-budget');record.status='FAILED';}
  let caseBytes=null,caseFileWritten=false,caseFileSha256=null;
  try{caseBytes=Buffer.from(JSON.stringify(record,null,2)+'\n');await bounded(()=>writeFile(resolve(output,'case.json'),caseBytes,{flag:'wx'}),2000,'final case evidence');caseFileWritten=true;const actual=await bounded(()=>readFile(resolve(output,'case.json')),2000,'actual case evidence readback');assert.equal(sha(actual),sha(caseBytes));caseFileSha256=sha(actual);}catch(error){keep(error,'case evidence');}
  // A real late async error/deadline can arrive during evidence IO; it must never leave exit0.
  if(Date.now()>deadline)keep(new Error('evidence write crossed fixed20min deadline'),'post-write-budget');
  record.status=record.firstError?'FAILED':'RECORDED_PENDING_MANUAL_REVIEW';clearTimeout(totalTimer);
  const completion={status:record.status,caseId:record.caseId,toolSha256,caseFileWritten,caseFileSha256,attemptedCaseBytesSha256:caseBytes?sha(caseBytes):null,caseFileMayPrecedeLateFailure:true,firstError:record.firstError,secondaryErrors:record.secondaryErrors,runtimeErrors:record.runtimeErrors,actualChildExit:record.actualChildExit,closedAt:record.closedAt,finalElapsedMs:Date.now()-started,budgetMs:1200000};
  try{await bounded(()=>writeFile(resolve(output,'completion.json'),JSON.stringify(completion,null,2)+'\n',{flag:'wx'}),2000,'authoritative completion evidence');}catch(error){keep(error,'completion evidence');}
  if(Date.now()>deadline)keep(new Error('completion evidence crossed fixed20min deadline'),'completion-budget');
  record.status=record.firstError?'FAILED':'RECORDED_PENDING_MANUAL_REVIEW';
  if(record.firstError){const finalFailure={status:'FAILED',caseId:record.caseId,toolSha256,invalidatesAnyEarlierRecordedStatus:true,firstError:record.firstError,secondaryErrors:record.secondaryErrors,runtimeErrors:record.runtimeErrors,actualChildExit:record.actualChildExit,deadlineUTC:new Date(deadline).toISOString(),finalElapsedMs:Date.now()-started,budgetMs:1200000};try{await bounded(()=>writeFile(resolve(output,'late-failure.json'),JSON.stringify(finalFailure,null,2)+'\n',{flag:'wx'}),2000,'final failure supplement');}catch(error){keep(error,'final failure supplement');}}
  try{console.log(JSON.stringify({status:record.status,caseId:record.caseId,firstError:record.firstError,secondaryErrors:record.secondaryErrors,actualChildExit:record.actualChildExit,finalElapsedMs:Date.now()-started}));}catch{}
  if(record.firstError)process.exitCode=1;
}
