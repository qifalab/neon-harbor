import * as THREE from '../vendor/three/three.module.js';
import { createWorld } from './world.js';
import { createCar, createCharacter } from './models.js';
import { GameSimulation, MISSION_DEFS } from './simulation.js';
import { CityAudio } from './audio.js';
import { FIXED_STEP, captureSimulation, RenderSnapshots } from './presentation.js';
import { FixedStepClock } from './frame-clock.js';
import { ChaseCamera, clipCameraSegment, resolveCameraPoint } from './camera.js';
import { VEHICLE_DIMENSIONS } from './world-config.js';
import { vehiclePoseEnvelope } from './ground-support.js';
import { createAtmosphere } from './atmosphere.js';
import { SpatialIndex, vehicleContacts, circleContacts, CHARACTER_RADIUS } from './collision.js';

const $=id=>document.getElementById(id), clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const SAVE_KEY='neon-harbor.progress.v1', SETTINGS_KEY='neon-harbor.settings.v1';
const defaults={quality:'high',volume:.3,dayCycle:true,hour:16.5,sensitivity:1,touch:matchMedia('(pointer:coarse)').matches};
let settings={...defaults},saved=null,storageOK=true;
try{saved=localStorage.getItem(SAVE_KEY);const v=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'null');if(v&&typeof v==='object'){settings={quality:['high','balanced','low'].includes(v.quality)?v.quality:defaults.quality,volume:clamp(Number(v.volume)||0,0,1),dayCycle:typeof v.dayCycle==='boolean'?v.dayCycle:true,hour:Number.isFinite(v.hour)?clamp(v.hour,0,23.9):defaults.hour,sensitivity:Number.isFinite(v.sensitivity)?clamp(v.sensitivity,.3,2):1,touch:typeof v.touch==='boolean'?v.touch:defaults.touch};}}catch{storageOK=false;}
let renderer,scene,camera,world,sim,character,sun,hemi,marker,markerRing,tracer,atmosphere;
let started=false,activeTab='jobs',paused=false,sceneTime=0,hudElapsed=0,saveElapsed=0,lastRevision=-1,lastShot=-1;
const frameClock=new FixedStepClock(FIXED_STEP);
let frameTiming={wallDt:0,dt:0,steps:0,alpha:0,simulationDelta:0,droppedSeconds:0,droppedTotal:0};
let cameraYaw=Math.PI,cameraOrbitYaw=Math.PI,cameraPitch=.28,cameraDragAge=99,drag=null,frameCount=0,fps=60,fpsClock=0;
let presentation,renderFrame,renderCollisionIndex,cameraCollisionIndex;
let menuFocus={x:8,y:0,z:174};
let prepareRevision=0,worldPreparing=false,lastStreamFailures=0,startupPhase='graphics',bootCompleted=false;
const cameraRig=new ChaseCamera();
const carMeshes=new Map(),keys=new Set(),touchHeld=new Set(),walkers=[],audio=new CityAudio();
const sunTarget=new THREE.Object3D(),sunOffset=new THREE.Vector3(),sunRight=new THREE.Vector3(),sunUp=new THREE.Vector3(),worldUp=new THREE.Vector3(0,1,0);
const panel=$('panel'),mapCanvas=$('minimap'),mapContext=mapCanvas.getContext('2d');
let mapBackground;

function toast(text,type='info'){
  const node=document.createElement('div');node.className='toast '+type;node.textContent=text;$('toasts').append(node);setTimeout(()=>node.remove(),4300);
}
function save(){
  if(!sim)return;
  try{localStorage.setItem(SAVE_KEY,JSON.stringify(sim.exportSave()));localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));storageOK=true;$('save-status').textContent='进度已保存 · 当前浏览器';}
  catch{if(storageOK)toast('浏览器存储不可用，本次进度暂时无法保存。','warning');storageOK=false;$('save-status').textContent='存储不可用 · 请导出进度';}
}
function drainMessages(){for(const item of sim.messages.splice(0)){toast(item.text,item.type);audio.cue(item.type);}}
function cleanInput(){keys.clear();touchHeld.clear();drag=null;document.querySelectorAll('.pressed').forEach(n=>n.classList.remove('pressed'));}
function resetPresentation(){
  const frame=captureSimulation(sim);
  if(presentation)presentation.reset(frame);
  else presentation=new RenderSnapshots(frame,(pose,kind)=>{
    const options={index:renderCollisionIndex,bounds:world.bounds,supportAt:vehiclePoseEnvelope};
    return (kind==='vehicle'?vehicleContacts(pose,options):circleContacts(pose,CHARACTER_RADIUS,options)).length===0;
  });
  renderFrame=presentation.sample(1);frameClock.suspend(true);cameraRig.reset();
  cameraYaw=cameraOrbitYaw=sim.position.yaw;cameraDragAge=99;
}
async function prepareLocation(retry=false){
  const revision=++prepareRevision;worldPreparing=true;$('start').disabled=true;
  try{
    const result=retry&&world.retry?await world.retry(sim.position):world.prepare?await world.prepare(sim.position):{ready:true,failed:[]};
    if(revision===prepareRevision&&!result.ready){
      lastStreamFailures=Array.isArray(result.failed)?result.failed.length:Number(result.failed)||1;
      toast('部分街区暂未载入，可继续探索，或在设置中重新加载附近街区。','warning');
    }
    return result;
  }catch(error){
    console.error('Nearby city loading failed:',error);
    if(revision===prepareRevision)toast('附近街区加载失败，可在设置中重新加载。','warning');
    return {ready:false,failed:['network']};
  }finally{
    if(revision===prepareRevision){worldPreparing=false;$('start').disabled=!bootCompleted;}
  }
}
function openPanel(tab='jobs'){
  activeTab=tab;paused=true;frameClock.suspend();cleanInput();audio.pause();renderPanel();if(!panel.open)panel.showModal();
}
function closePanel(){if(panel.open)panel.close();paused=false;frameClock.suspend();cleanInput();if(started){audio.start();$('game').focus();}save();}
async function enterCity(){
  await prepareLocation();
  started=true;paused=false;cameraPitch=.28;resetPresentation();
  $('welcome').classList.add('hidden');$('hud').classList.remove('hidden');$('touch-controls').classList.toggle('hidden',!settings.touch);
  audio.start();audio.setVolume(settings.volume);$('game').focus();updateCamera(0);
  toast(saved?'欢迎回到霓港。已恢复你的进度。':'欢迎来到霓港。WASD 移动，靠近青色跑车后按 E 上车。');save();
}
function reload(){if(sim.ammo<18&&!sim.reloadRemaining){sim.reloadRemaining=1.8;toast('正在装填…');}}
function action(name){
  if(!started||paused)return;
  if(name==='interact'&&sim.interact())resetPresentation();if(name==='fire')sim.fire();if(name==='reload')reload();drainMessages();
}

