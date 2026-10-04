# 最终发布准备只读复核

核查时间：2026-10-04 18:57–18:59 UTC。仅只读代码、Git index/已结束证据和公开/GitHub GET，新增文件限本次 `/tmp`。未 stage、commit、上传、改 ref/tag/Release、dispatch、构建、测试或启动浏览器/GPU。第三轮目录 `continuous-tour-budget-review/` 全部排除证据内容核验，未读取其 WebM、hash、打包或判断路线结果。

结论：当前 Pages 门禁和 exact Git object 上传方案可用，D→Pages/live→docs-only E 的收据策略成立；当前尚未形成 D，也没有 v0.8.0 Release 上传/实际重下载证据。stage 是进行中的快照，不是已闭合的最终发布提交。所有外部写动作仍由 ROOT 执行。

## 1. 当前真实远程和暂存状态

- 新 GitHub GET：main 和 `codex/traffic-and-multiplayer` 均为 `0330df7ee1042d0f211304b042e01cdf6a0b4d44`；其远程 tree 为 `26767e6ec1055486081f03e9d32ae440a6dd286d`，与已上传 0330 的本地/state tree 相同。v0.8.0 Release 与 tag GET 都是 404，尚不存在。
- 新公开 HTTP GET：`build-info.json` 返回 200，`version=0.7.0`、`revision=a425667bd2fec0c81f482a89861c88c2acd2641e`，123 assets；原 manifest 12,738 bytes，SHA `4794c4d51b4e43ddc8b87c73a1fa7f9ff682171ee4785d8c00d55cb21725ff0f`。未运行公网浏览器验收。
- 18:57 index 快照：231 changed paths，203 unique changed blobs，120,922,615 bytes。最大单 blob 为已结束第二次失败 WebM，29,551,227 bytes；首次失败 WebM 为 20,744,648 bytes。没有一个 staged blob 达到 100,000,000 bytes，更没有超过 100 MiB。总 bytes 超过 100 MB 不等于单 blob 超限。
- 产品、测试和方法 10 项 staged bytes 与 working bytes 相同，life 为 `034cb5…`、tour method 为 `60436…`；当前不存在已合入 ROOT 的 art-pilot/main 诊断增量。四份主文档仍为 MM，尚有未暂存的最新文字。
- 已结束 14 份 ledger 的 170 个唯一文件全部 working SHA/size 相符，107,908,681 bytes，没有内容差异。第二次失败 tour 的 15 条和 ledger 已完整入 index，修复了 18:08 旧审查时的缺口。当前还有四份新增审查 ledger 未入 index，14 个声明条目未入 index，详见新 JSON；这属于正在归档的状态，不能写成最终 evidence 全部 staged。原始 `.log` 的 ignore 规则仍须按实际新路径核对，不能靠目录 add 推定入库。

原始只读结果：[remote GET](/tmp/neon-release-preparation-remote-read.json)、[父提交对象](/tmp/neon-release-preparation-parent-object-read.json)、[public GET](/tmp/neon-release-preparation-public-read.json)、[public manifest 原 bytes](/tmp/neon-release-preparation-public-manifest-original.json)、[index 快照](/tmp/neon-release-preparation-index-read.json)、[ledger 明细](/tmp/neon-release-preparation-ledger-read.json)。仓库有 ROOT 同时归档活动，以上时间点不是最终冻结状态。

## 2. Pages 完整门禁

`pages.yml` 只有 workflow_dispatch，deploy 的 `needs: verify` 调用同 revision 的 `ci.yml`。verify 包括 11 个功能 browser 分片，每个运行 npm ci/test/build 后浏览器场景；双浏览器多人是另一个必需 job，没有 continue-on-error。PR-only 的 room-art/room-detail 在 Pages 上 skipped 是明确设计，其跳过不等于已进行了最终近景美术现场验收。

verify 成功后 deploy checkout 该运行的 `github.sha`、重新 build，再上传 `github-pages-${run_id}-${run_attempt}` 并部署该精确 artifact。分 attempt 的名字避免重跑误选旧 Pages artifact。deploy 后 live 工具收到 `EXPECTED_REVISION=github.sha`；失败退出码使 Pages run 失败，always artifact 保留 live 证据。live 检查在部署以后，若 live 失败，站点可能已经被切换，但不能报告“验收上线成功”。

