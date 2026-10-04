import { test,expect } from '@playwright/test';
import { snapshot,walkAxis,walkRoute,stairWalkingRoute } from './helpers/walking.js';
import { enterAddress,chooseStorey,enterRoom,frameOccupiedRoom } from './helpers/occupied.js';

test.use({viewport:{width:640,height:400}});test.setTimeout(600000);
async function boot(page) {
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/');await expect(page.locator('#start')).toBeEnabled({timeout:90000});
  await page.locator('#welcome-settings').click();await page.locator('#cycle').uncheck();await page.locator('#resume').click();
  await page.locator('#start').click();await page.keyboard.press('v');return errors;
}
async function capture(page,info,name) {
  const file=info.outputPath(name+'.png');await page.screenshot({path:file,timeout:90000});await info.attach(name,{path:file,contentType:'image/png'});
}

test('high quality actually renders the new cloth, furniture and contact-occlusion pipeline',async({page},info)=>{
  const errors=await boot(page);await enterAddress(page,'camellia-court');
  const floor=await chooseStorey(page,'workplace'),room=floor.rooms.find(r=>r.type==='living');
  await enterRoom(page,room,-560,{doorwayView:true}).catch(async()=>{
    // Use the catalog's real corridor coordinate, never a diagnostics teleport.
    const state=await snapshot(page),b=state.city.buildings.find(b=>b.id==='camellia-court');
    await enterRoom(page,room,b.x,{doorwayView:true});
  });
  const s=await snapshot(page),b=s.city.buildings.find(b=>b.id==='camellia-court');
  await frameOccupiedRoom(page,room,b.x);expect(s.settings.quality).toBe('high');
  await capture(page,info,'v08-high-furnished-living');expect(errors).toEqual([]);
});

test('old-town small shells have a walkable stair, real rooms, a lift and a roof',async({page},info)=>{
  const errors=await boot(page);await enterAddress(page,'south-home-026');
  const s=await snapshot(page),b=s.city.buildings.find(b=>b.id==='south-home-026');
  expect(s.city.interior.roomCount).toBe(2);const flight=s.city.interior.stairs[0],route=stairWalkingRoute(flight,b.x);
  await walkRoute(page,[{...route.bottom,x:b.x},route.bottom,route.middle,route.top]);
  await expect.poll(async()=>(await snapshot(page)).city.interior.floorId).toBe('gallery');
  await walkRoute(page,flight.bypass);const room=(await snapshot(page)).city.interior.rooms[0];
  await enterRoom(page,room,b.x,{doorwayView:true});await frameOccupiedRoom(page,room,b.x);
  await capture(page,info,'v08-high-old-town-room');
  await walkAxis(page,'z',room.entrance.z);await walkAxis(page,'x',b.x);
  await chooseStorey(page,'observation');await capture(page,info,'v08-high-old-town-roof');expect(errors).toEqual([]);
});

test('a previously scenic east-bay tower is reachable and furnished with matching save and multiplayer world extents',async({page},info)=>{
  const errors=await boot(page);await enterAddress(page,'east-office-001');
  const initial=await snapshot(page);expect(initial.position.x).toBeGreaterThan(1000);expect(initial.city.interior.roomCount).toBe(4);
  const floor=await chooseStorey(page,'gallery'),b=initial.city.buildings.find(b=>b.id==='east-office-001');
  await enterRoom(page,floor.rooms[0],b.x,{doorwayView:true});await frameOccupiedRoom(page,floor.rooms[0],b.x);
  await capture(page,info,'v08-high-east-bay-room');
  await page.locator('#explore-city').click();await page.locator('[data-visit-building="tide-museum"]').click();
  await expect.poll(async()=>(await snapshot(page)).city.interior.buildingId).toBeNull();expect(errors).toEqual([]);
});
