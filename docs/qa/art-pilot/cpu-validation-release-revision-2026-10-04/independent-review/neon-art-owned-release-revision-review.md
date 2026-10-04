# ART owned-release 修订独立只读审查

结论：该隔离修订的源码和方法在约定范围内未发现 blocker，可以进入 owner 的完整回归、重建和新原生现场验证。**这不是新的 native PASS，也没有裁决旧全局 +35 geometry 的唯一原因。**本人未运行 browser/GPU、正式 tests/build，未改 ROOT 或 isolated 项目文件。

审核对象是 [revision.patch](/workspace/scratch/neon-harbor-art-pilot/docs/qa/art-pilot/release-diagnostics-revision-2026-10-04/revision.patch)，SHA256 `2648aaecb41bd6db67ea2cd4d23d9443c4d5f11986885058295b187dac2e4510`。六份 before 存档及当前 after 均与声明 bytes/SHA 一致；所有 53 个 src 路径对照 ROOT，差异仍只有 main、city-exploration、metropolis-interiors 及新增 harbor-workshop-pilot。完整输入指纹与 CPU 原件见 [provenance](/tmp/neon-art-owned-release-revision-provenance.json)。

| 修订文件 | 当前 SHA256 |
| --- | --- |
| src/main.js | `9545b649258539de64d3a4c1a847c7be452468746a3d8a5e971008e66398aa5d` |
| src/city-exploration.js | `4bcee64c1fd0141a62ce7ca09f5511b6f648ea518e44f0201a622f6b83ffa28f` |
| src/metropolis-interiors.js | `6eaa1f76be34c795b76bda6f95c7c04cabc78a80867159aa9a8a122dd9b33573` |
| src/harbor-workshop-pilot.js | `0e46506ba9b84dba07a244c0912e0b463a5d44c3e2ea813a3d1cb6141613d6b7` |
| tools/capture-workshop-pilot.mjs | `6bb5b9b574e22b2be5ebec977d3b4f1e56faab64e3ed11d5fb9ef47bc426f714` |
| tests/harbor-workshop-pilot.test.js | `b4adc2365169fcad911e91d8efc74bb36bd32d794f6f1d2e10b916c1f93dc4be` |

## 源码的实际作用和边界

main 新增 callback 只复制 `renderer.info.memory.geometries/textures`；city 只将 option 传给 interiors；interiors 只传入 south-086/lobby pilot。pilot 每次实际释放一件资产时，同一个同步调用栈中依次复制 before、执行真实 dispose、复制 after，再记录 available、错误、真实差值及当时 attach/boneTexture 状态。中间没有 await、render/update、snapshot、renderer.info reset、getError、readPixels 或强制 upload。Three 的真实 dispose listeners 在这一调用栈同步注销已注册对象，所以这个差值能约束当次资产释放；城市下一帧 LOD 不能插入两个读取之间。

reader throws 或返回无效计数均留下 readErrors、available=false 和 null difference，实际 GLB cleanup 仍执行。没有将不可用计数转成成功零值。真实 `dispose` 自身抛错也没有伪造成功 release event。snapshot 深复制 before/after/difference 与错误数组，只复制既有有界事件；每帧没有新增 asset 遍历、GL 读取或 memory callback。64 条事件环边界保持；资源集合遍历仍在冷 load/release。

方法严格检查 normal 每次两个资产：vice 真实注销 **4 geometry / 4 texture**（3 PBR + 1 bone），chest **7 geometry / 3 texture**，各关闭 3 张实际解码 ImageBitmap，并要求 attached=true、诊断可用且无 readErrors。warm + 随后三次访问都检查这组真实计数，没有容差。404 fulfilled vice、已退出后完成的 parse 明确要求未挂载、无 bone upload 与 **0/0** renderer difference；CPU 资源释放仍为正数。不存在按 GLB 清单为 never-rendered 对象强造 GPU 下降。

这些计数证明 Three 在此同步区间实际注销了多少已注册对象，不能证明驱动显存即时释放多少 bytes，也不能推出全城无泄漏。全局 street 计数仍真实等候四个连续稳定样本并逐轮保存；旧 `after===baseline` 断言改为观察，是资产所有权验证范围的明确修订，**不是把首轮失败追认通过**。原 +35 在近景后返回期间已经出现且早于退出，独立归因报告仍只认定具体 LOD 候选，缺原 GPU 注册 UUID，不能唯一归给 bus2 或排除全部其他资源生命周期。见 [旧 FAIL 资源调查](/tmp/neon-art-native-fail-resource-review.md)。

