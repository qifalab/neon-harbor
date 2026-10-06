# South-085 方法修正记录

原始失败已保留：旧采集器把普通大厅误判为 `renderVisibility.outdoor=false`，实际 E 进楼已经成功，但错误等待谓词超时并以 exit 1 结束。游戏逻辑没有为采集器修改。

采集方法随后已修正为检查真实 `south-085` 室内 owner、楼层、房间与碰撞体计数，并允许普通大厅保持 `renderVisibility.outdoor=true`；退出时验证 shell owner 清除和外景恢复。修正版已在实际 v0.8 / 214 资源构建上分别完成 before 与 candidate 的真实 E 进入、E 退出、外壳恢复和两张同条件 High 原图采集，元数据状态为 `capture-complete-art-review-pending`，无首错、无重试，端口与所属浏览器已关闭。

原始失败与修正版原件不随普通 Git blob 提交，分别保存在外部证据目录；当前修正版只证明采集协议、运行状态和可比姿态成立。South-085 立面原图仍需独立人工美术审查，不能把采集完成视为美术、硬件性能或 AAA 通过。旧绝对路径和历史源码／构建绑定保留在归档中，不应当作当前运行方法。
