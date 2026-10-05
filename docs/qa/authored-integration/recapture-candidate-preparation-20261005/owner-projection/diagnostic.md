# OWNERSHIP-BUS 原始失败与最小观察候选

原始run source为 `cc038f20b3d26028dae9d9c3a86e4c2183a183b5`，方法 `b64e798f68c2bc79e7f1bd6c278c1de19d85c13c0c33110ad0b0957acca5b6f2`。artifact11322937962 原ZIP16098198B，父代理已核SHA b0188984544d705a57d74595061e403c88e8a3706f296fb90cd82d62277fa0bb；本任务没有重新散列大原件。原FAIL完全保留，未改原目录。

## 实际失败位置

- 02:47:47.145，第一张 `01-high-loaded` 原PNG完成；before/after原快照、High实际GL查询存在。
- 02:47:47.177，`before-low-same-pool-baseline` 成功，sim4.1166667、High、revision2。
- 02:48:09.225，`public-low-selected-paused` 成功，UI Low、paused=true、sim4.6166667；C实际桥仍2 pools、2 authored实例、audit tail16。暂停时 main frame直接return；C update只在普通frame调用，因此这个暂停样本本身不证明释放或泄漏。
- 02:48:39.406，首次错误事件：`read-only actual snapshot exceeded 30000 ms`。原read的timer定义在85行，实际调用在172行。由218–220 publicQuality的正常resume→ordinaryFrames可确定它属于 `actual-low-ordinary-frames` 内read；未达predicate的每次poll没有原journal，不能唯一断言第几次read。

尚未到 Low pool/instance释放守卫、第二张PNG、恢复High新generation、第三张PNG及最终守卫。该原C case只定义一个High→Low→High生命周期，不用未知后续状态补任何“rapid generation”结论。runtimeErrors空；整个case约157.8s（whole1200s），owned child3187/startTicks18452实际exit0、无signal，context/static/browser close均成功，外部wrapperownedClosureConfirmed=true、剩余owner为空。此次首错是读取30s失败，不能改称清理失败、资源泄漏或通过。

## 已证实的观察开销与限度

原方法并非每个read都传完整世界：172行已有browser内投影。但是投影仍传完整transit、pool/fleet身份及完整64上限audit历史；原11个已保存样本的compact JSON UTF8约115KB，audit16条本身约71.9KB，其中重复传递相同资源身份较多。末样本115173B；去除已经严格收集过的16条immutable audit rows后为43352B，减少71821B（约62.36%）。这不是已测Playwright协议字节或运行时速度。

`src/main.js:427` 无参数 snapshot仍先执行完整world.snapshot、residentAssets.snapshot({includeReview:true})，然后外部page.evaluate才能投影。`src/city-exploration.js:273` 包含室内/普通与样板交通/居民/沿街/城市目录等，`src/harbor-district.js:299` 对街景root逐mesh遍历；`src/resident-core-assets.js:66`附近review重新汇总模板所有者并调用各actor review。仅改观察方法不能绕过这些构造，完整CPU工作仍存在。C自己的 `src/harbor-authored-transport.js:303` 则是缓存/标量读取，没有每snapshot重新遍历C模型。

没有原RPC trace或分段duration能唯一分离browser事件队列、Low首帧/资源释放、完整snapshot构造和协议序列化，也没有失败read的返回体。前面的115KB读曾成功，所以大小本身不能证明这次30s根因。候选只是可验证减少重复数据的最小观察改进；未做GPU重拍，速度和30s是否足够仍未知。不会增加读限、whole/phase cap、暂停自然时钟/NPC或降低High。

## 候选修改与守卫保持

payload只有 `tools/native-review/methods/transport-owner/native-transport-ownership-extra.mjs` 与 `method-manifest.json` 两件，基础与artifact封存件、当前ROOT字节完全相同后才派生：

1. 新readOwnershipObservation仍调用实际公开只读snapshot；pool/pending/fleet与各完整resourceStats字段逐字值保持（所有geometry/material/texture/image/instance ID及任何额外字段都保留）。renderer/AO/shadow、camera/presentation、settings、timing和其他当前返回数据不裁剪。
2. 第一次read全部audit rows；随后只跨RPC返回sequence>已确认lastSequence的新行。`src/harbor-authored-transport.js:11`递归freezeData、142行audit递归冻结事件；已消费行已完整归档在record.auditEvents，candidate不改变collectAudit。sequence gap/controller/tail/64上限/dropped metadata/新failed事件守卫完全保留，不能漏失未观察事件。
3. 公共stop listing从原完整snapshot跨RPC返回，改为仅投影实际stops数组；stop选定ID和正常公共setup不变。
4. manifest只更新tool bytes/SHA并追加此观察amendment，原9 GLB/HTTP/hash/servedSource/process-owner pins与所有预算不变。nativeImages、releasesFor、waitState、whole deadline/cleanup尾部等原代码块字节相同。

14项纯CPU回放通过：原11样本的审计证据与tail完全相等、首次全字段保持、原source不被修改、完整pool/instance/resource字段保持、新未知字段保持、missing sequence/controller变化/pool failure继续失败、原守卫/预算字节保持。node --check exit0。CPU回放不构成native运行通过，也不把CPU引用/编码纹理大小当实际VRAM；shader/VRAM“不测”边界未变。

## 采用方式

仅由ROOT将两个payload精确合入独立 `/tmp/neon-native-recapture-candidate-20261005`。该目录和ROOT此次均未写。之后刷新外层bundle两项真实pin，再绑定新HEAD进行一次新ownership capture；原b64e失败仍保留FAIL。不要复制provenance原件覆盖当前runtime-resources或借该候选改变来源/物理/画质/断言。下一次实际失败照样保留，不承诺本次候选一定消除30s读取失败。
