# 新 CPU 阶段的独立静态来源核对

本次审查只读取源码、计算 SHA256 和核对路径；没有运行规则测试、build、Node 静态检查、服务器、浏览器或 GPU，也没有修改已审查的方法、产品文件或 ROOT worktree。唯一写入是本文件。父任务另行执行获授权的隔离 CPU 检查与构建，其结果需要绑定新阶段证据，不能引用之前的 CPU 输出代替。

**当前状态：暂停，最终 dist 核对仍 pending。** 父任务报告 ROOT tour 持续受到 CPU 降速影响，已撤回重 CPU 授权，并于 **2026-10-04 18:58:10 UTC** 仅终止其 own isolated final driver/npm/test 子树，exit **143**。新版完整回归只有部分输出，**不是 PASS**；final build 与最终资产校验尚未启动。收到此指令后，本审查没有进行任何 dist 哈希扫描或重 CPU 校验，只更新此暂停记录。后续 CPU/GPU 工作须等待 ROOT 明确授权。

## 当前来源字节

以下是暂停前的来源核对：以 `docs/qa/art-pilot/browser-method-source.json` 为审查清单，独立读取其列出的 **10 个文件**，逐一计算实际字节数和 SHA256：全部与清单相同，没有缺失或不一致。清单本身 SHA256 为 `b60b9a88f3ea4af813a8d7cf55652c8d64a4950028a9dc9fc2f39a52c65ed37d`。暂停后未重扫这些文件或 dist。

| 文件 | 字节 | 当前 SHA256 |
| --- | ---: | --- |
| tools/capture-workshop-pilot.mjs | 30634 | 8be52d410558e25da2016ce7d83fd669b2647ed27e1904c1a22e3404d62516a9 |
| tools/workshop-review-helpers/walking.js | 7277 | 12e30e93076aea7339e31befdc5e6155e64869a2f3d763d92298f6b302960969 |
| tools/workshop-review-helpers/occupied.js | 5371 | 7698eb877fcaf3f4a60136beb4a0a00a4310985f20437939ce99b9ecd1047bed |
| src/main.js | 53004 | a37f3ed780ca5a293c12c5e8ddc0a8b2b7fbfdfaef335557673899cfde0d0edf |
| src/harbor-workshop-pilot.js | 13149 | 6dd779c3a273bcc447ce829034dc37e53d720dac05e774fdc4852adec433bd32 |
| src/metropolis-interiors.js | 108560 | 290af1e550e027c6d73ff7bab33beeef5c7ee71a8940c0bf233b1554bd96f2e3 |
| docs/qa/art-pilot/BROWSER-METHOD.md | 8576 | f9b2b67767132b635cfe610e4d98a0894f718d2e288c26d369667841caf7c328 |
| docs/qa/art-pilot/browser-route-review.md | 10123 | c05ea0e495b04b6c237414f3dbd08060c6a26d26d0c884dc615ba4397c562fc7 |
| docs/qa/art-pilot/integration.patch | 8412 | 22b14388c37d80f2d1f8c839692c6f09ebac2aff35bb0867d61f0f1132443fd7 |
| docs/qa/art-pilot/browser-diagnostics.patch | 4772 | 74d3ad8554477c1bc48243eebf15e15a582d0d8017ac4deb01d73c4465d85f41 |

清单的 `prepared-not-executed` 状态和未运行 CPU/build 标记属于方法准备阶段的原始记录；本阶段新执行结果应保存在本目录自己的证据中。浏览器方法仍为已审查的 **8be52d41…**，无需修改该方法来运行本次 CPU/build。

## 三个产品模块的诊断范围

