from pathlib import Path
import hashlib,json,ast

HERE=Path(__file__).parent
BASE=Path('/workspace/neon-candidates/resident-motion-public-idle-slowwalk-stop-high-method-preparation-20261005')
ROOT=Path('/workspace/neon-candidates/harbor-shared-clock-three-role-successor-20261005')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
for n in ['input.mjs','render-readiness.mjs','server.mjs']:(HERE/n).write_bytes((BASE/n).read_bytes())
old_binding=json.loads((BASE/'source-runtime-bindings.json').read_text())
build_bytes=(ROOT/'dist/build-info.json').read_bytes();build=json.loads(build_bytes)
assert build['revision'] is None and len(build['assets'])==213 and sha(ROOT/'dist/build-info.json')=='62be1c1e08f161a03294b617f6e7d5fe1129c28c9e42836c509f671235440233'
skip={'.git','node_modules','dist','__pycache__','test-results','playwright-report','multiplayer-test-results','multiplayer-playwright-report'}
source={}
for p in sorted(ROOT.rglob('*')):
    if any(x in skip for x in p.relative_to(ROOT).parts):continue
    if p.is_file():
        assert not p.is_symlink()
        source[str(p.relative_to(ROOT))]=sha(p)
for n,h in build['assets'].items():assert sha(ROOT/n)==sha(ROOT/'dist'/n)==h
binding={'status':'BEFORE_READY_FUTURE_CANDIDATE_UNBOUND','sourceScope':'All physically materialized project files excluding git/dependencies/dist/results/cache; includes existing materialized QA inputs, not skipped logical QA blobs. No git command used.','browserDependencyRoot':old_binding['browserDependencyRoot'],'ownedModule':old_binding['ownedModule'],'roles':{'before':{'root':str(ROOT),'revision':None,'uncommittedPreview':True,'buildInfo':{'sha256':sha(ROOT/'dist/build-info.json')},'assets':build['assets'],'sourceInputs':source},'candidate':None}}
(HERE/'source-runtime-bindings.json').write_text(json.dumps(binding,ensure_ascii=False,indent=2)+'\n')
plan={'publicBuilding':'south-085','hour':16.5,'quality':'high','firstPerson':True,'fov':65,'viewport':{'width':1280,'height':800},'firstPhoto':{'label':'01-warehouse-north-east-frontage-bay','position':{'x':212,'y':.18,'z':-172.9},'yaw':3.141592653589793,'pitch':-.0653},'secondPhoto':{'label':'02-warehouse-east-after-real-exit','position':{'x':225,'y':.18,'z':-175.5},'yaw':-2.35,'pitch':-.12},'bodyXZTolerance':.15,'bodyYTolerance':.03,'angleTolerance':.004,'maximumSecondExternalRouteMetres':30,'entrySpawnGroundY':.215,'firstFloorY':.215,'wholeMinutes':20,'outerCleanupSeconds':120,'elevator':'Not executed in this minimum capture. Separate actual public elevator second-floor/ground-floor functionality belongs in CI; no elevator pass claimed.'}
(HERE/'streetarrival-plan.json').write_text(json.dumps(plan,ensure_ascii=False,indent=2)+'\n')
s=(BASE/'capture-resident-motion.mjs').read_text()
header='''import assert from 'node:assert/strict';
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
'''
guard=s[s.index('async function ownedBrowserIdentity'):s.index('const diagnostic')]
diag='''const diagnostic=s=>({ready:s.ready,health:s.health,started:s.started,paused:s.paused,settings:s.settings,position:s.position,camera:s.camera,inCar:s.inCar,simulationTime:s.simulationTime,teleportRevision:s.teleportRevision,presentation:s.presentation,streaming:s.streaming,renderer:s.renderer,interior:s.city.interior,exterior:s.city.exterior,renderVisibility:s.city.renderVisibility,transitRiding:s.city.transit.riding,sampleTransitRiding:s.city.sample.transit.riding,streetLighting:s.city.streetLighting});
const excludedFolders=new Set(['.git','node_modules','dist','__pycache__','test-results','playwright-report','multiplayer-test-results','multiplayer-playwright-report']);
async function physicalFiles(directory,prefix='',exclude=true){const out=[];for(const item of await readdir(directory,{withFileTypes:true})){if(exclude&&excludedFolders.has(item.name))continue;assert.ok(!item.isSymbolicLink(),'No symlink in frozen source');const name=prefix+item.name;if(item.isDirectory())out.push(...await physicalFiles(resolve(directory,item.name),name+'/',exclude));else if(item.isFile())out.push(name);}return out.sort();}
async function fingerprints(){
 const bytes=await readFile(resolve(root,'build-info.json')),manifest=JSON.parse(bytes);assert.equal(manifest.version,'0.8.0');assert.equal(sha(bytes),bound.buildInfo.sha256);assert.equal(manifest.revision,bound.revision);assert.deepEqual(manifest.assets,bound.assets);
 assert.deepEqual(await physicalFiles(projectRoot),Object.keys(bound.sourceInputs).sort(),'Exact physical source set including any new files');assert.deepEqual(await physicalFiles(root,'',false),[...Object.keys(bound.assets),'build-info.json'].sort(),'Exact served runtime set');const source={};for(const[p,h]of Object.entries(bound.sourceInputs)){assert.equal(sha(await readFile(resolve(projectRoot,p))),h,'Pinned materialized source '+p);source[p]=h;}
 const assets={};for(const[p,h]of Object.entries(manifest.assets)){assert.ok(!isAbsolute(p)&&!p.split('/').includes('..'));assert.equal(sha(await readFile(resolve(root,p))),h,'Actual served '+p);assert.equal(sha(await readFile(resolve(projectRoot,p))),h,'Source runtime '+p);assets[p]=h;}
 const methods={};const seal=JSON.parse(await readFile(resolve(methodRoot,'METHOD-SEAL.json'),'utf8'));for(const[p,pin]of Object.entries(seal.files)){const bytes=await readFile(resolve(methodRoot,p));assert.equal(bytes.length,pin.bytes);assert.equal(sha(bytes),pin.sha256);methods[p]=pin.sha256;}
 return {buildInfoSha256:sha(bytes),hashes:assets,source,methods,assetCount:Object.keys(assets).length,materializedSourceCount:Object.keys(source).length};
}
'''
event=s[s.index('async function event'):s.index('function localCore')]
body='''function assertSettings(s){assert.equal(s.started,true);assert.equal(s.paused,false);assert.equal(s.health,100);assert.equal(s.settings.quality,'high');assert.equal(s.settings.hour,16.5);assert.equal(s.settings.dayCycle,false);assert.equal(s.settings.sensitivity,1);assert.equal(s.settings.firstPerson,true);assert.equal(s.camera.fov,65);assert.equal(s.inCar,null);assert.ok(!s.city.transit.riding&&!s.city.sample.transit.riding);assert.equal(s.streaming.failed,0);assert.equal(s.renderer.contextLost,false);assert.equal(s.renderer.shadow.enabled,true);assert.equal(s.renderer.contactOcclusion.enabled,true);assert.equal(s.renderer.contactOcclusion.fallback,null);}
const angular=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
function exteriorGuard(s){assertSettings(s);assert.ok(!s.city.interior.buildingId);assert.equal(s.city.exterior.southInteriorId,null);assert.equal(s.city.renderVisibility.outdoor,true);assert.ok(currentRenderedCamera({expectedRevision:s.teleportRevision,state:s}));}
async function photo(prepared,index){
 await input.face(prepared.yaw,prepared.pitch);await page.waitForFunction(()=>{const s=window.__NEON__.snapshot();return !s.streaming.preparing&&!s.streaming.pending&&!document.querySelector('#toasts .toast');},null,{polling:'raf',timeout:remaining(120000)});
 const before=await event('original-photo-ready-'+prepared.label);exteriorGuard(before);assert.ok(Math.hypot(before.position.x-prepared.position.x,before.position.z-prepared.position.z)<.15);assert.ok(Math.abs(before.position.y-prepared.position.y)<.03);assert.ok(Math.abs(angular(before.camera.yaw,prepared.yaw))<.004&&Math.abs(before.camera.pitch-prepared.pitch)<.004);
 if(reference){const old=reference.captures[index];assert.equal(old.label,prepared.label);const delta={x:before.position.x-old.position.x,y:before.position.y-old.position.y,z:before.position.z-old.position.z};assert.ok(Math.hypot(delta.x,delta.z)<.15&&Math.abs(delta.y)<.03);assert.ok(Math.hypot(before.camera.position.x-old.camera.position.x,before.camera.position.z-old.camera.position.z)<.15&&Math.abs(before.camera.position.y-old.camera.position.y)<.03);assert.ok(Math.abs(angular(before.camera.yaw,old.camera.yaw))<.004&&Math.abs(before.camera.pitch-old.camera.pitch)<.004);record.events.push({kind:'actual-before-candidate-photo-comparison',label:prepared.label,bodyDelta:delta,cameraBefore:old.camera,cameraCandidate:before.camera});}
 const pixels=await page.locator('#game').evaluate(canvas=>{const gl=canvas.getContext('webgl2');return {width:gl.drawingBufferWidth,height:gl.drawingBufferHeight,lost:gl.isContextLost(),error:gl.getError(),dpr:devicePixelRatio};});assert.deepEqual(pixels,{width:1280,height:800,lost:false,error:0,dpr:1});
 const image=prepared.label+'-high.png',pose=prepared.label+'-pose.json';await page.screenshot({path:resolve(output,image),timeout:remaining(120000)});const after=await snapshot(page);exteriorGuard(after);assert.deepEqual(after.position,before.position);assert.equal(after.teleportRevision,before.teleportRevision);assert.ok(Math.abs(angular(after.camera.yaw,before.camera.yaw))<.004&&Math.abs(after.camera.pitch-before.camera.pitch)<.004);await writeFile(resolve(output,pose),JSON.stringify({before:diagnostic(before),after:diagnostic(after),pixels},null,2)+'\\n');record.captures.push({label:prepared.label,image,pose,imageSha256:sha(await readFile(resolve(output,image))),poseSha256:sha(await readFile(resolve(output,pose))),position:before.position,camera:before.camera,pixels});await persist();
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
'''
tail=s[s.index('try {\n  await persist();'):]
tail=tail.replace('await residentMotion();','await streetarrival();')
tail=tail.replace('cap=>remaining(cap===120000?180000:cap===30000?60000:cap)','cap=>remaining(cap===30000?60000:cap)')
(HERE/'capture-streetarrival.mjs').write_text(header+guard+diag+event+body+tail)
wrapper=(BASE/'run-owned-resident-motion.py').read_text()
start=wrapper.index('def freeze(role):');end=wrapper.index("if __name__=='__main__':")
functions='''def physical_source(root):
 skip={'.git','node_modules','dist','__pycache__','test-results','playwright-report','multiplayer-test-results','multiplayer-playwright-report'}
 return sorted(str(p.relative_to(root)) for p in root.rglob('*') if p.is_file() and not any(x in skip for x in p.relative_to(root).parts))
def freeze(role):
 bound=binding['roles'][role];assert bound is not None,'Candidate must be bound after actual build';root=pathlib.Path(bound['root']);build=root/'dist/build-info.json';actual=json.loads(build.read_text());assert sha(build)==bound['buildInfo']['sha256'] and actual['revision']==bound['revision'] and actual['assets']==bound['assets']
 for p,h in bound['assets'].items():assert sha(root/'dist'/p)==sha(root/p)==h
 assert physical_source(root)==sorted(bound['sourceInputs'])
 for p,h in bound['sourceInputs'].items():assert sha(root/p)==h
 method=inventory(here);method.pop('METHOD-SEAL.json');assert method==json.loads((here/'METHOD-SEAL.json').read_text())['files'];assert sha(pathlib.Path(binding['ownedModule']['path']))==binding['ownedModule']['sha256']
 return {'sourceRole':role,'root':str(root),'buildRevision':bound['revision'],'actualBuildInfoSHA256':sha(build),'actualRuntimeAssets':bound['assets'],'materializedSourceInputs':bound['sourceInputs'],'method':method,'methodSealSHA256':sha(here/'METHOD-SEAL.json'),'ownedModuleSHA256':binding['ownedModule']['sha256']}
def validate(raw,role):
 assert raw['status']=='capture-complete-art-review-pending' and not raw['errors'] and not raw.get('primaryError') and not raw['finalizationErrors'] and raw['playableComplete'] is True and raw['finishedBeforeDeadline'] is True
 assert raw['freezeBefore']==raw['freezeAfter'] and raw['wholeCaseBudgetMinutes']==20 and raw['viewport']=={'width':1280,'height':800} and raw['browser']['version']=='151.0.7922.34'
 assert raw['actualBuildRevision']==binding['roles'][role]['revision'] and raw['directGameStateWrites']==raw['directClockWrites']==raw['directStorageWrites']==0 and raw['retry'] is False and raw['noImagePostProcessing'] is True
 assert len(raw['publicSetups'])==1 and len(raw['captures'])==2 and raw['entryExitComplete'] is True and raw['elevatorExecuted'] is False and raw['ownedBrowserClose']['boundedCloseAccepted'] is True
 assert raw['entryInside']['interior']['buildingId']=='south-085' and raw['entryInside']['interior']['colliderCount']>0 and raw['exitAfter']['exterior']['southInteriorId'] is None and raw['exitAfter']['renderVisibility']['outdoor'] is True
 for shot in raw['captures']:
  assert sha(native/shot['image'])==shot['imageSha256'] and sha(native/shot['pose'])==shot['poseSha256'];data=(native/shot['image']).read_bytes();assert data[:8]==b'\\x89PNG\\r\\n\\x1a\\n' and [int.from_bytes(data[16:20],'big'),int.from_bytes(data[20:24],'big')]==[1280,800]
  pose=json.loads((native/shot['pose']).read_text());assert pose['before']['position']==pose['after']['position'] and pose['before']['teleportRevision']==pose['after']['teleportRevision']
 if role=='candidate':assert raw['referencePosesMatched'] is True
\n'''
wrapper=wrapper[:start]+functions+wrapper[end:]
wrapper=wrapper.replace("binding['roles'][a.mode]['gitHead']","None")
wrapper=wrapper.replace("'candidateUncommittedPreview':a.mode=='candidate'","'candidateUncommittedPreview':binding['roles'][a.mode]['uncommittedPreview']")
wrapper=wrapper.replace('capture-resident-motion.mjs','capture-streetarrival.mjs').replace('15*60+120','20*60+120').replace('native-resident-motion','native-streetarrival')
wrapper=wrapper.replace("assert os.statvfs(temp).f_bavail*os.statvfs(temp).f_frsize>1024**3","assert os.statvfs(temp).f_bavail*os.statvfs(temp).f_frsize>400*1024**2")
ast.parse(wrapper)
(HERE/'run-owned-streetarrival.py').write_text(wrapper)
print(json.dumps({'sourceMaterializedFiles':len(source),'runtimeAssets':len(build['assets']),'beforeBuildSHA256':sha(ROOT/'dist/build-info.json'),'candidateBound':False,'GPUExecuted':False}))