live 工具先检查真实 WebGL 2/draw/default High/streaming，随后通过 shipped UI 操作单人、交通样板菜单和三个区域入口/退出，最终恢复 High。它收集浏览器实际加载 response bytes，前后两次核对 SHA；同时独立 GET manifest 中每个资源并核对 SHA，不只是 index.html 或版本号。capture 的重试只处理截图 TimeoutError，功能断言不重试。此脚本不是 AAA、硬件 FPS、整日居民、新经济多人同步或公网 backend 验收。

Pages workflow concurrency 不取消正在运行的发布。reusable CI 的 cancel-in-progress group 包含 workflow/ref；实际结果须绑定本次运行 ID、attempt 和 D，不能把别的运行结论借作本次成功。按既定策略，发布 ref 保持 D 直到其验收结束再引入 E，便于核对。事后 E push 仅触发普通 main CI，当前配置不会自动 Pages 发布。

## 3. exact D 的 Git object 上传与非强制 ref 更新

已逐行检查 `/tmp/neon-upload-git-objects-safe.py`，当前 SHA `2e4f2ce6d49a42039d6717a7aae508cdc4bf3c8ef1b8ac3cf9a30519972b18e5`。它不读 dirty/index 作上传源，只读给定已提交 HEAD 的对象；其 dry-run 无网络读写。

- ROOT 创建 D 后，必须给定 D 的完整 40 字符 SHA，以及 parent `0330df7ee1042d0f211304b042e01cdf6a0b4d44`。脚本要求 HEAD=D、恰好一个该父提交、一个 tree、受支持 headers/modes，author/committer 都为 UTC +0000。不会以另一个父提交或 merge 重建为“差不多相同”的提交。
- 对 changed blobs 重算 Git SHA-1，远程 blob response SHA 必须相同；使用该父 tree 的 base_tree 和精确 delta 重建 tree，远程 tree SHA 必须相同；包含原 message 最后 LF 和原作者/提交者日期重建 commit，远程 commit SHA 必须等于 D。preflight、上传完成前和末尾均重新核对 HEAD。
- 远程父 commit/tree 先 GET 核对。每个 commit 使用独立 state/log，缓存只接受相同 remote/commit/tree/parent/paths/blob metadata。只有 502/503/504 有至多三次有界重试；失败不打印凭据/response body，任何失败都不会修改 refs。并发仅用于 blob 写，tree/commit 按依赖顺序创建。
- 脚本没有任何 ref PATCH。ROOT 在 exactCommit=true 后另行 GET main/feature，验证目标关系，再分别以 `sha=D, force:false` 更新。两个 ref 操作非原子；应保存各自 response SHA，若一个失败，报告实际部分状态并处理剩余 ref，不把两者虚报为一起成功。不能为了解决 non-fast-forward 改为 force:true。
- 脚本本身**没有内置单 blob 100 MiB 限制**；最终 D 的 changed object sizes 仍需实际检查。当前 index 无超限，不为尚未关闭的第三录像提供最终大小保证。API Git blobs 不是规避 Git 限制的路径。

已有真实上传证据 `/tmp/neon-upload-0330df7-state.json`/log 仅证明旧 0330：71 blobs、20,370,586 bytes、tree/commit exact、refsChanged=false，新 GET 也核对该对象。它不是未来 D 的 dry-run、上传或推送凭据。D 后续必须使用自己的新 state/log 和实际 SHA，不复用旧提交 state。

## 4. 未剪辑第三 WebM 的 Release 归档

官方已缓存来源明确：普通 Git 阻断超过 100 MiB 的单文件；Release 每个附件必须**小于 2 GiB**，单 Release 最多 1,000 附件，无总大小/带宽上限。边界分别为 104,857,600 与 2,147,483,648 bytes，不能以 100 MB/2 GB 混算。当前 staged 两次失败原录像均可进 Git；没有必须移除它们的大小理由。

第三录像仍遵守关闭后处理：ROOT 确认录制/context/process 已结束、实际最终 bytes 固定后，才算 SHA、建最终 ledger/归档。现在不能 hash、复制、打包、上传或裁剪它。其是否通过只取真实最终 outcome，不按时长或 errors=[] 判断。

若 ROOT 将第三原件放 v0.8.0 Release：

