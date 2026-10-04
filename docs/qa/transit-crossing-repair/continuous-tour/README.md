# 公交过街修复后的首次连续港湾路线：失败原始证据

本目录记录修复后的一次独立实际执行，进程退出码 1。原定路线没有完成，不能作为完整港湾样板验收通过的证据。首次旧死锁运行仍保留在 [art-final/continuous-tour](../../art-final/continuous-tour/README.md)；本次执行前后，其 11 个原始文件 SHA 均未变化。

本次已真实从 south-079 住宅二层房间开始，步行下连续楼梯、E 出楼、沿街走到公交站、E 登上 harbor-bus-2、走上实体楼梯到上层，在真实停靠开门时按 E 保持上层乘客状态，再沿实体楼梯回到下层车门。之后等待实际市场站下一次停靠，原定 600000ms 等待在 2026-10-04T18:03:10.752Z 超时。此处没有自动重试、改动产品或方法、提高时限、补足时长、再次 Atlas 旅行或坐标/时间/dt/存储注入。

失败时真实只读 fullsnapshot 的公交中心为 (152.1557289239293, 0, 157.57010246750517)，speed=3.747436523432566，held=null，trafficState=cruise，下一站 harbor-bus-market，secondsToArrival=7.312630634471901。乘客在 lower 层，teleportRevision=7，现金 1200。这些数据支持本次已通过首次运行的静止死锁点，并在超时时继续行驶；它们不证明市场站已实际到站或整条路线已走通。

尚未达到：市场站下车、玩家购买、沿线商店实际房门和房间、小轮双层楼梯渡北、对岸室内与退出、渡轮返回、双层街轨车、返回原住宅、暂停公开导出与重载账本验证，以及安全门口恢复后真实 E 入楼步行回二层。上层 E 证据只覆盖当时上层楼梯口的楼层高度和车门接触联合限制，不将其扩张为单独楼层条件证明。

## 墙钟与视频

- case 开始：2026-10-04T17:40:39.944Z。
- 视频开始：2026-10-04T17:40:40.033Z。
- 连续路线开始：2026-10-04T17:42:47.322Z；之前仅用公开 Atlas / E 设定住宅起点。
- 首次失败：2026-10-04T18:03:10.752Z；实际连续路线已观察 1223430ms（20 分 23.430 秒），但路线未完成。
- 请求关闭录像：2026-10-04T18:03:25.518Z；录像 finalize 完成：2026-10-04T18:03:32.885Z。
- 全部清理与元数据完成：2026-10-04T18:03:33.020Z；从 case 开始至完成 1373076ms，低于原 90 分钟预算。

原始单文件 [WebM](video/page@9b10f558e0c2fb2cda908907c928516a.webm) 为 VP8，512×320，独立 ffprobe 与原 metadata 均为 1367.12 秒，29551227 字节，SHA256 14c7d3e503c72069d1381c606b7d518e00cb9f6bf32ee855d5dbf1cbe7970311。它包含公开启动、起点设置、完整等待及失败清理，没有剪辑；22 分 47.12 秒视频长度不能当作完整路线通过。视频当前仅为本地证据，published:false、publicationUrl:null，尚未宣称公开上传。

## 证据与冻结版本

本次默认 High 断言通过后，以公开设置选择 Low；实际 GL drawing buffer 为 409×256，Chromium 151.0.7922.34 / SwiftShader。此处只提供真实按键连续玩法功能证据，不提供原生美术验收或硬件 FPS 证明。

- build-info SHA256：7145fa443190896ff24050d518a54fea364ddb0547ddfa71756a33d64c515fb3，146 个构建资源。
- 执行方法 SHA256：b73be2ca6a4e5008f71c51cef33312894cbeb5c41b441912a39c6e03d8c37d4b；原始 bytes 保存为 [capture-harbor-tour-original.mjs](capture-harbor-tour-original.mjs)，4 个方法依赖 SHA 全部核验。
- src/harbor-life.js SHA256：034cb5b4b1851071507c30c0cd36a250f0e8252c394ac28df6627de18b0acc5d；全部 52 个 src 在运行前后与冻结版本相符。
- [metadata.json](metadata.json) 保留阶段实际 pose / clock / revision / 库存与账本、所有 errors、方法/资源/源码 SHA 及视频 metadata；errors=[]、cleanupErrors=[] 不等同于路线通过。
- [failure-full-snapshot.json](failure-full-snapshot.json) 是失败处理时对 __NEON__.snapshot() 的真实只读原始响应；其 simulationTime=353.5166666666738。
- [failure-autosave-progress.json](failure-autosave-progress.json) 是只读导出的既有 localStorage 原始 JSON；harborTransit.time=348.03333333334547，属于自动存档时刻，不能替代 live clock。没有写入或恢复该文件。
- [capture-original.log](capture-original.log) 是原 /tmp log 的逐字节副本；[post-run-verification.json](post-run-verification.json) 为独立退出、全指纹、视频和旧证据核验。
- [evidence-files.json](evidence-files.json) 列出原始证据与补充说明的文件大小和 SHA256；不对自身建立循环哈希。

当前产品的室内存档安全恢复在原建筑门口，精确房间/楼层恢复仍为后续工作；本次没有达到重载阶段，因此没有验收该行为。本次只记录首次失败，不对后续修复或再次执行作结果声明。