## 核心路线与加载范围复核

对当前修订真实 createCityExploration/layout/interior-system 又做一次独立 CPU 对照，双方分别初始化自己 programme registry，未 fetch、JPEG decode 或 WebGL。方法 [scope-probe.mjs](/tmp/neon-art-owned-release-scope-probe.mjs) SHA256 `d11745b0af0911d84092a15684a79fc9847e3cb2a3a8cae87cc9c34a6a1258d3`，exit0，原 [stdout](/tmp/neon-art-owned-release-scope-probe.log) 与 [JSON](/tmp/neon-art-owned-release-scope-probe.json) 保留。

实际目录 220 栋 / 4,150 个 catalog floors 中，唯一 pilot plan 仍为 south-086/lobby。三处连续路线地址 south-079、south-095、sail-club 以及 085/087/east-001 抽样的入口、第二和顶层纯 layout 均相同；三处路线 collision context 字节完全相同，无新增/改变 collider，system snapshot 除新增空诊断字段仍相同。将实际 pilot 坐标喂给每处已进入地址，也只有 086 触发两件 loader，其他地址零请求。086 原 collider 均保留，仅加入既有 crate 上方的同一个 tool-chest AABB，原布局/楼梯不变。连续路线离新增 collider 的最小 XZ 距离仍为 46.55m。

新 memory callback 不更改 plan、24m load/32m retain gate、入口筛选、楼层/家具布局、collision、门、楼梯、保存、时钟、交通/居民或经济。没有新增 import/cycle 或全局初始资源下载。原已有初始 pilot module 下载开销随源码由 13,149 增至 14,598 bytes（未压缩字节）；GLTFLoader 与 GLBs 仍需进入唯一地址并接近后才动态请求，不能称额外脚本开销为零。

本 CPU 范围证据不将旧 ROOT manifest `7145…` 的连续 tour 变成新 ART manifest 的实录。狭窄地址渲染改动可由旧 core 连续路线、新 pilot 独立 native 现场及最终完整 CI 分别提供证据，前提是各自明确绑定真实源码、方法和 manifest，原结果保留、合入后完整规则/build/CI 实际完成。

## 方法和原始证据保存

新 6bb5 方法保持 High/native 1280×800、公开 Atlas 独立初始定位、真实 E/WASD/鼠标、4 次 normal visits、独立 404/delay context、正常零错误、40/10/10 分钟 phase 及总 60 分钟有限 hard deadline；不加入自动玩法重试。新 source/served/method 前后指纹检查仍保留。截图错误留存修改先 persist 原断言，再单次 snapshot/PNG 尝试，保留失败栈、原文件名、开始/结束 UTC、成功时实际 PNG SHA；snapshot/screenshot 异常被单独 catch，随后抛回原断言，外层不再次拍照。这里审核的是可选捕获错误不替换原断言，并非新增对所有文件系统或 teardown 异常的通用保证。

已只读核对 owner 保存的 targeted 9/9 exit0、六份 Node --check 与 diff --check exit0 原件；本人没有重跑正式测试。新增 CPU dispose-listener adapter 明确只验证同步顺序、数字复制、不在 hot snapshot 读计数和 never-rendered 0/0，另一个 reader-throws 用真实 CPU GLB cleanup 验证仍释放 11 geometry / 6 textures / 6 images，错误深复制。CPU adapter 不代表真实浏览器上传、JPEG 解码或 GPU 释放已通过。

独立 ledger 子审再次核对新 revision 14/14 文件（278,876 bytes）、六份 before/after 6/6，以及旧 archive 183/183 文件（35,077,584 bytes），均 exact、零 mismatch，原方法与封存 ledger 自 SHA 没变。逐条方法/JSON 与 SHA 表在 [ledger 审查](/tmp/neon-art-owned-release-ledger-review-summary.md)，未读取任何仍在写的新录像。

首轮原方法 `8be52d410558e25da2016ce7d83fd669b2647ed27e1904c1a22e3404d62516a9` / manifest `8f9186c1a3da3ebf1b3cc25db9adcaa66945871a06565bbd4e4cbfbcf8859204` 的 FAIL、原缺失 failure PNG 和封存 archive-ledger `fb60ba35e31ca0b392aaa465823565ecab962c93173850dbf32f48144f160be1` 均保持。新的 owned 检查必须在重建、完整回归、另行冻结的新 manifest 和 normal/404/delay 原生现场中真正采到才算通过；截至本审查没有该新现场 PASS。
