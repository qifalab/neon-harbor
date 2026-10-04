# south-086 真实资产：限定资源原生验证通过

这是独立工坊两件真实 PolyHaven CC0 资产的正常加载、GPU对象释放及受控失败检查。单次串行运行19:48:32Z开始，runner20:32:50Z exit0，实际44分18秒。metadata记录20:32:20Z完成场景检查；随后浏览器关闭，20:32:54Z独立进程/socket检查确认Node52763消失、activeChromeProcesses为空、5208 connect_ex=111，服务器/GPU释放，检查没有kill进程。raw stdout/stderr为空且原字节保存。

方法6bb5b9b574e22b2be5ebec977d3b4f1e56faab64e3ed11d5fb9ef47bc426f714；manifest502af982ac2999fb28c395388d7d97acdf6165df803f62b3069f95cafa2dcbb3。全过程156源/served、6项方法依赖、manifest精确不变。原始元数据、实际调用与wrapper/closure工具、全部冻结源及正式资产/loader/许可都在此目录。copy-provenance记录复制来源。cpu311-proof保存此前311/311、build156/53及正式资产一致性的原证明字节；它与本原生运行是两次独立检查。

正常场没有拦截：公开菜单将地点设为南城086，此为独立定位而非连续城市路线；真实E进入、房门、默认WASD/Z接近两个物体，High原生1280×800/静态16.5，默认FOV/灵敏度。预热及三次实际E退出重进共四次；每次两模型都真实解码后被render，冷同步before→dispose→after范围中台钳释放4 geometry/4 texture（3PBR+1bone），工具箱7 geometry/3 texture，两者各关闭3张ImageBitmap。8次asset-released原事件在normalized-resource-evidence，严格诊断available/readErrors检查均通过，期间没有render/update/await混入计数。

正常近景缓存记录实际11mesh、16,224 triangles、2material、6张1024² ImageBitmap解码（base colour为srgb，normal/ARM为线性），台钳4SkinnedMesh共1个实际boneTexture。实际shadow启用且mapResident，2048²；High AO启用/支持、scene1280×800/occlusion640×400。四张正常原图和一张404回退原图的PNG/pose SHA精确，全部原生1280×800且截图时GLerror0/contextLostfalse。整个正常上下文和teardown意外错误0。该GL读取只在显式截图时，snapshot没有getError热路径。

全局街道Three计数原样保留：warm580/118 → cycle1 615/118 → cycle2 650/118 → cycle3 650/118，差值+35/0、+70/0、+70/0。这个变化没有被当成零，也未用模型释放证明全城无泄漏。动态LOD可混入上传；此轮没有中间GPU资源UUID证据，不作唯一归因。这些计数不测driver显存字节。

| 独立context | 实际结果 | 预期/意外错误 | 实际释放范围 |
| --- | --- | --- | --- |
| normal | PASS，预热+3次重进 | 0/0 | 四次vice4/4、chest7/3，各3张图关闭 |
| 404 | PASS，原替代体可见并真实E退出 | HTTP404+对应console404 / 0 | fulfilled vice未attach/未render，CPU4geo/3PBR/3ImageBitmap；GPU真实0/0，bone0 |
| delay-exit | PASS，工具箱响应挂起后真实E退出 | chest net::ERR_ABORTED / 0 | 已完成vice在disposed后释放，未attach，GPU真实0/0；CPU4geo/3PBR/3ImageBitmap，bone0 |

延迟工具箱实际没有退出后解码；尽管拦截器fulfill尝试可被接受，不能写成late chest parse通过。abortVsLateParse保留actualfalse和abort证据。楼层未回填。三场均独立上下文顺序执行，normal40min、负场各10min、总60min预算；无重试、无源变更。

作者和原URL/SHA/MD5/BIN/纹理处理在frozen-source/assets/harbor/workshop/asset-manifest.json与LICENSE-CC0.txt；两GLB合计4,788,776 bytes，原mesh/skin/PBR保留，没有将程序盒体导出成GLB。此前严格全场景稳定计数首轮仍为FAIL，native-validation-2026-10-04的183-file ledger fb60ba35e31ca0b392aaa465823565ecab962c93173850dbf32f48144f160be1精确复核不变，原缺失failure PNG仍是证据缺口，绝未追记通过。

Owner及ROOT亲看原生图：工具箱开盖、抽屉、金属把手和红漆磨损可读；台钳在当前约2.4m机位偏小偏暗，不能据此签收细部美术。工作台、箱体、挂工具、窗墙与室外楼宇/树/路面仍明显程序化，房间仍稀疏。两件资产和资源检查不代表完整高品质港湾、整间或AAA美术完成，也非旧机位pixelmatched比较。ROOT两份实际原图观察原件精确保存在independent-review。更近合法约1.28m的独立取景工具仅静态准备，未在本run执行；见../vice-detail-preparation-2026-10-04，需ROOT集成/build审定及单独GPU GO。
