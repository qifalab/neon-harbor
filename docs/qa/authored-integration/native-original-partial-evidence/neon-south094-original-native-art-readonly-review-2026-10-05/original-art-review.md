# south-094 原始 native 图像与实际姿态只读评审

结论：authored 的入口可辨识度有具体改善，但这四张原图只支持局部门口的定性判断，整店街景外观仍需补拍。两份 collector 仍为 failed，不能手动写 PASS 或 AAA 验收。

我用 view_image(original) 查看 baseline/authored 各两张1280×800原PNG，只读取 JSON/receipt、计算原字节SHA和PNG头尺寸；未裁切、调亮、拼接或编辑原图，未运行浏览器/GPU/tests/build，未改ROOT或原artifact。

baseline实际源码/build revision是7a90f7934b7c9d1af5c4494bf08c4ec337c373e4，authored是ef92c25980f1da12b508971170b72b9dd6230059。两模式同capture tool SHA20c51a6207ae9ef2d21709a386e37cdd851a59521265ea0be332645a3edbf52b；完整method/dependency和原build-info字节pin见JSON。baseline build-info SHA4e10135a76da95817365493cfc834d6ed757999f6cba98ae4c3344429a5971c4；authored95087f264b7f52bb9d3cad03aefe2801aeb840806c1f63656c6e2b7036d4295e。

## 原图中可以辨认的改变

south-frontage配对：baseline是大片深青灰面板、细中心分隔和外部支柱；authored在同一位置出现中央厚棕色门框、圆角上部轮廓、双扇中央门缝和两把竖向把手。门的几何层次和用途更好辨认，不只是颜色变化。这个近视角下门框份量较重、占据中心主体；全立面不在图中，尚不能判断其相对整店宽度的比例是否合适。

actual-public-door配对：两图同样显示“E 进入 晨罐烘焙”的真实交互提示。authored的双把手和门缝在深阴影里仍清楚，baseline中心只有较细分隔。图片说明可视门样式更接近交互入口；它们不证明门扇会铰接打开或所有门的物理功能。原metadata另有同地址真实E进入、lobby、退出/外壳恢复、物理重新进入、再次退出事件，作为功能轨迹事实保留。

材料观察：可见棕色檐/框、冷暗色面板、绿色墙面、局部基座和铺地。authored边缘圆角与厚度增加局部形体深度；但阴影占比很大，玻璃/面板材质差别与细粗糙度、normal细节不够清楚。右侧店名展示板被裁，左侧有常规教程/HUD遮挡。不能仅凭scannedMapsLoaded=6升为完整材质质量验收；暗像素是实际原画面，不能调亮后声称原画面可读。

## 姿态、时间与画面保真

两模式每对的prepared完全相同；实际before/after身体位置、body yaw、camera position/target/focus/yaw/pitch/FOV、settings、paused/started、revision均逐字段相等，并在各张采集前后保持不变。High、第一人称、fixed hour16.5/dayCyclefalse、1280×800/deviceScale1；原PNG IHDR和capture originalPixels一致，SHA与metadata逐张一致。实际Chromium151.0.7922.34/SwiftShader；GL checkpoint error0、contextLostfalse、High shadow及AO enabled仅作实际检查点事实，不是硬件FPS或美术PASS。

south-frontage身体(187,.18,224.75940199801698)，眼(187,1.8,224.75940199801698)，yaw−π，pitch.15847467041015625，FOV65，actualEyeDistance2.360084744241203。actual-public-door身体z223.7594019980179，其余x/y同，pitch.2383501739501953，eyeDistance1.3652838532710005。约1m真实前进区分了两张，未把它们伪称一个机位。

baseline模拟时刻为frontage2.75→4.75、door7.25→9.5；authored2.6666667→4.6666667、7.1666667→9.4166667。每对authored约早1/12秒，所以固定太阳时刻相等，不代表模拟时钟逐帧相等。frontage拍前authored streaming.loaded26 vs baseline21，拍后都21，不能拿不同全局draw/memory值作A资产独立性能结论。

## 采集失败与关闭事实

两份metadata.status=failed/artAcceptance=PENDING_HUMAN_NATIVE_REVIEW；primaryError=Owned cleanup failed。context/API browser close返回后，owned-browser-process等待30s超时，再以SIGKILL结束实际owned PID3439/3636。wrapper两份exitCode1、remainingOwnedProcesses=[]、ownedClosureConfirmed=true，port5240拒绝连接。证明收尾归属和最终关闭，不能消掉collector FAIL，不能重标capturePASS。原route完成和原图片依然可作为带失败状态的局部观察证据。

## 街景外观验收需要的最小补拍

当前两图连south-frontage都只距public door约2.36m，16.4m宽整店左右边界、完整檐口/上部轮廓、基座和街道尺度被裁掉。按vertical FOV65/aspect1.6的条件投影，door平面2.36m深只覆盖约4.81m横宽；包含16.4m还需约8.04m平面距离且留边距。这是机位算术，不是新native结果。

建议另一次授权采集时保留原近照，再从相同public站位用有限真实后退键步行，朝原door yaw方向退到约8–10m或更远（以实际可走街道/碰撞安全为限），到位释放键、等当前renderedcamera，记录真实body/eye/yaw/pitch/hour/scene。两模式使用相同输入目标/FOV65/High1280×800/hour16.5，无retry、无position/time/route/storage setter；完整店面左右边缘、檐口、基座和一点铺地应在画框内。如果安全街道宽度不够，应如实标明不能取得全景，不能穿模。原图直接导出并逐张pin SHA，不用宽屏拼接、裁图、增亮或伪造一致机位。补拍尚未执行，外观验收保持pending。

## 四张原PNG SHA256

|模式|图片|SHA256|
|---|---|---|
|baseline|south-frontage|f015e0e6ef1da6b604b15c447d8a3291d616fbaa5081df058f76fe8d61d70e57|
|baseline|actual-public-door|d906653e6bc9028ddd99f1fe973bbfbedbf37ceb112827090f33127b02773930|
|authored|south-frontage|45b6c4d8ce5e4341c1a3597eb048b5879b95fb0b9617ed41db3f5c372d76de52|
|authored|actual-public-door|91c33d544616b899e46dacc9b40bf31c3aece7e4e1086d1aa2b040546eb6ca6f|

全部原PNG/pose/metadata/build-info/wrapper receipt路径、bytes/SHA和逐字段差异见 original-art-review.json。
