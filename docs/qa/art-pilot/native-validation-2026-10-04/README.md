# 首轮原生试点验证：FAILED，已封存

本目录只记录一次已授权、顺序执行的浏览器套件。2026-10-04 19:05:39Z 开始，19:23:13Z 以 exit 1 停止；未重试。normal 首次重进后的全局 Three 计数为 geometry 615 / texture 118，原 warmed baseline 为 580 / 118。原严格断言真实失败。normal 的后两次重进、404 与 delay-exit 均未运行。

两张 PNG 是原生 High、1280×800、真实公开 Atlas 定位后经 E 与 WASD/鼠标接近所得；公开定位属于独立测试设置，不是连续旅程。ANGLE SwiftShader 环境，不代表硬件帧率。实际 11 meshes / 16,224 triangles / 6 个 1024² ImageBitmap 已解码；台钳实际创建一张骨骼纹理。两张采集点的 WebGL errorAtCapture 为 0，High shadow map 2048² 与 AO 1280×800/640×400 已驻留；这些采集点不替代完整套件通过。

台钳可见但在该机位偏暗且较小；开盖红色便携工具箱的把手、漆面与磨损可读。背景桌、墙、货箱和城市仍明显程序化。这里没有整包美术完成或 AAA 质量结论，也不是旧 bench 机位的像素对照。ROOT 的首看原文件按原字节另存，保留其当时措辞。

两个访问都记录实际释放：台钳 4 geometry / 3 PBR texture / 1 skeleton / 3 closed ImageBitmap；工具箱 7 geometry / 3 PBR texture / 3 closed ImageBitmap。全局 +35 geometry 已在 cycle1 室内移动期间出现（sim 64.4167→67.0833），退出时 geometry 626→615 减 11；资源身份尚需只读调查，不能凭相同数字归因。

**证据缺口：failure PNG 未保存。** 原方法 screenshot 的 catch{} 吞掉异常，故具体截图失败原因未知。metadata.json 保存完整 failureSnapshot 与原断言栈；没有补拍、重开、合成或改写失败现场。

19:24:43Z 进程检查确认本方法 PID 已退出、无活动 Chromium、5208 已关闭；没有杀 ROOT 或其他进程。raw stdout 为空；raw stderr 和 invocation-original.json 原字节保留。

冻结方法 SHA256：8be52d410558e25da2016ce7d83fd669b2647ed27e1904c1a22e3404d62516a9。build-info SHA256：8f9186c1a3da3ebf1b3cc25db9adcaa66945871a06565bbd4e4cbfbcf8859204。frozen-source/ 收齐全部 156 个实际 served source 与 6 个方法/依赖声明原字节；每份均核对 metadata 中 SHA。CPU byte consistency 检查重新通过全部 156 source/served/manifest、14 下载记录、6 内嵌 JPEG 和 ROOT freeze；其 status:passed 只属于字节检查，原生套件仍 FAILED。

normalized-resource-evidence.json 摘录原始计数、时间线与释放事件。archive-ledger.json 对关闭后全部文件逐份列出 SHA256，避免将后续修订混入首轮结果。原始 metadata、PNG、pose、日志及 8be52 方法均未修改。
