import { HARBOR_SHOP_DEFS } from './harbor-shop-defs.js';

export const ROOM_ECONOMY_SCHEMA = 'neon-harbor/room-economy';
export const ROOM_ECONOMY_VERSION = 1;
const PRODUCTS = ['produce', 'tea', 'meal'];
const copy = value => JSON.parse(JSON.stringify(value));
const integer = (value, max = 1e9) => Number.isSafeInteger(value) && value >= 0 && value <= max;
const validRequestId = value => typeof value === 'string' && /^[a-zA-Z0-9:_-]{1,80}$/.test(value);
// Anchors are exported as protocol data so a room service can validate an
// operation against the same authored harbour frontages without loading the
// renderer or trusting a client supplied target position.
export const ROOM_ECONOMY_ANCHORS = Object.freeze({
  'harbor-produce': Object.freeze({ x: 225.3, z: 187 }),
  'harbor-tea': Object.freeze({ x: 225.3, z: 133 }),
  'harbor-noodles': Object.freeze({ x: 187, z: 146.4 }),
  'harbor-supply': Object.freeze({ x: 193.5, z: 120.2 }),
});
const nearAnchor = (position, anchor, radius = 8) => position && Number.isFinite(position.x) && Number.isFinite(position.z) &&
  Math.hypot(position.x - anchor.x, position.z - anchor.z) <= radius;

/**
 * The small room ledger deliberately owns only state that can be shared over
 * the existing JSON/SSE protocol. Resident movement and wages remain a
 * presentation simulation on each client; shops, finite stock, deliveries,
 * player wallets and inventories are single-writer room state here.
 */
