/** Address-specific upper storeys. Original room programmes and graphic subjects;
 * no external models, photos or licensed artwork are used. */
export const UPPER_PROGRAMMES = Object.freeze({
  'tide-museum': ['海洋藏品研习', 'gallery', 'maritime:船艺藏品室,archive:航海手稿室,workshop:木船修复室,library:海洋研究书室', '帆船与潮汐', '#477f86', '#caa978'],
  'harbor-market': ['鱼市商户生活', 'residential', 'living:渔商起居室,bedroom:清晨休息卧室,kitchen:海味家常餐厨,bath:渔工洗浴间', '鱼汛与渔网', '#598577', '#c9a27c'],
  'ferry-house': ['渡海旅居', 'hotel', 'living:航线旅客客厅,bedroom:海风旅居卧室,kitchen:旅客共用餐厨,bath:渡海洗浴间', '轮渡与岛屿', '#677e8e', '#cbaa7f'],
  'meridian-hotel': ['子午线客房', 'hotel', 'living:客房会客厅,bedroom:子午线睡眠间,kitchen:套房早餐厨房,bath:子午线石材浴室', '经线与远航', '#547a79', '#b78969'],
  'pearl-convention': ['明珠展览策划', 'office', 'office:展务工作室,conference:策展讨论室,workshop:展陈模型工坊,archive:会展图录书室', '珍珠与展馆', '#617c83', '#c5a378'],
  'sail-club': ['帆影航海学堂', 'library', 'drafting:航海图稿室,maritime:帆具研习室,conference:船员圆桌室,library:海风阅读室', '风向与帆影', '#558591', '#c1a179'],
  'wave-theatre': ['浪潮排演', 'theatre', 'strings:器乐练习室,changing:演出梳妆室,control:声音制作室,archive:舞台脚本室', '海浪与舞台', '#756e88', '#ca997c'],
  'east-quay-hotel': ['东堤海景客房', 'hotel', 'living:东堤会客厅,bedroom:临海客房卧室,kitchen:套房备餐间,bath:东堤洗浴间', '堤岸与日出', '#6d8e85', '#d1a177'],
  'jade-bank': ['翡翠金融团队', 'office', 'office:分析师工作室,conference:投研讨论室,study:专注研习室,archive:金融资料室', '玉石与账册', '#527c6d', '#b9a175'],
  'exchange-hall': ['交易所研究', 'office', 'trading:市场分析工作室,conference:研究圆桌室,archive:历史交易资料室,library:财经阅览室', '行情与城市', '#647a88', '#c49a72'],
  'apex-tower': ['天际工程团队', 'office', 'drafting:工程绘图室,model:结构模型室,cowork:建筑协作室,conference:工程评审室', '结构与天际线', '#587a8e', '#c1aa79'],
  'twin-pines': ['双松设计团队', 'office', 'drafting:创作绘图室,workshop:材料实验室,cowork:协同工作室,conference:设计评审室', '双松与连桥', '#6b877a', '#bda37a'],
  'crown-plaza': ['冠环设计商坊', 'retail', 'tailor:服装裁制室,ceramics:陶艺釉色室,bookshop:独立出版书室,workshop:纸艺装订室', '环冠与织物', '#897e68', '#cc9c77'],
  'axis-house': ['经纬测绘团队', 'office', 'drafting:城市测绘室,model:街区模型室,archive:测绘图档室,conference:更新讨论室', '坐标与街道', '#687f8c', '#c5a17c'],
  'silver-terrace': ['银台协作办公', 'office', 'cowork:项目工作室,conference:团队讨论室,office:专注办公室,library:技术阅读室', '台地与绿叶', '#688a7e', '#baa57d'],
  'lantern-tower': ['灯笼艺作', 'gallery', 'workshop:纸灯装配室,tailor:灯罩织物室,archive:灯彩图谱室,study:灯艺设计室', '纸灯与夜色', '#8c7964', '#c2a172'],
  'banyan-teahouse': ['榕荫街坊之家', 'residential', 'living:茶友起居室,bedroom:榕荫静眠室,kitchen:点心家庭厨房,bath:老城家用浴室', '榕叶与茶盏', '#6e886b', '#c59d70'],
  'red-brick-post': ['红砖文献研习', 'library', 'archive:邮路手稿室,study:书信整理室,workshop:纸本修复室,library:通信史阅览室', '邮戳与书信', '#916e64', '#cba879'],
  'kowloon-arcade': ['榕荫骑楼家庭', 'residential', 'living:骑楼家庭客厅,bedroom:巷窗卧室,kitchen:邻里家庭餐厨,bath:骑楼洗浴间', '骑楼与招牌', '#807b67', '#c5a07b'],
  'golden-cinema': ['金声电影制作', 'theatre', 'projection:放映检修室,control:电影混音室,archive:影片资料室,changing:创作梳妆室', '胶片与银幕', '#8d755b', '#bba279'],
  'lotus-market': ['莲花街坊之家', 'residential', 'living:街市家庭客厅,bedroom:商贩休息卧室,kitchen:家庭备餐间,bath:莲花洗浴间', '莲叶与菜篮', '#788861', '#c29a7b'],
  'blue-house': ['靛庭家庭', 'residential', 'living:靛庭起居室,bedroom:百叶窗卧室,kitchen:街坊家常厨房,bath:靛庭洗浴间', '百叶与靛庭', '#61889a', '#c4a477'],
  'temple-court': ['海棠地方文库', 'library', 'archive:民俗手稿室,library:地方文献室,study:渔村研习室,workshop:拓片整理室', '航标与香炉', '#916f62', '#c9aa77'],
  'victoria-library': ['星澜书藏', 'library', 'library:文学书室,archive:珍本资料室,study:安静研读室,conference:读书讨论室', '书页与拱廊', '#7a836e', '#c7a578'],
  'westbank-gallery': ['西岸艺术工作', 'gallery', 'workshop:版画创作室,ceramics:陶艺修复室,archive:作品图录室,study:艺术研究室', '版画与石墙', '#7b7d86', '#c7a37b'],
  'music-conservatory': ['海风练习教室', 'theatre', 'piano:独立钢琴室,strings:弦乐排练室,drums:节奏练习室,archive:乐谱阅览室', '音阶与海风', '#7b8270', '#c0a87b'],
  'cloud-library': ['云阶专题书库', 'library', 'library:自然科学书室,archive:地图文献室,study:个人研读室,conference:读者讨论室', '云阶与书脊', '#698980', '#c9aa82'],
  'science-forum': ['未来科学研习', 'lab', 'lab:公众实验室,robot:机器人工作室,control:观测数据室,archive:实验记录室', '轨道与光谱', '#648995', '#bdac7d'],
  'design-foundry': ['铸造厂创作', 'office', 'drafting:工业绘图室,tailor:面料拼样室,workshop:原型装配室,conference:创作讨论室', '齿轮与砖墙', '#926e5b', '#c1a581'],
  'jade-opera': ['翠玉传习教室', 'theatre', 'strings:文场练习室,drums:武场排练室,changing:戏服整理室,archive:曲谱研读室', '水袖与锣鼓', '#598477', '#c9a070'],
  'city-archive': ['港城专题档案', 'library', 'archive:城市文献室,study:口述史研习室,workshop:纸本装订室,control:录音整理室', '年代与档案', '#7c8279', '#bda780'],
  'observatory-house': ['星港观测研究', 'lab', 'lab:光学实验室,control:星图分析室,archive:天象日志室,study:恒星研究室', '星图与月相', '#677d94', '#c7ab78'],
  'camellia-court': ['山茶家庭', 'residential', 'living:家庭起居室,bedroom:山茶卧室,kitchen:家庭餐厨,bath:山茶洗浴间', '山茶与木窗', '#8b766d', '#c4ac83'],
  'pine-residence': ['松岭家庭', 'residential', 'living:松木起居室,bedroom:山景卧室,kitchen:松岭餐厨,bath:松岭洗浴间', '松针与远山', '#6c846a', '#bd9e74'],
  'sky-garden': ['云庭家庭', 'residential', 'living:亲子起居室,bedroom:云庭卧室,kitchen:家庭餐厨,bath:云庭洗浴间', '连桥与云庭', '#6b9180', '#c3a77e'],
  'garden-hospital': ['花园诊疗', 'clinic', 'consult:诊疗检查室,ward:日间病房,rehab:康复治疗室,office:医护工作站', '药草与花园', '#689789', '#c4b085'],
  'hill-school': ['松岭学习教室', 'office', 'classroom:共享教室,lab:自然科学室,artroom:美术创作室,piano:音乐练习室', '山线与学堂', '#818971', '#c39b72'],
  'cedar-villa': ['杉木家庭', 'residential', 'living:杉木起居室,bedroom:安静卧室,kitchen:家庭厨房,bath:石材洗浴间', '杉枝与木纹', '#826e5d', '#c5a478'],
  'terrace-gardens': ['叠翠家庭', 'residential', 'living:植物起居室,bedroom:花影卧室,kitchen:社区家庭餐厨,bath:叠翠洗浴间', '梯田与叶脉', '#71916b', '#c7a57b'],
  'lighthouse-residence': ['灯塔家庭', 'residential', 'living:海景家庭客厅,bedroom:海风卧室,kitchen:灯塔家庭餐厨,bath:灯塔洗浴间', '灯室与海鸟', '#7a8978', '#c1a272'],
  'gateway-station': ['北门交通团队', 'office', 'control:联运调度室,office:旅客服务室,archive:时刻资料室,conference:运营讨论室', '轨道与车站', '#758891', '#c3a37b'],
  'innovation-hub': ['启航研发团队', 'lab', 'lab:电子测量室,robot:机器人研制室,cowork:创客协作室,conference:测试评审室', '电路与原型', '#658c8b', '#baa77b'],
  'freight-exchange': ['海港物流团队', 'office', 'office:货运协调室,control:物流数据室,archive:海运提单室,conference:港务讨论室', '吊臂与货箱', '#90735f', '#c0a37a'],
  'north-star': ['北辰业务团队', 'office', 'cowork:协同工作室,conference:山口讨论室,office:项目办公室,library:行业研习室', '北星与山口', '#75889b', '#c5ab7b'],
  'civic-hall': ['港城公共服务', 'office', 'office:公共服务工作室,conference:社区议事室,archive:市民档案室,study:公共事务研习室', '广场与公报', '#7e8b76', '#c2a67c'],
  'sports-pavilion': ['跃动训练', 'gallery', 'fitness:体能训练室,tabletennis:球类练习室,rehab:恢复拉伸室,changing:训练更衣室', '跑道与球场', '#678c87', '#c0a978'],
  'mountain-hotel': ['望山旅行客房', 'hotel', 'living:旅居起居室,bedroom:山景卧室,kitchen:旅行套房餐厨,bath:望山洗浴间', '山径与云雾', '#7b866a', '#bea17c'],
  'harbour-labs': ['海港科研团队', 'lab', 'lab:水质实验室,aquarium:生态观察室,control:潮位数据室,archive:采样资料室', '浮标与海藻', '#638e92', '#c4aa7c'],
});

