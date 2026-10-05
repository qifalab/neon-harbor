截至 2026-10-05T00:48:53.791Z，本次 ef92 / attempt1 的 12 项必需功能任务均已结束：11 个游戏套件 success，多人套件 failure。整体 run 和原生任务尚未结束。

11 个游戏套件均执行相同的 342 条规则（编号1..342、身份SHA一致），共3762次规则执行，不计为3762条不同规则。游戏实际27个不同浏览器场景通过；多人实际1通过、1失败，总29个不同场景中28通过、1失败。

多人首错为 rooms.spec.js:208 → occupied.js:39 chooseStorey 等待 !interior.moving 180000ms 超时；原日志未报告另一个 cleanup secondary。详细进度/轨迹原因需读取Root独家下载的原artifact，本派生报告不推断死锁或速度不足。

23个可选原生任务真实启用，当前4 failure、6运行、13排队；2个PR-only任务按规则skipped。原生collector completion/FAIL与manual美术验收分别记录，所有美术仍需实际review。

本报告仅解析已保存原日志和监控状态；没有API/download/tests/build/browser/GPU/git/ref或runtime/index写入。原始run/jobs/artifacts API body与逐轮SHA收据位于 ../../snapshots，原始完整日志位于 ../../logs。原始run API此刻仍为queued，保留该返回值，不改为推测状态。

方法及逐job原件SHA、逐个场景名称、规则身份在同目录JSON；12 jobconclusion及首失败按实际记录保留，不能称完整CI PASS、所有建筑已验收或画质已达AAA。
