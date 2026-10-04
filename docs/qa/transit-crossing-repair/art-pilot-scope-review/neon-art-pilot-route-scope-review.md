# south-086 资产试点与连续路线范围只读审查

对象：根 worktree `/workspace/scratch/neon-harbor` 的冻结 manifest `7145fa443190896ff24050d518a54fea364ddb0547ddfa71756a33d64c515fb3`，及隔离 `/workspace/scratch/neon-harbor-art-pilot` 的 `integration.patch`。未改变根/隔离源码、运行 GPU/WebGL、push 或正式测试/build；只生成 `/tmp` CPU 方法、原始输出、数据与报告。

结论：所审接入是有明确边界的渲染与碰撞增量。全部新增模型/固定碰撞的所有权只落在 `south-086/lobby`；当前连续路线使用的 `south-079`、`south-095`、`sail-club` 的真实布局与室内碰撞系统保持相同。可以在保留旧路线原始版本绑定的前提下，用其核心连通性证据、试点独立原生现场和新最终版本完整 CI 共同评审这一狭窄改动。**试点原生现场及最终完整 CI 仍是必须项；本报告不批准省略。**

## 可复核 CPU 方法与原始结果

- [实际两 worktree 方法](/tmp/neon-art-pilot-scope-probe.mjs)，SHA `b2de4fc7e5146a98884fc6cbfd67bc0ac5ee351ef3893a8e06583ab6b4c853c4`。
- [原始 stdout](/tmp/neon-art-pilot-scope-probe.log)，SHA `c85c4fa4aa9be5fa4f84b701a277fd45812f01a0b6d04a497268563677a511c4`，实际执行 exit 0、2.595 秒。
- [完整比较数据](/tmp/neon-art-pilot-scope-probe.json)，SHA `4c6d48f5202e2b17ae286ba4a26978d1a244c14b96ccae3b59ec1b1d34f81c8c`。
- [输入/输出字节与 SHA provenance](/tmp/neon-art-pilot-scope-provenance.json)。
- [独立 loader 范围审查](/tmp/neon-art-loader-scope-review.md)。

方法分别初始化 root 和 pilot 的真实 `createCityExploration`，让各自 module-scoped programme registry 由实际世界构造注册，然后读取真实建筑/floor、layout 和 interior system。不能把根目录建筑直接塞入未初始化的隔离 module registry，否则会误落入默认住宅用途；最初探针出现的默认用途是此 harness 选择错误，已按实际运行方式修正，并非产品 south-086 用途回归。最终方法没有注入产品状态、请求文件或解码纹理；CPU scope 请求计数使用明确拒绝的注入 loader，仅用来观察触发条件。

## 增量边界与真实布局

逐模块原字节对照：pilot 现有 src 中仅 `metropolis-interiors.js` 相对根目录不同，另新增 `harbor-workshop-pilot.js`。四份从根目录复制的材质/家具/生活 overlay 保持一致，不应在合入时覆盖整树。`integration.patch` SHA 为 `cfc042d15b6c34035ff9bdb15352f668f4f7ba793439a5fc5a33e0e6450218d8`。

实际 220 栋、4,150 个 floor 的 plan 适用集合唯一为 `south-086/lobby`。两套实际建筑目录 JSON 完全相同。对三个 tour 地址及 south-085 / 086 / 087 / east-001，共 18 个真实入口/第二层/顶层（去重）layout 作 JSON 字节比较，全部相同；这里的纯 `createInteriorLayout` 尚未加入接入系统追加的唯一工具箱 collider。

| 地址 | 根 / pilot 实际室内系统 collider 数 | 已有 collider 改写 | 新增 collider | snapshot 比较 |
| --- | ---: | --- | --- | --- |
| south-079 | 400 / 400 | 无 | 无 | 除新 null 诊断字段外相同 |
| south-095 | 336 / 336 | 无 | 无 | 除新 null 诊断字段外相同 |
| sail-club | 692 / 692 | 无 | 无 | 除新 null 诊断字段外相同 |
| south-085 | 224 / 224 | 无 | 无 | 除新 null 诊断字段外相同 |
| south-086 | 220 / 221 | 无 | `south-086:lobby:cc0-tool-chest` | 增量 collider 数与 pilot 诊断有差异 |
| south-087 | 224 / 224 | 无 | 无 | 除新 null 诊断字段外相同 |
| east-001 | 606 / 606 | 无 | 无 | 除新 null 诊断字段外相同 |

