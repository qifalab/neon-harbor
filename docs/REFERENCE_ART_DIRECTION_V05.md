# v0.5 参考项目与港湾渲染

2026-09-29 通过 GitHub 插件读取用户指定的 [brunosimon/folio-2025](https://github.com/brunosimon/folio-2025)。本次固定参考提交为 [`41046b57eeed8d156d9c3fd7fa259900baef7816`](https://github.com/brunosimon/folio-2025/tree/41046b57eeed8d156d9c3fd7fa259900baef7816)。只读取相关源文件；没有下载大型资源目录，也没有移植其车辆、建筑、纹理、界面或音乐。

## 源码中实际采用的做法

| 参考源文件 | 已核对内容 | 对霓港的启示 |
| --- | --- | --- |
| [`readme.md`](https://github.com/brunosimon/folio-2025/blob/41046b57eeed8d156d9c3fd7fa259900baef7816/readme.md) | Blender 导出约定、调色板纹理、GLB 与纹理压缩流程 | 精致感首先来自经过造型和配色设计的资产；增加随机物件数量不能替代资产制作。 |
| [`sources/Game/Materials/MeshDefaultMaterial.js`](https://github.com/brunosimon/folio-2025/blob/41046b57eeed8d156d9c3fd7fa259900baef7816/sources/Game/Materials/MeshDefaultMaterial.js) | 定制 Lambert 节点材质，表面方向阴影、投射阴影、近地反弹色和雾的统一合成 | 参考项目有明确的风格化光照，而非所有物体一律提高金属度和光泽。需要协调受光面、背光面、地面和远景。 |
| [`sources/Game/Ligthing.js`](https://github.com/brunosimon/folio-2025/blob/41046b57eeed8d156d9c3fd7fa259900baef7816/sources/Game/Ligthing.js) | 文件名确实为 `Ligthing.js`；方向光和阴影相机随观察区域移动，阴影颜色随日照更新 | 近景阴影要稳定，天空、太阳和阴影不能分别使用冲突的色调。 |
| [`sources/Game/Materials.js`](https://github.com/brunosimon/folio-2025/blob/41046b57eeed8d156d9c3fd7fa259900baef7816/sources/Game/Materials.js) | 调色板、发光渐变、材质集中创建和模型材质替换 | 石材、玻璃、金属、布料应分别建立可复用的响应规则。 |
| [`sources/Game/Fog.js`](https://github.com/brunosimon/folio-2025/blob/41046b57eeed8d156d9c3fd7fa259900baef7816/sources/Game/Fog.js) | 雾距离依据相机观察区域计算，颜色随日照变化 | 雾必须服务构图。海港尺度下，不能沿用只适合街区视距的浓雾。 |
| [`sources/Game/Rendering.js`](https://github.com/brunosimon/folio-2025/blob/41046b57eeed8d156d9c3fd7fa259900baef7816/sources/Game/Rendering.js) | WebGPU/TSL 渲染管线，Bloom 阈值 1、强度 0.25；较高档位另有自定义 DOF | 后处理是受控的补充。海港主视线需要清晰，不能用模糊遮盖几何不足。 |
| [`sources/Game/World/WaterSurface.js`](https://github.com/brunosimon/folio-2025/blob/41046b57eeed8d156d9c3fd7fa259900baef7816/sources/Game/World/WaterSurface.js) | 波纹、岸线和天气细节；高档位使用屏幕纹理模糊合成 | 水面需要独立设计；在霓港保留 WebGL2 时应实现适合自身规模的表面，而不是复制不兼容的 TSL 管线。 |
| [`scripts/compress.js`](https://github.com/brunosimon/folio-2025/blob/41046b57eeed8d156d9c3fd7fa259900baef7816/scripts/compress.js) | GLB 的 ETC1S/Draco 压缩、纹理按用途指定色彩空间、UI 转 WebP | 资产制作与加载预算应一起规划。霓港继续使用现有分区流式加载，不在运行时引入新的 CDN 或编译依赖。 |

以上是源代码分析，不代表对参考站全部功能做过交互验收。`license.md` 写明 MIT License、Copyright (c) 2025 Bruno Simon；同一提交的 `package.json` 仍标为 ISC。本轮没有复制其代码或资产，记录此差异以供以后确实需要复用时核对。[许可证原文](https://github.com/brunosimon/folio-2025/blob/41046b57eeed8d156d9c3fd7fa259900baef7816/license.md)。

## 本轮实际实现

### 能看见海港对岸

`src/atmosphere.js` 把白天指数平方雾密度从 0.00125 改为 0.00048，夜间为 0.00060。距离 1,150 米时，白天约保留 73.7% 的原始轮廓对比度，夜间约保留 62.1%。这让新建对岸高楼保有层次，同时更远的山体仍逐渐融入天际。

天空半径由 940 米扩大到 2,800 米，兼容对岸建筑和山体视距。天空、PMREM 环境光、半球光和主方向光统一为冷灰蓝天空、暖中性阳光和克制的地面反射色。降低原本过强的太阳照度和整体环境光，保留矿物表面的明暗。曝光保持在 1.02–1.12，默认 High 和画质切换规则不变。

### 水面具有自己的尺度和光照

新增原创 `src/harbor-water.js`，基于现有 Three.js `MeshStandardMaterial`，使用三个不同方向、速度和波长的世界坐标波纹扰动法线。像素导数会淡出远处无法分辨的高频波纹，避免地平线闪烁。材质仍使用实际灯光、PMREM 天空反射、菲涅耳响应与雾；不会为海面再渲染一遍整座城市。

接口为 `createHarborWaterMaterial(THREE)` 和 `updateHarborWaterMaterial(material, elapsedSeconds, hour)`。支持大海平面、实例化港池和材质克隆。各材质时钟独立， shader 程序可复用，昼夜底色与天空一致。

这不是建筑平面反射或屏幕空间反射。水面没有伪造逐栋楼的镜像。真正的建筑倒影、船尾波和潮汐仍需后续单独制作和验收。

### 区分建筑材料

`src/metropolis-materials.js` 中幕墙玻璃金属度由 0.42–0.46 降到 0.04–0.06，并采用冷中性灰蓝色、适度粗糙度和天空反射。玻璃与有色金属的高光表现分离；钢材和黄铜继续保持金属响应，墙灰、石材和布料保持粗糙表面。大量外墙玻璃仍为不透明材质，避免成千上万透明窗片的排序问题。真实室内窗保留现有透明克隆。

## 本模块验收

- `node --test tests/harbor-rendering.test.js`：3 项通过，检查 1.15 公里地标可见性约束、昼夜/跨日取样、克隆时钟独立和材质物理类别。
- 独立原生 Chromium / WebGL2 实际编译：320×180 画面，原水材质、实例化克隆水材质和六种城市表面，共 8 个 shader 程序、9 次绘制，零页面/控制台错误，零编译失败。
- 水面时间从 0 秒更新至 13 秒，有 23,642 个像素出现可测变化，平均 RGB 差为 2.312，验证波纹确实参与实际绘制。
- 完整游戏中的滨海构图、夜景、建筑内部和地铁步行体验，由本轮整体验收另行记录。独立 shader 检查不能替代游戏视觉验收，也不证明已经达到商业 3A 的资产或动画水平。

首轮完整游戏 High 滨海截图显示对岸立面过于平整、海天偏灰、近景栏杆占据主要水面。根据实际截图继续修订：立面由建筑模块修复远距离窗格消失问题；天空增加上蓝下浅的色彩区分，水色改为较深的灰蓝，并在三个波段上叠加横向弯曲以打散过长的平行波纹。上述独立 WebGL2 数字来自修订前的初版水 shader；修订后的完整画面以整体验收为准，未把尚未完成的复拍记为通过。

21:00 的 High 实拍还暴露出夜间地面与海面几乎全黑的问题。随后提高夜间蓝色环境光、半球光与冷色方向补光，使路缘、栏杆和楼体可辨认，同时保留昼夜照度差；夜间方向补光为白天的约 8.7%。夜空仍为深蓝，水面仍比白天暗。黄昏环境贴图除按小时更新外，也随日照比例变化更新，避免天光已改变、反射仍停留上一小时。夜间窗灯由建筑模块修复，完整夜景需复拍验收。

## 下一阶段美术门槛

1. 同一观景点按真实玩家视角检查晴日、黄昏、夜间；对岸至少三层高度轮廓，地标顶部和裙房不能变成一条齐平的墙。
2. 每个可进入公共建筑检查入口门洞、首层家具、上层到达点、玻璃外景和返回道路，不能只检查房间数量。
3. 每个地下站按街道、下行楼梯、站厅、闸机、站台、上车顺序连续行走；尺度和照明应逐段过渡。
4. 在固定视角保留近景材料、接触阴影、人物与门窗比例的截图。失败时修正资产或构图，不通过降低画质或扩大模糊来隐藏问题。
