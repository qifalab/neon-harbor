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
const manifestRequestConcurrency = 4;
let browser;
let page;
let failure;

async function verifyBrowserAssetHashes(manifest) {
  const verified = [];
  for (const [pathname, result] of browserAssetBodies) {
    const relative = pathname === target.pathname ? 'index.html' : pathname.slice(target.pathname.length);
    if (!pathname.startsWith(target.pathname)) continue;
    expect(manifest.assets[relative], `Loaded asset is included in the release manifest: ${relative}`).toMatch(/^[a-f0-9]{64}$/);
    const { body, error } = await result;
    expect(error, `Read loaded asset ${relative}`).toBeUndefined();
    const sha256 = createHash('sha256').update(body).digest('hex');
    expect(sha256, `Deployed bytes match ${relative}`).toBe(manifest.assets[relative]);
    verified.push({ path: relative, sha256 });
  }
  return verified;
}

async function verifyManifestAssetHashes(request, manifest) {
  const entries = Object.entries(manifest.assets);
  expect(entries.length, 'The release manifest contains deployed files').toBeGreaterThan(0);
  const verified = [];
  report.fingerprints.manifestAssets = verified;
  report.fingerprints.manifestRequestConcurrency = manifestRequestConcurrency;
  let next = 0;
  const workers = Array.from({ length: Math.min(manifestRequestConcurrency, entries.length) }, async () => {
    while (next < entries.length) {
      const [path, expected] = entries[next++];
      expect(expected, `Manifest SHA-256 for ${path}`).toMatch(/^[a-f0-9]{64}$/);
      const assetURL = new URL(path, target);
      expect(assetURL.origin, `Published asset origin for ${path}`).toBe(target.origin);
      expect(assetURL.pathname.startsWith(target.pathname), `Published asset remains in the Pages directory: ${path}`).toBe(true);
      let response;
      try {
        response = await request.get(assetURL.href, { timeout: 30000 });
        expect(response.ok(), `Fetch published manifest asset ${path}: HTTP ${response.status()}`).toBe(true);
        const sha256 = createHash('sha256').update(await response.body()).digest('hex');
        expect(sha256, `All published bytes match ${path}`).toBe(expected);
        verified.push({ path, sha256, status: response.status() });
      } finally {
        // APIRequestContext retains response buffers until disposal. Release
        // every file before requesting another; at most four bodies are live.
        await response?.dispose();
      }
    }
  });
  const results = await Promise.allSettled(workers);
  const rejected = results.find(result => result.status === 'rejected');
  if (rejected) throw rejected.reason;
  expect(verified).toHaveLength(entries.length);
  verified.sort((a, b) => a.path.localeCompare(b.path));
  return verified;
}

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
  report.fingerprints = { initialBrowserAssets: await verifyBrowserAssetHashes(manifest) };
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
  await page.locator('#welcome-sample').click();
  await expect(page.locator('[data-sample-stop]')).toHaveCount(11);
  await expect(page.locator('[data-sample-shop]')).toHaveCount(3);
  const sample = (await page.evaluate(() => window.__NEON__.snapshot())).city.sample;
  expect(sample.life.residents).toBe(20);
  expect(sample.transit.vehicles).toHaveLength(5);
  expect(sample.transit.routes.map(route => route.kind).sort()).toEqual(['bus', 'ferry', 'tram']);
  expect(sample.life.totalGoods).toBe(sample.life.initialGoods);
  expect(sample.life.totalMoney).toBe(sample.life.initialMoney);
  report.sample = { residents: sample.life.residents, fleet: sample.transit.vehicles.length, shops: sample.life.shops.map(shop => shop.name) };
  await page.locator('#resume').click();
  report.checks.push('Public harbor menu exposes the real three-mode fleet, eleven stops and twenty persistent residents');
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
  const addresses = (await page.evaluate(() => window.__NEON__.snapshot())).city.buildings;
  expect(addresses.filter(building => !['south-expansion', 'east-expansion'].includes(building.district))).toHaveLength(48);
  expect(addresses.filter(building => building.district === 'south-expansion')).toHaveLength(96);
  expect(addresses.filter(building => building.district === 'east-expansion')).toHaveLength(76);
  await expect(page.locator('[data-building-id]')).toHaveCount(addresses.length);
  await expect(page.locator('[data-visit-landmark]')).toHaveCount(3);
  expect(addresses).toHaveLength(220);
  expect((await page.locator('[data-building-id]').evaluateAll(nodes => nodes.map(node => node.dataset.buildingId))).sort()).toEqual(addresses.map(building => building.id).sort());
  report.checks.push('Opened the city guide with all 48 northern, 96 old-quarter and 76 eastern addresses');
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
  expect(museum.stairs).toHaveLength(museum.totalFloors - 1);
  const publicFloors=(await page.evaluate(()=>window.__NEON__.snapshot())).city.buildings;
  for (const building of publicFloors) {
    expect(building.floors.length).toBeGreaterThanOrEqual(2);
    for (let index = 1; index < building.floors.length; index++) {
      const rise = building.floors[index].y - building.floors[index - 1].y;
      expect(rise).toBeGreaterThanOrEqual(3.7);
      expect(rise).toBeLessThanOrEqual(6.2001);
    }
    if (!building.shellId) {
      expect(building.floors[1].y).toBe(4.2);
      expect(building.floors[2].y).toBe(8.4);
    }
  }
  expect(museum.rooms.some(room => room.type === 'maritime')).toBe(true);
  report.northMuseum = { buildingId: museum.buildingId, floorId: museum.floorId, floorName: museum.floorName, rooms: museum.rooms.map(room => room.name), furnitureCount: museum.furnitureCount };
  await capture('live-north-museum.png');
  report.checks.push('Visited the north-shore museum through the guide and entered its furnished lobby using E');

  report.expansionInteriors = [];
  for (const id of ['south-001', 'east-001']) {
    const building = addresses.find(item => item.id === id);
    await page.locator('#explore-city').click();
    await page.locator(`[data-visit-building="${id}"]`).click();
    await expect(page.locator('#panel')).toBeHidden();
    await expect(page.locator('#interaction')).toContainText(`进入 ${building.name}`);
    await page.keyboard.press('e');
    await page.waitForFunction(id => window.__NEON__.snapshot().city.interior.buildingId === id, id);
    const inside = (await page.evaluate(() => window.__NEON__.snapshot())).city.interior;
    expect(inside.roomCount).toBe(building.compact ? 2 : 4);
    expect(inside.furnitureCount).toBeGreaterThan(0);
    expect(inside.activeFloors).toBe(Math.min(3, building.floors.length));
    expect(inside.totalFloors).toBe(building.floors.length);
    await capture(`live-${id}-lobby.png`);
    await expect(page.locator('#interaction')).toContainText('返回街道');
    await page.keyboard.press('e');
    await page.waitForFunction(() => window.__NEON__.snapshot().city.interior.buildingId === null);
    const outside = await page.evaluate(() => window.__NEON__.snapshot());
    expect(outside.position.y).toBeCloseTo(building.entrance.y || 0, 1);
    expect(outside.city.exterior).toEqual({ southInteriorId: null, harborInteriorId: null });
    expect(outside.city.harbor.hiddenShells).toBe(0);
    report.expansionInteriors.push({ id, rooms: inside.roomCount, floors: inside.totalFloors, groundY: outside.position.y });
  }
  report.checks.push('Entered and exited both a compact old-quarter lobby and an eastern lobby, restoring shells and supported ground');

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
  report.checks.push('Returned to the actual harbor promenade at High quality; all three shores have continuous storey schedules and the museum stair count matches the shipped catalog');
  report.fingerprints.finalBrowserAssets = await verifyBrowserAssetHashes(manifest);
  report.checks.push('All browser-loaded assets, including later streamed districts and interiors, match the release manifest');
  await verifyManifestAssetHashes(context.request, manifest);
  report.checks.push('Every file in the published release manifest responds successfully and matches its SHA-256');
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
