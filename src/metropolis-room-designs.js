/**
 * Public interiors are authored address by address. Each address names four
 * public floors and their four connected rooms; stable legacy floor IDs keep saves and
 * elevator journeys compatible. Room types select furnishing craft, not names.
 */
const FLOORS = {
  'tide-museum': [
    ['潮间带序厅', 'gallery', 'maritime:木帆船与船锚馆,archive:航道图与灯塔档案,gallery:潮水刻度展廊,lounge:海员口述历史厅'],
    ['远洋与迁徙展', 'gallery', 'maritime:远洋航船剖面馆,workshop:结绳与修船工坊,archive:航海日志阅览室,gallery:移民行李陈列室'],
    ['灯塔守望平台', 'observation', 'lookout:轮渡航线观察点,maritime:旧灯器与航标台,garden:海风耐盐植物园,lounge:守塔人茶歇廊'],
  ],
  'harbor-market': [
    ['清晨鱼市', 'retail', 'fish:冰鲜渔获摊,produce:香草与干货档,kitchen:水产处理间,market:鱼秤与包装铺'],
    ['海鲜大排档', 'restaurant', 'dining:圆桌海鲜厅,booth:临港卡座,kitchen:明火备餐厨房,tea:饭后凉茶档'],
    ['渔港晒场', 'observation', 'garden:香草种植台,lookout:卸鱼码头观察点,dining:露天鱼宴桌,market:渔网修补角'],
  ],
  'ferry-house': [
    ['渡轮会客大厅', 'station', 'ticket:船票与行李服务,waiting:靠海候船厅,archive:渡轮时间收藏室,cafe:旅人咖啡窗'],
    ['船长俱乐部', 'restaurant', 'dining:长航晚餐室,bar:铜木吧台,maritime:船长航海藏品,lounge:报纸壁炉会客厅'],
    ['钟楼海风廊', 'observation', 'lookout:西航道望远镜,lounge:钟楼听风座,tea:海风下午茶,garden:紫藤遮荫廊'],
  ],
  'meridian-hotel': [
    ['子午线迎宾厅', 'hotel', 'reception:石台礼宾处,lounge:棕榈大堂酒廊,luggage:行李与雨具寄存,piano:午后钢琴沙龙'],
    ['子午线海景套房', 'hotel', 'living:套房起居室,bedroom:海景主卧,bath:石材浴室,dining:私宴与茶水间'],
    ['空中泳池会所', 'observation', 'pool:浅水倒影庭,bar:池畔饮品台,garden:棕榈遮荫园,lookout:子午线远眺台'],
  ],
  'pearl-convention': [
    ['明珠展览门厅', 'gallery', 'reception:展会签到岛,gallery:城市产业展,model:湾区规划沙盘,cafe:展商咖啡区'],
    ['国际会议中心', 'office', 'conference:明珠圆桌会议室,lecture:海湾阶梯报告厅,office:同声翻译工作间,lounge:贵宾休息室'],
    ['海风会展花园', 'observation', 'garden:壳顶草木花园,dining:屋顶宴会桌,lookout:海湾活动观礼台,lounge:展后会客廊'],
  ],
  'sail-club': [
    ['帆影水岸餐厅', 'restaurant', 'booth:帆布卡座,bar:船坞吧台,kitchen:水岸开放厨房,maritime:龙骨与帆具陈列'],
    ['帆船训练会所', 'gallery', 'workshop:绳结实训室,maritime:帆船模型室,changing:船员更衣室,conference:航行简报室'],
    ['风向观测甲板', 'observation', 'lookout:风向仪观察台,garden:滨海草本庭,bar:落日饮品台,lounge:帆布躺椅廊'],
  ],
  'wave-theatre': [
    ['浪潮演艺门厅', 'theatre', 'ticket:演出票务处,gallery:舞台摄影展,cafe:幕间咖啡厅,lounge:观众休息廊'],
    ['浪潮黑匣子剧场', 'theatre', 'auditorium:小剧场观众席,stage:木台排演区,changing:演员化妆间,control:灯光音响控制室'],
    ['露天声景花园', 'observation', 'stage:海风露天舞台,garden:声景草木庭,lounge:幕间屋顶座,lookout:港湾夜景平台'],
  ],
  'east-quay-hotel': [
    ['东堤旅居大厅', 'hotel', 'reception:东堤前台,lounge:旅行阅览客厅,luggage:自行车与行李房,cafe:堤岸烘焙角'],
    ['东堤早餐与客房', 'hotel', 'bedroom:晨光客房,bath:客房洗浴间,dining:东堤早餐厅,kitchen:早餐备餐间'],
    ['阶梯日落酒廊', 'observation', 'bar:东堤落日吧,booth:阶梯软座,lookout:堤岸观景台,garden:迷迭香露台'],
  ],
  'jade-bank': [
    ['翡翠金融大厅', 'bank', 'teller:个人业务柜台,waiting:理财等候区,conference:私密咨询室,archive:钱币与账簿展'],
    ['翡翠财富会客层', 'office', 'conference:客户圆桌会谈室,office:投资研究工作室,archive:金融文献室,lounge:茶歇接待室'],
    ['青玉高空花园', 'observation', 'garden:玉兰空中庭,lookout:金融街观景台,tea:青玉茶亭,lounge:竹影静坐区'],
  ],
  'exchange-hall': [
    ['港城交易大厅', 'bank', 'trading:行情交易席,teller:交易服务柜台,archive:交易所历史展,waiting:访客等候廊'],
    ['市场研究与发布层', 'office', 'control:市场数据工作室,lecture:财经发布厅,conference:上市钟声会议室,archive:市场年报阅览室'],
    ['交易钟露台', 'observation', 'gallery:开市钟展示台,lookout:中环轴线眺望点,garden:银杏屋顶庭,cafe:收市咖啡座'],
  ],
  'apex-tower': [
    ['天际金融迎宾厅', 'office', 'reception:天际访客台,model:超高层结构模型,lounge:天际商务客厅,cafe:通勤咖啡岛'],
    ['城市天际线展', 'gallery', 'model:港城垂直剖面,archive:建城工程档案,gallery:高空风与结构展,lecture:城市规划讲堂'],
    ['天际全景观测厅', 'observation', 'lookout:海港全景望远台,model:城市方位沙盘,lounge:云端静观厅,garden:高空耐风庭'],
  ],
  'twin-pines': [
    ['双松共享门厅', 'office', 'reception:双塔服务台,cowork:移动办公廊,cafe:双松咖啡厅,garden:松影内庭'],
    ['双塔协作工作室', 'office', 'cowork:设计协作室,conference:双松董事会议室,workshop:样品评审工坊,library:专业资料室'],
    ['双塔连廊花园', 'observation', 'garden:双松屋顶庭,lookout:连廊城市观景点,lounge:松风阅读角,tea:连廊茶歇室'],
  ],
  'crown-plaza': [
    ['冠环精品商廊', 'retail', 'fashion:独立服饰店,ceramics:手作陶器店,bookshop:城市书店,cafe:街角甜品铺'],
    ['冠环餐饮层', 'restaurant', 'dining:粤味圆桌厅,booth:西式餐吧卡座,kitchen:开放料理台,bar:咖啡烘焙吧'],
    ['环冠高空花园', 'observation', 'garden:环形花境,lookout:冠环城市眺望点,lounge:藤编休憩廊,gallery:屋顶公共雕塑'],
  ],
  'axis-house': [
    ['经纬商务会客厅', 'office', 'reception:经纬访客处,model:斜交结构展,conference:城市会面室,cafe:经纬咖啡座'],
    ['经纬建筑事务所', 'office', 'drafting:建筑制图室,model:模型推敲室,library:材料文献室,conference:方案汇报室'],
    ['结构之上露台', 'observation', 'gallery:钢节点展示台,garden:线性草木庭,lookout:城市道路观察点,lounge:建筑师露台客厅'],
  ],
  'silver-terrace': [
    ['银台总部大厅', 'office', 'reception:银台接待处,gallery:企业工艺展,lounge:访客洽谈区,cowork:开放项目桌'],
    ['台地员工餐厅', 'restaurant', 'dining:共享午餐厅,kitchen:可见备餐厨房,booth:安静就餐卡座,cafe:餐后咖啡角'],
    ['层叠绿洲', 'observation', 'garden:台地植物园,tea:屋顶茶社,lookout:银台城市眺望点,lounge:员工花园休憩区'],
  ],
  'lantern-tower': [
    ['灯笼茶食大厅', 'restaurant', 'tea:手冲茶席,booth:灯下卡座,kitchen:点心备餐间,gallery:灯彩工艺展'],
    ['光影工坊', 'gallery', 'workshop:竹骨灯彩工坊,gallery:纸灯光影展,archive:灯节图谱室,lecture:光影讲习厅'],
    ['万灯夜景平台', 'observation', 'gallery:灯彩观赏廊,bar:夜灯饮品台,lookout:维港夜景台,garden:暖光花境'],
  ],
  'banyan-teahouse': [
    ['榕荫早茶大厅', 'restaurant', 'tea:老茶客茶席,dining:点心圆桌厅,kitchen:蒸笼备餐厨房,booth:街窗茶座'],
    ['功夫茶与棋室', 'restaurant', 'tea:功夫茶雅间,game:象棋会友室,archive:茶叶与茶单收藏,cafe:老城甜品窗'],
    ['榕荫晾茶露台', 'observation', 'garden:茶树与香草园,tea:雨棚茶席,lounge:榕影竹椅廊,lookout:骑楼街景台'],
  ],
  'red-brick-post': [
    ['红砖邮务大厅', 'bank', 'post:寄件与邮票柜台,archive:邮路地图展,waiting:寄信等候区,workshop:明信片书写桌'],
    ['城市书信博物馆', 'gallery', 'archive:市民书信档案,gallery:邮差工具陈列,library:书信阅览室,workshop:铅印邮戳工坊'],
    ['钟楼寄望平台', 'observation', 'lookout:钟楼街区眺望点,post:未来邮局书写台,garden:红砖花园,lounge:老邮差休息廊'],
  ],
  'kowloon-arcade': [
    ['九龙骑楼内街', 'retail', 'tailor:街坊裁缝铺,ceramics:瓷器杂货铺,bookshop:旧书与报刊铺,cafe:骑楼奶茶档'],
    ['骑楼街坊住宅', 'residential', 'living:街坊起居室,bedroom:木窗卧室,kitchen:家常厨房,bath:窄巷洗浴间'],
    ['骑楼公共天台', 'observation', 'laundry:竹竿晾衣场,garden:街坊盆栽园,game:天台棋桌,lounge:晚饭后竹椅区'],
  ],
  'golden-cinema': [
    ['金声电影门厅', 'theatre', 'ticket:金声售票亭,cafe:爆米花与汽水吧,gallery:手绘电影海报展,lounge:首映等候厅'],
    ['金声放映层', 'theatre', 'auditorium:金声银幕观众席,projection:胶片放映室,archive:老电影片盒库,stage:映后谈舞台'],
    ['星空电影院', 'observation', 'cinema:星空放映区,bar:夜场小食吧,lookout:老城霓虹观景点,lounge:散场露台座'],
  ],
  'lotus-market': [
    ['莲花日常街市', 'retail', 'produce:蔬果花卉档,fish:鲜鱼海味档,market:杂货与秤台,tailor:修补裁衣铺'],
    ['莲花街坊饭堂', 'restaurant', 'dining:邻里共享饭桌,kitchen:街市鲜食厨房,tea:凉茶糖水档,booth:家庭聚餐卡座'],
    ['街市可食花园', 'observation', 'garden:社区菜圃,workshop:种子交换台,dining:收获节长桌,lounge:午后乘凉区'],
  ],
  'blue-house': [
    ['蓝屋生活会客厅', 'residential', 'living:蓝屋街坊客厅,kitchen:共享家常厨房,game:街坊棋艺室,archive:旧街坊照片墙'],
    ['蓝屋日常记忆展', 'gallery', 'bedroom:旧式卧房陈列,tailor:旧裁缝工作间,archive:家书与口述档案,gallery:蓝屋日用品展'],
    ['蓝屋生活天台', 'observation', 'laundry:木夹晾衣区,garden:街坊兰花园,tea:搪瓷杯茶桌,lookout:蓝屋邻里眺望点'],
  ],
  'temple-court': [
    ['天后民俗展院', 'gallery', 'maritime:海神与舟船展,gallery:节庆器物展,workshop:木版印花坊,garden:石庭休息区'],
    ['民俗文献学堂', 'library', 'archive:地方志藏书室,library:民俗阅览室,lecture:社区传习堂,workshop:传统装裱室'],
    ['天后宁静庭院', 'observation', 'garden:竹石屋顶庭,tea:清茶休憩亭,lookout:庙街眺望台,gallery:石刻拓片廊'],
  ],
  'victoria-library': [
    ['维多利亚公共书厅', 'library', 'library:报刊阅览大厅,bookshop:新书推荐廊,children:儿童故事室,reception:借阅咨询处'],
    ['城市人文阅览层', 'library', 'archive:地方文献室,library:长窗安静阅览室,study:独立研习室,conference:读书会圆桌室'],
    ['书楼阅读花园', 'observation', 'garden:玉兰阅读庭,library:露台借阅架,lounge:长椅慢读廊,lookout:书楼钟塔眺望点'],
  ],
  'westbank-gallery': [
    ['西岸雕塑门厅', 'gallery', 'gallery:石与金属雕塑厅,reception:展览咨询台,bookshop:艺术出版书店,cafe:美术馆咖啡厅'],
    ['材料与身体展', 'gallery', 'gallery:织物与空间展,ceramics:当代陶器展,workshop:版画公共工作坊,lecture:艺术家对谈厅'],
    ['西岸雕塑花园', 'observation', 'gallery:户外雕塑庭,garden:观赏草花境,lookout:西岸艺廊观景台,lounge:石凳静观区'],
  ],
  'music-conservatory': [
    ['海风音乐门厅', 'theatre', 'piano:开放钢琴沙龙,gallery:乐器历史展,ticket:演出与课程服务,lounge:乐声会客廊'],
    ['海风排练楼层', 'theatre', 'strings:弦乐排练室,piano:双琴教室,drums:打击乐练习室,control:录音监听室'],
    ['海风露天乐园', 'observation', 'stage:小型室外音乐台,garden:静音植物庭,lounge:乐手休息区,lookout:北岸声景观察点'],
  ],
  'cloud-library': [
    ['云阶城市客厅', 'library', 'children:阶梯故事角,library:开放借阅书廊,cafe:书香咖啡座,reception:图书服务岛'],
    ['云阶专题阅览层', 'library', 'library:科学技术书室,archive:地图与图集室,study:安静个人研习区,conference:小组学习室'],
    ['云阶书香露台', 'observation', 'garden:层阶阅读花园,library:遮雨书架廊,lounge:云阶躺椅区,lookout:文化区全景台'],
  ],
  'science-forum': [
    ['未来科学探索厅', 'gallery', 'orrery:行星轨道展,lab:微观实验演示,model:未来城市模型,lecture:科学演示剧场'],
    ['公众实验工坊', 'lab', 'lab:材料分析实验室,robot:机器人装配室,workshop:科学动手工坊,control:数据可视化室'],
    ['穹顶星空平台', 'observation', 'telescope:夜空观测台,orrery:太阳系尺度园,garden:光谱植物庭,lounge:星空讲解席'],
  ],
  'design-foundry': [
    ['铸造厂开放工作厅', 'office', 'drafting:工业设计绘图台,workshop:木作装配工坊,model:产品样机展示,cafe:厂房咖啡角'],
    ['材料与工艺展厅', 'gallery', 'ceramics:陶瓷材料展,tailor:织物设计工作室,workshop:印刷与装订坊,gallery:铸造模具展'],
    ['烟囱下的露台', 'observation', 'garden:工业遗址花园,gallery:金属废料雕塑,lounge:创客休憩长凳,lookout:西岸厂区观景台'],
  ],
  'jade-opera': [
    ['翠玉戏曲门厅', 'theatre', 'ticket:戏曲票务台,gallery:戏服与脸谱展,tea:开锣前茶座,archive:戏班历史陈列'],
    ['翠玉排演层', 'theatre', 'stage:折子戏排演台,auditorium:戏曲观摩席,changing:梳妆与戏服间,strings:文武场乐队室'],
    ['翠檐戏曲露台', 'observation', 'stage:清唱小戏台,tea:戏友茶桌,garden:竹影屋顶庭,lookout:翠檐文化区眺望点'],
  ],
  'city-archive': [
    ['港城记忆门厅', 'gallery', 'archive:城市旧影展,model:百年港城沙盘,reception:档案咨询处,gallery:城市道路变迁展'],
    ['档案阅览与修复层', 'library', 'archive:分类档案库,study:预约阅档室,workshop:纸本文献修复室,control:影像数字化室'],
    ['城市记忆平台', 'observation', 'lookout:新旧城对照观景点,archive:历史天际线图录,garden:银叶档案花园,lounge:阅档人休息区'],
  ],
  'observatory-house': [
    ['星港观测大厅', 'lab', 'telescope:望远镜结构展,orrery:天体运行演示,archive:历年星图室,reception:天文活动服务台'],
    ['星港观测研究层', 'lab', 'control:望远镜控制室,lab:光谱分析实验室,archive:观测底片库,lecture:天文研讨室'],
    ['星港夜空观测场', 'observation', 'telescope:主望远镜观测台,telescope:双筒观星台,orrery:星座方位台,lounge:观测候场区'],
  ],
  'camellia-court': [
    ['山茶邻里客厅', 'residential', 'living:邻里会客室,children:亲子游戏室,mail:住户信报与快递间,game:社区棋艺室'],
    ['山茶生活样板层', 'residential', 'living:暖木家庭起居室,bedroom:山茶主卧室,kitchen:家庭烹饪餐厨,bath:干湿分离浴室'],
    ['山茶共享花园', 'observation', 'garden:山茶花圃,laundry:住户晾晒区,game:屋顶邻里棋桌,lounge:山茶晚风客厅'],
  ],
  'pine-residence': [
    ['松岭邻里门厅', 'residential', 'reception:松岭住户服务,library:社区图书室,lounge:松木等候客厅,mail:信箱与包裹间'],
    ['松岭山景住宅', 'residential', 'bedroom:松影卧室,living:山景家庭客厅,kitchen:松木开放餐厨,bath:无障碍洗浴间'],
    ['松岭静养花园', 'observation', 'garden:松针香草庭,fitness:舒展运动台,tea:山风茶席,lookout:松岭山景平台'],
  ],
  'sky-garden': [
    ['云庭社区商廊', 'retail', 'produce:生鲜与花卉铺,bookshop:云庭小书店,cafe:社区烘焙坊,mail:邻里服务与包裹间'],
    ['云庭连廊之家', 'residential', 'living:云庭会客室,bedroom:亲子卧房,kitchen:家庭餐厨空间,bath:云庭洗浴间'],
    ['双塔空中绿廊', 'observation', 'garden:蝴蝶花园,children:屋顶亲子角,lounge:双塔休憩廊,lookout:花园城市眺望点'],
  ],
  'garden-hospital': [
    ['花园门诊大厅', 'clinic', 'reception:挂号分诊台,waiting:门诊等候厅,pharmacy:门诊药房,consult:全科诊室'],
    ['康复与诊疗层', 'clinic', 'consult:检查诊疗室,ward:日间观察病房,rehab:康复治疗室,office:医护工作站'],
    ['花园疗愈露台', 'observation', 'garden:芳香疗愈园,rehab:户外康复步道,lounge:患者家属休憩区,tea:温水与茶歇台'],
  ],
  'hill-school': [
    ['半山校园公共厅', 'library', 'children:校园故事角,library:开放校史书室,gallery:学生作品廊,reception:校园来访服务'],
    ['半山开放课堂', 'office', 'classroom:阶梯共享教室,lab:自然科学教室,artroom:美术创作教室,piano:校园音乐教室'],
    ['半山自然课堂', 'observation', 'garden:屋顶植物课堂,orrery:日晷与天象角,lecture:户外阶梯课堂,lookout:山海地理观察点'],
  ],
  'cedar-villa': [
    ['杉木会馆门厅', 'residential', 'reception:杉木礼宾台,living:壁炉会客室,piano:杉木音乐沙龙,mail:住户信报间'],
    ['杉木家庭住宅', 'residential', 'living:木饰起居室,bedroom:杉木宁静卧房,kitchen:岛台家庭厨房,bath:石台洗浴间'],
    ['杉木花房露台', 'observation', 'garden:兰花与蕨类花房,tea:杉木下午茶,library:花园阅览角,lookout:半山屋顶眺望点'],
  ],
  'terrace-gardens': [
    ['叠翠社区餐厅', 'restaurant', 'cafe:花园咖啡厅,booth:社区卡座,kitchen:花园备餐厨房,children:家庭亲子角'],
    ['叠翠开放住宅', 'residential', 'living:植物环绕客厅,bedroom:叠翠卧室,kitchen:家庭聚餐厨房,bath:自然采光浴室'],
    ['层叠社区菜园', 'observation', 'garden:认养菜圃,workshop:园艺工具工坊,dining:社区收获餐桌,lounge:绿荫休息廊'],
  ],
  'lighthouse-residence': [
    ['灯塔生活商廊', 'retail', 'cafe:灯塔早餐铺,market:日用杂货店,bookshop:航海主题书店,mail:住户服务间'],
    ['灯塔海景之家', 'residential', 'living:灯塔海景客厅,bedroom:海风卧室,kitchen:家庭明亮餐厨,bath:灯塔洗浴间'],
    ['灯室空中会客厅', 'observation', 'lookout:灯室海湾眺望点,tea:灯下茶席,garden:耐风盆景庭,lounge:居民夜景客厅'],
  ],
  'gateway-station': [
    ['北门旅客服务厅', 'station', 'ticket:联运票务咨询,waiting:铁路候客室,luggage:行李整理与寄存,cafe:北门快餐咖啡'],
    ['北门交通办公层', 'office', 'control:交通协同控制室,conference:运营调度会议室,archive:路网与时刻资料,office:旅客服务工作室'],
    ['北门铁路观察台', 'observation', 'lookout:列车进站眺望点,model:北门联运沙盘,garden:耐风交通花园,lounge:铁道观察休息席'],
  ],
  'innovation-hub': [
    ['启航技术展厅', 'gallery', 'robot:机器人演示区,model:绿色科技样机展,reception:创新中心咨询台,cafe:创客咖啡厅'],
    ['启航共享实验室', 'office', 'cowork:创业团队协作区,robot:样机装配间,conference:项目路演室,lab:电子测量工作室'],
    ['启航屋顶创客场', 'observation', 'garden:智慧灌溉花园,workshop:户外原型讨论台,lounge:创业者交流区,lookout:科技园观景点'],
  ],
  'freight-exchange': [
    ['货运服务门厅', 'station', 'ticket:货运受理柜台,waiting:司机等候厅,model:货港作业沙盘,market:包装与标签服务'],
    ['海港物流记忆馆', 'gallery', 'maritime:港口吊装器具展,archive:提单与货运档案,model:集装箱流转模型,gallery:码头工人生活展'],
    ['港口作业观察台', 'observation', 'lookout:货运门户眺望点,maritime:航标器具平台,garden:工业草木庭,lounge:港工休息廊'],
  ],
  'north-star': [
    ['北辰商务门厅', 'office', 'reception:北辰访客服务,conference:山口会面室,lounge:北辰会客厅,cafe:晨星咖啡座'],
    ['北辰山景餐厅', 'restaurant', 'dining:北辰宴会厅,bar:星光饮品吧,kitchen:山景开放厨房,booth:山口观景卡座'],
    ['北辰星光露台', 'observation', 'telescope:北极星观察台,garden:山风草木园,lounge:星光静坐席,lookout:北部山口眺望点'],
  ],
  'civic-hall': [
    ['港城市民办事厅', 'bank', 'teller:综合办事柜台,waiting:市民等候区,children:亲子等候室,reception:无障碍咨询处'],
    ['港城公共议事层', 'gallery', 'conference:社区议事圆桌厅,model:公共规划展示,archive:城市公报阅览室,lecture:公众听证厅'],
    ['市民共享屋顶', 'observation', 'garden:市民共建花园,game:邻里棋艺区,lounge:全天候休憩廊,lookout:市政广场观景点'],
  ],
  'sports-pavilion': [
    ['跃动公共运动厅', 'station', 'reception:运动场馆服务,fitness:热身与训练区,changing:运动更衣间,cafe:健康饮品站'],
    ['跃动社区健身层', 'gallery', 'fitness:力量与有氧室,tabletennis:社区乒乓球室,rehab:拉伸恢复室,gallery:港城体育记忆展'],
    ['跃动屋顶活动场', 'observation', 'fitness:露天轻运动台,garden:运动恢复花园,lounge:赛后休息席,lookout:北门运动广场眺望点'],
  ],
  'mountain-hotel': [
    ['望山旅行客厅', 'hotel', 'reception:望山前台,lounge:山行会客室,luggage:登山行李与鞋具间,cafe:旅途早餐角'],
    ['望山山景餐厅', 'restaurant', 'dining:山景餐厅,kitchen:季节料理厨房,tea:高山茶室,booth:山窗家庭卡座'],
    ['望山静谧花园', 'observation', 'garden:山地植物庭,telescope:远山观景望远台,tea:云雾茶席,lounge:徒步归来躺椅区'],
  ],
  'harbour-labs': [
    ['海港科学公众大厅', 'lab', 'lab:水质检测演示,maritime:海洋采样器具展,lecture:海洋科普讲堂,reception:研究院公众接待'],
    ['海港研究实验层', 'lab', 'lab:海水化学实验室,aquarium:生态观察实验室,control:海洋传感数据室,archive:标本与样品资料室'],
    ['海港气象观测场', 'observation', 'weather:风雨气象仪台,telescope:海面遥测观景点,garden:耐盐植物实验园,lounge:研究员休憩区'],
  ],
};

