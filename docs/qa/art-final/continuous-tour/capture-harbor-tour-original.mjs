/** One uninterrupted real-game harbor tour, with an unedited browser video.
 * No game-state/clock writes, fixture cameras, menu travel after setup, retries
 * or minimum-duration padding. --plan-only checks routes without running WebGL.
 */
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createStaticServer } from './server.mjs';
import { walkAxis } from '../tests/e2e/helpers/walking.js';
import { faceRoom } from '../tests/e2e/helpers/occupied.js';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const usage = 'node tools/capture-harbor-tour.mjs [--root DIST] [--output DIR] [--port PORT] [--plan-only]';
const options = {};
for (let i = 2; i < process.argv.length; i++) {
  const flag = process.argv[i];
  if (flag === '--help') { console.log(usage); process.exit(0); }
  if (flag === '--plan-only') { options.planOnly = true; continue; }
  if (!['--root', '--output', '--port'].includes(flag) || !process.argv[i + 1]) throw new Error(usage);
  options[flag.slice(2)] = process.argv[++i];
}
const root = resolve(projectRoot, options.root || 'dist');
const output = resolve(projectRoot, options.output || `test-results/harbor-tour-${new Date().toISOString().replace(/[:.]/g, '-')}`);
const port = Number(options.port || 5193), viewport = { width: 512, height: 320 };
// The shipped Low setting renders at 0.8 CSS-pixel scale. Retain that normal
// product behavior; the browser/video viewport and GL drawing buffer differ.
const drawingBuffer = { width: Math.floor(viewport.width * .8), height: Math.floor(viewport.height * .8) };
assert.ok(Number.isInteger(port) && port > 0 && port < 65536);
await mkdir(output, { recursive: true });
assert.deepEqual(await readdir(output), [], 'choose a new directory; preserve previous success/failure evidence');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const manifestBytes = await readFile(resolve(root, 'build-info.json'));
const manifest = JSON.parse(manifestBytes), manifestSha256 = sha256(manifestBytes);
assert.equal(manifest.version, '0.8.0');
const sourceHashes = {};
for (const [path, expected] of Object.entries(manifest.assets)) {
  assert.equal(sha256(await readFile(resolve(root, path))), expected, `frozen build asset: ${path}`);
  if (!path.startsWith('src/')) continue;
  sourceHashes[path] = sha256(await readFile(resolve(projectRoot, path)));
  assert.equal(sourceHashes[path], expected, `source must match the build: ${path}`);
}
const methodFiles = ['tools/capture-harbor-tour.mjs', 'tools/server.mjs',
  'tests/e2e/helpers/walking.js', 'tests/e2e/helpers/occupied.js'];
const methodHashes = Object.fromEntries(await Promise.all(methodFiles.map(async p => [p, sha256(await readFile(resolve(projectRoot, p)))])));
const metadata = { status: 'planning', startedAt: new Date().toISOString(), output, root,
  url: `http://127.0.0.1:${port}/`, viewport, drawingBuffer, deviceScaleFactor: 1, requestedQuality: 'low', initialDefaultQuality: null,
  browser: null, backend: 'Chromium WebGL / SwiftShader', minimumRouteWallMilliseconds: 20 * 60 * 1000,
  caseBudgetWallMilliseconds: 90 * 60 * 1000, manifestSha256, buildVersion: manifest.version,
  buildRevision: manifest.revision, gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot, encoding: 'utf8' }).trim(),
  sourceHashes, methodHashes, assetHashes: manifest.assets, plan: null, phases: [], screenshots: [], errors: [], resources: [], video: null,
  method: 'One fresh browser keeps one unedited Playwright recording from startup through setup, the continuous route, final export and reload. Public Atlas/E/elevator controls set a real residential 2F starting room before the route starts. Subsequently only real WASD/Z, mouse look, E doors/boarding/purchase and the public save/settings controls are used. No Atlas/sample-menu travel occurs during the tour, no writes to __NEON__, localStorage, positions, clocks, dt or renderer state; no retry or video editing.',
  limits: ['Low uses a 512 × 320 browser/video viewport and the normal 409 × 256 GL drawing buffer. This explicitly selected software-WebGL functional check is not native art or hardware-FPS evidence.',
    'The visible settings disable the day/night cycle before the route. The displayed afternoon remains fixed while the real simulation, fleet and monotonic economy clocks advance; this does not prove a full resident day.',
    'Legal E building/vehicle transitions can change teleportRevision and scene. Ordinary street, stair and cabin walking must retain their segment revision.',
    'Upper-landing E checks occur at a real open berth. They verify the combined upper-deck/door-contact restrictions at that landing; they do not isolate the deck-height rule.',
    'Interior saves currently recover at the original building street door. Exact room/floor restoration remains future work; the tour physically re-enters and walks upstairs after reload.',
    'Static collider planning excludes moving traffic and residents. Real input/stall checks can fail on those interactions; the first failure is retained without an automatic retry.',
    'The single raw WebM contains setup before the route start marker and all waits, loading and menus. Duration is recorded separately for the actual residential-room-to-room route.',
    'Browser video is a sampled frame stream, not a claim that every rendered frame was captured. Low renderer FPS can repeat frames; ffprobe must verify that the unedited file covers the full observed recording wall time.',
    'Large video files remain local artifacts until separately uploaded; metadata never claims publication. Procedural assets and software performance do not establish AAA quality.'] };
const persist = () => writeFile(resolve(output, 'metadata.json'), JSON.stringify(metadata, null, 2) + '\n');
await writeFile(resolve(output, 'build-info.json'), manifestBytes);

// These imports instantiate the actual frozen scene's geometry/colliders in
// Node, without a WebGL renderer. They supply route data, never player poses.
const fromBuild = path => import(pathToFileURL(resolve(root, path)).href);
const [THREE, { createCityExploration }, { SpatialIndex, circleOBB }, { PLAYER_DIMENSIONS, ROAD_CENTERS },
  { HARBOR_PIER_SEGMENTS }, { createHarborVehicleLayout }, { createInteriorLayout }] = await Promise.all([
  fromBuild('vendor/three/three.module.js'), fromBuild('src/city-exploration.js'),
  fromBuild('src/collision.js'), fromBuild('src/world-config.js'),
  fromBuild('src/harbor-transit.js'), fromBuild('src/harbor-vehicle-models.js'),
  fromBuild('src/metropolis-interiors.js'),
]);
const city = createCityExploration(THREE, new THREE.Scene(), { quality: 'low', streaming: true });
const stops = city.sample.transit.stops;
const stop = id => { const s = stops.find(s => s.id === id); assert.ok(s, id); return s; };
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const busFrom = stop('harbor-bus-courtyard'), busTo = stop('harbor-bus-market');
const ferrySouth = stop('harbor-ferry-south'), ferryNorth = stop('harbor-ferry-north');
const tramFrom = stop('harbor-tram-quay'), tramTo = stop('harbor-tram-lantern');
const homeIds = new Set(city.sample.life.agents.map(a => a.home.buildingId));
const home = city.buildings.filter(b => homeIds.has(b.id) && b.floors.length > 1)
  .sort((a, b) => distance(a.entrance, busFrom.board) - distance(b.entrance, busFrom.board))[0];
