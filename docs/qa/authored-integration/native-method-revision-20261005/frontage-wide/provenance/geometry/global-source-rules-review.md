# 六店宽视图候选：静态碰撞与地面只读审查

范围：ROOT ef92c25980f1da12b508971170b72b9dd6230059；仅源文件、已封存的小 JSON 和独立几何运算。未 import/实例化世界，未运行应用、测试、构建、浏览器、GPU 或网络；只新建本 /tmp 报告。所审 17 个源文件逐个与 ef92 Git blob 比较均同字节。坐标来自 v3 captured-buildings 历史 catalogue，其 origin 冻结 world.js 与 ef92 的 world.js 同 SHA256 `5d4892e1e9d7938d64973f6e028dd5614789ff3225829b0f7db973d7164092a6`。JSON 保留全部 source pins 与推导坐标。

结论：更新后的四条直退、两条经东侧道路的 L 路线，没有发现与普通地面行走相关的静态障碍交叉；按 r=.65 加每轴 .15 容差采用保守半径 .8 米。此结论来自静态生成规则覆盖，未产生完整运行时 collider 数组，也不保证实时车辆清路。south-091 的 x=233 纵段靠近真实 x=232 电车路线，须保留动态阻挡风险。

本次具体路线从实际 entrance（face+3）走到 close（face+2），再沿下表到 wide，按逆序返回 close；public door plane 由 parent 的门面 .64 米位置定义，wide 的垂直门面距离为 9 米。不是门中心欧氏距离 9 米。

| 店 | close X,Z | wide X,Z | 外退段 |
| --- | --- | --- | --- |
| south-090 | 187.000, 145.420079 | 187.000, 153.060079 | +Z 直线 |
| south-091 | 213.000, 117.678396 | 233.000, 125.318396 | X 至 233，后 +Z |
| south-092 | 213.000, 144.119987 | 213.000, 151.759987 | +Z 直线 |
| south-094 | 187.000, 223.759402 | 187.000, 231.399402 | +Z 直线 |
| south-095 | 213.000, 198.955955 | 233.000, 206.595955 | X 至 233，后 +Z |
| south-096 | 213.000, 224.318971 | 213.000, 231.958971 | +Z 直线 |

## 碰撞登记与附近实体覆盖

