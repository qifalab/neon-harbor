import { circleOBB } from './collision.js';
import { createInteriorLayout } from './metropolis-interiors.js';
import { calendarHour } from './harbor-world-clock.js';

export const HARBOR_ROLE_ROUTINES = Object.freeze({ version: 1, radius: .43, serviceTicks: 20,
  residents: Object.freeze(['harbor-resident-01', 'harbor-resident-11']) });
const clone = value => JSON.parse(JSON.stringify(value));
const point = (value, y = value.y ?? .18) => ({ x: value.x, y, z: value.z });
const gap = (a, b) => Math.hypot(a.x - b.x, a.z - b.z, (a.y ?? .18) - (b.y ?? .18));
const integer = (value, max = 1e10) => Number.isSafeInteger(value) && value >= 0 && value <= max;
const stages = new Set(['to-home', 'entering-home', 'resting-home', 'leaving-home', 'to-counter',
  'working-counter', 'to-supply', 'waiting-order', 'loading', 'to-recipient', 'unloading', 'route-blocked', 'legacy-transit', 'legacy-adoption', 'legacy-foot-step']);

/** Two existing identities continue their actual jobs. The fruit clerk works
 * at the existing frontage; the courier carries the existing finite orders.
 * Furnished bedrooms, streets, cash and stock retain their original owners. */
