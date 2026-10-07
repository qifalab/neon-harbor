import { HARBOR_SHOP_DEFS } from './harbor-shop-defs.js';
import { SpatialIndex, circleOBB, VEHICLE_SHAPE, moveVehicle, moveCircle } from './collision.js';
import { createInteriorLayout } from './metropolis-interiors.js';
import { intersectionSignal } from './traffic.js';
import { harborRoutePose } from './harbor-transit.js';
import { HarborResidentLoop, RESIDENT_LOOP } from './harbor-resident-loop.js';
import { HARBOR_SECONDS_PER_HOUR, calendarHour, validCalendar } from './harbor-world-clock.js';
import { HarborRoleRoutines } from './harbor-role-routines.js';

export const HARBOR_LIFE_SCHEMA = 'neon-harbor/daily-life';
export const HARBOR_LIFE_VERSION = 3;
export const HARBOR_LIFE_STEP = .1;
export { HARBOR_SHOP_DEFS } from './harbor-shop-defs.js';
const HOME_IDS = ['south-077', 'south-078', 'south-079', 'south-080', 'south-081', 'south-082', 'south-083', 'south-084', 'south-093', 'south-083', 'south-084', 'south-080'];
const NAMES = ['陈映川', '林安禾', '梁嘉宁', '周晴岚', '何书言', '苏晓棠', '杨远舟', '徐景和', '郑沐辰', '吴文澜', '许亦庭', '叶星野', '罗慕青', '沈知行', '顾子墨', '黄云舒', '陈秋实', '林听潮', '梁小满', '周予宁'];
const PRODUCTS = ['produce', 'tea', 'meal'];
const wrap = (v, n) => ((v % n) + n) % n;
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const point = (p, y = p.y ?? .18) => ({ x: p.x, z: p.z, y });
const copy = v => JSON.parse(JSON.stringify(v));
const integer = (v, max = 1e8) => Number.isSafeInteger(v) && v >= 0 && v <= max;
const near = (a, b, radius = 3.6) => a && Number.isFinite(a.x) && Number.isFinite(a.z) && distance(a, b) <= radius && Math.abs((a.groundY ?? a.y ?? .18) - b.y) < 1.3;

/** A small, persistent population. Rendering and observer position never own
 * schedules, stock, wages or cargo. All money transfers debit an actual account;
 * initial food is finite and every consumed portion remains in the audit. */
