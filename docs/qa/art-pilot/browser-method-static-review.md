# 原生工坊取景方法的静态审查

本审查只读取隔离 worktree 的脚本、路线说明和诊断源码，没有运行 Node 检查、浏览器、服务器、WebGL 或巡游，没有改动根 worktree 或产品源码。结果是对**待运行方法**的审查，不能作为截图、材质、阴影、AO、真实移动、帧率或 GPU 释放已经通过的证据。

**最终静态复核已确认本次提出的具体方法缺口得到修正。** 当前取景脚本 SHA256 为 `8be52d410558e25da2016ce7d83fd669b2647ed27e1904c1a22e3404d62516a9`。原生执行、规则回归、重新构建及视觉质量仍待验证；最终范围见下方“最终修订的复核结论”。

被审查目录：`/workspace/scratch/neon-harbor-art-pilot`。首轮取景脚本 SHA256 为 `cbcb62ddb4af434290a8ed767fe7d13836f0daf1b929c0231d20d4f31b9ee349`。首轮发现表的行号属于这个版本；后续方法修改单独绑定 SHA，不能沿用本次静态结论作为运行通过记录。

## 静态可以确认的范围

- 每个场景使用新的浏览器 context。通过可见设置选择 High、关闭时间循环，通过 V 选择第一人称，再通过公开 Atlas 的 `data-visit-building="south-086"` 按钮建立一次独立门口起点。`src/city-guide.js:42` 和 `src/main.js:160` 将该按钮接入实际 `world.travelTo` 功能。
- Atlas 后只通过 E、WASD、Z 和 pointer drag 行走、进入房门、接近家具及离开。脚本只读取 `__NEON__.snapshot()`；没有写坐标、镜头、时钟、存档或调试状态。公开 E 进入/退出可以改变 teleportRevision；步行阶段单独断言它没有变化。
- `normal` 场景没有网络 route 拦截。先完整预热同一对近景并返回街道，再进行 **3 次额外真实 E 进入、步行接近、E 返回街道**。每次比较真实 `renderer.info.memory` 的几何和纹理对象数，要求与预热街道基线严格相等，没有放宽误差。
- 两件资产 ready 时检查 11 个 mesh、16,224 个三角形、11 个 geometry、6 个纹理，读取真实解码对象的 1,024×1,024 尺寸。台钳保留 skin，近景后读取实际 boneTexture 数。这些检查比只看 dispose 调用计数强，但仍需运行才有结果。
- 取景使用实际到达的位置和资产世界 bounds 中心计算镜头，记录原生 1,280×800 图片及 SHA、实际姿态、High/shadow/contact-occlusion 开关、simulationTime、teleportRevision 和 room ID。热 snapshot 不调用 GL getError；只有截图检查点读取一次错误。
- `src/metropolis-interiors.js:1031` 在真实楼层释放时调用试点 dispose；`src/harbor-workshop-pilot.js:132` 对已 dispose、失效 generation 或失败请求释放已完成资产。静态可以看到释放几何、材质、纹理、skeleton 和可关闭图片的代码，不能因此声称运行显存已经恢复。

路线文档里的 2.535 m 主通路、11 段路径和碰撞采样数是先前 CPU 检查的记录；本次没有重新运行这些检查。脚本按文档先从工具箱站位回到 X=182.8 再返回 Z=-115，保留了避开工作台的转角。浏览器是否按该路线真实通过仍待执行。

## 首轮发现的方法缺口（原版本记录）

