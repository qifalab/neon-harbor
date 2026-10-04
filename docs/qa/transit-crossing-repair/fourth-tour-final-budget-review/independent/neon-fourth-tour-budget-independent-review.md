# 第四轮 240min / 2400s 方法预算独立只读审查

结论：候选预算修改 scope PASS，未发现实质问题。仅核对源码字节和已有闭合证据的条件算术，未跑 mocks、测试、browser/GPU，未改 ROOT 或 ART 源码/方法。Root 仍需在最终 ART 源码/build 冻结后决定 apply/run。

候选 [capture-harbor-tour.mjs](/tmp/neon-harbor-tour-budget-240m-2400s-2026-10-04T19-45/capture-harbor-tour.mjs) 实际 60,118 bytes，SHA256 `7c1d299a91dfb738270f4d8a783dd39f67b7c9acbc381f50522dca1f78b8d802`；父方法 59,884 bytes，SHA256 `6a0178c8fb0b099dda2a82b1bc8157206861c35bb8e00cd1b4661216450027db`。

独立执行五个各唯一的反向文字替换后，候选字节完全恢复父 6a：两个 metadata 常量、一个注释块、两个报错文字。实际执行变化仅是整个 case 有限 wall cap **90→240 分钟**及共享目的站等待 **900→2400 秒**。没有其他源码差异；共享目的站 cap 作用于 bus、ferry、tram，不能称只放宽 tram。

实际源中 boarding/upper 600 秒、ordinary cabin 150 秒/仅 ferry 最后门 approach 300 秒、ground axis 180 秒保留。`.06` waypoint 终点、`.15` 楼梯高度、真实 pointer/键输入与顺序、held 输入和位移 stall guard、revision、几何/碰撞、`route.duration*2+120` 等待进展及 `route.duration*3+180` 活路线时间、20 分钟最少自然 route、交易/save/export/reload、录屏闭合/首个错误原件保存均逐字不变。既有 6a mocks 的前置结果没有被本预算审查重跑或替代。

对 [/tmp/neon-harbor-fourth-tour-budget-review/budget-calculation.json](/tmp/neon-harbor-fourth-tour-budget-review/budget-calculation.json) 中已注明 incomplete/conditional 的 suffix 模型独立求和与计算：

| 计算 | 结果 |
| --- | ---: |
| 条件 suffix 19 阶段模拟时间总和 | 576.4523250161 秒 |
| 引用的最低晚段 30 秒窗口 sim/wall | 0.0661309503962 |
| 真实第三轮已用前缀 + suffix/ratio + 150/180 秒实际操作预留 | 199.3855683157 分钟 |
| 上值 ×1.2 | 239.2626819789 分钟，向上取 240 |
| 148.5325333358 sim 秒目的站等待 / ratio | 2246.0365750977 wall 秒 |
| 2400 秒剩余规划空间 | 153.9634249023 秒 |

算术成立，**不能把条件 model 当成未运行 suffix 的实录、最坏情况上界或完成承诺**。原预算风险报告已明确 retained 600 秒等待可能先失败：该模型 boarding 70.236 sim 秒与 upper 59.385 sim 秒，在此最低 ratio 下分别约需 1062.08 与 897.99 wall 秒；240/2400 没有放宽它们。更多错过循环、真实碰撞/交通变化、最终 ART 的吞吐变化仍可使 run 有限 FAIL。停止并行 ART 工作不证明慢速的因果，GPU 独占也不保证恢复速率。

独立输入 SHA、逐字恢复结果和计算原值见 [check JSON](/tmp/neon-fourth-tour-budget-independent-check.json)。该 model 绑定原 ROOT manifest `7145fa443190896ff24050d518a54fea364ddb0547ddfa71756a33d64c515fb3`；最终 ART manifest 必须重新冻结。只有新 run 实际完成所要求的行为、原始录屏覆盖时长且闭合检查通过，才可报告完整连续 tour 通过。该候选当前是方法准备证据。
