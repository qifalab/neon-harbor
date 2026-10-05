/** Prepared independent material inspection. Requires a new explicit GPU GO.
 * One public Atlas setup, real E/room door/WASD/Z, one close vice photograph,
 * then real exit. No debug coordinates, clock/storage writes, retries or faults.
 * This does not rerun or replace the separately archived resource suite.
 */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createStaticServer} from './server.mjs';
const projectRoot=fileURLToPath(new URL('..',import.meta.url));
const usage='node tools/capture-authored-workshop-vice-detail.mjs --gpu-go yes [--root dist] [--port 5208] --output NEW_EMPTY_DIR';
const options={};
for(let i=2;i<process.argv.length;i+=2){const flag=process.argv[i],value=process.argv[i+1];
 if(flag==='--help'){console.log(usage);process.exit(0);}
 assert.ok(['--gpu-go','--root','--port','--output'].includes(flag)&&value,usage);options[flag.slice(2)]=value;}
assert.equal(options['gpu-go'],'yes','Requires separate explicit parent GPU GO after resource suite closure and selective build review.');
assert.ok(options.output,'Use one new empty output directory; preserve all previous evidence.');
const root=resolve(projectRoot,options.root||'dist'),output=resolve(projectRoot,options.output),port=Number(options.port||5208);
assert.ok(Number.isInteger(port)&&port>0&&port<65536);
const sha=data=>createHash('sha256').update(data).digest('hex');
const manifestBytes=await readFile(resolve(root,'build-info.json')),manifest=JSON.parse(manifestBytes),sourceHashes={};
for(const [path,expected] of Object.entries(manifest.assets)){
 const served=await readFile(resolve(root,path)),source=await readFile(resolve(projectRoot,path));
 assert.equal(sha(served),expected,path);assert.equal(sha(source),expected,`Source/served mismatch: ${path}`);sourceHashes[path]=expected;}
const methodPaths=['tools/capture-authored-workshop-vice-detail.mjs','tools/server.mjs','tools/workshop-review-helpers/walking.js',
 'tools/workshop-review-helpers/occupied.js','tools/capture-workshop-pilot.mjs','package.json','package-lock.json'];
const methodHashes=Object.fromEntries(await Promise.all(methodPaths.map(async p=>[p,sha(await readFile(resolve(projectRoot,p)))])));
assert.equal(methodHashes['tools/capture-workshop-pilot.mjs'],'6bb5b9b574e22b2be5ebec977d3b4f1e56faab64e3ed11d5fb9ef47bc426f714','Derived functions use the independently reviewed resource method.');
await mkdir(output,{recursive:true});assert.deepEqual(await readdir(output),[],'Never overwrite existing native evidence.');
await writeFile(resolve(output,'build-info.json'),manifestBytes);
const viewport={width:1280,height:800};
const currentScenario={name:'authored-vice-detail',status:'running',events:[],captures:[],errors:[],teardownEvents:[]};
const record={status:'running',startedAt:new Date().toISOString(),root,viewport,deviceScaleFactor:1,
 sourceHashes,methodHashes,buildInfoSha256:sha(manifestBytes),buildRevision:manifest.revision,
 gitHead:execFileSync('git',['rev-parse','HEAD'],{cwd:projectRoot,encoding:'utf8'}).trim(),
 gitStatus:execFileSync('git',['status','--porcelain=v1'],{cwd:projectRoot,encoding:'utf8'}),browser:null,
 context:currentScenario,scope:'One independent close material inspection, not a resource regression or continuous city tour.',
 preparedPose:{x:180.35,y:.215,z:-113.32,axisToleranceMetres:.18,playerRadiusMetres:.65,playerHeightMetres:1.8,
  nominalEyeDistanceMetres:1.396855733,plannedRegionEyeDistanceMetres:[1.236839221,1.573388702],
  actualCameraEyeGuardMetres:[1.18,1.62],actualCameraEyeGuardBasis:'Wider native observation guard, not the CPU exact eye bound; actual render camera includes previous-fixed-step presentation interpolation',region:{minX:180.17,maxX:180.53,minZ:-113.50,maxZ:-113.14,groundY:.215},
  minimumPlayerClearanceMetres:.05,regionProofStatus:'INDEPENDENT_CPU_PROVEN_NOT_NATIVE_CAPTURE',
  regionProofHashes:{"neon-vice-safe-region-018-probe.log":"1bc5c84251b67f215e9233eaa22c623ab83fa5ec223bf2a002dffb714e9774a5","neon-vice-safe-region-018-probe.mjs":"bc1030967895f7619ed79e9af67668699acb7f10b0627920d4740164eb3a9740","neon-vice-safe-region-018-proof.json":"4c6bf8a24237ec7bec0d603cc490b924e9b59b5e283f842e70c0e2113b76321f","neon-vice-safe-region-018-provenance.json":"87916fdcbd90846dba18d610b5b88a9672bbe3a3f6440fc314e01e0c791dd901","neon-vice-safe-region-018-review.md":"1808cb6e42f6b1690c6f374f8cb4c11b26af97ffa81c6f7a81affb689e721953"}},
 limits:['Public Atlas is independent location setup, not a continuous route.',
 'Native High/static16.5, default sensitivity and first-person FOV are unchanged; actual pose/distance is recorded.',
 'No 0.5–1m centre-distance claim; existing bench/wall/player colliders require the proved safe-region eye-distance, recorded from the actual capture.',
 'This candidate contains an authored room around the unchanged vice; one vice frame cannot approve the whole workshop or harbour art.',
 'Owned Three disposal counts are not driver allocation bytes or a city-wide no-leak proof.',
 'Only the photographed vice GPU release is strictly required here; other owners may not have drawn in this one-view context, so actual GPU deltas are bounded by their exact CPU-owned resources and reported, never fabricated.'],
 budgetMinutes:20};
