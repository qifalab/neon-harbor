/** Accessible atlas uses the same authored records as buildings and entrances. */
import { getRoomDesign } from './metropolis-room-designs.js';
import { architectureDesignFor } from './metropolis-architecture-designs.js';

export function renderCityGuide(container, city, onTravel) {
  container.innerHTML = `<div class="atlas-intro"><div><span class="eyebrow">TWO SHORES · ONE CITY</span><h3>从一间茶楼，到整座海港。</h3><p>48 处可进入建筑，6 个北岸街区。选择一个地址，步行与驾驶探索，或使用快速旅行抵达门口。</p></div><div class="atlas-number">48<small>城市地址</small></div></div><div class="atlas-tools"><label>寻找地点<input id="atlas-search" type="search" placeholder="建筑、街区或英文名称"></label><label>街区<select id="atlas-district"><option value="">全部街区</option>${city.districts.map(d => `<option value="${d.id}">${d.name}</option>`).join('')}</select></label></div><div id="atlas-results" class="atlas-grid"></div><section class="transit-directory"><span class="eyebrow">HARBOUR CONNECTIONS</span><h3>乘一班车，去另一岸。</h3><p class="panel-intro">到站后按 E 进入站厅或码头。列车和渡轮按班次运行，到站停靠时才可上下客。</p><div id="transit-stops" class="stop-grid"></div></section>`;
  const grid = container.querySelector('#atlas-results');
  const search = container.querySelector('#atlas-search'), district = container.querySelector('#atlas-district');
  const paint = () => {
    const query = search.value.trim().toLowerCase();
    const found = city.buildings.filter(b => (!district.value || b.district === district.value) && `${b.name} ${b.englishName} ${b.description} ${city.districts.find(d => d.id === b.district)?.name}`.toLowerCase().includes(query));
    grid.innerHTML = '';
    for (const b of found) {
      const design = architectureDesignFor(b), floors = b.floors.map(f => getRoomDesign(b.id, f.id));
      const card = document.createElement('article'); card.className = 'address-card'; card.dataset.buildingId = b.id;
      card.style.setProperty('--address-color', b.color);
      card.innerHTML = `<div class="address-roof"><span>${String(b.index + 1).padStart(2, '0')}</span><b>${Math.round(b.height)}<small>M</small></b></div><div class="address-body"><small>${city.districts.find(d => d.id === b.district)?.name}</small><h4>${b.name}</h4><span class="address-english">${b.englishName}</span><p>${b.description}</p><p class="address-craft">${design.podium} · ${design.facade}</p><details class="address-rooms"><summary>看看楼里有什么</summary>${floors.map(f => `<div><strong>${f.name}</strong><p>${f.rooms.map(r => r.name).join(' · ')}</p></div>`).join('')}</details><div class="address-footer"><span>${b.floors.length} 个开放楼层</span><button data-visit-building="${b.id}">前往门口 ↗</button></div></div>`;
      card.querySelector('button').addEventListener('click', () => onTravel(b)); grid.append(card);
    }
    if (!found.length) grid.innerHTML = '<p class="panel-intro">没有找到这个地址，换个关键词试试。</p>';
  };
  search.addEventListener('input', paint); district.addEventListener('change', paint); paint();
  const stops = container.querySelector('#transit-stops');
  for (const stop of city.transit.stops) {
    const entry = stop.entry || stop.entrance || stop.surface || stop.surfaceEntry;
    if (!entry) continue;
    const card = document.createElement('article'); card.className = 'stop-card';
    const mode = stop.mode || stop.type || stop.kind || '';
    const labels = { metro: '地铁', tram: '轻轨', lightRail: '轻轨', rail: '高铁', highspeed: '高铁', 'high-speed':'高铁', 'light-rail':'轻轨', ferry: '渡轮' };
    card.innerHTML = `<div><small>${labels[mode] || mode || '公共交通'}</small><h4>${stop.name}</h4></div><button data-visit-stop="${stop.id}">前往 ↗</button>`;
    card.querySelector('button').addEventListener('click', () => onTravel({ ...stop, entrance: entry })); stops.append(card);
  }
  const infrastructure = document.createElement('section'); infrastructure.className = 'transit-directory';
  infrastructure.innerHTML = '<span class="eyebrow">CITY AT DIFFERENT LEVELS</span><h3>沿高架远行，到码头看海。</h3><p class="panel-intro">抵达坡脚后可自由步行或驾驶。高架和桥下道路分别通行，港区有公共观景步道。</p><div class="stop-grid"></div>';
  for (const place of city.infrastructure?.landmarks || []) {
    const card = document.createElement('article'); card.className = 'stop-card infrastructure-card';
    card.innerHTML = `<div><small>道路与港口</small><h4>${place.name}</h4><p>${place.description}</p></div><button data-visit-landmark="${place.id}">前往坡脚 ↗</button>`;
    card.querySelector('button').addEventListener('click', () => onTravel({ ...place, walkable: true })); infrastructure.querySelector('.stop-grid').append(card);
  }
  container.append(infrastructure);
}

export function renderElevatorPanel(container, city, onSelect) {
  const state = city.interiors.state;
  const building = city.buildings.find(b => b.id === state.buildingId);
  container.innerHTML = `<div class="elevator-header"><span class="eyebrow">${building?.englishName || 'ELEVATOR'}</span><h3>${building?.name || '电梯'}</h3><p>选择开放楼层。轿厢会连续升降，到层开门后可步行离开。</p></div><div class="floor-list"></div>`;
  for (const floor of building?.floors || []) {
    const design = getRoomDesign(building.id, floor.id);
    const button = document.createElement('button'); button.className = 'floor-button'; button.dataset.floorId = floor.id;
    const current = state.floor === floor.id || state.floor?.id === floor.id;
    button.innerHTML = `<span><strong>${design.name}</strong><em>${design.rooms.map(r => r.name).join(' · ')}</em></span><small>${Math.round(floor.y)} m${current ? ' · 当前层' : ''}</small><b>↗</b>`;
    button.disabled = current;
    button.addEventListener('click', () => onSelect(floor.id)); container.querySelector('.floor-list').append(button);
  }
}
