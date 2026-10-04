import { MultiplayerClient } from './multiplayer.js';
import { renderMultiplayerMenu, refreshMultiplayerMenu } from './multiplayer-ui.js';
import * as THREE from '../vendor/three/three.module.js';
import { createCityExploration } from './city-exploration.js';
import { renderCityGuide, renderElevatorPanel } from './city-guide.js';
import { createCar, createCharacter } from './models.js';
import { GameSimulation, MISSION_DEFS } from './simulation.js';
import { CityAudio } from './audio.js';
import { FIXED_STEP, captureSimulation, RenderSnapshots } from './presentation.js';
import { FixedStepClock } from './frame-clock.js';
import { ChaseCamera, clipCameraSegment, resolveCameraPoint } from './camera.js';
import { VEHICLE_DIMENSIONS } from './world-config.js';
import { vehiclePoseEnvelope } from './ground-support.js';
import { createAtmosphere } from './atmosphere.js';
import { createContactOcclusion } from './contact-occlusion.js';
import { HARBOR_COAST } from './harbor-skyline.js';
import { SpatialIndex, vehicleContacts, circleContacts, CHARACTER_RADIUS } from './collision.js';
import { getRoomDesign } from './metropolis-room-designs.js';
import { renderHarborSampleMenu } from './harbor-sample-ui.js';

const $=id=>document.getElementById(id), clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const SAVE_KEY='neon-harbor.progress.v1', SETTINGS_KEY='neon-harbor.settings.v1';
const defaults={quality:'high',volume:.3,dayCycle:true,hour:16.5,sensitivity:1,firstPerson:false,touch:matchMedia('(pointer:coarse)').matches};
let settings={...defaults},saved=null,storageOK=true;
try{saved=localStorage.getItem(SAVE_KEY);const v=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'null');if(v&&typeof v==='object'){settings={quality:['high','balanced','low'].includes(v.quality)?v.quality:defaults.quality,volume:clamp(Number(v.volume)||0,0,1),dayCycle:typeof v.dayCycle==='boolean'?v.dayCycle:true,hour:Number.isFinite(v.hour)?clamp(v.hour,0,23.9):defaults.hour,sensitivity:Number.isFinite(v.sensitivity)?clamp(v.sensitivity,.3,2):1,firstPerson:v.firstPerson===true,touch:typeof v.touch==='boolean'?v.touch:defaults.touch};}}catch{storageOK=false;}
let renderer,scene,camera,world,sim,character,sun,hemi,marker,markerRing,tracer,atmosphere,contactOcclusion;
let started=false,activeTab='jobs',paused=false,sceneTime=0,hudElapsed=0,saveElapsed=0,lastRevision=-1,lastShot=-1;
const frameClock=new FixedStepClock(FIXED_STEP);
let frameTiming={wallDt:0,dt:0,steps:0,alpha:0,simulationDelta:0,droppedSeconds:0,droppedTotal:0};
let cameraYaw=Math.PI,cameraOrbitYaw=Math.PI,cameraPitch=.28,cameraDragAge=99,drag=null,frameCount=0,fps=60,fpsClock=0;
let presentation,renderFrame,renderCollisionIndex,cameraCollisionIndex;
let menuFocus={x:283,y:.18,z:42};
let prepareRevision=0,worldPreparing=false,lastStreamFailures=0,startupPhase='graphics',bootCompleted=false;
const cameraRig=new ChaseCamera();
const peerMeshes=new Map();
let roomRevision=0,roomInteracting=false;
const multiplayer=new MultiplayerClient({onStatus:status=>{if(sim){if(status==='offline'&&scene)updatePeers(0);sim.networkControlled=status==='offline'?null:new Set(world.vehicles.map(c=>c.id).filter(id=>id!==sim.inCar));}if($('multiplayer'))$('multiplayer').textContent=status==='offline'?'多人':status==='connected'?'房间 '+(multiplayer.session?.code||''):'重连中';},onSnapshot:()=>{refreshMultiplayerMenu(multiplayer);if(scene&&sim)updatePeers(0);}});
const carMeshes=new Map(),keys=new Set(),touchHeld=new Set(),walkers=[],audio=new CityAudio();
const sunTarget=new THREE.Object3D(),sunOffset=new THREE.Vector3(),sunRight=new THREE.Vector3(),sunUp=new THREE.Vector3(),worldUp=new THREE.Vector3(0,1,0);
const panel=$('panel'),mapCanvas=$('minimap'),mapContext=mapCanvas.getContext('2d');
let mapBackground;

function toast(text,type='info'){
  const node=document.createElement('div');node.className='toast '+type;node.textContent=text;$('toasts').append(node);setTimeout(()=>node.remove(),clamp(text.length*130,4300,18000));
}
function save(){
  if(!sim)return;
  try{localStorage.setItem(SAVE_KEY,JSON.stringify(world.safeSave()));localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));storageOK=true;$('save-status').textContent='进度已保存 · 当前浏览器';}
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
async function prepareLocation(retry=false,position=sim.position){
  const revision=++prepareRevision;worldPreparing=true;$('start').disabled=true;$('harbor-start').disabled=true;
  try{
    const result=retry&&world.retry?await world.retry(position):world.prepare?await world.prepare(position):{ready:true,failed:[]};
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
    if(revision===prepareRevision){worldPreparing=false;$('start').disabled=!bootCompleted;$('harbor-start').disabled=!bootCompleted;}
  }
}
function openPanel(tab='jobs'){
  activeTab=tab;paused=true;frameClock.suspend();cleanInput();audio.pause();renderPanel();if(!panel.open)panel.showModal();
}
function closePanel(){if(panel.open)panel.close();paused=false;frameClock.suspend();cleanInput();if(started){audio.start();$('game').focus();}save();}
async function enterCity(){
  await prepareLocation();
  started=true;paused=false;cameraPitch=settings.firstPerson?.15:.28;resetPresentation();
  $('welcome').classList.add('hidden');$('hud').classList.remove('hidden');$('touch-controls').classList.toggle('hidden',!settings.touch);
  audio.start();audio.setVolume(settings.volume);$('game').focus();updateCamera(0);
  toast(saved?'欢迎回到霓港。已恢复你的进度。':'欢迎来到霓港。WASD 移动，靠近青色跑车后按 E 上车。');save();
}
function reload(){if(sim.ammo<18&&!sim.reloadRemaining){sim.reloadRemaining=1.8;toast('正在装填…');}}
function toggleView(){
  if(!started||paused||sim.inCar||world.riding)return;
  settings.firstPerson=!settings.firstPerson;cameraPitch=settings.firstPerson?.15:.28;cameraRig.reset();
  updateHUD();save();toast(settings.firstPerson?'步行视角 · 拖动画面环顾，V 返回跟随视角':'跟随视角 · V 切换到步行视角');
}
async function action(name){
  if(!started||paused)return;
  if(name==='view')toggleView();
  if(name==='interact'){const result=world.interact();if(result.elevator)openPanel('elevator');if(result.transition){resetPresentation();updateHUD();}if(!result.handled){if(multiplayer.session){if(roomInteracting)return;roomInteracting=true;try{if(sim.inCar){if(sim.interact()){resetPresentation();await multiplayer.release();}}else if(sim.nearestCar){const carId=sim.nearestCar.id;await multiplayer.claim(carId);if(sim.nearestCar?.id===carId&&sim.interact())resetPresentation();else await multiplayer.release();}}catch(error){toast(error.message,'warning');}finally{roomInteracting=false;}}else if(sim.interact())resetPresentation();}}if(name==='fire'&&!world.isInside&&!world.riding)sim.fire();if(name==='reload')reload();drainMessages();
}