export class HarborRoleRoutines {
  constructor(life, navigation) {
    this.life = life; this.navigation = navigation;
    this.homes = new Map(HARBOR_ROLE_ROUTINES.residents.map(id => [id, this._home(this.agent(id))]));
    this.contacts = new Map([life.supply, ...life.shops].map(resource => {
      const slots = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([x, z]) => [1, 2].map(n =>
        ({ ...point(resource.anchor), x: resource.anchor.x + x * 1.1 * n, z: resource.anchor.z + z * 1.1 * n })))
        .find(slots => slots.every(slot => navigation.clearSegment(resource.anchor, slot)));
      if (!slots) throw new Error(`No two clear physical delivery waiting places: ${resource.id}`);
      return [resource.id, slots];
    }));
    this.periodTicks = Math.max(1, Math.round(life.secondsPerHour * 10));
    this.state = this._fresh(life.ticks);
    for (const id of HARBOR_ROLE_ROUTINES.residents) this._adopt(this.agent(id), this.role(id));
  }
  agent(id) { return this.life.agents.find(agent => agent.id === id); }
  owns(agent) { return HARBOR_ROLE_ROUTINES.residents.includes(agent?.id); }
  role(id) { return this.state.roles.find(role => role.residentId === id); }
  resource(id) { return id === this.life.supply.id ? this.life.supply : this.life.shops.find(shop => shop.id === id); }
  _fresh(tick) { return { version: HARBOR_ROLE_ROUTINES.version, queues: [this.life.supply, ...this.life.shops]
    .map(resource => ({ id: resource.id, owner: null, claimedTick: null, waiting: [], departing: [] })),
    roles: HARBOR_ROLE_ROUTINES.residents.map(residentId => ({ residentId, initializedTick: tick, ticks: tick,
      stage: 'to-home', routeStage: null, waitingReason: null, serviceTicks: 0, workTicks: 0,
      paidPeriods: 0, totalWages: 0, deliveries: 0, deliveryIncome: 0, completedDays: 0,
      departureDay: null, reservedJobId: null, jobId: null, eventSerial: 0, events: [], wageReceipts: [], deliveryReceipts: [] })) }; }
  _home(agent) {
    const building = this.life.buildings.find(building => building.id === agent.home.buildingId);
    const floor = building?.floors.find(floor => floor.id === 'lobby');
    const layout = floor && createInteriorLayout(building, floor), room = layout?.rooms.find(room => room.type === 'bedroom');
    const bed = layout?.parts.find(part => part.roomId === room?.id && part.kind === 'bed');
    if (!bed) throw new Error(`Daily role has no actual bedroom furniture: ${agent.id}`);
    const anchor = { x: bed.x + bed.sx / 2 + HARBOR_ROLE_ROUTINES.radius + .12, z: room.arrival.z, y: floor.y };
    const slab = layout.parts.find(part => part.kind === 'floor' && Math.abs(part.y + part.sy / 2 - floor.y) < 1e-8);
    if (!slab) throw new Error(`Daily role lobby has no real support slab: ${agent.id}`);
    const front = slab.z + slab.sz / 2;
    const path = [point(building.entrance), point(building.entryPortal || building.entrance),
      { x: building.x, y: building.entrance.y, z: front + .02 },
      { x: building.x, y: floor.y, z: front - .02 }, point(layout.entrance, floor.y),
      { x: building.x, z: room.arrival.z, y: floor.y }, point(room.entrance, floor.y), point(room.arrival, floor.y), anchor];
    const colliders = layout.colliders.filter(body => body.physics !== false && body.minY < floor.y + 1.8 && body.maxY > floor.y + .05);
    const groundYAt = pose => Math.abs(pose.x - slab.x) <= slab.sx / 2 && Math.abs(pose.z - slab.z) <= slab.sz / 2 ? floor.y : building.entrance.y;
    const supported = pose => {
      if (!Number.isFinite(pose.y)) return false;
      const inSlab = Math.abs(pose.x - slab.x) <= slab.sx / 2 && Math.abs(pose.z - slab.z) <= slab.sz / 2;
      // The authored lobby is a 35 mm curb above the exterior pavement.
      // Only its 40 mm doorway transition admits an intermediate foot height.
      const curb = Math.abs(pose.x - building.x) <= .6 && Math.abs(pose.z - front) <= .020001;
      const pavement = building.entrance.y;
      return curb ? pose.y >= Math.min(pavement, floor.y) - 1e-6 && pose.y <= Math.max(pavement, floor.y) + 1e-6
        : Math.abs(pose.y - (inSlab ? floor.y : pavement)) < 1e-6;
    };
    const clear = pose => supported(pose) && !colliders.some(body => circleOBB({ ...pose, radius: HARBOR_ROLE_ROUTINES.radius }, body));
    const clearSegment = (a, b) => {
      const count = Math.max(1, Math.ceil(gap(a, b) / .02));
      for (let index = 0; index <= count; index++) {
        const t = index / count;
        if (!clear({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t })) return false;
      }
      return true;
    };
    if (path.some((pose, index) => index && !clearSegment(path[index - 1], pose)))
      throw new Error(`Daily role bedroom route blocked by real furniture: ${agent.id}`);
    return { building, floor, layout, room, anchor, path, colliders, groundYAt, supported, clear, clearSegment };
  }
  _context(agent, role) {
    const home = this.homes.get(agent.id), homeStage = ['entering-home', 'resting-home', 'leaving-home'].includes(role.stage);
    const inside = homeStage && Math.abs(agent.x - home.building.x) < (home.building.width - .7) / 2 &&
      Math.abs(agent.z - home.building.z) < (home.building.depth - .7) / 2;
    agent.insideBuildingId = inside ? home.building.id : null; agent.floorId = inside ? home.floor.id : null;
    agent.roomId = inside ? home.layout.rooms.find(room => agent.x >= room.bounds.minX && agent.x <= room.bounds.maxX &&
      agent.z >= room.bounds.minZ && agent.z <= room.bounds.maxZ)?.id || null : null;
  }
  _path(agent, role, path, stage, phase = 'walking') {
    agent.path = clone(path); agent.pathIndex = 0; agent.crossingId = null; agent.phase = phase;
    role.stage = stage; role.routeStage = null; role.waitingReason = null;
  }
  _street(agent, role, destination, stage) {
    if (['pickup', 'deliver'].includes(agent.goal?.kind)) destination = this.contactDestination(agent) || destination;
    const path = this.navigation.route(agent, destination);
    if (!path) { role.stage = 'route-blocked'; role.routeStage = stage; role.waitingReason = 'route-blocked';
      agent.path = []; agent.pathIndex = 0; agent.phase = 'route-blocked'; agent.activity = '等真实通路恢复'; return; }
    this._path(agent, role, path, stage); if (!path.length) this.arrive(agent, role);
  }
  _adopt(agent, role) {
    if (agent.transit) { role.stage = 'legacy-transit'; return; }
    if (agent.cargoJobId) {
      const job = this.life.jobs.find(job => job.id === agent.cargoJobId);
      role.jobId = job?.id || null;
      if (job) { agent.goal = { kind: 'deliver', id: job.id, anchor: point(this.resource(job.shopId).anchor) };
        this._street(agent, role, agent.goal.anchor, 'to-recipient'); return; }
    }
    this._goHome(agent, role);
  }
  _goHome(agent, role) {
    const reservation = this.life.jobs.find(job => job.id === role.reservedJobId);
    if (reservation?.status === 'available' && reservation.carrierId === agent.id) reservation.carrierId = null;
    role.reservedJobId = null;
    const home = this.homes.get(agent.id);
    agent.goal = { kind: 'home', id: home.building.id, anchor: point(home.building.entrance) };
    if (agent.insideBuildingId === home.building.id) {
      let join = -1;
      for (let index = home.path.length - 1; index >= 0; index--) if (home.clearSegment(agent, home.path[index])) { join = index; break; }
      if (join < 0) throw new Error(`Saved daily role cannot walk to its own bedroom: ${agent.id}`);
      this._path(agent, role, [point(agent), ...home.path.slice(join)], 'entering-home', 'entering-home');
    } else this._street(agent, role, home.building.entrance, 'to-home');
    agent.activity = '沿原通路走回自己的卧室';
  }
  _event(role, type, fields = {}) {
    role.events.push({ sequence: ++role.eventSerial, tick: this.life.ticks, hour: this.life.absoluteHour, type, ...fields });
    if (role.events.length > 32) role.events.shift(); this.life.revision++;
  }
  _reserveOrder(agent, role) {
    const reserved = this.life.jobs.find(job => job.id === role.reservedJobId && job.status === 'available' &&
      job.carrierId === agent.id && this.life._canPickup(job));
    if (reserved) return reserved;
    role.reservedJobId = null;
    const job = this.life.jobs.find(job => job.status === 'available' && !job.carrierId &&
      this.life.time - job.createdTick * .1 >= 75 && this.life._canPickup(job));
    if (job) { job.carrierId = agent.id; role.reservedJobId = job.id;
      this._event(role, 'reserved-funded-order', { jobId: job.id }); }
    return job;
  }
  _depart(agent, role) {
    role.departureDay = this.life.day;
    this._event(role, 'depart-home', { day: this.life.day, buildingId: agent.home.buildingId });
    this._path(agent, role, [...this.homes.get(agent.id).path].reverse(), 'leaving-home', 'leaving-home');
    agent.activity = agent.index === 0 ? '出门去果铺柜台' : '出门去货栈领取实际货单';
  }
  participates(agent) { return agent?.index === 10 || agent?.index === 11; }
  contactResource(agent) {
    if (!this.participates(agent)) return null;
    if (agent.goal?.kind === 'pickup') return this.life.supply;
    if (agent.goal?.kind === 'deliver') return this.resource(this.life.jobs.find(job => job.id === agent.goal.id)?.shopId);
    return null;
  }
  contactDestination(agent) {
    const resource = this.contactResource(agent); if (!resource) return null;
    const queue = this.state.queues.find(queue => queue.id === resource.id);
    if (queue.owner === agent.id) return point(resource.anchor);
    if (!queue.waiting.includes(agent.id)) queue.waiting.push(agent.id);
    const vacant = !this.life.agents.some(other => other.id !== agent.id && this.participates(other) && gap(other, resource.anchor) < .9);
    if (!queue.owner && queue.waiting[0] === agent.id && vacant && !queue.departing.some(id => id !== agent.id)) return point(resource.anchor);
    return clone(this.contacts.get(resource.id)[agent.index - 10]);
  }
  refreshContactRoute(agent) {
    if (agent.transit) return false; // A real ride and platform approach must finish before service routing.
    const destination = this.contactDestination(agent); if (!destination) return false;
    if (gap(agent, destination) <= .01) { agent.path = []; agent.pathIndex = 0; return false; }
    const end = agent.path.at(-1);
    if (!end || gap(end, destination) > .01) {
      const path = this.navigation.clearSegment(agent, destination) && gap(agent, destination) < 4
        ? [destination] : this.navigation.route(agent, destination);
      if (!path) { agent.phase = 'route-blocked'; agent.activity = '等待实际柜台通路'; return false; }
      agent.path = clone(path); agent.pathIndex = 0; agent.phase = 'walking';
    }
    return agent.pathIndex < agent.path.length;
  }
  contactStepClear(agent, next) {
    if (!this.participates(agent)) return true;
    return this.life.agents.filter(other => other.id !== agent.id && this.participates(other)).every(other => {
      const closeContact = [this.life.supply, ...this.life.shops].some(resource => gap(agent, resource.anchor) < 3.4 && gap(other, resource.anchor) < 3.4);
      return !closeContact || gap(next, other) >= HARBOR_ROLE_ROUTINES.radius * 2 || gap(next, other) > gap(agent, other) + 1e-8;
    });
  }
  contactPavementSegment(from, to) {
    const groundHeightAt = this.life.transport?.streetGroundHeightAt;
    if (typeof groundHeightAt !== 'function' || [from, to].some(pose => !Number.isFinite(pose.y) || Math.abs(pose.y - .18) > 1e-6) ||
      !this.navigation.clearSegment(from, to)) return false;
    // Local service bypasses have no crossing admission. Reject the entire
    // road strip even when its endpoints have a collider-free path.
    if (this.navigation.crossings.some(crossing => Math.min(from[crossing.axis], to[crossing.axis]) <= crossing.road + crossing.width / 2 &&
      Math.max(from[crossing.axis], to[crossing.axis]) >= crossing.road - crossing.width / 2)) return false;
    const count = Math.max(1, Math.ceil(gap(from, to) / .02));
    for (let i = 0; i <= count; i++) {
      const t = i / count, x = from.x + (to.x - from.x) * t, z = from.z + (to.z - from.z) * t;
      const ground = groundHeightAt.call(this.life.transport, x, z, .18);
      // Unlike an authored indoor curb, an outdoor detour keeps the same
      // pavement height. A missing query or a slope cannot move the feet.
      if (!Number.isFinite(ground) || Math.abs(.18 - ground) > .003) return false;
    }
    return true;
  }
  contactBypass(agent, target) {
    const following = agent.path[agent.pathIndex + 1], resource = this.contactResource(agent);
    if (!resource || !following || agent.insideBuildingId || agent.transit || agent.crossingId || target.crossingId || following.crossingId ||
      [agent, target, following].some(pose => Math.abs(pose.y - .18) > 1e-6 || gap(pose, resource.anchor) >= 3.4) ||
      !this.contactPavementSegment(agent, following)) return false;
    // Only remove a redundant pavement point. Never shortcut a road leg,
    // an elevation change or a crossing admission retained by the walker.
    const dx = following.x - agent.x, dz = following.z - agent.z, length2 = dx * dx + dz * dz;
    return this.life.agents.filter(other => other.id !== agent.id && this.participates(other)).every(other => {
      const t = length2 ? Math.max(0, Math.min(1, ((other.x - agent.x) * dx + (other.z - agent.z) * dz) / length2)) : 0;
      return gap({ x: agent.x + dx * t, y: .18, z: agent.z + dz * t }, other) >= HARBOR_ROLE_ROUTINES.radius * 2;
    });
  }
  contactDetour(agent, target) {
    if (agent.insideBuildingId || agent.transit || agent.crossingId || target.crossingId ||
      Math.abs(agent.y - .18) > 1e-6 || Math.abs(target.y - .18) > 1e-6) return null;
    const peers = this.life.agents.filter(other => other.id !== agent.id && this.participates(other) &&
      [this.life.supply, ...this.life.shops].some(resource => gap(agent, resource.anchor) < 3.4 && gap(other, resource.anchor) < 3.4));
    if (!peers.length || gap(agent, target) > 6 || agent.path.length > 96 || target.contactDetour) return null;
    const clear = (from, to) => {
      if (!this.contactPavementSegment(from, to)) return false;
      const count = Math.max(1, Math.ceil(gap(from, to) / .04));
      for (let i = 0; i <= count; i++) { const t = i / count;
        const p = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, z: from.z + (to.z - from.z) * t };
        if (peers.some(other => gap(p, other) < HARBOR_ROLE_ROUTINES.radius * 2)) return false;
      }
      return true;
    };
    for (const [x, z] of [[0, -1.1], [0, 1.1], [-1.1, 0], [1.1, 0]]) {
      const route = [{ ...point(agent), x: agent.x + x, z: agent.z + z },
        { ...point(target), x: target.x + x, z: target.z + z }, point(target)].map(pose => ({ ...pose, contactDetour: true }));
      if (route.every((pose, i) => clear(i ? route[i - 1] : agent, pose))) return route;
    }
    return null;
  }
  claim(resourceId, agentId) {
    const queue = this.state.queues.find(queue => queue.id === resourceId);
    if (!queue) return false;
    const agent = this.agent(agentId), resource = this.resource(resourceId);
    if (!agent || gap(agent, resource.anchor) > .05 || !this.navigation.clear(agent)) return false;
    if (queue.owner === agentId) return true;
    if (!queue.waiting.includes(agentId)) queue.waiting.push(agentId);
    if (queue.owner || queue.waiting[0] !== agentId || queue.departing.some(id => id !== agentId) || this.life.agents.some(other => other.id !== agentId &&
      this.participates(other) && gap(other, resource.anchor) < HARBOR_ROLE_ROUTINES.radius * 2)) return false;
    queue.waiting.shift(); queue.owner = agentId; queue.claimedTick = this.life.ticks; this.life.revision++; return true;
  }
  release(resourceId, agentId, { completed = false } = {}) {
    const queue = this.state.queues.find(queue => queue.id === resourceId);
    if (!queue) return;
    queue.waiting = queue.waiting.filter(id => id !== agentId);
    if (queue.owner === agentId) { queue.owner = null; queue.claimedTick = null;
      if (completed && !queue.departing.includes(agentId)) queue.departing.push(agentId); this.life.revision++; }
  }
  pruneQueues() {
    for (const queue of this.state.queues) {
      queue.departing = queue.departing.filter(id => { const agent = this.agent(id);
        return agent && gap(agent, this.resource(queue.id).anchor) < 3.4; });
      queue.waiting = queue.waiting.filter(id => {
      const agent = this.agent(id), goal = agent?.goal;
      return agent && this.participates(agent) && (queue.id === this.life.supply.id
        ? goal?.kind === 'pickup' : goal?.kind === 'shop' && goal.id === queue.id || goal?.kind === 'deliver' &&
          this.life.jobs.find(job => job.id === goal.id)?.shopId === queue.id);
      });
    }
  }
  _counter(agent, role) {
    const onSite = !agent.insideBuildingId && gap(agent, agent.work.anchor) <= .05 && this.navigation.clear(agent);
    if (!onSite) { role.waitingReason = 'absent-from-counter'; agent.activity = '尚未到实际果铺柜台'; return; }
    const employer = this.resource(agent.work.employer);
    if (this.life._inShift(agent)) role.workTicks++;
    const earned = Math.floor(role.workTicks / this.periodTicks);
    while (role.paidPeriods < earned) {
      if (!this.life._transfer(employer, agent, 3)) { role.waitingReason = 'employer-unfunded'; agent.activity = '等果铺支付已完成的服务工时'; break; }
      const period = ++role.paidPeriods; role.totalWages += 3; employer.paidWages += 3; this.life.statistics.wages++;
      const tx = this.life._record('resident-service-wage', { agentId: agent.id, from: employer.id, to: agent.id,
        amount: 3, period, validTicks: role.workTicks, workClockTick: this.life.ticks });
      role.wageReceipts.push({ period, transactionId: tx.id, paidTick: this.life.ticks, validTicks: role.workTicks, amount: 3 });
      if (role.wageReceipts.length > 32) role.wageReceipts.shift();
      this._event(role, 'paid-counter-work', { transactionId: tx.id, period, amount: 3 });
    }
    if (role.paidPeriods === earned) { role.waitingReason = null; agent.activity = '在真实柜台整理果蔬并接待街坊'; }
    if (!this.life._inShift(agent)) this._goHome(agent, role);
  }
  _waitOutsideContact(agent) {
    const waiting = this.contacts.get(this.life.supply.id)[0];
    if (gap(agent, waiting) > .01 && (gap(agent, this.life.supply.anchor) < .95 || agent.pathIndex < agent.path.length)) {
      if (agent.pathIndex >= agent.path.length) { agent.path = [clone(waiting)]; agent.pathIndex = 0; }
      agent.phase = 'walking'; this.life._walk(agent, .1, this.currentVehicles || []);
    } else agent.phase = 'working';
  }
  _order(agent, role) {
    if (agent.index === 10 && this.life.hour >= 12 && this.life.hour < 14) {
      this._waitOutsideContact(agent); role.waitingReason = 'lunch-break'; agent.activity = '留在货栈休息，下午继续有限货单'; return; }
    if (!this.life._inShift(agent)) {
      if (this.life.hour < agent.shift.start) { this._waitOutsideContact(agent); role.waitingReason = 'before-shift'; agent.activity = '已到货栈，等实际工作时段'; return; }
      this._goHome(agent, role); return; }
    const job = this.life.jobs.find(job => job.status === 'available' && job.carrierId === agent.id && this.life._canPickup(job)) ||
      this.life.jobs.find(job => job.status === 'available' && !job.carrierId &&
        this.life.time - job.createdTick * .1 >= 75 && this.life._canPickup(job));
    if (!job) {
      agent.goal = { kind: 'work', id: this.life.supply.id, anchor: point(this.life.supply.anchor) };
      this._waitOutsideContact(agent); role.waitingReason = 'no-funded-order';
      agent.activity = '在分开空位等有限库存与有款货单'; return;
    }
    job.carrierId = agent.id; role.reservedJobId = null; role.jobId = job.id; role.serviceTicks = 0;
    agent.goal = { kind: 'pickup', id: job.id, anchor: point(this.life.supply.anchor) };
    role.stage = 'loading'; role.waitingReason = null; agent.phase = 'working'; agent.activity = '在实际装货柜台逐件领货';
  }
  _service(agent, role, loading) {
    const job = this.life.jobs.find(job => job.id === role.jobId), resourceId = loading ? this.life.supply.id : job?.shopId;
    const resource = this.resource(resourceId);
    if (loading && this.life.hour >= agent.shift.end && job?.status === 'available') {
      this.release(resourceId, agent.id);
      if (job.carrierId === agent.id) job.carrierId = null;
      role.jobId = null; role.serviceTicks = 0; this._goHome(agent, role); return;
    }
    if (!job || !resource || loading && (!this.life._canPickup(job) || job.carrierId !== agent.id)) {
      if (resourceId) this.release(resourceId, agent.id);
      if (job?.status === 'available' && job.carrierId === agent.id) job.carrierId = null;
      role.jobId = null; role.serviceTicks = 0; role.stage = 'waiting-order'; agent.phase = 'working';
      agent.goal = { kind: 'work', id: this.life.supply.id, anchor: point(this.life.supply.anchor) };
      agent.path = []; agent.pathIndex = 0; return;
    }
    if (this.refreshContactRoute(agent)) { this.life._walk(agent, .1, this.currentVehicles || []); return; }
    if (gap(agent, resource.anchor) > .05 || !this.navigation.clear(agent)) {
      role.waitingReason = 'service-queue'; agent.phase = 'working'; agent.activity = '在分开的实际等候位置排队'; return;
    }
    agent.phase = 'working';
    if (!this.claim(resourceId, agent.id)) { role.waitingReason = 'service-queue'; agent.activity = '等前一位街坊完成实际柜台交接'; return; }
    role.waitingReason = null;
    if (++role.serviceTicks < HARBOR_ROLE_ROUTINES.serviceTicks) return;
    if (loading) {
      if (this.life._pickup(job, agent)) {
        this._event(role, 'picked-up-stock', { jobId: job.id, quantity: job.quantity, product: job.product });
        agent.goal = { kind: 'deliver', id: job.id, anchor: point(this.resource(job.shopId).anchor) };
        this._street(agent, role, agent.goal.anchor, 'to-recipient'); agent.activity = '搬运已从货栈扣除的实际补货';
      }
    } else {
      const reward = this.life._deliver(job, agent);
      if (reward !== false) {
        role.deliveries++; role.deliveryIncome += reward;
        const tx = this.life.transactions.at(-1);
        role.deliveryReceipts.push({ jobId: job.id, transactionId: tx.id, amount: reward, deliveredTick: this.life.ticks });
        if (role.deliveryReceipts.length > 16) role.deliveryReceipts.shift();
        this._event(role, 'delivered-stock', { jobId: job.id, transactionId: tx.id, quantity: job.quantity, amount: reward });
        role.jobId = null;
        if (this.life.hour >= agent.shift.start && this.life.hour < agent.shift.end) { agent.goal = { kind: 'work', id: this.life.supply.id, anchor: point(this.life.supply.anchor) };
          this._street(agent, role, this.life.supply.anchor, 'to-supply'); }
        else this._goHome(agent, role);
      }
    }
    role.serviceTicks = 0; this.release(resourceId, agent.id);
  }
  arrive(agent, role = this.role(agent.id)) {
    if (!role) return;
    agent.path = []; agent.pathIndex = 0; agent.crossingId = null;
    if (agent.transit?.phase === 'boarding') {
      this.life.transport.confirmCitizen(agent.id); agent.transit.phase = 'riding'; agent.phase = 'riding'; this.life.statistics.boarded++; return;
    }
    if (agent.transit?.phase === 'alighting') {
      this.life.transport.releaseCitizen(agent.id); agent.transit = null; this.life.statistics.alighted++; this._adopt(agent, role); return;
    }
    if (agent.transit?.phase === 'approach') { agent.transit.phase = 'waiting'; agent.phase = 'waiting-transit'; return; }
    switch (role.stage) {
      case 'legacy-foot-step': this._adopt(agent, role); break;
      case 'to-home': this._path(agent, role, this.homes.get(agent.id).path, 'entering-home', 'entering-home'); break;
      case 'entering-home':
        role.stage = 'resting-home'; agent.phase = 'resting'; agent.activity = '在自己的床旁休息'; agent.visits++;
        if (role.departureDay !== null && this.life.hour >= this.agent(agent.id).shift.end) { role.completedDays++; this._event(role, 'returned-home', { roomId: this.homes.get(agent.id).room.id }); }
        break;
      case 'leaving-home':
        if (agent.index === 0) { agent.goal = { kind: 'work', id: agent.work.employer, anchor: point(agent.work.anchor) };
          this._street(agent, role, agent.work.anchor, 'to-counter'); }
        else { agent.goal = { kind: 'work', id: this.life.supply.id, anchor: point(this.life.supply.anchor) };
          this._street(agent, role, this.life.supply.anchor, 'to-supply'); }
        break;
      case 'to-counter': role.stage = 'working-counter'; agent.phase = 'working'; agent.yaw = -Math.PI / 2;
        this._event(role, 'arrived-counter', { shopId: agent.work.employer }); break;
      case 'to-supply': role.stage = 'waiting-order'; agent.phase = 'working'; break;
      case 'to-recipient': role.stage = 'unloading'; role.serviceTicks = 0; agent.phase = 'working'; agent.activity = '在实际店铺交付补货'; break;
    }
    this._context(agent, role);
  }
  updateTick(agent, vehicles) {
    const role = this.role(agent.id); this.currentVehicles = vehicles; role.ticks = this.life.ticks;
    if (role.stage === 'legacy-adoption') {
      const home = this.homes.get(agent.id);
      if (agent.insideBuildingId === home.building.id && !home.supported(agent)) {
        const groundY = home.groundYAt(agent);
        if (Math.abs(agent.y - groundY) > .035001) throw new Error(`Legacy daily-role foot correction exceeds the real lobby curb: ${agent.id}`);
        // Old saves raised feet before the actual curb. Retain the incoming
        // pose at restore, then use the same bounded walker for the 35 mm step.
        this._path(agent, role, [{ ...point(agent), y: groundY }], 'legacy-foot-step', 'entering-home');
        this.life._walk(agent, .1, vehicles);
      } else this._adopt(agent, role);
      this._context(agent, role); return;
    }
    this._context(agent, role);
    if (agent.transit && agent.transit.phase !== 'approach') { this.life._transit(agent, .1); return; }
    if (role.stage === 'resting-home') {
      const courierCommute = agent.index === 10 && this.life.hour >= 7 && this.life.hour < 8 && this._reserveOrder(agent, role);
      if ((this.life._inShift(agent) || courierCommute) && role.departureDay !== this.life.day) this._depart(agent, role); return;
    }
    if (role.stage === 'working-counter') { this._counter(agent, role); return; }
    if (role.stage === 'waiting-order') { this._order(agent, role); return; }
    if (role.stage === 'loading' || role.stage === 'unloading') { this._service(agent, role, role.stage === 'loading'); return; }
    if (role.stage === 'route-blocked') {
      if (this.life.ticks % 10 === 0) {
        const target = role.routeStage, job = this.life.jobs.find(job => job.id === role.jobId);
        const destination = target === 'to-home' ? this.homes.get(agent.id).building.entrance : target === 'to-counter'
          ? agent.work.anchor : target === 'to-recipient' ? this.resource(job?.shopId)?.anchor : this.life.supply.anchor;
        if (destination) this._street(agent, role, destination, target);
      }
      return;
    }
    this.life._walk(agent, .1, vehicles); this._context(agent, role);
  }
  snapshot() { return clone(this.state); }
  publicStatus() { return { hour: this.life.hour, day: this.life.day,
    residents: this.state.roles.map(role => ({ ...clone(role), name: this.agent(role.residentId).name,
      occupation: this.agent(role.residentId).role, unpaidPeriods: Math.floor(role.workTicks / this.periodTicks) - role.paidPeriods, cash: this.agent(role.residentId).money,
      home: { buildingId: this.homes.get(role.residentId).building.id, roomId: this.homes.get(role.residentId).room.id },
      activity: this.agent(role.residentId).activity })), queues: clone(this.state.queues) }; }
  migrateMissing(save) {
    // Retain every original agent field at restore. A following real tick
    // prepares the two new routes from those same positions and cargo owners.
    const state = this._fresh(save.ticks);
    for (const role of state.roles) role.stage = 'legacy-adoption';
    save.roleRoutines = state;
  }
  rebaseFreshCalendar(save) { for (const role of save.roleRoutines.roles) { role.initializedTick = 0; role.ticks = 0; } }
  validate(state, save) {
    if (!state || state.version !== HARBOR_ROLE_ROUTINES.version || !Array.isArray(state.roles) || state.roles.length !== 2 ||
      !Array.isArray(state.queues) || state.queues.length !== 4) return false;
    for (const [index, role] of state.roles.entries()) {
      const id = HARBOR_ROLE_ROUTINES.residents[index], agent = save.agents.find(agent => agent.id === id), home = this.homes.get(id);
      if (!agent || role.residentId !== id || !stages.has(role.stage) || role.ticks !== save.ticks || !integer(role.initializedTick, role.ticks) ||
        !integer(role.workTicks, role.ticks - role.initializedTick) || !integer(role.paidPeriods, Math.floor(role.workTicks / this.periodTicks)) ||
        role.totalWages !== role.paidPeriods * 3 || !integer(role.deliveries) || role.deliveryIncome !== role.deliveries * 12 ||
        role.reservedJobId !== null && !save.jobs.some(job => job.id === role.reservedJobId && job.status === 'available' && job.carrierId === id) ||
        !integer(role.completedDays) || !integer(role.serviceTicks, HARBOR_ROLE_ROUTINES.serviceTicks - 1) || !integer(role.eventSerial) ||
        role.departureDay !== null && !integer(role.departureDay, Math.floor(calendarHour(save.clock, save.ticks, save.secondsPerHour) / 24)) ||
        !Array.isArray(role.events) || role.events.length > 32 || role.events.some((event, i) => !integer(event.sequence, role.eventSerial) ||
          !integer(event.tick, save.ticks) || event.tick < role.initializedTick || typeof event.type !== 'string' ||
          Math.abs(event.hour - calendarHour(save.clock, event.tick, save.secondsPerHour)) > 1e-8 ||
          i && (event.sequence <= role.events[i - 1].sequence || event.tick < role.events[i - 1].tick))) return false;
      if (id.endsWith('11') && (role.workTicks || role.paidPeriods || role.totalWages) || id.endsWith('01') && (role.deliveries || role.deliveryIncome)) return false;
      if (!Array.isArray(role.wageReceipts) || role.wageReceipts.length !== Math.min(32, role.paidPeriods) || role.wageReceipts.some((receipt, i) => {
        const tx = save.transactions.find(tx => tx.id === receipt.transactionId);
        return receipt.period !== role.paidPeriods - role.wageReceipts.length + i + 1 || receipt.amount !== 3 ||
          !integer(receipt.validTicks, role.workTicks) || receipt.validTicks < receipt.period * this.periodTicks ||
          !integer(receipt.paidTick, save.ticks) || !/^harbor-tx-[1-9]\d*$/.test(receipt.transactionId) || Number(receipt.transactionId.slice(10)) > save.serial ||
          tx && (tx.type !== 'resident-service-wage' || tx.agentId !== id || tx.from !== this.agent(id).work.employer || tx.to !== id ||
            tx.amount !== 3 || tx.period !== receipt.period || tx.validTicks !== receipt.validTicks || tx.workClockTick !== receipt.paidTick);
      })) return false;
      if (!Array.isArray(role.deliveryReceipts) || role.deliveryReceipts.length !== Math.min(16, role.deliveries) || role.deliveryReceipts.some(receipt => {
        const tx = save.transactions.find(tx => tx.id === receipt.transactionId);
        return receipt.amount !== 12 || !integer(receipt.deliveredTick, save.ticks) || !/^harbor-order-[1-9]\d*$/.test(receipt.jobId) ||
          !/^harbor-tx-[1-9]\d*$/.test(receipt.transactionId) || Number(receipt.transactionId.slice(10)) > save.serial ||
          tx && (tx.type !== 'delivery' || tx.carrierId !== id || tx.jobId !== receipt.jobId || tx.amount !== 12);
      }) || new Set(role.deliveryReceipts.map(receipt => receipt.jobId)).size !== role.deliveryReceipts.length) return false;
      for (const tx of save.transactions.filter(tx => tx.type === 'resident-service-wage' && tx.agentId === id)) {
        if (tx.period > role.paidPeriods || tx.period < 1 || !integer(tx.period) || tx.amount !== 3 ||
          tx.from !== this.agent(id).work.employer || tx.to !== id || !integer(tx.validTicks, role.workTicks) ||
          tx.validTicks < tx.period * this.periodTicks || !integer(tx.workClockTick, save.ticks) ||
          role.paidPeriods - tx.period < 32 && !role.wageReceipts.some(receipt => receipt.transactionId === tx.id)) return false;
      }
      if (role.stage === 'legacy-adoption') {
        if (role.workTicks || role.paidPeriods || role.totalWages || role.deliveries || role.deliveryIncome ||
          role.jobId || role.reservedJobId || role.events.length || role.wageReceipts.length || role.deliveryReceipts.length) return false;
        if (agent.insideBuildingId) {
          if (agent.insideBuildingId !== home.building.id || agent.floorId !== home.floor.id ||
            agent.roomId && !home.layout.rooms.some(room => room.id === agent.roomId) ||
            !['resting', 'entering-home', 'leaving-home'].includes(agent.phase) ||
            Math.abs(agent.y - home.floor.y) > .035001 ||
            home.colliders.some(body => circleOBB({ ...agent, radius: HARBOR_ROLE_ROUTINES.radius }, body))) return false;
        } else if (!agent.transit && (Math.abs(agent.y - .18) > 1e-6 || !this.navigation.clear(agent))) return false;
        continue;
      }
      const inside = ['entering-home', 'leaving-home', 'resting-home'].includes(role.stage), expected = clone(agent);
      this._context(expected, role);
      if (agent.insideBuildingId !== expected.insideBuildingId || agent.floorId !== expected.floorId || agent.roomId !== expected.roomId ||
        inside && !home.clear(agent) || !inside && !agent.transit &&
          (Math.abs(agent.y - .18) > 1e-6 || !this.navigation.clear(agent))) return false;
      if (role.stage === 'resting-home' && (agent.phase !== 'resting' || gap(agent, home.anchor) > .05) ||
        role.stage === 'working-counter' && agent.phase !== 'working' ||
        ['loading', 'unloading', 'waiting-order'].includes(role.stage) && !['working', 'walking'].includes(agent.phase)) return false;
      if (['loading', 'unloading', 'to-recipient'].includes(role.stage)) {
        const job = save.jobs.find(job => job.id === role.jobId);
        if (!job || job.carrierId !== id || (role.stage === 'loading' ? job.status !== 'available' : job.status !== 'picked-up') ||
          (role.stage !== 'loading' && agent.cargoJobId !== job.id)) return false;
      } else if (role.jobId && role.stage !== 'route-blocked') return false;
      if (agent.transit && role.stage !== 'legacy-transit') return false;
      if (!agent.transit) for (const [i, pose] of [agent, ...agent.path.slice(agent.pathIndex)].entries()) {
        const poses = [agent, ...agent.path.slice(agent.pathIndex)], previous = poses[i - 1];
        if (i && !(inside ? home.clearSegment(previous, pose) : Math.abs(pose.y - .18) < 1e-6 &&
          Math.abs(previous.y - .18) < 1e-6 && this.navigation.clearSegment(previous, pose))) return false;
      }
    }
    for (const [index, queue] of state.queues.entries()) {
      if (queue.id !== [this.life.supply, ...this.life.shops][index].id || !Array.isArray(queue.waiting) || queue.waiting.length > 20 ||
        !Array.isArray(queue.departing) || queue.departing.length > 2 || new Set(queue.departing).size !== queue.departing.length ||
        queue.departing.some(id => !this.participates(this.agent(id)) || !save.agents.some(agent => agent.id === id &&
          gap(agent, this.resource(queue.id).anchor) < 3.4 + this.agent(id).speed * .1)) ||
        new Set(queue.waiting).size !== queue.waiting.length || queue.waiting.some(id => {
          const authored = this.agent(id), agent = save.agents.find(agent => agent.id === id);
          return !this.participates(authored) || !agent || (queue.id === this.life.supply.id
            ? agent.goal?.kind !== 'pickup' : agent.goal?.kind !== 'deliver' ||
              save.jobs.find(job => job.id === agent.goal.id)?.shopId !== queue.id);
        }) ||
        queue.owner !== null && queue.owner !== 'harbor-resident-11' || queue.owner === null && queue.claimedTick !== null ||
        queue.owner && (!integer(queue.claimedTick, save.ticks) || queue.waiting.includes(queue.owner))) return false;
      if (queue.owner) {
        const courier = state.roles[1], agent = save.agents.find(agent => agent.id === queue.owner), job = save.jobs.find(job => job.id === courier.jobId);
        if (!['loading', 'unloading'].includes(courier.stage) || (courier.stage === 'loading' ? queue.id !== this.life.supply.id : queue.id !== job?.shopId) ||
          gap(agent, this.resource(queue.id).anchor) > .05 || !courier.serviceTicks) return false;
      }
    }
    return true;
  }
  restoreValidated(state) { this.state = clone(state); }
}
