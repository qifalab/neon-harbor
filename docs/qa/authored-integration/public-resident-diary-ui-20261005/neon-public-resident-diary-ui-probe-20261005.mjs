import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createStaticServer} from '/workspace/scratch/neon-harbor/tools/server.mjs';
const require=createRequire('/workspace/scratch/neon-harbor/package.json'),{chromium}=require('@playwright/test');
const out=process.argv[2],deadline=Date.now()+130000;
const record={status:'RUNNING',scope:'Public diary UI and safe home navigation only; not art or continuous resident browser-cycle acceptance',startedAt:new Date().toISOString(),variants:[{}],errors:[],cleanup:[],buildInfo:JSON.parse(await readFile('/workspace/scratch/neon-harbor/dist/build-info.json','utf8'))};
const remaining=cap=>Math.max(1,Math.min(cap,deadline-Date.now()));
const persist=()=>writeFile(resolve(out,'probe.json'),JSON.stringify(record,null,2)+'\n');
const proc=async pid=>{try{const t=await readFile(`/proc/${pid}/stat`,'utf8'),f=t.slice(t.lastIndexOf(')')+2).split(' ');return{pid,state:f[0],ppid:Number(f[1]),startTicks:f[19]};}catch(e){if(e.code==='ENOENT')return null;throw e;}};
const error=e=>({name:e.name,message:e.message,stack:e.stack});
async function bounded(fn,cap,label){let timer;try{return await Promise.race([Promise.resolve().then(fn),new Promise((_,reject)=>timer=setTimeout(()=>reject(new Error(label+' bounded deadline')),remaining(cap)))]);}finally{clearTimeout(timer);}}
let server,owner,browser,context,child,first=null;
try{
 server=await createStaticServer({root:'/workspace/scratch/neon-harbor/dist'});await new Promise(r=>server.listen(5251,'127.0.0.1',r));
 owner=await chromium.launchServer({headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader'],timeout:remaining(30000)});child=owner.process();record.variants[0].owner=await proc(child.pid);assert.equal(record.variants[0].owner.ppid,process.pid);await persist();
 browser=await chromium.connect(owner.wsEndpoint());record.chromium=browser.version();assert.equal(record.chromium,'151.0.7922.34');assert.equal(require('playwright-core/package.json').version,'1.62.1');
 context=await browser.newContext({viewport:{width:800,height:600},deviceScaleFactor:1});const page=await context.newPage();page.setDefaultTimeout(remaining(30000));
 page.on('pageerror',e=>record.errors.push(error(e)));page.on('console',m=>{if(m.type()==='error')record.errors.push({type:'console',message:m.text()});});page.on('response',r=>{if(r.status()>=400)record.errors.push({type:'http',status:r.status(),url:r.url()});});
 await page.goto('http://127.0.0.1:5251/');await page.waitForFunction(()=>document.querySelector('#start')&&!document.querySelector('#start').disabled,null,{timeout:remaining(90000)});
 record.initial=await page.evaluate(()=>window.__NEON__.snapshot());assert.equal(record.initial.settings.quality,'high');
 await page.locator('#welcome-settings').click();await page.locator('#quality').selectOption('low');await page.locator('#resume').click();await page.locator('#welcome-sample').click();
 const menu=page.locator('#sample-stops');await menu.waitFor({state:'visible'});const diary=page.locator('section').filter({has:page.locator('h3',{hasText:'杨远舟的通勤日记'})});
 assert.equal(await diary.count(),1);record.menuText=await diary.innerText();assert.ok(record.menuText.includes('有效工作 0.0 秒'));assert.ok(record.menuText.includes('累计工资 $0'));assert.equal(await page.locator('[data-resident-place]').count(),2);
 await page.screenshot({path:resolve(out,'public-diary-menu-original.png'),timeout:remaining(30000)});
 await page.locator('[data-resident-place="home"]').click();await page.waitForFunction(()=>{const s=window.__NEON__.snapshot();return s.started&&!s.paused&&!s.streaming?.preparing;},null,{timeout:remaining(30000)});
 record.publicHome=await page.evaluate(()=>window.__NEON__.snapshot());const home=record.publicHome.city.buildings?.find?.(b=>b.id==='south-083');record.homeCatalogueAvailable=!!home;
 await page.locator('#game').focus();await page.keyboard.press('e');await page.waitForFunction(()=>window.__NEON__.snapshot().city.interior.buildingId==='south-083',null,{timeout:remaining(30000)});record.entered=await page.evaluate(()=>window.__NEON__.snapshot());assert.equal(record.entered.city.interior.buildingId,'south-083');assert.deepEqual(record.errors,[]);record.playableStatus='PASSED';
}catch(e){first=e;record.firstError=error(e);}
finally{
 for(const[label,fn,cap]of [['context',()=>context?.close(),10000],['client',()=>browser?.close(),10000],['owned-server',()=>owner?.close(),35000],['static-server',()=>new Promise(r=>server?server.close(r):r()),5000]]){
  const t=Date.now();try{await bounded(fn,cap,label);record.cleanup.push({label,status:'CLOSED',elapsedMs:Date.now()-t});}catch(e){record.cleanup.push({label,status:'FAILED',error:error(e)});if(!first){first=e;record.firstError=error(e);}}
 }
 if(child){record.ownerAfter=await proc(child.pid);record.ownerExit={code:child.exitCode,signal:child.signalCode};if(record.ownerAfter&&record.ownerAfter.state!=='Z'){first||=new Error('Owned browser still present');await bounded(()=>owner.kill(),5000,'owned rescue');}}
 record.variants[0].awaitWrapperClosureGate=true;await persist();const gate=Date.now()+3000;while(Date.now()<gate){try{const o=JSON.parse(await readFile(resolve(out,'closure-1.json'),'utf8'));if(o.ownedClosureConfirmed){record.ownedClosure=o;break;}}catch(e){if(e.code!=='ENOENT')throw e;}await new Promise(r=>setTimeout(r,25));}
 if(!record.ownedClosure){first||=new Error('Kernel-bound owned descendant closure not confirmed');record.firstError||=error(first);}
 record.status=first?'FAILED':'PUBLIC_DIARY_UI_PASSED';record.finishedAt=new Date().toISOString();await persist();console.log(JSON.stringify({status:record.status,firstError:record.firstError?.message,ownedClosure:!!record.ownedClosure}));if(first)process.exitCode=1;
}
