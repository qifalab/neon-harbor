/** PREPARED ONLY. Do not invoke native capture until the parent closes its
 * frozen tour, accepts this method and explicitly supplies a new GPU GO.
 * cwd is the actual repository; only that repository's dist is served.
 */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,readdir,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {resolve,relative,isAbsolute,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createStaticServer} from './server.mjs';
import {CORE_PLANS,compileFrontagePlan} from './plans.mjs';
import {MODELS,expectedIds} from './expectations.mjs';
import {snapshot,errorRecord,createInput} from './input.mjs';
const methodRoot=dirname(fileURLToPath(import.meta.url));
const usage='cwd ACTUAL_REPO: node /tmp/neon-harbor-final-native-method/capture-authored-harbor-native.mjs --mode baseline|authored --case home|workshop|south-090|south-091|south-092|south-094|south-095|south-096 --output NEW_EMPTY_DIR --gpu-go yes [--root dist] [--port 5228]\nPreparation only: add --plan-only yes; no browser dependency is loaded, server started or GPU instantiated.';
const options={};
for(let i=2;i<process.argv.length;i+=2){const flag=process.argv[i],value=process.argv[i+1];
 if(flag==='--help'){console.log(usage);process.exit(0);}
 assert.ok(['--mode','--case','--output','--gpu-go','--root','--port','--plan-only'].includes(flag)&&value,usage);options[flag.slice(2)]=value;}
assert.ok(['baseline','authored'].includes(options.mode),usage);
const catalog=JSON.parse(await readFile(resolve(methodRoot,'evidence/captured-buildings.json')));
const shops=['south-090','south-091','south-092','south-094','south-095','south-096'];
assert.ok(Object.hasOwn(CORE_PLANS,options.case)||shops.includes(options.case),usage);
const plan=CORE_PLANS[options.case]||compileFrontagePlan(catalog.buildings[options.case]);
if(options['plan-only']==='yes'){
 console.log(JSON.stringify({status:'PREPARED_NOT_EXECUTED',mode:options.mode,plan,
  scope:'Static plan compilation only. No browser launched, server started, renderer instantiated, city constructed or build invoked.',
  unavailableBaselineOwner:options.mode==='baseline'&&plan.id==='home',
  planPhotographsIdenticalAcrossModes:true},null,2));process.exit(0);
}
assert.equal(options['gpu-go'],'yes','Native execution needs a separate parent GPU GO after frozen tour closure; preparation never implies it.');
assert.ok(options.output,'Use a new empty evidence directory.');
const projectRoot=await realpath(process.cwd()),root=await realpath(resolve(projectRoot,options.root||'dist'));
assert.equal(root,await realpath(resolve(projectRoot,'dist')),'Run from the actual repository and serve exactly its dist; no private candidate server.');
assert.equal(execFileSync('git',['rev-parse','--show-toplevel'],{cwd:projectRoot,encoding:'utf8'}).trim(),projectRoot,'cwd must be the actual Git repository root');
let output=resolve(options.output);const port=Number(options.port||5228);
assert.ok(Number.isInteger(port)&&port>0&&port<65536);
const relativeOutput=relative(projectRoot,output);assert.ok(isAbsolute(relativeOutput)||relativeOutput.startsWith('..'),'Native evidence must be outside the frozen repository');
await mkdir(output,{recursive:true});output=await realpath(output);assert.ok(relative(projectRoot,output).startsWith('..'),'Evidence realpath must remain outside actual ROOT');
assert.deepEqual(await readdir(output),[],'Never overwrite a failed or previous native record.');
const sha=data=>createHash('sha256').update(data).digest('hex');
const record={status:'running',artAcceptance:'PENDING_HUMAN_NATIVE_REVIEW',mode:options.mode,case:plan.id,address:plan.address,
 startedAt:new Date().toISOString(),projectRoot,servedRoot:root,methodRoot,plan,
 viewport:{width:1280,height:800},deviceScaleFactor:1,pinnedChromium:'151.0.7922.34',
 wholeCaseBudgetMinutes:plan.budgetMinutes,inputs:[],events:[],captures:[],ownerProbes:[],releaseProbes:[],errors:[],teardownEvents:[],cleanup:[],
 limitations:['An independent public Atlas address setup is not a continuous city trip.',
 'High/default resolution/FOV, static hour 16.5 and all world metre poses are identical across modes.',
 'Only shipped public UI is used for initial settings and one Atlas setup. All later motion is actual mouse/WASD/Z/E/stairs.',
 'Snapshots are read-only diagnostics. No position/time/debug setters, direct storage writes, request interception, failure injection, hidden retry or image editing.',
 'Per-asset Three disposal and its synchronous renderer counter difference do not measure driver bytes or prove city-wide memory stability.',
 'Frontage short cases remain within their existing 72/96m residence window; no per-owner native release assertion is available there.',
 'Capture completion is distinct from art approval. Furniture scale/material response, readable labels, seams, lived-in composition and entrance appearance require actual original-pixel human review.']};