export function upperRoomDesign(buildingId, level) {
  const entry = UPPER_PROGRAMMES[buildingId];
  if (!entry || !Number.isInteger(level) || level < 4) return null;
  const [name, category, encoded, subject, ink, paper] = entry;
  return Object.freeze({ id: `level-${String(level).padStart(2, '0')}`, name: `${name} · ${level}层`, category,
    accent: ['teal', 'red', 'navy', 'upholstery', 'blue', 'brass'][(level + Object.keys(UPPER_PROGRAMMES).indexOf(buildingId)) % 6],
    floorFinish: /residential|hotel|library|office/.test(category) ? 'timber' : /gallery|theatre/.test(category) ? 'limestone' : 'ceramic',
    collection: { subject, ink, paper, edition: level },
    rooms: Object.freeze(encoded.split(',').map((entry, index) => {
      const [type, title] = entry.split(':');
      return Object.freeze({ id: `${buildingId}-${level}-${index}`, type, name: `${title} ${level}${String(index + 1).padStart(2, '0')}`,
        furnishingVariant: (level + index) % 4, number: `${level}${String(index + 1).padStart(2, '0')}` });
    })),
  });
}

export function roomArtDirection(buildingId, floorId, roomIndex) {
  const [, , , subject, ink, paper] = UPPER_PROGRAMMES[buildingId];
  const address = Object.keys(UPPER_PROGRAMMES).indexOf(buildingId);
  const level = /^level-/.test(floorId) ? Number(floorId.slice(6)) : ['lobby', 'gallery', 'workplace', 'observation'].indexOf(floorId) + 1;
  return { subject, ink, paper, composition: address % 8, edition: level, variant: address * 13 + level * 7 + roomIndex * 3 };
}