/** Interface only translates input. All mission/physics state lives in simulation.js. */
function inputState(){
  const forward=(keys.has('KeyW')||keys.has('ArrowUp')||touchHeld.has('forward')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')||touchHeld.has('backward')?1:0);
  const strafe=(keys.has('KeyD')||keys.has('ArrowRight')||touchHeld.has('right')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')||touchHeld.has('left')?1:0);
  return {forward,strafe,turn:-strafe,sprint:keys.has('ShiftLeft')||keys.has('ShiftRight')||touchHeld.has('sprint'),brake:keys.has('Space')||touchHeld.has('brake'),jump:keys.has('Space')||touchHeld.has('brake'),fire:keys.has('KeyJ'),cameraYaw};
}
window.addEventListener('keydown',event=>{
  if(event.target.matches('input,select,textarea'))return;
  if(['Tab','Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code))event.preventDefault();
  if(event.repeat)return;
  if(event.code==='Escape'){event.preventDefault();if(panel.open)closePanel();else if(started)openPanel('jobs');return;}
  if(!started)return;
  if(event.code==='Tab'){if(panel.open&&activeTab==='jobs')closePanel();else openPanel('jobs');return;}
  if(event.code==='KeyM'){if(panel.open&&activeTab==='map')closePanel();else openPanel('map');return;}
  if(paused)return;keys.add(event.code);
  if(event.code==='KeyE'||event.code==='KeyF')action('interact');
  if(event.code==='KeyR')action('reload');
  if(event.code==='KeyC'){cameraOrbitYaw=sim.position.yaw;cameraPitch=.28;cameraDragAge=99;}
});
window.addEventListener('keyup',event=>keys.delete(event.code));
window.addEventListener('blur',()=>{cleanInput();if(started&&!panel.open)openPanel('jobs');});
document.addEventListener('visibilitychange',()=>{frameClock.suspend();fpsClock=0;frameCount=0;if(document.hidden){cleanInput();save();if(started&&!panel.open)openPanel('jobs');}});
window.addEventListener('pagehide',save);
panel.addEventListener('cancel',event=>{event.preventDefault();closePanel();});
$('game').addEventListener('pointerdown',event=>{if(!started||paused)return;cameraOrbitYaw=cameraYaw;drag={x:event.clientX,y:event.clientY,id:event.pointerId};$('game').setPointerCapture(event.pointerId);});
$('game').addEventListener('pointermove',event=>{if(!drag||drag.id!==event.pointerId)return;cameraOrbitYaw-=(event.clientX-drag.x)*.005*settings.sensitivity;cameraPitch=clamp(cameraPitch+(event.clientY-drag.y)*.003*settings.sensitivity,.08,.85);drag.x=event.clientX;drag.y=event.clientY;cameraDragAge=0;});
$('game').addEventListener('pointerup',()=>drag=null);$('game').addEventListener('pointercancel',()=>drag=null);$('game').addEventListener('contextmenu',event=>event.preventDefault());
for(const button of document.querySelectorAll('[data-hold]')){
  button.addEventListener('pointerdown',event=>{event.preventDefault();button.setPointerCapture(event.pointerId);touchHeld.add(button.dataset.hold);button.classList.add('pressed');});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,()=>{touchHeld.delete(button.dataset.hold);button.classList.remove('pressed');});
}
for(const button of document.querySelectorAll('[data-action]'))button.addEventListener('click',()=>action(button.dataset.action));
$('start').addEventListener('click',enterCity);$('welcome-settings').addEventListener('click',()=>openPanel('settings'));$('welcome-help').addEventListener('click',()=>openPanel('help'));
$('pause').addEventListener('click',()=>openPanel('jobs'));$('jobs').addEventListener('click',()=>openPanel('jobs'));$('map-button').addEventListener('click',()=>openPanel('map'));
$('close-panel').addEventListener('click',closePanel);$('resume').addEventListener('click',closePanel);
for(const tab of document.querySelectorAll('[data-tab]'))tab.addEventListener('click',()=>{activeTab=tab.dataset.tab;renderPanel();});

function renderPanel(){
  const titles={jobs:'城市委托',map:'把整座城市装进口袋',garage:'车库与补给',settings:'按你的方式，游玩霓港',help:'出发之前'};
  $('panel-title').textContent=titles[activeTab];$('resume').textContent=started?'继续游戏 →':'返回主菜单 →';
  document.querySelectorAll('[data-tab]').forEach(n=>n.classList.toggle('active',n.dataset.tab===activeTab));
  const content=$('panel-content');
  if(activeTab==='jobs'){
    content.innerHTML=`<p class="panel-intro">${sim.mission?'当前委托进行中。请先完成或放弃当前委托，再接受新的委托。':'每条街道，都通向一段新的故事。驾驶任意车辆，沿小地图导航抵达目标。'}<br>首次完成获得奖金，再次挑战刷新个人纪录。</p><div class="job-grid"></div>${sim.mission?'<div class="settings-actions"><button id="cancel-job" class="secondary-button danger">放弃当前委托</button></div>':''}`;
    const grid=content.querySelector('.job-grid');
    for(const [i,def] of MISSION_DEFS.entries()){
      const completed=sim.completed.has(def.id),best=sim.bestTimes[def.id];const article=document.createElement('article');article.className='job'+(completed?' completed':'');
      article.innerHTML=`<div class="job-number">0${i+1} / ${['COURIER','STREET CIRCUIT','GETAWAY'][i]} ${completed?'✓':''}</div><h3>${def.title}</h3><p>${def.description}${best?`<br>最佳纪录 ${best.toFixed(1)} 秒`:''}</p><div class="reward">${completed?'已完成':'$ '+def.reward.toLocaleString()}<small>${def.duration} 秒</small></div><button data-mission="${def.id}">${completed?'再次挑战':'接受委托'} ↗</button>`;
      article.querySelector('button').addEventListener('click',async()=>{if(!started)await enterCity();sim.startMission(def.id);drainMessages();closePanel();});grid.append(article);
    }
    $('cancel-job')?.addEventListener('click',()=>{sim.cancelMission();drainMessages();renderPanel();});
  }else if(activeTab==='map'){
    content.innerHTML='<p class="panel-intro">沿着大道探索六个城区。绿色圆点是你，黄色圆环是当前目标，红色标记是追捕车辆。</p><canvas id="city-map" class="big-map" width="900" height="600" aria-label="城市全景地图"></canvas><div class="map-legend"><span><b style="color:#c4ef9c">●</b>你的位置</span><span><b style="color:#ffe296">◉</b>任务目标</span><span><b style="color:#ee9383">▲</b>追捕车辆</span></div>';
    drawMap($('city-map'),true);
  }else if(activeTab==='garage'){
    content.innerHTML=`<p class="panel-intro">路边维修服务可恢复生命值与附近车辆，每次 $150。追捕期间无法使用。已完成的委托与资金会自动保存。</p><div class="garage-stats"><div><small>可用资金</small><strong>$ ${sim.cash.toLocaleString()}</strong></div><div><small>车辆状态</small><strong>${Math.round((sim.activeVehicle||sim.nearestCar)?.health??100)}%</strong></div><div><small>已完成委托</small><strong>${sim.completed.size} / 3</strong></div></div><button id="repair" class="primary-button compact">呼叫维修 · $150 ↗</button>`;
    $('repair').addEventListener('click',()=>{sim.repair();drainMessages();save();renderPanel();});
  }else if(activeTab==='settings'){
    content.innerHTML=`<div class="settings-grid"><label class="setting">画面质量<select id="quality"><option value="high">精细 · 动态阴影</option><option value="balanced">均衡 · 推荐</option><option value="low">流畅 · 低像素密度</option></select><small>调整渲染分辨率与阴影，立即生效。</small></label><label class="setting">音效音量<input id="volume" type="range" min="0" max="1" step=".05"><small>引擎、提示和追捕音效。</small></label><label class="setting">镜头灵敏度<input id="sensitivity" type="range" min=".3" max="2" step=".1"></label><label class="setting">城市时间<input id="time" type="range" min="0" max="23.9" step=".1"><small>拖动选择白昼、黄昏或夜晚。</small></label><label class="setting check"><input id="cycle" type="checkbox"> 自动昼夜交替</label><label class="setting check"><input id="touch-setting" type="checkbox"> 显示触屏控制</label></div><div class="settings-actions"><button id="reload-city" class="secondary-button">重新加载附近街区</button><button id="export-save" class="secondary-button">导出进度</button><button id="import-save" class="secondary-button">导入进度</button><input id="save-file" class="hidden" type="file" accept="application/json,.json"><button id="reset-save" class="secondary-button danger">开始新旅程</button></div><p class="panel-intro" style="margin-top:18px">存档仅保存在本机浏览器；重新载入时回到步行状态，进行中的任务与追捕不会保留。</p>`;
    $('quality').value=settings.quality;$('volume').value=settings.volume;$('sensitivity').value=settings.sensitivity;$('time').value=settings.hour;$('cycle').checked=settings.dayCycle;$('touch-setting').checked=settings.touch;
    $('quality').addEventListener('change',event=>{settings.quality=event.target.value;applyQuality();save();});
    $('volume').addEventListener('input',event=>{settings.volume=Number(event.target.value);audio.start();audio.setVolume(settings.volume);save();});
    $('sensitivity').addEventListener('input',event=>{settings.sensitivity=Number(event.target.value);save();});
    $('time').addEventListener('input',event=>{settings.hour=Number(event.target.value);settings.dayCycle=false;$('cycle').checked=false;save();});
    $('cycle').addEventListener('change',event=>{settings.dayCycle=event.target.checked;save();});
    $('touch-setting').addEventListener('change',event=>{settings.touch=event.target.checked;$('touch-controls').classList.toggle('hidden',!settings.touch||!started);save();});
    $('reload-city').addEventListener('click',async()=>{const button=$('reload-city');button.disabled=true;const result=await prepareLocation(true);button.disabled=false;if(result.ready)toast('附近街区已加载','success');});
    $('export-save').addEventListener('click',()=>{save();const url=URL.createObjectURL(new Blob([JSON.stringify(sim.exportSave(),null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='neon-harbor-save.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('进度已导出');});
    $('import-save').addEventListener('click',()=>$('save-file').click());
    $('save-file').addEventListener('change',async event=>{const file=event.target.files?.[0];if(!file)return;try{if(file.size>100000)throw Error();const value=JSON.parse(await file.text());if(value.version!==1||!Array.isArray(value.completed)||!Number.isFinite(value.cash))throw Error();sim=new GameSimulation({colliders:world.colliders,bounds:world.bounds,groundHeightAt:world.groundHeightAt,save:value});resetPresentation();await prepareLocation();save();toast('进度已导入','success');renderPanel();}catch{toast('无法读取此存档，请选择有效的霓港进度文件。','warning');}});
    $('reset-save').addEventListener('click',()=>{content.innerHTML='<h3>开始新的旅程？</h3><p class="panel-intro">当前资金、委托纪录和位置将被重置。建议先导出进度。</p><div class="settings-actions"><button id="confirm-reset" class="secondary-button danger">确认重置进度</button><button id="cancel-reset" class="secondary-button">保留当前进度</button></div>';$('confirm-reset').addEventListener('click',async()=>{sim.reset();resetPresentation();await prepareLocation();save();drainMessages();renderPanel();});$('cancel-reset').addEventListener('click',renderPanel);});
  }else{
    const rows=[['W A S D','移动 / 驾驶'],['Shift','步行冲刺'],['Space','跳跃 / 手刹'],['E / F','上下车'],['拖动画面','环顾镜头'],['C','重置镜头'],['J','向前射击'],['R','装填弹匣'],['Tab','委托中心'],['M','城市地图'],['Esc','暂停 / 返回']];
    content.innerHTML='<p class="panel-intro">先靠近前方青色跑车，按 E 上车。W 加速，S 制动与倒车；高速转弯时配合空格手刹。碰撞交通车辆或开火会引来追捕，驶离警车视线并保持距离可解除警戒。射击命中朝向内的车辆，建筑会阻挡射线。</p><div class="help-grid">'+rows.map(([key,text])=>`<div class="help-row"><span>${text}</span><kbd>${key}</kbd></div>`).join('')+'</div><p class="panel-intro" style="margin-top:20px">手机使用左侧方向键与右侧操作按钮，拖动画面转动视角。建议横屏。所有角色、城市与声音均为原创程序生成。</p>';
  }
}

function applyQuality(){if(!renderer)return;world?.setQuality?.(settings.quality);const scale={high:2,balanced:1.2,low:.8}[settings.quality];renderer.setPixelRatio(Math.min(devicePixelRatio,scale));renderer.shadowMap.enabled=settings.quality==='high';renderer.setSize(innerWidth,innerHeight,false);if(world)world.root.traverse(n=>{if(n.isMesh&&!n.userData.noShadow)n.castShadow=settings.quality==='high';});}
function buildMap(){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=720;const c=canvas.getContext('2d');c.fillStyle='#122d34';c.fillRect(0,0,720,720);c.fillStyle='#286877';c.fillRect(654,0,66,720);
  const project=v=>(v+320)/640*720;
  c.fillStyle='#213f46';for(const b of world.colliders)c.fillRect(project(b.x-b.hx),project(b.z-b.hz),b.hx*2/640*720,b.hz*2/640*720);
  c.strokeStyle='#536767';c.lineWidth=19;for(const axis of [-240,-160,-80,0,80,160,240]){c.beginPath();c.moveTo(project(axis),34);c.lineTo(project(axis),686);c.moveTo(34,project(axis));c.lineTo(686,project(axis));c.stroke();}
  c.strokeStyle='#729087';c.lineWidth=1;for(const axis of [-240,-160,-80,0,80,160,240]){c.beginPath();c.moveTo(project(axis),34);c.lineTo(project(axis),686);c.moveTo(34,project(axis));c.lineTo(686,project(axis));c.stroke();}return canvas;
}
function drawMap(canvas,full=false){
  if(!world||!sim)return;const c=canvas===mapCanvas?mapContext:canvas.getContext('2d'),w=canvas.width,h=canvas.height,p=sim.position;
  c.fillStyle='#112831';c.fillRect(0,0,w,h);let scale,cx,cz;
  if(full){scale=Math.min(w,h)*.88/640;cx=0;cz=0;}else{scale=1.1;cx=p.x;cz=p.z;}
  const px=x=>w/2+(x-cx)*scale,pz=z=>h/2+(z-cz)*scale;
  c.drawImage(mapBackground,px(-320),pz(-320),640*scale,640*scale);
  if(full){c.font='13px sans-serif';for(const l of world.landmarks){c.fillStyle=l.color;c.beginPath();c.arc(px(l.x),pz(l.z),4,0,Math.PI*2);c.fill();c.fillStyle='#d1e1d8';c.fillText(l.name,px(l.x)+9,pz(l.z)-8);}}
  for(const car of sim.cars){if(car.health<=0||car.id===sim.inCar)continue;c.fillStyle=car.police?'#ff8e87':car.traffic?'#9bbaaf':'#99d1d1';c.fillRect(px(car.x)-2,pz(car.z)-2,4,4);}
  const target=sim.mission?.phase==='escape'?null:sim.mission?.target;if(target){c.strokeStyle='#ffde8a';c.fillStyle='#ffde8a22';c.lineWidth=2;c.beginPath();c.arc(px(target.x),pz(target.z),8+Math.sin(sceneTime*3)*2,0,Math.PI*2);c.fill();c.stroke();c.setLineDash([4,5]);c.lineWidth=1;c.beginPath();c.moveTo(px(p.x),pz(p.z));c.lineTo(px(target.x),pz(target.z));c.stroke();c.setLineDash([]);}
  c.save();c.translate(px(p.x),pz(p.z));c.rotate(-p.yaw);c.fillStyle='#d4ffa3';c.strokeStyle='#112a2e';c.lineWidth=2;c.beginPath();c.moveTo(0,9);c.lineTo(-6,-6);c.lineTo(0,-3);c.lineTo(6,-6);c.closePath();c.stroke();c.fill();c.restore();
}
function updateHUD(){
  const pos=sim.position,car=sim.activeVehicle,m=sim.mission,hour=Math.floor(settings.hour),minute=Math.floor((settings.hour-hour)*60);
  const streaming=world.streamingStats;
  if(streaming){
    const failures=Array.isArray(streaming.failed)?streaming.failed.length:Number(streaming.failed)||0;
    if(failures>lastStreamFailures)toast('部分街区暂未载入，可在设置中重新加载附近街区。','warning');
    lastStreamFailures=failures;
  }
  $('district').textContent=world.districtAt(pos.x,pos.z);$('clock').textContent=`${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')} · 晴`;$('map-location').textContent=world.districtAt(pos.x,pos.z);
  $('money').textContent='$ '+sim.cash.toLocaleString();$('wanted').textContent='★'.repeat(sim.wanted)+'☆'.repeat(5-sim.wanted);$('wanted').classList.toggle('hot',sim.wanted>0);$('wanted').setAttribute('aria-label',`追捕等级 ${sim.wanted}`);
  $('health-fill').style.width=sim.player.health+'%';$('stamina-fill').style.width=sim.player.stamina+'%';$('speed').textContent=String(Math.round(sim.speed*3.6)).padStart(2,'0');$('speed-fill').style.width=clamp(sim.speed/43*100,0,100)+'%';$('mode-label').textContent=car?'DRIVING / '+(car.type==='sport'?'SPORT':'STREET'):'ON FOOT';$('vehicle-name').textContent=car?`${car.police?'巡逻车':car.type==='sport'?'海风 GT':'城市轿车'} · ${Math.round(car.health)}%`:'城市漫游者';$('ammo').textContent=sim.reloadRemaining?'装填中…':`${sim.ammo} / ∞`;
  $('mission-label').textContent=m?'正在进行':sim.wanted?'追捕中':'自由探索';$('mission-title').textContent=m?m.title:sim.wanted?'甩开身后的追捕。':'这座城市，等你出发。';$('mission-objective').textContent=m?m.objective:sim.wanted?`离开警车视线并保持距离。脱离进度 ${Math.round(sim.escapeProgress*100)}%。`:'靠近车辆按 E 驾驶，前往委托中心开启你的城市故事。';$('mission-time').textContent=m?`${Math.ceil(m.remaining)}s`:'';$('mission-distance').textContent=m?.phase==='escape'?`${Math.round(sim.escapeProgress*100)}%`:m?.target?`${Math.round(Math.hypot(m.target.x-pos.x,m.target.z-pos.z))} m`:'TAB';
  $('interaction').querySelector('span').textContent=car?(Math.abs(car.speed)>5?'先停车，再下车':'离开车辆'):sim.nearestCar?'驾驶这辆车':'靠近车辆以驾驶';$('crosshair').classList.toggle('hidden',!keys.has('KeyJ'));
  drawMap(mapCanvas);if(panel.open&&activeTab==='map')drawMap($('city-map'),true);
}

function animateCharacter(model,phase,amount,sprinting=false){
  const joints=model.userData,swing=Math.sin(phase)*amount;
  joints.leftLeg.rotation.x=swing;joints.rightLeg.rotation.x=-swing;
  joints.leftArm.rotation.x=-swing*.8;joints.rightArm.rotation.x=swing*.8;
  if(joints.leftKnee)joints.leftKnee.rotation.x=Math.max(0,swing)*1.35;
  if(joints.rightKnee)joints.rightKnee.rotation.x=Math.max(0,-swing)*1.35;
  if(joints.leftElbow)joints.leftElbow.rotation.x=-.12-amount*(sprinting?.9:.28)-Math.max(0,-swing)*.25;
  if(joints.rightElbow)joints.rightElbow.rotation.x=-.12-amount*(sprinting?.9:.28)-Math.max(0,swing)*.25;
}
function updateVisuals(dt){
  const alive=new Set();for(const car of sim.cars){alive.add(car.id);let model=carMeshes.get(car.id);if(!model){model=createCar(THREE,car.color,car.police?'police':car.type);scene.add(model);carMeshes.set(car.id,model);}const pose=renderFrame.cars.get(car.id)||car;model.position.set(pose.x,pose.y||0,pose.z);model.rotation.order='YXZ';model.rotation.set(pose.pitch||0,pose.yaw,pose.roll||0);model.visible=car.health>0;for(const wheel of model.userData.wheelsAll||model.userData.wheels||[])wheel.rotation.x+=(pose.speed||0)*dt/VEHICLE_DIMENSIONS.wheelRadius;for(const [i,light] of (model.userData.policeLights||[]).entries()){light.emissiveIntensity=(Math.sin(sceneTime*13+i*Math.PI)>0?4:.2);}}
  for(const [id,model] of carMeshes)if(!alive.has(id)){scene.remove(model);carMeshes.delete(id);model.userData.disposeInstance?.();}
  character.position.set(renderFrame.player.x,renderFrame.player.y,renderFrame.player.z);character.rotation.y=renderFrame.player.yaw;character.visible=!sim.inCar;
  const moving=inputState(),walkAmount=Math.abs(moving.forward)+Math.abs(moving.strafe)>0&&!paused?.55:0;
  animateCharacter(character,renderFrame.elapsed*(moving.sprint?15:10),walkAmount,moving.sprint);
  for(const [i,walker] of walkers.entries()){
    const route=world.walkerRoutes[i];
    const lengths=route.map((point,j)=>Math.hypot(route[(j+1)%route.length].x-point.x,route[(j+1)%route.length].z-point.z));
    let travel=(sceneTime*(1.1+i%3*.18)+i*37)%lengths.reduce((a,b)=>a+b,0),segment=0;
    while(travel>lengths[segment]){travel-=lengths[segment];segment++;}
    const from=route[segment],to=route[(segment+1)%route.length],ratio=travel/lengths[segment];
    const wx=from.x+(to.x-from.x)*ratio,wz=from.z+(to.z-from.z)*ratio;
    walker.position.set(wx,world.groundHeightAt(wx,wz),wz);walker.rotation.y=Math.atan2(to.x-from.x,to.z-from.z);animateCharacter(walker,sceneTime*8+i,.42);
  }
  const target=sim.mission?.phase==='escape'?null:sim.mission?.target;marker.visible=!!target;if(target){marker.position.set(target.x,1,target.z);markerRing.rotation.z=sceneTime*.4;marker.children[1].position.y=3.5+Math.sin(sceneTime*2)*.45;}
  if(sim.lastShot&&sim.lastShot.at!==lastShot){lastShot=sim.lastShot.at;const s=sim.lastShot;tracer.geometry.setFromPoints([new THREE.Vector3(s.x,1.3,s.z),new THREE.Vector3(s.x+Math.sin(s.yaw)*40,1.3,s.z+Math.cos(s.yaw)*40)]);tracer.userData.until=sceneTime+.075;audio.shot();}
  tracer.visible=sceneTime<(tracer.userData.until||0);
}
function updateModelDetail(){
  // Select against the view camera only; a shadow-camera pass must not switch
  // the visible geometry tier or overwrite the character animation hierarchy.
  camera.updateMatrixWorld();
  for(const model of carMeshes.values())model.userData.updateLOD?.(camera);
  character.userData.updateLOD?.(camera);
  for(const walker of walkers)walker.userData.updateLOD?.(camera);
}
function updateCamera(dt){
  if(!started){
    // A street-level three-quarter shot shows the actual nearby assets, not
    // distant streaming proxies. Resume saves choose a nearby vehicle/player.
    const player=renderFrame.player;
    const parked=sim.cars.filter(car=>!car.traffic&&!car.police&&car.health>0&&Math.hypot(car.x-player.x,car.z-player.z)<45)
      .sort((a,b)=>Math.hypot(a.x-player.x,a.z-player.z)-Math.hypot(b.x-player.x,b.z-player.z))[0];
    const anchor=parked?(renderFrame.cars.get(parked.id)||parked):player;
    menuFocus={x:anchor.x,y:anchor.y||0,z:anchor.z};
    const yaw=anchor.yaw,side=-10+Math.sin(sceneTime*.08)*.8,front=8+Math.cos(sceneTime*.07)*.6;
    const target={x:anchor.x-Math.cos(yaw)*3-Math.sin(yaw)*4.5,y:menuFocus.y+1.4,z:anchor.z+Math.sin(yaw)*3-Math.cos(yaw)*4.5};
    const eye={x:anchor.x+Math.cos(yaw)*side+Math.sin(yaw)*front,y:menuFocus.y+4.6,
      z:anchor.z-Math.sin(yaw)*side+Math.cos(yaw)*front};
    const nearby=cameraCollisionIndex.query({x:anchor.x,z:anchor.z,hx:24,hz:24});
    const pivot=resolveCameraPoint(target,nearby,.45),safe=clipCameraSegment(pivot,eye,nearby,.45).position;
    camera.position.set(safe.x,safe.y,safe.z);camera.lookAt(pivot.x,pivot.y,pivot.z);return;
  }
  if(paused)return;
  cameraDragAge+=dt;
  const manual=!!drag||cameraDragAge<2;
  const subject=renderFrame.subject,previous=cameraRig.position||subject;
  const cameraColliders=cameraCollisionIndex.query({x:(subject.x+previous.x)/2,z:(subject.z+previous.z)/2,
    hx:Math.abs(subject.x-previous.x)/2+20,hz:Math.abs(subject.z-previous.z)/2+20});
  const state=cameraRig.update(renderFrame.subject,{
    yaw:sim.inCar&&!manual?renderFrame.subject.yaw:cameraOrbitYaw,
    pitch:cameraPitch,driving:!!sim.inCar,manual,aspect:camera.aspect,near:camera.near,
  },dt,cameraColliders);
  cameraYaw=state.yaw;
  camera.position.set(state.position.x,state.position.y,state.position.z);
  camera.lookAt(state.target.x,state.target.y,state.target.z);
  camera.fov=state.fov;camera.updateProjectionMatrix();
}
function lighting(dt){
  if(settings.dayCycle&&started&&!paused)settings.hour=(settings.hour+dt/35)%24;
  const daylight=clamp(Math.sin((settings.hour-6)/12*Math.PI),0,1);
  const p=started?renderFrame.subject:menuFocus;
  atmosphere.update(settings.hour,p,hemi,sun);
  sunOffset.set(-100,95+daylight*100,-65);
  sunRight.crossVectors(worldUp,sunOffset).normalize();sunUp.crossVectors(sunOffset,sunRight).normalize();
  sunTarget.position.set(p.x,0,p.z);
  // Snap in light-space texels, not simulation/world axes, to avoid shadow crawl.
  if(settings.quality==='high'){
    const texel=(sun.shadow.camera.right-sun.shadow.camera.left)/sun.shadow.mapSize.x;
    const right=sunTarget.position.dot(sunRight),up=sunTarget.position.dot(sunUp);
    sunTarget.position.addScaledVector(sunRight,Math.round(right/texel)*texel-right);
    sunTarget.position.addScaledVector(sunUp,Math.round(up/texel)*texel-up);
  }
  sun.position.copy(sunTarget.position).add(sunOffset);sunTarget.updateMatrixWorld();world.update(dt,settings.hour/24,{position:renderFrame.subject,velocity:{x:sim.activeVehicle?.vx||0,z:sim.activeVehicle?.vz||0}});
}
function frame(time){
  requestAnimationFrame(frame);const active=started&&!paused&&!document.hidden;
  frameTiming=frameClock.advance(time,active);const {wallDt,dt,steps,alpha}=frameTiming;
  if(document.hidden){frameClock.suspend();return;}
  if(!started||!paused)sceneTime+=dt;fpsClock+=wallDt;frameCount++;if(fpsClock>1){fps=frameCount/fpsClock;frameCount=0;fpsClock=0;}
  if(active){
    const input=inputState();
    for(let step=0;step<steps;step++){
      sim.update(FIXED_STEP,input);
      if(presentation.advance(captureSimulation(sim))){cameraRig.reset();cameraYaw=cameraOrbitYaw=sim.position.yaw;cameraDragAge=99;}
    }
    renderFrame=presentation.sample(alpha);
    saveElapsed+=dt;if(saveElapsed>8||lastRevision!==sim.saveRevision){save();saveElapsed=0;lastRevision=sim.saveRevision;}drainMessages();
  }
  updateVisuals(paused?0:dt);updateCamera(dt);updateModelDetail();lighting(paused&&started?0:dt);hudElapsed+=dt;if(hudElapsed>.12){hudElapsed=0;updateHUD();}audio.update(sim.speed,!!sim.inCar,sim.wanted,paused||!started);renderer.render(scene,camera);
}

try{
  renderer=new THREE.WebGLRenderer({canvas:$('game'),antialias:true,powerPreference:'high-performance'});renderer.setSize(innerWidth,innerHeight,false);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  scene=new THREE.Scene();scene.background=new THREE.Color('#c0b8ca');scene.fog=new THREE.FogExp2('#b9b3c1',.0016);camera=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,.15,1100);camera.position.set(240,135,345);
  hemi=new THREE.HemisphereLight('#d0e1ff','#67525d',1.5);scene.add(hemi);sun=new THREE.DirectionalLight('#ffd3a0',1.4);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-90;sun.shadow.camera.right=90;sun.shadow.camera.top=90;sun.shadow.camera.bottom=-90;sun.shadow.camera.far=400;sun.shadow.normalBias=.12;scene.add(sunTarget);sun.target=sunTarget;scene.add(sun);
  atmosphere=createAtmosphere(THREE,renderer,scene);
  startupPhase='city';
  world=createWorld(THREE,scene,{quality:settings.quality});renderCollisionIndex=new SpatialIndex(world.colliders.filter(box=>box.physics!==false));cameraCollisionIndex=new SpatialIndex(world.colliders.filter(box=>box.camera!==false));sim=new GameSimulation({colliders:world.colliders,bounds:world.bounds,groundHeightAt:world.groundHeightAt,save:saved});resetPresentation();await prepareLocation();
  character=createCharacter(THREE);scene.add(character);
  for(let i=0;i<9;i++){const walker=createCharacter(THREE);walker.scale.setScalar(.94+(i%3)*.04);scene.add(walker);walkers.push(walker);}
  marker=new THREE.Group();markerRing=new THREE.Mesh(new THREE.TorusGeometry(5,.12,6,48),new THREE.MeshBasicMaterial({color:'#e4ff9d'}));markerRing.rotation.x=Math.PI/2;marker.add(markerRing);const diamond=new THREE.Mesh(new THREE.OctahedronGeometry(.8),new THREE.MeshBasicMaterial({color:'#d5ff9a'}));diamond.position.y=4;marker.add(diamond);const beam=new THREE.Mesh(new THREE.CylinderGeometry(.15,.15,18,8),new THREE.MeshBasicMaterial({color:'#dcffa5',transparent:true,opacity:.38,depthWrite:false}));beam.position.y=9;marker.add(beam);scene.add(marker);
  tracer=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]),new THREE.LineBasicMaterial({color:'#ffeab1',transparent:true,opacity:.8}));tracer.visible=false;scene.add(tracer);
  mapBackground=buildMap();applyQuality();updateVisuals(0);updateCamera(0);updateModelDetail();lighting(0);renderer.render(scene,camera);
  bootCompleted=true;$('loading').classList.add('hidden');$('welcome').classList.remove('hidden');$('start').disabled=false;$('start').firstChild.textContent=saved?'继续旅程 ':'进入霓港 ';
  if(!storageOK)toast('浏览器无法读取存储，可继续游玩并手动导出进度。','warning');
  // Diagnostics read actual mesh transforms, not just presentation bookkeeping.
  const presentationSnapshot=()=>{
    const model=sim.inCar?carMeshes.get(sim.inCar):character;
    return {alpha:renderFrame.alpha,elapsed:renderFrame.elapsed,subject:{...renderFrame.subject},player:{...renderFrame.player},
      cars:[...renderFrame.cars].map(([id,pose])=>({id,...pose})),resetCount:presentation.resetCount,
      renderedSubject:model?{x:model.position.x,y:model.position.y,z:model.position.z,yaw:model.rotation.y}:null};
  };
  // Read-only diagnostics help automated QA verify real input and renderer state.
  Object.defineProperty(window,'__NEON__',{value:Object.freeze({snapshot:()=>({ready:true,started,paused,position:{x:sim.position.x,z:sim.position.z,yaw:sim.position.yaw},inCar:sim.inCar,health:sim.player.health,cash:sim.cash,wanted:sim.wanted,ammo:sim.ammo,mission:sim.mission?JSON.parse(JSON.stringify(sim.mission)):null,completed:[...sim.completed],speed:sim.speed,simulationTime:sim.elapsed,teleportRevision:sim.teleportRevision||0,presentation:presentationSnapshot(),camera:cameraRig.snapshot(),streaming:world.streamingStats?{...world.streamingStats,preparing:worldPreparing}:null,cars:sim.cars.map(c=>({id:c.id,x:c.x,y:c.y||0,z:c.z,yaw:c.yaw,speed:c.speed,health:c.health,police:!!c.police})),settings:{...settings},fps:Math.round(fps),timing:{...frameTiming},renderer:{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles}})})});
  window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();applyQuality();});
  $('game').addEventListener('webglcontextlost',event=>{event.preventDefault();paused=true;save();toast('图形上下文中断，进度已保存。请刷新页面恢复。','warning');});
  requestAnimationFrame(frame);
}catch(error){console.error('Neon Harbor failed to initialize:',error);$('loading').innerHTML=`<div class="fatal"><span class="brand-mark">NH</span><h2>${startupPhase==='graphics'?'暂时无法启动三维画面':'城市资源暂时无法加载'}</h2><p>${startupPhase==='graphics'?'霓港需要支持 WebGL 2 的浏览器。请开启硬件加速，或尝试新版 Chrome、Edge、Firefox、Safari。':'请检查网络连接后重试。已保存的游戏进度不会因此丢失。'}</p><p>若在解压目录中直接打开，请先运行 <code>npm start</code> 再访问本地地址。</p><button class="primary-button" onclick="location.reload()">重新尝试 →</button></div>`;}
