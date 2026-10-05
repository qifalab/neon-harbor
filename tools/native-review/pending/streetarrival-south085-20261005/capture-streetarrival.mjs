import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, readdir, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStaticServer } from './server.mjs';
import { snapshot, errorRecord, createInput } from './input.mjs';
import { currentRenderedCamera, phaseTimeout } from './render-readiness.mjs';
const methodRoot=dirname(fileURLToPath(import.meta.url)),options={};
for(let i=2;i<process.argv.length;i+=2){const [flag,value]=process.argv.slice(i,i+2);assert.ok(['--mode','--output','--gpu-go','--port','--reference','--reference-sha256'].includes(flag)&&value);options[flag.slice(2)]=value;}
assert.ok(['before','candidate'].includes(options.mode));assert.equal(options['gpu-go'],'yes');assert.ok(options.output);assert.ok(!process.env.CHROMIUM_PATH);
const projectRoot=await realpath(process.cwd()),root=await realpath(resolve(projectRoot,'dist')),output=resolve(options.output),port=Number(options.port||5240);
assert.equal(port,5240);await mkdir(output,{recursive:true});assert.ok(relative(projectRoot,await realpath(output)).startsWith('..'));assert.deepEqual(await readdir(output),[]);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),hour=16.5,caseMinutes=20;
const binding=JSON.parse(await readFile(resolve(methodRoot,'source-runtime-bindings.json'),'utf8')),bound=binding.roles[options.mode],plan=JSON.parse(await readFile(resolve(methodRoot,'streetarrival-plan.json'),'utf8'));assert.ok(bound,'Future candidate must be explicitly bound after its actual build');assert.equal(projectRoot,bound.root);
let reference=null;if(options.mode==='candidate'){assert.ok(options.reference&&/^[a-f0-9]{64}$/.test(options['reference-sha256']));const bytes=await readFile(resolve(options.reference));assert.equal(sha(bytes),options['reference-sha256']);reference=JSON.parse(bytes);assert.equal(reference.mode,'before');assert.equal(reference.status,'capture-complete-art-review-pending');assert.equal(reference.primaryError,null);assert.equal(reference.freezeUnchanged,true);assert.equal(reference.finishedBeforeDeadline,true);assert.equal(reference.captures.length,2);assert.equal(reference.actualBuildInfoSHA256,binding.roles.before.buildInfo.sha256);assert.deepEqual(reference.errors,[]);assert.equal(reference.ownedBrowserClose.boundedCloseAccepted,true);}else assert.ok(!options.reference&&!options['reference-sha256']);
const record={status:'running',case:'south085-streetarrival-two-originals-real-entry-exit',mode:options.mode,startedAt:new Date().toISOString(),projectRoot,servedRoot:root,methodRoot,runnerPid:process.pid,actualBuildRevision:bound.revision,actualBuildInfoSHA256:bound.buildInfo.sha256,hour,viewport:plan.viewport,deviceScaleFactor:1,fov:65,wholeCaseBudgetMinutes:caseMinutes,previewUncommitted:bound.uncommittedPreview,publicSetups:[],captures:[],inputs:[],events:[],errors:[],teardownEvents:[],cleanup:[],secondaryErrors:[],directGameStateWrites:0,directClockWrites:0,directStorageWrites:0,retry:false,noImagePostProcessing:true,published:false,elevatorExecuted:false,elevatorAccepted:false,artAcceptance:'PENDING_ROOT_AND_INDEPENDENT_ORIGINAL_PIXELS',limitations:['Public Atlas setup is a product teleport, not a no-teleport continuous life route.','Only two unchanged High1280x800 PNGs: north-east storefront bay and diagonal north/east view, both after real E entry and E exit.','Owner binding and actual outdoor root visibility plus interior floor/collider counters are observed; no claim of individual shell matrix telemetry not exported by the game.','No seed/reset/world-clock/storage writes. Fixed hour and dayCycle=false are set with public settings; simulation and traffic continue.','No whole street/high-harbour/AAA/hardware/elevator acceptance follows from capture completion.'],reference:reference?{path:resolve(options.reference),sha256:options['reference-sha256']}:null};
async function ownedBrowserIdentity(pid) {
 try {
  const text=await readFile(`/proc/${pid}/stat`,'utf8'),fields=text.slice(text.lastIndexOf(')')+2).trim().split(/\s+/);
  return {pid,state:fields[0],ppid:Number(fields[1]),startTicks:fields[19]};
 } catch(error) {if(error.code==='ENOENT')return null;throw error;}
}
function classifyOwnedBrowserClose({before,current,apiClose,exitCode,signalCode,callerForceInvoked,hardDeadlineReached}) {
 const knownIdentity=Number.isInteger(before?.pid)&&typeof before?.startTicks==='string';
 const exactIdentityStillPresent=Boolean(current&&current.pid===before?.pid&&current.startTicks===before?.startTicks);
 const observedExit=exitCode!==null&&exitCode!==undefined||signalCode!==null&&signalCode!==undefined;
 const identityReadConfirmed=current!==undefined;
 const exactOwnedClosureConfirmed=knownIdentity&&identityReadConfirmed&&!exactIdentityStillPresent&&observedExit;
 const apiCloseResolved=apiClose?.status==='closed',forcedExit=signalCode==='SIGKILL';
 const exitModeEligible=exitCode===0&&!signalCode||signalCode==='SIGKILL';
 const withinOuterCap=Number.isFinite(apiClose?.elapsedMs)&&Number.isFinite(apiClose?.timeoutMs)&&apiClose.elapsedMs<=apiClose.timeoutMs;
 return {before,current,apiCloseResolved,outerCapMs:35000,providerDefaultInnerCloseMs:30000,
  apiCloseElapsedMs:apiClose?.elapsedMs??null,exitCode,signalCode,forcedExit,
  graceful:apiCloseResolved&&exactOwnedClosureConfirmed&&exitCode===0&&!signalCode,
  forceAttribution:forcedExit&&apiCloseResolved&&!callerForceInvoked&&!hardDeadlineReached?'supported-API-close-resolved-SIGKILL-provider-fallback-consistent':'none-or-not-eligible',
  providerInternalBranchIndependentlyObserved:false,callerForceInvoked:Boolean(callerForceInvoked),
  hardDeadlineReached:Boolean(hardDeadlineReached),identityReadConfirmed,exactOwnedClosureConfirmed,exitModeEligible,withinOuterCap,
  boundedCloseAccepted:apiCloseResolved&&exactOwnedClosureConfirmed&&exitModeEligible&&withinOuterCap&&!callerForceInvoked&&!hardDeadlineReached};
}
const persist = () => writeFile(resolve(output, 'metadata.json'), JSON.stringify(record, null, 2) + '\n');
const deadline = Date.now() + caseMinutes * 60000;
const remaining = (cap = 180000) => { const ms = Math.min(cap, deadline - Date.now()); assert.ok(ms > 0, 'Whole case deadline'); return ms; };
let server, browserServer, browserProcess, browserOwnerIdentity, browser, context, page, input, primaryError = null, closing = false, playableComplete = false;
const hardStop = setTimeout(() => { record.hardDeadlineReached = true;
  browserServer?.kill().catch(error => record.secondaryErrors.push({ stage: 'hard-deadline-owned-browser-kill', ...errorRecord(error) }));
  server?.closeAllConnections();
}, caseMinutes * 60000);
const diagnostic=s=>({ready:s.ready,health:s.health,started:s.started,paused:s.paused,settings:s.settings,position:s.position,camera:s.camera,inCar:s.inCar,simulationTime:s.simulationTime,teleportRevision:s.teleportRevision,presentation:s.presentation,streaming:s.streaming,renderer:s.renderer,interior:s.city.interior,exterior:s.city.exterior,renderVisibility:s.city.renderVisibility,transitRiding:s.city.transit.riding,sampleTransitRiding:s.city.sample.transit.riding,streetLighting:s.city.streetLighting});
const excludedFolders=new Set(['.git','node_modules','dist','__pycache__','test-results','playwright-report','multiplayer-test-results','multiplayer-playwright-report']);
async function physicalFiles(directory,prefix='',exclude=true){const out=[];for(const item of await readdir(directory,{withFileTypes:true})){if(exclude&&excludedFolders.has(item.name))continue;assert.ok(!item.isSymbolicLink(),'No symlink in frozen source');const name=prefix+item.name;if(item.isDirectory())out.push(...await physicalFiles(resolve(directory,item.name),name+'/',exclude));else if(item.isFile())out.push(name);}return out.sort();}
async function fingerprints(){
 const bytes=await readFile(resolve(root,'build-info.json')),manifest=JSON.parse(bytes);assert.equal(manifest.version,'0.8.0');assert.equal(sha(bytes),bound.buildInfo.sha256);assert.equal(manifest.revision,bound.revision);assert.deepEqual(manifest.assets,bound.assets);
 assert.deepEqual(await physicalFiles(projectRoot),Object.keys(bound.sourceInputs).sort(),'Exact physical source set including any new files');assert.deepEqual(await physicalFiles(root,'',false),[...Object.keys(bound.assets),'build-info.json'].sort(),'Exact served runtime set');const source={};for(const[p,h]of Object.entries(bound.sourceInputs)){assert.equal(sha(await readFile(resolve(projectRoot,p))),h,'Pinned materialized source '+p);source[p]=h;}
 const assets={};for(const[p,h]of Object.entries(manifest.assets)){assert.ok(!isAbsolute(p)&&!p.split('/').includes('..'));assert.equal(sha(await readFile(resolve(root,p))),h,'Actual served '+p);assert.equal(sha(await readFile(resolve(projectRoot,p))),h,'Source runtime '+p);assets[p]=h;}
 const methods={};const seal=JSON.parse(await readFile(resolve(methodRoot,'METHOD-SEAL.json'),'utf8'));for(const[p,pin]of Object.entries(seal.files)){const bytes=await readFile(resolve(methodRoot,p));assert.equal(bytes.length,pin.bytes);assert.equal(sha(bytes),pin.sha256);methods[p]=pin.sha256;}
 return {buildInfoSha256:sha(bytes),hashes:assets,source,methods,assetCount:Object.keys(assets).length,materializedSourceCount:Object.keys(source).length};
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
function assertSettings(s){assert.equal(s.started,true);assert.equal(s.paused,false);assert.equal(s.health,100);assert.equal(s.settings.quality,'high');assert.equal(s.settings.hour,16.5);assert.equal(s.settings.dayCycle,false);assert.equal(s.settings.sensitivity,1);assert.equal(s.settings.firstPerson,true);assert.equal(s.camera.fov,65);assert.equal(s.inCar,null);assert.ok(!s.city.transit.riding&&!s.city.sample.transit.riding);assert.equal(s.streaming.failed,0);assert.equal(s.renderer.contextLost,false);assert.equal(s.renderer.shadow.enabled,true);assert.equal(s.renderer.contactOcclusion.enabled,true);assert.equal(s.renderer.contactOcclusion.fallback,null);}
const angular=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
function exteriorGuard(s){assertSettings(s);assert.ok(!s.city.interior.buildingId);assert.equal(s.city.exterior.southInteriorId,null);assert.equal(s.city.renderVisibility.outdoor,true);assert.ok(currentRenderedCamera({expectedRevision:s.teleportRevision,state:s}));}
async function photo(prepared,index){
 await input.face(prepared.yaw,prepared.pitch);await page.waitForFunction(()=>{const s=window.__NEON__.snapshot();return !s.streaming.preparing&&!s.streaming.pending&&!document.querySelector('#toasts .toast');},null,{polling:'raf',timeout:remaining(120000)});
 const before=await event('original-photo-ready-'+prepared.label);exteriorGuard(before);assert.ok(Math.hypot(before.position.x-prepared.position.x,before.position.z-prepared.position.z)<.15);assert.ok(Math.abs(before.position.y-prepared.position.y)<.03);assert.ok(Math.abs(angular(before.camera.yaw,prepared.yaw))<.004&&Math.abs(before.camera.pitch-prepared.pitch)<.004);
 if(reference){const old=reference.captures[index];assert.equal(old.label,prepared.label);const delta={x:before.position.x-old.position.x,y:before.position.y-old.position.y,z:before.position.z-old.position.z};assert.ok(Math.hypot(delta.x,delta.z)<.15&&Math.abs(delta.y)<.03);assert.ok(Math.hypot(before.camera.position.x-old.camera.position.x,before.camera.position.z-old.camera.position.z)<.15&&Math.abs(before.camera.position.y-old.camera.position.y)<.03);assert.ok(Math.abs(angular(before.camera.yaw,old.camera.yaw))<.004&&Math.abs(before.camera.pitch-old.camera.pitch)<.004);record.events.push({kind:'actual-before-candidate-photo-comparison',label:prepared.label,bodyDelta:delta,cameraBefore:old.camera,cameraCandidate:before.camera});}
 const pixels=await page.locator('#game').evaluate(canvas=>{const gl=canvas.getContext('webgl2');return {width:gl.drawingBufferWidth,height:gl.drawingBufferHeight,lost:gl.isContextLost(),error:gl.getError(),dpr:devicePixelRatio};});assert.deepEqual(pixels,{width:1280,height:800,lost:false,error:0,dpr:1});
 const image=prepared.label+'-high.png',pose=prepared.label+'-pose.json';await page.screenshot({path:resolve(output,image),timeout:remaining(120000)});const after=await snapshot(page);exteriorGuard(after);assert.deepEqual(after.position,before.position);assert.equal(after.teleportRevision,before.teleportRevision);assert.ok(Math.abs(angular(after.camera.yaw,before.camera.yaw))<.004&&Math.abs(after.camera.pitch-before.camera.pitch)<.004);await writeFile(resolve(output,pose),JSON.stringify({before:diagnostic(before),after:diagnostic(after),pixels},null,2)+'\n');record.captures.push({label:prepared.label,image,pose,imageSha256:sha(await readFile(resolve(output,image))),poseSha256:sha(await readFile(resolve(output,pose))),position:before.position,camera:before.camera,pixels});await persist();
}
async function boot(){
 await page.goto(`http://127.0.0.1:${port}/`,{timeout:remaining(180000)});await page.waitForFunction(()=>window.__NEON__?.snapshot().ready&&!document.getElementById('start').disabled,null,{polling:'raf',timeout:remaining(180000)});
 const fresh=await snapshot(page);assert.equal(fresh.started,false);assert.equal(fresh.settings.quality,'high');assert.equal(fresh.settings.hour,16.5);await page.locator('#welcome-settings').click({timeout:remaining(60000)});await page.locator('#quality').selectOption('high');await page.locator('#cycle').uncheck();await page.locator('#volume').press('Home');await page.locator('#resume').click({timeout:remaining(60000)});
 const before=await snapshot(page),building=before.city.buildings.find(b=>b.id==='south-085');assert.ok(building);record.actualBuilding=building;await page.locator('#welcome-explore').click({timeout:remaining(60000)});await page.locator('#atlas-search').fill(building.englishName);await page.locator('[data-visit-building="south-085"]').click({timeout:remaining(60000)});await page.waitForFunction(()=>{const s=window.__NEON__.snapshot(),b=s.city.buildings.find(b=>b.id==='south-085');return s.started&&!s.paused&&!s.streaming.preparing&&!s.streaming.pending&&!s.city.interior.buildingId&&Math.hypot(s.position.x-b.entrance.x,s.position.z-b.entrance.z)<.1;},null,{polling:'raf',timeout:remaining(180000)});await page.locator('#game').focus();if(!(await snapshot(page)).settings.firstPerson)await page.keyboard.press('v');await page.waitForFunction(()=>window.__NEON__.snapshot().settings.firstPerson,null,{polling:'raf',timeout:remaining(60000)});record.publicSetups.push({selector:'[data-visit-building="south-085"]',before:diagnostic(before),after:diagnostic(await event('public-Atlas-entry-setup'))});await persist();
}
async function streetarrival(){
 const initial=await snapshot(page);exteriorGuard(initial);assert.equal(record.publicSetups.length,1);
 record.entryBefore=diagnostic(await snapshot(page));record.entryPublicPrompt=await page.locator('#interaction span').innerText();await page.keyboard.press('e');await page.waitForFunction(()=>{const s=window.__NEON__.snapshot();return s.city.interior.buildingId==='south-085'&&!s.city.interior.moving&&!s.paused&&s.city.exterior.southInteriorId==='south-085'&&!s.city.renderVisibility.outdoor&&Math.abs(s.position.y-.215)<.003;},null,{polling:'raf',timeout:remaining(180000)});
 const inside=await event('actual-E-enter-ground-floor');assert.equal(inside.city.interior.floorId,record.actualBuilding.floors[0].id);assert.ok(inside.city.interior.colliderCount>0&&inside.city.interior.roomCount>=2);assert.ok(Math.abs(inside.position.y-record.actualBuilding.floors[0].y)<.003&&Math.hypot(inside.position.x-200,inside.position.z+180.1)<.15,'Actual source-sampled first floor entrance support / spawn');assert.equal(inside.city.exterior.southInteriorId,'south-085');assert.equal(inside.city.renderVisibility.outdoor,false);record.entryInside=diagnostic(inside);await persist();
 record.exitPublicPrompt=await page.locator('#interaction span').innerText();assert.ok(record.exitPublicPrompt.includes('返回街道'));await page.keyboard.press('e');await page.waitForFunction(()=>{const s=window.__NEON__.snapshot();return !s.city.interior.buildingId&&!s.paused&&s.city.exterior.southInteriorId===null&&s.city.renderVisibility.outdoor;},null,{polling:'raf',timeout:remaining(180000)});record.exitAfter=diagnostic(await event('actual-E-exit-shell-restored'));exteriorGuard(await snapshot(page));record.entryExitComplete=true;await persist();
 const routeBefore=await snapshot(page),firstTarget=reference?reference.captures[0].position:plan.firstPhoto.position,target=reference?reference.captures[1].position:plan.secondPhoto.position;for(const axis of ['x','z'])await input.walk(axis,firstTarget[axis]);await photo(plan.firstPhoto,0);for(const axis of ['z','x'])await input.walk(axis,target[axis]);const routeAfter=await snapshot(page);assert.equal(routeAfter.teleportRevision,routeBefore.teleportRevision);const sum=record.inputs.filter(i=>i.kind==='real-WASD-leg'&&i.before?.teleportRevision===routeBefore.teleportRevision).reduce((a,i)=>a+i.holds.reduce((distance,h)=>distance+Math.abs(h.after.position[i.axis]-h.before.position[i.axis]),0),0);assert.ok(sum<=30,'Finite <=30m second exterior route');record.secondExteriorRoute={before:diagnostic(routeBefore),after:diagnostic(routeAfter),axisDistanceMetres:sum};await photo(plan.secondPhoto,1);assert.equal(record.captures.length,2);assert.deepEqual(record.errors,[]);if(reference)record.referencePosesMatched=true;
}
try {
  await persist(); record.freezeBefore = await fingerprints();
  await writeFile(resolve(output, 'build-info.json'), await readFile(resolve(root, 'build-info.json')));
  for(const p of Object.keys(record.freezeBefore.methods)){await mkdir(dirname(resolve(output,'executed-method',p)),{recursive:true});await writeFile(resolve(output,'executed-method',p),await readFile(resolve(methodRoot,p)));}
  await persist();
  const { chromium } = createRequire(resolve(binding.browserDependencyRoot, 'package.json'))('@playwright/test');
  server = await createStaticServer({ root }); await new Promise((ok, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', ok); });
  record.httpServer = { pid: process.pid, address: server.address() };
  const response = await fetch(`http://127.0.0.1:${port}/build-info.json`, { signal: AbortSignal.timeout(remaining(15000)) }); assert.ok(response.ok);
  assert.equal(sha(Buffer.from(await response.arrayBuffer())), record.freezeBefore.buildInfoSha256);
  browserServer = await chromium.launchServer({ headless: true, args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], timeout: remaining(60000) });
  browserProcess = browserServer.process(); browserOwnerIdentity = await ownedBrowserIdentity(browserProcess.pid); assert.equal(browserOwnerIdentity?.ppid,process.pid,'Exact launched browser owner identity'); browser = await chromium.connect(browserServer.wsEndpoint(), { timeout: remaining(30000) });
  record.browser = { version: browser.version(), executablePath: chromium.executablePath(), ownedPid: browserProcess.pid,
    ownedStartTicks: browserOwnerIdentity.startTicks, launchMethod: 'official launchServer/connect', node: process.version,
    launchArgs: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] };
  assert.equal(browser.version(), '151.0.7922.34');
  context = await browser.newContext({ viewport: record.viewport, deviceScaleFactor: 1 }); page = await context.newPage(); page.setDefaultTimeout(remaining());
  page.on('pageerror', error => record.errors.push({ kind: 'pageerror', ...errorRecord(error) }));
  page.on('console', message => { if (message.type() === 'error') record.errors.push({ kind: 'console', message: message.text() }); });
  page.on('response', response => { if (response.status() >= 400) record.errors.push({ kind: 'http', status: response.status(), url: response.url() }); });
  page.on('requestfailed', request => { const item = { kind: 'requestfailed', url: request.url(), failure: request.failure() };
    (closing && item.failure?.errorText === 'net::ERR_ABORTED' ? record.teardownEvents : record.errors).push(item); });
  input=createInput(page,{remaining:cap=>remaining(cap===30000?60000:cap),record,persist});await boot();await streetarrival();playableComplete=true;
} catch (error) {
  primaryError = error; record.primaryError = errorRecord(error);
  if (page && !page.isClosed()) {
    try { record.failureState = diagnostic(await snapshot(page)); } catch (error) { record.secondaryErrors.push({ stage: 'failure-snapshot', ...errorRecord(error) }); }
    try { await page.screenshot({ path: resolve(output, 'failure-high.png'), timeout: remaining(15000) }); } catch (error) { record.secondaryErrors.push({ stage: 'failure-photo', ...errorRecord(error) }); }
  }
} finally {
  closing = true;
  const closureDeadline = Math.min(deadline, Date.now() + 30000);
  async function close(label, operation, ownerCap = null, verifyOwned = false) { let timer; const item = { label, startedAt: new Date().toISOString(), timeoutMs: Math.max(1, ownerCap === null ? closureDeadline - Date.now() : Math.min(ownerCap, deadline - Date.now())) };
    try { await Promise.race([Promise.resolve().then(async () => {
      await operation();
      if (verifyOwned) { const current = await ownedBrowserIdentity(browserProcess.pid);
        record.ownedBrowserClose = classifyOwnedBrowserClose({before:browserOwnerIdentity,current,apiClose:{status:'closed',timeoutMs:item.timeoutMs,elapsedMs:Date.now()-Date.parse(item.startedAt)},exitCode:browserProcess.exitCode,signalCode:browserProcess.signalCode,callerForceInvoked:record.callerOwnedForceInvoked,hardDeadlineReached:record.hardDeadlineReached});
        assert.equal(record.ownedBrowserClose.boundedCloseAccepted,true,'Supported API close resolved within cap and exact owned browser identity exited');
      }
    }), new Promise((_, reject) => timer = setTimeout(() => reject(new Error(label + ' bounded closure deadline')), item.timeoutMs))]); item.status = 'closed'; }
    catch (error) { item.status = 'failed'; item.error = errorRecord(error); primaryError ||= error; }
    finally { clearTimeout(timer); item.finishedAt = new Date().toISOString(); item.elapsedMs = Date.parse(item.finishedAt)-Date.parse(item.startedAt); record.cleanup.push(item); } }
  if (context) await close('browser-context', () => context.close());
  if (browser) await close('browser-connection', () => browser.close());
  if (browserServer) await close('owned-browser-server', () => browserServer.close(), 35000, true);
  if (browserProcess && browserProcess.exitCode === null && browserProcess.signalCode === null) {
    const error = new Error('Owned browser process survived supported API cleanup'); primaryError ||= error;
    record.secondaryErrors.push({ stage: 'owned-child-hard-cleanup', ...errorRecord(error) });
    record.callerOwnedForceInvoked = true;
    await close('owned-browser-server-force', () => browserServer.kill());
  }
  if (browserProcess) {
    if (!record.ownedBrowserClose) record.ownedBrowserClose = classifyOwnedBrowserClose({before:browserOwnerIdentity,current:undefined,apiClose:record.cleanup.find(item=>item.label==='owned-browser-server'),exitCode:browserProcess.exitCode,signalCode:browserProcess.signalCode,callerForceInvoked:record.callerOwnedForceInvoked,hardDeadlineReached:record.hardDeadlineReached});
    if (record.callerOwnedForceInvoked) {record.ownedBrowserClose.callerForceInvoked=true;record.ownedBrowserClose.boundedCloseAccepted=false;record.ownedBrowserClose.forceAttribution='caller-resource-rescue-after-failed-close';}
  }
  if (server) { server.closeAllConnections(); await close('static-server', () => new Promise((ok, reject) => server.close(error => error ? reject(error) : ok()))); }
  if (browserProcess) record.browserProcessAfter = { pid: browserProcess.pid, exitCode: browserProcess.exitCode, signalCode: browserProcess.signalCode };
  try { record.freezeAfter = await fingerprints(); assert.deepEqual(record.freezeAfter, record.freezeBefore); record.freezeUnchanged = true; }
  catch (error) { record.secondaryErrors.push({ stage: 'end-freeze', ...errorRecord(error) }); primaryError ||= error; }
  if (record.errors.length || !playableComplete || record.hardDeadlineReached || Date.now() >= deadline) primaryError ||= new Error('Errors, incomplete route or case deadline');
  record.playableComplete=playableComplete;record.finalizationErrors=record.cleanup.filter(item=>item.status!=='closed');
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
