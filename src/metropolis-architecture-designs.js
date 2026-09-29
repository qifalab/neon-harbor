/**
 * Address-level architectural briefs. These are explicit art-direction choices,
 * not random seeds: the same named building keeps its street identity on reload.
 * Metropolis-world consumes these only while producing streamed detail chunks.
 */
const designs = [
  ['tide-museum','航海图书与船模入口','铜檐石墙','横向石材分缝','航标灯与桅杆','porthole','anchor',['航海书店','船模工坊','海图展窗','潮汐咖啡']],
  ['harbor-market','清晨鱼市与滨海餐厅','防溅瓷砖基座','金属通风百叶','锯齿采光与排风','louvre','fish-crates',['鲜鱼档','冰鲜配送','贝类档','海鲜小厨']],
  ['ferry-house','轮渡文化会馆','圆柱拱廊','拱窗与石材腰线','钟楼与旗杆','arched','ferry-clock',['航线票务展','港湾茶室','城市礼品','海岸阅览']],
  ['meridian-hotel','酒店礼宾与行李接待','圆角铜边雨棚','错缝竖向窗套','空中花园与设备屏','vertical','hotel-portico',['礼宾接待','花艺店','法式烘焙','子午酒廊']],
  ['pearl-convention','会展登记与滨海门厅','通长玻璃入口','壳体铜肋与格栅','悬吊通风排口','curtain','convention-ribs',['会务服务','设计展窗','咖啡吧','商务印务']],
  ['sail-club','帆船会所与绳索工坊','木制船坞门廊','帆布遮阳与斜杆','桅杆与索具','shutter','sail-rigging',['航海装备','绳结工坊','港湾餐厅','帆船展窗']],
  ['wave-theatre','剧院检票与演出门厅','深蓝剧场檐口','铜框节目灯箱','波形挑檐','vertical','theatre-marquee',['演出票房','海报长廊','幕间咖啡','舞台艺术店']],
  ['east-quay-hotel','东堤旅馆与露台餐饮','石材折板门廊','退台绿植与百叶','木格栅景观亭','shutter','quay-pergola',['海景餐厅','客房礼宾','面包坊','旅行书店']],
  ['jade-bank','银行大厅与金融史陈列','深绿石材柱脚','青铜竖鳍与深窗','双层设备百叶','vertical','jade-screen',['客户服务','金融史展','商务咖啡','城市会客']],
  ['exchange-hall','交易历史与公共展厅','厚石圆柱柱廊','成对高窗与横梁','石雕山花','arched','exchange-pediment',['交易史展','财经书店','公众服务','档案展窗']],
  ['apex-tower','高层观景接待与商务入口','折面金属门廊','收分塔身与纵向窗框','避雷针与检修环','curtain','apex-lantern',['观景售票','城市模型','礼宾服务','天际咖啡']],
  ['twin-pines','双塔内庭与公共会客厅','双翼连廊门廊','双塔分格与玻璃桥','两株标志性松树','curtain','twin-court',['城市花店','商务会客','松庭餐厅','设计展窗']],
  ['crown-plaza','购物廊道与塔楼入口','铜边弧形橱窗','石材窗间墙与竖线','塔冠环与旗帜','vertical','crown-ring',['独立设计','城市珠宝','屋顶餐厅','手作工坊']],
  ['axis-house','结构展厅与商务大厅','外露钢节点基座','菱形结构与水平遮阳','结构节点灯标','curtain','axis-joints',['建筑书店','商务咖啡','联合办公','结构展窗']],
  ['silver-terrace','办公花园与公共步廊','横向叠片雨棚','台地栏杆与露台花箱','带坐凳的景观亭','horizontal','silver-brise',['花园咖啡','共享会议','社区书店','设计工作室']],
  ['lantern-tower','金属工艺展与城市客厅','暖铜灯箱门廊','成组细框与竖向铜片','灯笼塔冠','vertical','lantern-gateway',['金工展窗','手冲咖啡','设计礼品','城市展厅']],
  ['banyan-teahouse','老茶楼与邻里餐桌','深木檐口与手写菜单','木百叶与生活阳台','瓦檐与水箱','shutter','teahouse-lanterns',['榕荫茶档','点心铺','手工茶具','旧书摊']],
  ['red-brick-post','邮政展厅与书信服务','石砌拱门与铜邮筒','砖墙窗拱与石楣','四面钟塔','arched','post-office',['集邮窗口','城市书信','明信片店','邮务展窗']],
  ['kowloon-arcade','骑楼商街与街坊客厅','连续骑楼与卷闸','外挂冷气与晾衣架','女儿墙与分户水箱','shutter','arcade-shops',['钟表修理','老字号药房','裁缝铺','五金小店']],
  ['golden-cinema','电影院票房与海报门厅','流线票房与灯泡雨棚','台阶线脚与海报框','竖向影院灯牌','vertical','cinema-ticket',['金声票房','胶片书店','放映器展','小食铺']],
  ['lotus-market','社区菜场与熟食入口','条纹篷布与瓷砖台','通风窗和百叶','排烟帽与天窗','louvre','lotus-stalls',['时令蔬果','鲜花摊','米粮铺','熟食档']],
  ['blue-house','老屋记忆与社区展厅','木门、蓝墙与招牌','铁艺阳台和木百叶','旧水箱与晒衣绳','shutter','blue-balconies',['社区展窗','旧物修补','蓝屋书架','街坊小厨']],
  ['temple-court','文化院落与香木展厅','红柱石鼓与重檐','格栅窗与脊饰','瓦脊宝珠与翘角','lattice','temple-lions',['香木展窗','民俗书屋','传统工艺','文化接待']],
  ['victoria-library','公共阅览与城市书楼','石柱门廊与木门','双层拱窗与石材书脊','阅览天窗与铜书徽','arched','library-pediment',['新书橱窗','儿童阅读','文具书店','读者服务']],
  ['westbank-gallery','美术馆与雕塑前庭','拉丝金属门框','错动石墙与采光缝','锯齿形采光盒','horizontal','gallery-sculpture',['艺术书店','版画工坊','策展橱窗','庭院咖啡']],
  ['music-conservatory','音乐教学与公开演奏','木声学格栅门廊','音阶节奏竖鳍','小型露天演奏棚','vertical','music-pipes',['乐谱书店','乐器修理','演奏预约','音乐展窗']],
  ['cloud-library','台阶阅览与公共客厅','书架形门廊','水平遮阳和花台','阶梯读书亭','horizontal','cloud-books',['儿童书屋','城市阅读','纸品工坊','阅读咖啡']],
  ['science-forum','科技展厅与天文穹顶','展览环形门廊','圆窗与金属接缝','轨道仪与穹顶','porthole','science-orbit',['科学书店','模型工坊','星图展窗','体验接待']],
  ['design-foundry','旧厂改造与创作工坊','铆接钢雨棚','红砖窗拱与工业窗','烟囱与吊装桁架','industrial','foundry-crane',['陶艺工坊','金工工作室','材料展窗','设计小店']],
  ['jade-opera','戏曲观演与戏服展廊','翠绿叠片门廊','铜框格栅与戏曲纹样','玉色飞檐','lattice','opera-fans',['戏服展窗','戏曲票房','茶点铺','工艺书店']],
  ['city-archive','档案展厅与研究接待','粗面混凝土深门洞','竖向采光缝与模板缝','封闭设备屏','horizontal','archive-stack',['档案展窗','城市地图','研究服务','历史书店']],
  ['observatory-house','观测研究与公众参观','星图铜板门廊','深色窗洞与设备百叶','可见观测缝与天线','porthole','observatory-dial',['天文书店','观测预约','星图工坊','科普展窗']],
  ['camellia-court','社区门厅与住宅会客','花纹瓷砖基座','窗花、冷气与生活阳台','晒衣架与水箱','balcony','camellia-life',['便民洗衣','山茶花店','社区便利','早餐铺']],
  ['pine-residence','住宅门厅与山景步廊','木格栅双层门廊','错层阳台和防晒百叶','公共木制花架','balcony','pine-balconies',['松岭小店','街坊面包','家居修理','小型书屋']],
  ['sky-garden','双塔社区与高空花园','玻璃门廊与树池','双塔阳台与种植槽','高空桥花架','balcony','sky-bridge-garden',['社区超市','花园餐厅','童书小店','生活服务']],
  ['garden-hospital','门诊入口与公共健康厅','清晰深檐与导向十字','水平遮阳与病房窗','疗愈园与设备屏','horizontal','hospital-wayfinding',['健康咨询','便民药房','花园咖啡','公共服务']],
  ['hill-school','书院访客入口与阅览厅','砖柱门廊与校徽','砖石窗套与外廊','钟楼与球场围网','arched','school-bell',['访客接待','课程展窗','学校书屋','作品橱窗']],
  ['cedar-villa','住宅会客与社区阅览','装饰艺术铜门','成组窗套和几何石雕','退台与铜叶饰','vertical','cedar-relief',['社区书房','花艺工作室','邻里餐厅','手作礼品']],
  ['terrace-gardens','花园社区与邻里咖啡','木制深檐入口','多层花槽与退台栏杆','绿化阶梯和木花架','balcony','terrace-planters',['邻里咖啡','园艺小店','共享书屋','社区服务']],
  ['lighthouse-residence','住宅门厅与海景会客','灯室形铜玻璃门廊','暖石墙与成组阳台','灯室检修环','balcony','lighthouse-beacon',['社区便利','海景面包','花艺小店','生活修补']],
  ['gateway-station','旅客服务与商务门厅','站房式宽檐与时钟','竖向石柱和信息橱窗','双时钟与檐上旗杆','horizontal','gateway-clocks',['旅客服务','行李寄存','城市导览','旅行用品']],
  ['innovation-hub','技术展厅与共享办公','金属网格雨棚','斜交框架和遮阳屏','设备测试天线','curtain','innovation-mesh',['技术展窗','创客工坊','共享会议','创业咖啡']],
  ['freight-exchange','港运历史与商务展厅','铆接雨棚与装卸门','仓储砖墙和工业高窗','起重桁架与通风帽','industrial','freight-loading',['航运服务','港史展窗','工装用品','码头咖啡']],
  ['north-star','北部门户与观景接待','折线雨棚与星标','收分窗带和细铜线','星形天线与检修环','vertical','north-star-compass',['观景接待','旅行书店','商务服务','山口咖啡']],
  ['civic-hall','市民大厅与公共办事','高柱廊与导览屏','石材竖向分段与宽檐','旗杆组与铜檐饰','arched','civic-columns',['公众服务','城市展厅','社区公告','便民服务']],
  ['sports-pavilion','运动场馆与会员接待','钢管桁架门廊','通长玻璃和外露肋架','计时钟与通风帽','curtain','sports-truss',['场馆预约','运动小店','健康餐吧','比赛展窗']],
  ['mountain-hotel','山景酒店与旅行接待','木石门廊与行李亭','成对窗套与深挑檐','山景餐厅花架','shutter','mountain-lodge',['旅行接待','山径装备','山景餐厅','面包咖啡']],
  ['harbour-labs','研究访客与科学展示','玻璃屏和金属门廊','遮阳格栅与成组实验窗','排风塔与气象设备','louvre','labs-ventilation',['科学展窗','访客服务','学术书店','研究咖啡']],
];