const persist=()=>writeFile(resolve(output,'metadata.json'),JSON.stringify(record,null,2)+'\n');
const deadline=Date.now()+plan.budgetMinutes*60000;
const remaining=(cap=180000)=>{const ms=Math.min(cap,deadline-Date.now());assert.ok(ms>0,'Whole native case deadline, including cleanup and final persistence');return ms;};
let server,browserServer,browserProcess,browser,context,page,closing=false,primaryError=null,playableCompleted=false;
const hardStop=setTimeout(()=>{record.hardDeadlineReached=true;
 browserServer?.kill().catch(error=>record.deadlineCloseError=errorRecord(error));server?.closeAllConnections();
},plan.budgetMinutes*60000);
const releaseCursor=new Map(),decodedOwnerCache=new Map();
function diagnostic(s){return {position:s.position,camera:s.camera,settings:s.settings,paused:s.paused,started:s.started,
 simulationTime:s.simulationTime,teleportRevision:s.teleportRevision,streaming:s.streaming,renderer:s.renderer,
 interior:s.city.interior,exterior:s.city.exterior,district:s.city.sample?.district};}
function assertSettings(s){
 assert.equal(s.settings.quality,'high');assert.equal(s.settings.dayCycle,false);assert.equal(s.settings.hour,16.5);
 assert.equal(s.settings.sensitivity,1);assert.equal(s.settings.firstPerson,true);assert.equal(s.paused,false);
 assert.equal(s.camera.fov,65);assert.equal(s.streaming?.failed||0,0);
 assert.equal(s.renderer.contextLost,false);assert.equal(s.renderer.shadow.enabled,true);assert.equal(s.renderer.shadow.sunCastShadow,true);
 assert.equal(s.renderer.contactOcclusion.enabled,true);assert.equal(s.renderer.contactOcclusion.passes,3);assert.equal(s.renderer.contactOcclusion.fallback,null);
 assert.deepEqual(s.renderer.contactOcclusion.sceneSize,[1280,800]);assert.deepEqual(s.renderer.contactOcclusion.occlusionSize,[640,400]);
}
async function event(kind,detail={}){const s=await snapshot(page);assertSettings(s);record.events.push({kind,detail,at:new Date().toISOString(),state:diagnostic(s)});await persist();return s;}
function ownerOf(s,channel,floorId){return channel==='workshop'?s.city.interior.workshopPilot:s.city.interior.authoredHome?.find(item=>item.floorId===floorId)?.owner;}
function ownerEvents(s,channel){return channel==='workshop'?s.city.interior.workshopPilotEvents:s.city.interior.homeAssetEvents;}
async function ready(channel,floorId,label){
 const ids=expectedIds(options.mode,channel,floorId);
 if(ids===null){const s=await snapshot(page);const owner=ownerOf(s,channel,floorId);
  assert.ok(!owner,'baseline mode cannot hide an existing authored owner');
  record.ownerProbes.push({label,channel,floorId,status:'unavailable',reason:'Baseline D has no authored dwelling owner or native disposal audit; absence is not a passing authored-art test.',observedOwner:owner??null});await persist();return null;}
 await page.waitForFunction(({channel,floorId})=>{const i=window.__NEON__.snapshot().city.interior;
  const owner=channel==='workshop'?i.workshopPilot:i.authoredHome?.find(item=>item.floorId===floorId)?.owner;
  return owner?.status==='ready';},{channel,floorId},{polling:'raf',timeout:remaining()});
 const s=await snapshot(page),owner=ownerOf(s,channel,floorId);assertSettings(s);
 assert.equal(owner.assetCount,ids.length);assert.equal(owner.pending,false);assert.deepEqual(owner.errors,[]);
 assert.deepEqual(owner.resources.map(r=>r.assetId).sort(),[...ids].sort());
 if(channel==='home'||owner.lodTier!==2)assert.equal(owner.fallbackVisible,false);
 for(const resource of owner.resources){const expected=MODELS[resource.assetId];
  assert.equal(resource.geometries,expected.geometries);assert.equal(resource.textures,expected.textures);
  assert.equal(resource.decodedTextures,expected.textures);
  for(const image of resource.images){assert.equal(image.decoded,true);assert.equal(image.width,1024);assert.equal(image.height,1024);
   assert.ok(['ImageBitmap','HTMLImageElement'].includes(image.decoderObject),'Native real image object required, not a CPU placeholder');}
 }
 decodedOwnerCache.set(channel+':'+floorId,structuredClone(owner.resources));
 record.ownerProbes.push({label,channel,floorId,status:'observed-native-ready',owner});await persist();return owner;
}
async function released(channel,floorId,label){
 const ids=expectedIds(options.mode,channel,floorId);
 if(ids===null){record.releaseProbes.push({label,channel,floorId,status:'unavailable',reason:'Baseline D lacks dwelling owner/disposal events. No fabricated before/after counters.'});await persist();return;}
 const key=channel+':'+floorId,start=releaseCursor.get(key)||0;
 await page.waitForFunction(({channel,floorId,start,count})=>{const i=window.__NEON__.snapshot().city.interior;
  const events=channel==='workshop'?i.workshopPilotEvents:i.homeAssetEvents;
  return events?.filter(e=>e.kind==='asset-released'&&e.floorId===floorId&&e.sequence>start).length>=count;
 },{channel,floorId,start,count:ids.length},{polling:'raf',timeout:remaining(60000)});
 const s=await snapshot(page),all=ownerEvents(s,channel),releases=all.filter(e=>e.kind==='asset-released'&&e.floorId===floorId&&e.sequence>start);
 assert.deepEqual(releases.map(e=>e.assetId).sort(),[...ids].sort(),'One completed release per actual decoded source owner');
 for(const e of releases){const expected=MODELS[e.assetId],r=e.rendererRelease,d=e.resourceRelease;
  assert.equal(r.scope,'single synchronous asset disposal');assert.equal(r.available,true);assert.deepEqual(r.readErrors,[]);
  assert.equal(r.attachedAtRelease,true);assert.equal(d.geometries,expected.geometries);assert.equal(d.textures,expected.textures);
  assert.ok(d.boneTextures>=0&&d.boneTextures<=expected.bones);
  assert.equal(r.difference.geometries,r.before.geometries-r.after.geometries);assert.equal(r.difference.textures,r.before.textures-r.after.textures);
  assert.ok(r.difference.geometries>=0&&r.difference.geometries<=d.geometries);
  assert.ok(r.difference.textures>=0&&r.difference.textures<=d.textures+d.boneTextures);
  const images=decodedOwnerCache.get(key)?.find(resource=>resource.assetId===e.assetId)?.images;
  assert.ok(images,'Actual ready decoder evidence before release');
  if(images.every(image=>image.decoderObject==='ImageBitmap'&&image.closable))assert.equal(d.closedImages,expected.images);
  else if(images.every(image=>image.decoderObject==='HTMLImageElement'))assert.equal(d.closedImages,0);
  else assert.ok(d.closedImages>=0&&d.closedImages<=expected.images);
 }
 releaseCursor.set(key,Math.max(...releases.map(e=>e.sequence)));
 record.releaseProbes.push({label,channel,floorId,status:'observed-native-owner-release',releases,
  scope:'Owned Three objects plus exact synchronous renderer-memory counter differences; unrendered LOD meshes can legitimately release zero uploaded objects.'});await persist();
}
async function boot(input){
 await page.goto(`http://127.0.0.1:${port}/`,{timeout:remaining()});
 await page.waitForFunction(()=>window.__NEON__?.snapshot().ready&&!document.getElementById('start').disabled,null,{polling:'raf',timeout:remaining()});
 await page.locator('#welcome-settings').click();await page.locator('#quality').selectOption('high');await page.locator('#cycle').uncheck();
 assert.equal(Number(await page.locator('#time').inputValue()),16.5);await page.locator('#time').press('ArrowLeft');await page.locator('#time').press('ArrowRight');
 await page.locator('#volume').press('Home');await page.locator('#resume').click();await page.locator('#start').click();
 await page.waitForFunction(()=>{const s=window.__NEON__.snapshot();return s.started&&!s.paused&&!s.streaming?.preparing&&!s.streaming?.pending;},null,{polling:'raf',timeout:remaining()});
 await page.locator('#game').focus();if(!(await snapshot(page)).settings.firstPerson)await page.keyboard.press('v');
 await page.waitForFunction(()=>window.__NEON__.snapshot().settings.firstPerson,null,{polling:'raf',timeout:remaining()});
 await page.locator('#explore-city').click();await page.locator('#atlas-search').fill(plan.englishName);await page.locator(`[data-visit-building="${plan.address}"]`).click();
 await page.waitForFunction(address=>{const s=window.__NEON__.snapshot(),b=s.city.buildings.find(item=>item.id===address);
  return !s.paused&&!s.city.interior.buildingId&&!s.streaming?.preparing&&!s.streaming?.pending&&Math.hypot(s.position.x-b.entrance.x,s.position.z-b.entrance.z)<.1;
 },plan.address,{polling:'raf',timeout:remaining()});
 const s=await event('single-independent-public-Atlas-setup',{address:plan.address,continuousTrip:false});
 record.actualAddressCatalogue=Object.fromEntries(Object.keys(catalog.buildings).map(id=>[id,s.city.buildings.find(b=>b.id===id)]));
 const actual=record.actualAddressCatalogue[plan.address],prepared=catalog.buildings[plan.address];
 for(const key of['x','z','width','depth','baseY'])assert.equal(actual[key],prepared[key],'Captured address metre basis changed: '+key);
 for(const key of['x','z'])assert.equal(actual.entrance[key],prepared.entrance[key]);
 await input.face(Math.PI);await persist();
}
async function capture(step,input){
 if(plan.id==='home')await ready('home',(await snapshot(page)).city.interior.floorId,step.label);
 else if(plan.id==='workshop')await ready('workshop','lobby',step.label);
 else{
  await page.waitForFunction(()=>{const d=window.__NEON__.snapshot().city.sample.district;
   return d.scannedMapsExpected>0&&d.scannedMapsLoaded===d.scannedMapsExpected;},null,{polling:'raf',timeout:remaining()});
  assert.deepEqual((await snapshot(page)).city.sample.district.scannedMapErrors,[],'Real High storefront material load errors');
 }
 await input.face(step.camera.yaw,step.camera.pitch);
 await page.waitForFunction(()=>{const s=window.__NEON__.snapshot();return !s.streaming?.preparing&&!s.streaming?.pending&&s.renderer.triangles>0&&!document.querySelector('#toasts .toast');},null,{polling:'raf',timeout:remaining()});
 await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
 const before=await snapshot(page);assertSettings(before);assert.equal(before.renderer.shadow.mapResident,true);
 for(const axis of['x','z'])assert.ok(Math.abs(before.position[axis]-step.position[axis])<step.axisTolerance,'Fixed CPU-proven photograph region: '+axis);
 assert.ok(Math.abs(before.position.y-step.position.y)<.03,'Actual ground height at fixed photograph');
 if(step.roomId)assert.equal(before.city.interior.currentRoomId,step.roomId);
 assert.ok(Math.abs(Math.atan2(Math.sin(before.camera.yaw-step.camera.yaw),Math.cos(before.camera.yaw-step.camera.yaw)))<.004);
 assert.ok(Math.abs(before.camera.pitch-step.camera.pitch)<.004);
 const gl=await page.locator('#game').evaluate(canvas=>{const gl=canvas.getContext('webgl2'),info=gl.getExtension('WEBGL_debug_renderer_info');
  return {width:gl.drawingBufferWidth,height:gl.drawingBufferHeight,contextLost:gl.isContextLost(),errorAtCheckpoint:gl.getError(),version:gl.getParameter(gl.VERSION),renderer:gl.getParameter(info?info.UNMASKED_RENDERER_WEBGL:gl.RENDERER)};});
 assert.equal(gl.width,1280);assert.equal(gl.height,800);assert.equal(gl.contextLost,false);assert.equal(gl.errorAtCheckpoint,0);
 const file=plan.id+'-'+step.label+'-high.png';await page.screenshot({path:resolve(output,file),timeout:remaining()});
 const after=await snapshot(page);assertSettings(after);assert.deepEqual(after.position,before.position);
 assert.ok(Math.abs(Math.atan2(Math.sin(after.camera.yaw-step.camera.yaw),Math.cos(after.camera.yaw-step.camera.yaw)))<.004);
 assert.ok(Math.abs(after.camera.pitch-step.camera.pitch)<.004);
 assert.ok(Math.hypot(after.camera.position.x-before.camera.position.x,after.camera.position.y-before.camera.position.y,after.camera.position.z-before.camera.position.z)<.03,'Photograph camera eye stayed at the actual standing point');
 const poseFile=plan.id+'-'+step.label+'-pose.json',detail={prepared:step,before:diagnostic(before),after:diagnostic(after),gl,
  actualEyeDistance:Math.hypot(step.target.x-after.camera.position.x,step.target.y-after.camera.position.y,step.target.z-after.camera.position.z)};
 await writeFile(resolve(output,poseFile),JSON.stringify(detail,null,2)+'\n');
 record.captures.push({label:step.label,file,sha256:sha(await readFile(resolve(output,file))),poseFile,poseSha256:sha(await readFile(resolve(output,poseFile))),originalPixels:[1280,800],gl});await persist();
}
async function interact(kind,label,input){
 await input.face(Math.PI);const before=await snapshot(page),prompt=await page.locator('#interaction').textContent();
 if(kind==='enter')assert.ok(prompt.includes('进入')&&prompt.includes(catalog.buildings[plan.address].name),'Actual public E entry label for intended address');
 else assert.ok(prompt.includes('返回街道'),'Ground-floor actual E exit prompt');
 await page.keyboard.press('e');
 await page.waitForFunction(({kind,address})=>{const id=window.__NEON__.snapshot().city.interior.buildingId;return kind==='enter'?id===address:id===null;},{kind,address:plan.address},{polling:'raf',timeout:remaining(60000)});
 const after=await event(label||('actual-E-'+kind),{prompt,teleportRevisionBefore:before.teleportRevision});
 assert.ok(after.teleportRevision>before.teleportRevision,'Only shipped E transition may replace the address position');
 if(kind==='enter'){assert.equal(after.city.interior.floorId,'lobby');record.events.at(-1).detail.realRoomEntrance=after.city.interior.entrance;}
 else{
  const intended=catalog.buildings[plan.address].exitPosition;assert.ok(Math.hypot(after.position.x-intended.x,after.position.z-intended.z)<.1);
  assert.ok(after.city.exterior.southInteriorId===null||after.city.exterior.southInteriorId===undefined,'Actual exterior owner restored');
 }
 await persist();
}
async function frontage(kind,label){
 const s=await event(label),district=s.city.sample.district,site=district.frontages.find(f=>f.shellId===plan.address);
 assert.ok(site);assert.equal(district.interiorBuildingId,null);
 const expected={x:catalog.buildings[plan.address].x,z:catalog.buildings[plan.address].z+catalog.buildings[plan.address].depth/2+.64,y:catalog.buildings[plan.address].baseY,yaw:0};
 if(options.mode==='authored'){assert.deepEqual(site.publicDoor,expected);assert.equal(site.displayFaceHasDoor,Math.abs(site.angle)<.01);}
 record.ownerProbes.push({label,channel:'frontage',status:site.publicDoor?'observed-public-door-metadata':'unavailable',
  reason:site.publicDoor?null:'Baseline D has no authored publicDoor metadata. Actual public E target is still verified independently.',site,expectedActualPublicDoor:expected,knownBaselineIssue:plan.knownBaselineIssue,
  ownedRelease:{status:'unavailable',reason:'Normal entry/exit remains inside existing 72/96m frontage residence. No per-source release counter transaction is exposed.'}});
 if(kind==='door'){const prompt=await page.locator('#interaction').textContent();assert.ok(prompt.includes('进入')&&prompt.includes(catalog.buildings[plan.address].name));}
 await persist();
}
async function fingerprints(){
 const bytes=await readFile(resolve(root,'build-info.json')),manifest=JSON.parse(bytes),hashes={};
 assert.ok(manifest.assets&&Object.keys(manifest.assets).length>0,'Complete runtime asset dictionary required');
 for(const [p,expected]of Object.entries(manifest.assets)){
  assert.ok(!isAbsolute(p)&&!p.split('/').includes('..'),'Manifest paths must be contained');
  const served=await readFile(resolve(root,p)),source=await readFile(resolve(projectRoot,p));
  assert.equal(sha(served),expected,'Served bytes: '+p);assert.equal(sha(source),expected,'Actual ROOT source bytes: '+p);hashes[p]=expected;
 }
 return {bytes,manifest,hashes,sha256:sha(bytes)};
}
try{
 await persist();
 record.gitHead=execFileSync('git',['rev-parse','HEAD'],{cwd:projectRoot,encoding:'utf8'}).trim();
 record.gitStatus=execFileSync('git',['status','--porcelain=v1'],{cwd:projectRoot,encoding:'utf8'});
 const runtime=await fingerprints();record.buildInfoSha256=runtime.sha256;record.buildRevision=runtime.manifest.revision;
 record.manifestAssetDictionary=runtime.manifest.assets;record.sourceServedVerifiedAssetDictionary=runtime.hashes;
 await writeFile(resolve(output,'build-info.json'),runtime.bytes);
 const methodFiles=['capture-authored-harbor-native.mjs','input.mjs','plans.mjs','expectations.mjs','server.mjs','evidence/captured-buildings.json','evidence/common-pose-proof.json'];
 record.methodHashes=Object.fromEntries(await Promise.all(methodFiles.map(async p=>[p,sha(await readFile(resolve(methodRoot,p)))])));
 const proof=JSON.parse(await readFile(resolve(methodRoot,'evidence/common-pose-proof.json')));assert.equal(proof.clear,true,'Common-mode standing/path preparation');
 const planningFiles=['src/compact-interiors.js','src/expansion-programmes.js','src/metropolis-room-designs.js'];
 if(plan.id==='workshop')planningFiles.push('src/harbor-workshop-pilot.js',...(options.mode==='authored'?['src/harbor-workshop-authored.js']:[]));
 if(plan.id==='home'&&options.mode==='authored')planningFiles.push('src/harbor-home-authored.js');
 for(const p of planningFiles){const keys=Object.keys(proof.sourceHashes).filter(k=>k.endsWith('/'+p));
  const expected=proof.sourceHashes[keys.find(k=>p==='src/harbor-workshop-pilot.js'?(options.mode==='baseline'?k.startsWith('/workspace/'):k.startsWith('/tmp/')):true)];
  assert.ok(expected,'Exact prepared layout source fingerprint: '+p);assert.equal(runtime.hashes[p],expected,'Layout or collision changed after common-route preparation: '+p);}
 record.dependencyHashes=Object.fromEntries(await Promise.all(['package.json','package-lock.json'].map(async p=>[p,sha(await readFile(resolve(projectRoot,p)))])));
 for(const id of plan.id==='home'?(expectedIds(options.mode,'home','lobby')||[]).concat(expectedIds(options.mode,'home','gallery')||[]):plan.id==='workshop'?expectedIds(options.mode,'workshop','lobby'):[]){
  const m=MODELS[id],p=`assets/harbor/${m.folder}/${id}.glb`;assert.equal(runtime.manifest.assets[p],m.sha256,'Exact accepted asset candidate: '+p);
 }
 await persist();
 // Resolve Playwright from actual ROOT package dependencies, not /tmp ancestry.
 const requireFromRoot=createRequire(resolve(projectRoot,'package.json'));
 const {chromium}=await import(pathToFileURL(requireFromRoot.resolve('@playwright/test')));
 server=await createStaticServer({root});await new Promise((done,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',done);});
 const servedManifest=await fetch(`http://127.0.0.1:${port}/build-info.json`,{signal:AbortSignal.timeout(remaining(15000))});assert.ok(servedManifest.ok);
 assert.equal(sha(Buffer.from(await servedManifest.arrayBuffer())),runtime.sha256,'Actual HTTP server manifest');
 // Official BrowserServer exposes the owned child process and kill() method.
 // The hard timer can terminate exactly this fresh browser, never the frozen tour.
 browserServer=await chromium.launchServer({headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader'],timeout:remaining(60000)});
 browserProcess=browserServer.process();browser=await chromium.connect(browserServer.wsEndpoint(),{timeout:remaining(30000)});
 record.browser={version:browser.version(),executablePath:chromium.executablePath(),ownedPid:browserProcess.pid,
  launchMethod:'official launchServer/connect with owned-process hard deadline',launchArgs:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']};
 assert.equal(record.browser.version,record.pinnedChromium,'Pinned native comparison browser');
 context=await browser.newContext({viewport:record.viewport,deviceScaleFactor:1});page=await context.newPage();page.setDefaultTimeout(30000);
 page.on('pageerror',error=>record.errors.push({kind:'pageerror',...errorRecord(error)}));
 page.on('console',message=>{if(message.type()==='error')record.errors.push({kind:'console',message:message.text()});});
 page.on('response',response=>{if(response.status()>=400)record.errors.push({kind:'http',status:response.status(),url:response.url()});});
 page.on('requestfailed',request=>{const item={kind:'requestfailed',url:request.url(),failure:request.failure()};
  if(closing&&item.failure?.errorText==='net::ERR_ABORTED')record.teardownEvents.push(item);else record.errors.push(item);});
 const input=createInput(page,{remaining,record,persist});await boot(input);
 for(const [index,step]of plan.steps.entries()){
  record.activeStep={index,...step};await persist();
  if(step.kind==='walk')await input.walk(step.axis,step.target);
  else if(step.kind==='photo')await capture(step,input);
  else if(step.kind==='enter'||step.kind==='exit')await interact(step.kind,step.label,input);
  else if(step.kind==='ready')await ready(step.channel,step.floorId,step.label);
  else if(step.kind==='release')await released(step.channel,step.floorId,step.label);
  else if(step.kind==='floor'){
   const s=await event(step.label);assert.equal(s.city.interior.floorId,step.floorId);assert.ok(Math.abs(s.position.y-step.y)<.03);
  }else if(step.kind==='frontage'||step.kind==='door')await frontage(step.kind,step.label);
  else if(step.kind==='event')await event(step.label);
  else throw new Error('Unrecognized fixed route step');
  assert.deepEqual(record.errors,[],'Unexpected native page/console/network error');
 }
 const final=await fingerprints();assert.equal(final.sha256,record.buildInfoSha256);assert.deepEqual(final.hashes,record.sourceServedVerifiedAssetDictionary);
 record.gitHeadAfter=execFileSync('git',['rev-parse','HEAD'],{cwd:projectRoot,encoding:'utf8'}).trim();assert.equal(record.gitHeadAfter,record.gitHead);
 record.gitStatusAfter=execFileSync('git',['status','--porcelain=v1'],{cwd:projectRoot,encoding:'utf8'});assert.equal(record.gitStatusAfter,record.gitStatus);
 record.runtimeRecheckedAfter=true;playableCompleted=true;
}catch(error){
 primaryError=error;record.primaryError=errorRecord(error);record.status='failed';
 if(page&&!page.isClosed()){
  try{record.failureState=diagnostic(await snapshot(page));}catch(other){record.secondaryFailureSnapshot=errorRecord(other);}
  try{await page.screenshot({path:resolve(output,'failure-high.png'),timeout:remaining(15000)});}catch(other){record.secondaryFailureScreenshot=errorRecord(other);}
 }
 try{await persist();}catch(other){record.secondaryFailurePersistence=errorRecord(other);}
}finally{
 closing=true;
 async function close(label,operation,cap){let timer;const item={label,timeoutMs:Math.max(1,Math.min(cap,deadline-Date.now())),startedAt:new Date().toISOString()};
  try{await Promise.race([Promise.resolve().then(operation),new Promise((_,reject)=>timer=setTimeout(()=>reject(new Error(label+' cleanup deadline')),item.timeoutMs))]);item.status='closed';}
  catch(error){item.status='failed';item.error=errorRecord(error);}finally{clearTimeout(timer);item.finishedAt=new Date().toISOString();record.cleanup.push(item);}}
 if(context)await close('browser-context',()=>context.close(),10000);
 if(browser)await close('browser',()=>browser.close(),10000);
 if(browserServer)await close('owned-browser-process',()=>browserServer.close(),15000);
 if(browserProcess&&browserProcess.exitCode===null&&browserProcess.signalCode===null&&browserServer)await close('owned-browser-process-kill',()=>browserServer.kill(),5000);
 if(browserProcess)record.browserProcessAfterFinalization={pid:browserProcess.pid,exitCode:browserProcess.exitCode,signalCode:browserProcess.signalCode};
 if(server)await close('static-server',()=>new Promise((done,reject)=>server.close(error=>error?reject(error):done())),5000);
 record.finalizationErrors=[];
 if(record.cleanup.some(item=>item.status!=='closed'))record.finalizationErrors.push('Owned cleanup failed');
 if(record.errors.length)record.finalizationErrors.push('Unexpected errors before or during teardown');
 if(record.hardDeadlineReached||Date.now()>=deadline)record.finalizationErrors.push('Whole case deadline reached');
 if(record.deadlineCloseError)record.finalizationErrors.push('Hard-deadline browser close failed');
 if(browserProcess&&browserProcess.exitCode===null&&browserProcess.signalCode===null)record.finalizationErrors.push('Owned browser child remains alive after finalization');
 if(!playableCompleted)record.finalizationErrors.push('Playable capture route incomplete');
 if(record.finalizationErrors.length&&!primaryError)primaryError=new Error(record.finalizationErrors.join('; '));
 record.status=primaryError?'failed':'capture-complete-art-review-pending';record.primaryError=primaryError?errorRecord(primaryError):null;
 record.finalizationCompletedAt=new Date().toISOString();record.finishedBeforeDeadline=Date.now()<deadline;
 try{await persist();}catch(error){record.finalMetadataWriteError=errorRecord(error);primaryError ||=error;}
 // The hard timer stays armed through the final write and late protocol events.
 if(primaryError||record.hardDeadlineReached||Date.now()>=deadline||record.errors.length){
  primaryError ||=new Error('Late error/deadline during final persistence');record.status='failed';record.primaryError=errorRecord(primaryError);
  record.errorsAfterFinalization=structuredClone(record.errors);record.finishedBeforeDeadline=Date.now()<deadline;
  try{await persist();}catch(error){record.finalMetadataWriteError=errorRecord(error);}
 }
 clearTimeout(hardStop);
}
if(primaryError)throw primaryError;
console.log(JSON.stringify({status:record.status,artAcceptance:record.artAcceptance,output,captures:record.captures.length}));
