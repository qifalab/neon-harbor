# 最终居民通行修订：全规则与构建

2026-10-04，Node v24.19.0。原始 [npm test](rules-final.txt) 为 **302 通过、0 失败、0 跳过**，128,145.787594 毫秒。包含原 298 项与新增 4 项真实车流 / 旧存档 / 转弯 / 换段回归。构建通过，[原始输出](build.txt)保留。发布候选 v0.8.0，146 个资源、52 个源码模块，manifest SHA `7145fa443190896ff24050d518a54fea364ddb0547ddfa71756a33d64c515fb3`；[全部源码、资源及方法摘要](verification.json)逐项核验一致。

首轮正式 v5 检查为 297 通过、1 未通过，完整 [原始失败](rules-first-failure.txt)仍保留。旧集成状态断言在行人已清空实际车道后要求继续停车；[独立诊断与更强测试](../integration-safety/README.md)保留原 80 步车头与绿灯保护，增加未清空时保存 / 恢复、清空后恢复通行和逐步双半径无接触。没有为迎合旧状态修改 runtime。

与已审查 b9 原生 High 近景版本逐资源比较，只改变 `src/harbor-life.js`。其他材质 / 光照 / 招牌 / 家具代码与当次画面一致；这不把旧图追记成完整连续路线通过。新的浏览器路线另存 `../continuous-tour/`，CI、Pages 与在线资源验证另行记录。

旧存档 fixture 的 harborLife / harborTransit 与 [原始自然场景快照](../baseline/deadlocked-state-original.json)字段完全一致，原捕获 SHA 与 provenance 一致；普通产品存档不持久化的旧 ambient car 私有位置未纳入。
