# 港湾过街互锁修订：Node 诊断与原始证据

本目录保存 2026-10-04 对首次真实连续路线失败的离线诊断，以及最终 v5 居民过街修订的独立 Node 复算。**这里的 200 秒和 90 秒是模拟时间，不能替代实际浏览器的连续路线、画面、硬件性能或完整居民昼夜验收。** 原始脚本、数据和日志按字节复制，没有改写失败结果。后续正式全仓库检查位于根代理维护的 `final-checks/`，后续浏览器运行另建目录；它们不属于本 Node 清单。

## 实际失败与离线复现

首次浏览器路线的原始录像、方法、失败截图、日志及时间范围仍在 [art-final/continuous-tour](../art-final/continuous-tour/README.md)，保持原 SHA。玩家在公交上层等待泊位，`harbor-bus-2` 长时间速度为 0、`held: pedestrian`，原 600,000 毫秒等待超时。该路线未完成，后续下车、购买、市场房间、小轮、电车和返家重载均未执行。

[baseline/full-world-original.json](baseline/full-world-original.json) 是后来独立创建真实城市、原有街车和公共交通后的 Node 复算，固定步长 1/60，运行 18,000 步。30 份每 10 秒记录中，模拟 130 至 300 秒的 18 份停滞记录都复现公交中心 `(152, 140.7459745308214)`、yaw `0.012862887687415945`，已进入路口且不是红灯。其 SHA-256 为 `e338de7100b88f5e61f4c0bee16b5df18f3d100074dc978cde8b6ead7f6e6a0e`。

同一 Node 场景中的 resident-18 停在 `(154.06700000000228, 148)`，保留旧的 `harbor-crossing-z:160:146` 声明，却正在走 `harbor-crossing-x:160:146`。其下一步受到 traffic-5 完整车身阻挡，车辆又等待该居民，而公交也等待该居民。详情见 [blocking-car-original.json](baseline/blocking-car-original.json) 及 [deadlocked-state-original.json](baseline/deadlocked-state-original.json)。这是离线复现和归因，**不是浏览器运行当时采集的居民完整快照**。

## 最终修订及验证边界

[harbor-life-v5.patch](candidate/harbor-life-v5.patch) 的 SHA-256 为 `9176d7defcf477250d9677dc5e5622480105af2698cfc2850e11adb5fe62054b`。最终模块 [harbor-life-v5.js](candidate/harbor-life-v5.js) 为 `034cb5b4b1851071507c30c0cd36a250f0e8252c394ac28df6627de18b0acc5d`；修订前模块为 `6122d6738f36ee281277c80c1c8e7f777a87498295571f568f18be30f10927f8`。临时测试目录 52 份源码的依赖哈希与 b9 构建逐项比较，只有 `harbor-life.js` 不同；临时目录复制的 `city-exploration.js` 与 b9 原模块字节相同，其相对 import 在临时目录中解析到 v5 life。详见 [dependency-hashes.json](candidate/dependency-hashes.json) 和 [derived-verification.json](derived-verification.json)。

修订沿实际剩余过街折线路径预留车道，路缘入场前检查完整车辆车身占线，新方向的过街段检查自己的信号，穿过道路中的 null/折线标记时保留物理上仍有效的声明。交通回调首先检查居民当前接触与公交、电车下一真实路线位姿的扫掠接触，再计算路径投影；已经占线的车辆只有在当前和下一扫掠均安全时才能驶过侧面等待者。没有新增倒车功能、存档字段、退让 phase，没有延长浏览器路线等待上限。最终作者评审原文见 [final-review-original.md](candidate/final-review-original.md)。

| 证据 | 实际范围与结果 |
| --- | --- |
| [临时目录原有生活规则](candidate/rules-14-original.txt) | 14/14 pass，0 fail、0 skipped，8,520.157971 毫秒。它只代表这 14 项独立规则，不能当作整个仓库已通过。 |
| [最终 fresh 街面扫描](fresh-all-phase/world-summary-original.json) | 原有全部街车与公共公交、电车，12,000 个 1/60 步，共 200 模拟秒；公交到市场 1 次，并到达灯巷站；半径 .43 和原步行避让半径 .6 的接触记录均为 0，最终 money=2972、goods=300。 |
| [标准 public-save 恢复](public-save/recovery-original.json) | 恢复原互锁居民和公共交通状态，按产品正常流程重新创建街车；5,400 步、90 模拟秒，13.8666667 秒到市场，公交行驶 332.0997367 米。每步钱和货物误差为 0；.43/.6 初始接触、接触帧、新接触 episode 和最大侵入深度均为 0。 |
| [直接方法 cases](method-cases/cases-original.json) | 25 条结果，覆盖轿车/公交/电车前方、侧方、尾部、斜向/近乎平行保护，新方向红绿灯分离，占线车身路缘准入，以及 null/折线声明连续性。含人工安排的边界姿态，不是 25 条真实浏览器路线。 |

