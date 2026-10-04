/** Matched native room captures from the public v0.7 revision and this checkout.
 * npm ci && npx playwright install chromium
 * node tools/capture-furniture-comparison.mjs --output art-test-results/furniture-comparison
 * Optional: --baseline /path/to/v07 --baseline-ref <commit> --pose /path/to/pose.json
 * CHROMIUM_PATH selects a system Chromium. No runtime/game files are modified.
 */
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createStaticServer } from './server.mjs';
const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const options = { reference: 'a425667bd2fec0c81f482a89861c88c2acd2641e',
  output: resolve(projectRoot, 'art-test-results/furniture-comparison') };
const optionNames = { '--baseline': 'baseline', '--baseline-ref': 'reference', '--output': 'output', '--pose': 'pose' };
for (let index = 2; index < process.argv.length; index += 2) {
  const flag = process.argv[index], value = process.argv[index + 1];
  if (flag === '--help') {
    console.log('node tools/capture-furniture-comparison.mjs [--baseline PATH] [--baseline-ref COMMIT] [--output PATH] [--pose JSON]\nCHROMIUM_PATH selects an installed Chromium; default baseline is a temporary git archive of v0.7.');
    process.exit(0);
  }
  if (!optionNames[flag] || !value) throw new Error(`Unknown option or missing value: ${flag}`);
  options[optionNames[flag]] = value;
}
const artifact = resolve(options.output);
await mkdir(artifact, { recursive: true });
let baselineRoot = options.baseline && resolve(options.baseline);
if (!baselineRoot) {
  const temporary = await mkdtemp(join(tmpdir(), 'neon-harbor-v07-'));
  baselineRoot = join(temporary, 'source'); await mkdir(baselineRoot);
  const archive = join(temporary, 'baseline.tar');
  execFileSync('git', ['archive', '--format=tar', `--output=${archive}`, options.reference], { cwd: projectRoot });
  execFileSync('tar', ['-xf', archive, '-C', baselineRoot]);
}
const roots = { v07: baselineRoot, v08: projectRoot };
// A real gameplay camera recorded at the bedroom doorway; both versions use
// these exact numbers. Fixture cameras are not claimed as another gameplay run.
const defaultPose = { position: { x: -567.0000000000022, y: 4.2, z: -1032.756666666664, yaw: -1.5707963267948968 },
  camera: { position: { x: -567.0000000000022, y: 5.82, z: -1032.756666666664 },
    target: { x: -576.8628711812833, y: 5.82, z: -1034.4070520948155 }, fov: 65 }, hour: 16.5 };
