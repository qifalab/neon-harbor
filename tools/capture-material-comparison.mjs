import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, basename } from 'node:path';
import { createStaticServer } from './server.mjs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2), options = {};
const usage = 'Usage: node tools/capture-material-comparison.mjs [--output DIR] [--baseline GIT_REVISION] [--port 5199]';
if (args.includes('--help')) { console.log(usage); process.exit(0); }
for (let i = 0; i < args.length; i += 2) {
  if (!['--output', '--baseline', '--port'].includes(args[i]) || !args[i + 1]) throw new Error(usage);
  options[args[i].slice(2)] = args[i + 1];
}
const output = resolve(root, options.output || 'test-results/material-comparison');
const port = Number(options.port || 5199);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid HTTP port');
await mkdir(output, { recursive: true });
// The published v0.7 baseline is intentional. Override only to compare another
// known revision; metadata records the resolved immutable commit identifier.
const baselineRef = options.baseline || 'a425667bd2fec0c81f482a89861c88c2acd2641e';
const baselineCommit = execFileSync('git', ['rev-parse', '--verify', `${baselineRef}^{commit}`],
  { cwd: root, encoding: 'utf8' }).trim();
const baseline = execFileSync('git', ['show', `${baselineCommit}:src/models.js`], { cwd: root, encoding: 'utf8' })
  .replace("'./world-config.js'", "'/baseline-world-config.js'");
