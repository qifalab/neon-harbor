/** Repeatable furnished programmes for newly opened neighbourhoods. They are
 * deliberately labelled shared programmes; the original 48 bespoke addresses
 * remain separate. IDs encode use and a stable address number, never a city name.
 */
const programmes={
  home: ['街坊生活','residential',['living:街窗起居室','bedroom:安静卧室','kitchen:家庭餐厨','bath:洗浴间']],
  office: ['海港商务','office',['office:项目工作室','conference:圆桌会议室','library:行业书室','lounge:访客会客厅']],
  warehouse: ['港口工坊','gallery',['workshop:修缮工作间','archive:货运档案室','maritime:港务陈列室','lounge:工友休息室']],
};
export function expandedRoomDesign(buildingId,floorId) {
  const match=/^(south|east)-(home|office|warehouse)-(\d+)/.exec(buildingId);
  if(!match)return null;
  const [,shore,use,number]=match, [title,category,encoded]=programmes[use];
  const level=/^level-/.test(floorId)?Number(floorId.slice(6)):['lobby','gallery','workplace','observation'].indexOf(floorId)+1;
  if(level<1)return null;
  const observation=floorId==='observation';
  const entries=observation?['lookout:海港眺望台','garden:屋顶植物庭','lounge:海风会客廊','tea:屋顶茶席']:encoded;
  return {id:floorId,name:observation?'屋顶公共露台':`${title} · ${number}号 ${level}层`,category:observation?'observation':category,
    accent:['teal','navy','upholstery','brass'][(Number(number)+level)%4],floorFinish:observation?'limestone':use==='warehouse'?'ceramic':'timber',
    collection:{subject:shore==='south'?'旧城街巷与日常':'东湾山海与航线',ink:'#4d777d',paper:'#d1b185',edition:level},
    rooms:entries.map((entry,i)=>{const [type,name]=entry.split(':');return {id:`${buildingId}-${floorId}-${i}`,type,name:`${name} ${level}${i+1}`,number:`${level}${i+1}`,furnishingVariant:(Number(number)+level+i)%4};})};
}

/** Floors fit inside the existing shell. Every occupied level has adequate
 * cabin headroom; only three consecutive floor scenes are resident at once. */
export function expandedAddress({id,name,englishName,x,z,width,depth,height,color,index,baseY=0,district,style='residential',compact=false}) {
  const count=Math.max(3,Math.floor((height-1.2)/4.2)+1);
  const floors=Array.from({length:count},(_,i)=>{
    const floorId=i===count-1?'observation':i===0?'lobby':i===1?'gallery':i===2?'workplace':`level-${String(i+1).padStart(2,'0')}`;
    const design=expandedRoomDesign(id,floorId);
    return Object.freeze({id:floorId,y:baseY+i*4.2,level:i+1,label:`${i+1}F · ${design.name}`,type:i===count-1?'observation':design.category,stairs:true});
  });
  return Object.freeze({id,name,englishName,x,z,width,depth,height,color,index,baseY,district,style,compact,
    floors:Object.freeze(floors),entrance:Object.freeze({x,z:z+depth/2+3,y:baseY,yaw:Math.PI}),
    description:`${name}开放${count}层，设连续楼梯、电梯及屋顶露台。${compact?'紧凑旧城户型，采用共享家具布局。':'东湾楼宇采用共享室内用途布局。'}`});
}
