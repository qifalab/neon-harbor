# 西侧装饰山体：实际图诊断与隔离小制作

状态：**隔离 source / CPU 验证完成，真实 High 画面复核待执行**。不代表全场景验收、可探索山城、VRAM 实测、稳定帧率或 AAA 品质。没有修改 ROOT、Git / HEAD / refs，没有启动浏览器或 GPU，没有执行完整 358 项规则检查。

## 实际画面与 source 对应

亲自用 view_image 查看原始 authored `01-worker-close.png`，1280 × 800、High、16:30、dayCycle=false。右后方巨大绿山的尖顶约在图像 (1008,202)：两条完全笔直的斜边、单一顶尖、均匀绿面使它读作几何原型。山与细节人物、铺装及城市正面同时入镜，这一背景轮廓是具体制作缺口。树球冠由独立 tree agent 处理，本候选不触树。

原相机坐标 (-568.28,1.62,-438.2)，target (-578.253227,1.363350,-437.468739)，FOV 65、aspect 1.6。CPU 原相机投影将山 i0 的顶点 (-860,82.5,-580) 投到 (1007.0525,201.4187)，精确吻合。i1 顶点 (-915,108.5,-666) 投到 (1125.9771,178.1462)，被右侧建筑遮住；i2 顶点投到 (1214.4648,160.8299)，也主要位于建筑后。其余西山顶点在这张图的视口外。此投影没有把未遮挡投影当成可见像素验收。

原图 SHA256 `918ffeadf41b318aa06742a4ee78bd6e10db5aae672ec4724c05364fcdc9417b`。原采集 metadata 状态仍是 `first-failure-preserved`，首错为后续居民 walk 的 waitForFunction 超时；这张已存在的 PNG 是实际画面证据，原采集不是成功场景。PNG、metadata 原字节副本留在 archive，原目录中的失败、图片、录像未改。

ROOT HEAD 读取为 `6ad1ec712a32157635d179453e3b468db8cb116c`。原 `src/metropolis-world.js` SHA256 `eb09ecce894d84bb58cdabef743dc2ab1f77a9db79e01286043ec378a34a952e` 与图像 metadata 的 CC source 完全一致；材质、harbor-terrain、harbor-skyline、city-exploration、world、Three 的 7 个相关文件也逐项吻合。诊断没有把旧资源画面代入新 source。

## 原山体、地面与 chunk

原山在 metropolis-world 的 western-margin 循环：10 个 `stamp('cone','leaves',…)`；`ConeGeometry(1,1,12)` 每座 51 顶点、24 三角。该批次还包含北边 12 个同材质 cone；总 22 山 / 528 三角 / 1 draw。材质是无贴图的 `metropolis-leaves`，颜色 #526e59、roughness 0.93、metalness 0、DoubleSide；High 投射并接收阴影。AO 已在原图 metadata 中启用，不是缺 AO 造成尖峰。

西山中心依次 x=-860/-915/-970，z=-580-86i；x 半径 70/88/106 米，z 半径 85 米，完整高度 95/123/151/179 米。每座 y 中心 35/47/59/71，底面 -12.5/-14.5/-16.5/-18.5，顶面 82.5/108.5/134.5/160.5。联合旧包围盒 min=(-1076,-18.5,-1439)、max=(-790,160.5,-495)。每座旧包围盒均在 CPU receipt 保留。

这些 stamp 只生成 visual，没有生成山体 collider 或山面 ground/support。原北岸 API 在西山中心返回 null；组合城市最终沿用南岸 fallback -0.03，与真实山面高度不同。西岸海堤 collider 是 x=-739、hx=3、z=-885、hz=495、y[-5,5]，与山体视觉分开；本次原样保留。东侧 x[1670,2280] 的真实共享 terrain/support 山脊也不是照片中的山，本次完全不动。

西山和北 12 山属于永久 `North shore silhouettes`；没有写入按需 detail payload。12 个 north chunk JSON 都没有 cone/leaves 批次。本次维持 chunk、ground、碰撞、建筑、其他 props 原字节/原导出。

## 可合并的有限制作

交付目录：`/tmp/neon-western-mountain-candidate-20261005/payload/`。**只合并以下 3 项，不覆盖候选目录里用于 CPU 比较的整份 src 复制品。**

- `src/metropolis-western-ridge.js`：新独立确定 recipe 与 BufferGeometry producer。
- `tests/metropolis-western-ridge.test.js`：5 个针对性的纯 CPU 规则测试。
- `metropolis-world.hook.patch`：additive import 和 buildBatches 的一个条件/所有权/矩阵 loop 小 hunk。仅作用于永久 cone/leaves 批次；不是替换通用 cone geometry。tree agent 已确认其近树制作不修改该 buildBatches 段，中心可 additive 合并 import。

