# D2 ferry 原证据只读诊断

结论：本次首要失败是整个 ferry case 的 900000 ms 超时。真实 trace 将超时发生时的等待定位在 `walkLocal` 的 `page.mouse.move`，`tests/e2e/harbor-sample.spec.js:107`，由 lower route 的 line 179 调用。末段存在持续真实位移，不能把它描述成 150 s 局部无进展超时、95.6 s 单个 await 卡死、随机 flaky，或已经证实的产品碰撞故障。外层 line 183 的 `mouse.up: ... closed` 是清理次生错误，覆盖了原本应输出的 helper 错误与诊断。

这是一份诊断和未执行的方法候选说明，不是修复验证或 PASS。未运行测试、build、浏览器或 GPU；未修改 ROOT/source/index/ref/旧 QA；未 rerun/cancel/dispatch。所有派生物只写 `/tmp`。

## 身份与原证据

- D2 actual run `37237505203`，head `7a90f7934b7c9d1af5c4494bf08c4ec337c373e4`，feature `codex/traffic-and-multiplayer`，attempt 1；失败 job `111539469766`。required 最终 11 success / 1 failure，2 PR-only skipped 不计 passed。
- ROOT 与本地 tour 仍是 D `0c746b6d1d5a8c1af8be8242982f3d378e564231`；不把远程 D2 当成本地 tour 的被测版本。
- D2 完整原 log：`/workspace/scratch/neon-harbor/docs/qa/final-asset-freeze/remote-feature-ci-D2/logs/job-111539469766-original.log`，182955 bytes / 2390 lines，SHA256 `fadb7633aa3995494463fd3a081db865c114b0fbe6f5f55f53f6920ca6105bb8`。
- D 成功原 log：`/workspace/scratch/neon-harbor/docs/qa/final-asset-freeze/remote-feature-ci/logs/job-111532676168-original.log`，179539 bytes / 2357 lines，SHA256 `e47b85d487c4e3400882fe4e58c51d45c12265d74083b088acd2a3309893f255`。
- 原 failure trace：`/workspace/scratch/neon-harbor/docs/qa/final-asset-freeze/remote-feature-ci-D2/artifacts/ferry-failure-original/trace.zip`，18392627 bytes，SHA256 `cddf152efe2300116c2661470b6d6e5eb6f81c582b81910b3ac55d691b9b529f`，已实际读取 ZIP 内 `test.trace`、`0-trace.trace` 和 3 张原 screencast JPEG。
- D2 原 commit response 仅有 `tests/e2e/stability.spec.js` 变更，父提交为 D。ROOT ferry 文件、private bare 中 D2 ferry blob、trace 内 `resources/src@27bbc15740cda4074d80180c6d8ee429a14bfb04.txt` 三者逐字节相同；SHA256 均为 `3df001c6b62c1db31a1da746999ed183048dc7e56aae836b8d4cad2fab771ec9`。
- 派生原记录索引、逐 call 参数/结果和两次日志的全部 ferry stages 位于 `/tmp/neon-ferry-d2-readonly-evidence.json`；解析程序 `/tmp/neon-ferry-readonly-d2-diagnose.py` 全量读取两个原 log，不写原证据。

## 超时与具体 await 的边界

