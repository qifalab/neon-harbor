# 冻结运行版本 D：首轮 feature CI 未通过

[实际 run 37235153499](https://github.com/qifalab/neon-harbor/actions/runs/37235153499)，attempt 1，`workflow_dispatch`，分支 `codex/traffic-and-multiplayer`，head `0c746b6d1d5a8c1af8be8242982f3d378e564231`。2026-10-04 21:12:33Z 创建，21:38:21Z 最后更新，最终 **completed / failure**。required 12 个 job：11 success、1 failure，0 cancelled / skipped。两项 PR-only room-art / room-detail 的实际 skipped 单独保留，不算功能通过。

11 个游戏分片各自真实运行 **311/311 规则通过，0 failed / cancelled / skipped**；这是同一组 311 规则的重复运行，不是 3,421 项不同功能。游戏浏览器 **26 通过、1 失败，共 27 场景**；双浏览器多人 **2/2 通过**，该多人 job 没有运行 npm test。全部浏览器共 28 通过、1 失败，不能拼成整轮成功。最终逐 job 的开始/结束、规则、实际案例结果行、原日志 SHA 及原始状态入口见 [final-run-summary.json](final-run-summary.json)。

| 分片 | 实际规则 | 实际浏览器 | Job 结论 |
| --- | --- | --- | --- |
| game | 311/311 | 4 通过 | success |
| stability | 311/311 | 3 通过、1 失败 | failure |
| metropolis-1 | 311/311 | 2 通过 | success |
| metropolis-2 | 311/311 | 2 通过 | success |
| metropolis-3 | 311/311 | 2 通过 | success |
| living-city | 311/311 | 2 通过 | success |
| harbor-realism | 311/311 | 2 通过 | success |
| city-materials | 311/311 | 3 通过 | success |
| harbor-sample-1 | 311/311 | 2 通过 | success |
| harbor-sample-2 | 311/311 | 2 通过 | success |
| occupied-city | 311/311 | 2 通过 | success |
| multiplayer | 未运行 npm test | 2 通过 | success |

唯一失败为 `tests/e2e/stability.spec.js:182` 的 **a fast steering approach stops the full car body outside the generated buildings**，实际 49.6 秒，不是 timeout。第 220 行要求车身实际接触建筑，分离距离应 `<0.12`，实际 `3.607706203071066`。此前全车身不穿入建筑的检查不等于已经碰到建筑；后续 presentation、错误与 wall-contact-metrics 检查未执行，不能追记为通过。原 [stability decoded 日志](logs/job-111532676124-original.log) 保留 179,823 字节，SHA `8bcaf7c68791687ab10533c915af304e30f14b47431f6d6004176b26c299e484`。

失败原 [artifact ZIP](artifacts/11315651048-browser-test-results-stability-original.zip) 为 GitHub artifact `11315651048`，27,101,931 字节，实际 SHA 与服务器 digest 均为 `4058835317f58132a9f44eed88981b0bb9272c560c1487f70f83fd838b3a1d62`。完整 42 项 ZIP 保留，包含失败 video、error-context 与 trace。原字节提取的 [trace](artifacts/stability-failure-original/trace.zip)、[error-context](artifacts/stability-failure-original/error-context.md) 及核对记录随目录保存。成功 job 只保存完整 decoded 原日志、状态和 GitHub artifact metadata，没有额外下载其大 ZIP，不宣称这些 ZIP 已本地封存。

只读 trace 解码得到 3 个实际转向样本；末样本 `x=12.6723139612,z=96.2662933180,yaw=2.2347847429,speed=0,health=78`。加速 snapshot 到转向之间油门仍 held，实际转向开始前车辆已经继续前移。独立静态几何读数重现建筑分离距离，支持未到立面这个证据边界；附近路灯/信号柱是具体候选，但 snapshot 没有 actual contact ID，不能唯一断定撞到哪一物件，也不能据此声称运行代码新增碰撞回归。[独立只读诊断](independent-static-review/neon-ci-stability-first-failure-and-trigger-method-review.md) 和 provenance 按其原 SHA 复制。最后可用 screencast 画面属于不同呈现时点，不能替代损伤样本或用于唯一确认接触物。

归档的 [local-frozen-build-info-original.json](local-frozen-build-info-original.json) 是本地受测 `0.8.0 / revision:null / 156 assets / 53 src`，manifest `502af982ac2999fb28c395388d7d97acdf6165df803f62b3069f95cafa2dcbb3`。CI 原日志证明 actual D checkout 与构建步骤成功；该本地 manifest 没有冒充从 CI runner 下载的清单。最终部署仍需比较实际公网 revision 和完整资源字典。

归档只进行了 GitHub GET、原文件下载及只读文字/trace 分析。12 个 required 原日志来自 GitHub connector 的 decoded 字符串，保存为 UTF-8，保留 BOM、时间戳和原空白；原 connector reply 另存。其余 run/jobs/artifact JSON 是原 gh GET stdout。没有 rerun、cancel、source/index/ref 修改、stage、commit、Pages 或 Release 发布；本地唯一连续 tour 继续绑定 D，这个远程结果不替代完整路线或美术验收。后续 tests-only 修订需新候选、新 CI 目录，本首轮失败和所有封存字节保持。

所有当前文件大小和 SHA 见 [evidence-files.json](evidence-files.json)。ledger 自身不计入自哈希。原 `.log` 被仓库 ignore 规则匹配，后续提交时应显式保留完整原日志；不得修剪其空白来满足 source diff-check。归档最大的单文件为 27,101,931 字节，低于 100 MiB Git blob 限制。本轮没有写 Git index。
