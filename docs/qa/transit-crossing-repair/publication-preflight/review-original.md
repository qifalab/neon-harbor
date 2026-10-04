# 最终证据归档与发布准备复核

只读快照：2026-10-04 18:07:59 UTC，仓库 `/workspace/scratch/neon-harbor`。没有修改源码、stage、refs、tag 或 Release，没有构建或启动 WebGL。逐项结果另存 `/tmp/neon-release-publication-stage-check.json`。随后只读 GitHub API 查询显示本仓库尚无 Release，也无 `tags/v0.8.0` 匹配 ref。

## 当前 stage 与证据闭合

- 本次已暂存 213 个文件，原始 blob 合计 90,075,136 字节；最大 blob 为第一次原视频 20,744,648 字节。没有单文件超过 GitHub 的 100 MiB Git 限制；目录总和超过 100 MB 不等于触发该限制。
- 核对 10 份 `evidence-files.json`、154 个唯一条目，合计 107,810,201 字节，工作区大小 / SHA-256 全部一致。已入 index 的 139 个条目全部与 ledger 的大小 / SHA-256 一致，所属 9 个 ledger 也在 index。
- **第二次 tour 的 15 个 ledger 条目以及 ledger 自身均未入 index**：`docs/qa/transit-crossing-repair/continuous-tour/` 当前全部 untracked。它的真实日志、失败 fullsnapshot、autosave、原方法、三张 PNG、metadata、构建及视频都已完整存在，不是丢失。最终提交前应按确定的 Git / Release 分工纳入；`.gitignore` 中 `*.log` 会漏掉新 `capture-original.log`，需要显式对该真实路径 force-add，不能仅依赖目录 `git add`。
- 第一 tour 的 13 条 ledger、真实日志和 20.74 MB 原视频均已入 index，哈希闭合。第二 tour 的 15 条本地清单也闭合：live 时钟 353.5167、自动存档时钟 348.0333 已分别标注；原日志尾部和 metadata 都保留同一 600000ms 下层目的站超时。没有把 errors=[] 或录像已超过 20 分钟写成路线通过。
- 最终规则 / 构建四份原始日志均在 index，字节等于本地：`final-checks/build.txt`、`rules-final.txt`、`rules-first-failure.txt`、`rules.txt`。但它们尚无独立逐日志 ledger。可在**新增的发布证据索引**中收录其 SHA，不修改旧原始 ledger；`rules.txt` 与 `rules-first-failure.txt` 同 SHA，均是保留的旧失败，302 项通过证据是 `rules-final.txt`。
- `post-checkpoint/native-startup-failure/` 与 `harbor-comparison/` 也没有独立逐文件 ledger；文件 / 原日志已在 index。若要声称“全部发布证据均在 ledger”，应在新增总索引补齐，而不能把现有局部清单夸大为全目录覆盖。

最终日志 SHA：

| 文件 | 字节 | SHA-256 |
| --- | ---: | --- |
| `final-checks/build.txt` | 299 | `5ed4aeec025d8f40fa3a9fe4fcbb110c73e554b711d7e481225ae8ec72324811` |
| `final-checks/rules-final.txt` | 33,093 | `aa7ce21047aa197f28ebe134c3658ca4685486e1a2d21f54af3138bceebc562e` |
| `final-checks/rules-first-failure.txt` | 33,586 | `e9a0239abb7a0aaaa3a2b629c81bc6f4c5daef5531520373ef8ddb11d256386f` |

## 原视频：保留全部，避免持续累积到 Git 历史

建议将所有轮次的原 WebM 作为 `v0.8.0` GitHub Release 附件，包括失败录像和未来第三轮录像。不得剪辑、重编码或覆盖同名旧轮次。Git 中保留原方法、metadata、日志、照片、失败响应、ledger 和小型 publication receipt；Release 中保留原视频 bytes。第一视频已有明确“随 Git 保留”的历史决定，是否在**尚未提交的这一批**改用附件应由 root 统一决定；本复核没有改 stage。任一迁移都须先确认上传及重新下载字节一致，再排除暂存中的视频，并继续保留本地原件。若沿用第一视频进 Git，也可以只将第二轮及后续视频放 Release；无需清理既有历史。

| 轮次 / manifest | 建议唯一附件名 | 字节 | 原始 SHA-256 |
| --- | --- | ---: | --- |
| 第一次失败 / b9 | `neon-harbor-v0.8.0-tour01-failed-b9-7fa9592c.webm` | 20,744,648 | `7fa9592c2aa01d65a25ef3f3d87aa480007cd85d4adbb8cbc81253160b575c7b` |
| 第二次失败 / 7145 | `neon-harbor-v0.8.0-tour02-failed-7145-14c7d3e5.webm` | 29,551,227 | `14c7d3e503c72069d1381c606b7d518e00cb9f6bf32ee855d5dbf1cbe7970311` |

