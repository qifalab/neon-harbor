# south-086 真实资产试点：运行时只读审查

审查时间：2026-10-04T18:22:58.555249+00:00。对象为 `/workspace/scratch/neon-harbor-art-pilot`，对照主目录 `/workspace/scratch/neon-harbor`。未编辑项目、构建、启动浏览器/GPU、提交或发布；此文件是唯一写入物。结论：当前接入方案在静态审查和实际 GLB CPU 解析层面可继续验证；不构成合入、画面或 GPU 内存验收。

## 已审代码与实际入口

- `src/harbor-workshop-pilot.js`: `41b9c98cff2ae790281ad57c2c45548b4980528f62fe4da0ede753c15ebce145`
- `src/metropolis-interiors.js`: `0964caa14781f7297a13a9da6caa0d691f3bfa80c9d4781d1aee540b13635dfc`
- `tests/harbor-workshop-pilot.test.js`: `92ae3d6c66bf6a0d495ffaaed4a24d6ce3a1b456c279db58e26c0b56ed09acc9`

- 主目录 `createInteriorSystem` 独立挂在 scene，三层窗口由 `assembleFloor` 管理；`releaseFloor`/`clearFloor`/`exit`/`dispose` 是清理入口。pilot 已在 `releaseFloor` 最先调用自身 dispose，随后移除楼层。
- pilot 只匹配 `south-086/lobby`。`assembleFloor` 预先追加固定工具箱上方 AABB，替换台钳图形并保留共享材质的代理；原碰撞数据保留。碰撞建立不依赖网络成功、距离或阴影相机。
- `interiors.update` 每步以玩家位置、当前可见楼层、非乘梯移动状态更新 pilot；24 m 装入、32 m 释放，楼层切换/退出会释放。它不在 `onBeforeRender` 中修改可见性，不会被阴影相机或 AO pass 反复触发 LOD。

## 已核实的兼容性

- 真实本地 ES module 导入成功，Three revision 为 185。GLTFLoader、BufferGeometryUtils、SkeletonUtils 与 manifest SHA-256 一致，运行时相对依赖全部存在。GLB 无 required/used extensions，几何和 JPEG 全部内嵌，不需要 Draco/KTX 或第三方运行时请求。现有 build 复制完整 src/vendor/assets，因此后续正式构建可携带这些文件；本次未构建。
- 两 GLB 合计 4,788,776 bytes；CPU 使用真实 loader 解析原 geometry/skin/material 引用，JPEG 仅用测试占位纹理：16,224 triangles、11 meshes、6 texture 引用；台钳 4 个 SkinnedMesh 共用骨架。11 是潜在单次主颜色 pass draw calls，不含阴影，不能当 GPU 性能结果。
- 加载采用 AbortController + generation。不能中止的 parse 迟到后由 generation/ disposed 检查释放；部分失败释放已成功资产，保留代理。资源释放按实例去重 geometry/material/texture/ImageBitmap/skeleton，包括 boneTexture；目前 Three.Cache.enabled=false，也无跨实例资产对象缓存，故不会关闭仍被另一实例使用的 bitmap。以后若启用共享 cache，必须重审所有权。
- GLTFLoader 原生 Standard PBR 保留贴图色彩空间；没有叠加 surface-finish 的程序扰动。高画质全局阴影开启，均衡/低画质全局关闭；模型 cast/receiveShadow=true 与此一致。高/均衡 AO 从同一场景深度重建几何法线，正常处理这些不透明 GLTF mesh；贴图法线参与材质照明而不改变几何 AO。单次色调映射/输出逻辑未改。

## 已发现并处理

`pilot.snapshot()` 原本每次精确遍历 13,256 顶点求 bounds；主目录 `city-exploration.update` 每帧调用室内 snapshot 两次，HUD 另有调用。已通知 owner，以上 hash 对应版本现已在加载后计算一次 cachedBounds，snapshot 只复制数值，unload 清空缓存。计算位于两个模型 position/scale/rotation 配置与 updateMatrixWorld(true) 之后；台钳虽有 skin，但两资产均无 animation clip，pilot 也未创建 mixer 或改动骨骼，当前默认姿态可缓存。如以后允许骨骼、零件或模型变换变化，需要变更时标脏重算，不能继续使用静态 AABB，也不应恢复每帧逐顶点计算。此修复由 owner 在隔离目录完成，本审查未写项目文件。

## 仍须实际验证

1. JPEG 真解码 + High/均衡/低质量切换，实看默认台钳皮肤姿态、工具箱方向、尺度、台面/货箱接地、深度/AO 边缘、阴影与正常曝光；CPU 解析无法证明这些结果。
2. 实际进入、步行到两件物品、楼梯上下行、乘梯、退出及重进；精确箱体 AABB 边界余量很小，保持固定默认姿态，不能动画打开箱盖后仍沿用现有碰撞。现有通行审查为 CPU 路径证据。
3. 网络延迟/404/损坏 JPEG 时代理始终可见；楼层卸载后迟到结果不得重挂。已有测试源码覆盖 dispose 后迟到/部分失败/释放事件；owner 已补第 7 项“旧请求未完成→远离→近返新请求完成→旧请求迟到”重叠 generation 测试；已只读核对它断言新对象保持 ready、仅旧对象释放。owner 报告 7 项 pilot tests 和隔离构建通过，本审查未独立重跑，不把此结果视为 GPU 证据。
4. 浏览器反复装入/退出后查看 renderer.info.memory 和请求记录：几何/纹理回到稳定基线、没有关闭仍在使用的 ImageBitmap、没有对象 URL 累积。dispose 事件计数只能证明释放调用，不能替代 GPU 观测。

本次独立执行：两模块 node --check；本地 r185 loader import；GLB header/embedded-image/extensions 与 addon hash 检查；真实 geometry/skin/PBR-reference CPU 解析。未运行浏览器或整套规则测试。
