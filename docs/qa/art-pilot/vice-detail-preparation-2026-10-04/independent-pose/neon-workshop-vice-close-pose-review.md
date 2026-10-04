# 台钳较近合法拍摄 pose：只读准备

建议实际玩家站位 **x180.35 / y0.215 / z−113.45**，普通第一人称眼点 y1.835。瞄准真实 mesh bounds 中心 **(180.3666335031, 1.2319882244, −114.5798833537)**；水平距离 **1.130006m**，眼点到中心 **1.280834m**。这是待真实拍摄的方案，不是已执行的近景美术验收。

现有 workbench 的 footprint 与真实玩家 radius **.65** 限制近距；不能声称 0.5–1m 到中心可达，更不能把 .43 当作玩家半径。该点保留 .10m 的 bench 净余量，不取触碰边界的数学最近点。bench collider `south-086:lobby:266`：center x180.9/z−114.58，hx.875/hz.38，Y1.075–1.115；其 z 较大一侧允许玩家中心 z≥−113.55。左侧外墙使从台钳西端贴近不可行。本点外墙净余量 .23m，window .30m。

用实际公开 E 进入 086 lobby 后，沿普通 WASD/Z 依次走这些 cardinal legs：

| 步骤 | x | z |
| --- | ---: | ---: |
| E 入内实际入口 | 200 | −100.1 |
| 中央通道到 workshop 房门 | 200 | −115 |
| 穿过真实房门到 room arrival | 197.8 | −115 |
| 沿房内通路到桌东侧 | 182.8 | −115 |
| 先绕到桌的 z 较大一侧 | 182.8 | −113.45 |
| 再向西到拍摄点 | 180.35 | −113.45 |

最后两段使用 ≤.04m 位置误差，并以只读 snapshot 确认；现有 suite 的 .18m arrival tolerance 不适合这个只留 .10m bench 余量的点。回程原路反向绕到 x182.8，再 z−115、x200，避免从桌面穿回房门。拍摄只用现有 `aim(page, actualMeshBoundsCentre)` 的真实鼠标拖拽；纯计算参考 yaw3.1268723 / pitch.7128941，仍保持默认第一人称 FOV65。不写相机/坐标 debug state，不修改 scale、模型放置、光照、材质、画质或半径。

CPU 证据：从已写出的 fresh vice pose 读取 exact south-086 building，先用 `expansionBuilding(...,'south',85)` 注册真实 warehouse programme，只构造这一地址的 interior system；实际 resident floors 为 lobby/observation。用系统全部 **221** 个 floor+lift colliders、真实 1.8m 高 / .65m 半径胶囊和实际 `moveCircle` 连续 sweep 验证五段，每段 **0 接触**、最终误差 <9e−13m，终点 `circleContacts` 为0。.43 仅补充复核，不用于主结论。没有构造 world/fullscene 或加载 GLB/JPEG。该唯一 geometry read 80.09ms，Node process .115s；未重跑 tests/build/browser/GPU。

原 [CPU method](/tmp/neon-workshop-vice-close-pose-probe.mjs)、[stdout](/tmp/neon-workshop-vice-close-pose-probe.log) 与 [几何原值](/tmp/neon-workshop-vice-close-pose.json) 保留。几何读取后的 [最终 pose JSON](/tmp/neon-workshop-vice-close-pose-preparation.json) 另用纯算术将朝向 pitch 修正为现有 `aim` 使用的 actual horizontal-distance 分母；原 CPU 草案里按固定10m计算的 pitch 不用于拍摄。没有第二次 layout read 或实际输入。

此方案可审查静态通行与机位范围，不能预先证明截图细节可读、质感精修完成或美术签收。须等当前资源 suite 关闭 GPU 后，由 root 授权独立单 context 真实步行和 native High 截图，再按实际图像判断。
