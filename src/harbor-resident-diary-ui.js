const time = hour => `${String(Math.floor(hour) % 24).padStart(2, '0')}:${String(Math.floor((hour % 1) * 60)).padStart(2, '0')}`;
const reasons = { 'absent-from-workstation': '尚未在工台到岗', 'employer-unfunded': '等待雇主结清工资',
  'shop-closed': '等待店铺开门', 'shop-unstaffed': '等待店员到柜台', 'out-of-stock': '等待实际补货',
  'insufficient-cash': '当前余额不足', 'to-origin': '等待去车站的通路', 'to-home': '等待返家通路' };
const events = { 'depart-home': '从家中出发', 'tram-boarded': '从车门登上电车', 'tram-alighted': '从车门下车',
  'started-work': '在工台到岗', 'paid-work': '完成一段工作，收到工资', 'finished-work': '完成今天的工件',
  'purchased-food': '在柜台买到果蔬', 'returned-home': '回到自己的卧室' };

/** A read-only public diary. There are no time, pose or resident-state setters. */
export function renderResidentDiary(container, status, { buildings = [], onTravel } = {}) {
  if (!status) return;
  const section = document.createElement('section'); section.className = 'harbor-route';
  const title = document.createElement('h3'); title.textContent = `${status.name}的通勤日记`;
  const description = document.createElement('p');
  description.textContent = `日记时间 ${time(status.scheduleHour)}，计划 ${time(status.plannedDepartureHour)} 出门。` +
    `现在${status.activity}。有效工作 ${status.workSeconds.toFixed(1)} 秒，短工已结算 ${status.paidWorkPeriods}/2 段，累计工资 $${status.earnedWages}，余额 $${status.cash}。`;
  const note = document.createElement('p'); note.className = 'panel-intro';
  note.textContent = '这份日记记录这位街坊的实际行程；电车延误会顺延到岗和返家。店铺仍按当前营业时间、店员和实际库存售货。';
  section.append(title, description, note);
  const home = buildings.find(building => building.id === status.home.buildingId);
  const workplace = buildings.find(building => building.id === status.workplace.buildingId);
  if (home && workplace) {
    const addresses = document.createElement('p'); addresses.className = 'panel-intro';
    addresses.textContent = `住处：${home.name}。工作地点：${workplace.name}。来回搭乘港湾电车，采购后回家。`;
    section.append(addresses);
    if (onTravel) {
      const links = document.createElement('div'); links.className = 'route-steps';
      for (const [building, label, key] of [[home, '到住处门口 ↗', 'home'], [workplace, '到工坊门口 ↗', 'work']]) {
        const button = document.createElement('button'); button.textContent = label;
        button.dataset.residentPlace = key;
        button.addEventListener('click', () => onTravel(building)); links.append(button);
      }
      section.append(links);
    }
  }
  if (status.waitingReason) { const waiting = document.createElement('p');
    waiting.textContent = reasons[status.waitingReason] || '等待安全通路'; section.append(waiting); }
  const list = document.createElement('ol');
  for (const event of status.events.slice(-12)) { const item = document.createElement('li');
    item.textContent = `${time(event.hour)} · ${events[event.type] || event.type}` + (event.amount ? ` $${event.amount}` : '');
    list.append(item); }
  section.append(list); container.append(section);
}
