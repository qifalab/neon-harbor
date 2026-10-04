# Isolated ART 首轮原生 FAIL：35 个 geometry 增量的只读审查

结论：现有证据不能唯一归因这 35 个 geometry。实际代码支持港湾交通 LOD 首次进入 renderer 跟踪集的候选机制，但既没有该段的实际 fleet/LOD 快照，也没有首轮已上传 geometry ID/UUID 集。不能把 `35` 数量匹配写成确认根因，不能放宽原来的稳定基线断言或把首轮 FAIL 改为 PASS。

本审查没有启动浏览器、GPU、规则测试、构建或远程动作，没有修改项目文件。CPU 枚举最初针对 isolated 源码，9 个直接输入 SHA 均与首轮 metadata 相符；随后在完整 `frozen-source` 上重新执行，两个 CPU 方法均退出 0。后者是本报告的正式可复核依据。CPU 新建对象的 UUID 是本次枚举对象，绝不是已经关闭的首轮原生运行 UUID。

## 真实增量发生的位置

首轮档案在 `/workspace/scratch/neon-harbor-art-pilot/docs/qa/art-pilot/native-validation-2026-10-04`，method SHA 为 `8be52d410558e25da2016ce7d83fd669b2647ed27e1904c1a22e3404d62516a9`。

| 实际记录 | simulationTime | geometry / texture |
| --- | ---: | ---: |
| 暖身退出街道后的稳定 baseline | 43.84999999999879 | 580 / 118 |
| cycle 1 两模型近景验证完成，仍在 south-086 工坊 | 64.4166666666643 | 591 / 133 |
| cycle 1 实体返程，x 181.3331 → 182.7331 | 67.08333333333081 | 626 / 133 |
| cycle 1 实际 E 退出 | 78.83333333333015 | 615 / 118 |
| 失败后的街道稳定值 | 79.33333333333012 | 615 / 118 |

`+35` 在已经 ready 的室内返程发生，没有新模型 decode/ready 事件；退出时全局 geometry 确实减少 `11`，与 bench vice 4 + tool chest 7 对应。两轮的 release 记录均列出完整 11 geometry、6 模型 texture、1 skeleton 和 6 closed images。全局 texture 退出减 15 包含室内牌面及 skeleton texture，不能把这个全局差值直接称作模型 texture 数。原断言检测到的 `615 - 580 = 35` 仍是有效 FAIL。

## 实际交通几何与共享引用

在 frozen `src/harbor-vehicle-models.js:143` 调用真实 `createHarborVehicle`；逐级 traverse 去重 geometry UUID，并创建相同 kind 的第二实例验证共享引用：

| kind | near / middle / far unique geometry | 两实例共享 geometry | 跨 tier 共享 |
| --- | --- | ---: | ---: |
| bus | 35 / 35 / 32 | 102 / 102 | 0 |
| tram | 35 / 35 / 32 | 102 / 102 | 0 |
| ferry | 44 / 44 / 41 | 129 / 129 | 0 |

`templates[tier].clone(true)` 保留共享 geometry；frozen Three 的 `Mesh.copy` 确实执行 `this.geometry = source.geometry`。同 kind 两车重复显示同一 tier 不能再算第二组 35，跨 tier 则是不同 geometry。`disposeInstance`（vehicle-models.js:216）释放实例材质，不释放蓝图缓存几何。

在 frozen `vendor/three/three.module.js`，`memory.geometries++` 出现在几何管理器 `get(object, geometry)` 第一次发现 geometry.id 时，注册 dispose listener；收到 dispose 才 `memory.geometries--`。这计数的是该 renderer 已登记的几何，不是所有 CPU 已创建或当前 scene 可见几何，也不是驱动显存字节。隐藏、改变 LOD 或暂时移除共享实例均不会自动减该数。因此，初次渲染一个之前未登记的 35-geometry tier 可以符合观测；仅凭这个机制还不能证明首轮新增的正是那一组。

实际 sample fleet 在世界初始化就创建（`harbor-transit-renderer.js:121`），`updateRender(camera)` 会依据实际游戏相机选 LOD（同文件:125；vehicle-models.js:203）。普通房间不会隐藏外景根组：`city-exploration.js:264` 只在 `cameraInClosedCabin(camera)` 时隐藏 world/transit root。四个 cycle 0 近景 full snapshots 以及失败 snapshot 的 `renderVisibility.outdoor/transit` 均为 true。主相机及 sun shadow 都可首次登记候选几何；房间墙体不会阻止 renderer 对阴影视锥内外景投影对象的遍历。

## 真实车队时钟约束没有锁定 LOD

