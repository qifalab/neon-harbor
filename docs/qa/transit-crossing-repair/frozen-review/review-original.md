# 冻结候选只读审查

审查目录：`/workspace/scratch/neon-harbor`。2026-10-04；HEAD 仍为 `0330df7ee1042d0f211304b042e01cdf6a0b4d44`，审查对象为其未提交发布候选。未启动测试、build、浏览器、WebGL 或远程操作；未修改仓库源码、证据、文档。只写本 `/tmp` 报告及独立 ledger 报告。正在运行的新 `transit-crossing-repair/continuous-tour/` 完全排除。

结论：在本次有范围的代码、测试与证据审查中，未发现需要中断当前 tour 的 material bug，也未发现将测试或旧截图改写为 AAA、全城完成、硬件性能、正式 GLB 或完整连续路线验收的文档主张。完成路线、远程门禁与发布仍须以其后实际结果为准。

## 冻结与 import

- `final-checks/verification.json` 的 146 个 dist 资源、52 个源码模块、6 个方法/测试/fixture SHA 全部与当前字节一致。
- manifest 为 `7145fa443190896ff24050d518a54fea364ddb0547ddfa71756a33d64c515fb3`；本地 revision 为 null，不能充作公网部署 SHA。
- life 模块为 `034cb5b4b1851071507c30c0cd36a250f0e8252c394ac28df6627de18b0acc5d`；与 b9 原生 High 图版本相比只改变该模块。
- 从 `harbor-life.js` 出发检查相对静态 import 图，无循环。新 `harbor-shop-defs.js` 为只含冻结定义的数据模块，避免 district → life → interiors 的依赖方向；新增 `harborRoutePose` 所在 transit 模块不反向 import life。
- 已读取正式 `rules-final.txt` 的 302/302、0 fail/cancel/skip 和 128,145.787594 ms，以及成功 build 原始输出。此审查不重复执行这些检查。

## 真实车身、信号与存档

`src/harbor-life.js:287` 的 `_crossingRun` 使用当前位置和剩余实际折线路径，直到离开实际道路边界；不会把过街限制为 nominal lane ±2 米。`_crossingOccupied` 使用实际 hx/hz、yaw、垂直包络和既有 swept circle 求解器，`.6` 半径未缩小。

`src/harbor-life.js:313` 在旧过街已退出其 carriageway 后释放旧 claim；进入新方向时检查该方向自己的信号。旧存档保留上一 leg claim、但人已经在新 carriageway 内的情况允许完成过街。路缘新进入者遇完整占线车辆仍等待。null/zigzag waypoint 不会在道路中途自动释放 claim，原逐步 `.6` circle/OBB 避让仍保留。

`src/harbor-life.js:412` 的 traffic hook 使用 `.6`，公交/电车真实车身增加 `.08`；当前接触和下一真实 `.05` route pose 的完整转弯扫掠保护置于全部路径投影 early-out 之前。占线车优先清空仅发生在人处于其侧面 clearance 外、当前和下一扫掠没有接触时。真实向前阻挡保留，没有角度 `.85` skip、减少 runtime 人物半径或忽略占线居民。未知/外部公交 ID 不获得这项可继续清空的例外。

新增回归 `tests/harbor-life-traffic.test.js` 具有以下实质覆盖：

- fresh 真实城市保留 33 辆原有 street cars 和 20 位样板居民，逐步推进 200 模拟秒；必须实际到达市场停站。每步检查 `.43` 实体和 `.6` 避让圈，保留 approach/waiting/waiting-transit 街面实体，只排除实际室内与 boarding/riding/alighting。
- 真实 pre-repair 存档恢复后的 90 模拟秒，保留互锁 resident-18 的旧 claim 与新 target，life 完整 snapshot 无改写，钱/货守恒，实际到市场。未把不属于标准 public-save 的 ambient car 私有位置加入产品保证。
- 精确 actual turning tram 反例：当前 `.6` 不接触、下一 pose 与既有完整 sweep 接触；必须 hook=0，并检查只读回调不改变 life/fleet 状态。
- 新 leg 红灯/绿灯分别验证，轿车、公交、电车实际完整占线准入、后段 zigzag 占线检查，以及道路内 null waypoint 的 claim 连续性。

`tests/fixtures/harbor-life-pre-crossing-repair.json` 的 SHA 为 `0fbaf6098a6adcd529b422a8330fff28ebbe9f10eb1fce0e2242cf135030e913`。重新计算原始自然 capture 的 SHA 与 provenance 均为 `8ea1f3e9831eb4feace75804cddeb8f9370b373af6fc5584657974b7217ea6a9`；fixture 的 harborLife 与 harborTransit 分别和原 capture 字段完全相同。仅 cars/elapsed 私有 runtime 字段按真实公开保存格式省略。

integration 更新不是单纯删除失败断言：`tests/harbor-sample-integration.test.js:189` 增加每步完整公交车身 `.43/.6` 零接触，原 80 次车头距离及绿灯保护以 70 次保存前 + 4 次恢复后 + 6 次继续保护保留。在尚未清空车道时保存/恢复并要求真正停车；清空公交车道但整个道路 claim 仍有效时，再要求 14 次实际推进后恢复 cruise 与位置前进。更改的是“人已离开该车道仍永久停车”的旧状态要求。

## 经济与声明范围

v5 diff 未改变经济转移、工资 slot、购买日、配送 escrow、商品总量、时钟推进或保存 schema。回归每步检查 life money=2972、goods=300、player wallet=1200；持续追踪交易 ID 对应记录不变及 wage agent/slot、delivery job、purchase agent/day/product 义务不重复，覆盖 bounded live ledger 轮换之后的本次运行。它不能证明未来无限运行或已经完成居民完整昼夜周期，文档没有这样主张。

README、QA、HARBOR_SAMPLE_ACCEPTANCE、WORLD_SIMULATOR_PLAN 和 REAL_CITY_V08_PLAN 正确区分：当前 302 规则/构建通过、0330 旧远程游戏场景通过但整轮 MP 启动失败、本地两浏览器修复后通过、b9 原生 High 图的静态近景限制、第一次连续路线失败、新路线正在执行、Pages 及线上验证尚未完成。未发现把新经济写成服务器共用账本或把仓库多人服务写成已公网部署的叙述。

正式资产、近景人物蒙皮、全城生活、硬件帧率、完整 20 分钟路线仍有独立的待验收/制作字段。真实香港地名仅在制作参考背景中出现，原创分区和交通命名方向明确。

## 已完成证据与链接

独立 ledger 审查见 `/tmp/neon-ledger-readonly-review.md`：8 份已完成 ledger，138 个唯一文件、74,671,411 字节，无缺失、字节或 SHA 不一致；crossing 的 32 条 copy-provenance 也一致。旧 tour 原方法、原日志、原视频和 metadata 引用一致。

本代理另检查 21 份主文档及已完成 QA Markdown，215 个本地链接，无目标缺失。没有将不同冻结版本的历史图/方法摘要和当前源码直接比较。新 tour 运行文件未读取、未审查；两个没有逐文件 ledger 的 post-checkpoint 子目录未据此获得完整字节审计结论。此报告不是新的浏览器、画面、硬件或发布通过记录。
