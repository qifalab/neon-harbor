# 最新只读诊断版本的 CPU 尝试与暂停记录

本目录保存真实 CPU 执行记录，不是浏览器或美术通过记录。最终取景脚本仍为 SHA256 `8be52d410558e25da2016ce7d83fd669b2647ed27e1904c1a22e3404d62516a9`；已审查的方法和产品模块在本阶段没有改写。没有启动服务器、浏览器或 GPU，没有写 ROOT。

父任务最初授权完整 CPU 回归与构建；随后因为独占 GPU 的 ROOT 连续 tour 原始日志显示持续降速，要求立即终止本任务的隔离重 CPU 执行。**停止时间为 2026-10-04 18:58:10 UTC，最终 driver 返回 exit 143。最终回归未完成，NOT PASS；最终构建与全资产校验未启动。** 仅本任务 driver PID 48147 及其 npm/test 子树 48150、48161、48162、48325 被 SIGTERM，没有处理 ROOT tour 或 Chromium。

| 阶段 | 实际结果 | 原始证据 |
| --- | --- | --- |
| 六个 JS `node --check` | 均 exit 0 | [commands.json](commands.json)，各 syntax stdout/stderr |
| 旧测试树 `npm test` | exit 1；305 项 / 304 pass / 1 fail | [完整原 stdout](node-rules.stdout.txt)、[stderr](node-rules.stderr.txt) |
| 首轮 `npm run build` | exit 0；不是最终全资产验证 | [原 stdout](build.stdout.txt)、[stderr](build.stderr.txt) |
| 同步测试后的完整 `npm test` | 任务被终止，NOT PASS；原 reporter 306 tests / 305 pass / 1 cancelled | [部分 stdout](final-node-rules.stdout.txt)、[stderr](final-node-rules.stderr.txt)、[终止记录](cpu-pause-termination.json) |
| 最终 build 与全资产一致性 | 未启动 | 需要重新授权后执行，不引用首轮构建冒充最终验证 |

旧树的唯一失败位于 `tests/harbor-sample-integration.test.js:194`：旧断言要求 80 tick 后仍为 pedestrian，实际已恢复 cruise。父任务确认 ROOT 已改为完整车身 / .6 m 避让保护，以及通道安全后真实恢复语义。因此只复制了三份授权 ROOT 精确字节：[root-test-overlay.json](root-test-overlay.json) 记录来源、原 / 新 SHA；被替换的旧 integration 源保存于 [prior-tests/](prior-tests/)。没有弱化断言，没有复制其他测试。

最终中止时 reporter 把尚未结束的 `harbor-life-traffic.test.js` 标为 cancelled，原文为 “Promise resolution is still pending but the event loop has already resolved”。这是被终止阶段的真实输出，不能作为完整测试通过记录；终止记录另存实际 driver exit 143 及仍可观察到的子进程内核退出状态。遗留 zombie 状态不继续执行 CPU 工作。

[测试树差异](root-tests-comparison-before.json)另列 `tests/multiplayer-browser/rooms.spec.js` 的 trace 配置差异；它不在 `npm test` 的根层 Node 测试集合中，父任务确认选择性集成保留 ROOT 字节，隔离目录没有扩展复制。

[ROOT frozen52 源逐项比较](root-frozen-source-comparison-before.json)确认 ROOT 当前源均匹配冻结构建；隔离目录仅 `main.js` 的只读诊断与 `metropolis-interiors.js` 的试点集成不同，另新增 `harbor-workshop-pilot.js`，其他 50 个源文件精确一致。[首轮冻结检查](freeze-verification.json)确认该完整尝试期间产品 / 方法源、ROOT runtime 和旧 QA 原始证据都未变化。最终重跑后的全字节扫描因暂停没有执行，不能声称完成。

`verify-built-assets.py` 已准备但尚未运行，后续将核对全部 served/source/build-info 字节、正式下载 MD5/SHA、GLB 原 BIN / mesh / skin / PBR / JPEG 字节保留，以及 ROOT 全 runtime 与 frozen52 源差异。`run-initial-cpu.py`、`run-final-cpu.py` 是已执行 orchestration 的原始副本；它们有保留旧记录的 guard，不应覆盖运行本目录。后续正式运行应另建证据目录并保存新的命令、stdout、stderr、exit 和最终源/构建字典。

`browser-method-source.json` 与原静态审查仍保留执行前状态，不能把这些历史字段改写成当前完整回归或 GPU 通过。后续等待父任务明确授权，暂不继续重 CPU、构建、校验、服务器或浏览器。
