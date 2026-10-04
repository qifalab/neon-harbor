# 新海港样板：验证记录

日期：2026-10-04。本目录只记录新海港样板，不继承 [v0.8 浏览器结果](../../v08/verification/final-browser-checks/README.md) 为新功能通过。

| 验证 | 实际结果 | 证据与边界 |
| --- | --- | --- |
| 首次全量规则检查 | 277 项，276 通过、1 失败 | [原始失败日志](rules-initial-failure.txt)：`south-089` 货栈领取提示抢占真实建筑入口，地址测试得到错误入口目标 |
| 入口修复后的针对性检查 | 根代理报告生活与街区联合 18 / 18 通过；原始输出待归档 | 领取柜台移到门侧可通行的 `(193.5, 119.979754474)`，真实建筑门保持 `(187, 119.979754474)`；首次失败记录保留 |
| 修复后的最终全量规则检查 | 283 / 283 通过 | [原始最终日志](rules-final-pass.txt)，共 109.09 秒；包括新增路口与行人规则，规则结果不等同浏览器通过 |
| 后续静态合批源树的规则检查 | 285 / 285 通过 | [原始发布规则日志](rules-release-pass.txt)，共 122.653 秒；本轮浏览器构建仍是合批前版本，此结果单独记录 |
| 真实浏览器四个独立案例 | 3 通过 / 1 未通过，总 25.0 分钟；巴士 6.2 分钟、电车 3.9 分钟、生活 4.7 分钟首次通过；渡轮 10.1 分钟首次整场超时 | [完整首轮日志](browser-first-final.log)、[巴士实际路线](browser-first/bus/bus-physical-route.json)、[电车实际路线](browser-first/tram/tram-physical-route.json)、[生活账本与存档](browser-first/life/funded-cargo-save-evidence.json)、[渡轮首次失败分析](browser-first/ferry/failure-analysis.json)；[首轮环境与构建](browser-first-run.json) |
| 从住宅出发连续 20 分钟路线 | 待验收 | 四个独立案例不拼接为连续路线录像 |
| 近景资产质量与性能 | 未验收 / 未测量 | 原创曲面程序车辆与 CC0 扫描材质已有实现；正式 GLB 管线、完整蒙皮人物与目标硬件测量仍缺 |

四项浏览器测试允许通过公开样板菜单设置首次位置，之后使用真实 WASD、Z、鼠标与 E。测试不得写入游戏时钟或玩家坐标；持货后必须沿街送达。功能阶段使用 Low 减少软件 WebGL 等待，实际固定机位截图切回 High，并记录机位、小时、质量、视口和构建标识。此环境不能证明 1080p 独显或 900p 集显目标。

首轮浏览器针对 [已归档的构建清单](tested-dist-build-info.json) 执行，SHA256 为 `eee79131221c700aa959b59509b770b8d1ee218c4586998aaec4a8ae52efaca8`；[构建日志](build-final.txt) 单独保留。该清单的 `revision` 为 `null`，使用内容摘要识别实际测试版本。[测试源码快照](tested-harbor-sample.spec.js.txt) 固定首轮行为，不由后续测试修改覆盖。

渡轮首次运行完成实际码头步行、登船、上层与返下层，但在靠近下层门时触发整场 `600000 ms` 限时，尚未完成离船。末次 trace 姿态为 `(-1.2640, 1.3, -7.2779)` 局部坐标，游戏时钟 `115.60 s`、船速 `6 m/s`、北岸约 `6.31` 模拟秒后到达，位置修订号仍为 `3`；此前输入和航行持续推进。保留 [原始 trace](browser-first/ferry/trace.zip)、[失败画面](browser-first/ferry/test-failed-1.png)、[错误上下文](browser-first/ferry/error-context.md) 和 [当时日志](browser-first/ferry/first-run-log-at-ferry-failure.txt)。这一项记为首次失败，不能把上层原图写成完整渡轮通过。

依据真实软件 WebGL trace，后续只将渡轮整场预算改为 `900000 ms`；单段步行 `150000 ms` 和到站等待 `180000 ms` 保持不变，不写坐标或时钟，不自动重试。复核将在后续含静态合批的新构建执行，另存构建标识与结果，不能追认首轮为全部通过。

后续 [发布构建日志](build-release.txt) 已通过，[发布构建清单](tested-dist-build-info-release.json) 摘要为 `b83ccae70a56a111ec5bd44e550b48fbb47d0634caf5899035713341b2aa4ab9`，含 144 个资源、`revision: null`。与首轮相比，已指纹的运行资源唯一变化为 `src/harbor-transit-renderer.js` 的静态合批；[清单差异](release-build-comparison.json) 单独保存。该构建的渡轮浏览器复核仍待执行。

生活首轮通过有资金来源的 8 份货物领取、领取保存及重载、实际步行配送、店铺支付 12 元运费，以及营业 / 有店员 / 有库存时实际购买 6 元果蔬。玩家现金为 `1200 → 1212 → 1206`，库存物品新增 1 份果蔬；对应交易唯一，资金和商品对账一致。实际进入 `south-095` 果铺房间，保存 [High 室内原图](browser-first/life/produce-shop-room-high.png) 与 [机位](browser-first/life/produce-shop-room-high-pose.json)，最后再次重载检查物品、现金和时钟。首轮室内图为第三人称小视口，玩家身体与 HUD 遮挡较多，不能用于正式近景美术验收。下一次完整 CI 使用公开 V 切换第一人称拍照，并为交通 JSON 补充实际到站 / 下车后姿态；这些测试证据改进不追写首轮记录。