| 项目 | 被审查位置与实际行为 | 修正或明确边界 |
| --- | --- | --- |
| 失败原图和最后姿态会丢失 | `capture-workshop-pilot.mjs:304` 的 inner finally 先关闭 context 并将 currentPage 设为 null；随后 outer catch 的 `:315–316` 无法再取得在场景内失败的真实页面 | 在 context 关闭前保存失败 snapshot 和原图，再释放输入、关闭页面；失败截图本身失败时保留明确原因 |
| 场景错误收集与通过状态存在时间窗口 | `:231–240` 的监听器使用可变全局 currentScenario；`:302–304` 在关闭 context 前断言 errors=[] 并标记 passed | 监听器捕获固定的 scenario 对象；完成场景的异步请求检查并关闭/解绑后再决定最终状态。保留 teardown 错误并准确分类，避免后一个场景接收前一个场景的事件 |
| 冻结校验没有覆盖完整实际运行依赖 | `:33–38` 仅校验 src/、vendor/three/addons/、assets/harbor/workshop/；省略 index.html、styles.css、Three 核心与其他被加载的城市/材质资源。`:306–310` 也只再次校验同一子集 | 运行前后校验完整 build manifest 的实际服务文件，并记录必需文件集合；方法文件的 methodHashes 也应在结束时复核。仅保存 manifest SHA 不能替代验证其余文件内容 |
| 设置/服务启动失败没有变为失败记录 | `:60–64` 的 dynamic imports 和 server.listen 发生在 metadata 写入 running 之后、outer try 之前 | 将初始化放入可记录失败并清理资源的保护范围；不能让导入或端口占用错误留下永久 running 的元数据 |
| 截止时间与说明不一致，也不是外层硬截止 | `:66–67` 是整个脚本 60 分钟；路线文档要求单次任务 15 分钟。faceRoom 使用固定 30/15 秒，若干 locator、evaluate、launch、close 不取 remaining。asset-ready 和截图默认上限也为 180 秒 | 明确单次路线与整个三场景 suite 各自预算；实现有效的外层截止和输入/页面清理，或收窄“硬截止”的表述。不要把超时上限写成已测耗时 |
| route.fulfill 失败被过早判为中止 | `:284–285` 将任何异常标成 request already aborted | 原样记录 release-attempt failure；仅依据实际 requestfailed 的 ERR_ABORTED 或其他 AbortError 证据判定中止 |
| 镜头输入隐含 sensitivity=1 | occupied.js `:61`、取景脚本 `:175` 固定除以 .005/.003，没有读取 sensitivity。当前新 context 的源码默认确为 1 | 显式检查 sensitivity=1，或按实际只读 settings.sensitivity 计算输入。路线说明要求检查 pitch 的允许范围，但脚本目前仅 clamp 比值，没有检查目标 pitch 是否可达 |

上述是证据方法的缺口，不能据此断言资产或产品已发生对应运行错误。

## 修订后的静态复核

第二次读取的取景脚本 SHA256 为 `6c7c2d541ae4395e4b46a1035e37e57dcbe57168d05d047542a25bd1c0d4fe26`，occupied helper 为 `7698eb877fcaf3f4a60136beb4a0a00a4310985f20437939ce99b9ecd1047bed`，harbor-workshop-pilot.js 为 `6dd779c3a273bcc447ce829034dc37e53d720dac05e774fdc4852adec433bd32`。试点资源诊断已用 WeakMap 缓存解码时的结果，热 snapshot 读取缓存和实际 boneTexture 数。其余产品源码 SHA 与首轮表格相同。这是方法修订的复核，没有执行浏览器。

已确认修正：完整 manifest 文件与源文件在运行前后校验，方法文件也在结束时复核；动态导入和 listen 进入错误保护范围；普通场景失败先读取姿态和原图再关闭 context；监听器绑定固定 scenario，关闭时中止请求单列 teardownEvents，关闭后重新检查错误才标记 passed；fulfill 异常改为中性失败标签并附实际 abortEvidence；检查新 context 的 sensitivity=1；faceRoom 可使用剩余预算；若工具箱实际在 dispose 后解码，必须检查其随后释放，以及 7 个 geometry、3 个纹理和至少 3 个图片关闭。

这个版本增加了 60 分钟整体定时关闭，以及 normal 40 分钟、每个故障场景 10 分钟的阶段定时关闭。静态复核仍指出：截止回调立即关闭页面，因此超时后的原图/姿态不可保证；标记 passed 前还应明确拒绝 hardDeadlineReached。路线说明仍是首轮 SHA 的单次 15 分钟文字，需要明确它与三场景、多循环 suite 的区别。`createStaticServer` 本身仍在 try 外；当前保护已覆盖典型的 import/listen 失败，但没有覆盖该调用的所有失败。

`delayedChestDecodedAfterExit=false` 也不能单独证明 abort。任何中止结论必须以实际 ERR_ABORTED/requestfailed 记录为依据；没有对应记录时只能报告没有观测到迟到解析。

## 最终修订的复核结论

最终读取的取景脚本 SHA256 为 `8be52d410558e25da2016ce7d83fd669b2647ed27e1904c1a22e3404d62516a9`。完整方法说明 BROWSER-METHOD.md 为 `f9b2b67767132b635cfe610e4d98a0894f718d2e288c26d369667841caf7c328`，修订后的 browser-route-review.md 为 `c05ea0e495b04b6c237414f3dbd08060c6a26d26d0c884dc615ba4397c562fc7`。helper、产品诊断源码维持第二次复核的 SHA。

最后剩余的方法缺口已修正：

