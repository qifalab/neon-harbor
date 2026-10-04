# 首轮 ART native FAIL：资源归因与同步释放证据边界

仅只读已关闭的 `native-validation-2026-10-04`、其 immutable frozen-source 和 CPU 场景引用；未 GPU/browser/test/build，未改任何项目文件。原结果必须保持 FAIL。本报告不把 35 个 geometry 解释为已经证明的正常缓存，也不放宽计数。

原捕获 manifest `8f9186c1a3da3ebf1b3cc25db9adcaa66945871a06565bbd4e4cbfbcf8859204`，方法 `8be52d410558e25da2016ce7d83fd669b2647ed27e1904c1a22e3404d62516a9`。闭合 archive-ledger SHA `fb60ba35e31ca0b392aaa465823565ecab962c93173850dbf32f48144f160be1`，183 条全部 bytes/SHA 再次相同。当前 owner 修改 isolated 新源码不影响这些原始字节。

## 已证明的具体发生范围

| 原事件 | sim 秒 | global geometry/texture | pilot |
| --- | ---: | --- | --- |
| 第一次退出后稳定街道 baseline | 43.849999999999 | 580 / 118 | 已释放 |
| 第二次近景核对完成 | 64.416666666664 | 591 / 133 | ready，2 asset，11 geometry，6 decoded texture，1 bone texture |
| 第二次返回 x182.8 后 | 67.083333333331 | 626 / 133 | 同一 ready 状态及相同资源，尚未退出 |
| 第二次真实 E 退出 | 78.833333333330 | 615 / 118 | null，两件 release event 完整 |
| 第二次街道最终稳定/失败 | 79.333333333330 | 615 / 118 | null |

所以 +35 是在室内 near→return x 的 2.6667 sim 秒发生，先于退出；这段 texture 不变，也没有新 pilot load/decode/release。随后退出下降 11 geometry 和 15 texture。首次 warming 期间同样有 +32，而第一次退出后又从 519/98 增至 580/118；短时全局计数稳定不能证明城市所有会变换的 LOD 都已经注册。

原 release events 对每次加载均完整列出 vice 4 geometry、3 material texture、1 skeleton、3 closed ImageBitmap；chest 7 geometry、3 material texture、0 skeleton、3 closed ImageBitmap。该返回对象是 disposal 输入集合大小，**不是当时实际 GPU 注册量**。实际 vice boneTexture=1 增加的第七个 GPU texture 由 Skeleton.dispose 另行处理；原 events 没有逐件 renderer-memory before/after。

已提取真实 timeline、memory samples、释放原字段：[evidence summary](/tmp/neon-art-native-fail-evidence-summary.json)，方法 [CPU 原件读取](/tmp/neon-art-native-fail-evidence-probe.py)。

## 排除与具体 LOD 候选

south-086 不在 HARBOR_FRONTAGES 六址之内；`createHarborRoomDressing` 第一条件直接返回 disabled/0 draw/0 triangles，不构造后面 bucket geometries。对 frozen-source 实际 city/programme/system 的独立 CPU 四轮 entry/exit，室内 primitive 共 5 个 geometry 对象，四轮 geometry UUID 完全相同；native Canvas signs 使用另一个 system-scoped 单一 PlaneGeometry。各 floor InstancedMesh.dispose 释放 instance buffers，未复制 underlying geometry。该地址的 shared floor 和 dressing 不能凭此解释 35 个新 geometry。

CPU 方法：[interior geometry probe](/tmp/neon-art-native-fail-interior-geometry-probe.mjs)，真实结果 [geometry references](/tmp/neon-art-native-fail-interior-geometry-proof.json)。Node 没有 document，Canvas sign 与 GLB load 均未运行；该结果只证明真实 primitive 对象引用缓存，不是 GPU UUID 注册记录。

同期 ambient cars/walkers 在普通室内被现有 syncContext/visibility 路径隔离；north people 的 detailed/pool 为 0，harbor-life detailed 为 0、pool 为 6，不能从这些现有快照推导该段新建 35 个 NPC geometry。普通房间仍渲染 harbor sample fleet；只有封闭电梯才隐藏该 root。外景 LOD 是实际存在的候选路径。