- `city-exploration.js:23–40` 合并 south、north、原 transit、infrastructure、harbor、sample transit 与 sample district 全部静态 colliders，随后 `createCitizenCrossings` 继续把 signal-post 追加到同一数组。室外实际 Simulation 使用此合并数组（54–68）；不会因美术 chunk 卸载移除障碍。
- 玩家 radius=.65、height=1.8（`world-config.js:13`）；`collision.js:80–103` 按实际支持高度过滤垂直重叠，Circle/OBB 在 gap≥radius−1e−7 时无接触（40–51）；真实 move 还做 swept capsule（229–245、267–335）。.8 是本审查容差缓冲，不是修改游戏半径。
- 南岸 `world.js:149–164` 所有 block/cylinder 向永久 colliders 登记 AABB。八个邻近普通楼壳来自 x=200、z=120/200 两个 block 的 x,z±13 四格；width/depth∈[17,21)，楼壳 hx/hz 再加 .25（326–334、432–440）。已知六楼使用 catalogue 精确尺寸；另外两楼可用 hx/hz≤10.75 的保守界限排除路线。close 距自己南侧壳皮 1.75 米，扣 .8 后仍 .95 米。
- 高檐 collider 为 minY=2.24、maxY=2.52（440）；这几段最大地面 .18 加人物身高1.8=1.98，普通不跳的行走不与高檐垂直重叠。屋顶、女儿墙、屋顶设备、天线同样高于玩家；门框、地面美术细节没有追加 collider（`harbor-frontage-profiles.js:38–40、84–93`）。
- 相关普通街道柱位（`world.js:219–255、443–452`）：棕榈在 (176,143)、(224,97)、(176,223)、(224,177)，树干 hx=hz=.28；灯柱在 (174.5,94.5)、(225.5,145.5)、(174.5,174.5)、(225.5,225.5)，hx=hz=.1。灯臂/灯头高于行走身高。街 bin 在 (224,125/205)，hx=hz 最多 .42；meter 在 (223.5,114/194)，head hx=.19、hz=.125。
- 091 的水平段 z117.678396 到最近 meter 的 AABB 间隙 3.553396 米；095 水平段 z198.955955 到最近 meter 间隙 4.830955 米。x233 两纵段到 bin 的 X 间隙 8.58 米。四直退 X=187/213 均不靠近上述柱/街具到 .8 米以内；其他 block 的街具按 80 米格距排除。
- 原 traffic-post 仅在 |roadcenter|≤160 的交叉口生成（455–464），最近 east 侧 x=175.5，均离路线超过 .8；240 交叉口不生成这批杆。`world.js` 未生成 mailbox/bollard。东西边界、海堤、promenade posts/rails 都在 x≈290，南界 z=290；不在这六条路线范围。
- `harbor-district.js:148–187` 把六店 furniture 独立常驻登记：planter u=±7.55、out=.88、AABB尺寸 .85×.82；南面 090/094 的 table u=±4.5、out=1.10、尺寸1.1×.86，chairs u=±3.8/±5.2、out1.07、尺寸 .44×.49。四条直退保持门中心 X，避开家具侧向界限；091/095 +X 水平段在东面 furniture 南端外，其南端 planter 的 maxZ 分别114.975/194.975，到水平段 Z 的间隙分别2.703396/3.980955 米。其后 x233 再远离家具。
- 原始提议“090/094 在 face+2 直接往 x200 横移”有真实 table 碰撞：table outward max=1.53，间隙只有 .47<r.65；若重用该提议，face+2.18 仅满足 r=.65 的理论接触边界；留 .15 容差需要至少 face+2.33，实践可另留余量。当前采用四直退已绕开此问题。
- 北岸 metropolis shells、infrastructure flyover/port 的所有支持与实物范围均在负 Z 或东湾 x≥约1000，和本路径无交叉。原 transit 平台/高架支墩限 x≈16/−308/−699/667 等线路（`metropolis-transit.js:24–35、97–107、683–716`）；地铁地面 opening 位于 x约16，不在本路径。Citizen signal 的 horizontal road 最南 -420（`metropolis-catalog.js:11–13`），追加的 pole 最大 Z=-397.6（`citizen-navigation.js:57–61`，`citizen-crossings.js:15–22`），可排除。
- Sample transit 的 tram wire poles 位于 x256.4、z=-204/-124/-4/76/136，hx=.065（`harbor-transit-renderer.js:66–71`）；pier rail/support 在 z≤-280、x≈220（73–91）。依据未改的 stop/pole 生成式和已有原始 pose JSON 核对，附近 stop poles 为 courtyard (145.825,123.74)、market (203.74,174.175)、tram lantern (254.05,103.45)，均不与当前候选路线交叉。已有 pose 只作位置佐证，不作当前 native 或完整 collider 证据。

## 地面支持

`city-exploration.js:30–32` 的优先级是 sample pier → infrastructure → harbor terrain → north → south。前四层在本区域返回 null：sample pier 需要 |x−220|≤3.3 且负 Z；flyover/port 是负 Z；harbor shore 约 x≥1000、mountain x≥1670；north 仅 z≤−390 或 bridge z−420..−280。最终进入 `world.js:69–77` 的 south surfaces max 支持函数。

两块人行道 x171.3..228.7，Z=91.3..148.7 /171.3..228.7，最高 .18；边缘坡宽 .75，完全平高区 x172.05..227.95，Z=92.05..147.95 /172.05..227.95。道路 width22、center240 的范围 x229..251；center160/240 横路 Z=149..171 /229..251，地面0（`world.js:188–199、380–384`）。人行道到道路之间有 .3 米无 surface strip（x228.7..229 或 z148.7..149 /228.7..229），fallback ground=-.03；因此路径发生 .18→0→-.03→0 的小幅高度变化，不能称全程 .18 或全程 asphalt。六个 wide 端点全部支持0；反向返回恢复 .18。paint/road markings 只 stamp，无 solid 厚度（200–215）。

## 未覆盖的运行条件

`Simulation._collisionOptions` 包含真实 cars 与 external sample traffic（`simulation.js:153–159`，`city-exploration.js:219`）。tram 源路线沿 x232 到 z144（`harbor-transit.js:42–44`）；其实际 traffic body 半宽1.15+.08=1.23（156–161、`harbor-vehicle-models.js:13–14`）。091 的 x233 纵段距离 tram centerline仅1米，实际 r=.65 的行走就可能碰撞，容差边界需至少2.03米。095 纵段 Z198.956..206.596 在 tram 最北 Z144 之外，但道路 car 仍非静态证明范围。横穿道路的普通车辆相位、实际键盘累计误差、相机遮挡/组成和 native 采集通过，需要实际证据；本报告不作通过结论。没有以静态结果修改任何路线文件或 deadline。
