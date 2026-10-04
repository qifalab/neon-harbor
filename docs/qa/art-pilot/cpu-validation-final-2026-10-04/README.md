# 正式最终 CPU / 构建冻结验证

本次在 ROOT 确认 GPU 释放后获得 **CPU-only** 授权，使用全新目录保存结果。完成时间为 **2026-10-04 19:03:49 UTC**。没有启动浏览器、服务器或 GPU，没有修改已审查的取景方法或产品模块，没有写 ROOT。以下是实现者执行的 CPU 证据，不是独立浏览器或美术评审结论。

**`npm test` 实际 309 / 309 通过，0 失败、0 取消、0 skipped，exit 0。** 总 reporter 时长为 126,696.252385 ms，包含 ROOT 当前根层 302 项 Node 规则与新增 7 项试点测试。`npm run build`、全部文件一致性验证、六项 `node --check` 与 `git diff --check` 均 exit 0。完整命令、真实开始 / 结束时间、exit、原始输出哈希见 [commands.json](commands.json)。

| 证据 | 原始文件 |
| --- | --- |
| 全量 Node 规则 | [stdout](node-rules.stdout.txt)、[stderr](node-rules.stderr.txt) |
| 最终构建 | [stdout](build.stdout.txt)、[stderr](build.stderr.txt) |
| 全量源 / served / manifest 验证 | [stdout](built-assets-verification.stdout.txt)、[stderr](built-assets-verification.stderr.txt) |
| 正式阶段状态 | [run-summary.json](run-summary.json) |
| 前后源码、ROOT runtime、旧记录冻结 | [freeze-verification.json](freeze-verification.json) |

构建 `dist/build-info.json` SHA256 为 **`8f9186c1a3da3ebf1b3cc25db9adcaa66945871a06565bbd4e4cbfbcf8859204`**。全部 **156 个实际 served 文件**均由 manifest 覆盖，并逐文件核对 source 字节、served 字节及 manifest SHA 完全一致。[完整字典](served-source-dictionary.json)保存每个文件的源 / served 字节数与 SHA；[一致性摘要](build-consistency-summary.json)保存实测总数。

[ROOT frozen52 源逐项比较](root-frozen-source-comparison.json)确认 ROOT 当前文件仍匹配冻结构建；isolated 只有已审查的 `main.js` 只读诊断与 `metropolis-interiors.js` 试点集成不同，另新增 `harbor-workshop-pilot.js`，其余 50 源精确一致。[完整 ROOT runtime 比较](root-frozen-runtime-comparison.json)也核对全部 **146 个 ROOT 冻结资源**的 source / served 字节；仅同两处改动，另有 10 个明确新增试点文件，没有遗漏或意外旧文件。

这 10 个新增 runtime 文件为：试点模块、两 GLB、资产清单、CC0 许可、GLTFLoader、BufferGeometryUtils、SkeletonUtils、MIT 许可与 loader 清单。四份先前从 ROOT 按字节复制的模块仍与 ROOT 一致，不能当作本试点新增变更覆盖合入。

[正式资产字节验证](formal-asset-byte-verification.json)重新核对 **14 条正式下载 / 元数据记录**的 SHA、全部适用官方 MD5、两 GLB 生成 SHA；真实 GLB 中原 BIN、accessors、meshes、nodes、skins、materials、textures、samplers、scenes 与原始 glTF 一致，六张内嵌 JPEG 与官方来源逐字节一致。这里验证字节与 CPU 结构，**没有通过浏览器解码图片，也没有验证 WebGL 材质、阴影、AO 或资源对象基线**。

最终方法 SHA256 仍为 **`8be52d410558e25da2016ce7d83fd669b2647ed27e1904c1a22e3404d62516a9`**。三份产品文件 SHA 为：

- `src/main.js`：`a37f3ed780ca5a293c12c5e8ddc0a8b2b7fbfdfaef335557673899cfde0d0edf`
- `src/harbor-workshop-pilot.js`：`6dd779c3a273bcc447ce829034dc37e53d720dac05e774fdc4852adec433bd32`
- `src/metropolis-interiors.js`：`290af1e550e027c6d73ff7bab33beeef5c7ee71a8940c0bf233b1554bd96f2e3`

[source-before.json](source-before.json)与[source-after.json](source-after.json)保存全部相关源、测试、vendor 和正式资产的实测 SHA。三份获授权 ROOT 测试仍按原字节一致，没有再次复制或弱化。浏览器 `rooms.spec.js` 的已有 trace 配置差异未扩展复制，不在本次根层 Node 集合中。

此前[旧树唯一失败及部分取消](../cpu-validation-2026-10-04/README.md)保持原始字节，未被本次通过记录覆盖。[historical-evidence-before.json](historical-evidence-before.json)保存本次开始前的全部旧 QA 哈希，冻结检查确认整个 CPU 阶段没有变化。早期 `browser-method-source.json` 的状态字段属于执行前历史记录；本目录才是最新同源 CPU / 构建结果。

`run-cpu-validation.py`、`verify-built-assets.py` 是本次实际执行工具的副本，不启动浏览器或服务器。取景方法、截图预算和输入路线仍以 [BROWSER-METHOD.md](../BROWSER-METHOD.md) 为准。**等待 ROOT 明确 GPU GO 后才进行真实浏览器验证**，不将此次 CPU 通过解释为模型美术、原生 High / AO / shadow、失败网络上下文或显存释放通过。
