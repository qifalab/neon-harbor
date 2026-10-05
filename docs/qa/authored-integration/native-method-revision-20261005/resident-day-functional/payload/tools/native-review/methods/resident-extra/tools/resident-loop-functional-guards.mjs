import assert from 'node:assert/strict';
export const RESIDENT_DAY_ID='harbor-resident-07';
export function auditResidentDayState(state, baseline, work, circleOBB, ticketPose) {
  const d=state.diary,a=state.resident;
  assert.equal(d?.residentId,RESIDENT_DAY_ID);assert.equal(a?.id,RESIDENT_DAY_ID);
  assert.equal(state.life.totalMoney,state.life.initialMoney);assert.equal(state.life.totalGoods,state.life.initialGoods);
  assert.equal(state.life.initialMoney,baseline.life.initialMoney);assert.equal(state.life.initialGoods,baseline.life.initialGoods);
  assert.equal(state.teleportRevision,baseline.teleportRevision,'no further player navigation after setup');
  assert.equal(d.home.buildingId,'south-083');assert.equal(d.workplace.buildingId,'south-086');
  assert.ok(d.earnedWages>=0&&d.earnedWages<=6);assert.ok(d.purchases>=0&&d.purchases<=1);
  assert.ok(d.workSeconds>=0&&d.workSeconds<=70);
  if(d.stage==='working'){
    assert.equal(a.phase,'working');assert.equal(a.insideBuildingId,'south-086');assert.equal(a.floorId,'lobby');
    assert.equal(d.currentRoomId,work.roomId);
    assert.ok(Math.hypot(a.x-work.anchor.x,a.y-work.anchor.y,a.z-work.anchor.z)<=.051,'actual work pose at the real bench');
    assert.ok(!work.colliders.some(c=>circleOBB({...a,radius:.6},c)),'actual occupied work pose clears real furniture');
    assert.equal(state.renderModel?.id,RESIDENT_DAY_ID);assert.equal(state.actorMatchCount,1);
    assert.ok(state.actor?.visible&&state.actor.legacyLODVisible,'actual Low resident model visible in the same room');
    assert.ok(state.actor.worldPosition&&Math.hypot(a.x-state.actor.worldPosition.x,a.y-state.actor.worldPosition.y,a.z-state.actor.worldPosition.z)<.08);
  }
  if(a.transit?.phase==='riding'){
    const ticket=state.ticket,v=state.vehicle;assert.ok(ticket&&v);
    assert.equal(ticket.id,a.id);assert.equal(ticket.vehicleId,a.transit.ticket.vehicleId);assert.equal(ticket.routeId,'harbor-tram');
    assert.equal(v.kind,'tram');assert.equal(v.id,ticket.vehicleId);
    const expected=ticketPose(ticket,v);assert.ok(Math.abs(a.y-expected.y)<.051,'same actual tram lower-deck height');
    assert.ok(Math.hypot(a.x-expected.x,a.z-expected.z)<Math.abs(v.speed||0)*.1+.65,'same actual tram seat/world pose within one100ms life tick plus turning-seat extent');
  }
  return d.completedCycles>=1;
}
export function auditResidentDaySave(save,{homeRoomId,requireCompleted=false,requirePaidPeriod=0}={}) {
  const life=save.harborLife,loop=life?.residentLoop,a=life?.agents.find(a=>a.id===RESIDENT_DAY_ID);
  assert.ok(loop&&a);assert.equal(loop.clock.secondsPerHour,120);assert.equal(loop.clock.startHour,6.5);
  const job=loop.activeJob||loop.completedJobs.at(-1);assert.ok(job);
  const wageRows=life.transactions.filter(t=>t.type==='resident-work-wage'&&t.agentId===a.id&&t.jobId===job.id);
  if(requirePaidPeriod){
    const tx=wageRows.find(t=>t.period===requirePaidPeriod);assert.ok(tx,'actual retained funded wage transaction');
    const receipt=job.receipts.find(r=>r.period===requirePaidPeriod);assert.ok(receipt);
    assert.equal(tx.id,receipt.transactionId);assert.equal(tx.from,'harbor-supply');assert.equal(tx.to,a.id);assert.equal(tx.amount,3);
    assert.equal(tx.validTicks,receipt.validTicks);assert.ok(tx.validTicks>=requirePaidPeriod*350);
    assert.equal(tx.workClockTick,receipt.paidTick);assert.ok(receipt.paidTick-job.startedTick>=receipt.validTicks);
  }
  if(requireCompleted){
    assert.equal(loop.completedCycles,1);assert.equal(loop.totalValidWorkTicks,700);assert.equal(loop.totalWages,6);assert.equal(loop.purchases,1);
    assert.equal(job.validTicks,700);assert.equal(job.paidPeriods,2);assert.equal(job.paidAmount,6);assert.equal(job.receipts.length,2);
    assert.equal(loop.stage,'resting-home');assert.equal(a.insideBuildingId,'south-083');assert.equal(a.floorId,'lobby');assert.equal(a.roomId,homeRoomId);
    assert.equal(a.transit,null);assert.equal(loop.activeJob,null);
    const buy=life.transactions.filter(t=>t.type==='purchase'&&t.agentId===a.id&&t.residentCycle===1);
    assert.equal(buy.length,1);assert.equal(buy[0].amount,6);assert.equal(buy[0].quantity,1);assert.equal(buy[0].product,'produce');assert.equal(buy[0].shopId,'harbor-produce');
    const events=loop.events;const boards=events.filter(e=>e.type==='tram-boarded'),alights=events.filter(e=>e.type==='tram-alighted');
    assert.equal(boards.length,2);assert.equal(alights.length,2);
    assert.equal(boards[0].originStopId,'harbor-tram-lantern');assert.equal(boards[0].destinationStopId,'harbor-tram-workshop');
    assert.equal(boards[1].originStopId,'harbor-tram-workshop');assert.equal(boards[1].destinationStopId,'harbor-tram-lantern');
    const sequence=events.filter(e=>['depart-home','tram-boarded','tram-alighted','started-work','paid-work','finished-work','purchased-food','returned-home'].includes(e.type)).map(e=>e.type);
    assert.deepEqual(sequence,['depart-home','tram-boarded','tram-alighted','started-work','paid-work','paid-work','finished-work','tram-boarded','tram-alighted','purchased-food','returned-home']);
  }
  const money=life.supply.money+life.shops.reduce((n,s)=>n+s.money,0)+life.agents.reduce((n,a)=>n+a.money,0)+life.player.earnedCash-life.player.spentCash+life.jobs.reduce((n,j)=>n+(j.escrow||0),0);
  const goods=Object.values(life.supply.stock).reduce((a,b)=>a+b,0)+life.shops.reduce((n,s)=>n+s.stock,0)+life.jobs.reduce((n,j)=>n+(j.status==='picked-up'?j.quantity:0),0)+life.statistics.consumed+Object.values(life.player.inventory).reduce((a,b)=>a+b,0);
  assert.equal(money,life.initialMoney);assert.equal(goods,life.initialGoods);
  return {residentId:a.id,stage:loop.stage,completedCycles:loop.completedCycles,validTicks:job.validTicks,paidPeriods:job.paidPeriods,totalWages:loop.totalWages,purchases:loop.purchases,retainedWageTransactions:wageRows,jobReceipts:job.receipts,totalMoney:money,totalGoods:goods,actualHomePose:{x:a.x,y:a.y,z:a.z,buildingId:a.insideBuildingId,floorId:a.floorId,roomId:a.roomId}};
}
