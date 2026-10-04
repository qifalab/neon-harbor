# 原生近景工具首次启动失败

首轮运行在进入经典街景后等待第一人称视角超时，180 秒。实际失败快照为 started=true、paused=false、streaming.pending=0、failed=0、firstPerson=false，页面/控制台/HTTP 错误数组为空。

工具在 #start 的异步准备完成前发送 V，该输入被产品的暂停/加载控制正确忽略。没有发生房间、街道或家具通行断言；不能将该轮记为近景通过或渲染失败。

原工具字节 [capture-sample-review-original.mjs](capture-sample-review-original.mjs)、[失败元数据](metadata.json)、[原始运行输出](run.txt) 与 [实际失败画面](failure-original.png) 保留。修订先观察 started、未暂停和加载完成，正常聚焦画布，再发送一次 V；未改引擎、画质或时间阈值，没有自动重试。修订后的独立运行另记。