最终 fresh 扫描只排除 `insideBuildingId` 和 phase `boarding`、`riding`、`alighting`；保留 approach、waiting、waiting-transit 等街面实体。对 `sim.cars` 和 `transit.trafficBodies` 中 health>0、居民与车辆地面 y 差<1.5 米、中心 XZ 距离<7 米的车身逐步做 `circleOBB` 检查。它没有声称建筑内部、搭乘中的居民或整个世界所有实体都通过了碰撞验收。完整方法、每 10 秒轨迹、末态和原日志保留在 `fresh-all-phase/`。该运行的 exit 0 经执行代理确认，原日志记录其数值结果；确认与原 stdout 的性质区分见 [execution-confirmations.json](execution-confirmations.json)。

先前 `fresh-filtered/` 扫描使用 `!a.transit`，把 approach/waiting 通勤者一同排除了。其原始方法、数据和日志保留用于审计，但不能用其零接触数字作完整街面居民主张；上述 `fresh-all-phase/` 是修正过滤范围后的独立运行。标准 public-save 扫描也排除室内与正在 boarding/riding/alighting 的实体，其 broadphase 是 XZ≤12 米、y 差<1.5 米，具体条件以原方法为准。

## 转弯接触反例及限制

实际导航中的 `(230,144) → (252,144)` 过街段存在一个电车转弯反例：居民 `(235.93460490463215,144)`、电车 serviceTime=111.76，当前 .6 圆与车身没有接触，但下一 .05 路线位姿有接触，既有扫掠求解器报告 1 次接触。初期 draft 的角度/投影早退会漏掉这一真实下一步危险，因此必须在全部早退之前保护实际扫掠。

[initial-peer-review-original.md](method-cases/initial-peer-review-original.md) 和 [tram-corner-counterexample-original.mjs](method-cases/tram-corner-counterexample-original.mjs) 记录的是**拒绝早期 draft 的评审**，不是最终 v5 失败结论。[tram-corner-v5-original.mjs](method-cases/tram-corner-v5-original.mjs) 保留最终 v5 的精确断言方法。作者报告最终 hook 返回 0 并通过，但该次独立 corner 原 stdout 未单独保存；本归档不伪造补录日志，也不将方法文件当作原始执行结果。正式入仓回归测试的结果应查后续 `final-checks/`。

另一个临时 v4 试验曾强行保留全部旧 runtime 街车位置，暴露轿车和公交互相准入等待。普通 public-save 并不持久化这些街车位置，该私有夹具不属于本次产品存档恢复保证。最终 v5 的正常 fresh 与标准 public-save 运行均使用真实支持的流程；不为该不支持的夹具引入倒车行为，也不把它写成 v5 的实际浏览器问题。

## 字节审计与执行说明

[copy-provenance.json](copy-provenance.json) 记录每份原始文件的原路径、bytes 和 SHA-256。[evidence-files.json](evidence-files.json) 只核验本次 Node 归档负责的文件，明确排除根代理和浏览器代理拥有的 `final-checks/`、后续 `continuous-tour/`。为保留 exact bytes，原始脚本仍含 `/tmp/harbor-life-fix-v5`、`/tmp/harbor-life-deadlocked-save.json` 或 `/workspace/scratch/neon-harbor` 的绝对 import/输出路径；**这些归档副本不是可直接执行的便携入口**。不得在当前仓库直接执行 baseline 脚本并覆盖旧 `/tmp` 证据。

需要重放时，应另建隔离目录，使用 HEAD `0330df7ee1042d0f211304b042e01cdf6a0b4d44` 加 [b9 修订前源码副本](../art-final/source-before-crossing-repair/README.md) 恢复当时依赖字节；v5 只替换 life 模块，并核对本目录依赖清单。另存改过路径的重放脚本及新输出，不改本目录原脚本或旧数据。产品正式检查由根代理在已应用 v5 的共享源码上另行执行。

本目录没有运行 WebGL、修改 renderer、src、tests、tools 或旧失败档案，没有提交、推送或部署。零接触和数值守恒说明本次有限时段的逻辑与几何结果，不说明样板区达到 AAA 美术、全城开放或硬件帧率目标。
