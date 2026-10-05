/** Real-game photographs and active observation. Preparation alone runs no browser. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const usage = 'node tools/capture-resident-extra.mjs --mode baseline|authored --case north-book|north-phone|north-cup-owner|south-parcel --project-root PROJECT --root DIST --output NEW_DIR [--git-root GIT_PROJECT] [--port 5194] [--plan-only true]';
const options = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const flag = process.argv[i], value = process.argv[i + 1];
  if (flag === '--help') { console.log(usage); process.exit(0); }
  assert.ok(['--mode','--case','--project-root','--root','--output','--git-root','--port','--plan-only'].includes(flag) && value, usage);
  options[flag.slice(2)] = value;
}
assert.ok(['baseline','authored'].includes(options.mode), usage);
assert.ok(options['project-root'], usage);
const projectRoot = resolve(options['project-root']);
const cases = {
  'north-book': { buildingId:'design-foundry', id:'resident-design-foundry-3', role:'commuter', prop:'book', x:80, z:-910, frontZ:-858, strategy:'front' },
  'north-phone': { buildingId:'lantern-tower', id:'resident-lantern-tower-1', role:'commuter', prop:'phone', x:560, z:-630, frontZ:-578, strategy:'left-front' },
  'north-cup-owner': { buildingId:'jade-bank', id:'resident-jade-bank-3', role:'shopkeeper', prop:'cup', x:-560, z:-630, frontZ:-578, strategy:'front', owners:true },
  'south-parcel': { source:'Actual delivery cargo bound in harbor-life-renderer', strategy:'public-supply-watch' }
};
assert.ok(cases[options.case], usage);
assert.ok(options.mode==='authored'||options.case!=='south-parcel','South actual parcel probe is unavailable in the baseline; this extra case requires authored review');
const selectedCase=cases[options.case]; let expectedQuality='high';
const plan = {
  mode: options.mode, browserVersion: '151.0.7922.34', viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1,
  quality: 'high', hour: 16.5, dayCycle: false,
  selectedCase: { name:options.case, ...selectedCase },
  routePolicy: 'Independent public Atlas for the named address; one pre-planned pavement approach from actual read-only starting NPC coordinates, no chase or endpoint retry. South uses shipped harbor supply UI.',
  actionObservation: { minimumWallSeconds:45, actualSimulationSeconds:'recorded separately', movement:'one 4 m x leg out and back, then input released; no menus or pause in this segment' },
  budgets: { totalWallSeconds: options.case==='south-parcel'?2700:1080, legWallSeconds: 180, readyWallSeconds: 180, assetWallSeconds: 120,
    ...(options.case==='south-parcel'?{naturalStartupSimulationSeconds:75,naturalStartupWallSeconds:1200,naturalSouthParcelWallSeconds:360}:{}) },
  ownerCase: options.case==='north-cup-owner' ? 'One jade-bank frontage; public High → Low → High, then first-person hide + physical far walk and real cooldown/return' : null,
  limits: ['Each separate case records its actual visible target only. Hidden book/phone/cup references are not visible action coverage; all 240 residents are not accepted.',
    'NPCs keep original journeys. A target leaving the planned viewpoint or parcel not appearing in the bounded window is recorded as a first failure, with no correction/relaunch/retry.',
    'Native visual quality requires manual inspection of raw frames; rule counts and transfer budgets do not certify art quality.',
    '45 wall seconds are reported separately from actual simulation seconds. Software GPU speed is not hardware performance evidence.']
};
if (options['plan-only'] === 'true') { console.log(JSON.stringify(plan, null, 2)); process.exit(0); }
assert.ok(options.root && options.output, usage);
const root = resolve(options.root), output = resolve(options.output), gitRoot = resolve(options['git-root'] || projectRoot);
const port = Number(options.port || 5194); assert.ok(Number.isInteger(port) && port > 0 && port < 65536);
await mkdir(output, { recursive: true }); assert.deepEqual(await readdir(output), [], 'use a new evidence directory');
const sha = value => createHash('sha256').update(value).digest('hex');
const manifestBytes = await readFile(resolve(root,'build-info.json')), manifest = JSON.parse(manifestBytes);
assert.ok(manifest.assets && Object.keys(manifest.assets).length > 0, 'actual frozen build requires a complete asset dictionary');
const metadata = { ...plan, status: 'preflight', startedAt: new Date().toISOString(), projectRoot, root, gitRoot,
  url: `http://127.0.0.1:${port}/`, manifestSha256: sha(manifestBytes), buildRevision: manifest.revision, builtVersion: manifest.version,
  assetHashes: manifest.assets, methodSha256: sha(await readFile(fileURLToPath(import.meta.url))),
  browser: null, git: null, events: [], captures: [], observations: [], errors: [], firstFailure: null, coverage: {},
  probePolicy: 'Read-only __NEON__.snapshot(). Missing baseline role/bitmap/hand probes are unavailable; renderer memory is CPU-reported counts, not measured VRAM.' };
try { metadata.git = { head: execFileSync('git',['rev-parse','HEAD'],{cwd:gitRoot,encoding:'utf8'}).trim(),
  status: execFileSync('git',['status','--porcelain=v1'],{cwd:gitRoot,encoding:'utf8'}) }; }
catch (error) { metadata.git = { available:false, reason:error.message }; }
const persist = () => writeFile(resolve(output,'metadata.json'), JSON.stringify(metadata,null,2)+'\n');
await writeFile(resolve(output,'build-info.json'),manifestBytes); await persist();
try {
  for (const [path, expected] of Object.entries(manifest.assets)) {
    assert.equal(sha(await readFile(resolve(root,path))),expected,`manifest fingerprint: ${path}`);
    if (path.startsWith('src/')) assert.equal(sha(await readFile(resolve(projectRoot,path))),expected,`frozen source fingerprint: ${path}`);
  }
} catch(error) {
  metadata.status='first-failure-preserved'; metadata.firstFailure={type:'preflight',at:new Date().toISOString(),message:error.stack||error.message};
  metadata.errors.push(metadata.firstFailure); await persist(); throw error;
}
const serverPath = resolve(projectRoot,'tools/server.mjs'); metadata.serverMethodSha256 = sha(await readFile(serverPath));
const { createStaticServer } = await import(pathToFileURL(serverPath).href);
const requireProject = createRequire(resolve(projectRoot,'package.json'));
const { chromium } = requireProject('@playwright/test');
let browser, context, page, server, stopDeadline, rejectApplicationError;
let ownedBrowserProcess, totalDeadlineAt, cleanupDeadlineAt, ownedKillStarted = false;
const recordError = detail => { const record = { at: new Date().toISOString(), ...detail }; metadata.errors.push(record);
  metadata.firstFailure ||= record; rejectApplicationError?.(new Error(`Application error: ${JSON.stringify(record)}`)); };
const checkErrors = () => { assert.equal(metadata.errors.length,0,`first application error: ${JSON.stringify(metadata.firstFailure)}`); };
const read = () => page.evaluate(() => {
  const s = window.__NEON__.snapshot();
  return { ready:s.ready, started:s.started, paused:s.paused, settings:s.settings, position:s.position, camera:s.camera,
    health:s.health, inCar:s.inCar, simulationTime:s.simulationTime, teleportRevision:s.teleportRevision,
    streaming:s.streaming, interior:{buildingId:s.city.interior.buildingId,floorId:s.city.interior.floorId},
    north:(s.city.people?.people || []).filter(p => ['design-foundry','lantern-tower','jade-bank'].includes(p.buildingId)),
    sampleLife:s.city.sample?.life || {available:false},
    buildings:s.city.buildings.filter(b => ['design-foundry','lantern-tower','jade-bank','south-089'].includes(b.id)).map(b => ({id:b.id,x:b.x,z:b.z,width:b.width,depth:b.depth,entrance:b.entrance})),
    residentAssets:s.residentAssets ? {...s.residentAssets,review:s.residentAssets.review ? {...s.residentAssets.review,
      actors:s.residentAssets.review.actors.filter(a => a.id==='local-player'||a.coreVisible||a.id==='resident-design-foundry-3'||a.id==='resident-lantern-tower-1'||a.id==='resident-jade-bank-3'||a.props.some(p=>p.name==='Actual delivery cargo'&&p.effectivelyVisible))}:undefined}
      : {available:false,reason:'This build exposes no resident asset library'},
    renderer:s.renderer, canvas:{width:document.getElementById('game').width,height:document.getElementById('game').height},
    frameTiming:s.timing, fps:s.fps };
});
const validate = (s,{quality=expectedQuality,firstPerson}={}) => {
  checkErrors(); assert.equal(s.paused,false); assert.equal(s.started,true); assert.equal(s.settings.quality,quality);
  assert.equal(s.settings.dayCycle,false); assert.equal(s.settings.hour,16.5); assert.equal(s.inCar,null);
  if (firstPerson !== undefined) assert.equal(s.settings.firstPerson,firstPerson);
  assert.equal(s.streaming?.failed || 0,0); assert.equal(s.renderer?.contextLost,false);
  assert.equal(s.canvas.width,quality==='low'?1024:1280); assert.equal(s.canvas.height,quality==='low'?640:800);
};
const awaitRenderedCamera = () => page.waitForFunction(() => {
  const camera=window.__NEON__?.snapshot().camera;
  return !!camera && [camera.yaw,camera.pitch,camera.position?.x,camera.position?.y,camera.position?.z,
    camera.focus?.x,camera.focus?.y,camera.focus?.z].every(Number.isFinite);
},null,{polling:'raf',timeout:plan.budgets.readyWallSeconds*1000});
const event = async (kind,detail={}) => { await awaitRenderedCamera(); const state=await read(); validate(state); const row={kind,at:new Date().toISOString(),detail,state};
  metadata.events.push(row); await persist(); return state; };
const face = async (yaw,pitch) => {
  await awaitRenderedCamera();
  const s=await read(), delta=Math.atan2(Math.sin(yaw-s.camera.yaw),Math.cos(yaw-s.camera.yaw));
  const sensitivity=s.settings.sensitivity, dp=pitch === undefined ? 0 : pitch-s.camera.pitch;
  const b=await page.locator('#game').boundingBox(), x=b.x+b.width*.82,y=b.y+b.height*.35;
  await page.mouse.move(x,y); await page.mouse.down();
  try { await page.mouse.move(x-delta/(.005*sensitivity),y+dp/(.003*sensitivity)); } finally { await page.mouse.up(); }
  await page.waitForFunction(({yaw,pitch}) => {
    const c=window.__NEON__.snapshot().camera;
    return Math.abs(Math.atan2(Math.sin(c.yaw-yaw),Math.cos(c.yaw-yaw))) < .004
      && (pitch === undefined || Math.abs(c.pitch-pitch) < .004);
  },{yaw,pitch},{polling:'raf',timeout:15000}); checkErrors();
};
const firstPerson = async enabled => {
  if ((await read()).settings.firstPerson !== enabled) await page.keyboard.press('v');
  await page.waitForFunction(enabled => window.__NEON__.snapshot().settings.firstPerson === enabled,enabled,{timeout:15000});
  await page.locator('#game').focus();
};
const walk = async (axis,target) => {
  await face(Math.PI); const before=await read(); validate(before);
  const sign=Math.sign(target-before.position[axis]); if (Math.abs(target-before.position[axis]) < .7) return before;
  const yaw=before.camera.yaw, candidates=[{key:'w',x:Math.sin(yaw),z:Math.cos(yaw)},
    {key:'s',x:-Math.sin(yaw),z:-Math.cos(yaw)}, {key:'d',x:-Math.cos(yaw),z:Math.sin(yaw)}, {key:'a',x:Math.cos(yaw),z:-Math.sin(yaw)}];
  const choice=candidates.sort((a,b)=>sign*(b[axis]-a[axis]))[0]; assert.ok(sign*choice[axis]>.995);
  // One continuous hold per fixed leg, one key-up. No endpoint retries or correction loops.
  await page.keyboard.down(choice.key);
  try { await page.waitForFunction(({axis,target,sign}) => {
    const s=window.__NEON__.snapshot(); if(s.paused) throw new Error('Paused during physical walk');
    return sign*(s.position[axis]-target)>=-.35;
  },{axis,target,sign},{polling:'raf',timeout:plan.budgets.legWallSeconds*1000}); }
  finally { await page.keyboard.up(choice.key); }
  const after=await event('physical-walk',{axis,target,key:choice.key,before:before.position});
  assert.equal(after.teleportRevision,before.teleportRevision,'physical movement cannot teleport');
  assert.ok(Math.abs(after.position[axis]-target)<.75,'one-hold leg endpoint tolerance');
  assert.ok(after.simulationTime-before.simulationTime < Math.abs(target-before.position[axis])/5.6+4,'walk must not stall');
  return after;
};
const atlas = async id => {
  await page.locator('#explore-city').click(); await page.locator(`[data-visit-building="${id}"]`).click();
  await page.waitForFunction(id => {
    const s=window.__NEON__.snapshot(),b=s.city.buildings.find(b=>b.id===id);
    return !s.paused && !s.streaming?.preparing && !s.streaming?.pending && !s.city.interior.buildingId
      && Math.hypot(s.position.x-b.entrance.x,s.position.z-b.entrance.z)<.1;
  },id,{timeout:180000}); await firstPerson(true); await event('independent-public-atlas-setup',{id});
};
const awaitRole = async (role,id) => {
  if(options.mode === 'baseline') return {available:false,reason:'Legacy baseline has no core-role expectation'};
  await page.waitForFunction(({role,id}) => {
    const a=window.__NEON__.snapshot().residentAssets;
    return !!a?.roles?.[role]?.loaded && a.selected.includes(id) && !a.error && a.instances<=12;
  },{role,id},{polling:'raf',timeout:plan.budgets.assetWallSeconds*1000});
  const s=await read(); assert.ok(s.residentAssets.instances<=12); assert.equal(s.residentAssets.error,null); return s.residentAssets;
};
const actorIn = (s,id) => s.residentAssets.review?.actors.find(a=>a.id===id);
const distance = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);
const actualProp = (actor,name) => actor?.props.find(p=>p.name===name && p.effectivelyVisible);
const captureRaw = async (label,detail={}) => {
  await awaitRenderedCamera(); const before=await read();validate(before);
  const path=resolve(output,`${label}.png`);await page.screenshot({path,fullPage:false});const after=await read();validate(after);
  metadata.captures.push({label,file:`${label}.png`,sha256:sha(await readFile(path)),detail,before,after});await persist();return after;
};
async function aimAt(target) {
  await awaitRenderedCamera(); const s=await read();
  const d=Math.hypot(target.x-s.camera.position.x,target.z-s.camera.position.z);
  const yaw=Math.atan2(target.x-s.camera.position.x,target.z-s.camera.position.z);
  const pitch=.15-Math.asin(Math.max(-.8,Math.min(.8,(target.y+1.55-s.camera.position.y)/Math.max(d,.1))));
  await face(yaw,pitch);
}
async function observe45(label,id) {
  const start=await event(`${label}-45-start`),startWall=Date.now(),teleport=start.teleportRevision,observationOffset=metadata.observations.length;
  const sample=async phase=>{const state=await read();validate(state);assert.equal(state.teleportRevision,teleport);
    metadata.observations.push({at:new Date().toISOString(),wallSeconds:(Date.now()-startWall)/1000,phase,id,state});await persist();return state;};
  await sample('before-walk');await new Promise(ok=>setTimeout(ok,5000));const idle=await sample('idle-before-walk');
  assert.ok(idle.simulationTime>start.simulationTime,'idle observation must actually advance');
  await walk('x',start.position.x+4);await sample('walk-out');await walk('x',start.position.x);const walkedBack=await sample('walk-return');
  const liveTarget=[...walkedBack.north,...(walkedBack.sampleLife.agents||[])].find(a=>a.id===id);
  if(liveTarget&&!liveTarget.insideBuildingId){await aimAt(liveTarget);await sample('facing-actual-target');}
  while(Date.now()-startWall<45000){await new Promise(ok=>setTimeout(ok,1500));await sample('released-input-idle');}
  const end=await sample('complete');assert.ok(end.simulationTime>start.simulationTime);
  const segment=metadata.observations.slice(observationOffset);
  const actorRows=segment.map(o=>actorIn(o.state,id)).filter(Boolean),first=actorRows[0];
  const logicalRows=segment.map(o=>[...o.state.north,...(o.state.sampleLife.agents||[])].find(a=>a.id===id)).filter(Boolean);
  metadata.coverage.motion={wallSeconds:(Date.now()-startWall)/1000,simulationSeconds:end.simulationTime-start.simulationTime,
    identityReceipts:logicalRows.map(a=>({id:a.id,name:a.name,role:a.role,style:a.style,state:a.state,phase:a.phase,buildingId:a.buildingId,insideBuildingId:a.insideBuildingId,floorId:a.floorId})),
    actualPropUUIDs:[...new Set(actorRows.flatMap(a=>a.props.filter(p=>p.effectivelyVisible).map(p=>p.uuid)))],
    actualSkeletonUUIDs:[...new Set(actorRows.map(a=>a.instanceSkeletonUUID).filter(Boolean))],
    maximumActorDisplacement:first?Math.max(...actorRows.map(a=>distance(a.worldPosition,first.worldPosition))):null,
    jointAngleChanges:first?Object.fromEntries(Object.entries(first.joints).map(([joint,angles])=>[joint,Math.max(...actorRows.map(a=>Math.hypot(a.joints[joint].x-angles.x,a.joints[joint].y-angles.y,a.joints[joint].z-angles.z)))])):null,
    propFramesAreActualCachedTransforms:true,probeAvailable:!!end.residentAssets.review};await persist();return end;
}
async function publicQuality(quality) {
  await page.locator('#pause').click();await page.locator('[data-tab="settings"]').click();
  await page.locator('#quality').selectOption(quality);expectedQuality=quality;
  metadata.events.push({kind:'public-quality-menu-selection',at:new Date().toISOString(),detail:{quality},state:await read()});await persist();
  await page.locator('#resume').click();await page.waitForFunction(()=>{const s=window.__NEON__.snapshot();return s.started&&!s.paused&&!s.streaming?.preparing&&!s.streaming?.pending;},null,{timeout:180000});
  return event('public-quality-resumed',{quality});
}
async function ownerCase(id) {
  await firstPerson(false);await awaitRole('commuter','local-player');const before=await event('owner-high-before');
  const beforeTarget=actorIn(before,id),beforeUUIDs=beforeTarget?.props.map(p=>p.uuid)||[];
  const low=await publicQuality('low');await captureRaw('03-low-real-readback');
  if(options.mode==='authored') {
    assert.ok(low.residentAssets.review,'authored owner probe must exist');
    assert.equal(low.residentAssets.instances,0);assert.equal(low.residentAssets.review.templateOwners.geometries,0);
    assert.equal(low.residentAssets.review.templateOwners.imageBitmaps,0);assert.equal(low.residentAssets.review.instanceOwners.skeletons,0);
    assert.ok(low.residentAssets.review.disposeCalls.imageBitmapCloseCalls>=before.residentAssets.review.disposeCalls.imageBitmapCloseCalls+before.residentAssets.review.templateOwners.imageBitmaps);
    assert.ok(low.residentAssets.review.actors.every(a=>!a.coreVisible),'Low cannot leave another near body visible');
  }
  await publicQuality('high');await awaitRole('commuter','local-player');const high=await event('owner-high-restored');
  if(options.mode==='authored') {
    const player=actorIn(high,'local-player');assert.ok(player?.coreVisible);assert.ok(high.residentAssets.review.templateOwners.imageBitmaps>0);
    assert.ok(high.residentAssets.requests>before.residentAssets.requests);assert.ok(high.residentAssets.generation>before.residentAssets.generation);
    assert.notEqual(player.instanceSkeletonUUID,actorIn(before,'local-player')?.instanceSkeletonUUID);
    const target=actorIn(high,id);metadata.coverage.originalTargetAfterQuality=target?{id,retainedOriginalPropUUIDs:beforeUUIDs.every(uuid=>target.props.some(p=>p.uuid===uuid)),coreVisible:target.coreVisible,props:target.props,hands:target.hands}:{status:'not-materialized-after-natural-journey'};
    if(target)assert.ok(beforeUUIDs.every(uuid=>target.props.some(p=>p.uuid===uuid)),'original props must not be replaced by new objects');
  }
  await captureRaw('04-high-owner-restored');await firstPerson(true);await walk('x',-530);const far=await event('physical-far');
  if(options.mode==='authored')await page.waitForFunction(()=>window.__NEON__.snapshot().residentAssets.instances===0,null,{polling:'raf',timeout:180000});
  const idleStart=await event('far-zero-instance-cooldown-start');
  await page.waitForFunction(time=>window.__NEON__.snapshot().simulationTime-time>=13,idleStart.simulationTime,{polling:'raf',timeout:240000});
  const evicted=await event('far-real-cooldown-complete');
  if(options.mode==='authored'){
    assert.equal(evicted.residentAssets.instances,0);assert.equal(evicted.residentAssets.review.templateOwners.imageBitmaps,0);
    assert.equal(evicted.residentAssets.review.templateOwners.geometries,0);assert.equal(evicted.residentAssets.review.instanceOwners.skeletons,0);
  }
  // A local visible player guarantees a real returning actor even if the NPC
  // naturally enters a room during this window; no journey or prop is forced.
  await walk('x',before.position.x);await firstPerson(false);await awaitRole('commuter','local-player');const returned=await event('physical-return-real-role-reload');
  if(options.mode==='authored'){assert.ok(returned.residentAssets.review.templateOwners.imageBitmaps>0);assert.ok(returned.residentAssets.requests>evicted.residentAssets.requests);}
  metadata.coverage.owners={status:options.mode==='authored'?'actual-readbacks-recorded':'probe-unavailable-in-baseline',before,low,high,far,idleStart,evicted,returned,
    driverVRAMMeasured:false,note:'CPU owner references and successful bitmap.close/dispose calls; renderer counts retained separately.'};await captureRaw('05-real-return');
}
async function northCase() {
  await atlas(selectedCase.buildingId);const initial=await read(),target=initial.north.find(p=>p.id===selectedCase.id);
  assert.ok(target?.materialized&&!target.insideBuildingId,'actual initial target must be outdoors');
  assert.ok(Math.abs(target.y-initial.position.y)<1.2,'approach is ground pavement, not another floor');
  if(selectedCase.strategy==='front'){
    assert.ok(Math.abs(target.z-selectedCase.frontZ)<1.5,'front social target stays on this actual pavement');
    // The 1.8 m outward pavement offset clears the second social NPC and stays away from the road.
    await walk('z',target.z+1.8);await walk('x',target.x+2.6);
  } else {
    assert.ok(Math.abs(target.x-(selectedCase.x-62))<1.5 && target.z>selectedCase.z && target.z<=selectedCase.frontZ,'phone approach uses actual left-front pavement');
    await walk('x',target.x+2.6);await walk('z',target.z);
  }
  let s=await read(),now=s.north.find(p=>p.id===selectedCase.id);assert.ok(now?.materialized&&!now.insideBuildingId);
  assert.ok(distance(now,s.position)<=3.5,'target remained in real close viewpoint');await aimAt(now);await awaitRole(selectedCase.role,selectedCase.id);
  s=await event('actual-north-prop-before');const actor=actorIn(s,selectedCase.id),propName=`Citizen ${selectedCase.prop}`;
  if(options.mode==='authored'){
    assert.ok(actor?.coreVisible);const prop=actualProp(actor,propName);assert.ok(prop,'expected original prop is actually visible');assert.equal(prop.hand,'left');
    metadata.coverage.visibleOriginalProp={id:selectedCase.id,name:prop.name,uuid:prop.uuid,parentName:prop.parentName,hand:prop.hand,position:prop.position,hands:actor.hands};
    metadata.coverage.retainedNorthPropReferences=Object.fromEntries(['book','phone','cup'].map(name=>[name,actor.props.filter(p=>p.name===`Citizen ${name}`)]));
  } else metadata.coverage.visibleOriginalProp={available:false,reason:'No baseline body/hand probe; photo awaits manual inspection'};
  await captureRaw('01-original-prop-close',{id:selectedCase.id,name:propName});await observe45('north',selectedCase.id);
  await captureRaw('02-real-45-second-end');if(selectedCase.owners)await ownerCase(selectedCase.id);
}
async function southCase() {
  await page.locator('#harbor-life').click();await page.locator('[data-sample-supply]').click();
  await page.waitForFunction(()=>{const s=window.__NEON__.snapshot();return s.started&&!s.paused&&!s.streaming?.preparing&&!s.streaming?.pending;},null,{timeout:180000});
  await firstPerson(true);const start=await event('public-real-supply-counter');assert.ok(Math.hypot(start.position.x-193.5,start.position.z-119.97975447401404)<.1,'actual shipped loading counter');
  const supply=start.buildings.find(b=>b.id==='south-089');assert.ok(supply);
  // This short segment lies inside the real door-to-counter clearSegment chosen by HarborLife.
  await walk('x',start.position.x+Math.sign(supply.entrance.x-start.position.x)*2.4);await event('physical-counter-viewpoint');
  // Autonomous orders deliberately wait75 simulation seconds before reservation.
  // SwiftShader wall time is recorded separately; never alter the real world clock.
  const lifeSource=await readFile(resolve(root,'src/harbor-life.js'),'utf8');
  assert.ok(lifeSource.includes('this.time - j.createdTick * HARBOR_LIFE_STEP >= 75'),'served autonomous order grace-period contract');
  const actualOrders=start.sampleLife.availableJobs;assert.ok(actualOrders.length>0,'real funded supply orders required');
  assert.ok(actualOrders.every(j=>Number.isSafeInteger(j.createdTick)&&j.createdTick>=0));
  const eligibleSimulationTime=Math.min(...actualOrders.map(j=>j.createdTick*.1+plan.budgets.naturalStartupSimulationSeconds));
  const startupBegan=Date.now();let found,last;
  const observeParcel=async(phase,began)=>{
    const s=await read();validate(s);assert.equal(s.teleportRevision,start.teleportRevision);
    metadata.observations.push({at:new Date().toISOString(),phase,wallSeconds:(Date.now()-began)/1000,state:s});
    found=s.residentAssets.review?.actors.find(a=>a.coreVisible&&distance(a.worldPosition,s.position)<=3.5&&a.props.some(p=>p.name==='Actual delivery cargo'&&p.effectivelyVisible&&p.source==='explicit-original-cargo'));
    last=s;await persist();return s;
  };
  while(Date.now()-startupBegan<plan.budgets.naturalStartupWallSeconds*1000){
    const s=await observeParcel('natural-order-startup',startupBegan);
    if(found||s.simulationTime>=eligibleSimulationTime)break;
    await new Promise(ok=>setTimeout(ok,1500));
  }
  metadata.coverage.naturalStartup={sourceSHA256:sha(lifeSource),sourceContract:'real order createdTick*.1+75 simulation seconds',
    actualOrderIds:actualOrders.map(j=>j.id),actualCreatedTicks:actualOrders.map(j=>j.createdTick),eligibleSimulationTime,
    initialSimulationTime:start.simulationTime,endSimulationTime:last?.simulationTime,wallSeconds:(Date.now()-startupBegan)/1000,
    maximumWallSeconds:plan.budgets.naturalStartupWallSeconds,worldClockWritten:false};await persist();
  assert.ok(last&&(found||last.simulationTime>=eligibleSimulationTime),'natural75sim order startup exceeded1200 wall seconds; no forced pickup or retry');
  const began=Date.now();
  while(!found&&Date.now()-began<plan.budgets.naturalSouthParcelWallSeconds*1000){
    await observeParcel('natural-supply-watch',began);
    if(found)break;await new Promise(ok=>setTimeout(ok,1500));
  }
  metadata.coverage.naturalParcelWatch={wallSeconds:(Date.now()-began)/1000,maximumWallSeconds:360,
    simulationTime:last?.simulationTime,originalVisibilityRadius:3.5,originalRequiredProp:'Actual delivery cargo'};
  await persist();assert.ok(found,'actual South parcel did not appear within360 wall seconds after real75sim startup; no forced pickup or retry');
  const prop=actualProp(found,'Actual delivery cargo');assert.equal(prop.hand,'left');await aimAt({...found.worldPosition,y:found.worldPosition.y});
  metadata.coverage.actualSouthParcel={id:found.id,role:found.role,prop,hands:found.hands,logical:(await read()).sampleLife.agents.find(a=>a.id===found.id),
    jobId:{available:false,reason:'Public summary does not expose agent cargoJobId; original visible cargo source binds only an actual cargoJobId'}};
  await captureRaw('01-actual-south-parcel',{id:found.id,uuid:prop.uuid});await observe45('south',found.id);await captureRaw('02-south-45-second-end');
}
const core = async () => {
  server=await createStaticServer({root}); await new Promise((ok,bad)=>{server.once('error',bad);server.listen(port,'127.0.0.1',ok);});
  browser=await chromium.launch({headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  // Pinned Playwright 1.62.1's in-process connection maps this exact browser
  // to its launched ChildProcess. No PID search, global kill or other browser.
  ownedBrowserProcess=browser._connection?.toImpl?.(browser)?.options?.browserProcess;
  assert.ok(ownedBrowserProcess?.process?.pid && typeof ownedBrowserProcess.kill === 'function',
    'pinned launcher must expose the owned browser process for bounded cleanup');
  metadata.cleanup={budgetSeconds:30,ownedBrowserPID:ownedBrowserProcess.process.pid,steps:[],hardStop:false};
  metadata.browser={version:browser.version(),executable:'Playwright Chromium',node:process.version,backend:'SwiftShader WebGL'};
  assert.equal(browser.version(),plan.browserVersion); context=await browser.newContext({viewport:plan.viewport,deviceScaleFactor:1,
    recordVideo:{dir:resolve(output,'raw-video'),size:plan.viewport}}); page=await context.newPage();
  page.setDefaultTimeout(180000); page.setDefaultNavigationTimeout(180000);
  page.on('pageerror',error=>recordError({type:'pageerror',message:error.message}));
  page.on('console',message=>{if(message.type()==='error')recordError({type:'console',message:message.text()});});
  page.on('response',response=>{if(response.status()>=400)recordError({type:'http',status:response.status(),url:response.url()});});
  await page.goto(metadata.url); await page.waitForFunction(()=>window.__NEON__?.snapshot().ready&&!document.getElementById('start').disabled);
  await page.locator('#welcome-settings').click(); await page.locator('#quality').selectOption('high'); await page.locator('#cycle').uncheck();
  assert.equal(Number(await page.locator('#time').inputValue()),16.5); await page.locator('#time').press('ArrowLeft'); await page.locator('#time').press('ArrowRight');
  await page.locator('#volume').press('Home'); await page.locator('#resume').click(); await page.locator('#start').click();
  await page.waitForFunction(()=>{const s=window.__NEON__.snapshot();return s.started&&!s.paused&&!s.streaming?.preparing&&!s.streaming?.pending;});
  await page.locator('#game').focus(); await firstPerson(true); metadata.status='running'; await event('visible-settings-ready');
  if(options.case==='south-parcel')await southCase();else await northCase();
  metadata.status='extra-recorded-pending-manual-review'; metadata.endedAt=new Date().toISOString(); await persist();
};
function beginCleanup() {
  cleanupDeadlineAt ||= Math.min(Date.now()+30000,totalDeadlineAt || Infinity);
  return cleanupDeadlineAt;
}
function stopOwnedBrowser(reason) {
  if (ownedKillStarted || !ownedBrowserProcess) return;
  ownedKillStarted=true;
  metadata.cleanup ||= {budgetSeconds:30,steps:[]};
  metadata.cleanup.hardStop={at:new Date().toISOString(),reason,pid:ownedBrowserProcess.process.pid};
  // This bound kill closes only the process group spawned by our launch().
  try { Promise.resolve(ownedBrowserProcess.kill()).catch(error=>recordError({type:'owned-browser-kill',message:error.message})); }
  catch(error) { recordError({type:'owned-browser-kill',message:error.message}); }
}
async function boundedOwnedStep(kind,operation,maximumMs=Infinity) {
  let timer;
  const remaining=Math.min(maximumMs,beginCleanup()-Date.now());
  try {
    assert.ok(remaining>0,`Owned cleanup deadline reached before ${kind}`);
    const result=await Promise.race([Promise.resolve().then(operation),new Promise((_,bad)=>{
      timer=setTimeout(()=>bad(new Error(`Owned cleanup deadline while ${kind}`)),remaining);
    })]);
    metadata.cleanup ||= {budgetSeconds:30,steps:[]};
    metadata.cleanup.steps.push({kind,status:'closed',at:new Date().toISOString()});return result;
  } catch(error) {
    recordError({type:kind,message:error.message});
    metadata.status='first-failure-preserved';process.exitCode=1;
    stopOwnedBrowser(`${kind}: ${error.message}`);server?.closeAllConnections?.();
  } finally {clearTimeout(timer);}
}
try {
  totalDeadlineAt=Date.now()+plan.budgets.totalWallSeconds*1000;
  const totalTimeout=new Promise((_,bad)=>{stopDeadline=setTimeout(()=>{
    const error=new Error('Fixed total wall budget exceeded including owned cleanup; no retry');
    recordError({type:'total-deadline',message:error.message});stopOwnedBrowser('total deadline');server?.closeAllConnections?.();bad(error);
  },plan.budgets.totalWallSeconds*1000);});
  await Promise.race([core(),new Promise((_,bad)=>{rejectApplicationError=bad;}),totalTimeout]);
} catch(error) {
  recordError({type:'method',message:error.stack||error.message});metadata.status='first-failure-preserved';metadata.endedAt=new Date().toISOString();
  if(page&&!page.isClosed())metadata.failureState=await boundedOwnedStep('failure-snapshot',()=>read(),5000);
  console.error(error.stack||error.message);process.exitCode=1;
} finally {
  // Both deadlines remain live during video/context/browser/server closure.
  beginCleanup();
  if(context)await boundedOwnedStep('context-close',()=>context.close());
  if(browser)await boundedOwnedStep('browser-close',()=>browser.close());
  if(server)await boundedOwnedStep('server-close',()=>new Promise((ok,bad)=>server.close(error=>error?bad(error):ok())));
  if(Date.now()>=cleanupDeadlineAt){stopOwnedBrowser('30-second owned cleanup limit');server?.closeAllConnections?.();}
  metadata.closedAt=new Date().toISOString();await persist();clearTimeout(stopDeadline);
}
