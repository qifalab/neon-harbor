/** Shared programmes for the newly accessible shores. Not hand-authored rooms. */
export const HARBOR_GROUND_PROGRAMMES = Object.freeze({
  'south-090': ['双碗面家', 'restaurant', ['dining', '厨房餐厨:kitchen']],
  'south-091': ['芦岸印房', 'retail', ['bookshop', '印房工坊:workshop']],
  'south-092': ['静潮茶室', 'restaurant', ['cafe', '茶食备餐间:kitchen']],
  'south-094': ['晨罐烘焙', 'retail', ['bakery', '烘焙备餐间:kitchen']],
  'south-095': ['潮叶果铺', 'retail', ['produce', '街坊杂货:market']],
  'south-096': ['铜芦小馆', 'gallery', ['ceramics', '陶作工坊:workshop']],
});

// Address IDs stay stable for guides, homes and saves. Record the existing
// shell's use while addresses are assembled, before floors or room lists load.
const programmeUses = new Map();
const SHARED_ROOMS = {
  home: ['living', 'bedroom', 'kitchen', 'bath'],
  office: ['office', 'conference', 'library', 'lounge'],
  warehouse: ['workshop', 'archive', 'maritime', 'lounge'],
};

export function expansionRoomDesign(buildingId, floorId) {
  if (!/^(south-|east-)/.test(buildingId)) return null;
  const south = buildingId.startsWith('south-');
  const ordinal = Number(buildingId.match(/\d+$/)?.[0] || 0);
  const level = /^level-/.test(floorId) ? Number(floorId.slice(6)) : { lobby: 1, gallery: 2, workplace: 3, observation: 0 }[floorId];
  const groundProgramme = HARBOR_GROUND_PROGRAMMES[buildingId];
  if (groundProgramme && floorId === 'lobby') {
    const [name, category, programmes] = groundProgramme;
    return { id: floorId, name, category, accent: 'teal', floorFinish: 'ceramic',
      rooms: programmes.map((programme, i) => {
        const [title, explicitType] = programme.split(':');
        return { id: `${buildingId}-${floorId}-${i}`, type: explicitType || title,
          name: explicitType ? title : name, furnishingVariant: i };
      }) };
  }
  if (groundProgramme && floorId === 'gallery') return { id: floorId, name: '街坊居住层', category: 'residential', accent: 'upholstery', floorFinish: 'timber',
    rooms: ['living', 'bedroom'].map((type, i) => ({ id: `${buildingId}-${floorId}-${i}`, type, name: i ? '楼上卧室' : '楼上起居室', furnishingVariant: i })) };
  const use = programmeUses.get(buildingId) || (south ? 'home' : 'office');
  const observation = floorId === 'observation', domestic = use === 'home';
  const types = observation ? ['lounge', 'lookout', 'garden', 'tea'] : SHARED_ROOMS[use];
  const titles = { lounge: '休憩客厅', lookout: '海湾眺望室', garden: '窗边花房', tea: '茶座', living: '家庭客厅', bedroom: '安静卧室', kitchen: '家庭餐厨', bath: '洗浴间', office: '项目工作室', conference: '圆桌会议室', study: '专注书室', library: '参考书库', workshop: '港口修缮工坊', archive: '货运档案室', maritime: '港务陈列室' };
  return { id: floorId, name: observation ? '海湾观景层' : domestic ? '街坊生活层' : use === 'warehouse' ? '港口工坊层' : '海湾工作层', category: observation ? 'observation' : domestic ? 'residential' : use === 'warehouse' ? 'gallery' : 'office',
    accent: ['teal', 'navy', 'upholstery', 'blue'][ordinal % 4], floorFinish: use === 'warehouse' && !observation ? 'ceramic' : domestic ? 'timber' : 'limestone',
    rooms: (south ? types.slice(observation ? 0 : ((level - 1) % 2) * 2, observation ? 2 : ((level - 1) % 2) * 2 + 2) : types).map((type, i) => ({ id: `${buildingId}-${floorId}-${i}`, type, name: `${titles[type]} ${level || '顶'}0${i + 1}`, furnishingVariant: (ordinal + (level || 0) + i) % 4 })) };
}

export function expansionBuilding(raw, shore, index) {
  const id = `${shore}-${String(index + 1).padStart(3, '0')}`;
  const programmeUse = shore === 'east' ? (raw.style === 'residential' ? 'home' : 'office')
    : raw.width > 35 ? 'warehouse' : raw.style === 'residential' || !raw.style ? 'home' : 'office';
  programmeUses.set(id, programmeUse);
  const name = HARBOR_GROUND_PROGRAMMES[id]?.[0] || (shore === 'south' ? `${['苔巷', '风铃', '榛木', '晴窗', '白帆', '陶溪'][index % 6]}${Math.floor(index / 6) + 1}号楼` : raw.name);
  return { ...raw, id, name, englishName: `${shore === 'south' ? 'Old Quarter' : 'East Bay'} ${index + 1}`, district: `${shore}-expansion`, index: 48 + (shore === 'east' ? 96 : 0) + index,
    exitOffset: .6, shellId: raw.id, programmeUse, color: raw.color || '#aab6ad', compact: shore === 'south', entrance: { x: raw.x, z: raw.z + raw.depth / 2 + (shore === 'east' ? raw.depth * .17 + 3 : 3), y: raw.baseY || 0, yaw: Math.PI },
    floors: expansionStoreys(id, raw.height, raw.baseY || 0),
    description: shore === 'south' ? '旧城紧凑楼宇，中央通路连接两间按楼宇用途配置的房间、实体楼梯和后部电梯。' : '东湾楼宇开放连续楼层和顶层海景空间，按用途配置共享房间与家具。' };
}

function expansionStoreys(id, height, baseY) {
  const desiredTop = Math.max(4.2, height - (height > 100 ? 16 : 4.2));
  const count = Math.max(2, Math.min(Math.round(desiredTop / 4.2) + 1, Math.floor(desiredTop / 3.8) + 1));
  // A short two-storey house keeps an ordinary-height lobby below its roof.
  const top = Math.min(desiredTop, (count - 1) * 6.2);
  return Array.from({ length: count }, (_, i) => {
    const floorId = i === count - 1 ? 'observation' : ['lobby', 'gallery', 'workplace'][i] || `level-${String(i + 1).padStart(2, '0')}`;
    const design = expansionRoomDesign(id, floorId);
    return { id: floorId, y: baseY + .035 + i * top / (count - 1), level: i + 1, label: `${i + 1}F · ${design.name}`, type: design.category, stairs: true };
  });
}
