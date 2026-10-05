# ef92 south-094：collector cleanup 独立只读核查

结论：原采集器 FAIL；有限产品步骤 / 原图采集已完成。两 mode 和 pair 继续保持 FAIL，不追记 PASS，不代替 Root 已做的原图美术审阅。

baseline / authored 各走到 13-step 的末步 index12，9 events、6/6 completed inputs、2/2 captures（south-frontage / actual-public-door，High1280×800、DPR1）。真实 E 进入→退出→重入→退出均记录，末步是 shell-restored-after-re-entry；runtimeRecheckedAfter=true，说明循环已完成后才进 finalization。errors / errorsAfterFinalization 均空。短 frontage case 没有 per-owner release transaction，不补推内存结论。

两份 primaryError 同为 `Owned cleanup failed`，从 collector line309 finalization 汇总生成；唯一 finalizationErrors 项也是这一项。context/browser 约20/5ms closed；owned-browser-process close 整30s失败，随后 exact-owned kill 约44/57ms closed，server closed。最终 browser exitCode=null / signalCode=SIGKILL。wrapper exit1、collectorComplete=false，却记录 remainingOwnedProcesses=[]、ownedClosureConfirmed=true、port5240 ECONNREFUSED，说明最终实际关闭与采集器正常关闭成功是不同事实。

## 具体 collector 边界

归档方法 `20c51a6207ae9ef2d21709a386e37cdd851a59521265ea0be332645a3edbf52b` line293-299：外层 Promise.race 用30000ms关闭 owned BrowserServer。固定 Playwright coreBundle `9393fa79e1c67c74edc26b610d65a4f7ed73d345a762465cc88340a33a2454ac` 源码明确 BrowserServer.close→browserProcess.close→closeOrKill(DEFAULT_PLAYWRIGHT_TIMEOUT=30000)。外层 timer 先设、operation 在 microtask 中才开始，因此两层同30s会产生外层先记录失败、内部 close/fallback 未结算的截止冲突。两原记录符合该边界。具体为什么 graceful child exit 没有及时完成，现包无法证明。

最小未来 collector-only 方案：只为 owned-browser-process 外层等待给内部30s再留5s有界收尾余量（例 cap35000，仍 min 到原whole-case deadline），并显式把实际 forced cleanup / SIGKILL保留为finalization failure。这样避免两层timer互相抢先，又不能把内部强杀后return的close误写成功。当前line307只检查 still-alive（exitCode===null且signalCode===null），没有异常signal/SIGKILL失败守卫；该守卫必须作为显式新代码加入。仅改35000会允许provider内部SIGKILL后resolve被标成closed，不能单独采用。不得仅删finalizationErrors或用wrapper最终closed覆盖FAIL。

保持 route/13steps/两photo、High/FOV/hour/实际输入、原12min whole-case和hardtimer、context/browser10s/10s、fallback5s、原首错优先、完整source/method/assets门槛。修改限该collector cleanup等待/记录小hunk，新candidate更新method/bundle SHA后重封；原ef92包与run不改。此建议未应用、未运行，未来fresh授权run仍需证明正常关闭；仍timeout或SIGKILL时继续FAIL。

## 已核来源

- baseline metadata 224464B，SHA `1bb4b1aa5282431327f2088a03c93ac439198de27ac37c1510214391c4dc90ce`；authored244427B，SHA `c1fa62c18ba72bb9c80e09f6ef86a4f4cd69fc3c8e96ca060701e939d6cecef7`。
- HEAD/headAfter/buildRevision 各自一致（baseline7a90完整值、authoredef92完整值）；gitStatus空且不变。metadata source/served/manifest字典156/190分别与归档expected字典exact，wrapper freezeBefore/After对象exact；8个copied method文件 SHA逐项实读匹配两metadata。没有远程重hashsource/dist。
- 原stderr双方均350B/SHA `de23685838de74d62898937cd1723f8f29c614268fddb04e926c141fba82f3f8`，只报告 Owned cleanup failed；stdout均空。provider静态文件SHA与包processAdapter pin exact。

未执行API/download、runner/tests/build/browser/GPU/Git/ref；未改任何源文件、原证据或候选；未读PNG/pose内容，未全hash archive。已把collector边界及FAIL限制直接告Root和父审查。

精选JSON：`/tmp/neon-native-ef92-south094-collector-readonly.json`，26762 bytes，SHA `f94d34e659328726104e1f6869d89356637231317fd8442e988549811679c513`。
