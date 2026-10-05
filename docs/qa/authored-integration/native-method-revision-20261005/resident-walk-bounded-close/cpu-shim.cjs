const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto');
const root='/tmp/neon-native-resident-walk-close-candidate-20261005';const paths=['resident/tools/capture-resident-native.mjs','resident-extra/tools/capture-resident-extra.mjs'];const passed=[];
async function walkCase(src,name,opts={}){
 let now=0,sim=1,pos=opts.start??-455,revision=2,held=new Set(),calls=[],first=new Error('actual wait failed');
 const state=()=>({position:{x:opts.axis==='x'?pos:0,z:opts.axis==='z'||!opts.axis?pos:0,y:0},camera:{yaw:Math.PI},simulationTime:sim,teleportRevision:revision,paused:!!opts.paused});
 function frame(){now+=100;sim+=.25;if(!opts.blocked&&held.size){const slow=held.has('z'),key=[...held].find(k=>k!=='z');const sign=(key==='s'||key==='d')?1:-1;pos+=sign*(slow?.8:5.6)*.25;}}
 const c={Date:{now:()=>now},Math,Infinity,assert,plan:{budgets:{legWallSeconds:180}},totalDeadlineAt:opts.whole??1080000,metadata:{},face:async()=>{now+=opts.faceMs??0;},validate:()=>{},read:async()=>{calls.push('read');if(opts.badRevision)revision++;return state();},event:async()=>{calls.push('event');return state();},window:{__NEON__:{snapshot:state}},page:{keyboard:{down:async k=>{held.add(k);calls.push('down:'+k);},up:async k=>{calls.push('up:'+k);if(opts.keyupFail&&k!=='z')throw first;frame();held.delete(k);}},waitForFunction:async(fn,args,o)=>{calls.push({wait:o.timeout});let n=0;while(!fn(args)){frame();if(now>=o.timeout+(opts.faceMs??0)||++n>2000)throw first;}}}};
 vm.createContext(c);const walk=src.slice(src.indexOf('const walk ='),src.indexOf('const atlas ='));vm.runInContext(walk+'\nthis.walk=walk',c);
 let error;try{await c.walk(opts.axis||'z',opts.target??-438);}catch(e){error=e;}
 if(opts.keyupFail){assert.equal(error,first);assert.equal(calls.includes('event'),false);const lastUp=calls.findLastIndex(x=>typeof x==='string'&&x.startsWith('up:'));assert.ok(!calls.slice(lastUp+1).includes('read'));}
 else if(opts.blocked){assert.equal(error,first);assert.equal(calls.includes('event'),false);assert.equal(held.size,0);}
 else if(opts.paused||opts.badRevision){assert.ok(error);assert.equal(calls.includes('event'),false);}
 else{assert.equal(error,undefined);assert.ok(Math.abs(pos-(opts.target??-438))<.75);assert.equal(held.size,0);assert.ok(calls.filter(x=>x&&x.wait).every(x=>x.wait<=Math.min(180000,opts.whole??1080000)));}
 passed.push(name);
}
(async()=>{
 for(const p of paths){const s=fs.readFileSync(root+'/payload/tools/native-review/methods/'+p,'utf8');
  await walkCase(s,p+' core positive overshoot route');await walkCase(s,p+' phone negative short route',{start:-595,target:-597});await walkCase(s,p+' cup positive route',{start:-592,target:-576.2});await walkCase(s,p+' x negative route',{axis:'x',start:560,target:500.6});await walkCase(s,p+' shared whole clamp',{whole:20000,faceMs:1000});await walkCase(s,p+' blocked remains failure',{blocked:true});await walkCase(s,p+' failed keyup no subsequent RPC',{keyupFail:true});await walkCase(s,p+' paused remains failure',{paused:true});
 }
 const s=fs.readFileSync(root+'/payload/tools/native-review/methods/'+paths[0],'utf8');const cl=s.slice(s.indexOf('function classifyOwnedBrowserClose'),s.indexOf('\nconst recordError'));
 const c={Number,Boolean};vm.createContext(c);vm.runInContext(cl+'\nthis.classify=classifyOwnedBrowserClose',c);const base={before:{pid:123,startTicks:'42'},current:null,apiClose:{status:'closed',timeoutMs:35000,elapsedMs:30001},exitCode:null,signalCode:'SIGKILL',callerForceInvoked:false,hardDeadlineReached:false};
 let a=c.classify(base);assert.equal(a.boundedCloseAccepted,true);assert.equal(a.forcedExit,true);assert.equal(a.graceful,false);passed.push('official resolving forced fallback explicit nongraceful');
 for(const [name,change]of [['unknown exact identity',{current:undefined}],['API reject',{apiClose:{status:'rejected',timeoutMs:35000,elapsedMs:30001}}],['outer cap',{apiClose:{status:'closed',timeoutMs:20000,elapsedMs:30001}}],['caller rescue',{callerForceInvoked:true}],['whole deadline',{hardDeadlineReached:true}],['nonzero exit',{exitCode:1,signalCode:null}]]){assert.equal(c.classify({...base,...change}).boundedCloseAccepted,false);passed.push(name+' remains ineligible');}
 const receipt={status:'PURE_CPU_SHIM_PASS',cases:passed.length,passed,sourcePins:JSON.parse(fs.readFileSync(root+'/source-pins.json')),browserExecuted:false,gpuExecuted:false,productImported:false,rootWritten:false};fs.writeFileSync(root+'/cpu-shim-receipt.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({status:receipt.status,cases:receipt.cases}));
})().catch(e=>{console.error(e);process.exitCode=1});
