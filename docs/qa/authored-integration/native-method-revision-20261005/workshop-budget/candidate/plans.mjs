// Fixed world metres. The mode flag NEVER changes a route, photograph or camera.
const homeGround=.215, galleryGround=4.153408014029265;
const rear=107.77537614060566, front=112.72462385939434;
const stairTop=104.5007522812113, stairBottom=114.44924771878868;
const walk=(axis,target)=>({kind:'walk',axis,target});
const point=(x,z)=>[walk('x',x),walk('z',z)];
const corridor=(z)=>[walk('x',133),walk('z',z)];
function photo(label,x,z,y,target,roomId=null){
 const eye={x,y:y+1.62,z}, horizontal=Math.hypot(target.x-x,target.z-z);
 const pitch=.15+Math.asin((eye.y-target.y)/horizontal);
 if(!Number.isFinite(pitch)||pitch<-.75||pitch>1.05)throw new Error('Prepared camera exceeds actual public pitch limits: '+label);
 return {kind:'photo',label,position:{x,y,z},axisTolerance:.15,target,roomId,
   nominalEye:eye,camera:{yaw:Math.atan2(target.x-x,target.z-z),pitch,fov:65},
   nominalEyeDistance:Math.hypot(target.x-eye.x,target.y-eye.y,target.z-eye.z)};
}
const home={id:'home',address:'south-079',englishName:'Old Quarter 79',budgetMinutes:110,
 scope:'Four existing dwelling rooms on two floors, a physical stair ascent/descent, normal exit, physical re-entry and owner release. Separate public Atlas setup; not a continuous city tour.',
 steps:[{kind:'enter'},
 ...corridor(front),walk('x',130.3),
 photo('bedroom-whole',130.3,front,homeGround,{x:126.0,y:homeGround+.92,z:front},'south-079-lobby-1'),
 walk('z',112.9),walk('x',127.5),
 photo('bed-close',127.5,112.9,homeGround,{x:125.75,y:homeGround+.66,z:112.3},'south-079-lobby-1'),
 walk('x',130.3),walk('z',front),...corridor(rear),walk('x',130.3),
 photo('living-whole',130.3,rear,homeGround,{x:126.3,y:homeGround+.92,z:rear},'south-079-lobby-0'),
 walk('x',128.9),
 photo('sofa-close',128.9,rear,homeGround,{x:126.3,y:homeGround+.86,z:106.05},'south-079-lobby-0'),
 ...corridor(stairBottom),walk('x',135.3),{kind:'event',label:'actual-stair-bottom'},
 walk('z',stairTop),{kind:'floor',floorId:'gallery',y:galleryGround,label:'physical-stair-ascent'},
 {kind:'release',channel:'home',floorId:'lobby',label:'lobby-owner-released-on-ascent'},
 ...corridor(rear),walk('x',130.3),
 photo('kitchen-whole',130.3,rear,galleryGround,{x:126.2,y:galleryGround+1.03,z:rear},'south-079-gallery-0'),
 ...corridor(front),walk('x',130.3),
 photo('bath-whole',130.3,front,galleryGround,{x:126.2,y:galleryGround+1.02,z:front},'south-079-gallery-1'),
 walk('z',113.42),walk('x',127.5),
 photo('bath-laundry-close',127.5,113.42,galleryGround,{x:125.7,y:galleryGround+1.05,z:113.62},'south-079-gallery-1'),
 walk('x',130.3),walk('z',front),...corridor(stairTop),walk('x',135.3),
 walk('z',stairBottom),{kind:'floor',floorId:'lobby',y:homeGround,label:'physical-stair-descent'},
 {kind:'release',channel:'home',floorId:'gallery',label:'gallery-owner-released-on-descent'},
 {kind:'ready',channel:'home',floorId:'lobby',label:'returned-lobby-owner-ready-before-exit'},
 ...point(133,114.34924771878869),{kind:'exit',label:'first-normal-exit'},
 {kind:'release',channel:'home',floorId:'lobby',label:'lobby-owner-released-on-exit'},
 {kind:'enter',label:'physical-re-entry'},...corridor(rear),walk('x',130.3),
 {kind:'ready',channel:'home',floorId:'lobby',label:'re-entry-real-decoder-and-owner-ready'},
 photo('living-re-entry',130.3,rear,homeGround,{x:126.3,y:homeGround+.92,z:rear},'south-079-lobby-0'),
 ...point(133,114.34924771878869),{kind:'exit',label:'second-normal-exit'},
 {kind:'release',channel:'home',floorId:'lobby',label:'re-entry-owner-released-on-second-exit'}]};
