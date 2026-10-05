import { circleOBB } from './collision.js';
import { createInteriorLayout } from './metropolis-interiors.js';
import { planHarborWorkshopPilot } from './harbor-workshop-pilot.js';
import { calendarHour } from './harbor-world-clock.js';

export const RESIDENT_LOOP = Object.freeze({ residentId: 'harbor-resident-07', version: 2,
  startHour: 6.5, secondsPerHour: 120, departureHour: 7, radius: .6, periodTicks: 350,
  workPeriods: 2, wage: 3, shopId: 'harbor-produce', fromStopId: 'harbor-tram-lantern',
  toStopId: 'harbor-tram-workshop', workBuildingId: 'south-086', floorId: 'lobby' });
const clone = value => JSON.parse(JSON.stringify(value));
const gap = (a, b) => Math.hypot(a.x - b.x, a.z - b.z, (a.y ?? .18) - (b.y ?? .18));
const integer = (value, maximum = 1e10) => Number.isSafeInteger(value) && value >= 0 && value <= maximum;
const point = (value, y = value.y ?? .18) => ({ x: value.x, z: value.z, y });
const stages = new Set(['initial-home', 'legacy-transit', 'entering-home', 'resting-home',
  'leaving-home', 'to-origin', 'outbound-tram', 'to-work', 'entering-work', 'working',
  'leaving-work', 'to-return-stop', 'return-tram', 'to-shop', 'shopping', 'to-home', 'route-blocked']);

/** One authored timetable owns one existing logical resident. Other residents,
 * public shop hours, money accounts and the shared fleet retain their owners. */
