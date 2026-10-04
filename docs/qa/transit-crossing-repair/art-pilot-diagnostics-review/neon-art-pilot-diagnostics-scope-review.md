# 隔离工坊试点：只读诊断增量范围刷新

本报告是新增的只读/CPU 审查，不覆盖此前 `/tmp/neon-art-pilot-route-scope-review.md` 或其方法、原 stdout、数据及 provenance。旧 `/tmp` 四份证据 SHA 已逐项核对未变。未运行 GPU、浏览器、正式测试或 build，未修改 ROOT 或 isolated 项目文件。

结论：此次增加的 renderer、资源缓存和 64 条事件诊断没有改变三个核心路线地址的物理、入口、楼梯、电梯、保存或交通逻辑。未发现热 snapshot 每帧遍历顶点/mesh 或偷偷取走 GL error 的问题。诊断会增加有界对象复制、JSON 和初始脚本开销，不能写成完全零成本。当前 isolated dist 尚未包含当前诊断源码，仍必须重新正式回归、build、冻结，然后独立原生验收；本审查不是其浏览器通过结果。

## ROOT exact source 对照

逐个实际 src 字节比较，现在相对 ROOT 只有：

| 文件 | ROOT SHA256 | isolated 当前 SHA256 | 范围 |
| --- | --- | --- | --- |
| src/main.js | 15a58cca1506bac5027d2e75098f125fe5546264647dece846180967785f9138 | a37f3ed780ca5a293c12c5e8ddc0a8b2b7fbfdfaef335557673899cfde0d0edf | snapshot 的 renderer 只读扩展 |
| src/metropolis-interiors.js | ea675c4ff01b23e0a3e8dec61831657f4639a3032d1cd7371ad1548e31356155 | 290af1e550e027c6d73ff7bab33beeef5c7ee71a8940c0bf233b1554bd96f2e3 | 原目标地址挂钩加 64 条 audit 历史 |
| src/harbor-workshop-pilot.js | 不存在 | 6dd779c3a273bcc447ce829034dc37e53d720dac05e774fdc4852adec433bd32 | 原局部资产加解码/释放数值缓存 |

其他现有 src 与 ROOT 相同。ROOT manifest 仍为 `7145fa443190896ff24050d518a54fea364ddb0547ddfa71756a33d64c515fb3`。最终取景方法当前实际 SHA 为 `8be52d410558e25da2016ce7d83fd669b2647ed27e1904c1a22e3404d62516a9`，与指定值相同。

完整 ROOT→isolated main/interior 差异保存于 [原始 diff](/tmp/neon-art-pilot-diagnostics-source-diff.txt)；输入/输出字节与全部摘要见 [provenance](/tmp/neon-art-pilot-diagnostics-provenance.json)。当前 isolated dist 的 main、metropolis、pilot 三个摘要均与这些新 source 不符；文档也将以前 CPU/build 结果明确限定在旧版本。不得直接用旧 dist 启动此方法后称已测试当前诊断源码。

## 只读性质和实际成本

`rendererReviewState()` 只在公开 `__NEON__.snapshot()` 被读时返回新对象，读取已有 `renderer.info.render`、memory 数字、program 数、`isContextLost()`、真实 shadow 开关/map/mapSize 及既有 AO snapshot。没有 renderer.info.reset、强制 render、readPixels、修改 GL binding/target、质量、simulation、坐标、clock 或 storage。`contactOcclusion.snapshot()` 原实现也只是复制其状态，渲染路径未改。

main/pilot/interior 热 snapshot 中没有 `getError()`。取景工具仅在显式摄影检查点读取一次 `getError()`，其值进入 metadata 并要求为 0；这次读取确实消耗当时 GL error，工具和方法说明如实标记。频繁状态轮询不会先清空错误队列，因此不存在新增热诊断掩盖摄影前图形错误的问题。

