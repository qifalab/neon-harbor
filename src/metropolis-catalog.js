/** Hand-authored north-shore addresses. Stable IDs also identify interior scenes. */
import { getRoomDesign } from './metropolis-room-designs.js';
/** Exact slab footprint shared by interior floors and the exterior paving cut. */
export function publicInteriorFootprint(building) {
  const width = building.width - 0.7, depth = building.depth - 0.7;
  return { width, depth, minX: building.x - width / 2, maxX: building.x + width / 2,
    minZ: building.z - depth / 2, maxZ: building.z + depth / 2 };
}

export const METROPOLIS_BOUNDS = 1450;
export const METROPOLIS_ROADS = Object.freeze({
  vertical: [-640, -480, -320, -160, 0, 160, 320, 480, 640],
  horizontal: [-420, -560, -700, -840, -980, -1120, -1260], width: 26,
});
export const METROPOLIS_DISTRICTS = Object.freeze([
  { id: 'waterfront', name: '潮光海滨', englishName: 'Tideglow Waterfront', z: -490, color: '#d9c7ab' },
  { id: 'central', name: '星汇金融区', englishName: 'Central Exchange', z: -630, color: '#829b9f' },
  { id: 'oldtown', name: '榕树老城', englishName: 'Banyan Old Town', z: -770, color: '#c6ad8b' },
  { id: 'arts', name: '西岸文化区', englishName: 'Westbank Arts', z: -910, color: '#bdb8a9' },
  { id: 'garden', name: '松岭花园', englishName: 'Pine Ridge Gardens', z: -1050, color: '#b8c3ad' },
  { id: 'gateway', name: '榕荫门户', englishName: 'Banyan Gateway', z: -1190, color: '#a7b0aa' },
]);

