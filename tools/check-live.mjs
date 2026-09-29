import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const rawURL = process.argv[2];
if (!rawURL) throw new Error('Usage: node tools/check-live.mjs <deployed-site-url>');
const target = new URL(rawURL);
if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) {
  throw new Error('The deployed site must be an HTTP(S) URL without embedded credentials');
}
// Relative module URLs must keep the Pages project directory, including its slash.
if (!target.pathname.endsWith('/')) target.pathname += '/';
// Evidence encoding can be slow on shared software-rendering runners.
// Keep interaction deadlines at 20 seconds and give screenshots their own budget.
const screenshotTimeout = process.env.CI ? 60000 : 20000;
// Keep the shipped high-quality renderer; reduce only screenshot pixel work
// on CI's software GPU. Local visual review retains the original resolution.
const highViewport = process.env.CI ? { width: 800, height: 500 } : { width: 1280, height: 800 };
const interactionViewport = process.env.CI ? highViewport : { width: 960, height: 600 };
const output = resolve('test-results/live-smoke');
await mkdir(output, { recursive: true });
const report = { url: target.href, success: false, checks: [], errors: [], assets: [] };
const loadedAssets = new Set();
const browserAssetBodies = new Map();
let browser;
let page;
let failure;

// Chromium's software compositor can miss the first capture while compiling
// the full-resolution scene. Retry only capture timeouts, record both attempts,
// and still require the real PNG; gameplay/assertion failures are never retried.
async function capture(name) {
  report.captures ??= [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const started = Date.now();
    const viewport = page.viewportSize();
    try {
      await page.screenshot({ path: resolve(output, name), timeout: screenshotTimeout });
      report.captures.push({ name, attempt, viewport, durationMs: Date.now() - started, success: true });
      return;
    } catch (error) {
      report.captures.push({ name, attempt, viewport, durationMs: Date.now() - started, success: false, error: error.message });
      if (attempt === 2 || error.name !== 'TimeoutError') throw error;
    }
  }
}

