# NORTH-CUP-OWNER 原始失败：自然需求重新进入观察位置

原始 `ownerCase:301` 首先失败的是 `evicted.residentAssets.instances === 0`，实际为 **1**。随后同一行的 `templateOwners.imageBitmaps === 0` 尚未执行；末状态中实际 bitmap 是 **6**。这不是“残留一个纹理”的证据。原先无人使用的通勤、工人模板已经关闭并逐出，之后一名正常步行的建筑测绘师走近观察者，重新申请并持有一个通勤实例。

原包 91,556,531 字节，SHA-256 `ae81c5db2a6ea1199fc928f2c04720c29520e1264ab07416489df1aab6236c7c` 已重新核验。来源为 cc038、0.8.0、192 项实际资源字典；原采集方法 SHA `983bb99e65cc4ad6d8223dd11dad3f2381354081452fe629c60a0e672bc2cff5` 与 Git 中 cc038 的完整方法原文一致。当前 472 的四个相关源文件和工人、通勤 GLB 均与原包资源指纹相同。原四张 PNG、原视频、firstFailure、退出回执全部保留，原案例仍是 FAIL。

| 原实际读数 | 无人实例观察开始 | 13.25 sim 后首错前 |
| --- | --- | --- |
| 墙钟时间 | 02:56:29.648Z | 03:00:07.020Z |
| simulationTime | 47.6166667 | 60.8666667 |
| 玩家位置 | (-530.2400, 0, -576.4043) | 原位置 |
| 实例／选中 | 0／空 | 1／resident-jade-bank-0 |
| commuter requests／generation | 3／2 | 4／3 |
| commuter idleSeconds | 10.70 | 0，实际实例正在使用 |
| worker idleSeconds／loaded／generation | 8.45／true／1 | 0／false／2 |
| template bitmap／geometry | 12／8 | 6／4 |

这段真实墙钟为 217.372 秒。末帧 `resident-jade-bank-0` 的逻辑职业是建筑测绘师，近景角色为 commuter，位置 (-521.3965, 0.0031, -579)，距实际第一人称相机 **9.3573 米**，`active/coreVisible/selectedForNear` 均为 true。其位置从观察开始的 (-502.9472, -579) 自然步行至该处。期间 `templates +2、bitmap.close +12、geometry.dispose +8`，与旧两套六 bitmap／四 geometry 模板逐出吻合；通勤 generation 和请求增加证明此时引用来自新载入。旧点就在自然前街路线旁，“曾有一次实例为零，再等 13 秒”不等于连续 13 秒没有需求。扩大等待时长不能解决这个观察地点错误，也不应关闭 NPC、暂停生活或放宽零引用要求。

当前证据支持修采集路线和观察条件，不支持修改产品缓存实现，也不支持宣布不存在其他场景的泄漏。原案例未执行实际返回和第五张图，不能签收完整往返与再载入。

## 已准备的独立最小候选

候选仅位于 `/tmp/neon-north-cup-owner-method-candidate-20261005`。从原 High 恢复位置用现有公共键盘走法固定分三腿：x=-544、x=-521、z=-602；按原路返回原观察位置。旁侧点避开前街自然需求。每腿保留 180 秒、到达零需求上限 180 秒、一次连续冷却上限 240 秒、真实冷却 13 sim 秒、实际 source cooldown=12、资源/骨骼严格零计数、High/Low/High、原 prop UUID 和返回再载入守卫。

新增只读连续条件要求整个冷却段始终 High、第一人称、未暂停、未瞬移、实例=0、selected 为空、无 pending 请求和角色实例。任一次自然需求进入就保存 first failure，不重置冷却、不延等、不重试。原场景选择、45 秒动作观察、其他四种 resident-extra 案例、cleanup 和实际浏览器所有权分类均不改变。

ROOT 明确授权后，候选 **仅 north-cup-owner whole 1080→2400 秒**，job75 分钟保持。该预算是完整固定往返的独立有限预算修正：原首错已耗 993.191 秒，只剩 86.809 秒，而尚未走的原 38 米返程按原现场约需 187.6 秒；更长但清楚的旁侧往返各约 72.60 米。结合原已发生的截图、视角切换和步行的保守估算约 1,588 秒，2400 是有上限的余量。原 first error 的原因仍是新的自然需求，不能用预算变更把原 FAIL 改为 PASS。未增加 240 秒冷却等待或降低任何守卫。