独立 CPU 对 frozen-source 实际 `createHarborVehicle` 引用枚举：bus/tram tiers 为 35/35/32，ferry 44/44/41；同 kind 两个实例共享该 102/129 个 geometry UUID，tier 之间不共享。不能把同 tier 两车重复算成 70。每种未曾渲染的 tier 首次进入 WebGLGeometries.get 会使全局 geometry 数增加，模板 geometry 在 instance 释放时有意保持。

结合实际四个 near fullsnapshot 和 failure fleet serviceTime，以及源码 `advance ∈ [0, step]`，推导增长段 bus2 距实际眼点的可达范围约 29.39–48.59 m，跨 near 入门 36.96 m；tram2 还跨 middle/far 迟滞区间，其 middle 也是 35。它们是具体的数据/代码候选，**没有唯一归因证明**：原 capture 没记录那 2.6667 sim 秒内逐帧车辆 serviceTime/LOD、实际 renderer 已注册 UUID 集或首次注册 owner。CPU 新构造的 UUID、匹配数量和 route 时钟区间不能补造原 WebGL 的身份记录。现有证据不能排除另一组首次上传或对全城作无泄漏结论。

独立枚举及 phase 边界的完整 [报告](/tmp/neon-art-geometry-growth-readonly-review.md)、[方法/原 stdout/JSON 与 SHA](/tmp/neon-art-geometry-growth-readonly-provenance.json) 已保存，162 个 capture runtime/method 指纹一致。其最后提出的逐 UUID 全局记录是继续裁决全城增量的可选工作；不是新 pilot-owned 释放检查必须作全城零增长承诺。

## 同步 owned GPU before/after 的有效范围

实际 shipped Three r185 的 minified module 中，WebGLGeometries.get 第一次注册 geometry 时同步加一并注册 dispose listener；该 listener 同步删除 attribute/binding states、移除自己并将 memory.geometries 减一。EventDispatcher.dispatchEvent 是同步调用 listeners。WebGL texture dispose 在已经 init 且 source/cache usedTimes 降到 0 时同步调用 gl.deleteTexture 并减 memory.textures；Skeleton.dispose 同步 dispose boneTexture，再置 null。[精确原字节摘录](/tmp/neon-art-native-fail-three-disposal-excerpts.txt) 保留了 character offset，所据源 SHA 见 [frozen copies provenance](/tmp/neon-art-native-fail-source-provenance.json)。

因而，同一同步调用中依次 `read memory → disposeWorkshopAsset(asset) → read memory`，没有 await、RAF、强制 render 或清空 info，只读 callback 返回复制数字，能测出该释放段真正注销的 Three renderer 对象量。这比跨几分钟的 global street baseline 更能绑定这件资产：世界动画/LOD不能在同步中途推进。callback 必须只观察、event 深复制数据，不能读取后替换成期望数量或改变 renderer。

完整实际渲染的两件 normal 资产可严格期待 vice **−4 geometry/−4 texture**（3 PBR + 1 bone）、chest **−7 geometry/−3 texture**。需要新 native run 真正采到这两组值、事件与实际两件资产身份匹配；旧 FAIL 没有这些 callback 数据，不能追认已通过。registered 数减少不等于驱动显存立即少了多少字节，也不说明所有城市或全部 texture/program cache 被清空。

404 中 fulfilled vice、被取消/迟到 parse 的资产可能从未 attach/render，renderer 没注册这些 geometry/texture；其 CPU dispose 输入集合可以为 4/3/1，而实际 memory delta 为 0。必须分别记录 source disposed、boneTexture 当时是否存在、是否 attach/曾 render 与实际 delta。不能用 GLB 清单硬造负数，也不能把未发生的 late parse 写成发生过。重复 dispose 的已注销对象也不会再减同样数字。

新方法如果以以上 owned 严格 invariant 检查 pilot、继续记录全局 580→615 观察，属于明确收窄到资产所有权的证据，不能声称旧 baseline 断言正确或全城无泄漏。原 8be52 失败应继续可下载复核；新源码/方法另冻结、完整规则/build及新 normal/404/delay 原生现场仍必需。当前报告是旧故障归因/方法边界审查，不是 owner 正在写的新 callback 的最终代码批准。
