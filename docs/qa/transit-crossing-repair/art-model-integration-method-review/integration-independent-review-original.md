# selective integration 最终 27a8 脚本只读审查

结论：**静态合并门槛通过，未发现仍会影响本次正确合并的阻断缺口**。审查对象 `/tmp/neon-integrate-verified-art-pilot.py` 为11,517字节，SHA256 `27a8cdd80fa13cef16c039842de175df77c031b00cba975c4d1080da55f9e8b3`。此前37bb/fc02结论独立保留；本结论仅针对27a8。

未执行integration或mock，未运行tests/build/browser/GPU/远程请求，未修改任何repo。未读取active native metadata/result/video。只读方法、JSON与脚本快照均在/tmp独立路径。

## 复制前门槛

- fresh native整体passed及normal/404/delay-exit三场景按实际顺序全部passed；buildInfoSha256固定502af，methodHashes精确等于已审全部6方法，sourceHashes精确等于156 runtime字典。
- native archive非空、路径不越界/不重复、每文件bytes/SHA一致；必含metadata/build-info/closure/invocation及invocation的stdout/stderr成员。
- invocation要求statuspassed、exitCode0、PID52763、起止METHOD6bb/buildInfo502af一致；stdout/stderr原SHA与同ledger的bytes/SHA都验证。这补齐“meta先PASS、outerfinally随后失败”缺口。
- closure要求实际PID不存在、Chrome进程空、5208端口不通、serverClosed/gpuBrowserReleased/noProcessesKilled三项true。
- CPU闭合ledger固定33eb、每条bytes/SHA；summarypassed/METHOD6bb/freeze三true及差异空；全部原runner0、必要command标签齐全；各stdout/stderrbytes/SHA原样，原node-rules输出311 tests/pass、0fail/cancelled/skipped/todo。
- ROOT7145/146旧runtime和isolated502af/156新runtime逐项SHA一致；变化只能是main/city-exploration/metropolis-interiors三个既有文件及10新增runtime。固定manifest自身SHA约束其完整字典。
- ROOT原tests/package/lock按pinnedCPU proof核对；43npm测试字典成为复制后的精确集合。新增pilot test、capture/获取/inspection工具均按pinnedCPU source-after字典核bytes/SHA；detail独立固定f147。helpers既钉两文件内容，也限制目录集合精确两文件。
- 10新runtime、6extra files、两个复制目录在ROOT不得预先存在；原ROOT测试、package/lock、MP文件均不在覆盖清单。

所有这些检查都在第164行首次mkdir/copy之前。复制仅3既有+10runtime新增+6工具/新测试，以及QA与两helper目录；之后再核新runtime和43npmtest完整字典，核ROOT的MP traceoff SHA未被覆盖。没有dist复制、Git调用或分支操作，输出明确buildRequired=true。

## 现存闭合证据的独立核对

- ROOT：146/146 runtime SHA一致，7145manifest；56全测试/42npmtest精确字典，MP traceoff SHA `c3e382b6a86b2b0130a138e936817f35f5dc802c8ee586ffa7834433f89ad20f`，源码第9行traceoff仍在。
- isolated：156/156 runtime SHA一致，502afmanifest，53源码模块；43npmtest精确字典，仅新增pilot规则文件；package/lock与ROOT精确相同。
- CPU闭合ledger：92/92bytes/SHA一致；原命令记录exit0、stdout311pass/0fail/cancel/skipped、freeze三项true。当前6 native methods、detail和两helper集合皆精确已审值；全部拟复制extra文件与闭合CPU字典一致。

审查时fresh native closure-process-check和archive-ledger仍不存在。此次仅确认脚本会强制这些真实完成门槛，**不声称当前native已通过/关闭，也不批准或执行提前合并**；须由fresh任务完成并封存后再满足门槛。

产物：

- `/tmp/neon-art-selective-integration-27a8-snapshot.py`：已审脚本字节快照，未执行。
- `/tmp/neon-art-selective-integration-27a8-review.py`：本地只读SHA/字典核对方法，未import integration。
- `/tmp/neon-art-selective-integration-27a8-review.json`：详细runtime、CPU、tests/package、tool/helperpins结果。
- `/tmp/neon-art-selective-integration-37bb-review.md`、`/tmp/neon-art-selective-integration-fc02-review.md`：先前版本发现与修订记录。

最终脚本读取结束时SHA仍与27a8相等；不扩大既有QA历史整理范围。