10 西山的顶部是每座 32 方位 × 12 径向圈的连续高度面，保留旧椭圆 footprint 与精确最小/最大 x/y/z。recipe 明确写入游移长脊、次肩、侧脊、曲线沟谷及近岸坡收束；不是随机移动一个 cone 的点。旧中心 apex 消失，峰顶沿宽脊偏移。顶部、裙边及水下底盖闭合；法线由真实坡面三角计算。草、土、裸岩颜色和 .86–.98 的基底粗糙度由高度、真实坡度和沟谷共同驱动，温和的大尺度色调变化也来自确定坐标。

整个 22 山合并成一个永久 Mesh / 一个 opaque DoubleSide material，仍 1 draw。北 12 山使用原 cone 的世界变换位置、世界变换平滑法线与三角顺序，逐 Float32 对比完全相同。它们的颜色保持原 #526e59，roughness=.93，surface mask=0，额外 grain / tone / relief 全部关闭。这个机制保留原北山响应，同时西山复用已有 surface-finish 的矿物 value noise / footprint 滤波；零新贴图、零外部素材、原创可编辑 recipe。CPU shader 组合检查通过，但没有把字符串检查当成真实 GLSL / WebGL 编译通过。

新 geometry/material 注册到原 geometries/materials 所有权表，因此进入/离开建筑、High/Low 切换不隐藏装饰山，dispose 事件各发生一次；没有创建独立常驻后台加载器。

## 实际有限预算

| 项目 | 原值 | 候选实值 |
| --- | ---: | ---: |
| 西山三角 | 240 | 8,320，832 / 山 |
| 北 12 山三角 | 288 | 288 |
| 总山三角 | 528 | 8,608，增加 8,080 |
| 山 draw / 单渲染 pass | 1 | 1 |
| 最终 geometry TypedArray | 共享旧 cone 1,776 B + 独立 instanceMatrix 1,408 B | 262,496 B |
| 生产 scratch TypedArray | — | 3,080 B |
| 最终 + producer scratch | — | 265,576 B < 300,000 B |
| 新纹理 | — | 0 |

候选共 4,792 顶点，position / normal / color / mountainSurface 四个属性；index=Uint16。最终 buffer 明细为 57,504 / 57,504 / 57,504 / 38,336 / 51,648 B。没有 UV 或大尺寸纹理，也没有构建全场高密 terrain。producer 直接写入最终 TypedArray，重复使用 3,080 B 高度 scratch，避免整 mesh 的临时 JS position/index 数组或法线副本。

此 300,000 B guard 明确覆盖实际 producer 的 TypedArray 分配，**不是整个 V8 heap、Three 对象/元数据或 GPU/VRAM 峰值测量**。新 shader cache identity、material 和 baked geometry 的实际 GPU驻留与耗时，需要中心真实 High 运行确认。共享原 cone 仍被其他建筑使用，不能把它的全部内存扣掉后声称 GPU净值已经实测。

## 已做验证与未做验收

5 个针对性测试全部通过：每山原边界、上向真实法线、非轴对称脊/谷、严格有限预算；北 12 山 Float32 顶点/法线/triangle order；shader mask / roughness / texture 条件；进入退出与画质变化 / 一次处置；错误 source transform / 材质族 / 成员标签拒绝。最新结果在 cpu-tests.final.txt。

额外 CPU identity proof 对原 6ad 与隔离候选各构造完整数据：

- 北岸总 564 mesh → 564，永久渲染节点 69 → 69；除这一山批次之外的 563 个 mesh 的 geometry buffer、material 参数、原 transforms、成员与 shadow flags 逐字段相同。逻辑 instance 计数保持原值，实际山对象已由 22-instance mesh 变为单个 baked Mesh，不能混淆两者。
- 274 北岸 collider 与 4,178 全城 collider 全部逐字段相同；world bounds 均为 1800。
- 12 north chunk 的 exportCity 完全相同，JSON 字符串与 ROOT 现有 12 个资产逐字节相同。无需改 chunk。
- 西山、海堤街面、实际图相机街面、桥端/桥中、东山 terrain 的地面查询前后完全相同；西山仍只有 -0.03 fallback，没有引入山面步行支持。
- 新山 geometry / material dispose 各一次。ROOT 原 metropolis-world source SHA 在比较前后均未变；HEAD 仍为 6ad。

High 最终复核由中心进行：沿用原同相机、16:30、High，检查旧巨大尖峰是否变成自然宽脊/沟谷，山色是否变成花斑/过亮裸岩，连接肩坡是否有明显截断或穿插，真实坡面阴影是否出现脏边，远景 noise 是否闪烁。原北山响应应保持；源 module 增加后构建资源字典会变化，必须重新绑定实际 source/hash。不能继承 192 资源旧图或旧失败采集为新候选通过。新图没有产生前不签收美术，也不扩建山城。