GitHub 官方允许单个 Release 附件小于 2 GiB；普通 Git 在 50 MiB 提示警告、超过 100 MiB 阻断。当前两个文件均未超限，但未来 90 分钟原录像可能更大。Release 避免 Git 历史的反复二进制增长；Actions artifact 有保留期限，不能作为唯一长期公开原件。

验证链应为：本地原件 SHA / bytes → 上传返回 `asset.id` / `state=uploaded` / `size` / `digest` → 从该附件实际重新下载到独立 `/tmp` 文件 → 重新计算 SHA / bytes → receipt。REST Release asset 元数据提供 `digest: sha256:…`，仍需实际下载核验；不要只凭成功 HTTP 或附件名称称一致。如果当前配置的上传或下载被代理拒绝，保持 `published:false`、保留原件及失败记录，不能绕过代理或编造公开链接。

后续由 root 执行时，可用 `gh release upload v0.8.0 <保持原bytes的唯一命名副本> --repo qifalab/neon-harbor`，然后按 asset ID 查询 `repos/qifalab/neon-harbor/releases/assets/<id>`，使用返回的 `browser_download_url` 或 `Accept: application/octet-stream` 下载。无需采用 `--clobber`；失败的重复上传先核对已存在对象，避免覆盖原件。

原 `metadata.json` / ledger 中的 `published:false` 是捕获时状态，保留原始字节。新增 receipt 映射 `originalCapturePath` → `assetId` / `downloadUrl` / `bytes` / `originalSha256` / `serverDigest` / `downloadedSha256` / `verifiedAt`，并引用原 ledger 的 SHA。若视频不入 Git，明确这些原相对路径属于捕获归档，实际存储为 Release 附件；不要让读者误以为完整 WebM 仍存在于 source archive。第三轮独立命名、保存执行方法 SHA 与预算变更，不能改第二轮结果。

## 部署 SHA 与事后 docs-only receipt

1. 完成最终源码及已结束证据的提交，记为 **D**；包括第三轮实际使用的方法修改。保留 7145 本地 manifest、146 资源及 52 源码摘要作为运行证据；最终远程全 CI 与 Pages 必须明确 `head_sha=D`。
2. 使用固定指向 D 的分支 / tag 触发 Pages。当前 Pages 只有 `workflow_dispatch`，且 verify 全部完成后 deploy；在 D 的部署结束前不要移动该发布 ref。最终 Release `v0.8.0` tag 同样固定于 D，不能后来转指 docs-only 提交。
3. Pages 构建 `tools/build.mjs:38` 将 `revision` 写成 `GITHUB_SHA`。因此线上 `build-info.json.revision` 必须是 **D**；本地 7145 manifest 的 revision 为 null，线上整个 manifest SHA 会改变，这是正常的。检查 146 条 `assets` 映射与冻结运行时 / CI artifact 的逐项 SHA 一致，并保留线上 manifest bytes / SHA。不能要求线上 manifest SHA 仍等于本地 7145。
4. Pages run 及 `check-live` 的 15 项检查实际全部成功后，记录 workflow run / attempt、部署 D、公开地址、`version=0.8.0`、线上 manifest SHA、146 全资源核验结果、最终浏览器加载资源核验、时间及保留的 artifact 摘要。视频附件同样实际上传 / 下载验证后才填 publication receipt。
5. 再作独立 **E** 提交，parent=D，仅补 QA / README 状态和新增线上 / Release receipt。不要 amend D、移动 v0.8.0 tag 或再触发 Pages。main 变为 E 后公开客户端仍正确运行 D。文档分别写“公开部署源码 D；验收 / 发布凭据文档 E”，不要求 public revision 跟随文档提交。
6. E 的 push 会触发普通 CI，这是现有流程；当前 Pages 不因该 push 自动部署。该 CI 结果不能替代 D 的真实部署结果。E 的自身完整 SHA 在提交前不可自洽地写入其文件：文件内记录 D 和证据摘要，提交后在报告 / Release 说明引用 E；不需要自引用占位反复提交。

此方案保留两次失败及未来复核的全部原始证据，清晰区分本地构建摘要、线上源码 SHA 和事后文档 SHA。即使第三轮功能路线通过，正式 GLB、完整近景美术、整日居民及真实硬件性能仍按原有待验收边界记录。

官方只读来源（本次均 HTTP 200，原 HTML 缓存于 `/tmp/neon-release-publication-sources/`）：

- Git 文件限制：https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github
- Release 附件限制：https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases
- 附件 metadata / digest / 下载：https://docs.github.com/en/rest/releases/assets?apiVersion=2022-11-28
