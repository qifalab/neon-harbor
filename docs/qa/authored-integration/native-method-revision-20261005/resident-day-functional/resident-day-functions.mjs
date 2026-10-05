async function residentLoopCase() {
  metadata.artAcceptance='NOT_APPLICABLE_LOW_FUNCTIONAL_ONLY';
  metadata.functionalScope='One natural resident day; fixed workshop observer; Low512x320 viewport/409x256 buffer. Public save menus pause/resume; player does not follow the route.';
  const {auditResidentDayState,auditResidentDaySave}=await import('./resident-loop-functional-guards.mjs');
  const {createInteriorLayout}=await import(pathToFileURL(resolve(projectRoot,'src/metropolis-interiors.js')).href);
  const {planHarborWorkshopPilot}=await import(pathToFileURL(resolve(projectRoot,'src/harbor-workshop-pilot.js')).href);
  const {circleOBB}=await import(pathToFileURL(resolve(projectRoot,'src/collision.js')).href);
  const {createHarborVehicleLayout}=await import(pathToFileURL(resolve(projectRoot,'src/harbor-vehicle-models.js')).href);
  const {harborLocalToWorld}=await import(pathToFileURL(resolve(projectRoot,'src/harbor-transit.js')).href);
  const initial=await read();assert.equal(initial.settings.quality,'high');assert.equal(initial.diary.completedCycles,0);
  await publicQuality('low');await page.locator('#harbor-life').click();
  await page.locator('[data-resident-place="work"]').click();
  await page.waitForFunction(()=>{const s=window.__NEON__.snapshot();return !s.paused&&!s.streaming?.pending&&!s.streaming?.preparing;},null,{timeout:residentDayRemaining(180000)});
  await page.keyboard.press('e');
  await page.waitForFunction(()=>{const i=window.__NEON__.snapshot().city.interior;return i.buildingId==='south-086'&&i.floorId==='lobby';},null,{timeout:residentDayRemaining(15000)});
  let s=await read();const room=s.interior.rooms.find(r=>r.type==='workshop');assert.ok(room);
  await walk('x',s.workBuilding.x);await walk('z',room.entrance.z);await walk('x',room.arrival.x);await walk('z',room.arrival.z);
  s=await read();assert.equal(s.interior.currentRoomId,room.id);
  const floor=s.workBuilding.floors.find(f=>f.id==='lobby'),layout=createInteriorLayout(s.workBuilding,floor);
  const bench=layout.parts.find(p=>p.roomId===room.id&&p.kind==='workbench-top');assert.ok(bench);
  const work={roomId:room.id,anchor:{x:bench.x+bench.sx/2+.6+.12,y:floor.y,z:bench.z},colliders:[...layout.colliders,...(planHarborWorkshopPilot(s.workBuilding,floor,layout)?.colliders||[])].filter(c=>c.physics!==false&&c.minY<floor.y+1.8&&c.maxY>floor.y+.05)};
  const homeFloor=s.homeBuilding.floors.find(f=>f.id==='lobby'),homeLayout=createInteriorLayout(s.homeBuilding,homeFloor),homeRoom=homeLayout.rooms.find(r=>r.type==='bedroom');assert.ok(homeRoom);
  await aimAt(work.anchor);const baseline=await read();metadata.coverage.residentDaySetup={initial,baseline,roomId:room.id,workAnchor:work.anchor,initialPublicNavigationOnly:true};
  const tram=createHarborVehicleLayout('tram'),aisle=tram.aislePaths.find(p=>p.deckId==='lower');
  const ticketPose=(t,v)=>harborLocalToWorld({x:0,y:tram.deckLevels[0],z:aisle.waypoints[0].z+(aisle.waypoints.at(-1).z-aisle.waypoints[0].z)*(.18+(t.slot%5)*.14)},v);
  let priorStage=null,lastEvent=0,workFirst=null,workSecond=false,lastPersist=0;const exported=new Set();
  metadata.coverage.residentDayEvents=[];metadata.coverage.ledgerExports=[];
  const exportLedger=async(label,period=0,completed=false)=>{
    const before=await read(),openedAt=new Date().toISOString();await page.locator('#pause').click();await page.locator('[data-tab="settings"]').click();
    const paused=await read();assert.equal(paused.paused,true);
    const downloadPromise=page.waitForEvent('download',{timeout:residentDayRemaining(15000)});await page.locator('#export-save').click();const download=await downloadPromise;
    const file=`${label}-public-save-original.json`,path=resolve(output,file);await download.saveAs(path);const bytes=await readFile(path),value=JSON.parse(bytes);
    const proof=auditResidentDaySave(value,{homeRoomId:homeRoom.id,requirePaidPeriod:period,requireCompleted:completed});
    await page.locator('#resume').click();await page.waitForFunction(()=>!window.__NEON__.snapshot().paused,null,{timeout:residentDayRemaining(15000)});const resumed=await read();
    metadata.coverage.ledgerExports.push({label,file,sha256:sha(bytes),bytes:bytes.length,openedAt,resumedAt:new Date().toISOString(),beforeSimulationTime:before.simulationTime,pausedSimulationTime:paused.simulationTime,resumedSimulationTime:resumed.simulationTime,proof,source:'actual public export-save download; no storage/clock/NPC setter'});await persist();
  };
  while(true){
    assert.ok(residentDayRemaining(15000)>0);s=await read();validate(s);auditResidentDayState(s,baseline,work,circleOBB,ticketPose);
    for(const e of s.diary.events.filter(e=>e.sequence>lastEvent)){metadata.coverage.residentDayEvents.push({observedAt:new Date().toISOString(),simulationTime:s.simulationTime,event:e,resident:s.resident,ticket:s.ticket,vehicle:s.vehicle});lastEvent=e.sequence;}
    if(priorStage!==s.diary.stage){metadata.observations.push({at:new Date().toISOString(),phase:'natural-resident-stage',state:s});priorStage=s.diary.stage;await persist();}
    if(s.diary.stage==='working'&&s.diary.workSeconds>0){
      if(!workFirst){workFirst={workSeconds:s.diary.workSeconds,actor:s.actor};await captureRaw('01-actual-arrival-work',{scope:'Low functional real workroom actor'});}
      else if(!workSecond&&s.diary.workSeconds-workFirst.workSeconds>=1){
        const before=workFirst.actor.joints,after=s.actor.joints;assert.ok(Math.hypot(after.rightArm.x-before.rightArm.x,after.rightElbow.x-before.rightElbow.x)>.001,'actual working arm joints change across real work ticks');
        metadata.coverage.actualWorkMotion={before:workFirst,after:{workSeconds:s.diary.workSeconds,actor:s.actor}};await captureRaw('02-actual-work-motion',{scope:'Low functional real changed joints'});workSecond=true;
      }
    }
    if(s.diary.paidWorkPeriods>=1&&!exported.has(1)){await captureRaw('03-first-period-paid-state');await exportLedger('period1-wage',1);exported.add(1);}
    if(s.diary.paidWorkPeriods===2&&!exported.has(2)){await captureRaw('04-two-periods-paid-state');await exportLedger('period2-wage',2);exported.add(2);}
    if(s.diary.purchases===1&&!exported.has('purchase')){await captureRaw('05-purchase-observed-from-workshop',{scope:'readonly resident state; fixed observer did not photograph the distant shop'});exported.add('purchase');}
    if(s.diary.completedCycles===1){
      assert.ok(workFirst&&workSecond&&exported.has(1)&&exported.has(2));assert.equal(s.diary.workSeconds,70);assert.equal(s.diary.earnedWages,6);assert.equal(s.diary.purchases,1);assert.equal(s.diary.stage,'resting-home');
      await captureRaw('06-return-home-state-observed-from-workshop',{scope:'readonly home state; fixed observer did not photograph the distant home'});await exportLedger('completed-resident-day',0,true);
      metadata.coverage.residentDayComplete={status:'FUNCTIONAL_RESIDENT_DAY_COMPLETE',actualFinalState:s,workMotion:true,playerFollowedFullRoute:false,highArtAcceptance:false};break;
    }
    if(Date.now()-lastPersist>=15000){await persist();lastPersist=Date.now();}
    await new Promise(ok=>setTimeout(ok,Math.min(2000,residentDayRemaining(2000))));
  }
}