export const METROPOLIS_ARCHITECTURE = Object.freeze(Object.fromEntries(designs.map(
  ([id, entryUse, podium, facade, roof, fenestration, signature, shopfronts]) => [id, Object.freeze({
    id, entryUse, podium, facade, roof, fenestration, signature,
    shopfronts: Object.freeze(shopfronts),
    // A maintained approach stays wide enough for the existing player/camera.
    clearApproachWidth: 12,
  })],
)));

export function architectureDesignFor(building) {
  const design = METROPOLIS_ARCHITECTURE[typeof building === 'string' ? building : building.id];
  if (!design) throw new Error(`No architecture design for ${typeof building === 'string' ? building : building.id}`);
  return design;
}

/** Match a shop-sign canvas to its metre-based facade rectangle. Fixed 4:1
 * canvases stretch CJK lettering across long retail fascias at close range. */
export function architectureSignLayout(building) {
  const worldWidth=building.width*.145+1,worldHeight=.98,pixelHeight=96;
  return {worldWidth,worldHeight,pixelWidth:Math.round(worldWidth/worldHeight*pixelHeight),pixelHeight};
}

/** One physical source for retail counters, their goods and permanent collision.
 * A 1.05m top is reachable by an adult instead of the former 2.1m toy-scale box. */
export function architectureStalls(building) {
  const front=building.depth/2,stalls=[];
  const add=(dx,dz,width,depth,goods)=>stalls.push({dx,dz,width,depth,height:1.05,goods});
  for(const side of [-1,1]) {
    if(building.id==='harbor-market')for(let n=0;n<4;n++)add(side*building.width*.3-4.5+n*3,front+2.2,2.4,1.5,'fish');
    else if(building.id==='lotus-market')for(let n=0;n<5;n++)add(side*building.width*.3-6+n*3,front+2.5,2.5,1.6,'produce');
    else if(['arcade','shophouse','industrial'].includes(building.style))
      add(side*building.width*.3,front+2.5,7.5,1.5,building.id==='banyan-teahouse'?'tea':building.style==='industrial'?'goods':'produce');
  }
  return stalls;
}
