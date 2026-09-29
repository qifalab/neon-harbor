/** Authored daily life for six neighbourhoods. All destinations are expressed
 * as distances on an address's legal pavement loop, never as a teleport. */
export const DISTRICT_LIFE = Object.freeze({
  waterfront: { name: '维澜海滨', roles: ['海事讲解员', '鱼市场采购员', '轮渡通勤客', '船舶修复师', '海滨摄影师'],
    styles: [1, 7, 2, 0, 5], props: ['book', 'parcel', 'phone', 'toolbag', 'camera'],
    events: ['鱼市开档，海滨开始有人晨跑', '午间轮渡通勤与海事展厅参观', '码头交班，摄影师等着海面侧光', '剧院散场，街坊沿着海滨慢走'],
    places: ['看船经过', '整理海事笔记', '查看轮渡班次', '与修船同伴碰面'] },
  central: { name: '中环金融区', roles: ['建筑测绘师', '银行职员', '证券研究员', '咖啡师', '楼宇工程师'],
    styles: [1, 2, 2, 7, 0], props: ['book', 'phone', 'book', 'cup', 'toolbag'],
    events: ['上班人流经过银行与交易所', '职员出来买咖啡、吃午饭', '办公楼陆续下班，访客寻找观景入口', '夜班工程师巡查楼宇，街道逐渐安静'],
    places: ['核对建筑测绘笔记', '等同事一起去吃饭', '阅读公司简报', '休息喝杯咖啡'] },
  oldtown: { name: '榕树老城', roles: ['茶楼点心师', '书信展志愿者', '街市采购员', '老街坊', '骑楼修缮师'],
    styles: [7, 3, 5, 6, 1], props: ['cup', 'book', 'parcel', 'book', 'toolbag'],
    events: ['茶楼开早市，街坊提着菜回来', '邮政展厅迎来访客，街市最热闹', '放学后在骑楼下碰面，茶楼添下午茶', '电影院门口谈论电影，老街慢慢收档'],
    places: ['等一份刚蒸好的点心', '读老港城的家书', '清点买回来的食材', '聊一聊街区修缮'] },
  arts: { name: '西岸文化区', roles: ['美术馆策展人', '音乐学院学生', '图书管理员', '工业设计师', '天文摄影爱好者'],
    styles: [4, 3, 1, 4, 5], props: ['book', 'toolbag', 'book', 'book', 'camera'],
    events: ['学生去排练，策展人准备开馆', '读者和观展的人在广场短暂停留', '设计师讨论手稿，学生结束排练', '天文爱好者查看星图，剧院门厅亮起灯'],
    places: ['在街边画建筑速写', '看下一次排练的谱子', '翻阅刚借到的书', '讨论展览布置'] },
  garden: { name: '半山花园', roles: ['社区园艺师', '书院教师', '医院职员', '晨练街坊', '社区志愿者'],
    styles: [0, 1, 2, 6, 3], props: ['toolbag', 'book', 'phone', 'cup', 'book'],
    events: ['街坊晨练，园艺师检查沿街绿植', '医院职员换班，居民在社区散步', '放学的人流和买菜的居民相遇', '住户饭后散步，社区逐渐进入夜间节奏'],
    places: ['观察树木的新叶', '准备明天的课堂笔记', '查看换班消息', '做一组舒展动作'] },
  gateway: { name: '九龙门户', roles: ['旅客服务员', '软件工程师', '货运调度员', '体育馆教练', '城市研究员'],
    styles: [5, 2, 0, 3, 1], props: ['phone', 'book', 'phone', 'cup', 'camera'],
    events: ['通勤旅客进入门户区，货运人员开始交班', '旅客查看换乘路线，办公人群出来休息', '体育馆迎来锻炼者，列车旅客开始返程', '调度员值夜班，晚归的人查看路线'],
    places: ['查看高铁与地铁换乘路线', '整理今天的工作记录', '查看交班信息', '做运动前的热身'] },
});