function residentDayRemaining(cap=15000){const remaining=Math.min(cap,totalDeadlineAt-Date.now());assert.ok(remaining>0,'resident day fixed10800wall deadline includes evidence and owned closure');return remaining;}
async function readResidentDay(){
  let timer;const cap=residentDayRemaining(15000);
  try{return await Promise.race([page.evaluate(()=>{
    const s=window.__NEON__.snapshot(),life=s.city.sample.life,d=life.residentDiary,a=life.agents.find(a=>a.id==='harbor-resident-07'),fleet=s.city.sample.transit;
    const ticket=fleet.citizenPassengers.find(t=>t.id==='harbor-resident-07')||null,v=ticket?fleet.vehicles.find(v=>v.id===ticket.vehicleId):null;
    const actor=s.residentAssets.review?.actors.find(a=>a.id==='harbor-resident-07');
    return{ready:s.ready,started:s.started,paused:s.paused,settings:s.settings,position:s.position,camera:s.camera,health:s.health,inCar:s.inCar,simulationTime:s.simulationTime,teleportRevision:s.teleportRevision,
      streaming:{failed:s.streaming.failed,pending:s.streaming.pending,preparing:s.streaming.preparing},interior:{buildingId:s.city.interior.buildingId,floorId:s.city.interior.floorId,currentRoomId:s.city.interior.currentRoomId,rooms:s.city.interior.rooms},
      diary:d,resident:a,ticket,vehicle:v,life:{initialMoney:life.initialMoney,totalMoney:life.totalMoney,initialGoods:life.initialGoods,totalGoods:life.totalGoods,statistics:life.statistics},
      actor:actor?{id:actor.id,visible:actor.visible,legacyLODVisible:actor.legacyLODVisible,coreVisible:actor.coreVisible,worldPosition:actor.worldPosition,joints:actor.joints}:null,
      workBuilding:s.city.buildings.find(b=>b.id==='south-086'),homeBuilding:s.city.buildings.find(b=>b.id==='south-083'),renderer:{contextLost:s.renderer.contextLost},canvas:{width:document.getElementById('game').width,height:document.getElementById('game').height}};
  }),new Promise((_,bad)=>{timer=setTimeout(()=>bad(new Error('resident read-only snapshot exceeded bounded15s/whole remaining')),cap);})]);}finally{clearTimeout(timer);}
}
