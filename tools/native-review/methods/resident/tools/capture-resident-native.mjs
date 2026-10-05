/** Real-game photographs and active observation. Preparation alone runs no browser. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const usage = 'node tools/capture-resident-native.mjs --mode baseline|authored --project-root PROJECT --root DIST --output NEW_DIR [--git-root GIT_PROJECT] [--port 5194] [--plan-only true]';
const options = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const flag = process.argv[i], value = process.argv[i + 1];
  if (flag === '--help') { console.log(usage); process.exit(0); }
  assert.ok(['--mode','--project-root','--root','--output','--git-root','--port','--plan-only'].includes(flag) && value, usage);
  options[flag.slice(2)] = value;
}
assert.ok(['baseline','authored'].includes(options.mode), usage);
assert.ok(options['project-root'], usage);
const projectRoot = resolve(options['project-root']);
const plan = {
  mode: options.mode, browserVersion: '151.0.7922.34', viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1,
  quality: 'high', hour: 16.5, dayCycle: false,
  core: [
    { case: 'worker', setup: 'Public Atlas tide-museum entrance', walk: [['z',-440.8],['x',-571]], target: 'resident-tide-museum-3', maxHorizontalDistance: 3.5 },
    { case: 'commuter-player', setup: 'Same street position, public V to third person and ordinary pointer orbit', target: 'local-player', note: 'Shipped chase camera has no public close zoom. This is a body/wardrobe view, not a facial close-up.' },
    { case: 'shopkeeper', setup: 'Independent public Atlas tide-museum entrance', walk: 'One continuous ordinary WASD/Z approach via outside frontage x=-510,z=-455, then track the actual moving NPC through the original3.5m close photograph; no NPC or clock pause', target: 'resident-tide-museum-1', maxHorizontalDistance: 3.5 },
    { case: 'active-observation', setup: 'Independent public Atlas tide-museum entrance; walk to front pavement', minimumWallSeconds: 45,
      activeInputs: 'Walk 4 m west and back using ordinary WASD; then release input, remain unpaused and read actual NPC motion/activities.',
      excluded: 'No Atlas/settings, position/clock writes or pause during the observation segment.' }
  ],
  budgets: { totalWallSeconds: 1080, legWallSeconds: 180, readyWallSeconds: 180, assetWallSeconds: 120 },
  plannedExtensions: ['North original book / phone / cup hand-anchor observations', 'South courier actual cargo', 'near / far / Low / High template and bitmap ownership'],
  limits: ['Core completion does not establish two held-prop types or all 240 residents.',
    'NPCs keep moving. The shopkeeper interview follows the actual public pose once through ordinary WASD/Z; indoor departure or any failed input/resource/application guard is preserved, with no correction, relaunch or retry.',
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
let ownedBrowserProcess, ownedBrowserIdentityBefore, totalDeadlineAt, cleanupDeadlineAt, ownedKillStarted = false;
async function ownedBrowserIdentity(pid) {
 try {
  const text=await readFile(`/proc/${pid}/stat`,'utf8'),fields=text.slice(text.lastIndexOf(')')+2).trim().split(/\s+/);
  return {pid,state:fields[0],ppid:Number(fields[1]),startTicks:fields[19]};
 } catch(error) {if(error.code==='ENOENT')return null;throw error;}
}
function classifyOwnedBrowserClose({before,current,apiClose,exitCode,signalCode,callerForceInvoked,hardDeadlineReached}) {
 const knownIdentity=Number.isInteger(before?.pid)&&before.pid>0&&typeof before?.startTicks==='string'&&/^\d+$/.test(before.startTicks);
 const exactIdentityStillPresent=Boolean(current&&current.pid===before?.pid&&current.startTicks===before?.startTicks);
 const observedExit=exitCode!==null&&exitCode!==undefined||signalCode!==null&&signalCode!==undefined;
 const identityReadConfirmed=current!==undefined;
 const exactOwnedClosureConfirmed=knownIdentity&&identityReadConfirmed&&!exactIdentityStillPresent&&observedExit;
 const apiCloseResolved=apiClose?.status==='closed',forcedExit=signalCode==='SIGKILL';
 const exitModeEligible=exitCode===0&&!signalCode||exitCode===null&&signalCode==='SIGKILL';
 const withinOuterCap=Number.isFinite(apiClose?.elapsedMs)&&Number.isFinite(apiClose?.timeoutMs)&&apiClose.elapsedMs<=apiClose.timeoutMs;
 return {before,current,apiCloseResolved,outerCapMs:35000,providerDefaultInnerCloseMs:30000,
  apiCloseElapsedMs:apiClose?.elapsedMs??null,exitCode,signalCode,forcedExit,
  graceful:apiCloseResolved&&exactOwnedClosureConfirmed&&exitCode===0&&!signalCode,
  forceAttribution:forcedExit&&apiCloseResolved&&!callerForceInvoked&&!hardDeadlineReached?'supported-API-close-resolved-SIGKILL-provider-fallback-consistent':'none-or-not-eligible',
  providerInternalBranchIndependentlyObserved:false,callerForceInvoked:Boolean(callerForceInvoked),
  hardDeadlineReached:Boolean(hardDeadlineReached),identityReadConfirmed,exactOwnedClosureConfirmed,exitModeEligible,withinOuterCap,
  boundedCloseAccepted:apiCloseResolved&&exactOwnedClosureConfirmed&&exitModeEligible&&withinOuterCap&&!callerForceInvoked&&!hardDeadlineReached};
}

const recordError = detail => { const record = { at: new Date().toISOString(), ...detail }; metadata.errors.push(record);
  metadata.firstFailure ||= record; rejectApplicationError?.(new Error(`Application error: ${JSON.stringify(record)}`)); };
const checkErrors = () => { assert.equal(metadata.errors.length,0,`first application error: ${JSON.stringify(metadata.firstFailure)}`); };
const read = () => page.evaluate(() => {
  const s = window.__NEON__.snapshot();
  return { ready:s.ready, started:s.started, paused:s.paused, settings:s.settings, position:s.position, camera:s.camera,
    health:s.health, inCar:s.inCar, simulationTime:s.simulationTime, teleportRevision:s.teleportRevision,
    streaming:s.streaming, interior:{buildingId:s.city.interior.buildingId,floorId:s.city.interior.floorId},
    north:(s.city.people?.people || []).filter(p => p.buildingId === 'tide-museum'),
    residentAssets:s.residentAssets || {available:false,reason:'This build exposes no resident asset library'},
    renderer:s.renderer, canvas:{width:document.getElementById('game').width,height:document.getElementById('game').height},
    frameTiming:s.timing, fps:s.fps };
});
const validate = (s,{quality='high',firstPerson}={}) => {
  checkErrors(); assert.equal(s.paused,false); assert.equal(s.started,true); assert.equal(s.settings.quality,quality);
  assert.equal(s.settings.dayCycle,false); assert.equal(s.settings.hour,16.5); assert.equal(s.inCar,null);
  if (firstPerson !== undefined) assert.equal(s.settings.firstPerson,firstPerson);
  assert.equal(s.streaming?.failed || 0,0); assert.equal(s.renderer?.contextLost,false);
  assert.equal(s.canvas.width,1280); assert.equal(s.canvas.height,800);
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
  const legDeadline=Math.min(totalDeadlineAt||Infinity,Date.now()+plan.budgets.legWallSeconds*1000);
  const legRemaining=()=>{const ms=legDeadline-Date.now();assert.ok(ms>0,'original fixed physical leg deadline');return ms;};
  await face(Math.PI); const before=await read(); validate(before);legRemaining();
  const sign=Math.sign(target-before.position[axis]); if (Math.abs(target-before.position[axis]) < .7) return before;
  const yaw=before.camera.yaw, candidates=[{key:'w',x:Math.sin(yaw),z:Math.cos(yaw)},
    {key:'s',x:-Math.sin(yaw),z:-Math.cos(yaw)}, {key:'d',x:-Math.cos(yaw),z:Math.sin(yaw)}, {key:'a',x:Math.cos(yaw),z:-Math.sin(yaw)}];
  const choice=candidates.sort((a,b)=>sign*(b[axis]-a[axis]))[0]; assert.ok(sign*choice[axis]>.995);
  const phases=[];
  async function hold(stage,endpoint,precision) {
    let first=null;const row={stage,endpoint,precision,key:choice.key,inputs:[]};phases.push(row);
    try {
      if(precision){row.inputs.push({action:'down',key:'z'});await page.keyboard.down('z');}
      row.inputs.push({action:'down',key:choice.key});await page.keyboard.down(choice.key);
      await page.waitForFunction(({axis,endpoint,sign})=>{const s=window.__NEON__.snapshot();if(s.paused)throw new Error('Paused during physical walk');return sign*(s.position[axis]-endpoint)>=0;},{axis,endpoint,sign},{polling:'raf',timeout:legRemaining()});
    } catch(error){first=error;row.firstError={name:error.name,message:error.message};}
    finally {
      for(const key of [choice.key,...(precision?['z']:[])])try{await page.keyboard.up(key);row.inputs.push({action:'up',key,confirmed:true});}
      catch(error){row.inputs.push({action:'up',key,confirmed:false,error:{name:error.name,message:error.message}});if(!first)first=error;else (metadata.secondaryMovementErrors ||= []).push({name:error.name,message:error.message});}
    }
    if(first)throw first; // No read/RPC or second hold after unconfirmed key-up.
    legRemaining();
  }
  // One planned coarse hold, then one slow fine hold: no chase, retry or correction loop.
  if(Math.abs(target-before.position[axis])>3.2) {
    await hold('coarse',target-sign*3.2,false);
    const coarse=await read();validate(coarse);legRemaining();
    assert.equal(coarse.teleportRevision,before.teleportRevision,'physical movement cannot teleport');
    assert.ok(sign*(target-coarse.position[axis])>0,'coarse phase must leave the planned precision region ahead');
    phases[0].after=coarse.position;
  }
  await hold('fine',target-sign*.3,true);
  const after=await event('physical-walk',{axis,target,key:choice.key,before:before.position,phases});legRemaining();
  assert.equal(after.teleportRevision,before.teleportRevision,'physical movement cannot teleport');
  assert.ok(Math.abs(after.position[axis]-target)<.75,'one-hold leg endpoint tolerance');
  assert.ok(after.simulationTime-before.simulationTime < Math.abs(target-before.position[axis])/5.6+4,'walk must not stall');
  return after;
};
const atlas = async () => {
  await page.locator('#explore-city').click(); await page.locator('[data-visit-building="tide-museum"]').click();
  await page.waitForFunction(() => {
    const s=window.__NEON__.snapshot(),b=s.city.buildings.find(b=>b.id==='tide-museum');
    return !s.paused && !s.streaming?.preparing && !s.streaming?.pending && !s.city.interior.buildingId
      && Math.hypot(s.position.x-b.entrance.x,s.position.z-b.entrance.z)<.1;
  },null,{timeout:180000}); await firstPerson(true); await event('independent-public-atlas-setup');
};
const awaitRole = async (role,id) => {
  if(options.mode === 'baseline') return {available:false,reason:'Legacy baseline has no core-role expectation'};
  await page.waitForFunction(({role,id}) => {
    const a=window.__NEON__.snapshot().residentAssets;
    return !!a?.roles?.[role]?.loaded && a.selected.includes(id) && !a.error && a.instances<=12;
  },{role,id},{polling:'raf',timeout:plan.budgets.assetWallSeconds*1000});
  const s=await read(); assert.ok(s.residentAssets.instances<=12); assert.equal(s.residentAssets.error,null); return s.residentAssets;
};
const capture = async (label,role,id,{player=false}={}) => {
  let s=await read(); validate(s);
  const target=player ? s.position : s.north.find(p=>p.id===id); assert.ok(target,'actual target identity exists');
  if(!player) {
    assert.ok(target.materialized && !target.insideBuildingId,'actual target is materialized on this pavement');
    assert.ok(Math.hypot(target.x-s.position.x,target.z-s.position.z)<=3.5,'actual NPC remains in fixed close viewpoint');
    const yaw=Math.atan2(target.x-s.camera.position.x,target.z-s.camera.position.z);
    const d=Math.hypot(target.x-s.camera.position.x,target.z-s.camera.position.z);
    const pitch=.15-Math.asin(Math.max(-.8,Math.min(.8,(target.y+1.55-s.camera.position.y)/Math.max(d,.1))));
    await face(yaw,pitch);
  }
  await awaitRole(role,id); s=await read(); validate(s);
  const path=resolve(output,`${label}.png`); await page.screenshot({path,fullPage:false}); const after=await read(); validate(after);
  metadata.captures.push({label,role,id,file:`${label}.png`,sha256:sha(await readFile(path)),before:s,after,
    assetProbe: options.mode==='authored' ? after.residentAssets : {available:false,reason:'Legacy baseline core probe unavailable'}});
  metadata.coverage[label]={status:'captured-pending-manual-visual-review',role,id}; await persist(); console.log(`Captured ${label}`);
};
function publicInterviewInput(s,corridorReached) {
  const p=s.position,n=s.target,distance=Math.hypot(n.x-p.x,n.z-p.z);
  const passedCorridor=corridorReached||p.x>=-510.6;
  const goal=passedCorridor?n:{x:-510,z:-455};
  const dx=goal.x-p.x,dz=goal.z-p.z,goalDistance=Math.hypot(dx,dz);
  if(passedCorridor&&distance<=2)return {keys:[],slow:false,passedCorridor,distance};
  const yaw=s.camera.yaw,candidates=[
    {keys:['w'],forward:1,strafe:0},{keys:['s'],forward:-1,strafe:0},
    {keys:['d'],forward:0,strafe:1},{keys:['a'],forward:0,strafe:-1},
    {keys:['w','d'],forward:1,strafe:1},{keys:['w','a'],forward:1,strafe:-1},
    {keys:['s','d'],forward:-1,strafe:1},{keys:['s','a'],forward:-1,strafe:-1}];
  for(const c of candidates){const q=Math.hypot(c.forward,c.strafe);c.x=(Math.sin(yaw)*c.forward-Math.cos(yaw)*c.strafe)/q;c.z=(Math.cos(yaw)*c.forward+Math.sin(yaw)*c.strafe)/q;c.dot=c.x*dx+c.z*dz;}
  const choice=candidates.sort((a,b)=>b.dot-a.dot)[0];
  // The corridor is a crossing waypoint, not the photograph endpoint.
  // Use public sprint only on its long unobstructed approach; release Shift
  // before the crossing and retain Z for the actual moving close interview.
  return {keys:choice.keys,slow:passedCorridor&&distance<=3,sprint:!passedCorridor&&goalDistance>3.2,passedCorridor,distance};
}
async function dynamicShopkeeperCapture() {
  const id='resident-tide-museum-1',started=await read(),startWall=Date.now();
  const approachDeadline=Math.min(totalDeadlineAt,startWall+plan.budgets.legWallSeconds*1000);
  let stop=false,phase='approach',phaseDeadline=approachDeadline,passedCorridor=false,first=null;
  const held=new Set(),trace=[],inputEvents=[];let lastSim=-1;
  let readyResolve,readyReject;const ready=new Promise((ok,bad)=>{readyResolve=ok;readyReject=bad;});
  const remaining=()=>{const ms=Math.min(totalDeadlineAt,phaseDeadline)-Date.now();assert.ok(ms>0,`original public interview ${phase} deadline`);return ms;};
  async function setHeld(next) {
    for(const key of [...held])if(!next.includes(key)){await page.keyboard.up(key);held.delete(key);inputEvents.push({action:'up',key,at:new Date().toISOString()});}
    for(const key of next)if(!held.has(key)){await page.keyboard.down(key);held.add(key);inputEvents.push({action:'down',key,at:new Date().toISOString()});}
  }
  const tracking=(async()=>{
    try {
      while(!stop) {
        remaining();const s=await read();validate(s);
        assert.equal(s.teleportRevision,started.teleportRevision,'ordinary interview input cannot teleport');
        const target=s.north.find(n=>n.id===id);assert.ok(target?.materialized&&!target.insideBuildingId,'actual shopkeeper must remain visible on its real pavement');
        const input=publicInterviewInput({...s,target},passedCorridor);passedCorridor=input.passedCorridor;
        if(s.simulationTime-lastSim>=.1){assert.ok(trace.length<2048,'finite interview pose record');trace.push({at:new Date().toISOString(),phase,simulationTime:s.simulationTime,player:s.position,target:{id,x:target.x,y:target.y,z:target.z,yaw:target.yaw,state:target.state,insideBuildingId:target.insideBuildingId},distance:input.distance,keys:input.keys,slow:input.slow});lastSim=s.simulationTime;}
        await setHeld([...input.keys,...(input.slow?['z']:[]),...(input.sprint?['Shift']:[])]);
        if(phase==='approach'&&passedCorridor&&input.distance<=3)readyResolve();
        await new Promise(ok=>setTimeout(ok,Math.min(100,remaining())));
      }
    } catch(error){first ||= error;readyReject(error);}
    finally {
      for(const key of [...held])try{await page.keyboard.up(key);held.delete(key);inputEvents.push({action:'up',key,confirmed:true,at:new Date().toISOString()});}
      catch(error){first ||= error;inputEvents.push({action:'up',key,confirmed:false,message:error.message});}
    }
  })();
  try {
    await ready;phase='capture';phaseDeadline=Math.min(totalDeadlineAt,Date.now()+plan.budgets.assetWallSeconds*1000);
    await capture('03-shopkeeper-close','shopkeeper',id);
    const photo=metadata.captures.at(-1);
    for(const s of [photo.before,photo.after]){const target=s.north.find(n=>n.id===id);assert.ok(target?.materialized&&!target.insideBuildingId);assert.ok(Math.hypot(target.x-s.position.x,target.z-s.position.z)<=3.5,'actual moving NPC remains within original close range during photograph');}
  } catch(error){first ||= error;}
  finally {stop=true;await tracking;metadata.coverage.dynamicShopkeeper={status:first?'first-failure-preserved':'recorded-pending-manual-review',method:'One continuous public WASD/Z approach and tracking photograph; NPC and world clock advance normally; new moving poses are not fixed original viewpoint equivalents',startedAt:new Date(startWall).toISOString(),endedAt:new Date().toISOString(),startSimulationTime:started.simulationTime,trace,inputEvents};await persist();}
  if(first)throw first;
  await event('dynamic-public-interview-complete',{id,continuousPublicInputs:true,approachWallCapSeconds:plan.budgets.legWallSeconds,captureWallCapSeconds:plan.budgets.assetWallSeconds});
}
const core = async () => {
  server=await createStaticServer({root}); await new Promise((ok,bad)=>{server.once('error',bad);server.listen(port,'127.0.0.1',ok);});
  browser=await chromium.launch({headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  // Pinned Playwright 1.62.1's in-process connection maps this exact browser
  // to its launched ChildProcess. No PID search, global kill or other browser.
  ownedBrowserProcess=browser._connection?.toImpl?.(browser)?.options?.browserProcess;
  assert.ok(ownedBrowserProcess?.process?.pid && typeof ownedBrowserProcess.kill === 'function',
    'pinned launcher must expose the owned browser process for bounded cleanup');
  ownedBrowserIdentityBefore=await ownedBrowserIdentity(ownedBrowserProcess.process.pid);
  assert.ok(ownedBrowserIdentityBefore&&ownedBrowserIdentityBefore.ppid===process.pid,'exact launched owner PID/startTicks');
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
  await atlas(); await walk('z',-440.8); await walk('x',-571); await capture('01-worker-close','worker','resident-tide-museum-3');
  await firstPerson(false); const s=await read(); await face(s.position.yaw+Math.PI,.18);
  await capture('02-commuter-player','commuter','local-player',{player:true});
  await atlas(); await dynamicShopkeeperCapture();
  await atlas(); await walk('z',-438); await firstPerson(false);
  const start=await event('active-observation-start'), startWall=Date.now(), teleport=start.teleportRevision;
  const sample=async phase=>{const state=await read();validate(state);assert.equal(state.teleportRevision,teleport);
    metadata.observations.push({at:new Date().toISOString(),wallSeconds:(Date.now()-startWall)/1000,phase,state});await persist();return state;};
  await sample('before-walk');
  await new Promise(ok=>setTimeout(ok,5000)); const idleBefore=await sample('released-input-idle-before-walk');
  assert.ok(idleBefore.simulationTime>start.simulationTime,'idle observation must remain unpaused and actually advance');
  await walk('x',start.position.x-4); await sample('walk-out'); await walk('x',start.position.x); await sample('walk-return');
  while(Date.now()-startWall<45000) { await new Promise(ok=>setTimeout(ok,1500)); await sample('released-input-idle'); }
  const end=await sample('complete'), wallSeconds=(Date.now()-startWall)/1000;
  assert.ok(end.simulationTime>start.simulationTime,'unpaused simulation must actually advance');
  const ids=start.north.map(p=>p.id), observedNPCMovement=ids.map(id=>{const poses=metadata.observations.map(o=>o.state.north.find(p=>p.id===id)).filter(Boolean);
    return {id,states:[...new Set(poses.map(p=>p.state))],maximumDisplacement:poses.length ? Math.max(...poses.map(p=>Math.hypot(p.x-poses[0].x,p.z-poses[0].z))) : 0};});
  metadata.coverage.activeObservation={status:'recorded-pending-motion-review',wallSeconds,simulationSeconds:end.simulationTime-start.simulationTime,
    playerWalkMetres:metadata.observations.filter(o=>o.phase==='walk-out'||o.phase==='walk-return').reduce((sum,o,i,rows)=>{const previous=i ? rows[i-1].state.position : start.position;return sum+Math.hypot(o.state.position.x-previous.x,o.state.position.z-previous.z);},0),observedNPCMovement,heldPropTypes:{available:false,reason:'Core case does not expose or certify original held-prop/hand states'}};
  await capture('04-observation-end-player','commuter','local-player',{player:true});
  metadata.status='core-recorded-pending-manual-review'; metadata.endedAt=new Date().toISOString(); await persist();
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
async function boundedOwnedStep(kind,operation,maximumMs=Infinity,ownerClose=false) {
  let timer;const started=Date.now();
  const remaining=ownerClose?Math.min(35000,totalDeadlineAt-Date.now()):Math.min(maximumMs,beginCleanup()-Date.now());
  try {
    assert.ok(remaining>0,`Owned cleanup deadline reached before ${kind}`);
    const result=await Promise.race([Promise.resolve().then(async()=>{
      const result=await operation();
      if(ownerClose){
        const child=ownedBrowserProcess.process;
        assert.equal(child.pid,ownedBrowserIdentityBefore.pid,'exact captured launched owner');
        const current=await ownedBrowserIdentity(child.pid);
        metadata.ownedBrowserClose=classifyOwnedBrowserClose({before:ownedBrowserIdentityBefore,current,apiClose:{status:'closed',timeoutMs:remaining,elapsedMs:Date.now()-started},exitCode:child.exitCode,signalCode:child.signalCode,callerForceInvoked:ownedKillStarted,hardDeadlineReached:Date.now()>=totalDeadlineAt});
        metadata.ownedBrowserClose.api='supported in-process browser.close → pinned browserProcess.close';
        assert.ok(metadata.ownedBrowserClose.boundedCloseAccepted,'resolved supported owner API must close exact child within35/whole cap');
      }
      return result;
    }),new Promise((_,bad)=>{timer=setTimeout(()=>bad(new Error(`Owned cleanup deadline while ${kind}`)),remaining);})]);
    metadata.cleanup ||= {budgetSeconds:30,steps:[]};
    metadata.cleanup.steps.push({kind,status:'closed',at:new Date().toISOString(),actualCapMs:remaining,outerCapMs:ownerClose?35000:null,elapsedMs:Date.now()-started});return result;
  } catch(error) {
    recordError({type:kind,message:error.message});
    metadata.status='first-failure-preserved';process.exitCode=1;
    stopOwnedBrowser(`${kind}: ${error.message}`);server?.closeAllConnections?.();
    if(ownerClose&&!metadata.ownedBrowserClose)metadata.ownedBrowserClose=classifyOwnedBrowserClose({before:ownedBrowserIdentityBefore,current:undefined,apiClose:{status:'rejected-or-timed-out',timeoutMs:remaining,elapsedMs:Date.now()-started},exitCode:ownedBrowserProcess?.process.exitCode,signalCode:ownedBrowserProcess?.process.signalCode,callerForceInvoked:ownedKillStarted,hardDeadlineReached:Date.now()>=totalDeadlineAt});
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
  if(server)await boundedOwnedStep('server-close',()=>new Promise((ok,bad)=>server.close(error=>error?bad(error):ok())));
  if(browser)await boundedOwnedStep('browser-close',()=>browser.close(),35000,true);
  if(ownedBrowserProcess&&ownedBrowserProcess.process.exitCode===null&&ownedBrowserProcess.process.signalCode===null){recordError({type:'owned-closure',message:'actual owned child remains alive'});stopOwnedBrowser('unconfirmed owned closure');server?.closeAllConnections?.();}
  if(metadata.firstFailure||Date.now()>=totalDeadlineAt){metadata.status='first-failure-preserved';process.exitCode=1;}
  metadata.closedAt=new Date().toISOString();await persist();
  if(metadata.firstFailure||Date.now()>=totalDeadlineAt){metadata.status='first-failure-preserved';process.exitCode=1;await persist();}
  clearTimeout(stopDeadline);
}
