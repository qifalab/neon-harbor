# ef92 首轮远程验收（尚未发布）

实际源码 `ef92c25980f1da12b508971170b72b9dd6230059`。GitHub Actions [37247048989 / attempt 1](https://github.com/qifalab/neon-harbor/actions/runs/37247048989)，2026-10-05T00:19:06Z 创建。原运行、日志、artifact 与派生结论保持原始失败状态，不覆盖为重跑通过。

截至 00:48:53Z，12 个必需分片已经结束：11 个游戏分片成功，多人分片失败。游戏实际 27 个不同浏览器场景均通过；多人 1 通过 / 1 失败，即 29 个不同场景共 28 通过 / 1 失败。11 份 Node 输出执行同一组 342 项规则，均通过；只记 342 个不同规则，不累加为 3,762 项。独立原日志结论、解析方法和 SHA 台账在 monitor 目录的 derived 中。

多人首错：东湾高楼 level-78 的真实电梯等待 180 秒超时；最后 actual lift elapsed 26.5 / 37.172222 秒，y263.050366，双方收到相同中间位置。没有证据表明电梯停止不动。新的单次 arrivalTimeout 300 秒方法已准备，默认等待 180 秒与整个多人 900 秒不变，真实中途同步、位置容差和到站断言均保留；尚未执行新结果。原完整 ZIP / traces / progress 与因果方法记录见 artifacts 和 ../multiplayer-lift-wait-revision。

23 个可选原生 High / Low 路线任务仍按原方法继续，不能借游戏分片成功宣称原生图已签收。south-090 / 094 的实际原步骤和近照已完成，但 collector 关闭自有进程超时导致整包失败；south-091 / 092 达到原整场限时，路线尚未完成。原图、metadata 与操作边界见 ../native-original-partial-evidence。原生截图和完整路线不得由规则数或独立场景拼接推导。

尚未将此候选合入 main、创建 v0.8 Release 或执行 Pages 发布。公开客户端仍按最后线上检查为 v0.7。