try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  report.browser = browser.version();
  const context = await browser.newContext({
    viewport: highViewport,
    extraHTTPHeaders: { 'Cache-Control': 'no-cache' },
  });
  page = await context.newPage();
  report.viewport = page.viewportSize();
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => report.errors.push(`Page error: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') report.errors.push(`Console error: ${message.text()}`);
  });
  page.on('requestfailed', request => {
    report.errors.push(`Request failed: ${request.url()} (${request.failure()?.errorText})`);
  });
  page.on('response', response => {
    const item = { url: response.url(), status: response.status() };
    report.assets.push(item);
    if (response.status() >= 400) report.errors.push(`HTTP ${response.status()}: ${response.url()}`);
    if (response.ok()) {
      const pathname = new URL(response.url()).pathname;
      loadedAssets.add(pathname);
      // Read the bytes this browser actually rendered, rather than independently
      // fetching a potentially different cached copy of each runtime module.
      browserAssetBodies.set(pathname, response.body().then(body => ({ body }), error => ({ error: error.message })));
    }
  });

  const response = await page.goto(target.href, { waitUntil: 'load', timeout: 30000 });
  expect(response?.ok(), 'The deployed entry page responds successfully').toBe(true);
  await expect(page.locator('#start')).toBeEnabled({ timeout: 20000 });
  await expect(page.locator('#loading')).toBeHidden();
  await page.waitForFunction(() => window.__NEON__?.snapshot().ready, null, { timeout: 20000 });

  // Validate the actual subpath asset requests made by the browser. Successful
  // HTML alone would miss a Pages base-path, MIME or ES-module deployment error.
  for (const asset of ['styles.css', 'src/main.js', 'src/world.js', 'src/simulation.js',
    'src/audio.js', 'vendor/three/three.module.js', 'vendor/three/three.core.min.js']) {
    const pathname = new URL(asset, target).pathname;
    expect(loadedAssets.has(pathname), `Loaded deployed asset ${pathname}`).toBe(true);
  }
  report.checks.push('Entry page and all required CSS/ES-module assets loaded');

  const manifestResponse = await context.request.get(new URL('build-info.json', target).href);
  expect(manifestResponse.ok(), 'The deployment has a build manifest').toBe(true);
  const manifest = await manifestResponse.json();
  report.build = { version: manifest.version, revision: manifest.revision };
  if (process.env.EXPECTED_REVISION) expect(manifest.revision, 'The public site serves this release').toBe(process.env.EXPECTED_REVISION);
  for (const [pathname, result] of browserAssetBodies) {
    const relative = pathname === target.pathname ? 'index.html' : pathname.slice(target.pathname.length);
    if (!pathname.startsWith(target.pathname)) continue;
    expect(manifest.assets[relative], `Loaded asset is included in the release manifest: ${relative}`).toMatch(/^[a-f0-9]{64}$/);
    const { body, error } = await result;
    expect(error, `Read loaded asset ${relative}`).toBeUndefined();
    expect(createHash('sha256').update(body).digest('hex'), `Deployed bytes match ${relative}`).toBe(manifest.assets[relative]);
  }
  report.checks.push('Public revision and browser-loaded asset hashes match the release manifest');

  const initial = await page.evaluate(() => window.__NEON__.snapshot());
  expect(initial.renderer.calls).toBeGreaterThan(0);
  expect(initial.renderer.triangles).toBeGreaterThan(0);
  report.renderer = await page.evaluate(() => {
    const gl = document.querySelector('#game').getContext('webgl2');
    return gl ? { version: gl.getParameter(gl.VERSION), lost: gl.isContextLost() } : null;
  });
  expect(report.renderer?.version).toContain('WebGL 2');
  expect(report.renderer?.lost).toBe(false);
  report.checks.push('Actual WebGL 2 context and nonempty Three.js draw calls');

  expect(initial.settings.quality, 'A fresh browser defaults to high quality').toBe('high');
  expect(initial.streaming?.ready, 'Nearby districts are fully streamed before entry').toBe(true);
  expect(initial.streaming?.loaded).toBeGreaterThan(0);
  report.initialStreaming = initial.streaming;
  await capture('live-high-quality-menu.png');
  report.checks.push('Default high quality and nearby streamed city data are ready');

  // CI uses software rendering. Select the shipped quality control through the
  // UI; do not bypass startup, mutate the game or fake the renderer.
  await page.setViewportSize(interactionViewport);
  await page.locator('#welcome-settings').click();
  await page.locator('#quality').selectOption('low');
  await page.locator('#resume').click();
  await page.locator('#harbor-start').click();
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#game')).toBeFocused();
  expect((await page.evaluate(() => window.__NEON__.snapshot())).started).toBe(true);
  const harborStart=await page.evaluate(()=>window.__NEON__.snapshot());
  expect(harborStart.city.harbor.permanentTowers).toBeGreaterThanOrEqual(40);
  expect(Math.abs(harborStart.position.x-285.5)).toBeLessThan(1);
  expect(harborStart.settings.firstPerson).toBe(true);
  report.harbor=harborStart.city.harbor;
  report.checks.push('Entered the playable promenade through the primary harbor button with the rendered opposite-shore skyline');

  await page.locator('#jobs').click();
  await expect(page.locator('#panel')).toBeVisible();
  await expect(page.locator('[data-mission]')).toHaveCount(3);
  expect((await page.evaluate(() => window.__NEON__.snapshot())).paused).toBe(true);
  await page.locator('#close-panel').click();
  await expect(page.locator('#panel')).toBeHidden();
  expect((await page.evaluate(() => window.__NEON__.snapshot())).paused).toBe(false);
  report.checks.push('Opened and closed the mission menu with three missions');

  await page.locator('#map-button').click();
  await expect(page.locator('#city-map')).toBeVisible();
  expect((await page.evaluate(() => window.__NEON__.snapshot())).paused).toBe(true);
  await capture('live-city-map.png');
  await page.keyboard.press('Escape');
  await expect(page.locator('#panel')).toBeHidden();
  await expect(page.locator('#game')).toBeFocused();
  expect((await page.evaluate(() => window.__NEON__.snapshot())).paused).toBe(false);
  report.checks.push('Opened the city map and resumed using Escape');

  await capture('live-game.png');

  // Visit the north shore with the public guide, then enter a real furnished
  // lobby using the normal interaction key. Snapshot access is read-only.
  await page.locator('#explore-city').click();
  await expect(page.locator('#atlas-results')).toBeVisible();
  await expect(page.locator('[data-building-id]')).toHaveCount(48);
  await expect(page.locator('[data-visit-landmark]')).toHaveCount(3);
  expect((await page.evaluate(() => window.__NEON__.snapshot())).city.buildings).toHaveLength(48);
  report.checks.push('Opened the city guide with all 48 north-shore addresses');
  await page.locator('[data-visit-building="tide-museum"]').click();
  await expect(page.locator('#panel')).toBeHidden();
  await expect(page.locator('#game')).toBeFocused();
  await page.keyboard.press('e');
  await page.waitForFunction(() => window.__NEON__.snapshot().city.interior.buildingId === 'tide-museum');
  const museum = (await page.evaluate(() => window.__NEON__.snapshot())).city.interior;
  expect(museum.buildingId).toBe('tide-museum');
  expect(museum.floorId).toBe('lobby');
  expect(museum.furnitureCount).toBeGreaterThan(12);
  expect(museum.roomCount).toBe(4);
  expect(museum.activeFloors).toBe(3);
  expect(museum.stairs).toHaveLength(2);
  const publicFloors=(await page.evaluate(()=>window.__NEON__.snapshot())).city.buildings;
  expect(publicFloors.every(b=>b.floors.length===4&&b.floors[1].y===4.2&&b.floors[2].y===8.4)).toBe(true);
  expect(museum.rooms.some(room => room.type === 'maritime')).toBe(true);
  report.northMuseum = { buildingId: museum.buildingId, floorId: museum.floorId, floorName: museum.floorName, rooms: museum.rooms.map(room => room.name), furnitureCount: museum.furnitureCount };
  await capture('live-north-museum.png');
  report.checks.push('Visited the north-shore museum through the guide and entered its furnished lobby using E');

  await page.keyboard.press('Escape');
  await page.locator('[data-tab="settings"]').click();
  await page.locator('#quality').selectOption('high');
  await page.locator('#resume').click();
  await page.setViewportSize(highViewport);
  await page.waitForFunction(() => window.__NEON__.snapshot().settings.quality === 'high');
  if(!(await page.evaluate(()=>window.__NEON__.snapshot())).settings.firstPerson)await page.keyboard.press('v');
  await page.waitForFunction(() => window.__NEON__.snapshot().settings.firstPerson && window.__NEON__.snapshot().camera?.boomLength === 0);
  report.checks.push('Verified authored maritime rooms, three infrastructure entrances and eye-level walking view');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await capture('live-high-quality-game.png');
  await page.locator('#explore-city').click();
  await page.locator('[data-visit-viewpoint="victoria-panorama"]').click();
  await expect(page.locator('#panel')).toBeHidden();
  await page.waitForFunction(()=>Math.abs(window.__NEON__.snapshot().position.x-285.5)<1);
  await capture('live-high-quality-harbor.png');
  report.checks.push('Returned to the actual harbor promenade at High quality; four public floors and two physical stair flights per north-shore building are present');
  expect(report.errors, 'No page, console, network or HTTP resource errors').toEqual([]);
  report.success = true;
} catch (error) {
  failure = error;
  report.errors.push(error.message);
  if (page && !page.isClosed()) {
    try {
      await capture('live-failure.png');
    } catch (captureError) {
      report.errors.push(`Failure screenshot unavailable: ${captureError.message}`);
    }
  }
} finally {
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await browser?.close();
}

if (failure) {
  console.error(`Live deployment smoke failed: ${failure.message}`);
  process.exitCode = 1;
} else {
  console.log(`Live deployment smoke passed: ${target.href}`);
  console.log(`${report.checks.length} checks; screenshots and report: ${output}`);
}
