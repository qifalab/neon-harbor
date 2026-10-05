# ef92 multiplayer：首错独立只读核查

结论：真实功能 FAIL，不能归为 cleanup-only。job `111566877625` 原日志 48,004 bytes，SHA-256 `84655ce5f274f65680a943a215b3bd6ad37812916a4f26e3af063807eaf5859d` 与父 pin 精确一致。

原命令 `npx playwright test --config=playwright.multiplayer.config.js` 实际跑两个用例。首个 two independent browsers share room/walking/chat/disconnect 用例 passed；第二个 expanded east-bay addresses/elevator floors 用例 failed。汇总 **1 passed / 1 failed**，process exit **1**。

首个 primary error 是 `page.waitForFunction: Timeout 180000ms exceeded`，等待 `!window.__NEON__.snapshot().city.interior.moving`，RAF polling。调用链 `chooseStorey` → `tests/e2e/helpers/occupied.js:39:14`，调用方 `tests/multiplayer-browser/rooms.spec.js:208:5`。这证明该等待在 180 秒内未完成；单凭 job 日志不能断定真实电梯一直移动或超时的底层原因，需 root 所负责的 progress JSON / trace。

日志没有 browser/context/fixture cleanup secondary failure。之后的成功 artifact upload、正常 Post job cleanup / orphan-process cleanup 不改写前面的功能 FAIL，也不构成新的 cleanup error。

原日志记录失败证据 artifact 上传 11 files / 17,698,478 bytes，ID `11319935663`，ZIP digest `ce1d7bb4a814d2c3f6f91839727098f353d6089d4615911e4317d39d2485d305`。本子审没有下载或复核 artifact 内容；仅保留日志原值。已即时通知 /root 与父审查。

只读本地已完成原日志；未 API/download/tests/build/browser/GPU/Git/ref，未改 monitor 或 ROOT。详细原始行摘录、时间和 SHA 见独立 JSON。

JSON：`/tmp/neon-remote-ci-ef92-multiplayer-firstfail-readonly.json`，10104 bytes，SHA-256 `0368f88b71924d23fbd50c8633c6dc9212195eaf453481a3cffd82425dae604c`。
