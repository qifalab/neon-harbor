import assert from 'node:assert/strict';
import {currentRenderedCamera,phaseTimeout} from './render-readiness.mjs';
const subject={x:133,y:.215,z:114.34924771878869},eye={x:133,y:1.835,z:subject.z};
const state={teleportRevision:3,presentation:{subject},camera:null};
assert.equal(currentRenderedCamera({expectedRevision:3,state}),false,'Synchronous E reset is not a rendered camera');
state.camera={position:{x:133,y:1.8,z:118.94924771878868},target:{x:133,y:1.8,z:108.94924771878868},focus:{x:133,y:1.8,z:118.94924771878868},yaw:Math.PI,pitch:.15,fov:65};
assert.equal(currentRenderedCamera({expectedRevision:3,state}),false,'Stale exterior eye cannot satisfy the new interior revision');
state.camera={position:eye,focus:eye,target:{x:133,y:1.835,z:subject.z-10},yaw:Math.PI,pitch:.15,fov:65};
assert.equal(currentRenderedCamera({expectedRevision:3,state}),true,'Actual finite current first-person eye/FOV is eligible');
assert.equal(currentRenderedCamera({expectedRevision:2,state}),false,'Wrong transition revision is rejected');
assert.equal(currentRenderedCamera({expectedRevision:3,state:{...state,camera:{...state.camera,fov:55}}}),false);
assert.equal(currentRenderedCamera({expectedRevision:3,state:{...state,camera:{...state.camera,yaw:NaN}}}),false);
assert.equal(phaseTimeout(1000,2000,1100),100,'Existing E phase deadline is not restarted by render waiting');
assert.equal(phaseTimeout(1000,1050,1100),50,'Whole-case limit clips the readiness phase');
assert.equal(phaseTimeout(1000,100000,100000),60000,'A general event never gets more than 60 seconds');
assert.throws(()=>phaseTimeout(1000,2000,1000),/exhausted/);
assert.throws(()=>phaseTimeout(1000,1000,2000),/exhausted/);
console.log(JSON.stringify({status:'CPU_PREPARATION_CHECK_PASSED',checks:11,browserLaunched:false,gpuUsed:false,
 scope:'Only the exact native readiness predicate and timeout clipping on CPU snapshots, no native acceptance'}));