// Each address has its own dimensions, silhouette and programme. Rows follow
// waterfront → inland; columns are west → east, leaving streets unobstructed.
const addresses = [
  ['tide-museum','潮汐海事博物馆','Tide Maritime Museum',88,64,34,'museum','#c6b79b','双翼石墙围合中庭，铜顶灯塔俯瞰轮渡航道。'],
  ['harbor-market','海湾鱼市场','Harbour Fish Market',100,66,24,'market','#a9b6a0','锯齿采光屋面下是鱼市与海鲜餐厅，外廊保留旧港仓的尺度。'],
  ['ferry-house','渡海会馆','Ferry House',76,60,42,'colonial','#dfd2b6','连续拱廊与钟楼组成海滨会馆，屋顶露台面向老港。'],
  ['meridian-hotel','子午线酒店','Meridian Hotel',66,66,144,'hotel','#bdb29e','层层退台的客房塔楼，入口雨棚与高处空中花园相呼应。'],
  ['pearl-convention','明珠会展中心','Pearl Convention Centre',108,74,48,'convention','#d5d6ca','起伏壳形屋面覆盖展厅，海滨大厅连通会议层。'],
  ['sail-club','帆影游艇会','Sail Yacht Club',78,60,48,'sail','#d6d0b9','斜撑立面与逐级收拢的船帆轮廓，观景台朝向海湾。'],
  ['wave-theatre','浪潮剧院','Wave Theatre',100,68,46,'theatre','#aebbb7','叠合弧拱构成剧院外壳，门厅前设有公共广场。'],
  ['east-quay-hotel','东堤酒店','East Quay Hotel',72,66,118,'terrace','#d1b895','面海阶梯露台与暖色石材基座，顶层设景观酒廊。'],
  ['jade-bank','翡翠银行','Jade Bank',72,70,188,'fins','#759a94','竖向青绿金属鳍片包裹金融塔楼，石材大堂通向屋顶花园。'],
  ['exchange-hall','港城交易所','Harbour Exchange',104,76,74,'exchange','#c9c1ab','宽阔柱廊托起交易大厅，中央高窗呈现旧金融建筑的比例。'],
  ['apex-tower','天际金融中心','Apex Financial Centre',62,62,276,'spire','#8caaae','三段收分的超高层与细长塔冠，城市最高的公共观景层。'],
  ['twin-pines','双松大厦','Twin Pines',98,68,174,'twin','#9ba8a4','双塔通过高空连廊相连，地面内院种植两株标志性松树。'],
  ['crown-plaza','冠环广场','Crown Plaza',78,76,226,'crown','#a4aaa1','环形塔冠悬于逐级退台之上，底层开放购物廊道。'],
  ['axis-house','经纬大厦','Axis House',66,62,166,'diagrid','#91a3a9','对角结构网格贯穿立面，双层挑高门厅连接商务中心。'],
  ['silver-terrace','银台总部','Silver Terrace',94,72,128,'terrace','#b9beb4','错落办公台地提供连续绿化露台，宽檐入口面向城市大道。'],
  ['lantern-tower','灯笼大厦','Lantern Tower',64,64,204,'lantern','#c7b793','暖金竖线包围发光塔冠，裙楼嵌入展览与咖啡空间。'],
  ['banyan-teahouse','榕荫茶楼','Banyan Tea House',72,58,27,'shophouse','#b8bd9b','绿色百叶、木框阳台与深檐茶座，延续老城骑楼的步行尺度。'],
  ['red-brick-post','红砖邮政局','Redbrick Post Office',90,68,42,'clock','#ad7965','砖墙拱窗与方形钟楼，旧邮政大厅改为城市书信展厅。'],
  ['kowloon-arcade','榕荫骑楼','Banyan Arcade',106,66,38,'arcade','#c4b896','首层连续拱券贯穿沿街店面，楼上保留老式外挂空调与阳台。'],
  ['golden-cinema','金声电影院','Golden Sound Cinema',84,70,33,'artdeco','#d5b68f','竖向装饰柱、霓虹招牌与阶梯塔头，还原港城电影文化。'],
  ['lotus-market','莲花街市','Lotus Street Market',108,72,22,'market','#c19f83','多跨采光屋架、摊棚与内街，日常市集连接社区餐厅。'],
  ['blue-house','靛庭公馆','Indigo Court',68,58,32,'shophouse','#73949c','蓝灰抹灰墙面与铁艺阳台，老屋内部是社区生活展览。'],
  ['temple-court','海棠文化馆','Begonia Heritage Court',92,68,28,'temple','#b18368','双重深檐、红柱与低矮院墙围合安静庭院。'],
  ['victoria-library','星澜书楼','Starlane Library',88,66,48,'colonial','#d5c9ae','石砌拱廊与中央山花，阅览室和屋顶花园向市民开放。'],
  ['westbank-gallery','西岸美术馆','Westbank Gallery',102,76,46,'museum','#c4c0b4','相互错动的石材体块间嵌入采光缝，入口处设置雕塑。'],
  ['music-conservatory','海风音乐学院','Sea Breeze Conservatory',86,70,64,'fins','#b8b7a2','节奏化竖向鳍片围合排练室，裙楼内设公开演奏厅。'],
  ['cloud-library','云阶图书馆','Cloudstep Library',106,78,56,'terrace','#d4ccba','五层台阶式书库叠成城市客厅，露台与阅览层相连。'],
  ['science-forum','未来科学馆','Future Science Forum',100,76,60,'dome','#a8bbb7','半球天文穹顶与水平展厅结合，屋顶平台展示城市天际线。'],
  ['design-foundry','设计铸造厂','Design Foundry',96,70,38,'industrial','#a07a68','红砖厂房、锯齿天窗与保留烟囱，内部改为创意工作室。'],
  ['jade-opera','翠玉戏曲中心','Jade Opera Centre',92,74,52,'theatre','#9eb2a8','绿色叠檐与金属肋架包覆剧场，通透门厅延伸至广场。'],
  ['city-archive','城市档案馆','City Archive',84,70,68,'brutalist','#aea998','厚重混凝土悬挑与竖向采光槽，首层开放城市记忆展。'],
  ['observatory-house','星港天文台','Star Harbour Observatory',76,68,84,'observatory','#babeb3','阶梯式研究楼托起观测圆顶，顶层可眺望山海。'],
  ['camellia-court','山茶公寓','Camellia Court',82,70,96,'residential','#c6b69d','连续阳台与种植槽让住宅呈现生活痕迹，入口设置社区会客厅。'],
  ['pine-residence','松岭居','Pine Ridge Residence',72,66,112,'residential','#b5bea9','浅绿墙面和错层阳台，屋顶花园与山景相连。'],
  ['sky-garden','云庭花园','Sky Garden',98,74,134,'twin','#bdc6b5','两座住宅塔楼在高空花园相接，裙楼容纳社区商业。'],
  ['garden-hospital','花园医院','Garden Hospital',106,78,72,'hospital','#d0d0bd','明亮的条形病房与退台疗愈花园，主入口雨棚方便步行抵达。'],
  ['hill-school','松岭书院','Pine Ridge Academy',102,72,38,'campus','#cbb69b','砖石教学楼围绕钟塔展开，宽阔外廊连接公共阅览空间。'],
  ['cedar-villa','杉木公馆','Cedar Mansion',86,70,62,'artdeco','#bdad98','几何装饰与成组窗洞构成宁静住宅，入口两侧设有花坛。'],
  ['terrace-gardens','叠翠花园','Terrace Gardens',104,76,90,'terrace','#b0bda5','每层后退的绿色露台形成山坡般轮廓，公共大厅连接社区咖啡馆。'],
  ['lighthouse-residence','灯塔居','Lighthouse Residence',72,66,124,'lantern','#d0c09d','细长暖色塔楼与灯室般的公共屋顶，沿街设置雨棚与商铺。'],
  ['gateway-station','北门商务楼','North Gate House',92,70,98,'exchange','#b6bcb7','列柱基座与精简塔楼正对交通门户，底层设旅客服务大厅。'],
  ['innovation-hub','启航创新中心','Launch Innovation Hub',98,76,88,'diagrid','#91aba8','斜交框架包裹联合办公空间，首层是开放技术展厅。'],
  ['freight-exchange','货运交易大厦','Freight Exchange',92,74,66,'industrial','#a98970','港口仓库式裙楼与办公塔楼组合，装卸记忆转化为公共展览。'],
  ['north-star','北辰大厦','North Star Tower',66,66,172,'spire','#9aaeb0','逐级收分的塔楼面向山口，顶部星形天线成为北部地标。'],
  ['civic-hall','港城市民中心','Harbour Civic Hall',108,78,52,'civic','#c9c3af','高柱廊与通长屋檐构成市民大厅，前庭留给公共活动。'],
  ['sports-pavilion','跃动体育馆','Motion Sports Pavilion',108,80,38,'stadium','#aebbae','钢肋弧顶覆盖运动大厅，连续玻璃门厅面向街角。'],
  ['mountain-hotel','望山酒店','Mountain View Hotel',82,70,126,'hotel','#c0b29b','沉稳石材基座和修长客房塔楼，顶层餐厅朝向北山。'],
  ['harbour-labs','海港研究院','Harbour Research Labs',96,74,80,'campus','#a8b7b0','分翼研究楼、遮阳格栅与中央玻璃大厅组成科学园入口。'],
];
const xPositions = [-560, -400, -240, -80, 80, 240, 400, 560];
/** Preserve the existing first three levels and roof elevation. The remaining
 * occupied height is divided into ordinary storeys, with no inaccessible gap. */