1. D2 原 log line 2300 最后正常 stage 为 `22:06:08.4374151Z`，完成倒数第二个 lower target `{x:0,z:-7.2,y:1.3}`，实际 `{x:0.005593842678165364,y:1.3,z:-7.212945129234142}`，simulation time `109.66666666666173`。
2. 下一项是 line 178 的 `door.inside`，当前模型值 `{x:-2.7,y:1.3,z:-7.2}`。该项 line 179 的 `precision` 为 true，真实 `Z + d` 输入以 .3 m/s 的慢走速度接近目标，开始距离 2.705625 m。
3. runner trace 首个 `type:error / Test timeout of 900000ms exceeded` 记录插在 `pw:api@2519` 的 `Mouse move` 开始与 `hook@2520 / After Hooks` 开始之间；对应 line 107，鼠标 `{x:-1077.4564411633435,y:96}`。该 timeout event 本身无 timestamp，因此精确可证区间是 monotonic `901006.005–902567.348 ms`，即最后 stage 后 `64.813951–66.375294 s`。
4. `pw:api@2519` 后来在 `902838.691 ms` 完成。测试函数在 After Hooks 已开始后又完成了 yaw 等待、按键位移、松键和一次 cabinMotion。这些后续进展属于超时后的异步执行，不应拿来扩大活跃 case 的可用预算。
5. 最后 rejected await 是 `pw:api@2530` / library `call@3769` 的 line 107 `Mouse move`，开始 `906722.025 ms`，结束 `909145.143 ms`，约 2.423118 s；参数 `{x:-1108.8916421247548,y:96}`，明确错误 `mouse.move: Test timeout of 900000ms exceeded`，stack 为 line 107 → 179。
6. `Close context` 因 Test timeout 开始于 `909134.347 ms`；接着 line 183 的 `Mouse up` 在 `909145.916–909150.726 ms` 报 closed-page。它是本次实际出现的次生清理错误。
7. 原 log 的失败 marker 在 `22:07:44.0517913Z`，距最后 stage 95.614376 s。这包含 after-hooks、context/browser 清理及 reporter 时间，不能将整段都归到一个 mouseMove 或没有移动。worker browser cleanup 的 trace 区间 `909176.511–930735.397 ms` 已占约 21.559 s。

末次超时前已完成 pose 是 `{x:-0.8597537954221506,y:1.3,z:-7.270495777242212}`, time `114.99999999999476`。After Hooks 中末次成功 cabinMotion 是 `{x:-0.9344519449664149,y:1.3,z:-7.277021003659139}`, time `115.49999999999473`；distance-to-goal 仍为 1.767227 m，deck lower / teleportRevision 3，车辆仍行进、doorsOpen false、nextStop north。

## 最后一段每个真实输入 cycle

下面 11 个 cycle 都成功等待到位移并松开 `d` 与 `z`。第 11 个在首个全局 timeout 后完成；不能作为未超时通过的证据。列中的总耗时包含相邻 pose 的全部控制调用，simulation delta 也包含松键时的真实时钟进展，不能等同于按住方向键的模拟时长。

| cycle | 相邻 pose 间 wall s | 实际位移 m | Δsimulation s | mouseMove s | yaw wait s | position wait s | 最终 local x |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | 5.895 | .074967 | .500 | 3.080 | .017 | 2.729 | -.068619 |
| 2 | 11.299 | .129868 | .683 | 5.005 | 3.416 | 2.673 | -.196156 |
| 3 | 5.396 | .074993 | .500 | 2.507 | .005 | 2.832 | -.270664 |
| 4 | 5.543 | .075000 | .500 | 2.777 | .005 | 2.703 | -.345659 |
| 5 | 2.826 | .140000 | .900 | 1.454 | .006 | .990 | -.485644 |
| 6 | 5.305 | .075000 | .250 | 5.007 | .010 | .215 | -.560641 |
| 7 | 7.383 | .075000 | .500 | 2.699 | .006 | 4.613 | -.635627 |
| 8 | 6.811 | .074985 | .500 | 1.063 | .005 | 5.693 | -.710450 |
| 9 | 5.744 | .074982 | .500 | 2.854 | .004 | 2.835 | -.785110 |
| 10 | 8.598 | .074981 | .500 | 5.005 | .707 | 2.830 | -.859754 |
| 11 | 5.714 | .074983 | .500 | 1.830 | .008 | 3.804 | -.934452 |