// A separate occupied third-floor programme at each address. These are public
// uses, not a claim that every private floor in a 70-storey tower is accessible.
const WORKPLACES = {
  'tide-museum': ['海洋公众研习层', 'library', 'library:海洋科普阅读室,workshop:船模修复工坊,conference:海员故事圆桌室,archive:灯塔摄影资料室'],
  'harbor-market': ['鱼市商户协作层', 'office', 'office:渔商记账室,conference:海产商户议事室,changing:清洁工作服更衣间,lounge:清晨渔工休息室'],
  'ferry-house': ['渡海旅行阅览层', 'library', 'library:岛屿旅行书室,archive:老航线资料室,study:临窗旅记书写室,lounge:候潮慢读客厅'],
  'meridian-hotel': ['子午线旅居公寓层', 'hotel', 'bedroom:长住旅客卧室,living:子午线公寓客厅,kitchen:长住套房餐厨,bath:公寓石材浴室'],
  'pearl-convention': ['明珠展务工作层', 'office', 'office:展览策划办公室,conference:展商协调会议室,workshop:展陈样本工作室,archive:展会图录资料室'],
  'sail-club': ['帆影航海阅览层', 'library', 'archive:风浪与潮汐图室,library:船艺技术书室,study:航线研习间,lounge:船员交流客厅'],
  'wave-theatre': ['浪潮演出工作层', 'theatre', 'changing:巡演戏服化妆间,control:舞台监看工作室,strings:演出配乐排练室,archive:戏剧脚本文库'],
  'east-quay-hotel': ['东堤长住套房层', 'hotel', 'living:临海旅行起居室,bedroom:东堤双人客房,kitchen:旅居小型餐厨,bath:东堤套房浴室'],
  'jade-bank': ['翡翠银行研习层', 'office', 'office:金融分析办公室,conference:研究讨论会议室,library:财务参考书室,study:账务安静研习室'],
  'exchange-hall': ['港城金融史研究层', 'library', 'archive:历史股券档案室,library:财经刊物阅览室,study:市场史研习室,conference:经济史圆桌厅'],
  'apex-tower': ['天际建筑工作层', 'office', 'drafting:结构设计绘图室,model:高层风洞模型室,conference:城市工程会议室,library:建筑技术资料室'],
  'twin-pines': ['双松设计工坊层', 'office', 'drafting:双松图稿工作室,workshop:材料拼样工作间,cowork:协同设计办公室,conference:项目评审圆桌室'],
  'crown-plaza': ['冠环手作工作层', 'retail', 'tailor:服饰定制工作室,ceramics:陶器釉色展示室,bookshop:独立出版选书室,workshop:纸艺装订工坊'],
  'axis-house': ['经纬城市研究层', 'office', 'drafting:街区测绘工作室,model:街道比例模型室,archive:城市图纸档案室,study:建筑研究书桌间'],
  'silver-terrace': ['银台团队工作层', 'office', 'cowork:项目协作工作室,conference:银台团队讨论室,library:企业技术书室,office:安静专注办公室'],
  'lantern-tower': ['灯笼艺术研习层', 'gallery', 'workshop:纸灯装配工坊,tailor:灯罩织物裁制室,archive:传统灯谱资料室,study:灯彩设计研习间'],
  'banyan-teahouse': ['榕荫茶艺学堂层', 'library', 'tea:闻香品茗课堂,library:茶艺文献书室,workshop:茶具修护工坊,conference:茶友小型圆桌室'],
  'red-brick-post': ['红砖邮路研习层', 'library', 'archive:邮路路线档案室,study:书信史研究间,workshop:纸张修补工坊,library:邮政文献阅览室'],
  'kowloon-arcade': ['九龙邻里家庭层', 'residential', 'living:骑楼二代家庭客厅,bedroom:临巷百叶卧室,kitchen:街坊家庭餐厨,bath:骑楼家用浴室'],
  'golden-cinema': ['金声电影工作层', 'theatre', 'projection:放映机维修间,archive:电影剧照资料室,control:影片声音监听室,changing:活动嘉宾化妆间'],
  'lotus-market': ['莲花邻里服务层', 'office', 'office:街市自治办公室,conference:商贩议事圆桌室,changing:街市员工更衣间,library:生活服务小书室'],
  'blue-house': ['蓝屋街坊生活层', 'residential', 'living:蓝屋家常起居室,bedroom:蓝屋百叶卧室,kitchen:蓝屋日常餐厨,bath:旧屋更新浴室'],
  'temple-court': ['天后地方研习层', 'library', 'archive:渔村族谱档案室,library:地方历史阅览室,study:民俗图志研习间,workshop:拓片整理工坊'],
  'victoria-library': ['维多利亚研习书层', 'library', 'study:安静写作研习室,archive:珍本书目档案室,library:文学专题阅览室,conference:读者讨论圆桌室'],
  'westbank-gallery': ['西岸艺术修复层', 'gallery', 'workshop:版画整理工坊,archive:艺术展览图录室,study:艺术史研究室,ceramics:陶器修复展示室'],
  'music-conservatory': ['海风独立练习层', 'theatre', 'piano:海风琴房练习室,strings:弦乐合奏教室,drums:节奏训练教室,archive:演奏乐谱资料室'],
  'cloud-library': ['云阶安静研读层', 'library', 'study:个人安静研读室,library:自然科学阅览室,archive:专题地图收藏室,conference:小组读书讨论室'],
  'science-forum': ['未来科学研习层', 'lab', 'lab:公众化学演示室,robot:开源机器人工作室,control:实验数据整理室,archive:实验记录档案室'],
  'design-foundry': ['铸造厂创作工作层', 'office', 'drafting:工业造型绘图室,tailor:软装面料工作室,workshop:样机装配工坊,conference:设计评审会议室'],
  'jade-opera': ['翠玉戏曲传习层', 'theatre', 'changing:戏服梳妆工作室,strings:文场排练教室,drums:武场打击练习室,archive:戏曲曲谱档案室'],
  'city-archive': ['港城档案研究层', 'library', 'study:城市文献研习室,archive:口述历史资料室,workshop:档案装订工作室,control:录音数字化工作室'],
  'observatory-house': ['星港观测研习层', 'lab', 'lab:光学仪器工作室,control:星图处理工作室,archive:天文观测日志室,study:恒星目录研习间'],
  'camellia-court': ['山茶家庭居住层', 'residential', 'living:山茶小家庭客厅,bedroom:木窗儿童卧室,kitchen:山茶家庭餐厨,bath:山茶家用浴室'],
  'pine-residence': ['松岭家庭居住层', 'residential', 'living:松木家庭会客室,bedroom:山景安静卧室,kitchen:松岭家庭餐厨,bath:松岭家庭浴室'],
  'sky-garden': ['云庭邻里居住层', 'residential', 'living:云庭亲子起居室,bedroom:双窗儿童卧室,kitchen:云庭家常餐厨,bath:云庭家用浴室'],
  'garden-hospital': ['花园医护研习层', 'library', 'library:护理参考书室,study:医护安静研习室,conference:康复病例讨论室,archive:社区健康资料室'],
  'hill-school': ['半山开放学习层', 'library', 'study:课后独立学习室,library:校园科学阅览室,archive:校史照片资料室,conference:教师教研圆桌室'],
  'cedar-villa': ['杉木家庭起居层', 'residential', 'living:杉木亲友起居室,bedroom:杉木客用卧室,kitchen:杉木家庭餐厨,bath:杉木家用浴室'],
  'terrace-gardens': ['叠翠家庭居住层', 'residential', 'living:叠翠亲子客厅,bedroom:花影安静卧室,kitchen:叠翠家庭餐厨,bath:叠翠家用浴室'],
  'lighthouse-residence': ['灯塔家庭起居层', 'residential', 'living:灯塔暖木起居室,bedroom:临海小型卧室,kitchen:灯塔家常餐厨,bath:灯塔家用浴室'],
  'gateway-station': ['北门联运研习层', 'office', 'office:旅运调度办公室,control:铁路客流研究室,archive:交通路线档案室,conference:服务协调会议室'],
  'innovation-hub': ['启航研发工作层', 'lab', 'lab:电子测量实验室,robot:移动机器人工作室,office:研发小队工作室,conference:测试评审会议室'],
  'freight-exchange': ['货运港务工作层', 'office', 'office:港务协调办公室,control:物流信息工作室,archive:海运账册档案室,conference:货代业务会议室'],
  'north-star': ['北辰城市工作层', 'office', 'cowork:北辰共享工作室,conference:北部业务会议室,office:山口项目办公室,library:行业专题资料室'],
  'civic-hall': ['港城市民研习层', 'library', 'library:公共事务阅览室,study:市民自习研读室,conference:居民议事圆桌室,archive:社区行动资料室'],
  'sports-pavilion': ['跃动运动研习层', 'office', 'office:社区教练办公室,conference:训练复盘会议室,library:运动健康书室,changing:教练员更衣室'],
  'mountain-hotel': ['望山长住套房层', 'hotel', 'living:望山旅居起居室,bedroom:山景长住卧室,kitchen:望山套房餐厨,bath:望山套房浴室'],
  'harbour-labs': ['海港科研工作层', 'lab', 'lab:海洋样品处理室,control:潮位数据工作室,archive:海域观测档案室,office:研究小队办公室'],
};