export class HarborLife {
  constructor({ buildings = [], colliders = [], transport = null, seed = 749213, hour = 18, secondsPerHour = HARBOR_SECONDS_PER_HOUR, save = null,
    residentLoop = !!transport, roleRoutines = residentLoop } = {}) {
    this.buildings = buildings; this.transport = transport;
    this.seed = (Number.isSafeInteger(seed) ? seed : 749213) >>> 0;
    this.secondsPerHour = Number.isFinite(secondsPerHour) && secondsPerHour > 0 ? secondsPerHour : HARBOR_SECONDS_PER_HOUR;
    this.startHour = Number.isFinite(hour) ? wrap(hour, 24) : 18;
    this.clock = { version: 1, epochTick: 0, absoluteHour: this.startHour };
    this.ticks = 0; this.accumulator = 0; this.revision = 0; this.serial = 0; this.orderSerial = 0;
    this.transactions = []; this.jobs = []; this.player = { earnedCash: 0, spentCash: 0, inventory: Object.fromEntries(PRODUCTS.map(p => [p, 0])), purchaseRequests: [], activeJobId: null, completed: 0 };
    this.externalHour = null; this.roomAuthority = false; this._roomLocalSnapshot = null; this.consumedByProduct = Object.fromEntries(PRODUCTS.map(p => [p, 0]));
    this.statistics = { purchases: 0, playerPurchases: 0, missedPurchases: 0, wages: 0, deliveries: 0, consumed: 0, boarded: 0, alighted: 0 };
    const building = id => {
      const found = buildings.find(b => b.id === id);
      if (!found) throw new Error(`Harbor life requires the actual address ${id}`);
      return found;
    };
    const anchor = (b, frontage) => frontage === 'east'
      ? { x: b.x + b.width / 2 + 2.5, z: b.z, y: b.entrance.y ?? b.baseY ?? .18 }
      : point(b.entrance);
    this.shops = HARBOR_SHOP_DEFS.map(def => {
      const displayAnchor = anchor(building(def.buildingId), def.frontage);
      return { ...def, displayAnchor, anchor: def.frontage === 'south' ? { ...displayAnchor, x: displayAnchor.x + 6 } : displayAnchor, money: 260, stock: 4, sold: 0, received: 0, paidWages: 0 };
    });
    const supplyBuilding = building('south-089'), warehouse = building('south-086');
    this.supply = { id: 'harbor-supply', name: '芦岸货栈', buildingId: supplyBuilding.id, anchor: point(supplyBuilding.entrance),
      warehouseId: warehouse.id, workplace: point(warehouse.entrance), money: 900, stock: Object.fromEntries(PRODUCTS.map(p => [p, 96])) };
    this.navigation = createHarborLifeNavigation(colliders);
    // Loading is a separate frontage contact. At the actual doorway E must
    // still enter this resident address, including during an available order.
    const supplyDoor = this.supply.anchor;
    const counter = [6.5, -6.5, 7.5, -7.5, 8.5, -8.5].map(offset => ({ ...supplyDoor, x: supplyDoor.x + offset }))
      .find(candidate => this.navigation.clearSegment(supplyDoor, candidate) && buildings.every(b => distance(candidate, b.entrance) > 5.4));
    if (!counter) throw new Error('Harbor supply requires a clear loading contact separate from building entrances');
    this.supply.anchor = counter;
    this.homePaths = new Map();
    this.agents = NAMES.map((name, index) => {
      const closeHomes = ['south-093', 'south-093', 'south-089', 'south-089', 'south-089', 'south-089'];
      const home = building(index < 6 ? closeHomes[index] : HOME_IDS[index % HOME_IDS.length]);
      const shop = index < 6 ? this.shops[Math.floor(index / 2)] : null;
      const courier = index >= 10 && index < 12;
      const employer = shop?.id || this.supply.id;
      const workBuilding = shop ? building(shop.buildingId) : index < 10 ? warehouse : supplyBuilding;
      const baseWorkplace = shop?.anchor || (index < 10 ? this.supply.workplace : this.supply.anchor);
      const candidate = shop ? { ...baseWorkplace, x: baseWorkplace.x + (shop.frontage === 'south' ? (index % 2 ? .7 : -.7) : 0), z: baseWorkplace.z + (shop.frontage === 'east' ? (index % 2 ? .7 : -.7) : 0) }
        : { ...baseWorkplace, x: baseWorkplace.x + (index < 10 ? ((index - 6) - 1.5) * 1.1 : ((index - 12) - 3.5) * .8), z: baseWorkplace.z + .65 };
      const workplace = this.navigation.clearSegment(baseWorkplace, candidate) ? candidate : baseWorkplace;
      const resident = { id: `harbor-resident-${String(index + 1).padStart(2, '0')}`, name, index,
        role: shop ? `${shop.name}店员` : courier ? '街坊送货员' : index < 10 ? '港口仓储员' : '货栈分拣员',
        home: { buildingId: home.id, floorId: 'lobby', anchor: point(home.entrance) },
        work: { buildingId: workBuilding.id, anchor: point(workplace), employer },
        shift: shop ? (index % 2 ? { start: 12, end: 21 } : { start: 6, end: 14 }) : { start: 8, end: 17 },
        money: 50 + (this.seed + index * 17) % 31, purchased: { produce: -1, tea: -1, meal: -1 }, lastWageSlot: -1,
        ...point(home.entrance), yaw: home.entrance.yaw || 0, speed: 1.55 + (index % 4) * .08,
        phase: 'idle', activity: '稍作休息', goal: null, path: [], pathIndex: 0, insideBuildingId: null, floorId: null,
        roomId: null, crossingId: null, transit: null, cargoJobId: null, blockedFor: 0, gait: 0, visits: 0,
      };
      return resident;
    });
    this.initialMoney = this.totalMoney;
    this.initialGoods = this.totalGoods;
    this._orders();
    this.residentLoop = residentLoop && transport
      ? new HarborResidentLoop(this, createHarborLifeNavigation(colliders, { radius: RESIDENT_LOOP.radius })) : null;
    this.roleRoutines = roleRoutines ? new HarborRoleRoutines(this, this.navigation) : null;
    for (const agent of this.agents) this._chooseGoal(agent);
    this._freshSave = this.snapshot();
    this.restored = save ? this.restore(save) : false;
  }
  get time() { return this.ticks * HARBOR_LIFE_STEP; }
  get absoluteHour() { return calendarHour(this.clock, this.ticks, this.secondsPerHour); }
  get hour() { return wrap(this.absoluteHour, 24); }
  get day() { return Math.floor(this.absoluteHour / 24); }
  get totalMoney() { return this.supply.money + this.shops.reduce((n, s) => n + s.money, 0) + this.agents.reduce((n, a) => n + a.money, 0) + this.player.earnedCash - this.player.spentCash + this.jobs.reduce((n, j) => n + (j.escrow || 0), 0); }
  get totalGoods() { return PRODUCTS.reduce((n, p) => n + this.supply.stock[p], 0) + this.shops.reduce((n, s) => n + s.stock, 0) + this.jobs.reduce((n, j) => n + (j.status === 'picked-up' ? j.quantity : 0), 0) + this.statistics.consumed + PRODUCTS.reduce((n, p) => n + this.player.inventory[p], 0); }
  get availableJobs() { return this.jobs.filter(j => j.status === 'available' && !j.carrierId && this._canPickup(j)).map(j => this._jobView(j)); }
  get activeDelivery() { const job = this.jobs.find(j => j.id === this.player.activeJobId); return job ? this._jobView(job) : null; }
  get shopStatuses() { return this.shops.map(s => ({ ...copy(s), open: this.hour >= 6 && this.hour < 21,
    staff: this.agents.filter(a => a.work.employer === s.id && a.phase === 'working' && distance(a, s.anchor) < 2).length,
    pending: this.jobs.filter(j => j.shopId === s.id && ['available', 'picked-up'].includes(j.status)).map(j => this._jobView(j)) })); }
  _jobView(j) { const shop = this.shops.find(s => s.id === j.shopId); return { ...copy(j), name: `${shop.name}补货`, productName: shop.productName, pickup: point(this.supply.anchor), destination: point(shop.anchor), recipient: shop.name }; }
  _record(type, fields = {}) {
    const tx = { id: `harbor-tx-${++this.serial}`, tick: this.ticks, day: this.day, hour: this.hour, type, ...fields };
    this.transactions.push(tx); if (this.transactions.length > 96) this.transactions.shift(); this.revision++;
    return tx;
  }
  _transfer(from, to, amount) { if (!integer(amount) || from.money < amount) return false; from.money -= amount; to.money += amount; return true; }
  _orders() {
    if (this.roomAuthority) return;
    for (const shop of this.shops) {
      if (shop.stock > 4 || this.jobs.some(j => j.shopId === shop.id && ['available', 'picked-up'].includes(j.status))) continue;
      // There is no promised reward when the shop cannot fund it or the depot
      // has run out. The displayed offer is backed by current resources.
      const quantity = Math.min(8, this.supply.stock[shop.product]);
      if (!quantity || shop.money < quantity * shop.wholesale + 12) continue;
      this.jobs.push({ id: `harbor-order-${++this.orderSerial}`, shopId: shop.id, product: shop.product, quantity,
        wholesale: quantity * shop.wholesale, reward: 12, escrow: 0, status: 'available', createdTick: this.ticks, carrierId: null, pickedTick: null, deliveredTick: null });
      this.revision++;
    }
    // Completed records are useful evidence; bounded history keeps exported
    // game saves below the existing import limit during long sessions.
    const finished = this.jobs.filter(j => j.status === 'delivered');
    if (finished.length > 12) { const old = new Set(finished.slice(0, finished.length - 12).map(j => j.id)); this.jobs = this.jobs.filter(j => !old.has(j.id)); }
  }
  _canPickup(job) { const shop = this.shops.find(s => s.id === job.shopId); return job.status === 'available' && this.supply.stock[job.product] >= job.quantity && shop.money >= job.wholesale + job.reward; }
  _pickup(job, carrier) {
    if (this.roomAuthority) return false;
    if (!this._canPickup(job) || job.carrierId && job.carrierId !== (carrier.id || 'player')) return false;
    if (carrier !== this.player && this.roleRoutines?.participates(carrier) && !this.roleRoutines.claim(this.supply.id, carrier.id)) return false;
    const shop = this.shops.find(s => s.id === job.shopId);
    this._transfer(shop, this.supply, job.wholesale); shop.money -= job.reward; job.escrow = job.reward;
    this.supply.stock[job.product] -= job.quantity;
    Object.assign(job, { status: 'picked-up', carrierId: carrier.id || 'player', pickedTick: this.ticks });
    if (carrier === this.player) this.player.activeJobId = job.id; else carrier.cargoJobId = job.id;
    this._record('pickup', { jobId: job.id, shopId: shop.id, carrierId: job.carrierId, from: shop.id, to: this.supply.id, amount: job.wholesale, quantity: job.quantity, product: job.product, escrow: job.reward });
    if (carrier !== this.player) this.roleRoutines?.release(this.supply.id, carrier.id, { completed: true });
    return true;
  }
  _deliver(job, carrier) {
    if (this.roomAuthority) return false;
    if (job.status !== 'picked-up' || job.carrierId !== (carrier.id || 'player')) return false;
    if (carrier !== this.player && this.roleRoutines?.participates(carrier) && !this.roleRoutines.claim(job.shopId, carrier.id)) return false;
    const shop = this.shops.find(s => s.id === job.shopId), reward = job.escrow;
    shop.stock += job.quantity; shop.received += job.quantity;
    if (carrier === this.player) carrier.earnedCash += reward; else carrier.money += reward;
    Object.assign(job, { escrow: 0, status: 'delivered', deliveredTick: this.ticks });
    if (carrier === this.player) { this.player.activeJobId = null; this.player.completed++; } else carrier.cargoJobId = null;
    this.statistics.deliveries++;
    this._record('delivery', { jobId: job.id, shopId: shop.id, carrierId: job.carrierId, from: `escrow:${job.id}`, to: job.carrierId, amount: reward, quantity: job.quantity, product: job.product });
    if (carrier !== this.player) this.roleRoutines?.release(shop.id, carrier.id, { completed: true });
    return reward;
  }
  acceptDelivery(id, position) {
    const job = this.jobs.find(j => j.id === id);
    if (this.player.activeJobId) return { handled: true, success: false, reason: 'active-delivery', message: '先送完手里的货，再领取下一单。' };
    if (!near(position, this.supply.anchor)) return { handled: true, success: false, reason: 'not-at-supply', message: '请到芦岸货栈实际领取货物。' };
    if (!job || !this._pickup(job, this.player)) return { handled: true, success: false, reason: 'unavailable', message: '这一单已经领取，或库存与资金不足。' };
    return { handled: true, success: true, type: 'delivery-pickup', cashDelta: 0, job: this._jobView(job), message: `已领${job.quantity}份${this.shops.find(s => s.id === job.shopId).productName}，送到${this.shops.find(s => s.id === job.shopId).name}。` };
  }
  completeDelivery(position) {
    const job = this.jobs.find(j => j.id === this.player.activeJobId);
    if (!job) return { handled: false, success: false, reason: 'no-delivery' };
    const shop = this.shops.find(s => s.id === job.shopId);
    if (!near(position, shop.anchor)) return { handled: true, success: false, reason: 'not-at-recipient', message: `货物还在手里，请到${shop.name}柜台交货。` };
    const reward = this._deliver(job, this.player);
    return { handled: true, success: reward !== false, type: 'delivery-complete', cashDelta: reward || 0, jobId: job.id, message: `${shop.name}收到${job.quantity}份货物 · 运费 +$${reward} · 实际库存 ${shop.stock}。` };
  }
  /** The game owns cash. This accounts for its actual incoming payment and
   * returns the one debit for the caller to apply, without creating a wallet. */
  buyPlayer(shopId, position, { cash, requestId } = {}) {
    if (this.roomAuthority) return { handled: true, success: false, cashDelta: 0, reason: 'room-authority', message: '房间服务正在处理共享账本。' };
    const shop = this.shops.find(s => s.id === shopId);
    const fail = (reason, message) => ({ handled: true, success: false, cashDelta: 0, reason, message });
    if (!shop || position?.insideBuildingId || !near(position, shop.anchor)) return fail('not-at-shop', '请到实际柜台购买。');
    const id = requestId ?? `harbor-buy-${this.serial + 1}`;
    if (typeof id !== 'string' || !/^[a-zA-Z0-9:_-]{1,80}$/.test(id)) return fail('invalid-request', '无法处理这一笔购买。');
    const prior = this.player.purchaseRequests.find(r => r.id === id);
    if (prior) return { ...fail('already-purchased', '这一笔购买已经处理。'), transactionId: prior.transactionId };
    if (this.hour < 6 || this.hour >= 21) return fail('closed', `${shop.name}尚未营业。`);
    if (!this.agents.some(a => a.work.employer === shop.id && a.phase === 'working' && distance(a, shop.anchor) < 2)) return fail('unstaffed', '店员还没到柜台，请稍候。');
    if (!shop.stock) return fail('out-of-stock', `${shop.productName}已售罄，正在等实际补货。`);
    if (!Number.isSafeInteger(cash) || cash < 0 || cash > 9999999) return fail('invalid-cash', '无法读取当前资金。');
    if (cash < shop.price) return fail('insufficient-cash', `购买一份需要 $${shop.price}。`);
    shop.stock--; shop.sold++; shop.money += shop.price;
    this.player.spentCash += shop.price; this.player.inventory[shop.product]++;
    this.statistics.purchases++; this.statistics.playerPurchases++;
    const transaction = this._record('player-purchase', { shopId: shop.id, from: 'player-external', to: shop.id, amount: shop.price, quantity: 1, product: shop.product, requestId: id });
    this.player.purchaseRequests.push({ id, transactionId: transaction.id, shopId: shop.id, product: shop.product, price: shop.price });
    this._orders();
    return { handled: true, success: true, type: 'purchase', cashDelta: -shop.price, transactionId: transaction.id, requestId: id,
      product: shop.product, inventory: { ...this.player.inventory }, message: `买到一份${shop.productName} · -$${shop.price} · 随身已有 ${this.player.inventory[shop.product]} 份 · 店铺余货 ${shop.stock}。` };
  }
  getPrompt(position) {
    if (position?.insideBuildingId) return null;
    const active = this.activeDelivery;
    if (active && near(position, active.destination)) return { kind: 'harbor-delivery', label: `E · 给${active.recipient}交货（${active.quantity}份）`, jobId: active.id };
    if (!active && this.availableJobs.length && near(position, this.supply.anchor)) return { kind: 'harbor-delivery', label: 'E · 货栈领货 · 实际补货委托', jobId: this.availableJobs[0].id };
    const shop = this.shops.find(s => near(position, s.anchor));
    if (shop) {
      const staffed = this.agents.some(a => a.work.employer === shop.id && a.phase === 'working' && distance(a, shop.anchor) < 2);
      const state = this.hour < 6 || this.hour >= 21 ? '未营业' : !staffed ? '等店员到岗' : !shop.stock ? '已售罄 · 等补货' : `购买${shop.productName} $${shop.price}/份`;
      return { kind: 'harbor-shop', shopId: shop.id, label: `E · ${shop.name} · ${state}`, price: shop.price, stock: shop.stock };
    }
    const agent = this.agents.filter(a => !a.insideBuildingId && a.phase !== 'riding' && near(position, a, 2.5)).sort((a, b) => distance(a, position) - distance(b, position))[0];
    return agent ? { kind: 'harbor-person', label: `E · 与${agent.name}聊聊`, agentId: agent.id } : null;
  }
  interact(position, options = {}) {
    const prompt = this.getPrompt(position); if (!prompt) return { handled: false };
    if (prompt.kind === 'harbor-delivery') return this.player.activeJobId ? this.completeDelivery(position) : this.acceptDelivery(prompt.jobId, position);
    if (prompt.kind === 'harbor-person') {
      const a = this.agents.find(a => a.id === prompt.agentId), home = this.buildings.find(b => b.id === a.home.buildingId);
      return { handled: true, type: 'conversation', agentId: a.id, message: `我是${a.name}，住在${home.name}，做${a.role}。我现在${a.activity}。身上有 $${a.money}，今天买了${PRODUCTS.filter(p => a.purchased[p] === this.day).length}次东西。` };
    }
    return this.buyPlayer(prompt.shopId, position, options);
  }
  _homePath(agent) {
    if (this.homePaths.has(agent.home.buildingId)) return this.homePaths.get(agent.home.buildingId);
    const building = this.buildings.find(b => b.id === agent.home.buildingId), floor = building.floors.find(f => f.id === 'lobby');
    const layout = createInteriorLayout(building, floor), room = layout.rooms.find(r => r.type === 'bedroom') || layout.rooms[0];
    const path = [point(building.entryPortal || building.entrance, floor.y), point(layout.entrance, floor.y),
      { x: building.x, z: room.arrival.z, y: floor.y }, point(room.arrival, floor.y)];
    const data = { path, roomId: room.id, floorId: floor.id }; this.homePaths.set(agent.home.buildingId, data); return data;
  }
  _inShift(agent) { return this.hour >= agent.shift.start && this.hour < agent.shift.end && !(agent.index >= 6 && this.hour >= 12 && this.hour < 14); }
  _desired(agent) {
    if (agent.cargoJobId) { const job = this.jobs.find(j => j.id === agent.cargoJobId); return { kind: 'deliver', id: job.id, anchor: this.shops.find(s => s.id === job.shopId).anchor }; }
    if (agent.index >= 10 && agent.index < 12 && this.hour >= 7 && this.hour < 20) {
      const reserved = this.jobs.find(j => j.status === 'available' && j.carrierId === agent.id && this._canPickup(j));
      const job = reserved || this.jobs.find(j => j.status === 'available' && !j.carrierId && this.time - j.createdTick * HARBOR_LIFE_STEP >= 75 && this._canPickup(j));
      if (job) { job.carrierId = agent.id; return { kind: 'pickup', id: job.id, anchor: this.supply.anchor }; }
    }
    if (this._inShift(agent)) return { kind: 'work', id: agent.work.employer, anchor: agent.work.anchor };
    const product = this.hour >= 6 && this.hour < 8 ? 'tea' : this.hour >= 12 && this.hour < 14 ? 'meal' : this.hour >= 17 && this.hour < 21 ? 'produce' : null;
    if (product && agent.purchased[product] !== this.day) {
      const shop = this.shops.find(s => s.product === product), offset = ((agent.index % 4) - 1.5) * .8;
      const candidate = { ...shop.anchor, x: shop.anchor.x + (shop.frontage === 'east' ? .7 : offset), z: shop.anchor.z + (shop.frontage === 'east' ? offset : .5) };
      return { kind: 'shop', id: shop.id, anchor: this.navigation.clearSegment(shop.anchor, candidate) ? candidate : shop.anchor };
    }
    return { kind: 'home', id: agent.home.buildingId, anchor: agent.home.anchor };
  }
  _chooseGoal(agent) {
    if (this.roleRoutines?.owns(agent)) return;
    if (this.residentLoop?.owns(agent)) return;
    const target = this._desired(agent);
    if (agent.goal?.kind === target.kind && agent.goal.id === target.id && agent.phase !== 'route-blocked') return;
    if (agent.transit) return; // A passenger must finish a real ride before rerouting.
    if (agent.goal?.kind === 'shop') {
      const previous = this.shops.find(s => s.id === agent.goal.id);
      if (agent.purchased[previous.product] !== this.day) { this.statistics.missedPurchases++; this._record('missed-purchase', { agentId: agent.id, shopId: previous.id, product: previous.product, amount: 0, quantity: 0, reason: agent.activity }); }
    }
    if (agent.goal?.kind === 'pickup') { const prior = this.jobs.find(j => j.id === agent.goal.id); if (prior?.status === 'available' && prior.carrierId === agent.id) prior.carrierId = null; }
    agent.goal = copy(target); agent.blockedFor = 0;
    if (agent.insideBuildingId) {
      const home = this._homePath(agent);
      agent.path = [...home.path].reverse().concat(point(agent.home.anchor)); agent.pathIndex = 0; agent.phase = 'leaving-home'; agent.activity = '出门';
      return;
    }
    this._route(agent, target.anchor);
  }
  _route(agent, destination, finalLeg = false) {
    const stops = this.transport?.stops?.filter(s => s.routeId === 'harbor-tram') || [];
    if (!finalLeg && stops.length >= 2 && distance(agent, destination) > 145) {
      const entrance = s => s.board || s.entrance || s.position || s;
      const origin = [...stops].sort((a, b) => distance(agent, entrance(a)) - distance(agent, entrance(b)))[0];
      const target = [...stops].sort((a, b) => distance(destination, entrance(a)) - distance(destination, entrance(b)))[0];
      if (origin.id !== target.id && distance(agent, entrance(origin)) + distance(destination, entrance(target)) < distance(agent, destination) + 50) {
        const path = this.navigation.route(agent, entrance(origin));
        if (path) { agent.transit = { phase: 'approach', originStopId: origin.id, destinationStopId: target.id, ticket: null }; agent.path = path; agent.pathIndex = 0; agent.phase = 'walking'; agent.activity = '走向电车站'; return; }
      }
    }
    if (this.roleRoutines?.contactResource(agent)) destination = this.roleRoutines.contactDestination(agent);
    const path = this.navigation.route(agent, destination);
    agent.path = path || []; agent.pathIndex = 0; agent.phase = path ? 'walking' : 'route-blocked';
    agent.activity = path ? (agent.goal.kind === 'work' ? '走去上班' : agent.goal.kind === 'home' ? '走回家' : agent.goal.kind === 'shop' ? '走去采购' : '运送补货') : '等待通路';
    if (path && !path.length) this._arrive(agent);
  }
  _arrive(agent) {
    if (this.residentLoop?.owns(agent)) { this.residentLoop.arrive(agent); return; }
    if (this.roleRoutines?.owns(agent)) { this.roleRoutines.arrive(agent); return; }
    agent.path = []; agent.pathIndex = 0; agent.crossingId = null;
    if (agent.transit?.phase === 'boarding') {
      this.transport.confirmCitizen?.(agent.id); agent.transit.phase = 'riding'; agent.phase = 'riding'; agent.activity = '乘坐港湾电车'; this.statistics.boarded++; this.revision++; return;
    }
    if (agent.transit?.phase === 'alighting') {
      this.transport.releaseCitizen(agent.id); agent.transit = null; this.statistics.alighted++; this.revision++; this._route(agent, agent.goal.anchor, true); return;
    }
    if (agent.transit?.phase === 'approach') { agent.transit.phase = 'waiting'; agent.phase = 'waiting-transit'; agent.activity = '等实际班次'; return; }
    if (agent.phase === 'leaving-home') { agent.insideBuildingId = null; agent.floorId = null; agent.roomId = null; agent.y = .18; this._route(agent, agent.goal.anchor); return; }
    if (agent.phase === 'entering-home') { agent.phase = 'resting'; agent.activity = '在家休息'; agent.visits++; return; }
    if (agent.goal.kind === 'home') {
      const home = this._homePath(agent); agent.insideBuildingId = agent.home.buildingId; agent.floorId = home.floorId; agent.roomId = home.roomId;
      agent.path = copy(home.path); agent.pathIndex = 0; agent.phase = 'entering-home'; agent.activity = '进家门'; return;
    }
    if (agent.goal.kind === 'work') { agent.phase = 'working'; agent.activity = '在岗位工作'; return; }
    if (agent.goal.kind === 'shop') { agent.phase = 'shopping'; agent.activity = '等店员售货'; return; }
    if (agent.goal.kind === 'pickup') {
      const job = this.jobs.find(j => j.id === agent.goal.id);
      if (job && this._canPickup(job) && this.roleRoutines?.participates(agent) && !this.roleRoutines.claim(this.supply.id, agent.id)) {
        agent.phase = 'idle'; agent.activity = '在货栈等前一位街坊交接'; return;
      }
      if (job && this._pickup(job, agent)) this._chooseGoal(agent); else { agent.goal = null; this._chooseGoal(agent); }
      return;
    }
    if (agent.goal.kind === 'deliver') {
      const job = this.jobs.find(j => j.id === agent.goal.id);
      if (this._deliver(job, agent) === false) { agent.phase = 'idle'; agent.activity = '在店铺等前一位街坊交接'; return; }
      agent.goal = null; this._chooseGoal(agent);
    }
  }
  _crossingRun(agent, crossing) {
    const points = [point(agent)], edge = crossing.width / 2 - 2 + .6;
    for (let i = agent.pathIndex; i < agent.path.length; i++) {
      const p = agent.path[i]; points.push(point(p));
      if (Math.abs(p[crossing.axis] - crossing.road) >= edge) break;
    }
    return points;
  }
  _crossingOccupied(points, vehicle) {
    const body = { ...vehicle, hx: vehicle.hx ?? VEHICLE_SHAPE.hx, hz: vehicle.hz ?? VEHICLE_SHAPE.hz, externalBody: true,
      minY: vehicle.minY ?? vehicle.y ?? 0, maxY: vehicle.maxY ?? (vehicle.y ?? 0) + VEHICLE_SHAPE.height };
    const s = Math.abs(Math.sin(body.yaw)), c = Math.abs(Math.cos(body.yaw));
    const hx = c * body.hx + s * body.hz, hz = s * body.hx + c * body.hz;
    if (Math.max(...points.map(p => p.x)) + .6 < body.x - hx || Math.min(...points.map(p => p.x)) - .6 > body.x + hx ||
        Math.max(...points.map(p => p.z)) + .6 < body.z - hz || Math.min(...points.map(p => p.z)) - .6 > body.z + hz) return false;
    for (let i = 1; i < points.length; i++) {
      const p = { ...points[i - 1] }, next = points[i];
      if (moveCircle(p, next.x - p.x, next.z - p.z, .6, { bounds: 3000, vehicles: [body] }).contacts.length) return true;
    }
    return false;
  }
  _walk(agent, dt, vehicles) {
    let remaining = agent.speed * dt;
    while (remaining > 1e-8 && agent.pathIndex < agent.path.length) {
      const target = agent.path[agent.pathIndex], gap = Math.hypot(target.x - agent.x, target.z - agent.z, (target.y ?? .18) - agent.y);
      const previous = this.navigation.crossings.find(c => c.id === agent.crossingId);
      if (previous && target.crossingId !== previous.id && Math.abs(agent[previous.axis] - previous.road) >= previous.width / 2 - 2 + .6) agent.crossingId = null;
      if (target.crossingId && target.crossingId !== agent.crossingId) {
        const crossing = this.navigation.crossings.find(c => c.id === target.crossingId);
        // Older saves may retain the previous leg's claim after a turn.
        // A person already inside this carriageway completes that crossing;
        // an approach from pavement still waits for this leg's green light.
        const admitted = agent.crossingId && Math.abs(agent[crossing.axis] - crossing.road) < crossing.width / 2 - 2 + .6;
        if (!admitted && intersectionSignal(this.trafficTime ?? this.time, crossing.x, crossing.z, crossing.axis) !== 'green') { agent.activity = '在斑马线前等灯'; return; }
        if (!admitted && vehicles.some(v => v.health !== 0 && Math.abs((v.y ?? 0) - agent.y) < 1.5 && this._crossingOccupied(this._crossingRun(agent, crossing), v))) {
          agent.activity = '在路缘等占线车辆清空'; return;
        }
        agent.crossingId = target.crossingId;
      }
      const step = Math.min(remaining, gap), t = gap > 1e-9 ? step / gap : 1;
      const next = { x: agent.x + (target.x - agent.x) * t, z: agent.z + (target.z - agent.z) * t, y: agent.y + ((target.y ?? .18) - agent.y) * t };
      if (!agent.insideBuildingId && vehicles.some(v => v.health !== 0 && Math.abs((v.y ?? 0) - next.y) < 1.5 && distance(v, next) < 7 && circleOBB({ ...next, radius: .6 }, v))) { agent.blockedFor += dt; agent.activity = '给车辆让行'; return; }
      if (this.roleRoutines && !this.roleRoutines.contactStepClear(agent, next)) {
        if (this.roleRoutines.contactBypass(agent, target)) {
          agent.path.splice(agent.pathIndex, 1);
          agent.activity = '沿原终点的真实通路走向交接柜台'; return;
        }
        const detour = this.roleRoutines.contactDetour(agent, target);
        if (detour) agent.path.splice(agent.pathIndex, 1, ...detour);
        agent.activity = detour ? '沿真实空位绕过柜台等候者' : '在实际柜台保持身体间距'; return;
      }
      if (gap > 1e-7) agent.yaw = Math.atan2(target.x - agent.x, target.z - agent.z);
      Object.assign(agent, next); remaining -= step; agent.gait += step * 7; agent.blockedFor = 0;
      if (t === 1) {
        agent.pathIndex++;
        const claim = this.navigation.crossings.find(c => c.id === agent.crossingId);
        if (claim && Math.abs(agent[claim.axis] - claim.road) >= claim.width / 2 - 2 + .6) agent.crossingId = null;
      }
    }
    if (agent.pathIndex >= agent.path.length) this._arrive(agent);
  }
  _transit(agent, dt) {
    const j = agent.transit;
    if (j.phase === 'waiting') {
      const ticket = this.transport.boardCitizen(agent.id, j.originStopId, j.destinationStopId, { slot: agent.index % 8 });
      if (ticket) {
        ticket.phase = 'boarding'; j.ticket = copy(ticket); j.phase = 'boarding'; agent.phase = 'boarding'; agent.activity = '从开门处上车';
        const path = this.transport.citizenBoardingPath(j.originStopId, ticket.vehicleId, ticket.slot);
        agent.path = (path || [this.transport.citizenPose(agent.id)]).filter(Boolean).map(p => point(p)); agent.pathIndex = 0;
      }
    }
    if (['boarding', 'alighting'].includes(j.phase)) {
      this.transport.holdDoors?.(j.ticket.vehicleId, 2); this._walk(agent, dt, []); return;
    }
    if (j.phase === 'riding') {
      const pose = this.transport.citizenPose(agent.id); if (pose) Object.assign(agent, point(pose), { yaw: pose.yaw ?? agent.yaw });
      const arrival = this.transport.citizenArrival(agent.id);
      if (arrival) {
        const path = this.transport.citizenBoardingPath(j.destinationStopId, j.ticket.vehicleId, j.ticket.slot);
        this.transport.holdDoors?.(j.ticket.vehicleId, 3); j.phase = 'alighting'; agent.phase = 'alighting'; agent.activity = '沿车门下车';
        agent.path = (path ? [...path].reverse().slice(1) : [arrival]).map(p => point(p)); agent.pathIndex = 0;
      }
    }
  }
  _purchase(agent) {
    if (this.roomAuthority) return;
    const shop = this.shops.find(s => s.id === agent.goal.id);
    if (!near(agent, shop.anchor)) return;
    if (agent.purchased[shop.product] === this.day) { agent.goal = null; this._chooseGoal(agent); return; }
    const staffed = this.agents.some(a => a.work.employer === shop.id && a.phase === 'working' && distance(a, shop.anchor) < 2);
    if (this.hour < 6 || this.hour >= 21 || !staffed || !shop.stock || agent.money < shop.price) {
      agent.activity = !shop.stock ? '等下一批实际补货' : !staffed ? '等店员到岗' : '留着钱等下次采购'; return;
    }
    this._transfer(agent, shop, shop.price); shop.stock--; shop.sold++; agent.purchased[shop.product] = this.day;
    this.statistics.purchases++; this.statistics.consumed++; this.consumedByProduct[shop.product]++;
    this._record('purchase', { agentId: agent.id, shopId: shop.id, from: agent.id, to: shop.id, amount: shop.price, quantity: 1, product: shop.product });
    agent.goal = null; this._chooseGoal(agent);
  }
  _wage(agent) {
    if (this.roomAuthority) return;
    if (this.residentLoop?.owns(agent) || this.roleRoutines?.owns(agent)) return;
    const slot = Math.floor(this.absoluteHour);
    if (agent.lastWageSlot >= slot || !this._inShift(agent) || distance(agent, agent.work.anchor) > .4) return;
    const employer = agent.work.employer === this.supply.id ? this.supply : this.shops.find(s => s.id === agent.work.employer);
    if (!this._transfer(employer, agent, 3)) { agent.activity = '等雇主结清工资'; return; }
    agent.lastWageSlot = slot; if (employer !== this.supply) employer.paidWages += 3;
    this.statistics.wages++;
    this._record('wage', { agentId: agent.id, from: employer.id, to: agent.id, amount: 3, slot });
  }
  /** dt owns world progress. Optional hour records a light preview only;
   * shifts, shop hours, diary dates and payroll all read the shared calendar. */
  update(dt, options = {}) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const vehicles = typeof options === 'object' ? options.vehicles || [] : [];
    const suppliedHour = typeof options === 'number' ? options : options.hour;
    if (Number.isFinite(suppliedHour)) this.externalHour = wrap(suppliedHour, 24);
    if (typeof options === 'object' && Number.isFinite(options.trafficTime) && options.trafficTime >= 0) this.trafficTime = options.trafficTime;
    this.accumulator += dt;
    while (this.accumulator + 1e-9 >= HARBOR_LIFE_STEP) {
      this.accumulator = Math.max(0, this.accumulator - HARBOR_LIFE_STEP); this.ticks++;
      this.roleRoutines?.pruneQueues();
      for (const agent of this.agents) {
        if (this.roomAuthority && (this.residentLoop?.owns(agent) || this.roleRoutines?.owns(agent))) continue;
        if (this.residentLoop?.owns(agent)) { this.residentLoop.updateTick(vehicles); continue; }
        if (this.roleRoutines?.owns(agent)) { this.roleRoutines.updateTick(agent, vehicles); continue; }
        if (agent.transit && ['waiting', 'riding', 'boarding', 'alighting'].includes(agent.transit.phase)) { this._transit(agent, HARBOR_LIFE_STEP); continue; }
        if (this.roleRoutines?.contactResource(agent)) this.roleRoutines.refreshContactRoute(agent);
        if (agent.phase === 'idle' && ['pickup', 'deliver'].includes(agent.goal?.kind) && near(agent, agent.goal.anchor, .05)) this._arrive(agent);
        if (['walking', 'entering-home', 'leaving-home'].includes(agent.phase)) this._walk(agent, HARBOR_LIFE_STEP, vehicles);
        if (agent.phase === 'working') this._wage(agent);
        if (agent.phase === 'shopping') this._purchase(agent);
        if (this.ticks % 10 === 0 && !['entering-home', 'leaving-home'].includes(agent.phase)) this._chooseGoal(agent);
      }
      if (this.ticks % 10 === 0) this._orders();
    }
    // Snap numerical frame accumulation only; it must not vary the saved clock.
    if (Math.abs(this.accumulator) < 1e-9) this.accumulator = 0;
  }
  getCollisionBodies(position, radius = 12) { return this.agents.filter(a => !a.insideBuildingId && a.phase !== 'riding' && distance(a, position) < radius).map(a => ({ id: a.id, x: a.x, z: a.z, y: a.y, groundY: a.y, radius: .43 })); }
  setRoomAuthority(enabled = true) {
    enabled = Boolean(enabled);
    if (enabled === this.roomAuthority) return enabled;
    if (enabled) { this._roomLocalSnapshot = this.snapshot(); this.roomAuthority = true; return true; }
    this.roomAuthority = false;
    const restore = this._roomLocalSnapshot; this._roomLocalSnapshot = null;
    if (restore) this.restore(restore);
    return false;
  }
  persistentSnapshot() { return this.roomAuthority && this._roomLocalSnapshot ? copy(this._roomLocalSnapshot) : this.snapshot(); }
  /** Apply the finite shared ledger without accepting peer-authored resident
   * routes or positions. This is used by the room client after each SSE frame. */
  applyRoomEconomy(state) {
    // v2 is the live room protocol. Keep v1 readable for a client joining an
    // older room, but only apply the bounded ledger fields below; resident
    // routes, poses and goals are always retained from this client.
    if (!state || state.schema !== 'neon-harbor/room-economy' || ![1, 2].includes(state.version)) return false;
    if (state.supply?.id !== this.supply.id || !Array.isArray(state.shops) || state.shops.length !== this.shops.length || !Array.isArray(state.jobs)) return false;
    const supply = copy(state.supply), shops = this.shops.map(shop => {
      const next = state.shops.find(candidate => candidate && candidate.id === shop.id);
      if (!next || !integer(next.money) || !integer(next.stock) || !integer(next.sold) || !integer(next.received)) return null;
      return { shop, next: copy(next) };
    });
    if (shops.some(value => !value) || !integer(supply.money) || PRODUCTS.some(product => !integer(supply.stock?.[product]))) return false;
    const residents = Array.isArray(state.residents) ? this.agents.map(agent => {
      const next = state.residents.find(candidate => candidate && candidate.id === agent.id);
      if (!next || !integer(next.money) || !integer(next.wages) || !integer(next.purchases)) return null;
      return { agent, next };
    }) : [];
    if (state.version >= 2 && (residents.length !== this.agents.length || residents.some(value => !value))) return false;
    const player = state.player && {
      earnedCash: integer(state.player.earnedCash) ? state.player.earnedCash : null,
      spentCash: integer(state.player.spentCash) ? state.player.spentCash : null,
      inventory: PRODUCTS.every(product => integer(state.player.inventory?.[product], 100)) ? copy(state.player.inventory) : null,
      activeJobId: state.player.activeJobId == null || typeof state.player.activeJobId === 'string' ? state.player.activeJobId || null : null,
      requests: Array.isArray(state.player.requests) ? copy(state.player.requests) : null,
    };
    if (state.player && (!player || player.earnedCash === null || player.spentCash === null || !player.inventory)) return false;
    if (state.consumed && !PRODUCTS.every(product => integer(state.consumed[product], 100))) return false;
    const consumed = state.consumed ? copy(state.consumed)
      : Object.fromEntries(PRODUCTS.map(product => [product, this.consumedByProduct[product]]));
    const jobs = copy(state.jobs);
    if (state.version >= 2 && jobs.some(job => !job || !/^room-order-\d+$/.test(job.id) || !this.shops.some(shop =>
      shop.id === job.shopId && shop.product === job.product && job.wholesale === job.quantity * shop.wholesale) ||
      !integer(job.quantity, 8) || !job.quantity || job.reward !== 12 || !integer(job.escrow, 12) ||
      !['available', 'picked-up', 'delivered'].includes(job.status) || job.escrow !== (job.status === 'picked-up' ? 12 : 0) ||
      (job.carrierId !== null && typeof job.carrierId !== 'string'))) return false;
    // Commit only after all shape and range checks pass, so a malformed SSE
    // frame cannot leave a half-applied local ledger.
    this.supply.money = supply.money; for (const product of PRODUCTS) this.supply.stock[product] = supply.stock[product];
    for (const { shop, next } of shops) for (const field of ['money', 'stock', 'sold', 'received']) shop[field] = next[field];
    this.jobs = jobs;
    this.consumedByProduct = consumed;
    if (residents.length) for (const { agent, next } of residents) {
      // Keep each locally simulated pose/path. Only the server-owned account
      // and aggregate receipts cross the room boundary.
      agent.money = next.money; agent.roomWages = next.wages; agent.roomPurchases = next.purchases;
    }
    if (player) {
      this.player.earnedCash = player.earnedCash; this.player.spentCash = player.spentCash;
      this.player.inventory = player.inventory; this.player.activeJobId = player.activeJobId;
      // Room deliveries currently pay a fixed $12 escrow reward, so this
      // count mirrors the room wallet while authority is enabled. The local
      // snapshot retained by setRoomAuthority() restores the original count
      // when the client leaves the room.
      this.player.completed = Math.floor(player.earnedCash / 12);
      if (player.requests) this.player.purchaseRequests = player.requests;
    }
    const residentWages = residents.reduce((sum, value) => sum + (value?.next.wages || 0), 0);
    const residentPurchases = residents.reduce((sum, value) => sum + (value?.next.purchases || 0), 0);
    const playerPurchases = player?.requests?.length ?? this.statistics.playerPurchases;
    this.statistics.wages = residentWages;
    this.statistics.playerPurchases = playerPurchases;
    this.statistics.purchases = residentPurchases + playerPurchases;
    this.statistics.consumed = PRODUCTS.reduce((sum, product) => sum + this.consumedByProduct[product], 0);
    this.statistics.deliveries = this.jobs.filter(job => job.status === 'delivered').length;
    if (Number.isFinite(state.absoluteHour)) {
      this.clock.absoluteHour = state.absoluteHour;
      this.clock.epochTick = this.ticks;
    } else if (Number.isFinite(state.hour)) {
      this.clock.absoluteHour = Math.floor(this.clock.absoluteHour / 24) * 24 + wrap(state.hour, 24);
      this.clock.epochTick = this.ticks;
    }
    if (Array.isArray(state.transactions)) this.transactions = copy(state.transactions);
    this.revision = Math.max(this.revision, Number.isSafeInteger(state.revision) ? state.revision : this.revision);
    return true;
  }
  trafficStopDistanceAt(car) {
    if (Math.abs(car.y || 0) > 2) return Infinity;
    let gap = Infinity;
    const sine = Math.sin(car.yaw), cosine = Math.cos(car.yaw), radius = .6;
    const padding = car.kind === 'bus' || car.kind === 'tram' ? .08 : 0;
    const body = { ...car, hx: (car.hx ?? VEHICLE_SHAPE.hx) + padding, hz: (car.hz ?? VEHICLE_SHAPE.hz) + padding };
    const vehicle = padding && this.transport?.vehicle(car.id);
    const next = vehicle && harborRoutePose(this.transport.route(vehicle.routeId), vehicle.serviceTime + .05);
    const sweep = a => next && moveVehicle({ ...body }, next.x - car.x, next.z - car.z,
      Math.atan2(Math.sin(next.yaw - car.yaw), Math.cos(next.yaw - car.yaw)),
      { bounds: 3000, circles: [{ x: a.x, z: a.z, groundY: a.y, y: 0, radius }] }).contacts.length;
    for (const a of this.agents) if (a.crossingId) {
      // Check actual contact before path bounds: a turning long vehicle may
      // sweep a person whose crossing plane is nearly parallel or behind it.
      if (circleOBB({ ...a, radius }, body) || sweep(a)) { gap = 0; continue; }
      const target = a.path[a.pathIndex];
      const crossing = this.navigation.crossings.find(c => c.id === (target?.crossingId || a.crossingId));
      if (!crossing) continue;
      const points = this._crossingRun(a, crossing);
      const projected = points.map(p => ({
        forward: (p.x - car.x) * sine + (p.z - car.z) * cosine,
        side: (p.x - car.x) * cosine - (p.z - car.z) * sine,
      }));
      const first = Math.min(...projected.map(p => p.forward)), last = Math.max(...projected.map(p => p.forward));
      const left = Math.min(...projected.map(p => p.side)), right = Math.max(...projected.map(p => p.side));
      if (last < -body.hz - radius || first >= 50 || left > body.hx + radius || right < -body.hx - radius) continue;
      // A vehicle already occupying this actual polyline clears first while
      // the person waits outside its side. New entrants wait at the curb.
      const side = Math.abs((a.x - car.x) * cosine - (a.z - car.z) * sine);
      if (side >= body.hx + radius && (!padding || vehicle) && this._crossingOccupied(points, body)) continue;
      gap = Math.min(gap, Math.max(0, first - 4));
    }
    return gap;
  }
  trafficYieldAt(car) { return Number.isFinite(this.trafficStopDistanceAt(car)); }
  summary() { return { schema: HARBOR_LIFE_SCHEMA, version: HARBOR_LIFE_VERSION, seed: this.seed, hour: this.hour, day: this.day, residents: this.agents.length,
    residentDiary: this.residentLoop?.publicStatus() || null,
    residentRoutines: this.roleRoutines?.publicStatus() || null,
    activeDelivery: this.activeDelivery, availableJobs: this.availableJobs, shops: this.shopStatuses, statistics: { ...this.statistics },
    totalMoney: this.totalMoney, initialMoney: this.initialMoney, cashPaidToPlayer: this.player.earnedCash, cashPaidByPlayer: this.player.spentCash, playerInventory: { ...this.player.inventory }, totalGoods: this.totalGoods, initialGoods: this.initialGoods, consumedByProduct: { ...this.consumedByProduct },
    phases: Object.fromEntries([...new Set(this.agents.map(a => a.phase))].map(p => [p, this.agents.filter(a => a.phase === p).length])) }; }
  snapshot() {
    return copy({ schema: HARBOR_LIFE_SCHEMA, version: HARBOR_LIFE_VERSION, seed: this.seed, secondsPerHour: this.secondsPerHour, startHour: this.startHour, clock: this.clock,
      ticks: this.ticks, accumulator: this.accumulator, externalHour: this.externalHour, revision: this.revision, serial: this.serial, orderSerial: this.orderSerial,
      initialMoney: this.initialMoney, initialGoods: this.initialGoods, consumedByProduct: this.consumedByProduct, player: this.player, statistics: this.statistics,
      supply: { money: this.supply.money, stock: this.supply.stock },
      shops: this.shops.map(({ id, money, stock, sold, received, paidWages }) => ({ id, money, stock, sold, received, paidWages })),
      agents: this.agents.map(({ id, money, purchased, lastWageSlot, x, y, z, yaw, phase, activity, goal, path, pathIndex, insideBuildingId, floorId, roomId, crossingId, transit, cargoJobId, blockedFor, gait, visits }) =>
        ({ id, money, purchased, lastWageSlot, x, y, z, yaw, phase, activity, goal, path, pathIndex, insideBuildingId, floorId, roomId, crossingId, transit, cargoJobId, blockedFor, gait, visits })),
      jobs: this.jobs, transactions: this.transactions, residentLoop: this.residentLoop?.snapshot() || null, roleRoutines: this.roleRoutines?.snapshot() || null });
  }
  reset({ hour = this._freshSave.startHour } = {}) {
    for (const a of this.agents) this.transport?.releaseCitizen?.(a.id);
    this.trafficTime = undefined;
    const state = copy(this._freshSave); state.startHour = wrap(hour, 24); state.externalHour = null;
    state.clock = { version: 1, epochTick: 0, absoluteHour: state.startHour };
    if (this.residentLoop) this.residentLoop.rebaseFreshCalendar(state);
    if (this.roleRoutines) this.roleRoutines.rebaseFreshCalendar(state);
    if (!this.restore(state)) return false;
    for (const agent of this.agents) { agent.goal = null; this._chooseGoal(agent); }
    this.restored = false; return true;
  }
  restore(raw) {
    if (raw == null && this._freshSave) return this.reset();
    try {
      const s = typeof raw === 'string' ? JSON.parse(raw) : copy(raw);
      // Version 1 exports made before player retail retain their untouched
      // inventory and have no imported payment; existing daily life resumes.
      if (s?.player && s.player.spentCash === undefined) { s.player.spentCash = 0; s.player.inventory = Object.fromEntries(PRODUCTS.map(p => [p, 0])); s.player.purchaseRequests = []; if (s.statistics) s.statistics.playerPurchases = 0; }
      const legacyVersion = s?.version === 1 || s?.version === 2 ? s.version : null;
      if (legacyVersion) {
        if (!Number.isFinite(s.startHour) || s.startHour < 0 || s.startHour >= 24 || !Number.isFinite(s.secondsPerHour) || s.secondsPerHour <= 0 || !integer(s.ticks, 1e10)) return false;
        if (legacyVersion === 2 && this.residentLoop && !this.residentLoop.validate(s.residentLoop, s.agents?.find(agent => this.residentLoop.owns(agent)), s, { legacy: true })) return false;
        const oldRate = s.secondsPerHour;
        s.clock = { version: 1, epochTick: s.ticks, absoluteHour: s.startHour + s.ticks * HARBOR_LIFE_STEP / oldRate, legacySecondsPerHour: oldRate };
        s.secondsPerHour = this.secondsPerHour;
      }
      if (legacyVersion === 1) {
        if (this.residentLoop && !this.residentLoop.migrateLegacy(s)) return false;
        else if (!this.residentLoop) s.residentLoop = null;
      }
      if (legacyVersion === 2 && this.residentLoop) this.residentLoop.migrateCalendar(s);
      if (legacyVersion) s.version = HARBOR_LIFE_VERSION;
      if (!s || s.schema !== HARBOR_LIFE_SCHEMA || s.version !== HARBOR_LIFE_VERSION || s.seed !== this.seed || s.secondsPerHour !== this.secondsPerHour || !Number.isFinite(s.startHour) || s.startHour < 0 || s.startHour >= 24 || (s.externalHour != null && (!Number.isFinite(s.externalHour) || s.externalHour < 0 || s.externalHour >= 24))) return false;
      if (!integer(s.ticks, 1e10) || !Number.isFinite(s.accumulator) || s.accumulator < 0 || s.accumulator >= HARBOR_LIFE_STEP + 1e-8 || !integer(s.serial) || !integer(s.orderSerial) || !integer(s.revision)) return false;
      if (!validCalendar(s.clock, s.ticks)) return false;
      if (this.roleRoutines && s.roleRoutines == null) this.roleRoutines.migrateMissing(s);
      const savedAbsoluteHour = calendarHour(s.clock, s.ticks, this.secondsPerHour);
      if (s.initialMoney !== this.initialMoney || s.initialGoods !== this.initialGoods || !integer(s.player?.earnedCash) || !integer(s.player?.spentCash) || PRODUCTS.some(p => !integer(s.player?.inventory?.[p], 100)) || !integer(s.player?.completed)) return false;
      if (!integer(s.supply?.money) || PRODUCTS.some(p => !integer(s.supply.stock?.[p], 96))) return false;
      if (s.shops?.length !== this.shops.length || s.shops.some((a, i) => a.id !== this.shops[i].id || ['money', 'stock', 'sold', 'received', 'paidWages'].some(k => !integer(a[k])))) return false;
      const phases = new Set(['idle', 'walking', 'working', 'shopping', 'resting', 'waiting-transit', 'riding', 'boarding', 'alighting', 'entering-home', 'leaving-home', 'route-blocked']);
      if (s.agents?.length !== this.agents.length || s.agents.some((a, i) => a.id !== this.agents[i].id || !integer(a.money) || (!Number.isSafeInteger(a.lastWageSlot) || a.lastWageSlot < -1 || a.lastWageSlot > Math.floor(savedAbsoluteHour)) ||
        ![a.x, a.y, a.z, a.yaw, a.gait, a.blockedFor].every(Number.isFinite) || Math.abs(a.x) > 300 || a.z < -300 || a.z > 300 || !phases.has(a.phase) ||
        !Array.isArray(a.path) || a.path.length > 100 || !integer(a.pathIndex, a.path.length) || a.path.some(p => ![p.x, p.z, p.y].every(Number.isFinite) || Math.abs(p.x) > 300 || p.z < -300 || p.z > 300 || (p.crossingId && !this.navigation.crossings.some(c => c.id === p.crossingId))) ||
        PRODUCTS.some(p => !Number.isSafeInteger(a.purchased?.[p]) || a.purchased[p] < -1) || (a.goal && !['home', 'work', 'shop', 'pickup', 'deliver'].includes(a.goal.kind)))) return false;
      if (!Array.isArray(s.jobs) || s.jobs.length > 40 || new Set(s.jobs.map(j => j.id)).size !== s.jobs.length || s.jobs.some(j =>
        !/^harbor-order-\d+$/.test(j.id) || !this.shops.some(shop => shop.id === j.shopId && shop.product === j.product && j.wholesale === j.quantity * shop.wholesale) ||
        !integer(j.quantity, 8) || !j.quantity || j.reward !== 12 || !integer(j.escrow, 12) || !['available', 'picked-up', 'delivered'].includes(j.status) ||
        j.escrow !== (j.status === 'picked-up' ? j.reward : 0) || (j.carrierId && j.carrierId !== 'player' && !this.agents.some(a => a.id === j.carrierId)))) return false;
      if (s.player.earnedCash !== s.player.completed * 12) return false;
      if (!Array.isArray(s.player.purchaseRequests) || s.player.purchaseRequests.length > 300 || new Set(s.player.purchaseRequests.map(r => r.id)).size !== s.player.purchaseRequests.length || new Set(s.player.purchaseRequests.map(r => r.transactionId)).size !== s.player.purchaseRequests.length || s.player.purchaseRequests.some(r =>
        typeof r.id !== 'string' || !/^[a-zA-Z0-9:_-]{1,80}$/.test(r.id) || !/^harbor-tx-\d+$/.test(r.transactionId) || Number(r.transactionId.slice(10)) < 1 || Number(r.transactionId.slice(10)) > s.serial || !this.shops.some(shop => shop.id === r.shopId && shop.product === r.product && shop.price === r.price))) return false;
      if (s.player.purchaseRequests.reduce((n, r) => n + r.price, 0) !== s.player.spentCash || PRODUCTS.some(p => s.player.purchaseRequests.filter(r => r.product === p).length !== s.player.inventory[p])) return false;
      const selected = s.agents.find(agent => this.residentLoop?.owns(agent));
      if (this.residentLoop ? !this.residentLoop.validate(s.residentLoop, selected, s) : s.residentLoop != null) return false;
      if (this.roleRoutines ? !this.roleRoutines.validate(s.roleRoutines, s) : s.roleRoutines != null) return false;
      const stateDay = Math.floor(savedAbsoluteHour / 24);
      for (const [i, state] of s.agents.entries()) {
        const authored = this.agents[i];
        const loopResident = this.residentLoop?.owns(authored) || this.roleRoutines?.owns(authored);
        if (PRODUCTS.some(p => state.purchased[p] > stateDay)) return false;
        if (!loopResident && state.insideBuildingId && (state.insideBuildingId !== authored.home.buildingId || state.floorId !== 'lobby' || state.roomId !== this._homePath(authored).roomId || !['resting', 'entering-home', 'leaving-home'].includes(state.phase))) return false;
        if (!loopResident && !state.insideBuildingId && !['riding', 'boarding', 'alighting'].includes(state.phase) && !this.navigation.clear(state)) return false;
        if (!loopResident && state.phase === 'working' && distance(state, authored.work.anchor) > .4) return false;
        if (state.goal && !loopResident) {
          const g = state.goal;
          if (!g.anchor || ![g.anchor.x, g.anchor.y, g.anchor.z].every(Number.isFinite)) return false;
          if (g.kind === 'home' && (g.id !== authored.home.buildingId || distance(g.anchor, authored.home.anchor) > .01)) return false;
          if (g.kind === 'work' && (g.id !== authored.work.employer || distance(g.anchor, authored.work.anchor) > .01)) return false;
          if (g.kind === 'shop' && !this.shops.some(shop => shop.id === g.id && distance(g.anchor, shop.anchor) <= 3.6)) return false;
          if (['pickup', 'deliver'].includes(g.kind) && !s.jobs.some(j => j.id === g.id && (g.kind === 'pickup' ? distance(g.anchor, this.supply.anchor) < .01 : j.status === 'picked-up' && j.carrierId === state.id && distance(g.anchor, this.shops.find(shop => shop.id === j.shopId).anchor) < .01))) return false;
        }
        if (state.transit) {
          const j = state.transit;
          if (!this.transport || !['approach', 'waiting', 'boarding', 'riding', 'alighting'].includes(j.phase) || !this.transport.stop(j.originStopId) || !this.transport.stop(j.destinationStopId)) return false;
          if (['boarding', 'riding', 'alighting'].includes(j.phase) && (!j.ticket || !this.transport.vehicles.some(v => v.id === j.ticket.vehicleId) || state.phase !== j.phase)) return false;
        }
      }
      if (s.player.activeJobId && !s.jobs.some(j => j.id === s.player.activeJobId && j.carrierId === 'player' && j.status === 'picked-up')) return false;
      if (s.agents.some(a => a.cargoJobId && !s.jobs.some(j => j.id === a.cargoJobId && j.carrierId === a.id && j.status === 'picked-up'))) return false;
      if (!s.statistics || Object.keys(this.statistics).some(k => !integer(s.statistics[k])) || s.statistics.playerPurchases !== s.player.purchaseRequests.length || PRODUCTS.some(p => !integer(s.consumedByProduct?.[p], 100))) return false;
      if (PRODUCTS.reduce((n, p) => n + s.consumedByProduct[p], 0) !== s.statistics.consumed || s.statistics.consumed + s.statistics.playerPurchases !== s.statistics.purchases || s.player.completed > s.statistics.deliveries) return false;
      if (s.shops.reduce((n, shop) => n + shop.sold, 0) !== s.statistics.purchases || s.shops.some(shop => shop.stock + shop.sold - shop.received !== 4)) return false;
      for (const product of PRODUCTS) {
        const units = s.supply.stock[product] + s.shops.filter(shop => this.shops.find(def => def.id === shop.id).product === product).reduce((n, shop) => n + shop.stock, 0)
          + s.jobs.filter(j => j.product === product && j.status === 'picked-up').reduce((n, j) => n + j.quantity, 0) + s.consumedByProduct[product] + s.player.inventory[product];
        if (units !== 100) return false;
      }
      const money = s.supply.money + s.shops.reduce((n, a) => n + a.money, 0) + s.agents.reduce((n, a) => n + a.money, 0) + s.player.earnedCash - s.player.spentCash + s.jobs.reduce((n, j) => n + j.escrow, 0);
      const goods = PRODUCTS.reduce((n, p) => n + s.supply.stock[p], 0) + s.shops.reduce((n, a) => n + a.stock, 0) + s.jobs.reduce((n, j) => n + (j.status === 'picked-up' ? j.quantity : 0), 0) + s.statistics.consumed + PRODUCTS.reduce((n, p) => n + s.player.inventory[p], 0);
      if (money !== this.initialMoney || goods !== this.initialGoods) return false;
      if (!Array.isArray(s.transactions) || s.transactions.length > 96 || new Set(s.transactions.map(t => t.id)).size !== s.transactions.length || s.transactions.some(t => !/^harbor-tx-\d+$/.test(t.id) || !integer(t.tick) || !integer(t.amount))) return false;
      Object.assign(this, { startHour: s.startHour, clock: s.clock, externalHour: s.externalHour ?? null, ticks: s.ticks, accumulator: s.accumulator, revision: s.revision, serial: s.serial, orderSerial: s.orderSerial, player: s.player, statistics: s.statistics, consumedByProduct: s.consumedByProduct, jobs: s.jobs, transactions: s.transactions });
      Object.assign(this.supply, s.supply); s.shops.forEach((a, i) => Object.assign(this.shops[i], a)); s.agents.forEach((a, i) => Object.assign(this.agents[i], a));
      this.residentLoop?.restoreValidated(s.residentLoop);
      this.roleRoutines?.restoreValidated(s.roleRoutines);
      // An external fleet restore must rehydrate tickets before the next tick.
      // If that service cannot restore them, a saved passenger resumes on the
      // actual origin platform rather than retaining an orphan vehicle token.
      for (const agent of this.agents) if (agent.transit?.phase === 'riding' && !this.transport?.citizenPose(agent.id)) {
        const stop = this.transport?.stop?.(agent.transit.originStopId);
        if (stop) Object.assign(agent, point(stop.board || stop.entrance));
        agent.transit.phase = 'waiting'; agent.transit.ticket = null; agent.phase = 'waiting-transit';
      }
      return true;
    } catch { return false; }
  }
  dispose() { for (const a of this.agents) this.transport?.releaseCitizen?.(a.id); this.homePaths.clear(); }
}
export function createHarborLife(options) { return new HarborLife(options); }