- 9 / 11 cycle 仅进展约 .075 m；11 个已完成 cycle 合计约 .94 m。
- 11 次完成 mouseMove 共 33.282160 s，最大 5.007363 s；11 个位移 RAF 共 31.917298 s，最大 5.692722 s；11 个 yaw RAF 共 4.189595 s。yaw 的大部分等待很短，不能把所有成本称作“相机 easing”。
- 11 个 cabinMotion evaluate 共 .048390 s；键 down 共 .057543 s，键 up 共 .387757 s。该尾段实际瓶颈不是 snapshot 序列化的记录值。
- position wait 从剩余局部 timeout `146864 ms` 递减到 `83338 ms`，全部成功。未观察到局部 150 s deadline assertion、局部等待 timeout、1800 次上限或 .06 m endpoint assertion 触发。
- `src/harbor-transit.js:303` 给慢走速度 .3 m/s，单步 dt 上限 .25 s；.075 m 恰好对应一个最大步的慢走距离。`.009 m` predicate 会在首次实际小位移后就退出，随后再次付出昂贵真实 mouse/RAF 调用；这是有原 trace 支撑的控制粒度问题假设，不等于已经证明产品或方法的全部因果。

## 与 D 同 case 的原始时序比较

| 阶段 | D wall s | D2 wall s | 注释 |
|---|---:|---:|---|
| boarded → 最后 upper waypoint | 267.779 | 369.695 | 相同 route /源码；模拟时钟约 49–50 s 的进展 |
| 最后 upper → 第一个 lower waypoint | 115.632 | 144.329 | 包括 High 采证、回 Low、重新持 pointer 和第一项 lower 移动；不可全部归为 screenshot |
| 第一 lower → 门前 central aisle | 173.992 | 252.051 | D 到 x0/z-7.2 时仍未走最后侧向门口段 |
| boarded → 门前 central aisle | 557.403 | 766.076 | D2 已累计多 208.672 s；此前对约244 s 的粗略口头估计由本表纠正 |
| central aisle → door.inside | 112.985 | 未完成 | D 实际到 x-2.748729/y1.3/z-7.197452，time123.95；不是假想可达路径 |
| door.inside → alighted | 7.818 | 未执行到 | D north 成功下船，time124.2 |
| reporter case total | 12.3m | 15.1m FAIL | 原 reporter 四舍五入，不当作精确 timing |

D 的同路径真实 success 显示最后侧向 2.7 m 可以到达且满足原 .06 m endpoint；它本身用了 112.985 s。D2 进入该段时整体预算已不足以再支付相同尾段开销。单次 D success 不足以推断未来稳定性，也不将 D2 归类为 flaky。没有 D success 的 trace，不能虚构其输入次数或每调用耗时。

D2 实际 High screenshot 的 library call 用时 26.522276 s（runner step 26.706140 s），在本次 90 s screenshot limit 内完成；不是最终正在阻塞的 await。其他 High/Low UI 操作和实际移动也占用 whole-case 时间。

## case 计时与耦合/硬编码逐条审阅

- file `test.setTimeout(600000)`，ferry scenario 单独 `900000`；配置 workers 1，512×320 viewport，真实 CI Chromium 启动参数含 SwiftShader。未取得 CPU/renderer profiling，不能指定硬件或资源调度为根因。
- boot 的 start 最多90 s；publicStart panel60 s；ferry 入码头 walkAxis120 s；boarding arrival180 s；cabinPointer15 s；每个 walkLocal150 s /最多1800轮；每次 yaw wait≤15 s且受local deadline约束；High screenshot90 s；下船前arrival180 s。这些逐项限制均不意味着总和仍落在whole900 s里。
- walkLocal 的循环 wall deadline 在每轮开头检查，yaw/position等待显式取 remaining；mouseMove、keyboard、evaluate 没有自己受 remaining约束的局部调用选项，仍受 Playwright whole test timeout约束。这是计时覆盖范围事实，不说明本次150 s已经越界。
- route选 `layout.stairs[0]` / `layout.doors[0]`，stop选首个同kind，central aisle `x:0`，楼梯中点用 start/end 平均，返回时固定回原door。现实现 `HarborTransitService` constructor line137 本身也给各stop选doors[0]，所以本次固定port door和实际stop配置一致；未来多door/布局变化可能使该耦合失效，原trace不能证明这是本次失败原因。
- ferry模型固定 lower1.3/upper3.7、stair x1.78/bottom z5.57/top z.61、port inside x-2.7/z-7.2。case用layout导出的坐标，仍手工拼装 route，而非遍历动态无障碍路径。
- 输入 steering 的 .005/sensitivity与 `src/main.js:131` 目前一致；pointer 从 viewport .86/.30 起步后累计到负 x（末尾 -1108.89）。当前 main.js pointerdown setPointerCapture，所以越出viewport本身不是失去drag的证据；全部已完成 yaw predicate 成功，不能断言此处 pointer丢失。
- precision = `kind !== ferry || target.x !== 0`：最后door.inside x≠0，始终按Z精走；central aisle x0仅在距离<1.2 m时才慢走。这是可核对的控制政策。
- 原 `.06 m`二维 endpoint、`.15 m`高度、teleportRevision不变、physical route/no clock-position writes 均应保留；不降低阈值、不替换实际输入、不改变产品 collision/body。

