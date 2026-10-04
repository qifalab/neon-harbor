# Isolated ART geometry 580 → 615：分块与室内只读审查

审查对象为 `/workspace/scratch/neon-harbor-art-pilot/docs/qa/art-pilot/native-validation-2026-10-04` 已结束的原生 **FAIL**，method SHA `8be52d410558e25da2016ce7d83fd669b2647ed27e1904c1a22e3404d62516a9`。本次仅解析 JSON、读取源码并运行独立 CPU 几何生命周期探针；没有浏览器、WebGL、构建、正式测试、远程操作或仓库修改。

**结论：现有证据排除了“反复进 south-086 会复制/遗留室内基础 geometry”及“该区又加载了新分块/前厅”作为 35 增量的解释。尚不能唯一归因 35；首次渲染其他既有场景 geometry 仍是需要父审查定位的可能性。原生 FAIL 不能改成 PASS。**

## 原始差值发生位置

metadata `scenarios[0].memory` 给出：

| 位置 | sim time | geometries | textures |
|---|---:|---:|---:|
| 首轮退出即时，events[15] | 43.3500 | 519 | 98 |
| 同位置街道暖基线稳定样本 | 43.3500—43.8500 | **580** | **118** |
| 第二次近景验证，events[25] | 64.4167 | 591 | 133 |
| 第二次返程首段完成，events[26] | 67.0833 | **626** | **133** |
| 第二次退出即时，events[30] | 78.8333 | **615** | **118** |
| 失败稳定样本 | 78.8333—79.3333 | **615** | **118** |

35 geometry 增长发生在 events[25] → [26]：玩家从 `(181.3331, -117.6067)` 向 `(182.7331, -117.6069)` 返回，GLB 已 ready。之后直到离开数字不再增长；退出的 **626 → 615 = -11** 与两件资产的 4 + 7 geometry 释放一致。textures 同时 **133 → 118 = -15**；原生 lifecycle 有两轮各自的 bench geometry 4、texture 3、skeleton 1、close ImageBitmap 3，以及 chest geometry 7、texture 3、skeleton 0、close ImageBitmap 3 的 release。

这证明有真实释放调用和计数下降，并不能单独证明所有 GPU/驱动字节释放；亦不能用 “geometry 计数恢复11” 证明另一35一定来自其他模块。暖基线的 **519 → 580** 本身说明 pendingChunks=0 后仍会增加 renderer geometry/texture 计数；pending 不是完整场景首次渲染完成标记。

## 分块驻留未发生变化

四个原生近景 pose 的 before/after（sim 12.7333、16.4000、24.8667、28.5000）与失败 snapshot（sim 79.3333）有完全相同的：

- 南区 activeChunks 24 个，loaded 24，pending 0，requested 37，unloaded 13。
- residentBytes **2,763,022**，residentMeshes **437**，residentInstances **41,394**，disposedInstances **22,373**。
- 北区 loaded/requested/unloaded/meshes/instances 均为 0。
- 前厅 residentFrontages `[]`、loads 0、disposedMeshes 0、drawCalls 30、scannedMapsLoaded 0。

baseline 样本未保存完整分块字典，不能称已有其独立逐字段截图。但前述区间覆盖 baseline，requested/unloaded 为同一 streamer 的单调累计数；首个近景 snapshot pending 已 0，直到最后没有请求/卸载累计变化，足以支持这段时间没有分块换入/换出的结论。targetChunks 随玩家位置改变，activeChunks 保持不变。

实际解析相同24个 chunk JSON：437批依次为 box 176、detail-box 159、cylinder 54、leaf 20、architecture 27、tree-crown 1；总实例及字节与 snapshot 完全一致。`src/world.js:533` 将它们映射到 **5份共享 geometry**（box 与 detail-box 共用 boxGeo），`makeBatch` 直接传入几何对象而不 clone（535—538）。加载分块只重建 InstancedMesh，卸载只释放 instance 资源（598—624），不释放共享几何。即使某个该分块种类首次上传，也只有这5份共享 geometry 的池，无法单独解释35。全局 surfaces、独立 static Mesh、其他模块不包含在这5份计数上限内。

`src/city-streaming.js:65` 在 attach 前记录 resident counts，`:94` detach 后清空并增加 unloaded，`:106` 统计的是驻留 CPU scene 数据；它们不记录单个 geometry 是否已被 WebGLRenderer 注册。north 同样是固定10种共享 geometry（`src/metropolis-world.js:17`、`:780`），但此次北区没有请求。

## south-086 室内每入口不复制基础几何

