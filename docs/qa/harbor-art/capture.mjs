import { chromium } from '@playwright/test';
import { createStaticServer } from '../../../tools/server.mjs';
import { writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root=new URL('../../../',import.meta.url).pathname;
const server=await createStaticServer({root});await new Promise(resolve=>server.listen(5196,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{await page.goto('http://127.0.0.1:5196/docs/qa/harbor-art/fixture.html',{timeout:180000});await page.waitForFunction(()=>window.ready&&window.fixture.art.snapshot().scannedMapsLoaded===6,{},{timeout:180000});
const captures=[];for(const view of['cafe','market','street','bakery']){await page.evaluate(v=>window.fixture.view(v),view);await page.screenshot({path:new URL(view+'-high-webgl.png',import.meta.url).pathname,timeout:180000});captures.push({view,screenshot:view+'-high-webgl.png',screenshotSha256:createHash('sha256').update(await readFile(new URL(view+'-high-webgl.png',import.meta.url))).digest('hex'),...await page.evaluate(()=>window.fixture.snapshot())});}
await writeFile(new URL('webgl-evidence.json',import.meta.url),JSON.stringify({browser:browser.version(),backend:'Chromium WebGL / SwiftShader',viewport:{width:1280,height:800},method:'Actual source modules; actual seeded world shells and walkable shop frontage positions. Separate inspectable fixture lighting; no performance claims from software FPS.',captures,errors},null,2)+'\n');if(errors.length)throw new Error(errors.join('\n'));}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
