# 独立副近景工具 f147 只读审查

结论：最新 [capture-workshop-vice-detail.mjs](/workspace/scratch/neon-harbor-art-pilot/tools/capture-workshop-vice-detail.mjs) **scope PASS**，可以在 root 完成主资源套件闭合、selective integration 门禁修正/审查及最终 build 冻结后，用独立明确 GPU GO 执行一次。实际 SHA256 `f147a2d783628e016b37f9ce48103901dada4e65e08759e1ede45f686ed5a993`，23,960 bytes。该结论是代码审查，不是工具已执行、照片已验收或主套件已通过；本人未运行 mocks/tests/build/browser/GPU。

真实行为范围正确：一处公开 Atlas 独立起点，公开 E 入内，真实房门、WASD/Z，沿 x182.8/z−115 → z−113.45 → x180.35 绕到桌侧，最后 ≤.04m 误差，实际 bounds 中心鼠标拖拽瞄准。默认 .65m 玩家半径保持，High/native1280×800/static16.5/FOV65及材质、放置、灯光、产品源码不变。实际 pose 与照片前后快照记录，眼点距中心必须在1.2–1.4m；原路绕开桌面回到房门，公开 E 退出并核对 shell 恢复。

源/served manifest 每件资源前后 SHA、七份 method/dependency/package 前后 SHA、固定独立主方法6bb、空新输出目录及 explicit GPU flag 均保留。未写 debug 坐标、时钟或 storage，也无控制故障、重试或追加第二 context。正常 page/shader/HTTP/request errors 必须为零。GL getError 只在明确单次 capture checkpoint 读取，hot snapshot 不清空 GL 错误。

副近景退出要求 vice 在真实可用、attached、无 readErrors 的同步 release 中严格 **4 geometry / 4 texture**、实际 boneTexture1、3 ImageBitmap close。chest 没有被这张独立副图强称全部 render：真实 CPU7 geometry/3 PBR/3close仍必需，真实 GPU delta只记录合理整数0..7/0..3，不能替代主资源 suite 各次严格7/3。这是正确的不同证据用途，未放宽主6bb套件。

已指出的 teardown 真实性缺口在 f147 得到修正：main try 只置 playableCompleted，未提前置 passed；finally 保留20分钟 hard timer，逐项 bounded context≤10s/browser≤10s/server≤5s且不超过剩余 case 时间，失败项保留原栈和开始/完成时间，后项仍尝试。收齐 cleanup、晚到 errors、case deadline、playable 完成状态后才写 PASS，再把最终 metadata write 的耗时/晚到 errors 纳入检查，超期或错误改写 FAIL。持久化失败也使返回失败，不能靠内存中的 passed 收尾。

primaryError 保留 main try 首先收到的玩法/断言/捕获错误；snapshot/PNG preservation 或 finalization 失败另记录，既有 primary 不被它们替换。没有 primary 而 cleanup 失败时，结果仍 FAIL，原 cleanup errors 位于独立记录；不会因为正常动作完成便忽略收尾错误。捕获失败原名、实际 SHA/错误栈与时间保留。此静态审查未模拟 protocol/teardown 故障，也没有将 helper 内部全部异常机制宣称为新的已验证能力。

最终是否能拍到清楚的台钳细部，必须查看新原生原图。该工具的单张图、Three 注销计数和软件 renderer 均不能支持全城/AAA美术、硬件 FPS、驱动显存 bytes 或全城无泄漏结论。主6bb套件当前仍占用GPU；本工具暂不执行。