三址真实 layout 字节比较包含 parts、rooms、入口、电梯、stairs 和其碰撞。接入未改变保存处理、室外 collider 列表、道路、居民/经济、交通或 simulation 模块。`safeSave()` 未保存新增 pilot 诊断，不改变室内恢复于原建筑街门的规则。其他地址 snapshot 只增加 `workshopPilot:null`，因此不能把整个原始 snapshot 对象说成一字不差。

新增工具箱 AABB 为中心 X=180.45、Z=-119.52、hx=.3084247872233391、hz=.18321896698325874、Y=.895…1.4816520047187804。其 XZ 完全包含在原货箱 footprint 中，原货箱/工作台/房门/楼梯/电梯 collider 不删除、不替换。三层 resident window 可保留该 lobby collider，但它仍属于此楼层；上层实际 Y=6.177619955604896，不与此低位包络重叠。两件真实模型代替一个原台钳可见代理并新增货箱顶部工具箱，失败时代理保留。

当前 running route-plan 的 home/shop/north 为 south-079/south-095/sail-club，没有进入 south-086；其全部静态街道路径到新增 collider 中心的最小 XZ 距离为 **46.55 米**（produceToPier）。新物件也不是全局室外 collider。因此上述三址实际系统相同、线路不进入试点及几何距离共同支持此次连续路线的功能范围不受该局部家具增量影响；这不是对全世界无限运行的行为证明。

## 按需加载范围

以真实工坊坐标更新各个当前进入的地址，CPU loader 触发计数在三个 tour 地址及 085 / 087 / east-001 均为 0；只有 086 的 lobby 触发两件指定模型。源代码另要求当前可见层、当前楼层 id、非乘梯移动、垂直差 <1.8 米、冷请求距离 ≤24 米；已 wanted 的请求/模型保留至 32 米。其他建筑、非当前 lobby、冷远处均不触发 GLB 请求。

初始脚本图会增加 **9,617 bytes 的 pilot 本体**；不能宣称初始完全零新增下载。GLTFLoader 是函数内 dynamic import，首次近处另请求本地 loader 三模块约 **164,163 bytes**，随后两件 GLB 共 **4,788,776 bytes**。每件三张 JPEG 全部内嵌，无外部纹理 URI、CDN 或额外解码器。此范围来自代码/实际文件检查，尚未是浏览器网络轨迹实测。

退出/远离用 generation + abort 禁止旧结果挂回；GLTF parse 与内嵌 JPEG 解码本身不接受 AbortSignal，已开始的 CPU 解码可继续到结果被释放，不能声称退出瞬间取消全部工作。独立 loader 报告核对了这一边界。

## 狭窄改动的验收组合及真实缺口

当前完整 tour 始终绑定旧 `7145` 和方法 `60436`。之后即便选择性合入试点，也必须把 tour 原始 manifest/源 SHA 保持原样，标为核心路线的旧冻结构建实录；**不能称其为新 manifest 的同一次原始 run。** 可以在最终 QA 中并列列出此只读差异证明、旧核心路线和新 pilot 独立原生现场，再由新候选完整 CI/构建/线上资源指纹验证闭合增量。若后续不再是这个 patch 的局部范围，适用性需重新审查。

仍须实际覆盖：

1. 新候选浏览器真正请求两 GLB、JPEG 完整解码，pilot ready 且实际两个模型可辨认；CPU 占位纹理与纯规则 PASS 不提供该证据。
2. 目标 High 场景的 skin 默认姿态、尺度/落位、PBR 曝光、AO/阴影、近距离材质，以及台钳手柄和工具箱精确边界。工具箱横向只有约 1.58 mm 余量，不能任意改姿态。
3. 在 086 现场实际走到桌旁/工具箱、上下楼或乘梯、退出及再进入；请求迟到/失败回退与反复释放后的浏览器资源/renderer memory。退出后的 GPU 或 ImageBitmap 释放不能仅凭 dispose 事件计数判定。
4. 在选择性合入后的最终 source 上跑完整游戏与多人 CI、正式构建并核对线上所有资源；它覆盖共享 interior 模块的启动/入口/保存/多人回归与动态模块的正确打包。不能沿用 0330 的旧 CI 或 7145 的旧 manifest 当这项通过记录。

以上为实际未覆盖范围。两件正式资产并不补齐整个港湾、人物、全城或 AAA 品质；不需要为这个狭窄家具 patch 额外引入不相关交通功能。
