import { test,expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { snapshot } from '../e2e/helpers/walking.js';
import { chooseStorey } from '../e2e/helpers/occupied.js';
async function boot(page){
  await page.addInitScript(()=>localStorage.setItem('neon-harbor.settings.v1',JSON.stringify({quality:'low',volume:0,dayCycle:false,hour:16.5})));
  await page.goto('/');await expect(page.locator('#start')).toBeEnabled({timeout:90000});
  // The short welcome screen must scroll through normal keyboard focus.
  // Reaching this button also proves it is not clipped by the fixed document.
  for(let tab=0;tab<12&&await page.evaluate(()=>document.activeElement?.id)!=='welcome-multiplayer';tab++)await page.keyboard.press('Tab');
  await expect(page.locator('#welcome-multiplayer')).toBeFocused();
  await expect(page.locator('#welcome-multiplayer')).toBeInViewport({ratio:1});
}
async function join(page,name,code=''){
  await page.locator('#welcome-multiplayer').click();await page.locator('#room-name').fill(name);await page.locator('#room-code').fill(code);await page.locator('#room-join').click();
  await expect(page.locator('#welcome')).toBeHidden();await expect.poll(()=>page.evaluate(()=>window.__NEON__.snapshot().multiplayer.status)).toBe('connected');
}
test('two independent browsers share a room, rendered walking peers, chat and disconnect',async({playwright},testInfo)=>{
  // Separate browser processes model two machines and avoid sharing one
  // software GPU command queue between the clients on hosted CI runners.
  const clients=await Promise.all([playwright.chromium.launch(testInfo.project.use.launchOptions),playwright.chromium.launch(testInfo.project.use.launchOptions)]);
  try{
    const first=await clients[0].newContext({baseURL:testInfo.project.use.baseURL,viewport:{width:640,height:400}}),second=await clients[1].newContext({baseURL:testInfo.project.use.baseURL,viewport:{width:640,height:400}}),a=await first.newPage(),b=await second.newPage(),errors=[];
    for(const page of [a,b])page.on('pageerror',e=>errors.push(e.message));
    await boot(a);
    const welcomeEvidence=testInfo.outputPath('welcome-short-window-multiplayer.png');
    await a.screenshot({path:welcomeEvidence});await testInfo.attach('welcome-short-window-multiplayer',{path:welcomeEvidence,contentType:'image/png'});
    await join(a,'海风');const code=await a.evaluate(()=>window.__NEON__.snapshot().multiplayer.code);
    await a.locator('#multiplayer').click();
    await boot(b);await join(b,'榕荫',code);await a.locator('#resume').click();
    await expect.poll(()=>a.evaluate(()=>window.__NEON__.snapshot().multiplayer.players.length)).toBe(2);
    await expect.poll(()=>b.evaluate(()=>window.__NEON__.snapshot().multiplayer.meshes.filter(p=>p.visible).length)).toBe(1);
    const start=await a.evaluate(()=>window.__NEON__.snapshot().position);
    await a.locator('#game').focus();await a.keyboard.down('KeyW');
    await a.waitForFunction(({start})=>Math.hypot(window.__NEON__.snapshot().position.x-start.x,window.__NEON__.snapshot().position.z-start.z)>3,{start},{timeout:30000});await a.keyboard.up('KeyW');
    const target=await a.evaluate(()=>window.__NEON__.snapshot().position);
    await expect.poll(()=>b.evaluate(({target})=>{const mesh=window.__NEON__.snapshot().multiplayer.meshes[0];return mesh?Math.hypot(mesh.x-target.x,mesh.z-target.z):1000;},{target})).toBeLessThan(.6);
    await a.keyboard.down('KeyW');await a.waitForFunction(()=>window.__NEON__.snapshot().cars.some(c=>c.id==='starter'&&Math.hypot(c.x-window.__NEON__.snapshot().position.x,c.z-window.__NEON__.snapshot().position.z)<5),null,{timeout:30000});await a.keyboard.up('KeyW');
    await a.keyboard.press('KeyE');await expect.poll(()=>a.evaluate(()=>window.__NEON__.snapshot().inCar)).toBe('starter');
    const carStart=await a.evaluate(()=>window.__NEON__.snapshot().position);
    await a.keyboard.down('KeyW');await a.waitForFunction(({carStart})=>Math.hypot(window.__NEON__.snapshot().position.x-carStart.x,window.__NEON__.snapshot().position.z-carStart.z)>3,{carStart},{timeout:30000});await a.keyboard.up('KeyW');
    await a.keyboard.down('Space');await a.waitForFunction(()=>window.__NEON__.snapshot().speed<.5,null,{timeout:30000});await a.keyboard.up('Space');
    const carTarget=await a.evaluate(()=>window.__NEON__.snapshot().cars.find(c=>c.id==='starter'));
    await expect.poll(()=>b.evaluate(({carTarget})=>{const car=window.__NEON__.snapshot().cars.find(c=>c.id==='starter');return Math.hypot(car.x-carTarget.x,car.z-carTarget.z);},{carTarget})).toBeLessThan(1);
    await a.keyboard.press('KeyE');await expect.poll(()=>a.evaluate(()=>window.__NEON__.snapshot().inCar)).toBe(null);
    await a.locator('#multiplayer').click();await a.locator('#room-message').fill('一起去看海');await a.locator('#room-chat-form button').click();
    await b.locator('#multiplayer').click();await expect(b.locator('#room-chat')).toContainText('海风：一起去看海');
    await a.locator('#room-leave').click();await expect.poll(()=>b.evaluate(()=>window.__NEON__.snapshot().multiplayer.players.length)).toBe(1);
    await expect.poll(()=>b.evaluate(()=>window.__NEON__.snapshot().multiplayer.meshes.length)).toBe(0);
    expect(errors).toEqual([]);await first.close();await second.close();
  }finally{await Promise.all(clients.map(client=>client.close()));}
});


test('two browsers synchronize expanded east-bay addresses and elevator floors beyond the former 320 metre limit', async ({ playwright }, testInfo) => {
  test.setTimeout(600000);
  const clients = await Promise.all([
    playwright.chromium.launch(testInfo.project.use.launchOptions),
    playwright.chromium.launch(testInfo.project.use.launchOptions),
  ]);
  try {
    const options = { baseURL: testInfo.project.use.baseURL, viewport: { width: 640, height: 400 } };
    const first = await clients[0].newContext(options), second = await clients[1].newContext(options);
    const a = await first.newPage(), b = await second.newPage(), errors = [];
    for (const page of [a, b]) {
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => {
        if (response.status() >= 400 && new URL(response.url()).pathname.startsWith('/api/'))
          errors.push(`HTTP ${response.status()}: ${new URL(response.url()).pathname}`);
      });
    }
    // Observe the second browser's actual server-sent events. This reads the
    // wire world identifier without changing the runtime or injecting poses.
    const network = await second.newCDPSession(b);
    await network.send('Network.enable');
    let received = null, trackedId = null;
    const receivedHeights = [];
    network.on('Network.eventSourceMessageReceived', event => {
      try {
        const packet = JSON.parse(event.data);
        if (Array.isArray(packet.players)) {
          received = packet;
          const visitor = packet.players.find(player => player.id === trackedId);
          if (visitor?.scene.startsWith('interior:east-012:')) receivedHeights.push(visitor.y);
        }
      }
      catch { errors.push('Invalid room event JSON'); }
    });
    await boot(a); await join(a, '东湾访客');
    const initial = await snapshot(a), code = initial.multiplayer.code, visitorId = initial.multiplayer.id;
    trackedId = visitorId;
    await a.locator('#multiplayer').click();
    await boot(b); await join(b, '海湾观察员', code);
    await b.locator('#multiplayer').click(); await a.locator('#resume').click();
    await expect.poll(() => received?.world).toBe('neon-harbor-v08');
    await expect.poll(() => received?.players.length).toBe(2);

    const assertRemotePose = async (position, scene) => {
      await expect.poll(() => {
        const peer = received?.players.find(player => player.id === visitorId);
        return peer?.scene === scene ? Math.hypot(peer.x - position.x, peer.y - position.y, peer.z - position.z) : Infinity;
      }).toBeLessThan(0.45);
      expect(received.world).toBe('neon-harbor-v08'); expect(received.code).toBe(code);
      await expect.poll(() => b.evaluate(({ visitorId, position, scene }) => {
        const peer = window.__NEON__.snapshot().multiplayer.players.find(player => player.id === visitorId);
        return peer?.scene === scene ? Math.hypot(peer.x - position.x, peer.y - position.y, peer.z - position.z) : Infinity;
      }, { visitorId, position, scene })).toBeLessThan(0.45);
      return received.players.find(player => player.id === visitorId);
    };
    const visit = async building => {
      await a.locator('#explore-city').click();
      await expect(a.locator('#atlas-results')).toBeVisible();
      await a.locator(`[data-visit-building="${building.id}"]`).click();
      await expect(a.locator('#panel')).not.toBeVisible({ timeout: 60000 });
      await expect(a.locator('#interaction')).toContainText(`进入 ${building.name}`);
      const state = await snapshot(a);
      expect(state.position.x).toBeCloseTo(building.entrance.x, 1);
      expect(state.position.z).toBeCloseTo(building.entrance.z, 1);
      await assertRemotePose(state.position, 'outdoor');
      return state;
    };

    const boundaryAddress = initial.city.buildings.find(building => building.id === 'east-037');
    expect(boundaryAddress).toBeTruthy();
    const boundary = await visit(boundaryAddress);
    expect(Math.max(Math.abs(boundary.position.x), Math.abs(boundary.position.z))).toBeGreaterThan(1450);
    // The atlas is the normal supported travel action. Entry and lift selection
    // below use the same interaction key, corridor walking and menu as players.
    const highAddress = initial.city.buildings.find(building => building.id === 'east-012');
    const highFloor = highAddress.floors.find(floor => floor.y > 325);
    expect(highFloor).toBeTruthy();
    await visit(highAddress);
    await a.keyboard.press('e');
    await expect.poll(async () => (await snapshot(a)).city.interior.buildingId).toBe(highAddress.id);
    const lobby = await snapshot(a);
    await assertRemotePose(lobby.position, `interior:${highAddress.id}:${highAddress.floors[0].id}`);
    await chooseStorey(a, highFloor.id);
    const upstairs = await snapshot(a);
    expect(upstairs.position.y).toBeGreaterThan(320);
    expect(upstairs.position.y).toBeCloseTo(highFloor.y, 1);
    expect(receivedHeights.some(height => height > 50 && height < highFloor.y - 50),
      'the remote browser receives intermediate elevator elevations').toBe(true);
    const peer = await assertRemotePose(upstairs.position, `interior:${highAddress.id}:${highFloor.id}`);
    // Let the observer render the received state after the visitor has paused;
    // this keeps only one software GPU scene active during the long lift ride.
    await a.locator('#multiplayer').click(); await b.locator('#resume').click();
    // An outdoor observer receives the interior peer state, while visibility
    // continues to obey the different-building/floor context.
    await expect.poll(() => b.evaluate(id => window.__NEON__.snapshot().multiplayer.meshes.find(mesh => mesh.id === id)?.visible, visitorId)).toBe(false);
    expect((await snapshot(b)).city.interior.buildingId).toBeNull();
    expect((await snapshot(a)).multiplayer.status).toBe('connected');
    const peerEvidence = testInfo.outputPath('expanded-east-bay-peer-state.json');
    await writeFile(peerEvidence, JSON.stringify({
      world: received.world, code, boundary: boundary.position, interior: upstairs.city.interior.buildingId,
      floor: highFloor.id, local: upstairs.position, remote: peer,
      receivedHeightRange: [Math.min(...receivedHeights), Math.max(...receivedHeights)],
    }, null, 2));
    await testInfo.attach('expanded-east-bay-peer-state', { contentType: 'application/json', path: peerEvidence });
    expect(errors).toEqual([]);
    await first.close(); await second.close();
  } finally { await Promise.all(clients.map(client => client.close())); }
});
