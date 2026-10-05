# D2：tests-only 修订的第二轮 feature CI

[实际 run 37237505203](https://github.com/qifalab/neon-harbor/actions/runs/37237505203)，attempt 1，`workflow_dispatch`，分支 `codex/traffic-and-multiplayer`，head `7a90f7934b7c9d1af5c4494bf08c4ec337c373e4`，parent D `0c746b6d1d5a8c1af8be8242982f3d378e564231`。2026-10-04T21:47:31Z 创建，2026-10-04T22:16:40Z 最后更新，最终 **completed / failure**。12 个 required job：11 success、1 failure、0 cancelled、0 skipped。PR-only room-art / room-detail 的实际状态单独列在原记录中，其 skipped 不算通过。

11 个游戏分片实际规则见表与 [final-run-summary.json](final-run-summary.json)；同一组 311 规则在不同 runner 重复运行，不能相加成不同功能。游戏浏览器 26 通过、1 失败；双浏览器多人 2 通过、0 失败，该 MP job 未运行 npm test。所有规则和浏览器数量均由各 job 完整原日志提取，逐案例原结果行与 log SHA 随 summary 保存。

| 分片 | 实际规则 | 实际浏览器 | Job 结论 |
| --- | --- | --- | --- |
| city-materials | 311/311 | 3 通过 / 0 失败 | success |
| game | 311/311 | 4 通过 / 0 失败 | success |
| harbor-realism | 311/311 | 2 通过 / 0 失败 | success |
| harbor-sample-1 | 311/311 | 2 通过 / 0 失败 | success |
| harbor-sample-2 | 311/311 | 1 通过 / 1 失败 | failure |
| living-city | 311/311 | 2 通过 / 0 失败 | success |
| metropolis-1 | 311/311 | 2 通过 / 0 失败 | success |
| metropolis-2 | 311/311 | 2 通过 / 0 失败 | success |
| metropolis-3 | 311/311 | 2 通过 / 0 失败 | success |
| occupied-city | 311/311 | 2 通过 / 0 失败 | success |
| stability | 311/311 | 4 通过 / 0 失败 | success |
| multiplayer | 未运行 npm test | 2 通过 / 0 失败 | success |

[实际远程 commit GET](remote-candidate-commit-original.json) 验证 D2 的唯一 changed path 为 `tests/e2e/stability.spec.js`，是 D 的直接子提交。D2 从 private bare object store 上传；dispatch 时 ROOT checkout HEAD、index、测试和运行源码仍是 D，正在进行的本地唯一连续 tour 也仍实际绑定 D。此远程 CI 没有证明本地 tour 在 D2 上重跑。D2 未改运行源码；本地 `502af982ac2999fb28c395388d7d97acdf6165df803f62b3069f95cafa2dcbb3 / 156 assets / 53 src` manifest 属于 D 本地冻结构建，不冒充从本 CI runner 下载的资源清单。实际部署仍需比较公网 revision 与完整资源指纹。

首轮 D 的失败、原 trace 和独立只读诊断仍封存在 [../remote-feature-ci/](../remote-feature-ci/)，没有改写或合并成成功。D2 调整测试触发方法，仍保留实际建筑接触、全车身不穿入等断言；第二轮结果只属于本 run。PR-only art/detail skip、规则通过、城市开放数量和 CI 成功不等于 AAA 美术、完整城市或硬件性能验收。本目录不宣称本地完整路线通过或 Pages/Release 已发布。

失败具体 timeout、断言/清理错误与原 trace 入口见 [failure-summary.json](failure-summary.json)；如实保留未通过结论。ZIP 下载的失败尝试、32 MiB executor transfer cap 和正常 HTTP client 的实际成功 receipt 全部保留；只有 server SHA/大小都匹配的完整 ZIP 列作实际下载成功，0B 失败文件不算 ZIP。完整失败 ZIP 保留全部 44 项，顶层没有 `.webm`，不能把 trace screencast 宣称为独立视频。

12 个完整 decoded 原日志来自 GitHub connector 字符串，保存为 UTF-8，保留 BOM、时间戳和原空白；原 connector reply 另存。这是 decoded log 原文，不是服务器压缩 wire bytes。run/jobs/artifact JSON 是原 gh GET stdout。成功 job 只保存完整原日志、状态和 GitHub artifact metadata，未额外下载其大 ZIP。实际失败 ZIP 下载列表见 summary。

本归档只进行 GitHub GET 与轻量文件读取/写入，没有 rerun、cancel、stage、commit、source/index/ref 改动或发布。所有封存文件的大小和 SHA 见 [evidence-files.json](evidence-files.json)，ledger 自身不计入自哈希。原 `.log` 被仓库 ignore 规则匹配，后续提交应显式保留原日志，不得修改原空白来满足 source diff-check。任何新增候选使用新目录，保持本目录字节不变。
