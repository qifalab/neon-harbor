# 最终连续路线 a8ff：有限 scheduled wait 预算只读审查

结论：**scope PASS**，理由支持在执行前固定此有限 cap。未发现产品源码或原验收断言弱化；可由 root 在最终 ART build/source/method 冻结后一次应用并授权新 run。此审查不是连续路线已通过，也不保证未来交通/软件 WebGL 吞吐满足预算。

候选 [capture-harbor-tour.mjs](/tmp/neon-harbor-tour-scheduled-2400-final-review-2026-10-04T20-08/capture-harbor-tour.mjs) 实际60,171 bytes，SHA256 `a8ff1a10fb47c97d2385054e65503b3269ba1a44fc3d2f7318bf5fe39603e537`。父7c实际60,118 bytes，SHA256 `7c1d299a91dfb738270f4d8a783dd39f67b7c9acbc381f50522dca1f78b8d802`。

独立反向恢复 boarding 与 upper 两个 `remaining(2400000)` 为600000，再反向恢复一处对应注释，候选全部字节恰等于父7c。执行差异只有 ride 内这两个 wall caps **600→2400秒**；其余字节相同。包8/8 ledger条目的 bytes/SHA全部 exact，父7c与旧1200方案仍保留，未改 ROOT 方法。

整场240分钟、destination2400秒、ordinary cabin150秒/ferry final door300秒、ground180秒、shop600秒均保留。目标数组、真实WASD/Z/鼠标/E次序、.06终点/.15高度、胶囊/碰撞、deck/revision、held输入与真实位移、模拟时间进展、`route.duration*2+120`/`route.duration*3+180`、最少自然route20分钟、首错误/原片段保存、交易/save/export/reload和录屏闭合均逐字保留。没有sleep、retry、隐藏恢复、clock/dt/坐标/storage写入或默认画质变更。

有限cap的数量依据成立：最低引用30秒窗口 sim/wall=.0661309503962、条件服务/sim=.67。名义双tram请求站点最大无效boarding gap79.4787973 service秒，约 **1793.790501 wall秒×1.2=2152.548601**；实际捕获的双车相位给gap86.4158070 service秒，约 **1950.354799×1.2=2340.425758**。2400覆盖这两组条件包络，1200不能覆盖；不能将这些数字说成全交通真正最坏情况上界。

upper 的真实谓词是已乘这辆车在**任何实际open berth**，不是在某个特定目的站等待整圈，也不能直接套双车boarding间隔。按冻结tram三站名义arrival间距和12秒dwell、remaining>2的10秒有效opening，最大单车any-berth无效gap49.1621307 service秒；同条件下约 **1109.560864 wall秒×1.2=1331.473036**，也在2400内。第三run特定路线branch的boarding1062.08/upper897.99秒只是另外的条件场景，不是普遍时限证明。

.67是实际观测平均服务率，没有证明未来始终前进的正下界；fleet bunching、交通等待、错过opening及final ART吞吐变化仍可使有限run FAIL。延长wall allowance只允许真实模拟/物理行为获得更多执行时间，原模拟时间和碰撞/input失败仍保持失败。不能将该方法预算改动解释为硬件FPS或游戏性能验收。

[独立核对JSON](/tmp/neon-tour-final-a8ff-readonly-check.json) 保留实际输入SHA、逐字reverse、八件ledger及算术原值。本人没有运行候选、mocks、tests/build/browser/GPU，未读取运行中的ART。最终manifest必须重新绑定实际final ART资源；之后仅以新run完整实录、原方法/source指纹及闭合结果报告是否完成。