const workshop={id:'workshop',address:'south-086',englishName:'Old Quarter 86',budgetMinutes:65,
 scope:'Existing workshop and archive rooms, whole-room and assembly/retrieval photographs, normal exit, physical re-entry and owner release. Existing independent vice close method is not duplicated.',
 steps:[{kind:'enter'},...point(200,-115),walk('x',197.6),
 photo('workshop-whole',197.6,-115,.215,{x:186.9,y:1.38,z:-115},'south-086-lobby-0'),
 walk('x',188.3),walk('z',-112),
 photo('assembly-close',188.3,-112,.215,{x:185.7,y:1.37,z:-111.5},'south-086-lobby-0'),
 walk('z',-115),...point(200,-104.5),walk('x',196.7),walk('z',-106),
 photo('archive-whole',196.7,-106,.215,{x:186.5,y:1.42,z:-106},'south-086-lobby-1'),
 walk('x',189.4),walk('z',-104),
 photo('retrieval-close',189.4,-104,.215,{x:187.4,y:1.125,z:-104},'south-086-lobby-1'),
 walk('z',-106),walk('x',196.7),walk('z',-104.5),...point(200,-100.1),
 {kind:'exit',label:'first-normal-exit'},{kind:'release',channel:'workshop',floorId:'lobby',label:'all-owned-assets-released-on-exit'},
 {kind:'enter',label:'physical-re-entry'},...point(200,-115),walk('x',197.6),
 {kind:'ready',channel:'workshop',floorId:'lobby',label:'re-entry-real-decoder-and-owner-ready'},
 photo('workshop-re-entry',197.6,-115,.215,{x:186.9,y:1.38,z:-115},'south-086-lobby-0'),
 ...point(200,-100.1),{kind:'exit',label:'second-normal-exit'},
 {kind:'release',channel:'workshop',floorId:'lobby',label:'re-entry-owner-released-on-second-exit'}]};
export const CORE_PLANS=Object.freeze({home,workshop});
export function compileFrontagePlan(building){
 const id=building.id,face=building.z+building.depth/2,y=building.baseY;
 const east=['south-091','south-092','south-095','south-096'].includes(id),eastX=building.x+building.width/2;
 const displaySteps=east?[
  walk('z',building.entrance.z),walk('x',eastX+3),walk('z',building.z),
  photo('east-display-face-close',eastX+3,building.z,y,{x:eastX+.64,y:y+1.6,z:building.z}),
  walk('z',building.entrance.z),walk('x',building.x),walk('z',face+2)]:[];
 return {id,address:id,englishName:building.englishName,budgetMinutes:12,
 scope:'One shop south public entrance, actual E entry/exit/re-entry. Display geometry is photographed separately from the public entrance. This does not approve its shared interior art.',
 steps:[photo('south-frontage',building.x,building.entrance.z,y,{x:building.x,y:y+1.6,z:face+.64}),
 walk('z',face+2),photo('actual-public-door',building.x,face+2,y,{x:building.x,y:y+1.5,z:face+.64}),
 ...displaySteps,
 {kind:'door',label:'apparent-south-door-and-actual-public-prompt'},
 {kind:'enter'},...point(building.x,building.z+(building.depth-.7)/2-1.25),
 {kind:'event',label:'real-target-building-interior'},
 {kind:'exit',label:'first-normal-exit'},{kind:'frontage',label:'shell-restored-after-exit'},
 {kind:'enter',label:'physical-re-entry'},{kind:'exit',label:'second-normal-exit'},
 {kind:'frontage',label:'shell-restored-after-re-entry'}],
 knownBaselineIssue:['south-091','south-092','south-095','south-096'].includes(id)?'Baseline east display facade has apparent central door hardware, but actual public entry is south. Its absent authored publicDoor metadata is recorded unavailable, never claimed as fixed.':null};
}