export class HarborResidentLoop {
  constructor(life, navigation) {
    this.life = life; this.navigation = navigation;
    this.home = this._room(this.agent.home.buildingId, 'bedroom');
    this.work = this._room(RESIDENT_LOOP.workBuildingId, 'workshop');
    this.shop = life.shops.find(shop => shop.id === RESIDENT_LOOP.shopId);
    if (!this.shop || !life.transport?.stop(RESIDENT_LOOP.fromStopId) || !life.transport.stop(RESIDENT_LOOP.toStopId))
      throw new Error('Resident loop requires its actual shop and shared tram stops');
    this.state = this._freshState();
    this._prepareHome(this.agent, this.state);
  }
  get agent() { return this.life.agents.find(agent => agent.id === RESIDENT_LOOP.residentId); }
  owns(agent) { return agent?.id === RESIDENT_LOOP.residentId; }
  get absoluteHour() { return this.life.absoluteHour; }
  _nextDepartureTick(hour, tick, rate = this.life.secondsPerHour, strictlyFuture = false) {
    let departure = Math.floor(hour / 24) * 24 + RESIDENT_LOOP.departureHour;
    if (strictlyFuture ? departure <= hour : departure < hour) departure += 24;
    return tick + Math.ceil((departure - hour) * rate * 10);
  }
  _freshState(hour = this.life.absoluteHour) { return { version: RESIDENT_LOOP.version, residentId: RESIDENT_LOOP.residentId,
    clock: { owner: 'harbor-life', epochTick: 0, absoluteHour: hour, secondsPerHour: this.life.secondsPerHour },
    historyClock: null,
    ticks: 0, stage: 'initial-home', cycle: 0, completedCycles: 0,
    nextDepartureTick: this._nextDepartureTick(hour, 0),
    activeJob: null, completedJobs: [], totalValidWorkTicks: 0, totalWages: 0,
    purchaseCycle: null, purchases: 0, waitingReason: null, eventSerial: 0, events: [] }; }
  _room(buildingId, type) {
    const building = this.life.buildings.find(building => building.id === buildingId);
    const floor = building?.floors.find(floor => floor.id === RESIDENT_LOOP.floorId);
    if (!floor) throw new Error(`Resident loop has no real floor at ${buildingId}`);
    const layout = createInteriorLayout(building, floor), room = layout.rooms.find(room => room.type === type);
    if (!room) throw new Error(`Resident loop has no ${type} room at ${buildingId}`);
    const furniture = layout.parts.find(part => part.roomId === room.id && part.kind === (type === 'bedroom' ? 'bed' : 'workbench-top'));
    if (!furniture) throw new Error(`Resident loop has no actual ${type} furniture`);
    const anchor = { x: furniture.x + furniture.sx / 2 + RESIDENT_LOOP.radius + .12,
      z: type === 'bedroom' ? room.arrival.z : furniture.z, y: floor.y };
    const path = [point(building.entrance), point(building.entryPortal || building.entrance),
      point(layout.entrance, floor.y), { x: building.x, z: room.arrival.z, y: floor.y },
      point(room.entrance, floor.y), point(room.arrival, floor.y), anchor];
    const extra = type === 'workshop' ? planHarborWorkshopPilot(building, floor, layout)?.colliders || [] : [];
    const colliders = [...layout.colliders, ...extra].filter(body => body.physics !== false &&
      body.minY < floor.y + 1.8 && body.maxY > floor.y + .05);
    const clear = pose => !colliders.some(body => circleOBB({ ...pose, radius: RESIDENT_LOOP.radius }, body));
    const clearSegment = (from, to) => {
      const samples = Math.max(1, Math.ceil(gap(from, to) / .02));
      for (let sample = 0; sample <= samples; sample++) {
        const t = sample / samples;
        if (!clear({ x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t }))
          return false;
      }
      return true;
    };
    for (let index = 1; index < path.length; index++) if (!clearSegment(path[index - 1], path[index]))
      throw new Error(`Resident loop blocked by real furniture: ${buildingId}/${room.id}`);
    return { building, floor, layout, room, furnitureId: furniture.id, anchor, path, colliders, clear, clearSegment };
  }
  _event(type, fields = {}) {
    this.state.events.push({ sequence: ++this.state.eventSerial, tick: this.state.ticks,
      hour: this.absoluteHour, type, ...fields });
    if (this.state.events.length > 32) this.state.events.shift();
    this.life.revision++;
  }
  _path(agent, path, stage, phase = 'walking') {
    agent.path = clone(path); agent.pathIndex = 0; agent.phase = phase; agent.crossingId = null;
    this.state.stage = stage; this.state.waitingReason = null;
  }
  _street(destination, stage) {
    const path = this.navigation.route(this.agent, destination);
    if (!path) { this.state.stage = 'route-blocked'; this.state.waitingReason = stage;
      this.agent.phase = 'route-blocked'; this.agent.activity = '等候安全通路'; return; }
    this._path(this.agent, path, stage);
    if (!path.length) this.arrive(this.agent);
  }
  _prepareHome(agent, state) {
    if (agent.transit) { state.stage = 'legacy-transit'; return; }
    if (agent.insideBuildingId === this.home.building.id) {
      // Version-one residents rested at the real room arrival, before the bed
      // side workplace was authored. Continue walking instead of teleporting.
      let join = -1;
      for (let index = this.home.path.length - 1; index >= 0; index--) if (this.home.clearSegment(agent, this.home.path[index])) { join = index; break; }
      if (join < 0) throw new Error('Old resident home position has no safe furnished continuation');
      agent.path = [point(agent), ...clone(this.home.path.slice(join))]; agent.pathIndex = 0;
      agent.phase = 'entering-home'; state.stage = 'entering-home'; return;
    }
    const path = this.navigation.route(agent, this.home.building.entrance);
    agent.path = path || []; agent.pathIndex = 0; agent.phase = path ? 'walking' : 'route-blocked';
    state.stage = path ? 'initial-home' : 'route-blocked'; state.waitingReason = path ? null : 'initial-home';
  }
  _entry(room, stage) {
    // The facade's public opening hands collision ownership to its furnished
    // layout for this narrow doorway traversal; the exterior building box is
    // not an interior obstacle and no colliders are disabled in the city.
    this._path(this.agent, room.path, stage, stage === 'entering-home' ? 'entering-home' : 'walking');
    this.agent.activity = stage === 'entering-home' ? '沿房门走回卧室' : '沿入口走向工台';
  }
  _setContext(agent, state) {
    const stage = state.stage, data = /home/.test(stage) && ['entering-home', 'leaving-home', 'resting-home'].includes(stage)
      ? this.home : ['entering-work', 'leaving-work', 'working'].includes(stage) ? this.work : null;
    const inside = data && Math.abs(agent.x - data.building.x) < (data.building.width - .7) / 2 &&
      Math.abs(agent.z - data.building.z) < (data.building.depth - .7) / 2;
    agent.insideBuildingId = inside ? data.building.id : null; agent.floorId = inside ? data.floor.id : null;
    agent.roomId = inside ? data.layout.rooms.find(room => agent.x >= room.bounds.minX && agent.x <= room.bounds.maxX &&
      agent.z >= room.bounds.minZ && agent.z <= room.bounds.maxZ)?.id || null : null;
  }
  _context() { this._setContext(this.agent, this.state); }
  _depart() {
    const state = this.state;
    state.cycle++; state.purchaseCycle = null;
    state.activeJob = { id: `harbor-work:${RESIDENT_LOOP.residentId}:${state.cycle}`,
      validTicks: 0, paidPeriods: 0, paidAmount: 0, startedTick: null, receipts: [] };
    this.agent.goal = { kind: 'work', id: this.agent.work.employer, anchor: point(this.work.anchor) };
    this._event('depart-home', { cycle: state.cycle, buildingId: this.home.building.id });
    this._path(this.agent, [...this.home.path].reverse(), 'leaving-home', 'leaving-home');
    this.agent.activity = '出门搭电车去工坊';
  }
  _tram(returning) {
    const origin = returning ? RESIDENT_LOOP.toStopId : RESIDENT_LOOP.fromStopId;
    const destination = returning ? RESIDENT_LOOP.fromStopId : RESIDENT_LOOP.toStopId;
    this.agent.transit = { phase: 'approach', originStopId: origin, destinationStopId: destination, ticket: null };
    this._street(this.life.transport.stop(origin).board, returning ? 'to-return-stop' : 'to-origin');
    this.agent.activity = '走向实际电车站';
  }
  arrive(agent) {
    agent.path = []; agent.pathIndex = 0; agent.crossingId = null;
    if (agent.transit?.phase === 'boarding') {
      this.life.transport.confirmCitizen(agent.id); agent.transit.phase = 'riding'; agent.phase = 'riding';
      agent.activity = '乘坐实际港湾电车'; this.life.statistics.boarded++;
      this._event('tram-boarded', { vehicleId: agent.transit.ticket.vehicleId,
        originStopId: agent.transit.originStopId, destinationStopId: agent.transit.destinationStopId }); return;
    }
    if (agent.transit?.phase === 'alighting') {
      this.life.transport.releaseCitizen(agent.id); this.life.statistics.alighted++;
      const leg = this.state.stage; this._event('tram-alighted', { vehicleId: agent.transit.ticket.vehicleId,
        stopId: agent.transit.destinationStopId }); agent.transit = null;
      if (leg === 'outbound-tram') this._street(this.work.building.entrance, 'to-work');
      else if (leg === 'return-tram') this._street(this.shop.anchor, 'to-shop');
      else this._street(this.home.building.entrance, 'initial-home');
      return;
    }
    if (agent.transit?.phase === 'approach') {
      agent.transit.phase = 'waiting'; agent.phase = 'waiting-transit'; agent.activity = '等候同一班电车';
      if (this.state.stage !== 'legacy-transit') this.state.stage = this.state.stage === 'to-origin' ? 'outbound-tram' : 'return-tram';
      return;
    }
    switch (this.state.stage) {
      case 'initial-home': case 'to-home': this._entry(this.home, 'entering-home'); break;
      case 'entering-home': {
        agent.phase = 'resting'; agent.activity = '在自己的卧室休息'; agent.visits++;
        this.state.stage = 'resting-home'; this._context();
        if (this.state.cycle > this.state.completedCycles) {
          this.state.completedCycles = this.state.cycle;
          this.state.completedJobs.push(clone(this.state.activeJob));
          if (this.state.completedJobs.length > 8) this.state.completedJobs.shift();
          this._event('returned-home', { cycle: this.state.cycle, buildingId: agent.insideBuildingId, roomId: agent.roomId });
          this.state.activeJob = null;
          this.state.nextDepartureTick = this._nextDepartureTick(this.absoluteHour, this.state.ticks, this.life.secondsPerHour, true);
        }
        break;
      }
      case 'leaving-home': this._context(); this._tram(false); break;
      case 'to-work': this._entry(this.work, 'entering-work'); break;
      case 'entering-work':
        this.state.stage = 'working'; this._context(); agent.phase = 'working'; agent.activity = '在工台修整工件';
        agent.yaw = -Math.PI / 2; this.state.activeJob.startedTick = this.state.ticks;
        this._event('started-work', { jobId: this.state.activeJob.id, roomId: agent.roomId }); break;
      case 'leaving-work': this._context(); this._tram(true); break;
      case 'to-shop': agent.phase = 'shopping'; agent.activity = '到果铺柜台采购'; this.state.stage = 'shopping'; break;
    }
  }
  _workTick() {
    const agent = this.agent, job = this.state.activeJob;
    const valid = agent.phase === 'working' && agent.insideBuildingId === this.work.building.id && agent.floorId === this.work.floor.id &&
      agent.roomId === this.work.room.id && gap(agent, this.work.anchor) <= .05 && this.work.clear(agent);
    if (!valid) { this.state.waitingReason = 'absent-from-workstation'; agent.activity = '尚未在工台到岗'; return; }
    if (!this.life._inShift(agent)) { this.state.waitingReason = 'off-shift'; agent.activity = '等实际轮班开始再工作'; return; }
    if (job.validTicks < RESIDENT_LOOP.periodTicks * RESIDENT_LOOP.workPeriods) {
      job.validTicks++; this.state.totalValidWorkTicks++;
    }
    const earnedPeriods = Math.floor(job.validTicks / RESIDENT_LOOP.periodTicks);
    // Settle already earned periods together when funding returns. Splitting
    // this debt across frames would let unrelated wages consume its balance
    // halfway through settlement, despite both periods already being worked.
    while (job.paidPeriods < earnedPeriods) {
      const employer = agent.work.employer === this.life.supply.id ? this.life.supply : this.life.shops.find(shop => shop.id === agent.work.employer);
      if (!this.life._transfer(employer, agent, RESIDENT_LOOP.wage)) {
        this.state.waitingReason = 'employer-unfunded'; agent.activity = '等雇主结清已完成的工作'; return;
      }
      const period = ++job.paidPeriods; job.paidAmount += RESIDENT_LOOP.wage;
      this.state.totalWages += RESIDENT_LOOP.wage; this.life.statistics.wages++;
      const tx = this.life._record('resident-work-wage', { agentId: agent.id, from: employer.id, to: agent.id,
        amount: RESIDENT_LOOP.wage, jobId: job.id, period, validTicks: job.validTicks, workClockTick: this.state.ticks });
      job.receipts.push({ period, transactionId: tx.id, paidTick: this.state.ticks, validTicks: job.validTicks, amount: RESIDENT_LOOP.wage });
      this._event('paid-work', { jobId: job.id, transactionId: tx.id, period, validTicks: job.validTicks, amount: RESIDENT_LOOP.wage });
    }
    this.state.waitingReason = null;
    if (job.paidPeriods === RESIDENT_LOOP.workPeriods) {
      this._event('finished-work', { jobId: job.id, validTicks: job.validTicks, paidAmount: job.paidAmount });
      this._path(agent, [...this.work.path].reverse(), 'leaving-work'); agent.activity = '收工，走到电车站';
    }
  }
  _purchase() {
    const agent = this.agent, shop = this.shop;
    const staffed = this.life.agents.some(agent => agent.work.employer === shop.id && agent.phase === 'working' &&
      Math.hypot(agent.x - shop.anchor.x, agent.z - shop.anchor.z) < 2);
    const reason = this.life.hour < 6 || this.life.hour >= 21 ? 'shop-closed' : !staffed ? 'shop-unstaffed'
      : !shop.stock ? 'out-of-stock' : agent.money < shop.price ? 'insufficient-cash' : null;
    if (reason) { this.state.waitingReason = reason; agent.activity = reason === 'out-of-stock' ? '等实际补货' : '等柜台可以交易'; return; }
    if (this.state.purchaseCycle !== this.state.cycle) {
      if (!this.life._transfer(agent, shop, shop.price)) return;
      shop.stock--; shop.sold++; agent.purchased[shop.product] = this.life.day;
      this.life.statistics.purchases++; this.life.statistics.consumed++; this.life.consumedByProduct[shop.product]++;
      this.state.purchaseCycle = this.state.cycle; this.state.purchases++;
      const tx = this.life._record('purchase', { agentId: agent.id, shopId: shop.id, from: agent.id, to: shop.id,
        amount: shop.price, quantity: 1, product: shop.product, residentCycle: this.state.cycle });
      this._event('purchased-food', { transactionId: tx.id, shopId: shop.id, product: shop.product, amount: shop.price });
    }
    this.agent.goal = { kind: 'home', id: this.home.building.id, anchor: point(this.home.building.entrance) };
    this._street(this.home.building.entrance, 'to-home'); agent.activity = '带着采购记录走回家';
  }
  updateTick(vehicles = []) {
    this.state.ticks++; this._context();
    if (this.agent.transit && this.agent.transit.phase !== 'approach') {
      this.life._transit(this.agent, .1); this._context(); return;
    }
    if (this.state.stage === 'resting-home') {
      if (this.state.ticks >= this.state.nextDepartureTick) this._depart(); return;
    }
    if (this.state.stage === 'working') { this._workTick(); return; }
    if (this.state.stage === 'shopping') { this._purchase(); return; }
    if (this.state.stage === 'route-blocked') {
      const target = this.state.waitingReason;
      if (this.state.ticks % 10 === 0) {
        const destinations = { 'initial-home': this.home.building.entrance, 'to-home': this.home.building.entrance,
          'to-work': this.work.building.entrance, 'to-shop': this.shop.anchor,
          'to-origin': this.life.transport.stop(RESIDENT_LOOP.fromStopId).board,
          'to-return-stop': this.life.transport.stop(RESIDENT_LOOP.toStopId).board };
        if (destinations[target]) this._street(destinations[target], target);
      }
      return;
    }
    this.life._walk(this.agent, .1, vehicles); this._context();
  }
  snapshot() { return clone(this.state); }
  publicStatus() {
    return { residentId: this.agent.id, name: this.agent.name, scheduleHour: ((this.absoluteHour % 24) + 24) % 24,
      scheduleDay: Math.floor(this.absoluteHour / 24), plannedDepartureHour: RESIDENT_LOOP.departureHour,
      home: { buildingId: this.home.building.id, floorId: this.home.floor.id, roomId: this.home.room.id },
      workplace: { buildingId: this.work.building.id, floorId: this.work.floor.id, roomId: this.work.room.id },
      stage: this.state.stage, activity: this.agent.activity, waitingReason: this.state.waitingReason,
      cash: this.agent.money, workSeconds: (this.state.activeJob?.validTicks || this.state.completedJobs.at(-1)?.validTicks || 0) / 10,
      paidWorkPeriods: this.state.activeJob?.paidPeriods ?? this.state.completedJobs.at(-1)?.paidPeriods ?? 0,
      earnedWages: this.state.totalWages, completedCycles: this.state.completedCycles, purchases: this.state.purchases,
      transit: clone(this.agent.transit), currentRoomId: this.agent.roomId, events: clone(this.state.events) };
  }
  migrateLegacy(save) {
    const state = this._freshState(calendarHour(save.clock, save.ticks, save.secondsPerHour)), agent = save.agents.find(agent => this.owns(agent));
    if (!agent) return false;
    if (!Object.hasOwn(agent, 'transit')) agent.transit = null;
    this._prepareHome(agent, state); this._setContext(agent, state); save.residentLoop = state; return true;
  }
  rebaseFreshCalendar(save) {
    const state = save.residentLoop;
    state.clock = { owner: 'harbor-life', epochTick: 0, absoluteHour: save.clock.absoluteHour, secondsPerHour: save.secondsPerHour };
    state.historyClock = null;
    state.nextDepartureTick = this._nextDepartureTick(save.clock.absoluteHour, 0, save.secondsPerHour);
  }
  migrateCalendar(save) {
    const state = save.residentLoop;
    state.historyClock = { ...state.clock, untilTick: state.ticks };
    state.clock = { owner: 'harbor-life', epochTick: state.ticks,
      absoluteHour: calendarHour(save.clock, save.ticks, save.secondsPerHour), secondsPerHour: save.secondsPerHour };
    state.version = RESIDENT_LOOP.version;
    if (state.stage === 'resting-home' || state.cycle === 0) state.nextDepartureTick =
      this._nextDepartureTick(state.clock.absoluteHour, state.ticks, save.secondsPerHour, state.completedCycles > 0);
  }
  validate(state, agent, save, { legacy = false } = {}) {
    const clock = state?.clock, history = state?.historyClock;
    const eventHour = tick => legacy || history && tick <= history.untilTick
      ? (legacy ? clock : history).startHour + tick * .1 / (legacy ? clock : history).secondsPerHour
      : clock.absoluteHour + (tick - clock.epochTick) * .1 / clock.secondsPerHour;
    const clockValid = legacy
      ? state?.version === 1 && clock?.startHour === RESIDENT_LOOP.startHour && clock?.secondsPerHour === RESIDENT_LOOP.secondsPerHour
      : state?.version === RESIDENT_LOOP.version && clock?.owner === 'harbor-life' && clock.secondsPerHour === save.secondsPerHour &&
        integer(clock.epochTick, state.ticks) && Number.isFinite(clock.absoluteHour) && clock.absoluteHour >= 0 &&
        Math.abs(clock.absoluteHour + (state.ticks - clock.epochTick) * .1 / clock.secondsPerHour -
          calendarHour(save.clock, save.ticks, save.secondsPerHour)) < 1e-8 &&
        (history === null || history?.startHour === RESIDENT_LOOP.startHour && history?.secondsPerHour === RESIDENT_LOOP.secondsPerHour &&
          integer(history.untilTick, state.ticks) && history.untilTick === clock.epochTick);
    if (!Object.hasOwn(agent, 'transit') || agent.transit !== null && (typeof agent.transit !== 'object' || Array.isArray(agent.transit))) return false;
    if (!state || !clockValid || state.residentId !== RESIDENT_LOOP.residentId ||
      !stages.has(state.stage) || !integer(state.ticks) || state.ticks > save.ticks || !integer(state.cycle) ||
      !integer(state.completedCycles, state.cycle) || state.cycle - state.completedCycles > 1 ||
      !integer(state.nextDepartureTick) || !integer(state.totalValidWorkTicks, state.ticks) ||
      !integer(state.totalWages) || state.totalWages % RESIDENT_LOOP.wage || !integer(state.purchases, state.cycle) ||
      (state.purchaseCycle !== null && state.purchaseCycle !== state.cycle) || !integer(state.eventSerial) ||
      !Array.isArray(state.events) || state.events.length > 32 || state.events.some((event, index) =>
        !integer(event.sequence, state.eventSerial) || !integer(event.tick, state.ticks) ||
        !Number.isFinite(event.hour) || Math.abs(event.hour - eventHour(event.tick)) > 1e-8 ||
        typeof event.type !== 'string' || index && (event.sequence <= state.events[index - 1].sequence || event.tick < state.events[index - 1].tick)) ||
      !Array.isArray(state.completedJobs) || state.completedJobs.length > 8) return false;
    const validJob = job => job && typeof job.id === 'string' &&
      /^harbor-work:harbor-resident-07:[1-9]\d*$/.test(job.id) && integer(job.validTicks, 700) &&
      integer(job.paidPeriods, Math.floor(job.validTicks / 350)) && job.paidPeriods <= 2 &&
      job.paidAmount === job.paidPeriods * 3 && (job.startedTick === null || integer(job.startedTick, state.ticks)) &&
      (!job.validTicks || job.startedTick !== null && job.validTicks <= state.ticks - job.startedTick) &&
      Array.isArray(job.receipts) && job.receipts.length === job.paidPeriods && job.receipts.every((receipt, index) =>
        receipt.period === index + 1 && receipt.amount === 3 && integer(receipt.validTicks, job.validTicks) &&
        receipt.validTicks >= receipt.period * 350 && integer(receipt.paidTick, state.ticks) &&
        job.startedTick !== null && receipt.paidTick >= job.startedTick + receipt.period * 350 &&
        receipt.validTicks <= receipt.paidTick - job.startedTick &&
        /^harbor-tx-[1-9]\d*$/.test(receipt.transactionId) && integer(Number(receipt.transactionId.slice(10)), save.serial));
    if ((state.cycle > state.completedCycles) !== !!state.activeJob || state.activeJob &&
      (!validJob(state.activeJob) || state.activeJob.id !== `harbor-work:${agent.id}:${state.cycle}`) ||
      state.completedJobs.some((job, index) => !validJob(job) || job.paidPeriods !== 2 ||
        job.id !== `harbor-work:${agent.id}:${state.completedCycles - state.completedJobs.length + index + 1}`) ||
      state.completedJobs.length !== Math.min(8, state.completedCycles) ||
      new Set([...state.completedJobs, ...(state.activeJob ? [state.activeJob] : [])].map(job => job.id)).size !==
      state.completedJobs.length + (state.activeJob ? 1 : 0) ||
      state.totalWages !== state.completedCycles * 6 + (state.activeJob?.paidAmount || 0) ||
      state.totalValidWorkTicks !== state.completedCycles * 700 + (state.activeJob?.validTicks || 0) ||
      state.purchases !== state.completedCycles + (state.cycle > state.completedCycles && state.purchaseCycle === state.cycle ? 1 : 0)) return false;
    const routeStage = state.stage === 'route-blocked' ? state.waitingReason : state.stage;
    if (state.stage === 'route-blocked' && (!['initial-home', 'to-home', 'to-work', 'to-shop', 'to-origin', 'to-return-stop'].includes(routeStage) ||
      agent.phase !== 'route-blocked')) return false;
    if (['initial-home', 'legacy-transit'].includes(routeStage) && state.cycle !== 0 ||
      state.stage === 'resting-home' && state.activeJob) return false;
    const returningHome = routeStage === 'to-home' || routeStage === 'entering-home' && state.cycle > state.completedCycles;
    const afterWork = returningHome || ['leaving-work', 'to-return-stop', 'return-tram', 'to-shop', 'shopping'].includes(routeStage);
    if (afterWork && (!state.activeJob || state.activeJob.validTicks !== RESIDENT_LOOP.periodTicks * RESIDENT_LOOP.workPeriods ||
      state.activeJob.paidPeriods !== RESIDENT_LOOP.workPeriods)) return false;
    if (returningHome && state.purchaseCycle !== state.cycle) return false;
    if (state.stage === 'shopping' && (agent.phase !== 'shopping' || gap(agent, this.shop.anchor) > .05)) return false;
    const jobs = [...state.completedJobs, ...(state.activeJob ? [state.activeJob] : [])];
    const receipts = jobs.flatMap(job => job.receipts);
    if (!Array.isArray(save.transactions) || new Set(receipts.map(receipt => receipt.transactionId)).size !== receipts.length) return false;
    const matchesReceipt = (tx, job, receipt) => tx.type === 'resident-work-wage' && tx.agentId === agent.id &&
      tx.from === this.agent.work.employer && tx.to === agent.id && tx.amount === receipt.amount &&
      tx.jobId === job.id && tx.period === receipt.period && tx.validTicks === receipt.validTicks && tx.workClockTick === receipt.paidTick;
    for (const job of jobs) for (const receipt of job.receipts) {
      const tx = save.transactions.find(tx => tx.id === receipt.transactionId);
      if (tx && !matchesReceipt(tx, job, receipt)) return false;
    }
    // A paid ledger row must still be owned by the active/recent job receipt.
    // Otherwise erasing diary bookkeeping could repay a period already funded.
    const retainedPeriods = new Set();
    for (const tx of save.transactions.filter(tx => tx.type === 'resident-work-wage')) {
      const jobCycle = typeof tx.jobId === 'string' && /^harbor-work:harbor-resident-07:[1-9]\d*$/.test(tx.jobId)
        ? Number(tx.jobId.split(':').at(-1)) : NaN;
      if (!/^harbor-tx-[1-9]\d*$/.test(tx.id) || !integer(Number(tx.id.slice(10)), save.serial) ||
        tx.agentId !== agent.id || tx.from !== this.agent.work.employer || tx.to !== agent.id || tx.amount !== RESIDENT_LOOP.wage ||
        !integer(jobCycle, state.cycle) || jobCycle < 1 || !integer(tx.period, RESIDENT_LOOP.workPeriods) || tx.period < 1 ||
        !integer(tx.validTicks, RESIDENT_LOOP.periodTicks * RESIDENT_LOOP.workPeriods) || tx.validTicks < tx.period * RESIDENT_LOOP.periodTicks ||
        !integer(tx.workClockTick, state.ticks) || tx.validTicks > tx.workClockTick) return false;
      const periodKey = `${tx.jobId}:${tx.period}`;
      if (retainedPeriods.has(periodKey)) return false;
      retainedPeriods.add(periodKey);
      const job = jobs.find(job => job.id === tx.jobId);
      if (!job) {
        // The 96-row ledger may outlive the eight completed-job history ring.
        // Only already completed cycles older than that ring may lack receipts.
        if (jobCycle > state.completedCycles - state.completedJobs.length) return false;
        continue;
      }
      const receipt = job.receipts.find(receipt => receipt.transactionId === tx.id);
      if (!receipt || !matchesReceipt(tx, job, receipt)) return false;
    }
    for (const event of state.events.filter(event => event.type === 'paid-work')) {
      const job = [...state.completedJobs, ...(state.activeJob ? [state.activeJob] : [])].find(job => job.id === event.jobId);
      const receipt = job?.receipts.find(receipt => receipt.transactionId === event.transactionId);
      if (!receipt || event.tick !== receipt.paidTick || event.period !== receipt.period ||
        event.amount !== receipt.amount || event.validTicks !== receipt.validTicks) return false;
    }
    const context = ['entering-home', 'leaving-home', 'resting-home'].includes(state.stage) ? this.home
      : ['entering-work', 'leaving-work', 'working'].includes(state.stage) ? this.work : null;
    const expectedContext = clone(agent); this._setContext(expectedContext, state);
    if (agent.insideBuildingId !== expectedContext.insideBuildingId || agent.floorId !== expectedContext.floorId ||
      agent.roomId !== expectedContext.roomId || context && Math.abs(agent.y - context.floor.y) > .1) return false;
    if (agent.insideBuildingId) {
      if (!context || agent.insideBuildingId !== context.building.id || agent.floorId !== context.floor.id ||
        agent.roomId && !context.layout.rooms.some(room => room.id === agent.roomId) || !context.clear(agent)) return false;
    } else if (context) {
      if (!context.clear(agent)) return false;
    } else if (!agent.transit && !this.navigation.clear(agent)) return false;
    if (state.stage === 'working') {
      if (!state.activeJob || agent.phase !== 'working') return false;
      const onSite = agent.insideBuildingId === this.work.building.id && agent.roomId === this.work.room.id && gap(agent, this.work.anchor) <= .05;
      if (!onSite && state.waitingReason !== 'absent-from-workstation') return false;
    }
    if (state.stage === 'resting-home' && (agent.phase !== 'resting' || agent.insideBuildingId !== this.home.building.id ||
      agent.roomId !== this.home.room.id || gap(agent, this.home.anchor) > .05)) return false;
    if (agent.transit) {
      const outbound = ['to-origin', 'outbound-tram'].includes(routeStage);
      const returning = ['to-return-stop', 'return-tram'].includes(routeStage);
      if (!outbound && !returning && state.stage !== 'legacy-transit') return false;
      if (outbound || returning) {
        if (agent.transit.originStopId !== (outbound ? RESIDENT_LOOP.fromStopId : RESIDENT_LOOP.toStopId) ||
          agent.transit.destinationStopId !== (outbound ? RESIDENT_LOOP.toStopId : RESIDENT_LOOP.fromStopId)) return false;
      }
      if (['boarding', 'riding', 'alighting'].includes(agent.transit.phase)) {
        const ticket = this.life.transport.citizenPassengers.get(agent.id);
        if (!ticket || ticket.vehicleId !== agent.transit.ticket?.vehicleId ||
          ticket.fromStopId !== agent.transit.originStopId || ticket.toStopId !== agent.transit.destinationStopId) return false;
      }
    } else if (['to-origin', 'outbound-tram', 'to-return-stop', 'return-tram', 'legacy-transit'].includes(routeStage)) return false;
    if (agent.path.some(pose => context ? Math.abs(pose.y - context.floor.y) > .1 || !context.clear(pose)
      : !agent.transit && !this.navigation.clear(pose))) return false;
    if (!agent.transit || agent.transit.phase === 'approach') {
      const remainingPath = [agent, ...agent.path.slice(agent.pathIndex)];
      for (let index = 1; index < remainingPath.length; index++) if (!(context ? context.clearSegment(remainingPath[index - 1], remainingPath[index])
        : this.navigation.clearSegment(remainingPath[index - 1], remainingPath[index]))) return false;
    }
    return true;
  }
  restoreValidated(state) { this.state = clone(state); }
}
