# south-086 浏览器验证方法，等待 GPU GO

本轮只准备源代码和执行 `node --check`，未启动服务器、浏览器、WebGL、第二个 GPU 或重建 dist。当前方法不能被引用为验证通过或图像证据。正在进行的根目录 tour 及其方法、源文件和 dist 均未修改。

可运行工具为 [`tools/capture-workshop-pilot.mjs`](../../../tools/capture-workshop-pilot.mjs)。它要求显式 `--gpu-go yes`，此参数仅防止误启动，不能替代根代理稍后发出的 GPU GO。

## 原始方法来源与新增范围

公开输入方法参考根目录 `capture-sample-review.mjs` 的 SHA256 **308aaa98f7be337246ce602e17e7b8ed764d4137afc1f5238d40403545b3d5f6**。原字节副本及 walking / occupied helpers 保存在 [browser-method-reference/](browser-method-reference/)，来源哈希见 [browser-method-reference.json](browser-method-reference.json)。新的方法并非修改根工具：它在独立 `tools/` 使用 helper 副本，occupied 副本仅允许传入剩余超时；原副本未改变。

为了观察真正的 GPU 对象计数和已退出楼层的释放，隔离代码增加只读诊断，范围明确包含：

- `src/main.js` 的 renderer snapshot：`renderer.info.memory` 副本、program 数、`isContextLost()`、真实 shadowMap 开关 / 类型及太阳 shadow target 状态；保留既有 AO 状态。**snapshot 不调用 getError，不读取或改写错误队列。**
- `src/harbor-workshop-pilot.js`：真实 GLTF mesh / 材质 / Texture / 解码图片尺寸在各资产解码完成时计算一次并缓存；snapshot 复制缓存。只有缓存的一份骨架引用用于报告 boneTexture 是否已分配，不每帧遍历 mesh 或顶点。
- `src/metropolis-interiors.js`：加载与释放事件最多保存 64 个，包含真实解码资源和销毁结果；snapshot 克隆数值和图片元数据，不保存 bitmap / GPU 对象到日志。

相应 [main 只读诊断补丁](browser-diagnostics.patch)和[更新的室内集成补丁](integration.patch)可独立审查。该范围超出最初两件资产文件，但没有新 UI、玩法、坐标 / clock / storage debug setter。每个当前源文件和工具 SHA 见 [browser-method-source.json](browser-method-source.json)。上一轮 `node-validation.txt`、`build-copy-verification.json`、`runtime-review.md`、`artifact-hashes.json` 绑定的是添加诊断之前的 CPU 阶段，不能当成本轮新诊断代码已回归通过；收到 GO 后必须重新执行规则测试、构建和源哈希核对。

## 正常上下文

新 context 使用 Playwright 安装的 Chromium 151.0.7922.34，原生 1280×800、deviceScaleFactor=1。可见设置选 High、关闭昼夜自动交替，公开默认时间固定 16.5；按 V 选择第一人称。设置 sensitivity=1 的真实默认值会被只读核对，没有通过状态写入修改它。

公开 Atlas 搜索 `Old Quarter 86` 并点击 south-086“前往门口”。元数据明确记录这是独立起点设置，**不是跨城连续路线**。之后全部通过真实 E、WASD、Z、鼠标拖动：E 进楼，沿中央通路穿 X=198.7 / Z=-115 的普通房门，到台钳站位 (182.8,-114.58) 与工具箱站位 (181.2,-117.7)，沿已验证转角返回，同一 E 门退出。每段正常行走的 teleportRevision 必须不变；E 的公开场景切换单独记录。

[浏览器路线审查](browser-route-review.md)包含实际门口、近景 AABB 中心、眼高、鼠标 yaw / pitch 算法和 CPU 路线余量。工具箱取景后必须先沿 X 回到 182.8，再沿 Z 回门轴；不得走穿工作台。相机只通过鼠标拖动改变，瞄准点从实际只读模型 bounds 得到，没有把名义站位写回状态。

拍照前必须是 `workshopPilot.status=ready`、assetCount=2、fallbackVisible=false、errors=[]。实测对象汇总须为 11 mesh、16,224 三角、11 几何、6 张实际浏览器解码的 1024² Texture，原台钳实际渲染后的骨架 texture=1；这些是对象检查，不把 11 当整场 High / 阴影 / AO 总 draw calls。记录真实 shader console / HTTP / 请求失败，renderer actual shadow target、既有 AO 的三 pass 和 1280×800 / 640×400 尺寸。每次摄影检查点单独读取一次 GL error / buffer size / 真实 renderer；该一次性 getError 会取走当时错误，metadata 明确记录，而频繁 snapshot 从不清空它。

