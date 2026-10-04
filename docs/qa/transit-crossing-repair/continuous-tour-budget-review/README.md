# 预声明目的站预算方法复核：第三次连续路线失败

本目录保留一次独立 fresh browser 的完整原始过程，退出码 1，路线未完成。执行前仅将下层目的站等待预算 600000→900000ms，并新增只读 lower-door-ready 阶段记录；boarding 和 upper berth 仍为 600000ms，每个 cabin waypoint 仍为原 150000ms，整场仍为 90 分钟，所有模拟时间、物理输入、入口和存档断言不变。这个预声明方法调整是第三次独立验证，不能覆盖前两次真实失败。

本次真实完成了：从 south-079 住宅二层房间开始、连续楼梯出楼、步行公交站、E 登上双层公交、实际上下楼梯、等待市场站并 E 下车；沿街 E 购买果蔬，现金 1200→1194、produce 库存 0→1；通过真实 south-095 建筑入口进入 grocery 房门并步行到房间、E 退出；沿实际街道走到南码头并步行上坡道、E 登上小轮，真实走上小轮上层，在实际开门停靠时按 E 保持上层乘客状态，再沿实体楼梯回到下层高度。

首次失败时间为 2026-10-04T18:57:33.776Z。真实下层船舱移动的 walkLocal 最后一次 waitForFunction 超时显示 1ms（原方法第 356 行；ride 第 411 行），该值是原 150000ms waypoint 预算消耗后的剩余等待，不是给整段路线设定 1ms 预算。本次没有走到 ferry-outbound-lower-door-ready，没有下船，不能宣称下层船门通行已通过。

失败处理的原始 fullsnapshot：simulationTime=687.4333333330368，passengerLocal=(-2.5961293047241165, 1.3, -7.213511147958965)，passengerDeck=lower，rev=11，cash=1194。小轮仍 held=null、cruise、speed=6.681457582232042，下一站 harbor-ferry-north；车辆行驶与玩家局部通行是不同事实，不能将移动中的世界 pose 当成玩家已通过船内目标。

尚未达到：小轮下层门口、北岸下船与坡道、对岸实际室内/退出、正常渡轮返回、双层街轨车上下层/上下车、返回原住宅、最终公开导出/重载完整状态一致，以及安全门口恢复后 E 入楼步行回二层。上层 E 证据只覆盖当时上层楼梯口的楼层高度和车门接触联合限制。

## 时长、视频与环境记录

- case 开始：2026-10-04T18:08:57.473Z。
- 原始录像开始：2026-10-04T18:08:57.555Z。
- 连续路线开始：2026-10-04T18:11:02.447Z；之前仅用公开 Atlas / E 设定住宅起点。
- 首次失败：2026-10-04T18:57:33.776Z；路线实际已观察 2791329ms（46 分 31.329 秒），超过 20 分钟，整条路线仍未完成。
- 请求关闭录像：2026-10-04T18:58:05.674Z；录像 finalized：2026-10-04T18:58:15.707Z。
- 完成原始清理及 metadata：2026-10-04T18:58:15.878Z；case 至完成 2958405ms，低于 90 分钟。

原始 [单文件 WebM](video/page@f3a37dcd9bfa366ae4707ebb074324d8.webm)：VP8、512×320，独立 ffprobe 与原 metadata 均为 2950.72 秒，71548336 字节，SHA256 69971a38c7d91c24192d793c30038a1665cef3105ba29c1bb2f48ce4b0c1cac9。视频含 startup、公开起点设置、所有步行/等待/失败收尾，没有剪辑，没有补足时长。video published:false、publicationUrl:null；仅保留本地证据，尚未宣称公开上传。

运行先断言默认 High，再用公开设置选择 Low；实际 GL 为 409×256，Chromium 151.0.7922.34 / SwiftShader。此录制提供功能过程证据，不提供原生画质或硬件 FPS 结论。

失败前原 periodic 日志的模拟推进由此前约 6–9 sim 秒/30 wall 秒，降低到约 2–2.7 sim 秒/30 wall 秒。Root 报告隔离 worktree 的离线全规则测试当时并发运行，并于 18:58:10 UTC 停止（报告精度为秒），晚于首次失败。没有第二个 GPU 采集，没有改 root 源码、dist 或方法；并发 CPU 观测和时间上的下降没有证明故障根因，也不能声称暂停已避免失败。此处将并发安排和实际下降如实记入验证环境，保留独立诊断空间。

## 原始证据和边界

- [metadata.json](metadata.json)：原实际 phase/pose/clock/revision、购买账本、错误、所有方法/源码/资源 SHA 与视频信息；errors=[]、cleanupErrors=[] 不能替代路线通过。
- [bus-cabin-waypoints.json](bus-cabin-waypoints.json)：公交成功下车前实际采集的船舱输入后局部样本。
- [purchase-original-export.json](purchase-original-export.json)：通过公开保存控件下载的原始购买后 JSON。
- [failure-full-snapshot.json](failure-full-snapshot.json)：失败处理时只读 __NEON__.snapshot() 的完整原始 JSON。
- [failure-autosave-progress.json](failure-autosave-progress.json)：原 localStorage 只读副本，harborTransit.time=683.2666666663739，不能代替 live failure clock；没有写入或恢复该文件。
- [capture-original.log](capture-original.log)：原 /tmp log 逐字节副本；[capture-harbor-tour-original.mjs](capture-harbor-tour-original.mjs)：实际执行的原始方法 bytes。
- 本次小轮的完整 input-step 样本没有原始落盘。原方法在 arrived 成功后才写 cabin-waypoints，小轮在此前失败，因此不存在 ferry-outbound-cabin-waypoints.json。failure snapshot、phase 与周期 pose 是真实数据，但不能补写成已经捕获的完整输入流。
- [post-run-verification.json](post-run-verification.json) 核验 146 assets、52 src、4 方法依赖，运行后完全匹配原冻结 SHA；两旧目录完整 ledger 所列 13+15 文件也未改变。
- [evidence-files.json](evidence-files.json) 列出本目录原始证据及补充说明的 bytes/SHA；不对自己建立循环 hash。

冻结 build-info SHA256：7145fa443190896ff24050d518a54fea364ddb0547ddfa71756a33d64c515fb3；实际方法 SHA256：60436d2fe8db8af646c1a02d93f9e70fc3e1ce34181d257a1c3ea39aae850702。本次没有自动重试、修改中途预算/产品/方法、再次 Atlas 旅行、坐标/clock/dt/storage 注入或视频剪辑。产品的室内安全存档恢复在门口，精确房间/楼层恢复仍属后续；本次未达到最终重载阶段。
