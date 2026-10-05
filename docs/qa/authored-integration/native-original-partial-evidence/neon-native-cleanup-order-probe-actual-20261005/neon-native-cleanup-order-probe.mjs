import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
const require=createRequire('/workspace/scratch/neon-harbor/package.json');
const {chromium}=require('@playwright/test');
const output=process.argv[2]; assert.ok(output);
await mkdir(output,{recursive:true});
const deadline=Date.now()+115000;
const record={status:'running',startedAt:new Date().toISOString(),purpose:'Two serial tiny WebGL2 official launchServer/connect cleanup-order probes, not game/native art acceptance',playwright:require('playwright-core/package.json').version,wholeBudgetMs:120000,innerBudgetMs:115000,serverCloseCapMs:30000,launchArgs:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader'],variants:[]};
const errorRecord=e=>({name:e.name,message:e.message,stack:e.stack});
const persist=()=>writeFile(resolve(output,'probe.json'),JSON.stringify(record,null,2)+'\n');
const remaining=cap=>Math.max(1,Math.min(cap,deadline-Date.now()));
const proc=async pid=>{try{const text=await readFile(`/proc/${pid}/stat`,'utf8'),r=text.slice(text.lastIndexOf(')')+2).split(' ');return{pid,state:r[0],ppid:Number(r[1]),pgid:Number(r[2]),session:Number(r[3]),startTicks:r[19]};}catch(e){if(e.code==='ENOENT')return null;throw e;}};
async function bounded(fn,cap,label){let timer;try{return await Promise.race([Promise.resolve().then(fn),new Promise((_,reject)=>timer=setTimeout(()=>reject(new Error(label+' finite deadline')),remaining(cap)))]);}finally{clearTimeout(timer);}}
await persist();
for(const order of ['context-client-owner','context-owner-client']){
 const v={order,status:'running',startedAt:new Date().toISOString(),steps:[],secondaryErrors:[]};record.variants.push(v);await persist();
 let server,browser,context,child,firstError=null;
 try{
  assert.ok(Date.now()<deadline,'Whole probe deadline before launch');
  server=await chromium.launchServer({headless:true,args:record.launchArgs,timeout:remaining(30000)});
  child=server.process();v.owner=await proc(child.pid);assert.equal(v.owner.ppid,process.pid);assert.equal(v.owner.state==='Z',false);
  v.ownerBindingRecordedBeforeClientConnect=true;
  browser=await chromium.connect(server.wsEndpoint(),{timeout:remaining(15000)});
  v.chromium=browser.version();assert.equal(v.chromium,'151.0.7922.34');assert.equal(record.playwright,'1.62.1');
  context=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1});
  const page=await context.newPage();
  await page.setContent('<canvas width="1280" height="800"></canvas>');
  v.webgl=await bounded(()=>page.evaluate(async()=>{
   const canvas=document.querySelector('canvas'),gl=canvas.getContext('webgl2',{antialias:true});
   if(!gl)throw new Error('Actual WebGL2 missing');
   const ext=gl.getExtension('WEBGL_debug_renderer_info');
   for(let i=0;i<12;i++){gl.clearColor(.12+i/120,.25,.4,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);await new Promise(requestAnimationFrame);}
   const px=new Uint8Array(4);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px);
   return {version:gl.getParameter(gl.VERSION),renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),pixels:[...px],frames:12,glError:gl.getError(),contextLost:gl.isContextLost()};
  }),15000,'tiny-WebGL');assert.equal(v.webgl.glError,0);assert.equal(v.webgl.contextLost,false);
 }catch(e){firstError=e;v.firstError=errorRecord(e);}
 const closureDeadline=Math.min(deadline,Date.now()+30000);
 async function close(label,fn){const s={label,startedAt:new Date().toISOString(),capMs:Math.max(1,closureDeadline-Date.now()),clientConnectedBefore:browser?.isConnected(),ownerBefore:child?await proc(child.pid):null};const start=performance.now();
  try{await bounded(fn,s.capMs,label);s.status='closed';}catch(e){s.status='failed';s.error=errorRecord(e);if(!firstError){firstError=e;v.firstError=errorRecord(e);}else v.secondaryErrors.push({stage:label,...errorRecord(e)});}
  s.durationMs=performance.now()-start;s.finishedAt=new Date().toISOString();s.clientConnectedAfter=browser?.isConnected();s.ownerAfter=child?await proc(child.pid):null;v.steps.push(s);await persist();
 }
 if(context)await close('browser-context',()=>context.close());
 if(order==='context-client-owner'){
  if(browser)await close('browser-client',()=>browser.close());
  if(server)await close('owned-browser-server',()=>server.close());
 }else{
  if(server)await close('owned-browser-server',()=>server.close());
  if(browser?.isConnected())await close('browser-client-if-connected',()=>browser.close());
  else v.steps.push({label:'browser-client-if-connected',status:'already-disconnected-by-owner-close'});
 }
 if(child&&await proc(child.pid)){
  const e=new Error('Owned browser survived normal finite cleanup');if(!firstError){firstError=e;v.firstError=errorRecord(e);}else v.secondaryErrors.push({stage:'survived-cleanup',...errorRecord(e)});
  v.fallbackRequested=true;await persist();
  try{await bounded(()=>server.kill(),5000,'official-owned-server-kill');}catch(e){v.secondaryErrors.push({stage:'official-owned-server-kill',...errorRecord(e)});}
 }
 v.ownerAfter=child?await proc(child.pid):null;v.ownerExit=child?{exitCode:child.exitCode,signalCode:child.signalCode}:null;
 v.awaitWrapperClosureGate=true;await persist();
 try{await bounded(async()=>{for(;;){try{const receipt=JSON.parse(await readFile(resolve(output,`closure-${record.variants.length}.json`),'utf8'));assert.equal(receipt.ownedClosureConfirmed,true);v.wrapperClosureReceipt=receipt;return;}catch(e){if(e.code!=='ENOENT')throw e;}await new Promise(r=>setTimeout(r,25));}},5000,'owned-pidfd-closure-gate');}catch(e){if(!firstError){firstError=e;v.firstError=errorRecord(e);}else v.secondaryErrors.push({stage:'owned-pidfd-closure-gate',...errorRecord(e)});}
 v.status=firstError?'failed':'probe-complete';v.finishedAt=new Date().toISOString();await persist();
 if(!v.wrapperClosureReceipt?.ownedClosureConfirmed){record.blockedNextVariant=true;break;}
}
record.status=record.variants.length===2&&record.variants.every(v=>v.status==='probe-complete')?'TINY_PROBE_COMPLETE':'TINY_PROBE_FAILED_OR_BLOCKED';record.finishedAt=new Date().toISOString();record.noGameAcceptance=true;await persist();
console.log(JSON.stringify({status:record.status,variants:record.variants.map(v=>({order:v.order,status:v.status,steps:v.steps.map(s=>({label:s.label,status:s.status,durationMs:s.durationMs})),ownerExit:v.ownerExit,firstError:v.firstError?.message}))}));
if(record.status!=='TINY_PROBE_COMPLETE')process.exitCode=1;
