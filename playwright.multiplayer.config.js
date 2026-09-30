import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests/multiplayer-browser',workers:1,timeout:420000,expect:{timeout:30000},
  outputDir:'multiplayer-test-results',reporter:[['list']],
  use:{baseURL:'http://127.0.0.1:5180',viewport:{width:640,height:400},screenshot:'only-on-failure',trace:'retain-on-failure',launchOptions:{...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']}},
  webServer:{command:'node tools/multiplayer-server.mjs',url:'http://127.0.0.1:5180/api/health',timeout:15000,reuseExistingServer:false},
});
