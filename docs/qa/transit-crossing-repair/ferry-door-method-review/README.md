# 小轮靠门取证方法的修订准备

[离线现场调查](neon-harbor-third-tour-derived-review.md)、[完整候选与准确diff](candidate/REVIEW.md)、[独立段方法审查](walklocal-audit/REVIEW.md)和 ride mock 原数据均按原字节保留，摘要见[清单](evidence-files.json)。原报告内绝对路径为执行位置，本目录保存不变副本。

候选 `6a0178c8` 仅给小轮最后门内 approach 有限 300 秒，其他局部段仍 150 秒；端点、输入保护、模拟时限和整场 90 分钟不变。新增每段原始记录、首次失败与清理错误分栏。18 段 mock、24 ride mock 和 18 预算组合检查属于离线方法验证，不代表实际路线通过。ROOT 后续应用、冻结最终构建并独立执行，结果另存。
