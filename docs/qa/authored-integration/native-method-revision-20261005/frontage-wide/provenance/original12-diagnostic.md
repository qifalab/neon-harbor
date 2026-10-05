# 原始091/092 12分钟 native 方法只读诊断

四份原collector均failed，whole hard timer在720s结束实际浏览器。091 baseline/authored与092 baseline停在原step7/20，092 authored停在step6第三照片的screenshot。无E进入/退出证据；不能把它们写成只cleanup失败或route通过。原记录原字节保留，以下为静态源与已保存动作/pose的对照。

|case/mode|completed photos|active original step|whole reached|primary original error|
|---|---:|---:|---|---|
|south-091/baseline|3|7|True|page.evaluate: keyboard.up: keyboard.up: keyboard.up: keyboard.up: keyboard.up: page.evaluate: keyboard.up: keyboard.up: page.waitForFunction: Browser closed|
|south-091/authored|3|7|True|page.evaluate: keyboard.up: keyboard.up: keyboard.up: keyboard.up: keyboard.up: page.evaluate: Browser closed|
|south-092/baseline|3|7|True|page.evaluate: keyboard.up: keyboard.up: keyboard.up: keyboard.up: keyboard.up: page.evaluate: keyboard.up: page.waitForFunction: Browser closed|
|south-092/authored|2|6|True|page.screenshot: Timeout 98472ms exceeded.|

## 实际逐腿推进与首阶段成本

|case/mode|axis→target|wall秒|sim秒|原sim guard秒|corrections|
|---|---|---:|---:|---:|---:|
|south-091/baseline|z→117.678396|20.683|1.250000|6.250000|0|
|south-091/baseline|z→118.678396|23.734|1.500000|6.250000|0|
|south-091/baseline|x→225.644352|102.267|4.100000|8.805439|0|
|south-091/baseline|z→107.000000|90.795|4.466667|9.097995|0|
|south-091/authored|z→117.678396|25.412|1.500000|6.250000|0|
|south-091/authored|z→118.678396|26.688|1.500000|6.250000|0|
|south-091/authored|x→225.644352|106.853|4.233333|8.805439|0|
|south-091/authored|z→107.000000|64.069|3.250000|7.597995|1|
|south-092/baseline|z→144.119987|25.399|1.500000|6.250000|0|
|south-092/baseline|z→145.119987|22.166|1.250000|6.250000|0|
|south-092/baseline|x→225.837362|122.625|4.500000|9.046702|0|
|south-092/baseline|z→133.000000|88.183|4.716667|9.387001|0|
|south-092/authored|z→144.119987|37.955|1.500000|6.250000|0|
|south-092/authored|z→145.119987|35.955|1.500000|6.250000|0|
|south-092/authored|x→225.837362|125.839|4.700000|9.046702|0|
|south-092/authored|z→133.000000|79.367|3.500000|7.687001|1|

所有已完成的轴腿有真实位置与simulationTime推进，未改变revision，且通过原有限sim guard。相同约12.6m的X腿需要102–126s，但只有4.1–4.7sim秒，不能把wall慢直接当物理不动。092 authored的Z对齐有一次显式correction，移动.2m/17.2wall秒后到误差.0504m；其余已完成腿无无限correction/retry。

091 baseline最后return-Z：开始真实z106.9050625，coarse用55.487wall秒/1.75sim秒到116.7050625，真实前进9.8m、还差1.9733334m。随后precision only24.984s被whole timer关闭，局部hold120s尚未用满；没有after状态，不能补造最后实际位置。091 authored最后hold以及092 baseline最后hold缺after，也不能补造持续推进曲线。

boot/setup也吃同一720s：首次Atlas事件约80–92s后才写下。原capture没有screenshot start/end字段；本报告只使用真实look结束→下一步walk开始的整体photo-processing边界，包含ready/RAF/snapshot/GL/screenshot/hash/persist，不能全记为纯screenshot。

|case/mode|photo label|look finished→following walk processing秒|before→after sim|
|---|---|---:|---|
|south-091/baseline|south-frontage|66.599|2.250000→4.750000|
|south-091/baseline|actual-public-door|93.130|7.000000→9.250000|
|south-091/baseline|east-display-face-close|95.629|20.800000→23.800000|
|south-091/authored|south-frontage|79.081|2.750000→5.250000|
|south-091/authored|actual-public-door|95.260|7.750000→10.000000|
|south-091/authored|east-display-face-close|123.774|20.733333→23.983333|
|south-092/baseline|south-frontage|77.995|2.500000→5.250000|
|south-092/baseline|actual-public-door|98.252|7.750000→10.250000|
|south-092/baseline|east-display-face-close|115.416|22.466667→25.716667|
|south-092/authored|south-frontage|88.164|3.000000→5.500000|
|south-092/authored|actual-public-door|95.639|7.750000→10.000000|

原authored092第三图没有PNG/pose/完成capture记录：primaryError screenshot Timeout98472ms，fonts已loaded。源line178 screenshot cap是remaining(default180000)，但whole只剩98.472s，故原180s局部photo预算被whole截短。已完成照片before/after时钟推进不证明这次尚未完成的screenshot期间一直有frame。具体renderer/compositor/IPC瓶颈不能凭metadata唯一归因，也不称flaky。

## 092真实灯柱与名义路线风险

world-config13实际player r=.65。world.js446–447在街块(200,120)放真实灯柱(225.5,145.5)，box half extents.1。原X腿coarse在224.2尚clear，后续precision附近有两模式相同Z侧移145.1199868→144.7496006（−.370386149）。这个位移与柱北边145.4减r.65吻合，具体source collision机制支持接触滑移，但没有独立contact事件，不能称完整实录证明。

原return-Z在两mode X225.8253757/225.9853757固定时，circle/rectangle最大Z144.7903232/144.8765637，目标145.1199868误差.329664/.243423均>.15。这证明名义r.65 cardinal路径不clear。collision.js313–329可接触侧推X/Z并保留tangent，故不能声称永远不可达；可能实际碰撞绕柱，但原target-axis guard不约束额外横移。当前直接FAIL仍为whole timer，最终return碰柱本身未记录。

ROOT新授权candidate会添加真实corner detour：从east close原X先Z至face+1.8（143.9199868），X到中心213，再Z恢复原Atlas entrance145.1199868，随后原门口路径/E照旧。相比face+1.2，1.8也避新south door stone sill最外.835与r+.15站位tube，几何专职仍在封存完整静态proof。未关闭灯柱、修改产品physics或原照片。

## 有限whole预算提议，尚未改源

建议ROOT可审两种明确配置：原frontage only whole18min；带一张wide+approved detour whole24min。原源码12min是方法自选值，新proposal不伪称它来自用户约束。已完成首阶段与091最后真实coarse证明原720s过早截断有实际推进的合法动作；尚需return X/Z、原E/reentry/exit tail（实际094该tail约80–82s），wide再增加有限out/back与一张photo。18/24仅供选择，未知Screenshot阶段和动态车/NPC仍可能失败；不是通过保证。

必须先消除092名义lamp路径风险；预算-only不能证明修复。候选目前仍12min，不实现root未选预算；原120s hold、180s默认phase、.15、最多两次correction、原sim guard和所有High/hour/FOV/resolution均保持。源码新候选、原FAIL与未来实测结果分别封存，不能覆盖失败图像/证据。

JSON包含四份原metadata/每input/hold/pose/PNG/source SHA与实际时间。未执行浏览器/GPU/tests/build、未import world、未改ROOT/原档。