export function naturalStoreys(buildingId, topY) {
  const tail = Math.max(1, Math.round((topY - 8.4) / 4.2));
  const floors = ['lobby', 'gallery', 'workplace'].map((id, index) => ({ id, y: index * 4.2 }));
  for (let index = 1; index < tail; index++) floors.push({ id: `level-${String(index + 3).padStart(2, '0')}`, y: 8.4 + (topY - 8.4) * index / tail });
  floors.push({ id: 'observation', y: topY });
  return Object.freeze(floors.map((floor, index) => Object.freeze({ ...floor, level: index + 1,
    label: `${index + 1}F · ${getRoomDesign(buildingId, floor.id).name}`, type: floor.id === 'observation' ? 'observation' : getRoomDesign(buildingId, floor.id).category,
    stairs: true })));
}
export const METROPOLIS_BUILDINGS = Object.freeze(addresses.map((row, index) => {
  const [id, name, englishName, width, depth, height, style, color, description] = row;
  const district = METROPOLIS_DISTRICTS[Math.floor(index / 8)];
  const x = xPositions[index % 8], z = district.z;
  // Lotus Market's former 15 m terrace left two 3.3 m storeys, too short for
  // the existing 3.25 m cabin and slabs. Raise that terrace 1.2 m inside its roof.
  const topY = Math.max(16.2, height - (height > 100 ? 16 : 7));
  return Object.freeze({ id, name, englishName, district: district.id, x, z, width, depth, height, style, color,
    entrance: Object.freeze({ x, z: z + depth / 2 + 3, y: 0, yaw: Math.PI }),
    floors: naturalStoreys(id, topY), description, index,
  });
}));
