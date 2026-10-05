import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
const source=await readFile('/tmp/neon-native-south-parcel-startup-candidate-20261005/payload/tools/native-review/methods/resident-extra/tools/capture-resident-extra.mjs','utf8');
const lifeSource=await readFile('/tmp/neon-native-south-parcel-startup-candidate-20261005/harbor-life-original-ef92.js','utf8');
assert.equal(createHash('sha256').update(lifeSource).digest('hex'),'034cb5b4b1851071507c30c0cd36a250f0e8252c394ac28df6627de18b0acc5d');
const body=source.slice(source.indexOf('  // Autonomous orders deliberately'),source.indexOf("  const prop=actualProp(found,'Actual delivery cargo')"));
async function run({name,wallPerSim=13.375667,cargoAtSim=95,revision=2,invalidOrder=false,missingSource=false,readError=false}){
 let now=0;const metadata={observations:[],coverage:{}};const start={teleportRevision:2,simulationTime:1.6,sampleLife:{availableJobs:[{id:'order1',createdTick:invalidOrder?-1:0},{id:'order2',createdTick:0}]}};
 const ctx={assert,Math,Number,Date:class extends Date{static now(){return now;}},Promise,setTimeout:(fn,ms)=>{now+=ms;fn();},metadata,start,plan:{budgets:{naturalStartupSimulationSeconds:75,naturalStartupWallSeconds:1200,naturalSouthParcelWallSeconds:360}},root:'/shim-frozen-dist',resolve:(...x)=>x.join('/'),readFile:async()=>missingSource?'changed unreviewed source':lifeSource,sha:x=>createHash('sha256').update(x).digest('hex'),persist:async()=>{},validate:()=>{},distance:(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),read:async()=>{if(readError)throw new Error('actual read-only snapshot failure');const t=3.0333333333+now/(wallPerSim*1000);return{simulationTime:t,teleportRevision:revision,position:{x:190.7,z:119.979754474},residentAssets:{review:{actors:t>=cargoAtSim?[{id:'actual-courier',coreVisible:true,worldPosition:{x:193.5,z:119.979754474},props:[{name:'Actual delivery cargo',effectivelyVisible:true,source:'explicit-original-cargo'}]}]:[]}}};}};
 vm.createContext(ctx);let error=null;try{await vm.runInContext('(async()=>{'+body+'})()',ctx);}catch(e){error=e.message;}
 return{name,error,virtualWallSeconds:now/1000,startup:metadata.coverage.naturalStartup,watch:metadata.coverage.naturalParcelWatch,observations:metadata.observations.length};
}
const rows=[];let r=await run({name:'original observed rate waits natural75sim then finds real prop at95sim'});assert.equal(r.error,null);assert.ok(r.startup.endSimulationTime>=75);assert.ok(r.startup.wallSeconds>360);assert.ok(r.watch.wallSeconds<=360);rows.push(r);
r=await run({name:'normal faster actual simulation',wallPerSim:1,cargoAtSim:90});assert.equal(r.error,null);rows.push(r);
r=await run({name:'startup finite1200wall exhausted',wallPerSim:30,cargoAtSim:100});assert.match(r.error,/natural75sim order startup exceeded1200/);rows.push(r);
r=await run({name:'parcel still unavailable after eligible original360watch',cargoAtSim:Infinity});assert.match(r.error,/within360 wall seconds after real75sim/);assert.ok(r.watch.wallSeconds>=360);rows.push(r);
r=await run({name:'unreviewed source contract rejected',missingSource:true});assert.match(r.error,/served autonomous order grace-period/);rows.push(r);
r=await run({name:'invalid actual order age rejected',invalidOrder:true});assert.ok(r.error);rows.push(r);
r=await run({name:'teleport during natural observation rejected',revision:3});assert.ok(r.error);rows.push(r);
r=await run({name:'actual snapshot failure remains first failure',readError:true});assert.equal(r.error,'actual read-only snapshot failure');rows.push(r);
assert.ok(source.includes("totalWallSeconds: options.case==='south-parcel'?2700:1080"));assert.ok(source.includes('naturalSouthParcelWallSeconds:360'));assert.ok(source.includes('distance(a.worldPosition,s.position)<=3.5'));assert.ok(source.includes('await observe45(\'south\',found.id)'));assert.ok(!body.includes('window.__NEON__.'));
const receipt={status:'PASSED',scope:'8 actual pure-CPU shim cases execute candidate natural startup/watch code with virtual actual-source guard/readback timelines; no native/game/art pass inferred',sourceSHA256:createHash('sha256').update(source).digest('hex'),originalLifeSHA256:createHash('sha256').update(lifeSource).digest('hex'),rows};await writeFile('/tmp/neon-native-south-parcel-startup-candidate-20261005/cpu-receipt.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({status:receipt.status,cases:rows.length,sourceSHA256:receipt.sourceSHA256}));
