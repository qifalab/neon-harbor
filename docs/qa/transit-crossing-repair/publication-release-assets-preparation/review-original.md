# v0.8.0 原始录像发布附件方案（只读准备）

观察于 2026-10-04，ROOT `/workspace/scratch/neon-harbor`。本任务只读 Git index、已闭合捕获 ledger、顶层说明与 GitHub GET；新增文件仅在 `/tmp`。没有编辑仓库、hash 全部原视频、运行 GPU / browser / build / tests、上传、改 ref / tag / Release 或改 stage。

## 结论

可以把前三轮及将来第四轮原 WebM 全部放入 `v0.8.0` GitHub Release，Git 保留原方法、metadata、现场图、日志、SHA / 大小 ledger 与小型新增存储映射和实际 receipt。前三个原视频共 **121,844,211 bytes**；全部从尚未提交的 index 排除后，CI 的新 clone 不再携带这部分二进制。当前前两文件属于 staged 新增，第三为 untracked，没有必要改写已存在 Git 历史。本地原件始终保留；不是清理或重置工作区。

当前 GitHub read-only `releases` 返回 `[]`，`matching-refs/tags/v0.8.0` 返回 `[]`，没有发布成功凭据。第四轮尚未执行，本方案不虚填结果或附件。

当前 index 两项：

- `docs/qa/art-final/continuous-tour/video/page@ba86a50f42d45bf55f12ac6d154937d9.webm`：20,744,648 bytes，index blob `12495cfa86b42406b82b01e44c1a830a9341637c`。
- `docs/qa/transit-crossing-repair/continuous-tour/video/page@9b10f558e0c2fb2cda908907c928516a.webm`：29,551,227 bytes，index blob `804ef1beab0e92771cdef40992960be281c2d4b5`。
- 第三路径 `docs/qa/transit-crossing-repair/continuous-tour-budget-review/video/page@f3a37dcd9bfa366ae4707ebb074324d8.webm`：71,548,336 bytes，目前未入 index。

## 保留与文档更新

不可修改三个目录内的原 `metadata.json`、`post-run-verification.json`、`evidence-files.json`、原方法、日志和录像。目录 README 也被 sealed ledger 计入；包括第一次 README 的“根代理决定随 Git 保留”、第一次 ledger / post-run 中的 publicationDecision、第二/第三 README 的本地 WebM 链接和 published:false，都应保持原字节。它们准确记录捕获时决定和状态；当前存储决定使用**独立新增**文档覆盖，不追写历史。

现有 `publication-preflight/review-original.md` 和 `publication-preparation-1859/` 的报告 / 快照同样是历史观察，不改。第一项旧决策从“随 Git”改为附件是 ROOT 的当前实施选择，不需要用户再次许可；需保存明确的迁移说明。

可以更新的当前说明：`README.md` 的验收/下载说明；`docs/QA_V08.md` 的当前发布凭据入口与源归档不含 WebM 的说明；`docs/HARBOR_SAMPLE_ACCEPTANCE.md` 的当前证据保存说明。`docs/WORLD_SIMULATOR_PLAN.md` 只需在交付/验证一栏链接新存储说明，既有 20 分钟完整路线要求不变。推荐新增 `docs/qa/release-evidence-storage/README.md`、`raw-video-release-plan.json` 和 draft / public 两份真实 receipt。原目录链接仍属原始归档描述，新存储 README 要用“原相对路径 → 实际 Release 附件”映射为读者解开这些链接。

顶层当前说明建议句：

> 原始连续路线录像通过 v0.8.0 Release 附件单独保留，源码归档保留原生验收记录、大小和 SHA。原捕获档案中的 WebM 相对路径是捕获标识；当前实际位置与下载核对见新增存储凭据。前三次失败保持原结果，第四次另列。

仅在确有 public receipt 后改“通过附件保留”为已完成语态。上传前写“计划”；draft verified 后写“草稿附件已核对，尚未公开”。

当前 `.gitignore` 没有 WebM / QA video 规则。ROOT 选择附件策略后，可在 D 中加入针对 `/docs/qa/**/video/*.webm` 的规则，并显式检查 `git ls-files '*webm'`，避免后续 `git add docs/qa` 重新把本地原件加入 index；该 ignore 只改变新增源归档选择，不删除文件，也不改游戏资产加载。若保持精确显式 stage，也可以不改 `.gitignore`。本任务没有执行任一修改。

## 不删原件、不制造提交与附件循环依赖

