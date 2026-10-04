# Post-checkpoint multiplayer browser verification

2026-10-04 本地真实双浏览器测试 **2/2 通过**，0 失败、0 跳过、0 重试；Playwright 报告总耗时 6.0 分钟。原始输出见 [run.txt](run.txt)。两个浏览器独立进程使用默认 Google Chrome for Testing 151.0.7922.34 和 SwiftShader，640 × 400，测试显式选择低画质；这项验证不评价高画质美术或硬件帧率。

本次修复测试启动冲突：suite 明确关闭 Playwright fixture 自动 trace，两个手动 context 各自启动 recorder，在失败时分别保留完整 ZIP。先前远程 candidate `0330df7ee1042d0f211304b042e01cdf6a0b4d44` 的 `Tracing has been already started` 属于启动失败，当时没有进入游戏操作；不能把它算作实际运动检查。这次成功运行按既有失败保留策略丢弃成功 trace，保存真实操作进度 JSON。

第一场景（1.7 分钟）实际输入完成步行及远端人物显示、接近车门、共用车辆驾驶和刹车、聊天及断开。第二场景（4.2 分钟）通过正常导览前往 x1525 的东湾地址、进入 east-012、步行约 50 米到电梯、选择 level-78，并抵达 y327.785 米；第二浏览器收到相同位置和楼层。电梯前长廊与电梯合计 45.03 模拟秒，保留低于 60 模拟秒的行程断言；远端 SSE 中间高度断言通过，归档包含高度范围。

测试保留 0.6 米人物、1 米共用车及 0.45 米东湾位姿同步误差限制。长直行允许更多墙钟时间，但原步行模拟卡墙预算和移动期间 teleportRevision 断言保持不变，没有写入游戏位置或时钟。[证据摘要](evidence-review.json) 从原始进度与远端位姿文件生成。

实际使用本地静态 manifest `bfe5c2276acffcdcf5adb01d9e9cb9f3e27d6b09fa7393d7ec8ee8ab06d45f3a`，145 个资源文件，revision 为 null；[build-info.json](build-info.json) 保存精确内容，[run-context.json](run-context.json) 保存浏览器、命令、测试、服务端及运行时源文件指纹。本次仅修改测试 tracing 配置，未改运行时或重新构建。这是本地证据，不证明远程 CI 或公网部署成功。

原始浏览器结果：

- [独立客户端操作进度](results/rooms-two-independent-brow-9b405-g-peers-chat-and-disconnect/independent-client-progress.json)
- [低矮窗口多人按钮截图](results/rooms-two-independent-brow-9b405-g-peers-chat-and-disconnect/welcome-short-window-multiplayer.png)
- [东湾电梯前后位置](results/rooms-two-browsers-synchro-b0447--the-former-320-metre-limit/independent-client-progress.json)
- [第二浏览器收到的东湾高层位姿](results/rooms-two-browsers-synchro-b0447--the-former-320-metre-limit/expanded-east-bay-peer-state.json)

[evidence-files.json](evidence-files.json) 列出本目录全部归档文件的 SHA-256（索引自身除外）。
