# south-086 真实资产隔离试点

这是待审查的工坊美术试点。独立 worktree 为 `/workspace/scratch/neon-harbor-art-pilot`，从 `0330df7ee1042d0f211304b042e01cdf6a0b4d44` detached 创建，没有改变任何分支引用。根 worktree 的源文件、dist、tools 和正在运行的完整 tour 未由本试点修改。本轮没有运行浏览器、WebGL 或第二个 GPU。

后续已准备 [真实浏览器验证方法](BROWSER-METHOD.md)，并增加最小只读诊断。ROOT 确认 GPU 释放并重新授权 CPU 后，**同一已审查方法 / 产品版本的最终全量 Node 309 / 309 通过，构建及156文件 source / served / manifest 精确一致**，见 [正式最终 CPU / 构建记录](cpu-validation-final-2026-10-04/README.md)。新版旧测试树的唯一语义失败、同步后因 tour 降速终止的部分记录仍原样保留于 [前次 CPU 记录](cpu-validation-2026-10-04/README.md)，没有覆盖或改写。下方 15 项早期 CPU / 构建证据绑定加入诊断前的版本；当前最终证据位于新目录。当前方法源 SHA、明确预算及新增范围见 [browser-method-source.json](browser-method-source.json)；该清单状态字段是执行前记录。尚未执行浏览器、服务器或 GPU，等待根代理明确 GPU GO。

已从根目录按原字节复制当前 `compact-interiors.js`、`harbor-district.js`、`harbor-shop-defs.js`、`harbor-life.js`，以保留已完成修改；[快照哈希](base-snapshot.json)和[相对 0330 的已有修改](isolated-overlay.patch)单独记录。这四个文件不是本试点新增实现，不应作为试点合入时的覆盖清单。

## 两件正式资产

资产取自已核实的 Poly Haven 官方 glTF 下载及其实际 BIN、全部 1K JPEG。每个下载文件均核对官方 MD5；原 glTF SHA 也与 [verified-sources.json](verified-sources.json) 一致。原始 glTF、BIN、JPEG 和 API 元数据保存在 [sources/](sources/)，正式自包含 GLB 位于 `assets/harbor/workshop/`。这里没有将现有程序盒体导出冒充外部模型。

