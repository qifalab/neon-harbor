# Selective ART integration 最终 27a 只读审查

结论：**scope PASS，未发现会实际影响正确合并的剩余阻断项**。可在当前 fresh native 三场景真实全部成功、原 runner exit0、进程/GPU闭合及 archive 完成后由 root 执行。此次只读审查不代表这些运行前置现在已满足；没有执行 integration、tests/build/mocks/browser/GPU，也未读取仍运行的 native metadata/video。

最终脚本 [只读副本](/tmp/neon-integrate-verified-art-pilot-27a-reviewed.py) 11,517 bytes，SHA256 `27a8cdd80fa13cef16c039842de175df77c031b00cba975c4d1080da55f9e8b3`，与当时 `/tmp/neon-integrate-verified-art-pilot.py` 字节相同。旧37bb报告另行保留，以下结论只绑定27a，不追认旧门禁完整。

复制前的实质门禁已经闭合：

* Fresh metadata 必须按原顺序 normal/404/delay-exit 三场景与整体全部 passed，并绑定 manifest `502af982ac2999fb28c395388d7d97acdf6165df803f62b3069f95cafa2dcbb3` 及完整六份 approved method 字典；当前 source、方法和 archived build manifest 均重新核 SHA。
* Fresh archive ledger 必须非空、路径在本目录内、不重复，各件 bytes/SHA 全部相同；必须包含 metadata/build-info/closure/invocation 原件。原 runner 必须 status passed、exitCode0、pid52763、起止6bb方法和502af build不变，stdout/stderr 必须属于该 ledger 且原SHA一致。该 exit gate 补足了冻结6bb先写 metadata passed、再执行 outer cleanup 的结果边界。
* Closure 核对真实结构：原 method PID 消失、Chrome进程为空、5208端口连接失败、server/GPU browser已释放，检查未杀进程。仅创建同名文件不能满足门禁。
* CPU ledger 固定为 `33ebad117d8057bd6a6f1939b168b15cb6e259e2b15a97b5d9760d1bae76a534`，全部原件 bytes/SHA 检查；必须有原summary、commands、stdout、freeze及test-tree proof。summary passed、method6bb、各freeze true/差异空；所需rules/build/assets/tree commands存在且全部status passed/exit0，原stdout/stderr bytes/SHA相同，原规则输出明确311测试/311通过/0失败、取消、跳过或todo。证据结论不再只来自未pin的字典描述。

实际复制范围受 pinned 两个 manifest 约束：ROOT原 `7145fa443190896ff24050d518a54fea364ddb0547ddfa71756a33d64c515fb3` 的146件原runtime源码先逐件保留SHA；新502af是156件，只允许 main/city-exploration/metropolis-interiors 三个既有runtime改变，十件新增runtime且含唯一pilot module。PILOT全部最终runtime源码与502af相同；native sourceHashes字典必须完整等于最终156字典。

额外复制文件也有精确边界：新test、acquisition/inspect工具及6bb均匹配 sealed CPU source-after 的 bytes/SHA；副近景工具单独固定为已独立审过的 f147；helper目录文件集必须恰为两份approved helpers，并已逐份SHA检查。目标中新文件/目录如已经存在则停止，不覆盖未知工作。所有这些检查都位于第一处 copy2/copytree 之前。

ROOT原全测试树与package/lock逐件比较，不从隔离目录覆盖已有测试或package。复制后156件runtime再次逐件比较，直接npm规则43文件集合和全部字节必须等于sealed 311 PASS字典，ROOT多人rooms.spec.js继续等于原full-test proof，保留traceoff修正。脚本无Git调用，不复制dist；成功仍明确buildRequired。ROOT仍要实际重建/final freeze及最终CI，不能将隔离的502af build直接称作合入后的线上manifest。

原只读 ledger 子agent的独立 [27a8复核](/tmp/neon-art-selective-integration-27a8-review.md) 同样通过，方法/snapshot/JSON位于该报告链接；其旧37bb/fc02报告保留。双方没有执行integration或读取运行中的结果；fresh closure/archive仍缺，故现在不能将原生suite称作PASS或closed。

副近景 f147 的独立 [scope报告](/tmp/neon-workshop-vice-detail-f147-review.md) 已 PASS，exact [方法副本](/tmp/neon-workshop-vice-detail-f147-reviewed.mjs) 保留。主资源suite和副近景各有独立证据用途；近景工具只有root另行明确GPU GO后执行，当前仍未运行。