首轮真实近景与退出暖身后，在相同街道点读取连续四个相同 `renderer.info.memory` 样本作为稳定基线。接着 **三次 E 重进、正常穿门接近两件物品、同路 E 退出**，每次等待计数稳定后与该基线严格一致，不任意设置增长容差。原生截图包括首轮两图和第三次复进两图，保持完整 HUD、未裁切或处理。全程正常上下文的非 teardown page / shader / HTTP / 请求错误必须为零；关闭 context 产生的 ERR_ABORTED 请求另行保留，其他关闭期间错误仍会使案例失败。

稳定窗口受 120 秒停止上限约束。动态市民、街区驻留、模型缓存可能导致计数不稳定；若实际不能收敛，记录失败与原计数，而不是据 dispose 调用强称 GPU 内存回收。对象计数不是驱动显存字节，也不是硬件帧率。

## 两个独立失败上下文

正常上下文没有 `page.route`。失败案例在它关闭后各建立全新 context，使用同一公开 Atlas / E / 房门路线；正常零错误数组与故障期预期错误数组独立。

1. **GLB 404**：只将工具箱 GLB 受控返回 404。实际已完成台钳需要销毁，场景保留代理、assetCount=0、fallbackVisible=true，并记录 HTTP404 和与该精确 URL 相关的预期 console 请求错误。正常接近工作台并拍原生代理图，标题明确是失败回退；随后真实 E 退出。其他 page / shader / HTTP 错误仍失败。
2. **延迟后退出**：只挂起工具箱 GLB 的网络响应，允许台钳真实解码；确认台钳三张图已解码而整对仍 loading / 代理可见，然后按正常路径 E 退出。退出后尝试释放挂起响应，记录实际 ERR_ABORTED / requestfailed 证据、neutral fulfill-attempt 结果以及有序生命周期；确认已完成台钳在 disposed 之后释放 4 几何、3 Texture 和真实 bitmap，并且没有恢复楼层。如果工具箱真的在 disposed 后 parse 完成，还必须检查其 7 几何、3 Texture、bitmap 同样销毁。

延迟 fetch 若被 abort，就没有发生“晚到工具箱解码成功”。方法只报告实际发生的 abort 和已经解码台钳的晚释放；`delayedChestDecodedAfterExit=false` 本身不能当作 abort 证据。该方法不强制假造无法中断的晚到 parse；此前 CPU generation 测试另有其严格的晚到场景。两个故障案例验证实际释放事件，不另宣称已经测到 GPU 对象基线恢复；GPU 基线断言属于正常上下文。

## 冻结、超时与待执行命令

方法在启动和完成时核对 **build-info 全部 runtime 文件**的源 / 服务字节 SHA，包括 index、样式、Three core、城市 chunk、材质资产和 GLB；工具、helper、package / lock 的 SHA 也前后核对。源和 dist 不一致立即停止，需要先重新构建隔离版本，不会静默使用旧 dist。

全场硬停止 60 分钟；正常四次进出最多 40 分钟，404 / 延迟各最多 10 分钟，各步骤取剩余预算；镜头 helper 的初始 / 收敛等待也受剩余预算。任何截止触发不能标 passed，最多额外 4 秒尝试保存最后只读 snapshot / 原图，随后关闭 context / browser。若 GPU 卡死无法截图，保存失败原因和最后已观察事件；不会伪造超时截图。常规故障在关闭 context **之前**保存最后 snapshot 与原图。

收到 GPU GO 后，先在这个隔离目录准备本地 dev dependency（若尚无 node_modules，可以 `npm ci --ignore-scripts`；根目录已存在的 Playwright browser cache 可供同版工具使用），然后重新运行 CPU 与构建检查，再独占运行：

```sh
node --test tests/harbor-workshop-pilot.test.js tests/compact-interiors.test.js tests/interior-occlusion.test.js
npm run build
node tools/capture-workshop-pilot.mjs --gpu-go yes --root dist --port 5208 --output test-results/workshop-pilot-review --scenarios normal,404,delay-exit
```

输出目录必须全新。没有执行以上命令，没有提交 / push / 部署 / 根目录修改。本阶段交付的是可审查的方法、只读诊断差异和源 SHA，真实截图、材质质量及 GPU 回收结果仍为空。