/** Interface only translates input. All mission/physics state lives in simulation.js. */
function inputState(){
  const forward=(keys.has('KeyW')||keys.has('ArrowUp')||touchHeld.has('forward')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')||touchHeld.has('backward')?1:0);
  const strafe=(keys.has('KeyD')||keys.has('ArrowRight')||touchHeld.has('right')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')||touchHeld.has('left')?1:0);
  return {forward,strafe,turn:-strafe,slow:keys.has('KeyZ')||touchHeld.has('slow'),sprint:keys.has('ShiftLeft')||keys.has('ShiftRight')||touchHeld.has('sprint'),brake:keys.has('Space')||touchHeld.has('brake'),jump:keys.has('Space')||touchHeld.has('brake'),fire:keys.has('KeyJ'),cameraYaw};
}
window.addEventListener('keydown',event=>{
  if(event.target.matches('input,select,textarea'))return;
  if(event.code==='Escape'){if(event.repeat)return;event.preventDefault();if(panel.open)closePanel();else if(started)openPanel('jobs');return;}
  // Menus use native Tab focus, Space activation and arrow-key scrolling.
  // Reserve game shortcuts only while the playable canvas is active.
  if(!started||paused||panel.open)return;
  if(['Tab','Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code))event.preventDefault();
  if(event.repeat)return;
  if(event.code==='Tab'){if(panel.open&&activeTab==='jobs')closePanel();else openPanel('jobs');return;}
  if(event.code==='KeyM'){if(panel.open&&activeTab==='map')closePanel();else openPanel('map');return;}
  if(paused)return;keys.add(event.code);
  if(event.code==='KeyE'||event.code==='KeyF')action('interact');
  if(event.code==='KeyR')action('reload');
  if(event.code==='KeyV')toggleView();
  if(event.code==='KeyC'){cameraOrbitYaw=sim.position.yaw;cameraPitch=settings.firstPerson?.15:.28;cameraDragAge=99;}
});
window.addEventListener('keyup',event=>keys.delete(event.code));
window.addEventListener('blur',()=>{cleanInput();if(started&&!panel.open)openPanel('jobs');});
document.addEventListener('visibilitychange',()=>{frameClock.suspend();fpsClock=0;frameCount=0;if(document.hidden){cleanInput();save();if(started&&!panel.open)openPanel('jobs');}});
window.addEventListener('pagehide',save);
panel.addEventListener('cancel',event=>{event.preventDefault();closePanel();});
$('game').addEventListener('pointerdown',event=>{if(!started||paused)return;cameraOrbitYaw=cameraYaw;drag={x:event.clientX,y:event.clientY,id:event.pointerId};$('game').setPointerCapture(event.pointerId);});
$('game').addEventListener('pointermove',event=>{if(!drag||drag.id!==event.pointerId)return;cameraOrbitYaw-=(event.clientX-drag.x)*.005*settings.sensitivity;cameraPitch=clamp(cameraPitch+(event.clientY-drag.y)*.003*settings.sensitivity,settings.firstPerson||world.riding?-.75:.08,settings.firstPerson||world.riding?1.05:.85);drag.x=event.clientX;drag.y=event.clientY;cameraDragAge=0;});
$('game').addEventListener('pointerup',()=>drag=null);$('game').addEventListener('pointercancel',()=>drag=null);$('game').addEventListener('contextmenu',event=>event.preventDefault());
for(const button of document.querySelectorAll('[data-hold]')){
  button.addEventListener('pointerdown',event=>{event.preventDefault();button.setPointerCapture(event.pointerId);touchHeld.add(button.dataset.hold);button.classList.add('pressed');});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,()=>{touchHeld.delete(button.dataset.hold);button.classList.remove('pressed');});
}
for(const button of document.querySelectorAll('[data-action]'))button.addEventListener('click',()=>action(button.dataset.action));
$('harbor-start').addEventListener('click',async()=>{
  $('harbor-start').disabled=true;
  try{if(!started)await enterCity();settings.firstPerson=true;cameraPitch=-.06;
    if(await world.travelTo(world.harbor.viewpoints[0])){resetPresentation();updateCamera(0);updateHUD();save();toast('海港长廊 · 拖动画面看两岸，沿海滨散步。城市导览可前往北岸建筑和地铁入口。');}
  }finally{$('harbor-start').disabled=false;}
});
$('start').addEventListener('click',enterCity);$('welcome-settings').addEventListener('click',()=>openPanel('settings'));$('welcome-help').addEventListener('click',()=>openPanel('help'));
$('welcome-sample').addEventListener('click',()=>openPanel('harbor'));$('harbor-life').addEventListener('click',()=>openPanel('harbor'));
$('welcome-multiplayer').addEventListener('click',()=>openPanel('multiplayer'));$('multiplayer').addEventListener('click',()=>openPanel('multiplayer'));
$('view-toggle').addEventListener('click',toggleView);
$('pause').addEventListener('click',()=>openPanel('jobs'));$('jobs').addEventListener('click',()=>openPanel('jobs'));$('map-button').addEventListener('click',()=>openPanel('map'));$('explore-city').addEventListener('click',()=>openPanel('explore'));$('welcome-explore').addEventListener('click',()=>openPanel('explore'));
$('close-panel').addEventListener('click',closePanel);$('resume').addEventListener('click',closePanel);
for(const tab of document.querySelectorAll('[data-tab]'))tab.addEventListener('click',()=>{activeTab=tab.dataset.tab;renderPanel();});

function renderPanel(){
  const titles={harbor:'在港湾过一天',multiplayer:'一起漫游霓港',explore:'霓港城市导览',elevator:'选择楼层',jobs:'城市委托',map:'把整座城市装进口袋',garage:'车库与补给',settings:'按你的方式，游玩霓港',help:'出发之前'};
  $('panel-title').textContent=titles[activeTab];$('resume').textContent=started?'继续游戏 →':'返回主菜单 →';
  document.querySelectorAll('[data-tab]').forEach(n=>n.classList.toggle('active',n.dataset.tab===activeTab));
  const content=$('panel-content');
  if(activeTab==='multiplayer'){
    renderMultiplayerMenu(content,multiplayer,{refresh:()=>refreshMultiplayerMenu(multiplayer),join:async options=>{if(sim.inCar&&!sim.interact())throw new Error('请先停车并下车，再加入房间。');await multiplayer.join({...options,pose:{x:sim.player.x,y:sim.player.groundY+sim.player.y,z:sim.player.z,yaw:sim.player.yaw}});roomRevision=sim.teleportRevision;if(!started)await enterCity();renderPanel();closePanel();toast('已加入房间 '+multiplayer.session.code+'，把房间码发给朋友即可。');},leave:async()=>{await multiplayer.leave();if(sim.activeVehicle){sim.activeVehicle.traffic=false;sim.activeVehicle.speed=0;sim.activeVehicle.vx=0;sim.activeVehicle.vz=0;sim.interact();}sim.networkControlled=null;renderPanel();resetPresentation();toast('已离开房间，继续单人探索。');}});
  }else if(activeTab==='explore'){
    renderCityGuide(content,world,async(destination)=>{const buttons=[...content.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);try{if(!started)await enterCity();paused=true;cleanInput();if(await world.travelTo(destination)){if(destination.kind==='metro')cameraPitch=.4;else if(destination.kind==='viewpoint')cameraPitch=-.06;else cameraPitch=settings.firstPerson?.15:.28;resetPresentation();closePanel();updateHUD();}}catch(error){console.error(error);toast('目的地暂时不可用，请稍后重试。','warning');}finally{buttons.forEach(b=>b.disabled=false);}drainMessages();});
  }else if(activeTab==='elevator'){
    renderElevatorPanel(content,world,id=>{if(world.selectFloor(id)){closePanel();resetPresentation();}});
  }else if(activeTab==='harbor'){
    renderHarborSampleMenu(content,world,async destination=>{if(!started)await enterCity();paused=true;cleanInput();try{if(await world.travelTo(destination)){resetPresentation();closePanel();updateHUD();}}catch(error){console.error(error);toast('目的地暂时不可用，请稍后重试。','warning');}});
  }else if(activeTab==='jobs'){
    content.innerHTML=`<p class="panel-intro">${sim.mission?'当前委托进行中。请先完成或放弃当前委托，再接受新的委托。':'每条街道，都通向一段新的故事。驾驶任意车辆，沿小地图导航抵达目标。'}<br>首次完成获得奖金，再次挑战刷新个人纪录。</p><div class="job-grid"></div>${sim.mission?'<div class="settings-actions"><button id="cancel-job" class="secondary-button danger">放弃当前委托</button></div>':''}`;
    const grid=content.querySelector('.job-grid');
    for(const [i,def] of MISSION_DEFS.entries()){
      const completed=sim.completed.has(def.id),best=sim.bestTimes[def.id];const article=document.createElement('article');article.className='job'+(completed?' completed':'');
      article.innerHTML=`<div class="job-number">0${i+1} / ${['COURIER','STREET CIRCUIT','GETAWAY'][i]} ${completed?'✓':''}</div><h3>${def.title}</h3><p>${def.description}${best?`<br>最佳纪录 ${best.toFixed(1)} 秒`:''}</p><div class="reward">${completed?'已完成':'$ '+def.reward.toLocaleString()}<small>${def.duration} 秒</small></div><button data-mission="${def.id}">${completed?'再次挑战':'接受委托'} ↗</button>`;
      article.querySelector('button').addEventListener('click',async()=>{if(!started)await enterCity();sim.startMission(def.id);drainMessages();closePanel();});grid.append(article);
    }
    $('cancel-job')?.addEventListener('click',()=>{sim.cancelMission();drainMessages();renderPanel();});
  }else if(activeTab==='map'){
    content.innerHTML='<p class="panel-intro">跨海桥连接两岸，金色道路标记两条高架，西侧海湾是货运码头。绿色箭头是你，黄色圆环是当前目标，红色标记是追捕车辆。</p><canvas id="city-map" class="big-map" width="900" height="600" aria-label="城市全景地图"></canvas><div class="map-legend"><span><b style="color:#c4ef9c">●</b>你的位置</span><span><b style="color:#ffe296">◉</b>任务目标</span><span><b style="color:#ee9383">▲</b>追捕车辆</span></div>';
    drawMap($('city-map'),true);
  }else if(activeTab==='garage'){
    content.innerHTML=`<p class="panel-intro">路边维修服务可恢复生命值与附近车辆，每次 $150。追捕期间无法使用。已完成的委托与资金会自动保存。</p><div class="garage-stats"><div><small>可用资金</small><strong>$ ${sim.cash.toLocaleString()}</strong></div><div><small>车辆状态</small><strong>${Math.round((sim.activeVehicle||sim.nearestCar)?.health??100)}%</strong></div><div><small>已完成委托</small><strong>${sim.completed.size} / 3</strong></div></div><button id="repair" class="primary-button compact">呼叫维修 · $150 ↗</button>`;
    $('repair').addEventListener('click',()=>{sim.repair();drainMessages();save();renderPanel();});
  }else if(activeTab==='settings'){
    content.innerHTML=`<div class="settings-grid"><label class="setting">画面质量<select id="quality"><option value="high">精细 · 动态阴影</option><option value="balanced">均衡 · 推荐</option><option value="low">流畅 · 低像素密度</option></select><small>调整渲染分辨率与阴影，立即生效。</small></label><label class="setting">音效音量<input id="volume" type="range" min="0" max="1" step=".05"><small>引擎、提示和追捕音效。</small></label><label class="setting">镜头灵敏度<input id="sensitivity" type="range" min=".3" max="2" step=".1"></label><label class="setting">城市时间<input id="time" type="range" min="0" max="23.9" step=".1"><small>拖动选择白昼、黄昏或夜晚。</small></label><label class="setting check"><input id="cycle" type="checkbox"> 自动昼夜交替</label><label class="setting check"><input id="touch-setting" type="checkbox"> 显示触屏控制</label></div><div class="settings-actions"><button id="reload-city" class="secondary-button">重新加载附近街区</button><button id="export-save" class="secondary-button">导出进度</button><button id="import-save" class="secondary-button">导入进度</button><input id="save-file" class="hidden" type="file" accept="application/json,.json"><button id="reset-save" class="secondary-button danger">开始新旅程</button></div><p class="panel-intro" style="margin-top:18px">存档仅保存在本机浏览器；重新载入回到步行状态。限时委托与追捕会结束，港湾随身物品、补货货物与街坊状态会保留。</p>`;
    if(multiplayer.session)for(const id of ['import-save','reset-save']){$(id).disabled=true;$(id).title='请先离开房间再修改存档';}
    $('quality').value=settings.quality;$('volume').value=settings.volume;$('sensitivity').value=settings.sensitivity;$('time').value=settings.hour;$('cycle').checked=settings.dayCycle;$('touch-setting').checked=settings.touch;
    $('quality').addEventListener('change',event=>{settings.quality=event.target.value;applyQuality();save();});
    $('volume').addEventListener('input',event=>{settings.volume=Number(event.target.value);audio.start();audio.setVolume(settings.volume);save();});
    $('sensitivity').addEventListener('input',event=>{settings.sensitivity=Number(event.target.value);save();});
    $('time').addEventListener('input',event=>{settings.hour=Number(event.target.value);settings.dayCycle=false;$('cycle').checked=false;save();});
    $('cycle').addEventListener('change',event=>{settings.dayCycle=event.target.checked;save();});
    $('touch-setting').addEventListener('change',event=>{settings.touch=event.target.checked;$('touch-controls').classList.toggle('hidden',!settings.touch||!started);save();});
    $('reload-city').addEventListener('click',async()=>{const button=$('reload-city');button.disabled=true;const result=await prepareLocation(true);button.disabled=false;if(result.ready)toast('附近街区已加载','success');});
    $('export-save').addEventListener('click',()=>{save();const url=URL.createObjectURL(new Blob([JSON.stringify(world.safeSave(),null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='neon-harbor-save.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('进度已导出');});
    $('import-save').addEventListener('click',()=>$('save-file').click());
    $('save-file').addEventListener('change',async event=>{const file=event.target.files?.[0];if(!file)return;try{if(file.size>512000)throw Error();const value=JSON.parse(await file.text());if(value.version!==1||!Array.isArray(value.completed)||!Number.isFinite(value.cash))throw Error();sim=new GameSimulation({colliders:world.colliders,bounds:world.bounds,groundHeightAt:world.groundHeightAt,save:value});world.bind(sim,{save:value,hour:settings.hour});resetPresentation();await prepareLocation();save();toast('进度已导入','success');renderPanel();}catch{toast('无法读取此存档，请选择有效的霓港进度文件。','warning');}});
    $('reset-save').addEventListener('click',()=>{content.innerHTML='<h3>开始新的旅程？</h3><p class="panel-intro">当前资金、委托纪录和位置将被重置。建议先导出进度。</p><div class="settings-actions"><button id="confirm-reset" class="secondary-button danger">确认重置进度</button><button id="cancel-reset" class="secondary-button">保留当前进度</button></div>';$('confirm-reset').addEventListener('click',async()=>{world.bind(sim,{hour:settings.hour});sim.reset();world.bind(sim,{hour:settings.hour});resetPresentation();await prepareLocation();save();drainMessages();renderPanel();});$('cancel-reset').addEventListener('click',renderPanel);});
  }else{
    const rows=[['W A S D','移动 / 驾驶'],['Shift','步行冲刺'],['Z','按住慢走，精确通过楼梯与房门'],['Space','跳跃 / 手刹'],['E / F','车辆 / 建筑 / 电梯 / 列车与渡轮 / 交谈'],['拖动画面','环顾镜头'],['C','重置镜头'],['V','步行 / 跟随视角'],['J','向前射击'],['R','装填弹匣'],['Tab','委托中心'],['M','城市地图'],['Esc','暂停 / 返回']];
    content.innerHTML='<p class="panel-intro">先靠近前方青色跑车，按 E 上车。W 加速，S 制动与倒车；高速转弯时配合空格手刹。碰撞交通车辆或开火会引来追捕，驶离警车视线并保持距离可解除警戒。射击命中朝向内的车辆，建筑会阻挡射线。</p><div class="help-grid">'+rows.map(([key,text])=>`<div class="help-row"><span>${text}</span><kbd>${key}</kbd></div>`).join('')+'</div><p class="panel-intro" style="margin-top:20px">手机使用左侧方向键与右侧操作按钮，拖动画面转动视角。建议横屏。城市包含原创建筑、生成材质与程序化人物。城市导览列出可进入建筑及交通站点。</p>';
  }
}

function applyQuality(){if(!renderer)return;world?.setQuality?.(settings.quality);const scale={high:2,balanced:1.2,low:.8}[settings.quality];renderer.setPixelRatio(Math.min(devicePixelRatio,scale));renderer.shadowMap.enabled=settings.quality==='high';renderer.setSize(innerWidth,innerHeight,false);contactOcclusion?.setQuality(settings.quality);if(world)world.root.traverse(n=>{if(n.isMesh&&!n.userData.noShadow)n.castShadow=settings.quality==='high';});}
const mapExtent={x:-800,z:-1450,width:2600,depth:2500};
function buildMap(){
  const canvas=document.createElement('canvas');canvas.width=1040;canvas.height=1000;const c=canvas.getContext('2d');
  const px=x=>(x-mapExtent.x)/mapExtent.width*canvas.width,pz=z=>(z-mapExtent.z)/mapExtent.depth*canvas.height;
  const rect=(x,z,w,d)=>c.fillRect(px(x),pz(z),w/mapExtent.width*canvas.width,d/mapExtent.depth*canvas.height);
  c.fillStyle='#183e4b';c.fillRect(0,0,canvas.width,canvas.height);
  c.fillStyle='#263e38';rect(-740,-1380,1480,990);rect(-298,-298,596,596);
  c.beginPath();HARBOR_COAST.forEach((point,i)=>i?c.lineTo(px(point.x),pz(point.z)):c.moveTo(px(point.x),pz(point.z)));c.lineTo(px(1800),pz(HARBOR_COAST.at(-1).z));c.lineTo(px(1800),pz(HARBOR_COAST[0].z));c.closePath();c.fill();
  c.fillStyle='#314941';rect(-740,-1380,1480,100);
  c.fillStyle='#64716a';for(const lane of [-240,-160,-80,0,80,160,240]){rect(lane-11,-290,22,580);rect(-290,lane-11,580,22);}
  for(const lane of world.roads.vertical)rect(lane-13,-1280,26,880);
  for(const lane of world.roads.horizontal)rect(-660,lane-13,1320,26);
  rect(-16,-430,32,150);
  c.fillStyle='#48605b';for(const block of world.south.colliders)if(block.kind==='building')rect(block.x-block.hx,block.z-block.hz,block.hx*2,block.hz*2);
  for(const building of world.buildings){c.fillStyle=building.color;rect(building.x-building.width/2,building.z-building.depth/2,building.width,building.depth);c.fillStyle='#ffffff2a';rect(building.x-building.width/2,building.z-building.depth/2,building.width,3);}
  for(const route of world.infrastructure.metadata.routes){c.strokeStyle='#dcb876';c.lineWidth=6;c.beginPath();route.points.forEach((p,i)=>i?c.lineTo(px(p.x),pz(p.z)):c.moveTo(px(p.x),pz(p.z)));c.stroke();c.strokeStyle='#5b6158';c.lineWidth=2;c.stroke();}
  const port=world.infrastructure.metadata.port;c.fillStyle='#9d9887';rect(port.x-port.width/2,port.z-port.depth/2,port.width,port.depth);
  c.strokeStyle='#afc7bd';c.lineWidth=1;c.setLineDash([2,4]);c.beginPath();c.moveTo(px(0),pz(-295));c.lineTo(px(0),pz(-420));c.stroke();c.setLineDash([]);
  return canvas;
}
function drawMap(canvas,full=false){
  if(!world||!sim||!canvas)return;const c=canvas===mapCanvas?mapContext:canvas.getContext('2d'),w=canvas.width,h=canvas.height,p=sim.position;
  c.fillStyle='#112831';c.fillRect(0,0,w,h);let scale,cx,cz;
  if(full){scale=Math.min(w/mapExtent.width,h/mapExtent.depth)*.92;cx=mapExtent.x+mapExtent.width/2;cz=mapExtent.z+mapExtent.depth/2;}else{scale=1.1;cx=p.x;cz=p.z;}
  const px=x=>w/2+(x-cx)*scale,pz=z=>h/2+(z-cz)*scale;
  c.drawImage(mapBackground,px(mapExtent.x),pz(mapExtent.z),mapExtent.width*scale,mapExtent.depth*scale);
  if(full){
    c.font='12px system-ui';c.textAlign='center';
    for(const d of world.districts){c.fillStyle='#dce4dc';c.fillText(d.name,px(d.x??0),pz(d.z)-19);}
    c.fillStyle='#89b5bd';c.fillText('维 澜 海 峡',px(320),pz(-345));
    for(const stop of world.transit.stops){const e=stop.entry||stop.entrance||stop.surface||stop.surfaceEntry;if(!e)continue;c.fillStyle='#f4cf86';c.beginPath();c.arc(px(e.x),pz(e.z),3.5,0,Math.PI*2);c.fill();}
    c.textAlign='start';
  }
  for(const stop of world.sample.transit.stops){const e=stop.entrance;c.fillStyle=stop.kind==='ferry'?'#88dce5':stop.kind==='tram'?'#e4b29e':'#c9d78d';c.beginPath();c.arc(px(e.x),pz(e.z),full?3.5:2.5,0,Math.PI*2);c.fill();}
  for(const car of world.vehicles){if(car.health<=0||car.id===sim.inCar)continue;c.fillStyle=car.police?'#ff8e87':car.traffic?'#9bbaaf':'#99d1d1';c.fillRect(px(car.x)-2,pz(car.z)-2,4,4);}
  if(multiplayer.session)for(const peer of multiplayer.snapshot?.players||[]){if(peer.id===multiplayer.session.id||peer.scene!==roomScene())continue;c.fillStyle='#aab6ff';c.beginPath();c.arc(px(peer.x),pz(peer.z),4,0,Math.PI*2);c.fill();}
  const target=sim.mission?.phase==='escape'?null:sim.mission?.target||world.sample.life.activeDelivery?.destination;if(target){c.strokeStyle='#ffde8a';c.fillStyle='#ffde8a22';c.lineWidth=2;c.beginPath();c.arc(px(target.x),pz(target.z),8+Math.sin(sceneTime*3)*2,0,Math.PI*2);c.fill();c.stroke();c.setLineDash([4,5]);c.lineWidth=1;c.beginPath();c.moveTo(px(p.x),pz(p.z));c.lineTo(px(target.x),pz(target.z));c.stroke();c.setLineDash([]);}
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
  $('mission-label').textContent=m?'正在进行':sim.wanted?'追捕中':'自由探索';$('mission-title').textContent=m?m.title:sim.wanted?'甩开身后的追捕。':'这座城市，等你出发。';$('mission-objective').textContent=m?m.objective:sim.wanted?`离开警车视线并保持距离。脱离进度 ${Math.round(sim.escapeProgress*100)}%。`:'M 查看全城地图，城市导览可寻找建筑与站点。跨海桥通往北岸六区。';$('mission-time').textContent=m?`${Math.ceil(m.remaining)}s`:'';$('mission-distance').textContent=m?.phase==='escape'?`${Math.round(sim.escapeProgress*100)}%`:m?.target?`${Math.round(Math.hypot(m.target.x-pos.x,m.target.z-pos.z))} m`:'TAB';
  const interior=world.interiors.snapshot(),transport=world.transit.snapshot(),sampleTransport=world.sample.transit.snapshot(),delivery=world.sample.life.activeDelivery;
  $('hud').classList.toggle('indoor',!!interior.buildingId);$('hud').classList.toggle('walking',!car&&!m&&!sim.wanted);
  $('view-toggle').disabled=!!car||!!world.riding;$('view-toggle').textContent=settings.firstPerson?'跟随视角':'步行视角';$('view-toggle').setAttribute('aria-pressed',String(settings.firstPerson));
  if(interior.buildingId&&!m){$('mission-label').textContent=interior.moving?'电梯运行中':'室内探索';$('mission-title').textContent=interior.currentRoomName||interior.floorName||interior.buildingName;$('mission-objective').textContent=interior.moving?`正在前往 ${world.buildings.find(b=>b.id===interior.buildingId)?.floors.find(f=>f.id===interior.elevator.targetFloorId)?.label||'目的楼层'}。到层后开门。`: `${getRoomDesign(interior.buildingId,interior.floorId).name} · ${getRoomDesign(interior.buildingId,interior.floorId).rooms.map(r=>r.name).join('、')}。楼梯贯通全部 ${interior.totalFloors} 层，中廊尽头按 E 乘电梯。`;$('mission-distance').textContent=Math.round(sim.player.groundY)+' m';}
  if(transport.boardingState!=='street'&&!m){$('mission-label').textContent=transport.riding?'公共交通 · 乘坐中':'公共交通 · 站台';$('mission-title').textContent=transport.label||transport.status||'港湾交通';$('mission-objective').textContent=world.getPrompt()?.label||'沿站台指示候车，停靠时按 E 上车。';$('mode-label').textContent=transport.riding?'ON BOARD':'PLATFORM';$('vehicle-name').textContent=transport.activeStation?.name||'港湾公共交通';$('mission-distance').textContent=transport.secondsToArrival?Math.ceil(transport.secondsToArrival)+' s':'';}
  if(delivery&&!m&&!interior.buildingId){$('mission-label').textContent='街坊补货';$('mission-title').textContent=delivery.recipient+'等着这批货';$('mission-objective').textContent=`把 ${delivery.quantity} 份${delivery.productName}送到黄色标记的柜台，按 E 交货，获得 $${delivery.reward} 运费。可以步行、驾驶或乘车。`;$('mission-distance').textContent=Math.round(Math.hypot(delivery.destination.x-pos.x,delivery.destination.z-pos.z))+' m';}
  if(sampleTransport.riding&&!m){const upper=sampleTransport.passengerDeck==='upper';const next=world.sample.transit.stop(sampleTransport.nextStopId);$('mission-label').textContent='港湾公共交通 · '+(upper?'上层':'下层');$('mission-title').textContent=sampleTransport.label;$('mission-objective').textContent=`${sampleTransport.phase==='docked'?'到站停靠':next?'下一站 '+next.name:'行驶中'}。WASD 在车内走动，Z 慢走，沿楼梯上下层；下车请返回下层车门，停靠时按 E。`;$('mode-label').textContent='ON BOARD';$('vehicle-name').textContent=sampleTransport.status;$('mission-distance').textContent=sampleTransport.secondsToArrival?Math.ceil(sampleTransport.secondsToArrival)+' s':'';}
  const cityPrompt=world.getPrompt();$('interaction').querySelector('kbd').textContent=cityPrompt?(!['transit','harbor-transit'].includes(cityPrompt.kind)||/^E /.test(cityPrompt.label)?'E':'WASD'):car||sim.nearestCar?'E':'V';$('interaction').querySelector('span').textContent=cityPrompt?.label?.replace(/^E /,'')|| (world.isInside?(interior.moving?'电梯运行中 · 请稍候':'Z 慢走微调 · 沿大厅前往电梯'):car?(Math.abs(car.speed)>5?'先停车，再下车':'离开车辆'):sim.nearestCar?'驾驶这辆车':'切换步行 / 跟随视角 · 拖动画面环顾');$('crosshair').classList.toggle('hidden',!keys.has('KeyJ'));
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
function roomScene(){return world.isInside?'interior:'+world.interiors.state.buildingId+':'+world.interiors.state.floor.id:world.sample.transit.riding?'harbor-vehicle:'+world.sample.transit.ridingVehicleId:'outdoor';}
function applyRoomVehicles(){
  if(!multiplayer.session||!multiplayer.snapshot)return;
  const remote=new Map(multiplayer.peers.sample(performance.now(),'cars').map(car=>[car.id,car]));
  for(const car of world.vehicles){if(car.id===sim.inCar)continue;const pose=remote.get(car.id);if(pose)Object.assign(car,pose,{vx:Math.sin(pose.yaw)*pose.speed,vz:Math.cos(pose.yaw)*pose.speed});}
  sim.networkControlled=new Set(world.vehicles.map(car=>car.id).filter(id=>id!==sim.inCar&&remote.has(id)));
}
function updatePeers(dt){
  const alive=new Set();
  for(const peer of multiplayer.peers.sample(performance.now())){
    if(peer.id===multiplayer.session?.id)continue;
    alive.add(peer.id);let model=peerMeshes.get(peer.id);
    if(!model){model=createCharacter(THREE,{style:peerMeshes.size%8});scene.add(model);peerMeshes.set(peer.id,model);}
    const previous=model.position.clone(),moving=model.userData.peerPose&&previous.distanceTo(new THREE.Vector3(peer.x,peer.y,peer.z))>.002;
    model.position.set(peer.x,peer.y,peer.z);model.rotation.y=peer.yaw;model.userData.peerPose=true;
    model.visible=peer.scene===roomScene()&&!peer.carId&&Math.hypot(peer.x-sim.position.x,peer.z-sim.position.z)<600;
    animateCharacter(model,performance.now()/100,.5*(moving?1:0));
  }
  for(const [id,model] of peerMeshes)if(!alive.has(id)){scene.remove(model);model.userData.disposeInstance?.();peerMeshes.delete(id);}
}
function updateVisuals(dt){
  updatePeers(dt);
  const visualCars=world.sample.transit.riding?world.vehicles:sim.cars;const alive=new Set();for(const car of visualCars){alive.add(car.id);let model=carMeshes.get(car.id);if(!model){model=createCar(THREE,car.color,car.police?'police':car.type);scene.add(model);carMeshes.set(car.id,model);}const pose=renderFrame.cars.get(car.id)||car;model.position.set(pose.x,pose.y||0,pose.z);model.rotation.order='YXZ';model.rotation.set(pose.pitch||0,pose.yaw,pose.roll||0);model.visible=car.health>0&&Math.hypot(pose.x-renderFrame.subject.x,pose.z-renderFrame.subject.z)<600;for(const wheel of model.userData.wheelsAll||model.userData.wheels||[])wheel.rotation.x+=(pose.speed||0)*dt/VEHICLE_DIMENSIONS.wheelRadius;for(const [i,light] of (model.userData.policeLights||[]).entries()){light.emissiveIntensity=(Math.sin(sceneTime*13+i*Math.PI)>0?4:.2);}}
  for(const [id,model] of carMeshes)if(!alive.has(id)){scene.remove(model);carMeshes.delete(id);model.userData.disposeInstance?.();}
  character.position.set(renderFrame.player.x,renderFrame.player.y,renderFrame.player.z);character.rotation.y=renderFrame.player.yaw;character.visible=!sim.inCar&&!world.riding&&!settings.firstPerson;
  const moving=inputState(),walkAmount=Math.abs(moving.forward)+Math.abs(moving.strafe)>0&&!paused?.55:0;
  animateCharacter(character,renderFrame.elapsed*(moving.sprint?15:10),walkAmount,moving.sprint);
  for(const [i,walker] of walkers.entries()){
    walker.visible=!world.isInside&&!world.transit.collisionContext();const route=world.walkerRoutes[i];
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
  for(const model of peerMeshes.values())model.userData.updateLOD?.(camera);
  for(const walker of walkers)walker.userData.updateLOD?.(camera);
}
function updateCamera(dt){
  if(!started){
    // The menu is a camera on the actual playable promenade, aimed across
    // the same harbor seen by a walking player. No pre-rendered backdrop.
    menuFocus={x:283,y:.18,z:42};
    camera.position.set(283,4.8,42+Math.sin(sceneTime*.04)*2);
    camera.lookAt(1180,128,-125);camera.fov=58;camera.updateProjectionMatrix();return;
  }
  if(paused)return;
  cameraDragAge+=dt;
  const manual=!!drag||cameraDragAge<2;
  const subject=renderFrame.subject,previous=cameraRig.position||subject;
  const cameraColliders=world.sample.transit.riding?world.sample.transit.cameraColliders:world.interiors.cameraColliders||cameraCollisionIndex.query({x:(subject.x+previous.x)/2,z:(subject.z+previous.z)/2,
    hx:Math.abs(subject.x-previous.x)/2+20,hz:Math.abs(subject.z-previous.z)/2+20});
  const state=cameraRig.update(renderFrame.subject,{
    yaw:(sim.inCar||world.riding)&&!manual?renderFrame.subject.yaw:cameraOrbitYaw,
    pitch:cameraPitch,driving:!!sim.inCar,firstPerson:!!world.riding||settings.firstPerson&&!sim.inCar,indoor:world.isInside||!!world.transit.collisionContext()||world.sample.transit.riding,floorY:sim.activeVehicle?.y??sim.player.groundY,platformY:world.interiors.state.moving?renderFrame.subject.y:undefined,manual,aspect:camera.aspect,near:camera.near,
  },dt,cameraColliders);
  cameraYaw=state.yaw;
  camera.position.set(state.position.x,state.position.y,state.position.z);
  camera.lookAt(state.target.x,state.target.y,state.target.z);
  camera.fov=state.fov;camera.updateProjectionMatrix();
}
function lighting(dt){
  if(multiplayer.session&&multiplayer.snapshot)settings.hour=(16.5+multiplayer.snapshot.time/35)%24;
  if(!multiplayer.session&&settings.dayCycle&&started&&!paused)settings.hour=(settings.hour+dt/35)%24;
  const daylight=clamp(Math.sin((settings.hour-6)/12*Math.PI),0,1);
  const p=started?renderFrame.subject:menuFocus;
  atmosphere.update(settings.hour,p,hemi,sun);
  sunOffset.set(-100,95+daylight*100,-65);
  sunRight.crossVectors(worldUp,sunOffset).normalize();sunUp.crossVectors(sunOffset,sunRight).normalize();
  sunTarget.position.set(p.x,p.y||0,p.z);
  // Snap in light-space texels, not simulation/world axes, to avoid shadow crawl.
  if(settings.quality==='high'){
    const texel=(sun.shadow.camera.right-sun.shadow.camera.left)/sun.shadow.mapSize.x;
    const right=sunTarget.position.dot(sunRight),up=sunTarget.position.dot(sunUp);
    sunTarget.position.addScaledVector(sunRight,Math.round(right/texel)*texel-right);
    sunTarget.position.addScaledVector(sunUp,Math.round(up/texel)*texel-up);
  }
  sun.position.copy(sunTarget.position).add(sunOffset);sunTarget.updateMatrixWorld();world.update(dt,settings.hour/24,{trafficTime:multiplayer.snapshot?.time??sim.elapsed,position:started?renderFrame.subject:menuFocus,velocity:{x:sim.activeVehicle?.vx||0,z:sim.activeVehicle?.vz||0}});
}
function frame(time){
  requestAnimationFrame(frame);const active=started&&!paused&&!document.hidden;
  frameTiming=frameClock.advance(time,active);const {wallDt,dt,steps,alpha}=frameTiming;
  if(document.hidden){frameClock.suspend();return;}
  // A paused menu has a static backdrop. Avoid redrawing the whole city while
  // another browser tab is starting; room IO continues independently.
  if(started&&paused)return;
  if(!started||!paused)sceneTime+=dt;fpsClock+=wallDt;frameCount++;if(fpsClock>1){fps=frameCount/fpsClock;frameCount=0;fpsClock=0;}
  applyRoomVehicles();
  if(active){
    const input=inputState();
    for(let step=0;step<steps;step++){
      world.step(FIXED_STEP,{...input,fire:input.fire&&!world.isInside&&!world.riding});
      if(presentation.advance(captureSimulation(sim))){cameraRig.reset();cameraYaw=cameraOrbitYaw=sim.position.yaw;cameraDragAge=99;}
    }
    renderFrame=presentation.sample(alpha);
    // The sample cabin mesh uses the current fleet pose. Keep the passenger's
    // eyes in that same pose so the vehicle cannot slide relative to its rider.
    if(world.sample.transit.riding)Object.assign(renderFrame.subject,world.sample.transit.passengerPose);
    saveElapsed+=dt;if(saveElapsed>8||lastRevision!==sim.saveRevision){save();saveElapsed=0;lastRevision=sim.saveRevision;}drainMessages();
  }
  if(multiplayer.session){multiplayer.state({pose:{x:sim.position.x,y:sim.inCar?sim.activeVehicle.y||0:sim.player.groundY+sim.player.y,z:sim.position.z,yaw:sim.position.yaw},scene:roomScene(),speed:sim.activeVehicle?.speed||0,travel:roomRevision!==sim.teleportRevision,revision:sim.teleportRevision});roomRevision=sim.teleportRevision;}
  updateVisuals(paused?0:dt);updateCamera(dt);updateModelDetail();lighting(paused&&started?0:dt);world.sample.transit.updateRender(camera,settings.hour);world.updateRenderVisibility(camera);hudElapsed+=dt;if(hudElapsed>.12){hudElapsed=0;updateHUD();}audio.update(sim.speed,!!sim.inCar,sim.wanted,paused||!started);contactOcclusion.render(scene,camera);
}

// Isolated art-review instrumentation: counts and actual switches only. It
// neither drains the GL error queue nor changes renderer/game/storage state.
function rendererReviewState(){
  return {calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,
    memory:{...renderer.info.memory},programs:renderer.info.programs?.length??null,
    contextLost:renderer.getContext().isContextLost(),
    shadow:{enabled:renderer.shadowMap.enabled,type:renderer.shadowMap.type,
      sunCastShadow:!!sun.castShadow,mapResident:!!sun.shadow.map,
      mapSize:[sun.shadow.mapSize.x,sun.shadow.mapSize.y]},
    contactOcclusion:contactOcclusion.snapshot()};
}
try{
  renderer=new THREE.WebGLRenderer({canvas:$('game'),antialias:true,powerPreference:'high-performance'});renderer.setSize(innerWidth,innerHeight,false);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  scene=new THREE.Scene();scene.background=new THREE.Color('#c0b8ca');scene.fog=new THREE.FogExp2('#b9b3c1',.0016);camera=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,.15,3200);camera.position.set(240,135,345);
  hemi=new THREE.HemisphereLight('#d0e1ff','#67525d',1.5);scene.add(hemi);sun=new THREE.DirectionalLight('#ffd3a0',1.4);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-90;sun.shadow.camera.right=90;sun.shadow.camera.top=90;sun.shadow.camera.bottom=-90;sun.shadow.camera.far=400;sun.shadow.normalBias=.12;scene.add(sunTarget);sun.target=sunTarget;scene.add(sun);
  atmosphere=createAtmosphere(THREE,renderer,scene);
  contactOcclusion=createContactOcclusion(THREE,renderer);
  startupPhase='city';
  world=createCityExploration(THREE,scene,{quality:settings.quality,readRendererMemory:()=>({geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures}),onContextChange:colliders=>{renderCollisionIndex=new SpatialIndex(colliders.filter(box=>box.physics!==false));cameraCollisionIndex=new SpatialIndex(colliders.filter(box=>box.camera!==false));}});renderCollisionIndex=new SpatialIndex(world.colliders.filter(box=>box.physics!==false));cameraCollisionIndex=new SpatialIndex(world.colliders.filter(box=>box.camera!==false));sim=new GameSimulation({colliders:world.colliders,bounds:world.bounds,groundHeightAt:world.groundHeightAt,save:saved});world.bind(sim,{save:saved,hour:settings.hour});resetPresentation();await prepareLocation(false,menuFocus);
  atmosphere.setBuildings?.(world.buildings);
  character=createCharacter(THREE);scene.add(character);
  for(let i=0;i<9;i++){const walker=createCharacter(THREE,{style:i%8});walker.scale.setScalar(.94+(i%3)*.04);scene.add(walker);walkers.push(walker);}
  marker=new THREE.Group();markerRing=new THREE.Mesh(new THREE.TorusGeometry(5,.12,6,48),new THREE.MeshBasicMaterial({color:'#e4ff9d'}));markerRing.rotation.x=Math.PI/2;marker.add(markerRing);const diamond=new THREE.Mesh(new THREE.OctahedronGeometry(.8),new THREE.MeshBasicMaterial({color:'#d5ff9a'}));diamond.position.y=4;marker.add(diamond);const beam=new THREE.Mesh(new THREE.CylinderGeometry(.15,.15,18,8),new THREE.MeshBasicMaterial({color:'#dcffa5',transparent:true,opacity:.38,depthWrite:false}));beam.position.y=9;marker.add(beam);scene.add(marker);
  tracer=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]),new THREE.LineBasicMaterial({color:'#ffeab1',transparent:true,opacity:.8}));tracer.visible=false;scene.add(tracer);
  mapBackground=buildMap();applyQuality();updateVisuals(0);updateCamera(0);updateModelDetail();lighting(0);world.updateRenderVisibility(camera);contactOcclusion.render(scene,camera);
  bootCompleted=true;$('loading').classList.add('hidden');$('welcome').classList.remove('hidden');$('start').disabled=false;$('harbor-start').disabled=false;$('start').firstChild.textContent=saved?'继续上次旅程 ':'从旧城出发 ';
  if(!storageOK)toast('浏览器无法读取存储，可继续游玩并手动导出进度。','warning');
  // Diagnostics read actual mesh transforms, not just presentation bookkeeping.
  const presentationSnapshot=()=>{
    const model=sim.inCar?carMeshes.get(sim.inCar):character;
    return {alpha:renderFrame.alpha,elapsed:renderFrame.elapsed,subject:{...renderFrame.subject},player:{...renderFrame.player},
      cars:[...renderFrame.cars].map(([id,pose])=>({id,...pose})),resetCount:presentation.resetCount,
      renderedSubject:model?{x:model.position.x,y:model.position.y,z:model.position.z,yaw:model.rotation.y}:null};
  };
  // Read-only diagnostics help automated QA verify real input and renderer state.
  Object.defineProperty(window,'__NEON__',{value:Object.freeze({snapshot:()=>({ready:true,started,paused,multiplayer:{status:multiplayer.status,code:multiplayer.session?.code||null,id:multiplayer.session?.id||null,players:multiplayer.snapshot?.players||[],meshes:[...peerMeshes].map(([id,model])=>({id,x:model.position.x,y:model.position.y,z:model.position.z,visible:model.visible}))},position:{x:sim.position.x,y:renderFrame.subject.y,z:sim.position.z,yaw:sim.position.yaw},inCar:sim.inCar,health:sim.player.health,cash:sim.cash,wanted:sim.wanted,ammo:sim.ammo,mission:sim.mission?JSON.parse(JSON.stringify(sim.mission)):null,completed:[...sim.completed],speed:sim.speed,simulationTime:sim.elapsed,teleportRevision:sim.teleportRevision||0,presentation:presentationSnapshot(),camera:cameraRig.snapshot(),streaming:world.streamingStats?{...world.streamingStats,preparing:worldPreparing}:null,cars:sim.cars.map(c=>({id:c.id,x:c.x,y:c.y||0,z:c.z,yaw:c.yaw,speed:c.speed,health:c.health,police:!!c.police})),city:world.snapshot(),settings:{...settings},fps:Math.round(fps),timing:{...frameTiming},renderer:rendererReviewState()})})});
  window.addEventListener('pagehide',event=>{multiplayer.leave();if(!event.persisted)contactOcclusion.dispose();});
  window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();applyQuality();});
  $('game').addEventListener('webglcontextlost',event=>{event.preventDefault();paused=true;save();toast('图形上下文中断，进度已保存。请刷新页面恢复。','warning');});
  requestAnimationFrame(frame);
}catch(error){console.error('Neon Harbor failed to initialize:',error);$('loading').innerHTML=`<div class="fatal"><span class="brand-mark">NH</span><h2>${startupPhase==='graphics'?'暂时无法启动三维画面':'城市资源暂时无法加载'}</h2><p>${startupPhase==='graphics'?'霓港需要支持 WebGL 2 的浏览器。请开启硬件加速，或尝试新版 Chrome、Edge、Firefox、Safari。':'请检查网络连接后重试。已保存的游戏进度不会因此丢失。'}</p><p>若在解压目录中直接打开，请先运行 <code>npm start</code> 再访问本地地址。</p><button class="primary-button" onclick="location.reload()">重新尝试 →</button></div>`;}