export const CITIZEN_ACTIVITY_LABELS = Object.freeze({
  walking: '步行', talking: '邻里聊天', reading: '翻阅手册', refreshments: '喝茶休息',
  photographing: '观察与摄影', 'waiting-transit': '查看交通时刻', stretching: '舒展身体',
  shopping: '检查采购物品', working: '整理工作记录', resting: '稍作休息', greeting: '与访客交谈', waiting: '让行',
});
const familyNames = ['陈', '林', '梁', '黄', '何', '周', '苏', '杨', '徐', '郑', '吴', '许', '叶', '罗', '沈', '顾'];
const givenNames = ['知行', '映川', '嘉宁', '文澜', '安禾', '远舟', '晴岚', '子墨', '慕青', '书言', '景和', '沐辰', '晓棠', '亦庭', '星野'];
const wrap = (value, length) => ((value % length) + length) % length;

export function citizenDayPeriod(hour = 12) {
  hour = wrap(Number.isFinite(hour) ? hour : 12, 24);
  return hour >= 6 && hour < 11 ? 0 : hour >= 11 && hour < 15 ? 1 : hour >= 15 && hour < 20 ? 2 : 3;
}

export function createCitizenIdentity(building, block, person) {
  const local = DISTRICT_LIFE[building.district] || DISTRICT_LIFE.waterfront;
  const number = block * 5 + person, seed = block * 13 + person * 7;
  return Object.freeze({ name: familyNames[number % familyNames.length] + givenNames[Math.floor(number / familyNames.length) % givenNames.length],
    role: local.roles[person], district: building.district, districtName: local.name, style: local.styles[person],
    prop: local.props[person], build: .89 + seed % 7 * .043, height: .90 + seed % 11 * .014,
    stride: .87 + seed % 5 * .055, age: person === 3 && ['oldtown', 'garden'].includes(building.district) ? 'elder' : 'adult',
    glasses: (seed % 4) === 0, hat: ['waterfront', 'garden', 'gateway'].includes(building.district) && person === 0,
    local, seed,
  });
}

/** A four-period schedule changes purpose and stopping activity; the resident
 * must still physically walk to the new destination when the clock changes. */
export function citizenRoutine(identity, hour, cycle = 0) {
  const period = citizenDayPeriod(hour), seed = identity.seed;
  const common = period === 0 ? ['working', 'stretching', 'waiting-transit', 'shopping', 'reading']
    : period === 1 ? ['refreshments', 'reading', 'shopping', 'talking', 'photographing']
      : period === 2 ? ['working', 'waiting-transit', 'reading', 'talking', 'stretching']
        : ['resting', 'reading', 'waiting-transit', 'talking', 'photographing'];
  let activity = common[(seed + cycle) % common.length];
  if (identity.district === 'arts' && activity === 'shopping') activity = 'reading';
  if (identity.district === 'garden' && activity === 'photographing') activity = 'stretching';
  if (identity.prop === 'camera' && cycle % 2 === 0) activity = 'photographing';
  if (identity.prop === 'cup' && period === 1 && cycle % 2 === 0) activity = 'refreshments';
  const place = identity.local.places[(seed + period + cycle) % identity.local.places.length];
  return { period, activity, purpose: place, event: identity.local.events[period],
    dwell: 9 + (seed + cycle * 7) % 19, pace: period === 0 ? 1.1 : period === 3 ? .83 : 1,
    // Fraction selects one of the eight pavement segments. Offset prevents a
    // whole block arriving at one shared mathematical point.
    waypoint: ((seed * 3 + period * 2 + cycle * 3) % 8 + .24 + (seed % 3) * .15) / 8 };
}

export function citizenDialogue(resident, hour, sequence = 0) {
  const { building, identity } = resident, routine = resident.routine || citizenRoutine(identity, hour);
  const publicFloor = building.floors?.find(floor => floor.id === 'gallery')?.label || '公共会客层';
  const observation = building.floors?.find(floor => floor.id === 'observation')?.label || '观景露台';
  const lines = [
    `我叫${identity.name}，在${identity.districtName}做${identity.role}。我正准备${routine.purpose}。${building.name}的正门就在这条街内侧。`,
    `${routine.event}。${building.name}是我常来的地方。${building.description || '大厅向市民和访客开放。'}`,
    `${building.name}可以进去看看，搭大厅的电梯能到${publicFloor}，上面还有${observation}。别只在街上看外墙，楼里也有公共空间。`,
    `${identity.districtName}每天这个时候都不太一样。今天我来${building.name}附近${routine.purpose}，晚些再沿着人行道慢慢走回去。`,
  ];
  return lines[wrap(sequence, lines.length)];
}
