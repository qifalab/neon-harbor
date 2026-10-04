# 原检查点覆盖补齐后的候选验证

记录日期：2026-10-04。保留原 `32ee844` 检查点，对照补回全城表面、楼宇用途和导览惰性生成；多人服务共用实际海岸与山地高度。

本地完整规则 298/298 通过，0 失败、0 跳过，82.22 秒。静态构建通过，145 个资源指纹文件；本地 manifest SHA-256 为 `bfe5c2276acffcdcf5adb01d9e9cb9f3e27d6b09fa7393d7ec8ee8ab06d45f3a`，revision 为空。原始输出见 [rules.txt](rules.txt)、[build.txt](build.txt)，源码、测试及资产摘要见 [verification.json](verification.json)。

规则与构建采集时 HEAD 为第一候选 `3a81a74`，补齐改动尚未提交；随后以 `0330df7` 提交，所附文件摘要标识实际受测代码。第一候选远程失败见 [首轮记录](../release-ci-first/README.md)。

- [0330 完整远程 CI](remote-ci/README.md)：11 个游戏分片、27 个浏览器场景通过；多人录像启动失败，整轮失败。
- [实际住宅电梯复核](living/README.md)：本地 1/1 通过，无重试；捕获首个运动与抵达帧。
- [多人配置修复后的双浏览器实走](multiplayer/README.md)：本地 2/2 通过，无重试；包含共用车辆、聊天及东湾 78F 高度同步。
- [原生 High 同条件昼夜海滨](harbor-comparison/README.md)：真实游戏、1280×800、相同浏览器、机位与时刻；静帧已查看，保持程序化美术与软件渲染限制。
- [近景采集首次启动失败](native-startup-failure/README.md)：V 在异步加载完成前被忽略；原图与状态保留，修复采集操作后另行采集。

原生室内近景、连续港湾路线及最终公开发布另行归档；不能由规则、独立截图或局部通过推断整轮通过。
