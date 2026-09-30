import { test,expect } from '@playwright/test';
async function boot(page){
  await page.addInitScript(()=>localStorage.setItem('neon-harbor.settings.v1',JSON.stringify({quality:'low',volume:0,dayCycle:false,hour:16.5})));
  await page.goto('/');await expect(page.locator('#start')).toBeEnabled({timeout:90000});
}
async function join(page,name,code=''){
  await page.locator('#welcome-multiplayer').click();await page.locator('#room-name').fill(name);await page.locator('#room-code').fill(code);await page.locator('#room-join').click();
  await expect(page.locator('#welcome')).toBeHidden();await expect.poll(()=>page.evaluate(()=>window.__NEON__.snapshot().multiplayer.status)).toBe('connected');
}
test('two independent browsers share a room, rendered walking peers, chat and disconnect',async({browser})=>{
  const first=await browser.newContext({viewport:{width:640,height:400}}),second=await browser.newContext({viewport:{width:640,height:400}}),a=await first.newPage(),b=await second.newPage(),errors=[];
  for(const page of [a,b])page.on('pageerror',e=>errors.push(e.message));
  await boot(a);await join(a,'海风');const code=await a.evaluate(()=>window.__NEON__.snapshot().multiplayer.code);
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
});
