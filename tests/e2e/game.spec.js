import { test, expect } from '@playwright/test';

const snapshot = page => page.evaluate(() => window.__NEON__.snapshot());
async function boot(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#start')).toBeEnabled();
  expect(await page.locator('#loading').isVisible()).toBe(false);
  return errors;
}
async function useSoftwareRenderingQuality(page) {
  // Keep startup coverage at the default quality, then use the real low-quality
  // option for interaction tests: SwiftShader has no hardware GPU in CI.
  await page.locator('#welcome-settings').click();
  await page.locator('#quality').selectOption('low');
  expect((await snapshot(page)).settings.quality).toBe('low');
  await page.locator('#resume').click();
}
async function travel(page, key, predicate) {
  await expect(page.locator('#game')).toBeFocused();
  expect((await snapshot(page)).paused).toBe(false);
  await page.keyboard.down(key);
  // Observe after each browser animation frame instead of progressively slower
  // Node polls. This releases held input promptly on fast GPUs and still checks
  // actual game state on software renderers. No game state is modified here.
  try {
    await page.waitForFunction(
      `(${predicate.toString()})(window.__NEON__.snapshot())`,
      null,
      { polling: 'raf', timeout: 20000 },
    );
  }
  finally { await page.keyboard.up(key); }
}

test('real keyboard gameplay, menus, wanted level and saved settings', async ({ page }) => {
  const errors = await boot(page);
  await page.screenshot({ path: 'test-results/screenshots/01-welcome.png' });
  await useSoftwareRenderingQuality(page);
  await page.locator('#start').click();
  await expect(page.locator('#hud')).toBeVisible();
  const initial = await snapshot(page);
  await travel(page, 'w', state => state.position.z < 164);
  await page.keyboard.press('e');
  await expect.poll(async () => (await snapshot(page)).inCar).not.toBeNull();
  await travel(page, 'w', state => state.speed > 8);
  expect((await snapshot(page)).position.z).toBeLessThan(initial.position.z - 12);
  await page.screenshot({ path: 'test-results/screenshots/02-driving.png' });
  await travel(page, 'Space', state => state.speed < .4);
  await page.keyboard.press('e');
  await expect.poll(async () => (await snapshot(page)).inCar).toBeNull();
  await page.keyboard.press('m');
  await expect(page.locator('#city-map')).toBeVisible();
  expect((await snapshot(page)).paused).toBe(true);
  await page.screenshot({ path: 'test-results/screenshots/03-map.png' });
  await page.locator('[data-tab="jobs"]').click();
  await expect(page.locator('[data-mission]')).toHaveCount(3);
  await page.screenshot({ path: 'test-results/screenshots/04-missions.png' });
  await page.locator('[data-mission="harbor-run"]').click();
  await expect.poll(async () => (await snapshot(page)).mission?.id).toBe('harbor-run');
  await travel(page, 'j', state => state.wanted > 0);
  expect((await snapshot(page)).ammo).toBeLessThan(18);
  await expect.poll(async () => (await snapshot(page)).cars.some(car => car.police)).toBe(true);
  await page.keyboard.press('Escape');
  await page.locator('#cancel-job').click();
  expect((await snapshot(page)).mission).toBeNull();
  await page.locator('[data-tab="settings"]').click();
  await page.locator('#quality').selectOption('low');
  await page.locator('#cycle').uncheck();
  await page.locator('#touch-setting').check();
  const exported = page.waitForEvent('download');
  await page.locator('#export-save').click();
  const download = await exported;
  expect(download.suggestedFilename()).toBe('neon-harbor-save.json');
  await page.reload();
  await expect(page.locator('#start')).toBeEnabled();
  expect((await snapshot(page)).settings.quality).toBe('low');
  expect((await snapshot(page)).settings.dayCycle).toBe(false);
  expect((await snapshot(page)).wanted).toBe(0);
  expect(errors).toEqual([]);
});

test('import, invalid input and confirmed reset preserve valid progress', async ({ page }) => {
  const errors = await boot(page);
  await page.locator('#welcome-settings').click();
  await page.locator('#save-file').setInputFiles({
    name: 'progress.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({version:1,cash:2400,completed:['harbor-run'],bestTimes:{'harbor-run':42},player:{x:8,z:174,yaw:Math.PI}})),
  });
  await expect.poll(async () => (await snapshot(page)).cash).toBe(2400);
  expect((await snapshot(page)).completed).toEqual(['harbor-run']);
  await page.locator('#save-file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{bad')});
  await expect(page.locator('#toasts')).toContainText('无法读取此存档');
  expect((await snapshot(page)).cash).toBe(2400);
  await page.locator('#reset-save').click();
  await page.locator('#cancel-reset').click();
  expect((await snapshot(page)).cash).toBe(2400);
  await page.locator('#reset-save').click();
  await page.locator('#confirm-reset').click();
  expect((await snapshot(page)).cash).toBe(1200);
  expect((await snapshot(page)).completed).toEqual([]);
  expect(errors).toEqual([]);
});

test('mobile touch controls move the player and fit the landscape viewport', async ({ browser }) => {
  const context = await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:5173');
  await expect(page.locator('#start')).toBeEnabled();
  await page.locator('#start').tap();
  await expect(page.locator('#touch-controls')).toBeVisible();
  const initial = await snapshot(page), rect = await page.locator('[data-hold="forward"]').boundingBox();
  await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);
  await page.mouse.down();
  try { await expect.poll(async () => (await snapshot(page)).position.z).toBeLessThan(initial.position.z-2); }
  finally { await page.mouse.up(); }
  await page.screenshot({path:'test-results/screenshots/05-mobile.png'});
  const layout = await page.evaluate(() => ({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
  expect(layout.scrollWidth).toBe(layout.width);
  await context.close();
});