- `src/main.js:390` 的 rendererReviewState 只读取 renderer.info 的绘制统计、资源对象计数、program 数、context 是否 lost、shadow 开关和目标状态，并调用现有 contact-occlusion snapshot。没有调用 getError，也没有 render、改质量或写坐标/时钟/存档。
- `src/harbor-workshop-pilot.js` 在真实资产解码时计算 mesh、纹理与图片元数据，并用 WeakMap 缓存。snapshot 复制缓存和 bounds，读取 skeleton.boneTexture 是否已分配；没有每帧遍历顶点、强制渲染或分配 GPU 对象。该模块仍只规划 south-086/lobby 的两件资产，并执行加载、失效请求释放与退出清理。
- `src/metropolis-interiors.js:942` 的生命周期事件最多保留 64 条；snapshot 复制事件和数值元数据，报告当前试点。它没有将 bitmap 或 GPU 对象写入日志，也不新增 renderer 操作。

独立检索上述三个模块及 `src/contact-occlusion.js`，没有 getError 调用；后者的 snapshot 仅返回当前开关、尺寸、统计和 fallback 状态。唯一相关 getError 在 **未运行的浏览器取景脚本**的一次截图检查点，用于记录当时错误；它不属于热 snapshot。

CPU GLTF 解析工具 `tools/inspect-workshop-assets.mjs` 明确用 Texture 占位检查嵌入 JPEG 字节与 PBR 引用。CPU 阶段可以检查节点、皮肤、几何和纹理引用，不能据此推断真实图片解码、GPU 上传或材质渲染正确。

## CPU/build 不需要改写 ROOT

`tools/build.mjs` 从自身 import.meta.url 得到隔离 projectRoot。默认 buildCity 和 buildMetropolis 也由各自隔离文件位置得到输出路径；它们只生成隔离目录下的 `assets/city/chunks`、`assets/metropolis/chunks`，再由 build 复制到隔离 `dist` 并生成 build-info.json。没有对 `/workspace/scratch/neon-harbor` 的输出路径。

已独立核对 assets、city/metropolis chunks、workshop assets、src、vendor、tools 和 tests 的 realpath；均在 `/workspace/scratch/neon-harbor-art-pilot` 内，并非指向 ROOT 的 symlink。指定的三个测试文件只读取相对本测试文件的隔离源码/资源；CPU inspection 的写文件逻辑仅在其 CLI 入口运行，导入测试不会执行该写入。此次 CPU/build 的输出与证据均可在隔离目录完成，ROOT 的 src/dist/tools 无需改写。

这是写入路径与模块入口的静态审查，不冒充 ROOT 前后文件状态比较；父任务的 ROOT 冻结证据仍需单独保存。

父任务随后说明：首轮完整测试树保留了原始失败输出，获准将 ROOT 当前的 harbor-sample-integration.test.js、harbor-life-traffic.test.js 和 fixtures/harbor-life-pre-crossing-repair.json 同步至隔离测试树，再做最终完整回归与构建。本审查只读补看了这两份测试：import 均指向隔离相对模块，fixture 由相对测试文件的 URL 只读加载，没有文件写入或 ROOT 输出路径。最终 dist 核对会等待该轮完成，不把首轮构建当作最终产物。

这些执行状态均来自父任务的阶段通知，本审查没有执行相应命令：首轮旧测试树共 305 条、304 pass / 1 fail，首轮 build exit 0 是历史记录；同步测试树后的最终回归因暂停终止，exit 143，其部分输出不能替代完整回归通过。此前首轮 build 也不能冒充未启动的 final build。

## 构建后的独立核对

**Pending，因暂停未执行。** 待 ROOT 明确恢复授权、父任务完成 final build 并通知后，才核对新 dist。待核对三个诊断模块、两件 GLB、全部本地 Three/vendor 文件与源字节，以及 dist/build-info.json 的对应 SHA。没有做 dist 哈希扫描，没有最终构建产物通过结论。

## 结论边界

暂停前的来源核对与已审查清单一致，模块范围没有扩大，本次 CPU/build 的路径不要求重写 ROOT，也不要求重新给出视觉结论。**新版完整 CPU 回归、final build 和 dist 验证尚未完成。** 将来 CPU/build 成功也只能形成当前版本的结构和构建证据；真实 High 材质、阴影/AO、原生行走、截图品质与 GPU 资源基线仍等待独立浏览器执行。