另一个 CPU 方法导入 frozen `compileHarborRoute` / `harborRoutePose`。使用 4 个近景 before/after 的实际车队 serviceTime 和失败 snapshot，对每车利用源代码 `advance ∈ [0, step]`（transit.js:386–420）求时钟边界。对允许时钟区间内的每个实际 compiled path piece 求眼点距离极值，含 y，ease 只改变沿直线的单调位置。它是约束边界，不是实际交通重放；没有虚构中途车队状态。

| 时刻 | bus 2 允许 serviceTime | bus 2 到实际眼点的距离 |
| --- | --- | --- |
| 64.4166666666643 | [128.0233447387758, 142.49298890380425] | [29.390469390469764, 47.72903774716661] m |
| 67.08333333333081 | [130.6900114054423, 142.9400114054416] | [30.774605602865392, 48.59376488003334] m |

bus/tram near 的 nominal 42 m 边界带 0.12 hysteresis；从已选择 middle 返回 near 的门槛为 36.96 m。两个允许区间均跨过这个门槛，所以 bus 2 可以是 near 首次登记候选，也可以一直停留在 middle，不能由边界确定实际切换。bus 1 的允许距离大于 189 m，tram 1 最小距离 65 m 以上、tram 2 最小距离 73 m 以上，因此这两次端点约束下它们不能切入 near。

**bus 2 不是所有 35 增量的已证明唯一候选。** tram 2 的允许距离分别为 [74.7295, 124.1552] 和 [73.7962, 123.4325] m，跨 middle/far 的 120 / 105.6 m 门槛，其 middle 同样有 35 个几何。早期 full snapshot 中的距离或原生 aggregate 计数不能替代逐 UUID 的先前登记历史，也不能证明该 tier 的每个 mesh 早已实际登记。其他原有外景缓存几何在不同相机/阴影视锥里首次登记同样没有逐对象记录。

## NPC、ambient car 与室内/分块检查

- `city-exploration.js:54` 进入室内将 sim.cars 切为 []；`main.js:295` 所选 visualCars 因此为空，:296 会移除这些实例，只释放 paint / police light material（models.js:43），不会新建或销毁共享 car blueprint 几何。样板车队独立保留。`main.js:301` 的 walkers 在室内明确不可见。
- 北岸居民来自 `METROPOLIS_BUILDINGS`；`metropolis-people.js:265` 在进入 south-086 时剔除 insideBuildingId 不匹配者。四个 cycle 0 full snapshots 和最终 failure 的北岸 detailed/pooled 均为 0。港湾人物 renderer 的同组 full snapshots detailed=0、pooled=6；进入工坊筛选不到该楼人物，池中 immutable wardrobe 资源保留。CPU 真实 wardrobe 各 style 的 near/middle 19–21 几何、far 9，克隆共享全部 47–51 个 UUID。没有证据支持这段新增 35 来自新增居民模型。
- 独立子审查的 [详细报告](/tmp/neon-art-streaming-interior-growth-review.md) 与 [实际差值](/tmp/neon-art-streaming-interior-native-diff.json) 确认：active 24 chunks、requested 37、unloaded 13、residentMeshes 437、instances 41,394 以及驻留字节在现有 full snapshots 完全不变；north loaded=0。437 批使用 5 种共享 geometry。
- 子审查实际执行 5 次 south-086 CPU 进退，每次新增 geometry=0，34 个 InstancedMesh 实例退出 dispose，系统固定 5 shape + 1 sign geometry 只在总系统 dispose。该楼不属于 6 个 HARBOR_FRONTAGES，两层 harbor room dressing 都 disabled。重复进入不能通过这些代码生成或遗留一组新 35。

排除这些直接分配路径可以缩小范围，不能将剩余范围自动归因到 bus 2，更不能称作已确认无泄漏。

## 可复核资料与后续必要观测

正式 CPU 枚举：[方法](/tmp/neon-art-geometry-growth-frozen-cpu-probe.mjs)、[stdout](/tmp/neon-art-geometry-growth-frozen-cpu-probe.log)、[完整 UUID 引用与原生紧凑快照](/tmp/neon-art-geometry-growth-frozen-cpu-probe.json)。实际时钟边界：[方法](/tmp/neon-art-geometry-growth-frozen-phase-bounds.mjs)、[stdout](/tmp/neon-art-geometry-growth-frozen-phase-bounds.log)、[每个 path piece 的区间与极值](/tmp/neon-art-geometry-growth-frozen-phase-bounds.json)。原始首次 current-source CPU 输出保留在相同前缀但不带 `frozen-` 的 /tmp 文件，未覆盖。

要做可裁决的下一轮，应记录全局 renderer geometry 首次登记/释放的 id/uuid、来源归属、实际 fleet pose/serviceTime/current LOD 及相关 phase；让相同暖身与完整反复进退保留稳定计数要求。若证实是有限原有外景 tier 初次登记，须先声明并验证确切 warm-up 集及资源上限，再重新进行独立验收。首轮结果和原断言继续保留。