1. v0.8.0 tag 固定到精确 D，Release `target_commitish` 明确 D；以后 E 不能移动该 tag。原件使用含轮次、实际 outcome、捕获 manifest 短 SHA 和原视频 SHA 短串的唯一附件名，完整 SHA 留 receipt；不 clobber 同名旧证据、不剪辑/重编码，不改已有 Git 历史或删本地原件。
2. 实际上传后记录 asset.id、state=uploaded、size、server digest 和 URL；从该 **asset ID 对应 bytes** 再下载到独立 `/tmp`，重新计算 size/SHA。必须本地原件、服务端 digest（如 API 返回）及实际下载三者一致。成功 HTTP、名称和 API digest 单独都不是实际重下载证据；若 API 不提供 digest，应如实记 null，仍要求下载 SHA 相同。
3. 若初期是 draft，authenticated 下载一致还不能证明公众可访问；最终 public release 后记录公开 GET/下载结果。任何上传/公开验证失败都保留真实失败记录和本地原件，不虚写 published=true 或给出不存在链接。
4. 原 metadata/ledger 的 `published:false` 属于捕获时状态，**保持原 bytes**。新增 publication receipt 映射 originalCapturePath、ledger SHA、capture manifest/method、D、asset ID、url、原/下载 bytes 和 SHA、serverDigest、verifiedAt。明确 source archive 里没有第三 WebM、Release 是其实际存储位置；不能让原相对路径被误解为 Git blob。

当前 v0.8.0 Release/tag 均不存在，未发现其 actual upload/下载 receipt，所以本审查只认可此策略，不认可“视频已公开保存”。旧 0330 Git object 上传与 Release 附件是不同证据链。

来源：https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github；https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases；https://docs.github.com/en/rest/releases/assets?apiVersion=2022-11-28。原 HTML 在既有 `/tmp/neon-release-publication-sources/`，本审查未改。

## 5. D→上线→docs-only E 的闭合条件

1. ROOT 完成最终授权产品、已结束证据和必需独立原生/CI 验收后，关闭/stage/final byte check，创建单父 D，exact upload/ref FF。当前 7145/60436 tour 的原 bytes 和 manifest 继续绑定旧运行；如果此后合入 art-pilot，就必须记录最终新 manifest，其变化通过差异审查、新 pilot 原生现场和新候选全 CI覆盖，不能把旧 tour 改称新 manifest 原生实录。
2. 使用冻结指向 D 的发布 ref dispatch Pages，实际 verify/deploy/live run 与 artifacts 均须 head_sha=D，所有必需 jobs 和 live report success=true。最终 receipt 留 run ID/attempt、部署 D、公网 URL/version、manifest 原 bytes/SHA、全资源核验、实际 browser-loaded SHA、artifact 摘要及时间。
3. `tools/build.mjs` 仅复制 index/styles/favicon/src/vendor/assets，manifest 的 revision 来自 GITHUB_SHA。线上 revision 必须 D；本地 revision=null 的 manifest 整体 SHA 必然不同。对比实际最终候选的 asset mapping，不能要求线上 manifest 总 SHA 等于本地 7145。当前 ROOT 是 146 assets；**若合入 pilot，最终资产数量和摘要须重新实测，不能继续固定写 146**。live 工具按实际 Object.entries 检查，不硬编码数量。
4. 真实部署和 Release 上传/重下载完成后，E 单父 D，仅修改 README/docs 及新增 receipts。执行 D..E name-only 检查确认无 src/assets/vendor/tools/workflows/tests/package 等运行/测试变化。不 amend D，不移动 tag，不 dispatch E。main/feature若更新到 E，仍以 force:false。公开 revision 继续为 D，这是正确的产品/凭据分离。
5. E 的普通 CI 是新文档提交的 CI，不替代 D 的上线证据。E 自身 SHA 不强行自引用到其文件；receipt 记录 D/真实证据 SHA，提交后在最终报告或 Release 说明引用 E。后续新 GET 必须仍显示线上 D 和最终真实附件。

以上方案没有增加用户批准步骤。发布目前仍待 ROOT 实际执行；不得从本次 GET、静态审查、历史测试数量或正在写的录像推导 v0.8 已上线/样板全部验收/3A 品质。

可复核 CPU 方法：[ledger probe](/tmp/neon-release-preparation-ledger-probe.py)，只读 index 及已结束文件，主动跳过整个第三 tour 目录。所有本次输入/结果 SHA 另存 [provenance](/tmp/neon-release-preparation-provenance.json)。