const savedPose = options.pose ? JSON.parse(await readFile(resolve(options.pose), 'utf8')) : defaultPose;
const sha = text => createHash('sha256').update(text).digest('hex');
const commitAt = root => { try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); } catch { return null; } };
const servers = [];
const metadata = { createdAt: new Date().toISOString(), scenario: 'camellia-court/gallery/bedroom',
  method: 'Native WebGL rendering of each version’s createInteriorSystem and its own materials and room meshes. Exact recorded in-game camera, fixed atmosphere clock and lights; no image retouching.',
  limits: ['Controlled interior fixture: excludes the exterior city, player/HUD, residents and building reflection proxies.',
    'Both versions use the same sky-only environment and lamp/sun setup to isolate room geometry, materials and contact occlusion.',
    'This comparison does not measure full-city performance or establish AAA art quality.',
    'The v0.8 direct image isolates mesh/material changes from the added contact pass.'],
  script: fileURLToPath(import.meta.url), scriptSha256: sha(await readFile(fileURLToPath(import.meta.url))),
  viewport: { width: 640, height: 400, deviceScaleFactor: 1 }, requestedPose: savedPose,
  browser: { executable: process.env.CHROMIUM_PATH || 'Playwright Chromium', nodeVersion: process.version, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  variants: [] };
const browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), headless: true, args: metadata.browser.args });
metadata.browser.version = browser.version();
try {
  for (const version of ['v07', 'v08']) {
    const root = roots[version], server = await createStaticServer({ root });
    await new Promise(ok => server.listen(0, '127.0.0.1', ok)); servers.push(server);
    const origin = `http://127.0.0.1:${server.address().port}`;
    const page = await browser.newPage({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 1 });
    const errors = [], resources = new Set();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('response', response => { const path = new URL(response.url()).pathname;
      if (!path.startsWith('/__')) resources.add(path);
      if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${path}`); });
    await page.route('**/__room_fixture', route => route.fulfill({ contentType: 'text/html', body: '<body style="margin:0;overflow:hidden"><canvas style="display:block"></canvas></body>' }));
    await page.goto(`${origin}/__room_fixture`);
    const setup = await page.evaluate(async pose => {
      const T = await import('/vendor/three/three.module.js');
      const { createInteriorSystem } = await import('/src/metropolis-interiors.js');
      const { METROPOLIS_BUILDINGS } = await import('/src/metropolis-catalog.js');
      const { createAtmosphere } = await import('/src/atmosphere.js');
      window.textureLoadState = { pending: false, errors: [] };
      T.DefaultLoadingManager.onStart = () => { window.textureLoadState.pending = true; };
      T.DefaultLoadingManager.onLoad = () => { window.textureLoadState.pending = false; };
      T.DefaultLoadingManager.onError = url => window.textureLoadState.errors.push(url);
      const renderer = new T.WebGLRenderer({ canvas: document.querySelector('canvas'), antialias: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(1); renderer.setSize(640, 400);
      renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.ACESFilmicToneMapping;
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
      const scene = new T.Scene(); scene.fog = new T.FogExp2('#b9b3c1', .0016);
      const hemi = new T.HemisphereLight('#d0e1ff', '#67525d', 1.5), sun = new T.DirectionalLight('#ffd3a0', 1.4);
      sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
      Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, far: 400 });
      sun.shadow.normalBias = .12; scene.add(hemi, sun, sun.target);
      const atmosphere = createAtmosphere(T, renderer, scene);
      const building = METROPOLIS_BUILDINGS.find(item => item.id === 'camellia-court');
      const interiors = createInteriorSystem(T, scene);
      interiors.enter(building.id);
      const cabin = interiors.snapshot().cabin;
      let player = { x: cabin.x, z: cabin.z, y: 0, groundY: 0, yaw: 0 };
      interiors.interact(player); interiors.selectFloor('gallery');
      for (let i = 0; i < 60; i++) { interiors.update(.25, player); player.groundY = interiors.state.elevator.y; }
      player = { x: pose.position.x, z: pose.position.z, y: 0, groundY: pose.position.y, yaw: pose.position.yaw };
      interiors.update(0, player);
      const camera = new T.PerspectiveCamera(pose.camera.fov, 640 / 400, .15, 3200);
      camera.position.copy(pose.camera.position);
      camera.lookAt(pose.camera.target.x, pose.camera.target.y, pose.camera.target.z);
      sun.target.position.set(player.x, player.groundY, player.z);
      sun.position.copy(sun.target.position).add(new T.Vector3(-100, 95 + Math.sin((pose.hour - 6) / 12 * Math.PI) * 100, -65));
      sun.target.updateMatrixWorld(); atmosphere.update(pose.hour, { ...player, y: player.groundY }, hemi, sun);
      const lights = [];
      scene.traverse(node => { if (node.isLight) lights.push({ type: node.type, color: node.color.toArray(),
        groundColor: node.groundColor?.toArray() || null, intensity: node.intensity, position: node.position.toArray(),
        distance: node.distance ?? null, decay: node.decay ?? null, castShadow: node.castShadow }); });
      window.roomFixture = { T, renderer, scene, camera, interiors, atmosphere, effect: null };
      return { roomId: interiors.snapshot().currentRoomId, floorId: interiors.snapshot().floorId,
        room: interiors.snapshot().rooms.find(room => room.type === 'bedroom'),
        camera: { position: camera.position.toArray(), target: [pose.camera.target.x, pose.camera.target.y, pose.camera.target.z],
          fov: camera.fov, near: camera.near, far: camera.far, aspect: camera.aspect },
        lights, sunTarget: sun.target.position.toArray(), shadow: { mapSize: [2048, 2048], type: 'PCFSoftShadowMap', normalBias: .12 },
        hour: pose.hour, outputColorSpace: renderer.outputColorSpace, toneMapping: 'ACESFilmicToneMapping', pixelRatio: renderer.getPixelRatio(),
        exposure: renderer.toneMappingExposure, environmentIntensity: scene.environmentIntensity,
        fog: { color: scene.fog.color.toArray(), density: scene.fog.density }, threeRevision: T.REVISION };
    }, savedPose);
    await page.waitForFunction(() => !window.textureLoadState.pending, null, { timeout: 90000 });
    const modes = version === 'v07' ? ['direct'] : ['direct', 'contact'];
    for (const mode of modes) {
      const render = await page.evaluate(async mode => {
        const { T, renderer, scene, camera } = window.roomFixture;
        window.roomFixture.effect?.dispose(); window.roomFixture.effect = null;
        if (mode === 'direct') renderer.render(scene, camera);
        else {
          const { createContactOcclusion } = await import('/src/contact-occlusion.js');
          const effect = createContactOcclusion(T, renderer); effect.setQuality('high'); effect.render(scene, camera);
          window.roomFixture.effect = effect;
        }
        return { contact: window.roomFixture.effect?.snapshot() || { enabled: false },
          glError: renderer.getContext().getError(), canvasSamples: renderer.getContext().getParameter(renderer.getContext().SAMPLES), contextLost: renderer.getContext().isContextLost(),
          calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
          textureLoading: window.textureLoadState };
      }, mode);
      const file = `${version}-bedroom-${mode}.png`;
      await page.screenshot({ path: join(artifact, file), timeout: 90000 });
      const variant = { version, mode, image: file, imageSha256: sha(await readFile(join(artifact, file))),
        root, commit: commitAt(root), baselineReference: version === 'v07' ? options.reference : null,
        setup, render, errors: [...errors], resources: {} };
      for (const path of [...resources].sort()) {
        try { variant.resources[path] = sha(await readFile(join(root, path))); }
        catch { variant.resources[path] = 'unavailable'; }
      }
      metadata.variants.push(variant);
      console.log(JSON.stringify({ version, mode, file, errors, glError: render.glError, triangles: render.triangles }));
      await writeFile(join(artifact, 'metadata.json'), JSON.stringify(metadata, null, 2));
    }
    await page.close();
  }
  const [baseline, candidate] = [metadata.variants[0], metadata.variants.find(v => v.mode === 'contact')];
  metadata.conditionsMatch = ['camera', 'lights', 'sunTarget', 'shadow', 'hour', 'outputColorSpace', 'toneMapping', 'pixelRatio', 'exposure', 'environmentIntensity', 'fog']
    .every(key => JSON.stringify(baseline.setup[key]) === JSON.stringify(candidate.setup[key]));
  if (!metadata.conditionsMatch) throw new Error('Fixture lighting/camera conditions differ; inspect metadata before using comparison');
  if (metadata.variants.some(v => v.errors.length || v.render.glError || v.render.contextLost || v.render.textureLoading.errors.length))
    throw new Error('Capture encountered a graphics/resource error; inspect metadata');
  await writeFile(join(artifact, 'metadata.json'), JSON.stringify(metadata, null, 2));
} finally { await browser.close(); for (const server of servers) await new Promise(ok => server.close(ok)); }