/** Collision-checked alley and pavement graph for the actual old-quarter
 * blocks. Road edges exist only at explicit crossing lanes, which are exported
 * for the renderer and traffic controller to share. */
export function createHarborLifeNavigation(colliders = [], { radius = .43 } = {}) {
  const index = new SpatialIndex(colliders.filter(c => c.physics !== false && c.minY < 1.9 && c.maxY > .25));
  const nodes = [], lookup = new Map(), crossings = [], crossingMap = new Map(), cache = new Map();
  const vertical = [94, 146, 174, 226, 254];
  const horizontal = [-214, -174, -146, -94, -66, -14, 14, 66, 94, 146, 174, 226];
  const roads = [-160, -80, 0, 80, 160, 240];
  const clear = p => !index.query({ ...p, hx: radius, hz: radius }).some(c => circleOBB({ ...p, radius }, c));
  const clearSegment = (a, b) => { const count = Math.max(1, Math.ceil(distance(a, b) / .4)); for (let i = 0; i <= count; i++) if (!clear({ x: a.x + (b.x - a.x) * i / count, z: a.z + (b.z - a.z) * i / count })) return false; return true; };
  const close = (v, choices) => choices.some(c => Math.abs(v - c) <= 2.01);
  const alley = (x, z) => [120, 200].some(cx => [120, 200].some(cz => Math.abs(x - cx) <= 26 && Math.abs(z - cz) <= 26 && (Math.abs(x - cx) <= 2 || Math.abs(z - cz) <= 2)));
  const allowed = (x, z) => close(x, vertical) || close(z, horizontal) || alley(x, z);
  for (let z = -214; z <= 230; z += 2) for (let x = 92; x <= 256; x += 2) if (allowed(x, z) && clear({ x, z })) {
    const node = { x, z, id: nodes.length, edges: [] }; nodes.push(node); lookup.set(`${x},${z}`, node);
  }
  const crossingFor = (a, b) => {
    const axis = a.x === b.x ? 'z' : 'x', along = axis === 'x' ? (a.x + b.x) / 2 : (a.z + b.z) / 2, lane = axis === 'x' ? a.z : a.x;
    const road = roads.find(r => Math.abs(along - r) < 13);
    if (road === undefined) return null;
    const choices = axis === 'x' ? horizontal : vertical, centre = choices.reduce((p, c) => Math.abs(c - lane) < Math.abs(p - lane) ? c : p);
    if (Math.abs(centre - lane) > 2.01) return false;
    const key = `${axis}:${road}:${centre}`;
    if (!crossingMap.has(key)) {
      const perpendicular = Math.round(centre / 80) * 80;
      const c = { id: `harbor-crossing-${key}`, axis, lane: centre, x: axis === 'x' ? road : perpendicular, z: axis === 'z' ? road : perpendicular, road, width: 26 };
      crossingMap.set(key, c); crossings.push(c);
    }
    return crossingMap.get(key).id;
  };
  for (const a of nodes) for (const [dx, dz] of [[2, 0], [0, 2]]) {
    const b = lookup.get(`${a.x + dx},${a.z + dz}`); if (!b || !clearSegment(a, b)) continue;
    const crossingId = crossingFor(a, b); if (crossingId === false) continue;
    a.edges.push({ to: b.id, crossingId }); b.edges.push({ to: a.id, crossingId });
  }
  const connect = p => nodes.filter(n => distance(n, p) < 9 && clearSegment(p, n)).sort((a, b) => distance(a, p) - distance(b, p)).slice(0, 10);
  const route = (from, to) => {
    if (distance(from, to) < .02) return [];
    const key = `${from.x.toFixed(2)},${from.z.toFixed(2)}>${to.x.toFixed(2)},${to.z.toFixed(2)}`;
    if (cache.has(key)) return copy(cache.get(key));
    const starts = connect(from), ends = new Map(connect(to).map(n => [n.id, n])); if (!starts.length || !ends.size) return null;
    const frontier = [], costs = new Map(), prior = new Map();
    for (const n of starts) { costs.set(n.id, distance(from, n)); frontier.push(n.id); }
    let end = null;
    while (frontier.length) {
      let selected = 0, score = Infinity;
      for (let i = 0; i < frontier.length; i++) { const n = nodes[frontier[i]], candidate = costs.get(n.id) + distance(n, to); if (candidate < score) { score = candidate; selected = i; } }
      const id = frontier.splice(selected, 1)[0]; if (ends.has(id)) { end = id; break; }
      for (const edge of nodes[id].edges) {
        const cost = costs.get(id) + 2;
        if (cost >= (costs.get(edge.to) ?? Infinity)) continue;
        costs.set(edge.to, cost); prior.set(edge.to, { from: id, crossingId: edge.crossingId }); if (!frontier.includes(edge.to)) frontier.push(edge.to);
      }
    }
    if (end === null) return null;
    const path = []; let id = end;
    while (prior.has(id)) { const edge = prior.get(id); path.push({ ...point(nodes[id]), crossingId: edge.crossingId }); id = edge.from; }
    path.push(point(nodes[id])); path.reverse(); path.push(point(to));
    const compressed = [];
    for (const p of path) {
      const b = compressed.at(-1), a = compressed.at(-2);
      if (a && b && a.crossingId === b.crossingId && b.crossingId === p.crossingId &&
        Math.abs((b.x - a.x) * (p.z - b.z) - (b.z - a.z) * (p.x - b.x)) < 1e-7 && (b.x - a.x) * (p.x - b.x) + (b.z - a.z) * (p.z - b.z) >= 0) compressed[compressed.length - 1] = p;
      else compressed.push(p);
    }
    if (cache.size > 256) cache.delete(cache.keys().next().value); cache.set(key, compressed); return copy(compressed);
  };
  return { nodes, crossings, clear, clearSegment, route, snapshot: () => ({ nodes: nodes.length, crossings: crossings.length, cachedRoutes: cache.size }) };
}