## 清理遮蔽首错风险

1. 本次实际：outer lower route `finally { await page.mouse.up(); }`（line183）在关闭page上抛错，替代 walkLocal 的原 timeout rejection /附加 samples诊断。上楼块 line167同样有此结构。
2. latent：walkLocal line122 的 key-up如果抛错，会替代 position wait的原异常；第一个 `up(key)` 抛错时后面的 `up('z')`不会执行。
3. latent：line115–116 的两个 key-down在内层try外，第二个down失败时可能没有对应慢走键释放尝试。
4. 正确候选需要保存第一个真实错误，并分别尝试每个release；release错误附为secondary。即使改了cleanup，它也只改善失败证据，不能把本次失败变成PASS。

## 可验证假设与仅 /tmp 方法候选

优先假设：在Z精走远离endpoint时，每次首次微位移就松键、再重新steer，导致昂贵协议/渲染周期被反复支付。trace显示11 cycle / .94 m和33.282 s mouseMove，足以提出批量真实位移控制候选；仍需实际验证才能称修复。补充假设是移动船体改变vehicle yaw使频繁重新steer必要，放大该方法成本；trace vehicle yaw确实变化，但无法从现证据量化连续持键候选会产生多少侧漂。

`/tmp/neon-ferry-control-method-candidate.js` 仅是未执行的helper替换片段：ferry+precision情况下，距目标≥1.2 m时最多等 .225 m真实投影进展（3个最大慢走步），.45–1.2 m用.075 m，近处仍用原.009 m；真实按住Z/方向键到predicate观测进展才释放。保留150 s、1800轮、.06/.15、rev和所有原route/arrival/whole budgets。该片段单独保存首错与release secondary；outer pointer也给独立保首错helper。

候选不改产品速度、body、时钟、位置、品质设置或路径。风险：持续持键期间moving-vehicle yaw会变，可能增加横向偏差；仍靠小批次、真实re-steer与原endpoint assertion暴露失败，而不能宣称预先解决。没有执行或伪PASS。下一步实际验证必须记录相同route/inputs下cycle位移、全部超时边界、首错secondary与终点/高度/rev，并按ROOT授权另行安排；本报告未启动任何验证。

## 关键原 frames 的检查边界

按原trace资源逐字节提取的3张JPEG：`/tmp/neon-ferry-d2-door-start-original.jpeg`（22:06:08.874Z）、`/tmp/neon-ferry-d2-door-middle-original.jpeg`（22:06:52.964Z）、`/tmp/neon-ferry-d2-door-end-original.jpeg`（22:07:18.740Z）。实际查看后可见下层船舱、座椅/楼梯和变化中的视角；HUD遮挡部分路径。这些帧不能证明最后尚未走过的1.77 m没有碰撞，也不能替代数值pose。原顶层artifact没有.webm；本报告使用的是trace中实际存在的screencast资源。
