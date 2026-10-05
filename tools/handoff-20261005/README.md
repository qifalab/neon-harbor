# 收尾工具存档

保留未完成的观察和资源来源脚本，未启动新远程 CI 或部署。

- CI observer 只有准备与静态检查；需新的精确 run／SHA／attempt。
- provenance generator 有旧 worktree 与旧 receipt status 假设，不能直接用于本次46路径／214资源。保留源码供下一轮修订，未伪造收据绕过断言。
- 当前 `tools/native-review/expected-runtime-dictionaries.json` authored 字典仍为历史199的208资源；当前真实构建为214资源。native inventory 尚未纳入本次新增的 pending 文件；下轮先刷新字典、证明范围和 bundle pins，再执行完整 native CI。
- upload-exact-git-objects.py 上传精确已提交对象，不修改 ref；分支创建另由收尾操作完成。

历史失败、预算变化和方法准备均不等同实际原生通过。
