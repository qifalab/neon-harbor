/**
 * Turns the live harbour simulation into a small, read-only street bulletin.
 * It deliberately derives every value from the existing life and transit
 * snapshots so the HUD never invents pedestrians, stock, or service state.
 */
const phaseForHour = hour => hour < 6 ? '深夜' : hour < 10 ? '早高峰' : hour < 17 ? '白天' : hour < 22 ? '晚市' : '夜间';
const phaseLabel = { '深夜': '灯还亮着，街上很安静', '早高峰': '街坊正在赶去上班', '白天': '街区进入日常节奏', '晚市': '下班后的人流开始回到街边', '夜间': '店铺收档，港湾只剩夜班人声' };
const count = (items, predicate) => (items || []).filter(predicate).length;

/** Return a stable, serialisable bulletin for the current simulation tick. */
export function harborAmbience({ hour = 0, agents = [], shops = [], transit = {} } = {}) {
  const phase = phaseForHour(((hour % 24) + 24) % 24);
  const walking = count(agents, a => !a.insideBuildingId && ['walking', 'leaving-home', 'entering-home'].includes(a.phase));
  const working = count(agents, a => a.phase === 'working');
  const resting = count(agents, a => a.insideBuildingId || ['resting', 'idle'].includes(a.phase));
  const riding = count(agents, a => a.phase === 'riding' || a.transit?.phase === 'riding');
  const openShops = count(shops, s => s.open);
  const staffedShops = count(shops, s => s.open && s.staff);
  const activeStopIds = new Set((transit.vehicles || []).map(v => v.stopId ?? v.pose?.stopId).filter(Boolean));
  const activeStops = count(transit.stops, s => s.nextArrival === 0 || activeStopIds.has(s.id));
  const movingVehicles = count(transit.vehicles, v => v.kind !== 'ferry' && !(v.stopId ?? v.pose?.stopId) && (v.speed ?? v.pose?.speed ?? 0) > .1);
  const crowds = walking + riding + working;
  const headline = crowds >= 10 ? '街角人声正旺' : crowds >= 4 ? '街区有人在走动' : phaseLabel[phase];
  const detail = `${phaseLabel[phase]} · ${walking} 位街坊在路上，${working} 位正在工作；${openShops}/${shops.length || 0} 家店营业，${activeStops} 个站点正在停靠。`;
  return { phase, headline, detail, walking, working, resting, riding, openShops, staffedShops, activeStops, movingVehicles,
    crowdLevel: crowds >= 10 ? 'busy' : crowds >= 4 ? 'steady' : 'quiet' };
}