CPU 检查实际 `createCityExploration` 全静态碰撞和高度，玩家半径 .65 加原端点容差 .75，总 1.40 米；六个固定往返腿全部零碰撞，地面高度 0，距车行道边界至少 28 米。实际 transit/people 源码正常推进 90 sim 秒，采样 30–90 秒的自然外部居民，观测点最近距离 22.6996 米，超过近景退出阈值 21。这里未加入原动态车辆，不是浏览器路线证明，运行时连续需求守卫仍不可缺少。

CPU 资源证明使用实际指纹匹配的 GLB 几何与真实资产库状态机；为避免解码图片或启动 GPU，每个角色的六个 closeable image 为明确标识的合成 CPU 所有权替身。原两个端点的位置插值重现旧模板关闭、自然靠近请求新通勤实例；在新点连续 13 sim 后，bitmap/geometry/skeleton 严格为零。新守卫拒绝原实际末状态以及 pending、selected、暂停、Low、第三人称、瞬移、倒退时钟、错误 cooldown 等八种状态。异步加载必须 await 真实 promise；一轮 CPU fixture 因只等待固定三次 setImmediate、未等新 GLB 完成而失败，原 fixture 首错另外保留，已修 fixture 后两轮 CPU 均通过。这个准备失误没有引发源码或浏览器运行修改。

## 四张原生图逐张实际查看

全部以原 1280×800 像素实际查看，DPR1、16:30、dayCycle=false；前三/第四的视角和画质切换及 NPC 自然位移已核对。第三张 PNG 页面仍是 1280×800，但实际 Low canvas 为 1024×640，不能当作同画质材质对照。没有基线对应图，不做前后提升幅度评价。

| 原图 | 可见内容与边界 |
| --- | --- |
| 01-original-prop-close | 真正杯子目标为中间偏左的条纹衬衫、深色短裙居民 jade-bank-3（shopkeeper）；前景右侧白 T、蓝背带裤是另一名 worker。目标头发、人类脸和衣物轮廓已可辨，领口、袖子和少量皱褶有形状；条纹面料重复明显，面部细节在这个距离偏弱，头发较整块。左手杯子在身体右侧只有很小、部分遮挡的轮廓，图本身不足以验清握持、杯沿或手指；元数据能确认原 cup UUID 实际可见并绑定左手。
| 02-real-45-second-end | 同一短裙目标背向走远、真实步态改变，蓝背带裤 worker 仍在前景。同一个 skeleton 和原 cup UUID 保持，元数据实际动作窗口为 137.205 wall／8.5 sim，45 是最低墙钟要求。杯子和脸无法清楚判断；走路、物体还在同一对象上不等于漂亮的近景动作验收。
| 03-low-real-readback | 原模型恢复为简化身体，画面模糊度和阴影响应改变。实际 High 模板、实例、bitmap、geometry/skeleton 都归零；这只是 Low 释放段的局部真实证据。该图不是精细人物或皮肤材质验收。
| 04-high-owner-restored | 近处条纹上衣、蓝长裤为 local-player commuter；前面远一点蓝背带裤仍为 worker。杯子目标已经自然离开近景范围，并不是近处玩家，原 cup UUID 保留但 target coreVisible=false。实际玩家和工人新骨骼恢复，但不能据此说杯子目标的 High 脸/衣物/手持已重新近景验收。

条纹人物与背带裤人物具有实际衣服和身体轮廓，比简单方块人物更完整，但皮肤缺少可读的层次和细节，衣料仍较统一，远近阴影只提供基本落地感。周围的大平地、重复球形树、锥体山和大片深色立面保留明显的简化城市观感。四图没有家具近景、建筑室内、其他未拍角色或昼夜材质比较；不能批准完整样板区，更不能依据 CPU 通过或数量称为 GTA/Cyberpunk/3A 品质。

有限后续优先级是先用该固定公共路线完成持续零需求→真实返回→再载入的原生案例，再给这个实际杯子角色清楚、无遮挡的近景握持和正面脸/布料图。这里没有发起扩城、资产制作或新 GPU。

检查附件：`original-failure-provenance.json`、`png-sha256-ledger.json`、`original-video-preservation.json`、`static-route-proof.json`、`cpu-source-residency-proof.json`、`whole-budget-limitation.json`。候选包含方法小 hunk、单 case budget hunk、新增只读 helper、完整原失败方法原文及封存说明。合并必须只取 owner hunk 与该 case，以保留并行 BUS/tour/居民方法修改，最后刷新完整 bundle manifest。