| 资产 | 作者 | 原始三角 | 原始 mesh | 材质 / 纹理 | GLB 字节 |
| --- | --- | ---: | ---: | ---: | ---: |
| [bench_vice_01](https://polyhaven.com/a/bench_vice_01) | Antanas Kep：建模与纹理；Yann Kervran：绑定 | 2,864 | 4，均保留 skin | 1 / 3 | 2,434,304 |
| [metal_tool_chest](https://polyhaven.com/a/metal_tool_chest) | John Hutcheson：建模与纹理；Yann Kervran：绑定 | 13,360 | 7 | 1 / 3 | 2,354,472 |

两件均为 [CC0-1.0](https://polyhaven.com/license)。[正式清单](../../../assets/harbor/workshop/asset-manifest.json)记录作者、官方 URL、下载 MD5 / SHA256、生成 GLB SHA256、处理方式。打包仅合并二进制并将原 JPEG 嵌入 bufferView；网格、索引、UV、场景节点、台钳骨骼、原 PBR 材质及纹理字节保留，没有简化、重编码或烘焙绑定。官方 1K glTF 引用共享的 4K / 8K BIN URL，1K 选择仅决定纹理分辨率。

`metal_tool_chest` 实际是可提携的开盖金属工具箱，尺寸约 0.685 × 0.652 × 0.407 m；它不是落地抽屉工具柜。本试点遵循真实形态，用它作为工坊共用工具箱。

## 放置、加载与通行

仅 south-086 的 lobby 工坊使用资产；其他地址、楼层、居民和交通逻辑不变。

- 台钳安装在已有工作台顶面 Y=1.175，尺度 1，绕 Y 转 π/2。保留原绑定默认姿态；手柄最低点低于台面约 8.6 cm，底座落在台面，未将整个模型抬离台面。
- 工具箱按统一尺度 0.9 放在左侧已有货箱顶部 Y=0.895，约 0.617 × 0.587 × 0.366 m；原货箱仍在。新增碰撞 AABB 只覆盖上方工具箱，全部原碰撞、楼梯与电梯保留。
- 当前工坊近于 24 m 才请求两件 GLB，保持到 32 m；离开当前楼层、乘电梯或退出建筑即释放。根地图不提前下载，未设全局模型缓存。
- 加载中与失败时保留简化台钳 / 工具箱代理，原工坊仍可通行。两件都成功且 PBR 通道完整后再替换代理；AbortController、generation 和 late-dispose 阻止已退出楼层被异步回填。
- 释放几何、材质、纹理、台钳 bone texture 和独占 ImageBitmap；静态包围盒在加载后缓存，snapshot 不每帧遍历顶点。

[实际世界坐标与 AABB](placement-evidence.json)记录全部变换及原碰撞一致性。[通行审查](circulation-review.md)给出主通路保守净宽 2.535 m、工坊保留的 2 m 净空带及真实玩家半径的 1,476 个 CPU 路径样本。原实体楼梯宽度仍为 1.6 m；2 m 要求针对主通路，没有将楼梯宽度误报为 2 m。工具箱在货箱两侧仅约 1.58 mm 余量，必须保持归中，后续改姿态需重新检查包围盒。

## 本地依赖与预算

现有 THREE 为 r185。官方 [GLTFLoader](../../../vendor/three/addons/loaders/GLTFLoader.js)、BufferGeometryUtils 和 SkeletonUtils 同为 r185、MIT，唯一修改是将裸 `three` import 改为本地相对路径。[依赖清单](../../../vendor/three/addons/manifest.json)包含原 URL、源 SHA、修改后 SHA 和许可；运行时无 CDN 或额外压缩解码器。CPU 检查才使用纹理占位钩子，浏览器实际使用原 GLTFLoader 解码内嵌 JPEG。

两 GLB 合计 **4,788,776 bytes**；连完整原下载归档、API 元数据和本地 loader 共 **9,819,438 bytes**，低于 12 MiB 目标，详见 [resource-budget.json](resource-budget.json)。两件近处合计 16,224 三角、11 个 mesh、2 个独立材质、6 张 1024² 纹理；11 是潜在主颜色通道绘制次数，未测 shadow / AO 通道总调用或 FPS。六张 RGBA 纹理连 mip 粗估约 32 MiB，未包括几何、阴影、AO、驱动及解码开销，实际 GPU 总占用待测。

现有构建递归复制 src / vendor / assets，无需改构建方式。[构建复制检查](build-copy-verification.json)核对正式 GLB、代码及 loader 与 isolated dist 字节 / build-info SHA 一致。

## CPU 验证与边界

[Node 验证原输出](node-validation.txt)记录 15 项全部通过：原始源 / GLB 字节及哈希、完整绑定及 PBR 引用、范围与通行、24/32 m 迟滞、成功 / 失败回退、各类资源释放、异步退出和新旧请求交错竞态，加上既有 compact 全楼层通行及电梯遮挡检查。JPEG 由 Pillow 独立验证为 1024² RGB，未通过浏览器解码。测试和资源计数不代表美术质量判断。[独立运行时审查](runtime-review.md)也明确区分其只读检查和实现者报告。

可在这个 worktree 重现，所有命令仅用 CPU：

```sh
python3 tools/acquire-workshop-assets.py --offline
node tools/inspect-workshop-assets.mjs
node tools/inspect-workshop-placement.mjs
node --test tests/harbor-workshop-pilot.test.js tests/compact-interiors.test.js tests/interior-occlusion.test.js
npm run build
```

仍需 tour 结束后单独完成真实 JPEG 解码、实际眼高 / 使用距离下的模型辨识、原地图 High / AO / shadow 近景、光照与材质、反复进出后 renderer/GPU memory、加载时延和性能评审。工坊面积大，现有桌板、工具板、墙体和其他家具仍多为程序几何；本试点没有补齐完整港湾品质，不宣称达到 AAA。没有生成未拍摄的截图，也不会未经视觉评审直接合入。

## 可选择性合入清单

视觉与性能评审通过后，可选取下列明确差异，不应复制覆盖整树：

1. 新增 `src/harbor-workshop-pilot.js`。
2. 新增 `assets/harbor/workshop/` 两 GLB、清单与 CC0 说明。
3. 新增 `vendor/three/addons/` 三个同版 loader 依赖、MIT 许可及清单。
4. 对当时根版本的 `src/metropolis-interiors.js` 审查并应用 [integration.patch](integration.patch)：只添加该地址 / 楼层的装配、update、dispose 和诊断挂钩，不能直接覆盖文件。
5. 新增 `tests/harbor-workshop-pilot.test.js`、三个 `tools/*workshop*` 获取 / CPU 检查工具及本 QA 来源归档。
6. 若采用后续真实浏览器审查方法，还需独立审查 [browser-diagnostics.patch](browser-diagnostics.patch) 对 `src/main.js` 的只读 renderer 挂钩、更新后的 pilot 生命周期诊断、新工具与两个 helper 副本；详见 [BROWSER-METHOD.md](BROWSER-METHOD.md)，不是只复制最初资产文件即可观测 GPU 回收。

不要合入 isolated dist、重建的 city/metropolis chunk、四个根快照覆盖件，或把此试点当作完整 tour 的结果。没有 push、部署或自动合入操作。
