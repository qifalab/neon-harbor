# Native paired final payload：workflow / pin 只读闭合

结论：本范围无实质 must-fix。最终 23 case、指纹覆盖与原 CI / Pages 保留静态闭合。SOURCE_ONLY_PREPARED_NATIVE_UNRUN；这不是实际 GitHub run、capture PASS 或人工 art approval。runner cleanup / process ownership 由父审查独立覆盖，本报告不复核该范围。

只读方式：读取最终冻结 payload 的文本/JSON，逐文件计算本地 bytes/SHA；比较 ROOT 的 CI/Pages 文本。没有执行 workflow/runner、Git/ref、test/build、browser/server/GPU；没有修改 ROOT 或候选。独立 JSON 记录每一行 expected/actual、全部 65 文件读值、矩阵和 CI delta。

- payload 65 files，共 1,049,781 bytes。bundle 的 62 files 条目 bytes/SHA 全部 exact，无多余或漏项；另两个 workflow 由 manifest 专用 SHA 覆盖，manifest 自身由父给定完整 SHA 覆盖。两个 workflow 和 manifest 没有自列的 expected-byte 字段，本次记录其真实 byte 数并验证精确 SHA，未误称其拥有单独 bytes pin。
- matrix / cases 均 23，顺序与 IDs 完全一致，没有重复或 timeout/quality label 不一致。15 paired High + 7 authored-only High + 1 authored-only Low functional；所有 matrix timeout 与 cases 的 jobTimeoutMinutes 精确相等。Low tour 是 240 分钟原 capture budget、300 分钟 VM timeout，独立标为 Low functional，不充作 High art。
- CI 仅新增 capture_native 输入和一个 reusable job；旧 jobs 全块逐字保留，含 11 verify matrix + multiplayer 及两个 PR-only 块。ROOT Pages SHA 与 seal 的 unchangedPagesSha256 exact，payload 没有 Pages 覆盖。原 Pages verify→deploy 仍在，Pages call 输入默认 false，因此不会启用 native。
- 手动 CI 输入默认 true；实际 if 为 workflow_dispatch && capture_native == true。以现有已注册 ci.yml 在 adopted feature ref 分派，callee 的相对 workflow_call 引用使用 caller 同一 commit，毋须先在 main 注册新的 native-art.yml。非手动事件的 reusable caller 即便传 true 也会跳过；本结论只覆盖指定 CI 手动入口。实际 feature 无输入 default / job graph 仍需未来 GitHub engine 运行验证。
- authored checkout、AUTHORED_SHA 和 envelope 绑定 github.sha；baseline 固定 7a90f7934b7c9d1af5c4494bf08c4ec337c373e4。runner 静态门槛核 actual HEAD / authored top-level、两个 workflow 与未改 Pages 的 SHA、62 curated method/config/dictionary/provider 文件 SHA。
- runtime 字典 baseline 156 / authored 190 与封存 historical build-info 的 assets 精确相等。历史 revision=null 保留；新 build 的 GITHUB_SHA 等于真实对应 HEAD。native 前后对 HEAD、built revision、完整 runtime assets、source/dist 逐项 SHA 和整份 build-info 进行 freeze，before/after 必须相等。continuous-tour 的实际 checkout capture/server/walking/occupied 四个原 pin 另行前后检查。

## 最终读取版本

| 文件 | bytes | SHA-256 |
|---|---:|---|
| `tools/native-review/bundle-manifest.json` | 11224 | `ffffbccb073ad0f3bc2c12c1908d666acf41c05db2ae2c85f32498a9cea96385` |
| `tools/native-review/run-paired-native.py` | 33908 | `a6a42de4497d35e29aedbdc13ecf597c5a1aa057fd0f5cf47e91be46596e306e` |
| `.github/workflows/native-art.yml` | 5022 | `d143b006d4d4c370d439b721a23d0172e34b639b8f603e0afac7243045f022c0` |
| `.github/workflows/ci.yml` | 5651 | `fcd203f94d6c77481ee36dfe5a31c1ae7160eba73e5756725e6b89d4c5926347` |
| `tools/native-review/cases.json` | 5634 | `5b7e49a3e9485f8471f2511554bec630d9dbce6bc3363accedcc737cba3bdeb5` |
| `tools/native-review/expected-runtime-dictionaries.json` | 38182 | `40b6a39e13d9b1370dbb3dc48aee7f91f83191809a603124fea7db33b488bde8` |

## 23-case timeout 核对

| ID | 分类 | 原 collector budget 秒 | VM timeout 分钟 |
|---|---|---:|---:|
| `home` | High paired | 1920 | 110 |
| `workshop` | High paired | 1500 | 95 |
| `south-090` | High paired | 720 | 75 |
| `south-091` | High paired | 720 | 75 |
| `south-092` | High paired | 720 | 75 |
| `south-094` | High paired | 720 | 75 |
| `south-095` | High paired | 720 | 75 |
| `south-096` | High paired | 720 | 75 |
| `resident-core` | High paired | 1080 | 85 |
| `bus` | High paired | 600 | 75 |
| `tram` | High paired | 600 | 75 |
| `ferry` | High paired | 900 | 80 |
| `waterfront-day` | High paired | 900 | 80 |
| `waterfront-night` | High paired | 900 | 80 |
| `east-interior` | High paired | 3600 | 180 |
| `north-book` | High authored-only | 1080 | 75 |
| `north-phone` | High authored-only | 1080 | 75 |
| `north-cup-owner` | High authored-only | 1080 | 75 |
| `south-parcel` | High authored-only | 1080 | 75 |
| `ownership-bus` | High authored-only | 1200 | 80 |
| `ownership-tram` | High authored-only | 1200 | 80 |
| `ownership-ferry` | High authored-only | 1200 | 80 |
| `continuous-tour` | Low functional authored-only | 14400 | 300 |

读取时间：2026-10-05T00:05:38.635931+00:00。

JSON：`/tmp/neon-native-github-workflow-pin-final-readonly.json`，45590 bytes，SHA-256 `683f73855f33390b3a9cf2870f20e701ce3dd8189c777e02e52d2ccef846ca66`。