const baselineDimensions = execFileSync('git', ['show', `${baselineCommit}:src/world-config.js`], { cwd: root, encoding: 'utf8' });
const server = await createStaticServer({ root });
await new Promise((resolveReady, reject) => {
  server.once('error', reject); server.listen(port, '127.0.0.1', resolveReady);
});
let browser;
const errors = [], screenshots = [], renders = [];
try {
  browser = await chromium.launch({ headless: true,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/material-comparison', route => route.fulfill({ contentType: 'text/html',
    body: '<html><body style="margin:0"></body></html>' }));
  await page.route('**/baseline-models.js', route => route.fulfill({ contentType: 'text/javascript', body: baseline }));
  await page.route('**/baseline-world-config.js', route => route.fulfill({ contentType: 'text/javascript', body: baselineDimensions }));
  await page.goto(`http://127.0.0.1:${port}/material-comparison`);
  await page.evaluate(async () => {
    const T = await import('/vendor/three/three.module.js');
    const models = [await import('/baseline-models.js'), await import('/src/models.js')];
    const renderer = new T.WebGLRenderer({ antialias: true });
    renderer.setSize(1280, 800); renderer.setPixelRatio(1);
    renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = .9;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    document.body.append(renderer.domElement);
    const scene = new T.Scene(); scene.background = new T.Color('#b8cbd5');
    scene.add(new T.HemisphereLight('#e4edf7', '#756858', 1.6));
    const sun = new T.DirectionalLight('#fff0d6', 3.1);
    sun.position.set(-7, 12, 8); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: .1, far: 50 });
    sun.shadow.normalBias = .025; scene.add(sun);
    const ground = new T.Mesh(new T.PlaneGeometry(120, 120), new T.MeshStandardMaterial({ color: '#8c8d89', roughness: .9 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    // One fixed daylight proxy street provides the same non-sky reflections to
    // both versions. This controlled art fixture is not an in-game screenshot.
    const reflection = new T.Scene(); reflection.background = new T.Color('#b8cbd5');
    const floor = new T.Mesh(new T.PlaneGeometry(300, 300), new T.MeshBasicMaterial({ color: '#656765' }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -1; reflection.add(floor);
    for (const [x, z, width, height, depth, color] of [
      [-13, -8, 9, 26, 12, '#b5b7b0'], [16, -5, 10, 18, 15, '#637b88'],
      [-20, 20, 11, 35, 8, '#a2a39c'], [5, -28, 11, 32, 9, '#7d929b'],
    ]) {
      const facade = new T.Mesh(new T.BoxGeometry(width, height, depth), new T.MeshBasicMaterial({ color }));
      facade.position.set(x, height / 2, z); reflection.add(facade);
      for (let y = 3; y < height - 2; y += 3) {
        const windows = new T.Mesh(new T.BoxGeometry(width + .02, 1.4, depth + .02),
          new T.MeshBasicMaterial({ color: '#334959' })); windows.position.set(x, y, z); reflection.add(windows);
      }
    }
    const pmrem = new T.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(reflection, .03, .1, 500).texture;
    const camera = new T.PerspectiveCamera(42, 1280 / 800, .1, 200);
    window.comparison = { T, renderer, scene, camera, models, model: null };
  });
  const views = {
    car: { position: [5.8, 2.6, 6.6], target: [0, .75, 0], kind: 'car' },
    'car-paint-closeup': { position: [2.3, 1.25, 3.6], target: [0, .85, 1.1], kind: 'car' },
    character: { position: [.6, 1.68, 1.4], target: [0, 1.35, 0], kind: 'character' },
    'character-walking': { position: [2, 1.8, 3], target: [0, .95, 0], kind: 'character',
      pose: { leftArm: .4, rightArm: -.4, leftElbow: -.45, rightElbow: -.15,
        leftLeg: .3, rightLeg: -.3, leftKnee: .05, rightKnee: .5 } },
  };
  for (const [view, setup] of Object.entries(views)) for (let version = 0; version < 2; version++) {
    const info = await page.evaluate(async ({ version, setup }) => {
      const p = window.comparison;
      if (p.model) p.scene.remove(p.model);
      p.model = setup.kind === 'car' ? p.models[version].createCar(p.T, '#375b68', 'sport')
        : p.models[version].createCharacter(p.T, { style: 'architect' });
      for (const [joint, angle] of Object.entries(setup.pose || {})) p.model.userData[joint].rotation.x = angle;
      p.scene.add(p.model); p.camera.position.set(...setup.position); p.camera.lookAt(...setup.target);
      await p.renderer.compileAsync(p.scene, p.camera); p.renderer.render(p.scene, p.camera);
      return { calls: p.renderer.info.render.calls, triangles: p.renderer.info.render.triangles,
        programs: p.renderer.info.programs.length };
    }, { version, setup });
    const filename = `${output}/v0${version ? 8 : 7}-${view}.png`;
    await page.screenshot({ path: filename }); screenshots.push(basename(filename)); renders.push({ view, version: version ? '0.8' : '0.7', ...info });
  }
  const sha256 = data => createHash('sha256').update(data).digest('hex');
  const metadata = {
    generatedAt: new Date().toISOString(), baselineCommit,
    reproductionTool: 'tools/capture-material-comparison.mjs',
    note: 'Controlled WebGL art fixture, same viewport, camera, light and street-reflection proxy for both versions. Not gameplay acceptance or hardware FPS evidence.',
    viewport: [1280, 800], devicePixelRatio: 1, views,
    lighting: { sun: [-7, 12, 8], sunIntensity: 3.1, hemisphereIntensity: 1.6, exposure: .9,
      toneMapping: 'ACESFilmic', environment: 'same fixed daylight street proxies', shadows: 'PCFSoft 2048' },
    car: { type: 'sport', paint: '#375b68' }, character: { style: 'architect' },
    sourceHashes: { models: sha256(await readFile(`${root}/src/models.js`)),
      surfaceFinish: sha256(await readFile(`${root}/src/surface-finish.js`)) },
    screenshots, renders, errors,
  };
  await writeFile(`${output}/metadata.json`, JSON.stringify(metadata, null, 2));
  console.log(JSON.stringify({ output, screenshots, errors }));
  if (errors.length) process.exitCode = 1;
} finally {
  await browser?.close(); await new Promise(resolveClosed => server.close(resolveClosed));
}