const ACCENTS = ['teal', 'red', 'navy', 'upholstery', 'blue', 'brass'];
export const ROOM_DESIGNS = Object.freeze(Object.fromEntries(Object.entries(FLOORS).map(([id, floors], address) => [id,
  Object.freeze([floors[0], floors[1], WORKPLACES[id], floors[2]].map(([name, category, encoded], index) => Object.freeze({
    id: ['lobby', 'gallery', 'workplace', 'observation'][index], name, category,
    accent: ACCENTS[(address + index) % ACCENTS.length],
    floorFinish: /residential|hotel|library|office/.test(category) ? 'timber' : /observation|gallery|theatre|station|bank/.test(category) ? 'limestone' : 'ceramic',
    rooms: Object.freeze(encoded.split(',').map((entry, roomIndex) => {
      const [type, title] = entry.split(':');
      return Object.freeze({ id: `${id}-${index}-${roomIndex}`, type, name: title,
        furnishingVariant: (address * 3 + index + roomIndex) % 4 });
    })),
  }))),
])));

export function getRoomDesign(buildingId, floorId) {
  const result = ROOM_DESIGNS[buildingId]?.find(floor => floor.id === floorId);
  if (!result) throw new Error(`Missing authored interior: ${buildingId}/${floorId}`);
  return result;
}