`src/metropolis-interiors.js:915`、`:918`、`:927`、`:937` 在系统初始化只创建 **6份几何**：box、rounded box、soft box、cylinder、sphere，加 sign plane。floor batch 直接引用同一个 shapes 字典（1129），cabins 使用相同 box（1022），sign Mesh 使用相同 sign plane（1098），fallback 也引用同一个 shapes 字典（1140），均没有 geometry clone。

`enter()` 先 clearFloor，再组装（1272—1278）；`exit()` clearFloor 并清空 cabin（1281—1287）。`clearFloor()` 移除所有 floor group 并清空布局 cache（1025—1028）；`releaseFloor()` 释放 pilot/dressing、InstancedMesh、owned sign material/texture，并移除 group（1030—1034）。这6份共享基础几何有意跨入口保留，仅整个系统 dispose 时全部释放（1385—1386）。这属于固定上限缓存，不能因每次入口增加35。

`src/harbor-room-dressing.js:10` 按 HARBOR_FRONTAGES 查 shell，没有匹配就直接返回空组。清单为 south-091/092/095/096/090/094（`src/harbor-district.js:9`），**没有 south-086**。原生该楼两层虽有布局和标签，不会创建 dressing 的每层合并 geometry。其他列在清单中的楼会生成新的 merged geometry，但退出会在 dressing.dispose 释放其 Set 中全部 geometry（harbor-room-dressing.js:77—79），本次它们不是 current interior。

## 独立 CPU 生命周期探针

可复核方法：[/tmp/neon-art-streaming-interior-growth-probe.mjs](/tmp/neon-art-streaming-interior-growth-probe.mjs)，原始 stdout [/tmp/neon-art-streaming-interior-growth-probe.log](/tmp/neon-art-streaming-interior-growth-probe.log)，数据 [/tmp/neon-art-streaming-interior-growth-probe.json](/tmp/neon-art-streaming-interior-growth-probe.json)。实际 Node exit 0，0.793 秒。

探针使用实际 city programme registry、实际 createInteriorSystem、真实 Three 类；只在传入 THREE 对象外层包装几何构造器和 dispose event，不修改源码。系统初始化创建6份；连续5次 `south-086` enter/exit **每次新增 geometry 0，调用期间使用5个完全相同的 shape geometry ID**。每次有34个 InstancedMesh，退出触发其34个 dispose event，室内 scene 剩余 Mesh 0，两层 dressing 均 disabled；整个 system.dispose 触发完整6份基础 geometry dispose。Asset loadCalls 0。

限度：CPU 没有 DOM，sign() 在 canvas 创建前返回，所以 native 的14 sign Mesh 没有在本探针生成；源码显示其 geometry 仍只有共享 sign plane。没有加载/解码 GLB 或模拟 GPU注册，本次探针不能替代原生资源验收。它证明基础构造/场景生命周期，不假造 renderer.info.memory。

## 审查边界与下一步

8个涉及源码/方法当前 SHA 全部与原生 metadata 字典一致；具体输入SHA、完整事件差值、24 chunk 文件SHA及驻留比较都在 [/tmp/neon-art-streaming-interior-native-diff.json](/tmp/neon-art-streaming-interior-native-diff.json)。该解析方法 [/tmp/neon-art-streaming-interior-native-diff.py](/tmp/neon-art-streaming-interior-native-diff.py)，原始 stdout [/tmp/neon-art-streaming-interior-native-diff.log](/tmp/neon-art-streaming-interior-native-diff.log)。metadata 输入 SHA `921a551fefe70a872cc9ca53a520f2c41a85023fa932a8d5d1f99c23ed3b43ae`。

三个新 CPU 文件SHA：method `0519a509642f7e57afdf04d1e409d9587eb19a19684cf25b7d68c7efdcce796e`；stdout/JSON均 `7640ddad9b0c7e94a8804bd7d31bfd409bdff6fdf70ea92a7e308312261f5fe7`。差值解析 method `7581722fe684cd95c1e7cee928316c40c942206d6ec47bbb5c43cd4667801608`，JSON `68cfeff9dd8709ce59a9d5389d5a65dc9ea7a57538acda598c9fb5bf9a17d00c`。

现有原生 snapshots 只有总数，没有逐 geometry ID/scene owner/首次注册时点，因此**无法唯一绑定35到某一人物、车辆或全局静态模型**。父审查可继续核对动态人物/车辆是否已有 “35个独有几何” 的固定模型及何时首次可见。若要改验收方法，需保留本次 FAIL，固定新的诊断或可证明的预热策略，并重新绑定方法/源码独立验收；不能只放宽35阈值、自动重复至数字恰好一致或修改旧原始记录。