最终部署提交 D 尚未形成。若 ROOT 要先验证附件再从 index 排除两条新增视频：

1. 先创建**draft** `v0.8.0` Release，临时 target 可以是当前远程 `0330df7...`，不要 publish，也不要预先创建 v0.8.0 tag；draft 的 target 不能宣称为最终上线源码。此外部写操作由 ROOT 执行。
2. 用唯一附件 basename 的 `/tmp` symlink 上传（零复制）；只传 explicit file arguments，不 glob。不要 `--clobber`。调用前读取 assets，遇到同名附件即停止；已有附件只读验证，不覆盖。
3. 下述 helper 用 authenticated 原字节下载和本地重新 hash 核对 draft。通过后，ROOT 可用 `git update-index --force-remove -- <两条精确路径>` **只排除尚未提交的新增视频**，不删本地文件。再次 `git status` 和 `stat` 确认本地原件仍在，并限制之后宽泛 `git add` 不把视频再加入；此任务没有执行该命令。
4. 提交 / 推送精确源码 D，运行原 Pages 全部门禁和线上核对。将 draft target 更新为 D 并重读确认；此时不要把草稿验证冒称为公开验证。发布时 v0.8.0 tag 必须固定 D。
5. publish 后执行 helper 的 public verification，必须同时验证 tag 实际指向 D、每个资产 ID/name/state/size/digest 和**无 GitHub 认证的公开下载** SHA。写独立 public receipt；再 docs-only E，不改 D 或 tag。

也可先保留本地原件和 SHA，在 D 形成时就从未提交 index 排除，随后创建指向 D 的 draft；不过先做 authenticated 重下载可使迁移决定有具体可审核证据。两种都不允许删除本地原件或覆盖原捕获 ledger。

## 已准备工具和实际调用

`/tmp/neon-release-evidence-receipts.py` 只有 `prepare` 和 GET-only `verify`，没有上传 / ref / tag / release / Git 写路径。它用 Python int 与 1 MiB 分块处理大小 / SHA，下载通过 subprocess stdout 流式落盘，支持超过 32 MiB 的原视频，单附件要求小于 2 GiB。每条 stream 有有限 3,600 秒上限；下载文件和 receipt 以 exclusive create 写入，不覆盖失败原件或既有收据。

准备 manifest（默认前三轮，视频只 stat，不重 hash）：

```sh
python3 /tmp/neon-release-evidence-receipts.py prepare --root /workspace/scratch/neon-harbor --out /tmp/neon-release-raw-video-plan.json
```

等第四轮真实结束后，用四个 `--capture N=relative/capture/dir` 重建**新文件名**的 manifest；传 `--capture` 会覆盖默认三项，须全部列出。outcome 从实际 ledger 推导，只有 exit=0、routeCompleted=true 且 completedTwentyMinuteRoute=true 才命名 passed，不以录像时长或手填猜测替代。

草稿的实际重下载验证（无需未形成的 D）：

```sh
python3 /tmp/neon-release-evidence-receipts.py verify --manifest /tmp/neon-release-raw-video-plan.json --release-id ACTUAL_ID --download-dir /tmp/neon-release-draft-actual-downloads --out /tmp/neon-release-draft-actual-receipt.json
```

公開后 actual D 检查：

```sh
python3 /tmp/neon-release-evidence-receipts.py verify --manifest /tmp/neon-release-raw-video-plan-with-fourth.json --release-id ACTUAL_ID --commit EXACT_D_SHA --download-dir /tmp/neon-release-public-actual-downloads --out /tmp/neon-release-public-actual-receipt.json
```

helper 每轮先重新 hash 本地原件并核对未改 sealed ledger，再检查资产并 authenticated 重下载；public 时额外使用禁用 curl config、无 auth 参数的匿名公开下载，支持 HTTPS redirect。服务端 digest 若未提供则明确记录缺失，仍必须实际下载 SHA 一致。失败返回 1 并写 actual failure receipt；草稿通过 status 明写非公开，published=false。验证脚本不能把 draft 或缺少公共下载当上线成功。

不能用 draft authenticated 成功证明公众能访问。GitHub 代理若阻止下载，应保留 actual failure、published:false 与原件，不能改成猜测成功。上传命令无重试/覆盖逻辑；网络是否允许上传仍需真实操作后报告。

notes 草案为 `/tmp/neon-release-v080-notes-draft.md`，前三失败与画质限制写明，第四、D、Pages/live 和附件公开凭据留待实际完成后改写；当前稿不得直接作为最终成功说明发布。