assert.ok(home?.compact && home.programmeUse === 'home', 'a real resident home near the bus');
const destination = city.buildings.filter(b => !b.shellId)
  .sort((a, b) => distance(a.entrance, ferryNorth.entrance) - distance(b.entrance, ferryNorth.entrance))[0];
const shop = city.sample.life.shops.find(s => s.id === 'harbor-produce');
assert.ok(shop && destination);
const shopBuilding = city.buildings.find(b => b.id === shop.buildingId);
assert.ok(shopBuilding?.shellId, 'the real retail counter belongs to an existing occupied shell');
const shopRoom = createInteriorLayout(shopBuilding, shopBuilding.floors[0]).rooms.find(r => r.type === 'market');
assert.ok(shopRoom, 'the street shop has its actual grocery/market room');
const northernRooms = createInteriorLayout(destination, destination.floors[0]).rooms;
const northernRoomType = (northernRooms.find(r => r.type === 'maritime') || northernRooms[0]).type;
const buildingExitPoint = b => b.exitPosition || { ...b.entrance,
  z: b.entrance.z + (b.exitOffset ?? 3.2), yaw: 0 };

/** Cardinal A* through actual ground-height/height-aware static collision.
 * A margin covers the walking helper's bounded endpoint tolerance. Banks are
 * separate domains, so no route can substitute walking through harbor water.
 */
function routePlanner() {
  const index = new SpatialIndex(city.colliders.filter(b => b.physics !== false));
  const radius = PLAYER_DIMENSIONS.radius + .20, height = PLAYER_DIMENSIONS.height;
  const blocked = p => {
    const y = city.groundHeightAt(p.x, p.z, p.y || 0);
    return index.query({ x: p.x, z: p.z, hx: radius, hz: radius }).some(b =>
      y + height > (b.minY ?? -Infinity) + 1e-7 && y < (b.maxY ?? Infinity) - 1e-7
      && circleOBB({ ...p, radius }, b));
  };
  const clear = (a, b) => {
    const count = Math.max(1, Math.ceil(distance(a, b) / .18));
    for (let i = 0; i <= count; i++) if (blocked({ x: a.x + (b.x-a.x)*i/count, z: a.z + (b.z-a.z)*i/count })) return false;
    return true;
  };
  const connect = (a, b) => {
    for (const middle of [{ x: a.x, z: b.z }, { x: b.x, z: a.z }])
      if (clear(a, middle) && clear(middle, b)) return [middle, b];
    return null;
  };
  const route = (from, to, bank) => {
    assert.ok(['south', 'north'].includes(bank));
    assert.ok(!blocked(from), `route start is clear: ${JSON.stringify(from)}`);
    assert.ok(!blocked(to), `route destination is clear: ${JSON.stringify(to)}`);
    const domain = p => bank === 'south' ? p.z >= ferrySouth.entrance.z - 1 && p.z <= 236
      : p.z <= ferryNorth.entrance.z && p.z >= Math.min(-480, to.z - 20);
    const endpoints = p => {
      const result = [];
      for (let x = Math.floor(p.x)-2; x <= Math.ceil(p.x)+2; x++) for (let z = Math.floor(p.z)-2; z <= Math.ceil(p.z)+2; z++) {
        const n = { x, z }; if (!domain(n) || blocked(n)) continue;
        const path = connect(p, n); if (path) result.push({ ...n, path, cost: path.reduce((v, q, i) => v+distance(i ? path[i-1] : p, q), 0) });
      }
      return result.sort((a,b) => a.cost-b.cost).slice(0, 12);
    };
    const starts = endpoints(from), targets = endpoints(to);
    assert.ok(starts.length && targets.length, 'actual endpoints connect to walkable ground');
    const goal = new Map(targets.map(n => [`${n.x},${n.z}`, n]));
    const minX = Math.floor(Math.min(from.x, to.x)-32), maxX = Math.ceil(Math.max(from.x, to.x)+32);
    const minZ = Math.floor(Math.min(from.z, to.z)-32), maxZ = Math.ceil(Math.max(from.z, to.z)+32);
    const cache = new Map(), costs = new Map(), parents = new Map(), nodes = new Map(), frontier = [];
    const key = p => `${p.x},${p.z}`;
    const free = p => {
      const k = key(p); if (!cache.has(k)) cache.set(k, !blocked(p)); return cache.get(k);
    };
    const push = item => { frontier.push(item); let i = frontier.length-1;
      while (i) { const j = (i-1)>>1; if (frontier[j].score <= item.score) break; frontier[i] = frontier[j]; i=j; } frontier[i]=item; };
    const pop = () => { const first = frontier[0], last = frontier.pop(); if (frontier.length) {
      let i=0; while (true) { let j=i*2+1; if (j >= frontier.length) break; if (j+1 < frontier.length && frontier[j+1].score < frontier[j].score) j++;
        if (last.score <= frontier[j].score) break; frontier[i]=frontier[j]; i=j; } frontier[i]=last; } return first; };
    const heuristic = p => Math.abs(p.x-to.x)+Math.abs(p.z-to.z);
    for (const n of starts) { const k=key(n); nodes.set(k,n); costs.set(k,n.cost); push({ k, cost:n.cost, score:n.cost+heuristic(n) }); }
    let end;
    while (frontier.length) {
      const item=pop(), p=nodes.get(item.k); if (item.cost !== costs.get(item.k)) continue;
      if (goal.has(item.k)) { end=item.k; break; }
      for (const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const n={x:p.x+dx,z:p.z+dz}, k=key(n);
        if (n.x<minX||n.x>maxX||n.z<minZ||n.z>maxZ||!domain(n)||!free(n)||!clear(p,n)) continue;
        // Prefer existing pavement over road centres. Any chosen crossing is
        // still height/collision checked; moving vehicles remain live in-game.
        const road = bank === 'south' && ROAD_CENTERS.some(r => Math.abs(n.x-r)<11 || Math.abs(n.z-r)<11);
        const cost=item.cost+(road?1.45:1);
        if (cost >= (costs.get(k)??Infinity)) continue;
        costs.set(k,cost); parents.set(k,item.k); nodes.set(k,n); push({k,cost,score:cost+heuristic(n)});
      }
    }
    assert.ok(end, `no physical ${bank} route: ${JSON.stringify({from,to})}`);
    const grid=[]; for (let k=end;;k=parents.get(k)) { grid.push({x:nodes.get(k).x,z:nodes.get(k).z}); if (!parents.has(k)) break; }
    grid.reverse(); const start=starts.find(s => key(s)===key(grid[0]));
    const final=connect(grid.at(-1),to); assert.ok(final);
    const points=[{x:from.x,z:from.z},...start.path,...grid.slice(1),...final], compressed=[];
    for (const p of points) { const a=compressed.at(-2), b=compressed.at(-1);
      if (b && distance(b,p)<1e-7) continue;
      if (a && b && (a.x===b.x&&b.x===p.x||a.z===b.z&&b.z===p.z)
        && (b.x-a.x)*(p.x-b.x)+(b.z-a.z)*(p.z-b.z)>=0) compressed[compressed.length-1]=p;
      else compressed.push(p); }
    // Remove grid tie-breaking zigzags with collision-checked cardinal sight
    // lines. Long straight legs are split into real progress checkpoints so a
    // slow renderer does not need one unbounded keyboard hold.
    const simplified=[compressed[0]];
    for(let i=0;i<compressed.length-1;) {
      let next=i+1, connection;
      for(let j=compressed.length-1;j>i;j--) {
        const candidate=connect(compressed[i],compressed[j]);
        if(candidate&&candidate.every(domain)){next=j;connection=candidate;break;}
      }
      assert.ok(connection); for(const p of connection)if(distance(simplified.at(-1),p)>1e-7)simplified.push(p); i=next;
    }
    const bounded=[simplified[0]];
    for(let i=1;i<simplified.length;i++) {
      const a=simplified[i-1],b=simplified[i],count=Math.ceil(distance(a,b)/36);
      for(let n=1;n<=count;n++)bounded.push({x:a.x+(b.x-a.x)*n/count,z:a.z+(b.z-a.z)*n/count});
    }
    for (let i=1;i<bounded.length;i++) assert.ok(clear(bounded[i-1],bounded[i]), 'every simplified leg remains physically clear');
    return { bank, from, to, playerRadius:PLAYER_DIMENSIONS.radius, collisionMargin:.20, sampleSpacing:.18,
      metres:bounded.slice(1).reduce((n,p,i)=>n+distance(bounded[i],p),0), waypoints:bounded.slice(1).map(p=>({...p,y:city.groundHeightAt(p.x,p.z)})) };
  };
  return { route, blocked, clear };
}
const planner = routePlanner();
const plan = {
  home: { id:home.id,name:home.name,entrance:home.entrance,floor:home.floors[1] },
  northernAddress: { id:destination.id,name:destination.name,entrance:destination.entrance },
  shop: { id:shop.id,name:shop.name,product:shop.product,price:shop.price,anchor:shop.anchor,
    buildingId:shopBuilding.id,shellId:shopBuilding.shellId,entrance:shopBuilding.entrance,room:shopRoom },
  northernRoomType,
  stops: { busFrom,busTo,ferrySouth,ferryNorth,tramFrom,tramTo },
  staticColliderCount:city.colliders.length, staticColliderSha256:sha256(JSON.stringify(city.colliders)),
  pierSegments:HARBOR_PIER_SEGMENTS,
  paths: {
    homeToBus:planner.route(buildingExitPoint(home),busFrom.board,'south'),
    busToProduce:planner.route(busTo.board,shop.anchor,'south'),
    produceCounterToDoor:planner.route(shop.anchor,shopBuilding.entrance,'south'),
    produceToPier:planner.route(buildingExitPoint(shopBuilding),ferrySouth.entrance,'south'),
    northPierToAddress:planner.route(ferryNorth.entrance,destination.entrance,'north'),
    northAddressToPier:planner.route(buildingExitPoint(destination),ferryNorth.entrance,'north'),
    southPierToTram:planner.route(ferrySouth.entrance,tramFrom.board,'south'),
    tramToHome:planner.route(tramTo.board,home.entrance,'south'),
  },
};
metadata.plan=plan; await writeFile(resolve(output,'route-plan.json'),JSON.stringify(plan,null,2)+'\n'); await persist();
console.log(JSON.stringify({home:home.id,north:destination.id,colliders:plan.staticColliderCount,
  paths:Object.fromEntries(Object.entries(plan.paths).map(([k,v])=>[k,{metres:v.metres,waypoints:v.waypoints.length}]))}));
