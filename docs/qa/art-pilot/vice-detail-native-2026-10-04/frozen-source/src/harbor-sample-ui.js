const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Public city services read actual timetables, stock and delivery state. */
export function renderHarborSampleMenu(container, city, onTravel) {
  const { transit, life } = city.sample;
  const daily = life.summary(), travel = transit.snapshot(), home = city.buildings.find(b => b.id === 'south-093');
  container.innerHTML = `<section class="harbor-route"><span class="eyebrow">A DAY BY THE QUAY</span><h3>在港湾过一天。</h3><p>从街坊住宅走到市集，搭双层巴士，沿楼梯到上层看街景。街头电车连接工坊与南堤，小轮跨越海峡。站台停靠时按 E 上下客，车内用 WASD 行走，按住 Z 慢走。</p><div class="route-steps"><button data-sample-home>从街坊住宅开始 ↗</button><button data-sample-supply>去货栈看看 ↗</button></div></section><section class="transit-directory"><h3>下一班，去哪里？</h3><p class="panel-intro">沿道路前往站牌，或从这里定位站点。下车须返回下层车门；行驶中可以走动。步行、驾驶和室内探索期间，班次继续运行。</p><div class="stop-grid" id="sample-stops"></div></section><section class="transit-directory"><h3>街坊小店</h3><p class="panel-intro">居民会工作、买东西和回家。货物由货栈配送，柜台显示当前库存；重新进入街区保留进货与消费记录。</p><div class="stop-grid" id="sample-shops"></div></section><section class="harbor-route"><span class="eyebrow">NEIGHBORHOOD DELIVERY</span><h3>${daily.activeDelivery ? '把手里的货送过去。' : '顺路帮小店补货。'}</h3><p id="sample-delivery"></p><p class="panel-intro">街区里的茶室、面家、印房、果铺、烘焙店与陶作小馆均有对应的楼内空间，可以从城市导览寻找门口。</p></section>`;
  container.querySelector('[data-sample-home]').addEventListener('click', () => onTravel(home));
  container.querySelector('[data-sample-supply]').addEventListener('click', () => onTravel({ ...life.supply, entrance: life.supply.anchor, walkable: true }));
  const grid = container.querySelector('#sample-stops');
  const mode = { bus: '双层巴士', tram: '街头双层电车', ferry: '双层小轮' };
  for (const stop of travel.stops) {
    const card = document.createElement('article'); card.className = 'stop-card';
    card.innerHTML = `<div><small>${escape(mode[stop.kind])} · ${stop.nextArrival === 0 ? '停靠中' : `约 ${Math.ceil(stop.nextArrival)} 秒`}</small><h4>${escape(stop.name)}</h4></div><button data-sample-stop="${escape(stop.id)}">前往 ↗</button>`;
    card.querySelector('button').addEventListener('click', () => onTravel(stop)); grid.append(card);
  }
  for (const shop of daily.shops) {
    const card = document.createElement('article'); card.className = 'stop-card';
    card.innerHTML = `<div><small>${escape(shop.productName)} · $${shop.price} · 库存 ${shop.stock} · ${shop.open ? shop.staff ? '营业中' : '店员在路上' : '已打烊'}</small><h4>${escape(shop.name)}</h4></div><button data-sample-shop="${escape(shop.id)}">去柜台 ↗</button>`;
    card.querySelector('button').addEventListener('click', () => onTravel({ name: shop.name, entrance: shop.anchor, walkable: true })); container.querySelector('#sample-shops').append(card);
  }
  const carried = Object.entries(daily.playerInventory).filter(([, count]) => count > 0).map(([product, count]) => `${({ produce: '果蔬', tea: '茶饮', meal: '热汤面' })[product]} ${count} 份`);
  if (carried.length) { const inventory = document.createElement('p'); inventory.className = 'panel-intro'; inventory.textContent = '随身物品：' + carried.join('、'); container.querySelector('#sample-shops').after(inventory); }
  const delivery = daily.activeDelivery;
  container.querySelector('#sample-delivery').textContent = delivery
    ? `把 ${delivery.quantity} 份${delivery.productName}送到${delivery.recipient}，到柜台按 E 交货。运费来自店铺，交货后实际补入库存。`
    : daily.availableJobs.length ? `芦岸货栈目前有 ${daily.availableJobs.length} 单补货委托。先走到货栈按 E 领取货物，再送到收货柜台。` : '小店的补货单正在处理。可以到货栈与店员聊聊，或者乘车去另一岸。';
}