pilot 的 `workshopResourceState()` 在每件资产实际 decode 完成时遍历 mesh/material/texture 引用一次，缓存普通数值、图片宽高/类型/色彩空间和独立 skeleton Set。原成功加载的校验、变换、静态 bounds 计算与实际 dispose 仍在 cold load/release 阶段。hot snapshot 仅复制两个资源 summary、六个图片元数据、两个 bounds，并检查缓存中的一份骨架 boneTexture 是否已分配；不重新 `Box3.setFromObject`、访问顶点或全场景 traverse。

事件 ring 最大 64 条，只保留数值/字符串/图片元数据和释放计数，未把 GLTF scene、geometry、material、Texture、ImageBitmap 或 skeleton 写进历史。decodedResourceCache 是 WeakMap；loaded 状态清空时 cachedBounds/resources/skeletons 同步清空。骨架引用仅为当前驻留对象诊断，不残留在事件历史。

“只读”描述的是公开观察及游戏/renderer 状态：内部诊断仍会创建/更新 cache、audit ring、计数和 assetId 标签。它们不改变放置、collider、信号、调度、交易或保存结果。audit ring 在退出后保留历史供检查迟到释放，因此此后其他地址的 `interiors.snapshot()` 也会复制最多 64 条历史；世界原有每帧调用 snapshot 的地方会承担这项小而有界的复制开销，不能宣称它仅在 086 发生。

当前 pilot 本体为 13,149 bytes，较此前 9,617 bytes 增加 3,532 bytes；main 增加 568 bytes，interior 新诊断又增加少量代码。GLTFLoader 仍为近处 dynamic import，模型/纹理的下载触发和 24/32 米迟滞没有变化。这不是经过硬件测量的性能结论。

## 刷新后的实际 CPU 范围对照

重新运行独立的新 CPU 方法，不覆盖旧方法或旧输出：

- [方法](/tmp/neon-art-pilot-diagnostics-scope-probe.mjs)，SHA `1fdcc39b0838ecb0edd611b56478663bf6df7f2727a2da6610c5b0e5b25fb365`。
- [原始 stdout](/tmp/neon-art-pilot-diagnostics-scope-probe.log)，SHA `c85c4fa4aa9be5fa4f84b701a277fd45812f01a0b6d04a497268563677a511c4`；实际 exit 0，5.0077 秒。
- [实际数据](/tmp/neon-art-pilot-diagnostics-scope-probe.json)，SHA `a5adf70991677a7c8e7283bed9e36518891d21803beef9af2aa58c2e798fc29a`。

两套实际 city 各自注册其 programme registry；220 栋/4,150 层的适用集合依然只有 south-086/lobby，实际建筑目录相同。原 18 个真实 layout 再次相同。south-079、south-095、sail-club 的实际室内系统 collider 数依然为 400、336、692，所有 collider 字节相同；snapshot 去掉新增 `workshopPilot` 和 `workshopPilotEvents` 诊断字段后相同。它们及 085/087/east-001 均不触发 CPU loader 计数，只有 086 触发指定两件。

086 仍为 220→221 个系统 collider，全部原项相同，只增加原来已审的工具箱 AABB。放置、24/32 米 gate 和实际地面路线没有新改动；当前核心路线到该新增物件的最小 XZ 距离仍为 46.55 米。保存代码及所有交通/居民/经济模块与 ROOT exact source 相同。

## 证据绑定和后续必要范围

ROOT 的当前 tour 仍绑定旧 7145/60436。这次只读诊断增量不允许把它的原图、录像或原 manifest 追记成试点新版本同一次实录。此前“旧核心连通性 + 可复核狭窄差异 + 新 pilot 独立原生现场 + 最终候选完整 CI”的组合仍合理，但后三项必须按真实新字节记录。

缓存/64 条 ring 是有界实现审查；尚无此次新版本硬件开销、JPEG/skin/PBR/AO/shadow、GPU 对象回归或故障原生现场结果。既有 15 项旧 CPU 及旧 build 不能作为新诊断代码正式回归通过。当前方法的 404/delay 场景不能把未发生的 late decode 写成发生过，也不能把 Three 资源对象数等同于驱动显存字节。正式重新回归、构建冻结和新原生现场仍须由 root 在独占 GPU 条件下执行。