if (options.planOnly) { metadata.status='plan-checked-no-WebGL'; metadata.completedAt=new Date().toISOString(); await persist(); process.exit(0); }

const server=await createStaticServer({root});
await new Promise((ok,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',ok);});
let browser,context,page,video,videoStartedAt,videoStoppedAt,caseStartedAt,routeStartedAt,deadline,monitor,totalTimer,finalInvalidatedPass=false;
const resources=new Set();
const angle=n=>Math.atan2(Math.sin(n),Math.cos(n));
const state = () => page.evaluate(() => {
  const s=window.__NEON__.snapshot(), i=s.city.interior, t=s.city.sample.transit, l=s.city.sample.life;
  let saved; try { saved=JSON.parse(localStorage.getItem('neon-harbor.progress.v1')); } catch {}
  return {ready:s.ready,started:s.started,paused:s.paused,position:s.position,camera:s.camera,settings:s.settings,
    simulationTime:s.simulationTime,teleportRevision:s.teleportRevision,cash:s.cash,health:s.health,inCar:s.inCar,
    scene:i.buildingId?'interior:'+i.buildingId+':'+i.floorId:t.riding?'harbor-vehicle:'+t.ridingVehicleId:'outdoor',
    streaming:s.streaming,renderer:s.renderer,fps:s.fps,timing:s.timing,
    interior:{buildingId:i.buildingId,floorId:i.floorId,currentRoomId:i.currentRoomId,rooms:i.rooms,stairs:i.stairs,
      entrance:i.entrance,cabin:i.cabin,elevator:i.elevator,moving:i.moving,activeFloors:i.activeFloors},
    exterior:s.city.exterior,hiddenShells:s.city.harbor.hiddenShells,
    transit:{time:t.time,riding:t.riding,ridingVehicleId:t.ridingVehicleId,passengerLocal:t.passengerLocal,passengerDeck:t.passengerDeck,
      currentStopId:t.currentStopId,nextStopId:t.nextStopId,phase:t.phase,vehicles:t.vehicles},
    life:{hour:l.hour,day:l.day,phases:l.phases,statistics:l.statistics,shops:l.shops,playerInventory:l.playerInventory,
      totalMoney:l.totalMoney,initialMoney:l.initialMoney,totalGoods:l.totalGoods,initialGoods:l.initialGoods,
      cashPaidByPlayer:l.cashPaidByPlayer,cashPaidToPlayer:l.cashPaidToPlayer},
    savedLedger:saved?.harborLife?{ticks:saved.harborLife.ticks,revision:saved.harborLife.revision,
      transactions:saved.harborLife.transactions,player:saved.harborLife.player,shops:saved.harborLife.shops}:null};
});
const healthy = s => { assert.equal(s.settings.quality,'low'); assert.equal(s.settings.dayCycle,false);
  assert.equal(s.settings.hour,16.5);assert.equal(s.settings.firstPerson,true);
  assert.equal(s.streaming?.failed||0,0); assert.ok(s.health>0); };
const phase = async (label,detail={}) => {
  const s=await state(); healthy(s); const record={label,at:new Date().toISOString(),
    routeWallMilliseconds:routeStartedAt?Date.now()-routeStartedAt:null,detail,state:s};
  metadata.phases.push(record); await persist(); console.log(`Tour ${label}: ${JSON.stringify({position:s.position,time:s.simulationTime,revision:s.teleportRevision,ride:s.transit.ridingVehicleId,deck:s.transit.passengerDeck,cash:s.cash})}`); return s;
};
const shot = async label => {
  const pixels=await page.locator('#game').evaluate(canvas=>{const gl=canvas.getContext('webgl2');
    return {width:gl.drawingBufferWidth,height:gl.drawingBufferHeight,lost:gl.isContextLost(),error:gl.getError()};});
  assert.deepEqual(pixels,{...drawingBuffer,lost:false,error:0});
  const image=`${label}-low-functional.png`; await page.screenshot({path:resolve(output,image),timeout:90000});
  metadata.screenshots.push({label,image,pixels,sha256:sha256(await readFile(resolve(output,image))),at:new Date().toISOString()}); await persist();
};
const remaining = cap => Math.max(1,Math.min(cap,deadline?deadline-Date.now():cap));
const focusPlayable = async () => {
  const s=await state(); healthy(s); assert.equal(s.started,true); assert.equal(s.paused,false);
  assert.equal(await page.locator('#panel').isVisible(),false,'real game input occurs with the modal closed');
  await page.locator('#game').focus(); return s;
};
const walk = async (axis,target,{precision=true,tolerance=.18}={}) => {
  const before=await state();
  await walkAxis(page,axis,target,{timeout:remaining(180000),precision,tolerance});
  const after=await state(); assert.equal(after.teleportRevision,before.teleportRevision,'physical walking preserves scene revision');
  healthy(after); return after;
};
const walkPoint = async p => { await walk('x',p.x); const s=await walk('z',p.z);
  if(p.y!=null)assert.ok(Math.abs(s.position.y-p.y)<.4,`actual walking height: ${JSON.stringify({p,actual:s.position})}`); return s; };
const street = async (label,path) => {
  await faceRoom(page,Math.PI); const before=await state();
  assert.equal(before.interior.buildingId,null); assert.equal(before.transit.riding,false);
  assert.ok(distance(before.position,path.from)<.5,'route begins at its actual planned contact');
  for(const [index,p]of path.waypoints.entries()) { await walkPoint(p); await phase(`${label}-waypoint-${index}`,{target:p}); }
  const after=await state(); assert.equal(after.teleportRevision,before.teleportRevision); await phase(label,{planned:path});
};
const room = async (building,type) => {
  await faceRoom(page,Math.PI); const s=await state(), r=s.interior.rooms.find(r=>r.type===type);
  assert.ok(r,`${building.id} has the actual requested ${type} room`);
  await walk('x',building.x); await walk('z',r.entrance.z); await walk('x',r.arrival.x); await walk('z',r.arrival.z);
  assert.equal((await state()).interior.currentRoomId,r.id); return r;
};
const leaveRoom = async (building,r) => { await faceRoom(page,Math.PI); await walk('z',r.entrance.z); await walk('x',building.x);
  assert.equal((await state()).interior.currentRoomId,null); };
const buildingEnter = async building => {
  assert.ok((await page.locator('#interaction').textContent()).includes(`进入 ${building.name}`));
  const before=await focusPlayable(); await page.keyboard.press('e');
  await page.waitForFunction(id=>window.__NEON__.snapshot().city.interior.buildingId===id,building.id,{timeout:remaining(90000)});
  return phase(`entered-${building.id}`,{legalTransition:'public E building entry',beforeRevision:before.teleportRevision});
};
const buildingExit = async building => {
  await faceRoom(page,Math.PI); const s=await state(); assert.equal(s.interior.floorId,building.floors[0].id);
  await walk('x',s.interior.entrance.x); await walk('z',s.interior.entrance.z);
  assert.ok((await page.locator('#interaction').textContent()).includes('返回街道'));
  const before=await focusPlayable(); await page.keyboard.press('e');
  await page.waitForFunction(()=>!window.__NEON__.snapshot().city.interior.buildingId,null,{timeout:remaining(90000)});
  const after=await phase(`exited-${building.id}`,{legalTransition:'public E building exit',beforeRevision:before.teleportRevision});
  assert.equal(after.hiddenShells,0); assert.deepEqual(after.exterior,{southInteriorId:null,harborInteriorId:null});
  assert.ok(distance(after.position,buildingExitPoint(building))<.1); return after;
};
const homeStair = async up => {
  await faceRoom(page,Math.PI); const before=await state(), f=before.interior.stairs.find(f=>f.fromFloorId===home.floors[0].id);
  assert.ok(f && f.toFloorId===home.floors[1].id); const middle={x:f.x,z:(f.startZ+f.endZ)/2,y:(f.fromY+f.toY)/2};
  const approach=up?f.bottom:f.top, finish=up?f.top:f.bottom;
  await walkPoint({x:home.x,z:approach.z,y:approach.y});
  for(const p of [approach,middle,finish]) { await walkPoint(p); await phase(`home-stair-${up?'up':'down'}`,{target:p}); }
  const after=await state(); assert.equal(after.interior.floorId,home.floors[up?1:0].id);
  assert.equal(after.teleportRevision,before.teleportRevision); await walk('x',home.x);
};
const pier = async (s,onto) => {
  await faceRoom(page,Math.PI); const bank=s.id.endsWith('north')?'north':'south';
  const from=onto?s.entrance:s.board,to=onto?s.board:s.entrance;
  const segments=HARBOR_PIER_SEGMENTS.filter(p=>p.bank===bank);
  const zValues=new Set([to.z]);
  for(const p of segments) for(const z of [p.startZ,p.endZ,(p.fromY===p.toY?null:(p.startZ+p.endZ)/2)])
    if(z!=null&&z>Math.min(from.z,to.z)&&z<Math.max(from.z,to.z))zValues.add(z);
  const direction=Math.sign(to.z-from.z), values=[...zValues].sort((a,b)=>direction*(a-b));
  const initial=await state(); assert.ok(distance(initial.position,from)<.5,'the actual pier starts at its current street/deck contact');
  await walk('x',s.board.x);
  for(const z of values) { const y=city.sample.transit.groundHeightAt(s.board.x,z);
    assert.ok(y!=null); await walkPoint({x:s.board.x,z,y}); await phase(`pier-${bank}-${onto?'boarding':'street'}`,{target:{x:s.board.x,z,y}}); }
};
const cabinState = () => page.evaluate(() => { const s=window.__NEON__.snapshot(),t=s.city.sample.transit;
  return {local:t.passengerLocal,vehicle:t.vehicles.find(v=>v.id===t.ridingVehicleId),cameraYaw:s.camera?.yaw,
    sensitivity:s.settings.sensitivity,time:s.simulationTime,revision:s.teleportRevision,deck:t.passengerDeck}; });
const cabinPointer = async () => {
  await page.waitForFunction(()=>window.__NEON__.snapshot().city.sample.transit.passengerLocal&&Number.isFinite(window.__NEON__.snapshot().camera?.yaw),null,{timeout:remaining(15000)});
  const box=await page.locator('#game').boundingBox(), p={x:box.x+box.width*.86,y:box.y+box.height*.30};
  await page.mouse.move(p.x,p.y); await page.mouse.down(); p.orbitYaw=(await cabinState()).cameraYaw; return p;
};
const walkLocal = async (target,pointer,{precision=true}={}) => {
  const initial=await cabinState(), localDeadline=Date.now()+remaining(150000); let current=initial;
  const samples=[initial]; let heldSeconds=0, geometricMetres=0;
  try {
    for(let n=0;distance(target,current.local)>=.06&&n<1800;n++) {
      assert.ok(Date.now()<localDeadline,'cabin waypoint retains its original wall budget');
      const dx=target.x-current.local.x,dz=target.z-current.local.z;
      const key=Math.abs(dx)>Math.abs(dz)?dx>0?'a':'d':dz>0?'w':'s';
      const offset={w:0,s:Math.PI,a:Math.PI/2,d:-Math.PI/2}[key], desired=current.vehicle.yaw+Math.atan2(dx,dz)-offset;
      const delta=angle(desired-pointer.orbitYaw);
      if(Math.abs(delta)>.002) { pointer.x-=delta/(.005*current.sensitivity); await page.mouse.move(pointer.x,pointer.y); pointer.orbitYaw=desired;
        await page.waitForFunction(yaw=>Math.abs(Math.atan2(Math.sin(window.__NEON__.snapshot().camera.yaw-yaw),Math.cos(window.__NEON__.snapshot().camera.yaw-yaw)))<.025,
          desired,{polling:'raf',timeout:Math.min(15000,Math.max(1,localDeadline-Date.now()))}); }
      const slow=precision||distance(target,current.local)<1.2, start=current.local;
      if(slow)await page.keyboard.down('z'); await page.keyboard.down(key);
      const keydown=await cabinState();
      try { await page.waitForFunction(before=>{const p=window.__NEON__.snapshot().city.sample.transit.passengerLocal;
        return p&&Math.hypot(p.x-before.x,p.z-before.z)>.009;},start,{polling:'raf',timeout:Math.max(1,localDeadline-Date.now())}); }
      finally {await page.keyboard.up(key);if(slow)await page.keyboard.up('z');}
      current=await cabinState(); heldSeconds+=Math.max(0,current.time-keydown.time); geometricMetres+=distance(start,current.local);
      samples.push({...current,key,slow}); assert.equal(current.revision,initial.revision,'cabin walking preserves transition revision');
      // This is an additional real stall guard. Time used for mouse turning is
      // not mistaken for a blocked walking input, and the original local clock
      // and endpoint limits remain intact.
      assert.ok(heldSeconds<geometricMetres/.3+3,'held cabin inputs do not stall against seats or walls');
    }
    assert.ok(distance(target,current.local)<.06,'the actual cabin waypoint is reached');
    if(target.y!=null)assert.ok(Math.abs(current.local.y-target.y)<.15,'actual stair support height');
  }catch(error){error.message+=`\nCabin diagnostics: ${JSON.stringify({target,initial,current,samples})}`;throw error;}
  return samples;
};
const ride = async (from,to,{stairs=true,label=from.kind}={}) => {
  const initial=await state(), route=city.sample.transit.route(from.routeId), waitStart=initial.simulationTime;
  const before=await focusPlayable();
  await page.waitForFunction(id=>window.__NEON__.snapshot().city.sample.transit.vehicles.some(v=>v.stopId===id&&v.remaining>2),
    from.id,{polling:'raf',timeout:remaining(600000)});
  assert.ok((await state()).simulationTime-waitStart<route.duration*2+120,'a real scheduled boarding eventually arrives');
  await page.keyboard.press('e');
  await page.waitForFunction(()=>window.__NEON__.snapshot().city.sample.transit.riding,null,{timeout:remaining(30000)});
  const boarded=await phase(`${label}-boarded`,{from:from.id,to:to.id,legalTransition:'public E boarding',beforeRevision:before.teleportRevision});
  const id=boarded.transit.ridingVehicleId, revision=boarded.teleportRevision, layout=createHarborVehicleLayout(from.kind), stair=layout.stairs[0];
  const door=layout.doors.find(d=>d.id===to.doorId); assert.ok(door); assert.equal(boarded.transit.passengerDeck,'lower');
  const samples=[];
  if(stairs) {
    let pointer=await cabinPointer();
    try {for(const target of [{x:0,z:door.z},{x:0,z:stair.bottom.z},stair.bottom,
      {x:stair.x,z:(stair.startZ+stair.endZ)/2,y:(stair.fromY+stair.toY)/2},stair.top,{x:0,z:stair.top.z,y:stair.toY}])
      samples.push(...await walkLocal(target,pointer,{precision:from.kind!=='ferry'||target.x!==0}));}
    finally{await page.mouse.up();}
    const upper=await phase(`${label}-upper-deck`); assert.equal(upper.transit.passengerDeck,'upper');
    assert.ok(samples.some(s=>s.local.y>stair.fromY+.25&&s.local.y<stair.toY-.25)); assert.equal(upper.teleportRevision,revision);
    await shot(`${label}-upper-deck`);await focusPlayable();
    // E is also rejected in motion. Observe real open doors at a scheduled
    // berth so this checks the upper-deck rule rather than that unrelated case.
    await page.waitForFunction(id=>{const s=window.__NEON__.snapshot(),t=s.city.sample.transit,v=t.vehicles.find(v=>v.id===id);
      return t.passengerDeck==='upper'&&v.stopId&&v.doorsOpen&&v.remaining>2;},id,{polling:'raf',timeout:remaining(600000)});
    const upperDocked=await phase(`${label}-upper-deck-at-real-open-berth`);
    const upperBerth=upperDocked.transit.vehicles.find(v=>v.id===id);
    assert.ok(upperBerth.stopId&&upperBerth.doorsOpen&&upperBerth.remaining>.6,'the observed upper landing really has an open berth before E');
    assert.ok(upperDocked.simulationTime-upper.simulationTime<route.duration*2+120,'the real upper-deck berth wait does not stall indefinitely');
    await page.keyboard.press('e');const denied=await phase(`${label}-upper-landing-E-keeps-rider-on-board`,{
      checkedPosition:'real upper stair landing; combined deck-height and door-contact restrictions',openStopId:upperBerth.stopId});
    assert.equal(denied.transit.ridingVehicleId,id,'E at this actual upper landing cannot alight at the open berth');assert.equal(denied.transit.passengerDeck,'upper');
    pointer=await cabinPointer();
    try{for(const target of [stair.top,{x:stair.x,z:(stair.startZ+stair.endZ)/2,y:(stair.fromY+stair.toY)/2},stair.bottom,
      {x:0,z:stair.bottom.z,y:stair.fromY},{x:0,z:door.z,y:stair.fromY},door.inside])
      samples.push(...await walkLocal(target,pointer,{precision:from.kind!=='ferry'||target.x!==0}));}
    finally{await page.mouse.up();}
  }else {
    const pointer=await cabinPointer(); try{samples.push(...await walkLocal(door.inside,pointer));}finally{await page.mouse.up();}
  }
  assert.equal((await state()).transit.passengerDeck,'lower');
  await focusPlayable();
  await page.waitForFunction(({id,to})=>{const v=window.__NEON__.snapshot().city.sample.transit.vehicles.find(v=>v.id===id);
    return v.stopId===to&&v.doorsOpen&&v.remaining>2;},{id,to:to.id},{polling:'raf',timeout:remaining(600000)});
  const arrived=await phase(`${label}-arrived`,{destination:to.id}); assert.equal(arrived.teleportRevision,revision);
  assert.ok(arrived.simulationTime>boarded.simulationTime); assert.ok(distance(arrived.position,boarded.position)>10);
  assert.ok(arrived.simulationTime-boarded.simulationTime<route.duration*3+180,'a live route does not remain stalled indefinitely');
  await writeFile(resolve(output,`${label}-cabin-waypoints.json`),JSON.stringify({from:from.id,to:to.id,id,boarded,arrived,samples},null,2)+'\n');
  await page.keyboard.press('e'); await page.waitForFunction(()=>!window.__NEON__.snapshot().city.sample.transit.riding,null,{timeout:remaining(30000)});
  const outside=await phase(`${label}-alighted`,{destination:to.id,legalTransition:'public E lower-door alighting',beforeRevision:revision});
  assert.ok(distance(outside.position,to.board)<.1); assert.ok(Math.abs(outside.position.y-to.board.y)<.1); return outside;
};
const savePublic = async (label,{resume=true,welcome=false}={}) => {
  if(welcome){assert.equal((await state()).started,false);await page.locator('#welcome-settings').click();}
  else{await focusPlayable();await page.keyboard.press('Escape');await page.locator('[data-tab="settings"]').click();}
  const download=page.waitForEvent('download'); await page.locator('#export-save').click(); const file=await download;
  const path=resolve(output,`${label}-original-export.json`); await file.saveAs(path);
  const saved=JSON.parse(await readFile(path,'utf8'));
  const persisted=await page.evaluate(()=>JSON.parse(localStorage.getItem('neon-harbor.progress.v1')));
  assert.deepEqual(saved,persisted,'the retained download is the actual public save, matching browser persistence');
  assert.equal(saved.version,1); assert.ok(Number.isSafeInteger(saved.cash));
  assert.ok([saved.player?.x,saved.player?.z,saved.player?.yaw].every(Number.isFinite));
  assert.equal(saved.harborLife?.schema,'neon-harbor/daily-life'); assert.equal(saved.harborLife.version,1); assert.equal(saved.harborTransit?.version,1);
  await phase(`${label}-public-save`,{file:basename(path),sha256:sha256(await readFile(path)),resume,welcome});
  if(resume){await page.locator('#resume').click();if(!welcome)await focusPlayable();}return saved;
};
const startPublic = async () => {
  await page.locator('#start').click();
  // enterCity prepares the saved/spawn location asynchronously. The shipped
  // keyboard handler correctly ignores V/E while startup is still paused.
  // Observe readiness, focus the real canvas, then send one ordinary V only
  // when its current setting requires it; do not retry an ignored shortcut.
  await page.waitForFunction(() => {
    const s=window.__NEON__.snapshot();
    return s.started&&!s.paused&&!s.streaming?.preparing&&!s.streaming?.pending;
  });
  await page.locator('#game').focus();
  if(!(await state()).settings.firstPerson)await page.keyboard.press('v');
  await page.waitForFunction(()=>window.__NEON__.snapshot().settings.firstPerson);
};

try {
  caseStartedAt=Date.now();deadline=caseStartedAt+metadata.caseBudgetWallMilliseconds;
  metadata.caseStartedAt=new Date(caseStartedAt).toISOString();
  browser=await chromium.launch({headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  metadata.browser={version:browser.version(),executable:'Playwright Chromium',node:process.version};
  assert.equal(browser.version(),'151.0.7922.34');
  context=await browser.newContext({viewport,deviceScaleFactor:1,recordVideo:{dir:resolve(output,'video'),size:viewport}});
  assert.ok(Date.now()<deadline,'startup retains the total case wall budget');
  totalTimer=setTimeout(()=>{metadata.caseBudgetExceededAt=new Date().toISOString();context.close().catch(()=>{});},remaining(metadata.caseBudgetWallMilliseconds));
  videoStartedAt=Date.now();page=await context.newPage();video=page.video();
  metadata.videoStartedAt=new Date(videoStartedAt).toISOString();page.setDefaultTimeout(180000);page.setDefaultNavigationTimeout(180000);
  page.on('pageerror',error=>metadata.errors.push({type:'pageerror',message:error.message,at:new Date().toISOString()}));
  page.on('console',message=>{if(message.type()==='error')metadata.errors.push({type:'console',message:message.text(),at:new Date().toISOString()});});
  page.on('response',response=>{resources.add(new URL(response.url()).pathname);if(response.status()>=400)metadata.errors.push({type:'http',status:response.status(),url:response.url()});});
  await page.goto(metadata.url); await page.waitForFunction(()=>window.__NEON__?.snapshot().ready&&!document.getElementById('start').disabled);
  const initial=await state(); metadata.initialDefaultQuality=initial.settings.quality; assert.equal(initial.settings.quality,'high');
  const publicCatalog=await page.evaluate(()=>window.__NEON__.snapshot().city.buildings);
  const catalogPath=resolve(output,'initial-public-catalog.json');
  await writeFile(catalogPath,JSON.stringify(publicCatalog,null,2)+'\n');
  metadata.initialCatalog={file:basename(catalogPath),sha256:sha256(await readFile(catalogPath)),buildings:publicCatalog.length};
  for(const b of [home,destination,shopBuilding]) {
    const actual=publicCatalog.find(p=>p.id===b.id); assert.ok(actual);
    for(const key of ['x','z','width','depth'])assert.equal(actual[key],b[key],`offline route and real browser catalog agree: ${b.id}/${key}`);
    assert.deepEqual(actual.entrance,b.entrance); assert.deepEqual(actual.floors,b.floors);
  }
  await page.locator('#welcome-settings').click(); await page.locator('#quality').selectOption('low'); await page.locator('#cycle').uncheck();
  assert.equal(Number(await page.locator('#time').inputValue()),16.5); await page.locator('#volume').press('Home');
  await page.locator('#resume').click(); await startPublic();
  metadata.actualWebGL=await page.locator('#game').evaluate(canvas=>{
    const gl=canvas.getContext('webgl2'),debug=gl.getExtension('WEBGL_debug_renderer_info');
    return {version:gl.getParameter(gl.VERSION),shadingLanguage:gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
      vendor:gl.getParameter(gl.VENDOR),renderer:gl.getParameter(gl.RENDERER),
      unmaskedVendor:debug?gl.getParameter(debug.UNMASKED_VENDOR_WEBGL):null,
      unmaskedRenderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):null,
      width:gl.drawingBufferWidth,height:gl.drawingBufferHeight};
  });
  assert.equal(metadata.actualWebGL.width,drawingBuffer.width);assert.equal(metadata.actualWebGL.height,drawingBuffer.height);
  await page.locator('#explore-city').click(); await page.locator(`[data-visit-building="${home.id}"]`).click();
  await page.waitForFunction(()=>{const s=window.__NEON__.snapshot();return s.started&&!s.paused&&!s.streaming?.preparing&&!s.streaming?.pending;});
  await buildingEnter(home); await faceRoom(page,Math.PI);
  const cabin=(await state()).interior.cabin; await walk('z',cabin.doorZ+1.05); await walk('x',cabin.x); await walk('z',cabin.z);
  await focusPlayable();await page.keyboard.press('e'); await page.locator(`[data-floor-id="${home.floors[1].id}"]`).click();
  await page.waitForFunction(()=>!window.__NEON__.snapshot().city.interior.moving,null,{timeout:180000});
  assert.equal((await state()).interior.floorId,home.floors[1].id);
  const upstairsCabin=(await state()).interior.cabin; await walk('z',upstairsCabin.doorZ+1.05); await walk('x',home.x);
  const startingRoom=await room(home,'kitchen'); await faceRoom(page,Math.atan2(startingRoom.x-startingRoom.arrival.x,startingRoom.z-startingRoom.arrival.z));
  metadata.status='running'; routeStartedAt=Date.now();
  metadata.routeStartedAt=new Date(routeStartedAt).toISOString(); metadata.videoRouteStartsAfterStartupAndSetup=true;
  metadata.approximateVideoRouteStartWallOffsetMilliseconds=routeStartedAt-videoStartedAt;
  // Monitoring only reads state and writes evidence. It never pads duration or
  // advances the clock. The existing total case timer also covers startup,
  // preparation, export and reload; the route never resets that budget.
  monitor=setInterval(async()=>{try{const s=await state();console.log(`Tour progress: ${JSON.stringify({wallMs:Date.now()-routeStartedAt,position:s.position,scene:s.interior.buildingId||s.transit.ridingVehicleId||'street',time:s.simulationTime})}`);}catch{}},30000);
  const start=await phase('continuous-route-start-real-home-2F-room',{room:startingRoom.id,preparationTravel:'one Atlas visit and a real elevator journey before the route start'});
  await shot('tour-start-home-2F'); await leaveRoom(home,startingRoom); await homeStair(false); await buildingExit(home);
  await street('walk-home-to-bus',plan.paths.homeToBus); await ride(busFrom,busTo,{label:'bus'});
  await street('walk-bus-to-produce',plan.paths.busToProduce);
  await page.waitForFunction(id=>{const shop=window.__NEON__.snapshot().city.sample.life.shops.find(s=>s.id===id);return shop.open&&shop.staff>0&&shop.stock>0;},shop.id,{timeout:remaining(600000),polling:'raf'});
  assert.ok((await page.locator('#interaction').textContent()).includes('购买'));
  await focusPlayable(); const beforePurchase=await phase('before-real-counter-purchase');
  const actualShop=beforePurchase.life.shops.find(s=>s.id===shop.id);
  assert.ok(actualShop.open&&actualShop.staff>0&&actualShop.stock>0,'the actual open counter has staff and finite stock');
  assert.ok(beforePurchase.cash>=actualShop.price);assert.equal(beforePurchase.interior.buildingId,null);assert.equal(beforePurchase.transit.riding,false);
  assert.ok(distance(beforePurchase.position,actualShop.anchor)<3.6,'purchase uses the physical counter contact');
  await page.keyboard.press('e');
  await page.waitForFunction(({product,quantity})=>window.__NEON__.snapshot().city.sample.life.playerInventory[product]===quantity+1,
    {product:shop.product,quantity:beforePurchase.life.playerInventory[shop.product]},{timeout:remaining(30000)});
  const purchased=await phase('after-real-counter-purchase'); assert.equal(purchased.cash,beforePurchase.cash-shop.price);
  const purchaseSave=await savePublic('purchase'); const transactions=purchaseSave.harborLife.transactions.filter(t=>t.type==='player-purchase'&&t.shopId===shop.id);
  assert.equal(transactions.length,1); assert.equal(transactions[0].amount,shop.price);assert.equal(transactions[0].quantity,1);assert.equal(transactions[0].product,shop.product);
  assert.equal(purchased.life.totalGoods,purchased.life.initialGoods);assert.equal(purchased.life.totalMoney,purchased.life.initialMoney);
  await street('walk-produce-counter-to-real-shop-door',plan.paths.produceCounterToDoor);await buildingEnter(shopBuilding);
  const groceryRoom=await room(shopBuilding,'market');await phase('produce-grocery-room-physically-entered',{room:groceryRoom.id,type:groceryRoom.type});
  await shot('produce-real-grocery-room');await leaveRoom(shopBuilding,groceryRoom);await buildingExit(shopBuilding);
  await street('walk-produce-to-south-pier',plan.paths.produceToPier); await pier(ferrySouth,true);
  await ride(ferrySouth,ferryNorth,{label:'ferry-outbound'}); await pier(ferryNorth,false);
  await street('walk-north-pier-to-building',plan.paths.northPierToAddress); await buildingEnter(destination);
  const northernRoom=await room(destination,northernRoomType); await phase('north-room-physically-entered',{room:northernRoom.id,type:northernRoom.type}); await shot('north-real-room');
  await leaveRoom(destination,northernRoom); await buildingExit(destination); await street('walk-north-building-to-pier',plan.paths.northAddressToPier);
  await pier(ferryNorth,true); await ride(ferryNorth,ferrySouth,{stairs:false,label:'ferry-return'}); await pier(ferrySouth,false);
  await street('walk-south-pier-to-tram',plan.paths.southPierToTram); await ride(tramFrom,tramTo,{label:'tram'});
  await street('walk-tram-to-original-home',plan.paths.tramToHome); await buildingEnter(home); await homeStair(true);
  const returningRoom=await room(home,'kitchen'); assert.equal(returningRoom.id,startingRoom.id);
  await phase('returned-physically-to-original-home-2F',{room:startingRoom.id}); await shot('tour-return-home-2F');
  metadata.routeEndedAt=new Date().toISOString(); metadata.routeWallMilliseconds=Date.now()-routeStartedAt;
  metadata.routeSimulationSeconds=(await state()).simulationTime-start.simulationTime;
  assert.ok(metadata.routeWallMilliseconds>=metadata.minimumRouteWallMilliseconds,'the real route naturally lasts at least 20 wall minutes; never add a sleep to pass');
  // Stay in the legitimate paused settings panel between export and reload.
  // Resuming first would advance the fleet and let pagehide save a newer time
  // than the retained export, creating a false persistence mismatch.
  const finalSave=await savePublic('final-home-2F',{resume:false});
  assert.equal(finalSave.cash,purchaseSave.cash); assert.equal(finalSave.harborLife.player.inventory[shop.product],beforePurchase.life.playerInventory[shop.product]+1);
  assert.ok(distance(finalSave.player,home.entrance)<.1,'the product safely saves the street door for indoor players');
  assert.equal((await state()).paused,true,'the actual exported service time stays paused until reload');
  await page.reload(); await page.waitForFunction(()=>window.__NEON__?.snapshot().ready&&!document.getElementById('start').disabled);
  const restored=await phase('reload-safely-restores-home-street-door',{productRule:'interior progress recovers at the building door, not the original room'});
  assert.equal(restored.cash,finalSave.cash); assert.deepEqual(restored.life.playerInventory,finalSave.harborLife.player.inventory);
  assert.ok(Math.abs(restored.transit.time-finalSave.harborTransit.time)<.001);
  assert.equal(restored.interior.buildingId,null); assert.ok(distance(restored.position,home.entrance)<.1);
  // Export the restored runtime through the public welcome settings before it
  // starts ticking. Comparing the actual download also checks vehicle service
  // progress, all shop/transaction ledgers and citizen state, not just a clock.
  const restoredSave=await savePublic('reload-restored-runtime',{welcome:true,resume:true});
  assert.deepEqual(restoredSave,finalSave,'the public restored runtime export preserves every original progress field');
  await startPublic(); await buildingEnter(home); await homeStair(true); await room(home,'kitchen');
  await phase('after-reload-real-E-and-stairs-reach-original-2F');
  assert.equal(sha256(await readFile(resolve(root,'build-info.json'))),manifestSha256,'manifest remains frozen');
  for(const [path,hash]of Object.entries(manifest.assets))assert.equal(sha256(await readFile(resolve(root,path))),hash,`frozen served asset: ${path}`);
  for(const [path,hash]of Object.entries(sourceHashes))assert.equal(sha256(await readFile(resolve(projectRoot,path))),hash,`frozen source: ${path}`);
  metadata.resources=[...resources].sort().map(path=>({path,manifestSha256:manifest.assets[path.replace(/^\//,'')]||null}));
  assert.deepEqual(metadata.errors,[],'no page, shader console or HTTP errors');
  assert.ok(Date.now()-caseStartedAt<=metadata.caseBudgetWallMilliseconds,'the entire browser case, including preparation and reload, stays within 90 wall minutes');
  metadata.status='passed';
}catch(error){metadata.status='failed';metadata.failure=error.stack;try{metadata.failureState=await state();}catch{}
  try{await page?.screenshot({path:resolve(output,'failure-original.png'),timeout:90000});}catch{}throw error;
}finally{
  clearInterval(monitor);
  metadata.resources=[...resources].sort().map(path=>({path,manifestSha256:manifest.assets[path.replace(/^\//,'')]||null}));
  const closeRequestedAt=Date.now();metadata.recordingCloseRequestedAt=new Date(closeRequestedAt).toISOString();
  metadata.recordingWallMilliseconds=videoStartedAt?closeRequestedAt-videoStartedAt:null;
  // Preserve the first failure and raw video even if cleanup also fails. A
  // cleanup error on an otherwise passing case is still a failed capture.
  const invalidatePass=error=>{if(metadata.status==='passed'){metadata.status='failed';metadata.failure=error.stack||String(error);finalInvalidatedPass=true;}};
  metadata.cleanupErrors=[];
  for(const [operation,close]of [['context',()=>context?.close()],['browser',()=>browser?.close()],['server',()=>new Promise((ok,reject)=>server.close(error=>error?reject(error):ok()))]]){
    try{await close();}catch(error){metadata.cleanupErrors.push({operation,message:error.message});invalidatePass(error);}
  }
  clearTimeout(totalTimer);videoStoppedAt=Date.now();metadata.videoStoppedAt=new Date(videoStoppedAt).toISOString();
  metadata.recordingFinalizationWallMilliseconds=videoStoppedAt-closeRequestedAt;
  metadata.caseWallMilliseconds=caseStartedAt?videoStoppedAt-caseStartedAt:null;
  if(metadata.caseWallMilliseconds>metadata.caseBudgetWallMilliseconds)invalidatePass(new Error('The full browser case, including recording finalization, exceeded 90 wall minutes.'));
  if(metadata.errors.length)invalidatePass(new Error(`Errors arrived before recording cleanup completed: ${JSON.stringify(metadata.errors)}`));
  if(video){try{const path=await video.path(),bytes=(await stat(path)).size,digest=createHash('sha256');
    for await(const chunk of createReadStream(path))digest.update(chunk);
    const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_name,width,height',
      '-of','json',path],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
    const durationSeconds=Number(probe.format?.duration);
    metadata.video={file:`video/${basename(path)}`,path,bytes,sha256:digest.digest('hex'),durationSeconds,probe,
      unedited:true,includesStartupAndSetup:true,published:false,publicationUrl:null,
      largeFilePolicy:bytes>100_000_000?'retain as local downloadable artifact; do not force into git':'review artifact size before publication'};
    if(metadata.status==='passed'){
      assert.ok(durationSeconds>=metadata.recordingWallMilliseconds/1000-2,'the unedited video covers startup, setup, the route and final reload wall time');
      assert.ok(durationSeconds>=metadata.routeWallMilliseconds/1000-2,'the unedited video covers the complete observed route duration');
    }
  }catch(error){metadata.videoFailure=error.message;invalidatePass(error);}}
  if(!metadata.video)invalidatePass(new Error('The raw continuous video could not be retained.'));
  metadata.completedAt=new Date().toISOString();await persist();
  if(finalInvalidatedPass)throw new Error(metadata.failure);
}