const persist=()=>writeFile(resolve(output,'metadata.json'),JSON.stringify(record,null,2)+'\n');
await persist();
let chromium,snapshot,walkAxis,faceRoom,server,browser,page,context,closing=false,primaryError=null,playableCompleted=false;
const deadline=Date.now()+20*60*1000;
const remaining=(limit=180000)=>{const result=Math.min(limit,deadline-Date.now());assert.ok(result>0,'Finite independent 20-minute inspection budget');return result;};
const turn=(page,yaw)=>faceRoom(page,yaw,{timeout:remaining(30000),settleTimeout:remaining(15000)});
const hardStop=setTimeout(()=>{record.hardDeadlineReached=true;browser?.close().catch(error=>{record.deadlineCloseError=String(error);});},20*60*1000);
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
  assert.equal(pilot.status, 'ready'); assert.equal(pilot.assetCount, 5); assert.equal(pilot.fallbackVisible, false);
  assert.deepEqual(pilot.errors, []);
  const sum = key => pilot.resources.reduce((total, resource) => total + resource[key], 0);
  assert.equal(sum('meshes'), 32); assert.equal(sum('triangles'), 51012); assert.equal(sum('geometries'), 32);
  assert.equal(sum('textures'), 16); assert.equal(sum('decodedTextures'), 16);
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
function errorEvidence(error) {
  const message = typeof error?.message === 'string' ? error.message : String(error);
  const stack = typeof error?.stack === 'string' ? error.stack : null;
  const marker = 'Walking diagnostics: ';
  const source = message.includes(marker) ? 'message' : stack?.includes(marker) ? 'stack' : null;
  const original = source === 'message' ? message : source === 'stack' ? stack : null;
  const raw = original === null ? null : original.slice(original.indexOf(marker) + marker.length);
  let parsed = null, parseError = null;
  if (raw !== null) {
    try { parsed = JSON.parse(raw); }
    catch (error) { parseError = error.stack || String(error); }
  }
  return { name: error?.name || null, message, stack, walkingDiagnosticsSource: source,
    walkingDiagnosticsRaw: raw, walkingDiagnostics: parsed, walkingDiagnosticsParseError: parseError };
}
function recordFailure(error) {
  const evidence = errorEvidence(error);
  record.failure = evidence.stack || evidence.message;
  record.failureMessage = evidence.message;
  record.failureStack = evidence.stack;
  record.primaryError = evidence;
}
function walkObservation(state) {
  return { position: { ...state.position }, cameraYaw: state.camera?.yaw ?? null,
    simulationTime: state.simulationTime, teleportRevision: state.teleportRevision,
    buildingId: state.city.interior.buildingId, floorId: state.city.interior.floorId,
    roomId: state.city.interior.currentRoomId };
}
async function walk(page, axis, target) {
  const attempt = { index: (record.walkAttempts?.length || 0) + 1, axis, target,
    toleranceMetres: .18, precision: true, startedAt: new Date().toISOString(), result: 'running',
    effectiveBudget: { wholeCaseDeadlineAt: new Date(deadline).toISOString(),
      remainingMsAtStart: Math.max(0, deadline - Date.now()), walkTimeoutMs: null } };
  (record.walkAttempts ||= []).push(attempt);
  let firstError = null, after;
  try {
    // Same original cardinal turn and helper inputs; no extra motion or recovery.
    await turn(page, Math.PI);
    let before;
    try { before = await snapshot(page); attempt.before = walkObservation(before); }
    catch (error) { attempt.beforeSnapshotError = errorEvidence(error); throw error; }
    attempt.effectiveBudget.walkTimeoutMs = remaining(120000);
    await walkAxis(page, axis, target, { precision: true, tolerance: .18,
      timeout: attempt.effectiveBudget.walkTimeoutMs });
    after = await event(page, 'physical-WASD-Z', { axis, target, from: before.position });
    assert.equal(after.teleportRevision, before.teleportRevision, 'Physical approach cannot teleport');
  } catch (error) {
    firstError = error;
  } finally {
    // This cold diagnostic runs once after each original helper call. A later
    // snapshot or metadata I/O error cannot replace its first movement error.
    try { attempt.actualAfter = walkObservation(await snapshot(page)); }
    catch (error) { attempt.afterSnapshotError = errorEvidence(error); if (!firstError) firstError = error; }
    attempt.effectiveBudget.remainingMsAfter = Math.max(0, deadline - Date.now());
    attempt.completedAt = new Date().toISOString();
    attempt.result = firstError ? 'failed' : 'passed';
    attempt.firstError = firstError ? errorEvidence(firstError) : null;
    try { await persist(); }
    catch (error) {
      attempt.persistenceError = errorEvidence(error);
      if (!firstError) firstError = error;
      attempt.result = 'failed'; attempt.firstError = errorEvidence(firstError);
    }
  }
  if (firstError) throw firstError;
  return after;
}
function assertPreparedRegion(state) {
  const { region } = record.preparedPose, p = state.position;
  assert.ok(p.x >= region.minX && p.x <= region.maxX && p.z >= region.minZ && p.z <= region.maxZ,
    'Actual player must remain inside the complete independently proved safe rectangle');
  assert.ok(Math.abs(p.y - region.groundY) <= .005, 'Safe region is on the actual lobby ground floor');
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
  const before = await snapshot(page); assertSettings(before); assertPreparedRegion(before); if (requireReady) assertReady(before);
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
  const after = await snapshot(page); assertPreparedRegion(after); assert.deepEqual(after.position, before.position);
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

const authoredResourceOwners = Object.freeze({
 bench_vice_01:{geometries:4,textures:3},metal_tool_chest:{geometries:7,textures:3},
 metal_office_desk:{geometries:9,textures:3},wooden_bookshelf_worn:{geometries:1,textures:3},
 'workshop-fittings':{geometries:11,textures:4},
});
function verifyActualRelease(state){
 const released=state.city.interior.workshopPilotEvents.filter(e=>e.kind==='asset-released');
 assert.deepEqual(released.map(e=>e.assetId).sort(),Object.keys(authoredResourceOwners).sort());
 for(const e of released){const r=e.rendererRelease,vice=e.assetId==='bench_vice_01',expected=authoredResourceOwners[e.assetId];
  assert.equal(r.scope,'single synchronous asset disposal');assert.equal(r.available,true);assert.deepEqual(r.readErrors,[]);
  assert.equal(r.attachedAtRelease,true);assert.equal(e.resourceRelease.geometries,expected.geometries);
  assert.equal(e.resourceRelease.textures,expected.textures);assert.equal(e.resourceRelease.closedImages,expected.textures);
  assert.equal(e.resourceRelease.boneTextures,vice?1:0);
  if(vice)assert.deepEqual(r.difference,{geometries:4,textures:4},'The actual photographed vice must release its uploaded resources');
  else {
   assert.ok(Number.isInteger(r.difference.geometries)&&r.difference.geometries>=0&&r.difference.geometries<=expected.geometries);
   assert.ok(Number.isInteger(r.difference.textures)&&r.difference.textures>=0&&r.difference.textures<=expected.textures);
  }
 }
 return released;
}
async function preserveFailure(error){
 record.status='failed';recordFailure(error);currentScenario.status='failed';await persist();
 try{record.failureSnapshot=await snapshot(page);}catch(captureError){record.failureSnapshotError=captureError.stack||String(captureError);}
 record.failureImageAttempt={file:'vice-detail-failure-original.png',startedAt:new Date().toISOString(),timeoutMs:30000};await persist();
 try{await page.screenshot({path:resolve(output,record.failureImageAttempt.file),timeout:30000});record.failureImageAttempt.status='captured';
  record.failureImageAttempt.sha256=sha(await readFile(resolve(output,record.failureImageAttempt.file)));}
 catch(captureError){record.failureImageAttempt.status='failed';record.failureImageAttempt.error=captureError.stack||String(captureError);}
 record.failureImageAttempt.completedAt=new Date().toISOString();await persist();
}
try{
 [{chromium},{snapshot,walkAxis},{faceRoom}]=await Promise.all([import('@playwright/test'),import('./workshop-review-helpers/walking.js'),import('./workshop-review-helpers/occupied.js')]);
 server=await createStaticServer({root});await new Promise((done,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',done);});
 browser=await chromium.launch({headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 record.browser={version:browser.version(),node:process.version,backend:'Actual GL renderer recorded at native photograph'};
 assert.equal(browser.version(),'151.0.7922.34');
 context=await browser.newContext({viewport,deviceScaleFactor:1});page=await context.newPage();
 page.on('pageerror',error=>currentScenario.errors.push({type:'pageerror',message:error.message}));
 page.on('console',message=>{if(message.type()==='error')currentScenario.errors.push({type:'console',message:message.text(),url:message.location().url});});
 page.on('response',response=>{if(response.status()>=400)currentScenario.errors.push({type:'http',status:response.status(),url:response.url()});});
 page.on('requestfailed',request=>{const item={type:'requestfailed',url:request.url(),message:request.failure()?.errorText||''};
  if(closing&&/ERR_ABORTED|aborted/i.test(item.message))currentScenario.teardownEvents.push(item);else currentScenario.errors.push(item);});
 await boot(page);await enterWorkshop(page);await waitReady(page);
 // Native cardinal movement: east bypass, then safe northern side of bench.
 await walk(page,'x',182.8);await walk(page,'z',-115);await walk(page,'z',-113.32);await walk(page,'x',180.35);
 let state=await snapshot(page);assertPreparedRegion(state);
 const bounds=assertReady(state).bounds.find(b=>b.id==='bench_vice_01');
 const target=Object.fromEntries(['x','y','z'].map((axis,i)=>[axis,(bounds.min[i]+bounds.max[i])/2]));
 await aim(page,target);await capture(page,'north-side-detail',{target});
 state=await event(page,'actual-safe-north-side-vice-observation',{target,plannedPose:record.preparedPose});
 assert.equal(state.city.interior.workshopPilot.boneTextureCount,1);
 const actualEyeDistance=Math.hypot(target.x-state.camera.position.x,target.y-state.camera.position.y,target.z-state.camera.position.z);
 const [minEye,maxEye]=record.preparedPose.actualCameraEyeGuardMetres;
 assert.ok(actualEyeDistance>minEye&&actualEyeDistance<maxEye,'Actual camera eye distance in the proved player region is recorded, not fabricated');
 record.actualEyeDistanceMetres=actualEyeDistance;
 // Reverse side path first; never cross the bench or alter its collider.
 await walk(page,'x',182.8);await walk(page,'z',-115);await walk(page,'x',200);
 const exit=(await snapshot(page)).city.interior.entrance;await walk(page,'z',exit.z);
 assert.ok((await page.locator('#interaction').textContent()).includes('返回街道'));
 await page.keyboard.press('e');await page.waitForFunction(()=>!window.__NEON__.snapshot().city.interior.buildingId,null,{timeout:remaining()});
 state=await event(page,'real-E-street-exit');assert.equal(state.city.interior.workshopPilot,null);
 assert.deepEqual(state.city.exterior,{southInteriorId:null,harborInteriorId:null});
 record.actualExitReleaseEvents=verifyActualRelease(state);record.finalOutsideSnapshot=state;
 assert.deepEqual(currentScenario.errors,[],'No page/shader/HTTP/request errors in this standalone detail context');
 for(const [path,expected] of Object.entries(sourceHashes)){assert.equal(sha(await readFile(resolve(projectRoot,path))),expected,`Source frozen: ${path}`);assert.equal(sha(await readFile(resolve(root,path))),expected,`Served frozen: ${path}`);}
 for(const [path,expected] of Object.entries(methodHashes))assert.equal(sha(await readFile(resolve(projectRoot,path))),expected,`Method frozen: ${path}`);
 assert.equal(sha(await readFile(resolve(root,'build-info.json'))),record.buildInfoSha256);
 assert.ok(!record.hardDeadlineReached&&Date.now()<deadline);
 playableCompleted=true;record.playableCompletedAt=new Date().toISOString();await persist();
}catch(error){
 primaryError=error;record.status='failed';recordFailure(error);currentScenario.status='failed';
 try{if(page&&snapshot)await preserveFailure(error);else{record.failureCaptureUnavailable='No live page';await persist();}}
 catch(preservationError){record.failurePreservationError=preservationError.stack||String(preservationError);}
}finally{
 // Keep the hard timer active through finalization. Every owned close is bounded
 // by both its own cap and the remaining whole-case budget; later errors never
 // replace the original playable/capture failure.
 closing=true;record.cleanup=[];
 const boundedClose=async(label,operation,capMs)=>{
  const item={label,startedAt:new Date().toISOString(),timeoutMs:Math.max(1,Math.min(capMs,deadline-Date.now()))};
  let timer;
  try{await Promise.race([Promise.resolve().then(operation),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label} cleanup exceeded ${item.timeoutMs}ms`)),item.timeoutMs);})]);item.status='closed';}
  catch(cleanupError){item.status='failed';item.error=cleanupError.stack||String(cleanupError);}
  finally{clearTimeout(timer);item.completedAt=new Date().toISOString();record.cleanup.push(item);}
 };
 if(context)await boundedClose('browser-context',()=>context.close(),10000);
 if(browser)await boundedClose('browser',()=>browser.close(),30000);
 if(server)await boundedClose('server',()=>new Promise((done,reject)=>server.close(error=>error?reject(error):done())),5000);
 record.errorsAfterFinalization=currentScenario.errors.map(error=>({...error}));
 record.finalizationCompletedAt=new Date().toISOString();
 record.caseBudget={deadlineAt:new Date(deadline).toISOString(),finishedBeforeDeadline:Date.now()<deadline,hardDeadlineReached:!!record.hardDeadlineReached};
 const finalizationErrors=[];
 if(record.cleanup.some(item=>item.status!=='closed'))finalizationErrors.push('One or more owned cleanup operations failed; raw errors are preserved in cleanup.');
 if(record.deadlineCloseError)finalizationErrors.push(`Hard-deadline browser close failed: ${record.deadlineCloseError}`);
 if(currentScenario.errors.length)finalizationErrors.push('Unexpected errors arrived before or during teardown; preserved in errorsAfterFinalization.');
 if(record.hardDeadlineReached||Date.now()>=deadline)finalizationErrors.push('Complete case, including finalization, exceeded the 20-minute budget.');
 if(!playableCompleted)finalizationErrors.push('Playable inspection did not complete.');
 record.finalizationErrors=finalizationErrors;
 if(finalizationErrors.length&&!primaryError)primaryError=new Error(finalizationErrors.join(' '));
 if(primaryError){record.status='failed';currentScenario.status='failed';recordFailure(primaryError);}
 else{record.status='passed';currentScenario.status='passed';record.completedAt=new Date().toISOString();}
 try{await persist();}catch(persistenceError){if(!primaryError)primaryError=persistenceError;record.status='failed';currentScenario.status='failed';recordFailure(primaryError);delete record.completedAt;record.finalMetadataWriteError=persistenceError.stack||String(persistenceError);}
 // Include the final metadata write and any late protocol events in acceptance.
 // The hard timer remains armed until this check has completed.
 if(primaryError||record.hardDeadlineReached||Date.now()>=deadline||currentScenario.errors.length){
  if(!primaryError)primaryError=new Error('Late unexpected error or whole-case deadline reached during final metadata persistence.');
  record.status='failed';currentScenario.status='failed';recordFailure(primaryError);delete record.completedAt;
  record.errorsAfterFinalization=currentScenario.errors.map(error=>({...error}));
  record.caseBudget.finishedBeforeDeadline=Date.now()<deadline;record.caseBudget.hardDeadlineReached=!!record.hardDeadlineReached;
  try{await persist();}catch(persistenceError){record.finalMetadataWriteError=persistenceError.stack||String(persistenceError);}
 }
 clearTimeout(hardStop);
}
if(primaryError)throw primaryError;