- `stopForDeadline` 立即记录超时标记和最后已观察事件，分别最多用 2 秒尝试实际 snapshot 和原生图片，保存无法取得证据的原因，再关闭页面/浏览器。deadlineJobs 在清理时 joined 后再次保存，未将未取得的图片写成成功证据。
- context 关闭之后，passed 断言同时拒绝阶段/整体超时标记，并检查实际阶段截止时间。最终整体 passed 之前检查实际整体截止时间、清除整体 timer，然后才异步保存。若清理时已启动的超时任务带来标记，结果会强制改为 failed；“最终写 passed 期间计时器触发”的窄竞争已关闭。
- `createStaticServer`、动态导入和 listen 均在保护范围内；普通场景异常在关闭 context 前尝试取证，超时取证明确是有界尝试，不保证 GPU 无响应时仍能得到原图。
- 路线文档将 15 分钟写为单次一对近景的建议，完整方法明确为整体 60 分钟、正常四次进出 40 分钟、404 和延迟各 10 分钟。最多额外 4 秒的截止证据尝试也明确说明，不再将单次路线与整个多场景 suite 混为同一预算。
- 延迟结果单独保存真实 delayedChestAbortEvidence。没有迟到工具箱解码不能冒充请求中止；如果实际发生迟到解码，原有释放断言仍保留。故障场景没有资源对象基线测量，其结论仍限制为已观察释放事件。

这里的“已修正”仅指源码与说明中的已审查逻辑。审查没有运行维护者记录的六项 `node --check`，没有重跑 CPU 规则、重建 dist 或生成原图。BROWSER-METHOD.md 和来源清单明确说明旧 CPU/构建证据绑定添加诊断前的版本；后续必须重新回归、构建和冻结最终字节。没有原生结果时，不得把当前静态审查标成截图通过、模型品质通过或 GPU 基线已经恢复。

## 失败场景的结论上限

`404` 场景独立拦截工具箱请求，等待 failed、fallback 可见及已完成台钳被释放。它不会把 fallback 截图标成官方模型近景。`delay-exit` 在工具箱 fetch 被持有时等待真实台钳解码，再走到真实出口按 E；试点 dispose 会先 abort fetch，所以一般测到的是 **请求中止 + 已解码台钳在楼层 dispose 后的释放**。当前脚本限制文字对此说明准确，没有把未完成工具箱解析冒充 late parse。

最终方法仍有三个必须保持的边界：

- 持有 fetch 再退出不会强制发生真实的迟到工具箱解析。如果最终 `delayedChestDecodedAfterExit` 实际为 true，当前方法已要求其在 disposed 后释放，以及 7 个 geometry、3 个纹理和至少 3 个解码图片关闭；只有实际运行记录才能确认该分支是否发生并通过。
- 404 和 delay-exit 没有故障前后的 `stableMemory` 基线比较。因此即使这两个场景通过，也只能说明对应生命周期事件和回退行为；“实际 Three 对象数回到街道基线”目前仅由 normal 的三次循环覆盖。
- 该方法覆盖真实 E 退出造成的楼层销毁，没有实体验证 32 m 距离阈值或楼梯切换造成的按需卸载。这些路径不能并入本次原生验证的已覆盖范围。

## 尚待执行与视觉审查

完成方法修正、重新构建并冻结实际服务字节后，仍需经父任务允许再执行原生浏览器方法。需要保留每个场景的完整 metadata、真实原图、运行错误、资源计数样本及独立构建 SHA；失败不能抹掉已有原图或改写为 passed。图片还需人工确认两件官方模型确实可见，桌面接触、台钳下伸部件、工具箱尺度、阴影和 AO 正确。

`renderer.info.memory` 是 Three 追踪的资源对象数，不是驱动实际分配的字节数；SwiftShader 的 FPS 不能作为硬件性能结论。两件工坊资产及这个独立 Atlas 起点也不能证明整个港湾已经达到高品质或完整城市 art 验收。

## 首轮绑定的文件 SHA256（历史字节）

| 文件 | SHA256 |
| --- | --- |
| tools/capture-workshop-pilot.mjs | cbcb62ddb4af434290a8ed767fe7d13836f0daf1b929c0231d20d4f31b9ee349 |
| tools/workshop-review-helpers/walking.js | 12e30e93076aea7339e31befdc5e6155e64869a2f3d763d92298f6b302960969 |
| tools/workshop-review-helpers/occupied.js | 3b4efc83b7a2f0762fd242f8eed005df3be86d52d91a8203fd30eb68309e8cd1 |
| tools/server.mjs | 7cab11ba7366dcc6b39a8be794031747a1342b37ad9f73825a4bcca85007e388 |
| src/main.js | a37f3ed780ca5a293c12c5e8ddc0a8b2b7fbfdfaef335557673899cfde0d0edf |
| src/harbor-workshop-pilot.js | 156b39d07762891f58c0368eddc2ac6a594d01b8fa49a15e511784e2cddc6c83 |
| src/metropolis-interiors.js | 290af1e550e027c6d73ff7bab33beeef5c7ee71a8940c0bf233b1554bd96f2e3 |
| docs/qa/art-pilot/browser-route-review.md | 19db759f96f5e9c8ff09d7a376fedf0990053b2f747e5305fbabd8751abc5526 |
| dist/build-info.json | ab9911238cc7e3550e5353ae02af3a53e9b7c61992e455b4724572a69b697d4e |
