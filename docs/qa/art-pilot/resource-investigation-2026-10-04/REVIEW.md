# 首轮 global geometry 差异只读调查

首轮原断言 FAILED 保持不变：warmed street 580/118 与 cycle1 street 615/118 不等。退出地点相同。缺失 failure PNG 的具体异常没有被旧方法记录，不能补推或补拍。这里调查来源，不追认该测试通过。

原事件将新增 35 geometry 定位在 cycle1 两个室内采样之间：19:19:23.986Z / sim64.4166667 / x181.333,z−117.607 是591/133；19:19:53.691Z / sim67.0833333 / x182.733,z−117.607 已是626/133。随后回门口仍626/133，E退出立即615/118，geometry减少11。新增发生在真正释放之前，不是释放过程本身增加。warm访问回程也出现498→530的+32。初次outside第一个sample519/98→580/118，position与simulationTime43.35均未改变，表明首次真正render/upload的其他世界资源会改变全局注册计数。这个现象本身不能识别后来35项的具体geometry。

两次实际释放事件均为vice4geometry/3PBRtexture/1skeleton、chest7geometry/3texture，各关闭3ImageBitmap；Three r185 Skeleton.dispose明确释放boneTexture。旧事件只记录资源对象销毁分支，不提供每asset的同步renderer计数或global上传UUID，故不等于驱动显存回收证明。

源码排查：south086不在harbor-room-dressing六店scope，函数在创建几何之前直接disabled；该房间shared box/rounded/soft/cylinder/sphere及sign几何在interior manager工厂一次创建，每floor的InstancedMesh使用这些相同引用，释放实例不新建形状。pilot也不生成程序模型几何；近景GLB在floor退出disposed，generation与late-result处理保持独立。其他车辆及人物工厂创建并缓存多级LOD prototype，克隆共享geometry，首次被render时Three才登记geometry计数，instance释放并不销毁这些库的共享几何。它们是必须排查的第三方资源来源。以上源码说明ownership，不能在缺少上传身份记录时完全排除其他未观察到的资源生命周期问题。

ROOT/独立frozen审核的CPU fleet计数提示bus/tram near/mid35、far32，bus2 near transition是该增长区间的数量匹配候选。原full snapshot记录实际serviceTime/delay；公交受让行/信号延迟，不能用simTime+固定fleetoffset作为精确车辆位姿。观察窗口内events没有实际fleet pose或上传UUID，因此在路线重放校准实际delay之前，不能声称已唯一归因。独立phase约束随后使用四份实际near before/after与failure的serviceTime校准advance≤dt，得到中途位姿区间，明确不是固定offset重放；tram2 middle35同样可能，仍未锁定实际中途LOD或唯一资源身份。完整独立报告与CPU原始脚本/输出按原SHA复制到 independent-review/；这是他方只读检验，不写成当前作者重新独立运行。

后续已授权准备的冷同步诊断改变的是验证观测范围：每次asset dispose在无render/update/await的同步区间复制真实renderer.info.memory before/after，normal必须分别实际减4geo/4texture（vice含bone）与7geo/3texture；未曾attach/render的negative保持真实零GPU差值。全局计数仍保存，不能据此宣称城市无泄漏或driver显存达标。修订尚未浏览器执行。

本报告只从封存metadata与原源码读取；未修改ROOT，未启动server/browser/GPU，未修改首轮档案或原8be方法副本。