export class MultiplayerEconomy {
  constructor({ hour = 16.5, playerCash = 1200 } = {}) {
    this.hour = Number.isFinite(hour) ? ((hour % 24) + 24) % 24 : 16.5;
    this.revision = 0; this.serial = 0; this.orderSerial = 0;
    this.supply = { id: 'harbor-supply', money: 900, stock: Object.fromEntries(PRODUCTS.map(product => [product, 96])) };
    this.shops = HARBOR_SHOP_DEFS.map(def => ({ ...def, money: 260, stock: 4, sold: 0, received: 0 }));
    this.jobs = []; this.transactions = []; this.players = new Map();
    this.playerCash = integer(playerCash, 9999999) ? playerCash : 1200;
  }
  _record(type, fields = {}) {
    const transaction = { id: `room-tx-${++this.serial}`, type, revision: ++this.revision, hour: this.hour, ...fields };
    this.transactions.push(transaction); if (this.transactions.length > 96) this.transactions.shift();
    return transaction;
  }
  _player(id) {
    let player = this.players.get(id);
    if (!player) {
      player = { cash: this.playerCash, inventory: Object.fromEntries(PRODUCTS.map(product => [product, 0])), activeJobId: null,
        earnedCash: 0, spentCash: 0, requests: [] };
      this.players.set(id, player);
    }
    return player;
  }
  _orders() {
    for (const shop of this.shops) {
      if (shop.stock > 3 || this.jobs.some(job => job.shopId === shop.id && ['available', 'picked-up'].includes(job.status))) continue;
      const quantity = Math.min(8, this.supply.stock[shop.product]);
      if (!quantity || shop.money < quantity * shop.wholesale + 12) continue;
      this.jobs.push({ id: `room-order-${++this.orderSerial}`, shopId: shop.id, product: shop.product, quantity,
        wholesale: quantity * shop.wholesale, reward: 12, status: 'available', carrierId: null, escrow: 0,
        createdRevision: this.revision, pickedRevision: null, deliveredRevision: null });
      this.revision++;
    }
    const finished = this.jobs.filter(job => job.status === 'delivered');
    if (finished.length > 12) {
      const remove = new Set(finished.slice(0, finished.length - 12).map(job => job.id));
      this.jobs = this.jobs.filter(job => !remove.has(job.id));
    }
  }
  setHour(hour) { if (Number.isFinite(hour)) this.hour = ((hour % 24) + 24) % 24; }
  join(playerId) { this._player(playerId); return this.snapshot(playerId); }
  leave(playerId) { this.players.delete(playerId); }
  snapshot(playerId) {
    const player = this._player(playerId);
    return { schema: ROOM_ECONOMY_SCHEMA, version: ROOM_ECONOMY_VERSION, revision: this.revision, hour: this.hour,
      supply: copy(this.supply), shops: copy(this.shops), jobs: copy(this.jobs),
      transactions: copy(this.transactions), player: copy(player), players: [...this.players.keys()] };
  }
  _result(success, reason, message, extra = {}) { return { handled: true, success, reason, message, cashDelta: 0, ...extra }; }
  action(playerId, input = {}) {
    const player = this._player(playerId), type = input.type;
    if (input.scene && input.scene !== 'outdoor') return this._result(false, 'not-outdoor', '请在街区柜台或货栈处理房间经济。');
    if (type === 'purchase') {
      const shop = this.shops.find(candidate => candidate.id === input.shopId);
      const requestId = input.requestId;
      if (!shop) return this._result(false, 'unknown-shop', '这间店不在港湾账本内。');
      if (!nearAnchor(input.position, ROOM_ECONOMY_ANCHORS[shop.id])) return this._result(false, 'not-at-shop', '请到实际柜台购买。');
      if (!validRequestId(requestId)) return this._result(false, 'invalid-request', '无法处理这一笔购买。');
      const previous = player.requests.find(request => request.id === requestId);
      if (previous) return this._result(false, 'already-purchased', '这一笔购买已经处理。', { transactionId: previous.transactionId });
      if (this.hour < 6 || this.hour >= 21) return this._result(false, 'closed', `${shop.name}尚未营业。`);
      if (!shop.stock) return this._result(false, 'out-of-stock', `${shop.productName}已售罄，正在等实际补货。`);
      if (player.cash < shop.price) return this._result(false, 'insufficient-cash', `购买一份需要 $${shop.price}。`);
      player.cash -= shop.price; player.spentCash += shop.price; player.inventory[shop.product]++;
      shop.stock--; shop.sold++; shop.money += shop.price;
      const transaction = this._record('player-purchase', { playerId, shopId: shop.id, amount: shop.price, product: shop.product, requestId });
      player.requests.push({ id: requestId, transactionId: transaction.id, shopId: shop.id, product: shop.product, price: shop.price });
      this._orders();
      return this._result(true, null, `买到一份${shop.productName} · -$${shop.price} · 店铺余货 ${shop.stock}。`, { type: 'purchase', cashDelta: -shop.price, transactionId: transaction.id, requestId, product: shop.product });
    }
    if (type === 'delivery-accept') {
      if (player.activeJobId) return this._result(false, 'active-delivery', '先送完手里的货，再领取下一单。');
      if (!nearAnchor(input.position, ROOM_ECONOMY_ANCHORS['harbor-supply'], 15)) return this._result(false, 'not-at-supply', '请到芦岸货栈实际领取货物。');
      const job = this.jobs.find(candidate => candidate.id === input.jobId && candidate.status === 'available');
      if (!job) return this._result(false, 'unavailable', '这一单已经领取，或库存与资金不足。');
      const shop = this.shops.find(candidate => candidate.id === job.shopId);
      if (!shop || this.supply.stock[job.product] < job.quantity || shop.money < job.wholesale + job.reward) return this._result(false, 'unavailable', '这一单暂时没有足够库存或资金。');
      shop.money -= job.wholesale + job.reward; this.supply.money += job.wholesale; this.supply.stock[job.product] -= job.quantity;
      Object.assign(job, { status: 'picked-up', carrierId: playerId, escrow: job.reward, pickedRevision: ++this.revision }); player.activeJobId = job.id;
      this._record('pickup', { playerId, jobId: job.id, shopId: shop.id, amount: job.wholesale, quantity: job.quantity, product: job.product, escrow: job.reward });
      return this._result(true, null, `已领${job.quantity}份${shop.productName}，送到${shop.name}。`, { type: 'delivery-pickup', jobId: job.id });
    }
    if (type === 'delivery-complete') {
      const job = this.jobs.find(candidate => candidate.id === player.activeJobId && candidate.status === 'picked-up' && candidate.carrierId === playerId);
      if (!job) return this._result(false, 'no-delivery', '手里没有待交付的货物。');
      const shop = this.shops.find(candidate => candidate.id === job.shopId); if (!shop) return this._result(false, 'invalid-job', '这张配送单已失效。');
      if (!nearAnchor(input.position, ROOM_ECONOMY_ANCHORS[shop.id])) return this._result(false, 'not-at-recipient', `请到${shop.name}柜台交货。`);
      shop.stock += job.quantity; shop.received += job.quantity; player.cash += job.escrow; player.earnedCash += job.escrow;
      const reward = job.escrow; Object.assign(job, { status: 'delivered', escrow: 0, deliveredRevision: ++this.revision }); player.activeJobId = null;
      this._record('delivery', { playerId, jobId: job.id, shopId: shop.id, amount: reward, quantity: job.quantity, product: job.product });
      return this._result(true, null, `${shop.name}收到${job.quantity}份货物 · 运费 +$${reward} · 实际库存 ${shop.stock}。`, { type: 'delivery-complete', cashDelta: reward, jobId: job.id });
    }
    return this._result(false, 'unknown-action', '房间经济不支持这一项操作。');
  }
}
