/**
 * District residency is independent of simulation. Collision/terrain metadata
 * stays resident; only the visual district payloads are fetched and disposed.
 */
export class DistrictStreamer {
  constructor({ chunks, load, attach, detach, loadRadius = 150, unloadRadius = 230,
    prefetchDistance = 80, concurrency = 3, maxResidentChunks = 40, unloadDelay = 2 }) {
    this.entries = new Map(chunks.map(meta => [meta.id, { meta, state: 'idle', node: null, bytes: 0, farSince: null, failedAt: -Infinity }]));
    Object.assign(this, { load, attach, detach, loadRadius, unloadRadius, prefetchDistance, concurrency, maxResidentChunks, unloadDelay });
    this.queue = []; this.running = 0; this.clock = 0; this.target = new Set(); this.position = { x: 0, z: 0 };
    this.totalBytes = 0; this.requested = 0; this.unloaded = 0; this.disposedInstances = 0; this.lastPrepareReady = false;
    this.disposed = false; this.prepareGeneration = 0; this.lastSelection = -Infinity;
  }
  distance(meta, point) {
    return Math.hypot(Math.max(0, Math.abs(meta.x - point.x) - meta.hx), Math.max(0, Math.abs(meta.z - point.z) - meta.hz));
  }
  update(position, velocity = { x: 0, z: 0 }, dt = 0) {
    if (this.disposed) return;
    this.clock += Math.max(0, dt); this.position = { x: position.x, z: position.z };
    if (this.clock - this.lastSelection < 0.2) return;
    this.lastSelection = this.clock;
    const speed = Math.hypot(velocity.x || 0, velocity.z || 0);
    const lead = Math.min(this.prefetchDistance, speed * 3);
    const predicted = { x: position.x + (speed ? velocity.x / speed * lead : 0), z: position.z + (speed ? velocity.z / speed * lead : 0) };
    const desired = [...this.entries.values()].filter(entry => this.distance(entry.meta, position) <= this.loadRadius ||
      (lead > 0 && this.distance(entry.meta, predicted) <= this.loadRadius * 0.8));
    desired.sort((a, b) => this.distance(a.meta, position) - this.distance(b.meta, position));
    desired.splice(this.maxResidentChunks);
    this.target = new Set(desired.map(entry => entry.meta.id));
    for (const entry of desired) { entry.farSince = null; this.enqueue(entry); }
    for (const entry of this.entries.values()) {
      if (this.target.has(entry.meta.id)) continue;
      if (entry.state === 'queued') { entry.state = 'idle'; entry.resolve?.(false); entry.resolve = null; }
      if (entry.state === 'loading' && this.distance(entry.meta, position) > this.unloadRadius) { entry.cancelled = true; entry.controller?.abort(); }
      if (entry.state !== 'loaded' || this.distance(entry.meta, position) <= this.unloadRadius) { entry.farSince = null; continue; }
      entry.farSince ??= this.clock;
      if (this.clock - entry.farSince >= this.unloadDelay) this.unload(entry);
    }
    this.enforceBudget(); this.pump();
  }
  enqueue(entry, force = false) {
    if (this.disposed) return Promise.resolve(false);
    if (entry.state === 'loaded') return Promise.resolve(true);
    if (entry.state === 'loading' && entry.cancelled) return entry.promise.then(() => {
      if (this.disposed || !this.target.has(entry.meta.id)) return false;
      const next = this.enqueue(entry, true); this.pump(); return next;
    });
    if (entry.state === 'queued' || entry.state === 'loading') return entry.promise;
    if (entry.state === 'failed' && !force && this.clock - entry.failedAt < 5) return Promise.resolve(false);
    entry.state = 'queued'; entry.error = null;
    entry.promise = new Promise(resolve => { entry.resolve = resolve; });
    this.queue.push(entry); return entry.promise;
  }
  pump() {
    if (this.disposed) return;
    this.queue.sort((a, b) => this.distance(a.meta, this.position) - this.distance(b.meta, this.position));
    while (this.running < this.concurrency && this.queue.length) {
      const entry = this.queue.shift();
      if (entry.state !== 'queued') continue;
      entry.state = 'loading'; entry.controller = new AbortController(); this.running++; this.requested++;
      const controller = entry.controller, resolve = entry.resolve;
      Promise.resolve().then(() => this.load(entry.meta, controller.signal)).then(result => {
        if (this.disposed) { this.disposedInstances += this.detach(result.node, entry.meta) || 0; entry.state = 'disposed'; resolve?.(false); return; }
        if (entry.cancelled) { this.disposedInstances += this.detach(result.node, entry.meta) || 0; entry.state = 'idle'; entry.cancelled = false; resolve?.(false); return; }
        entry.node = result.node; entry.bytes = result.bytes || 0; entry.instances = result.instances || 0; entry.meshes = result.meshes || 0;
        entry.state = 'loaded'; this.totalBytes += entry.bytes; this.attach(entry.node, entry.meta);
        resolve?.(true); this.enforceBudget();
      }).catch(error => {
        entry.error = String(error?.message || error); entry.state = this.disposed ? 'disposed' : entry.cancelled ? 'idle' : 'failed'; entry.cancelled = false; entry.failedAt = this.clock;
        resolve?.(false);
      }).finally(() => {
        if (entry.resolve === resolve) entry.resolve = null;
        if (entry.controller === controller) entry.controller = null;
        this.running--; this.pump();
      });
    }
  }
  async prepare(position) {
    if (this.disposed) return { ready: false, failed: [], loaded: 0, disposed: true };
    const generation = ++this.prepareGeneration;
    this.lastSelection = -Infinity; this.update(position, { x: 0, z: 0 }, 0);
    const entries = [...this.target].map(id => this.entries.get(id));
    const promises = entries.map(entry => this.enqueue(entry)); this.pump();
    await Promise.all(promises);
    const failed = entries.filter(entry => entry.state !== 'loaded').map(entry => entry.meta.id);
    const ready = failed.length === 0;
    if (generation === this.prepareGeneration) this.lastPrepareReady = ready;
    return { ready, failed, loaded: this.stats.loaded };
  }
  async retry(position = this.position) {
    for (const entry of this.entries.values()) if (entry.state === 'failed') entry.failedAt = -Infinity;
    return this.prepare(position);
  }
  unload(entry) {
    if (entry.state !== 'loaded') return;
    this.disposedInstances += this.detach(entry.node, entry.meta) || 0;
    entry.node = null; entry.state = 'idle'; entry.bytes = 0; entry.instances = 0; entry.meshes = 0; entry.farSince = null; this.unloaded++;
  }
  enforceBudget() {
    const loaded = [...this.entries.values()].filter(entry => entry.state === 'loaded');
    if (loaded.length <= this.maxResidentChunks) return;
    const candidates = loaded.filter(entry => !this.target.has(entry.meta.id))
      .sort((a, b) => this.distance(b.meta, this.position) - this.distance(a.meta, this.position));
    while (loaded.length > this.maxResidentChunks && candidates.length) { this.unload(candidates.shift()); loaded.pop(); }
  }
  get stats() {
    const entries = [...this.entries.values()], loaded = entries.filter(e => e.state === 'loaded');
    const historicalFailedChunks = entries.filter(e => e.state === 'failed').map(e => e.meta.id);
    const failedChunks = historicalFailedChunks.filter(id => this.target.has(id));
    return { ready: !this.disposed && [...this.target].every(id => this.entries.get(id).state === 'loaded'), lastPrepareReady: this.lastPrepareReady,
      loaded: loaded.length, pending: entries.filter(e => e.state === 'loading' || e.state === 'queued').length,
      failed: failedChunks.length, failedChunks, historicalFailedChunks, bytes: this.totalBytes, residentBytes: loaded.reduce((sum, e) => sum + e.bytes, 0),
      residentMeshes: loaded.reduce((sum, e) => sum + e.meshes, 0),
      residentInstances: loaded.reduce((sum, e) => sum + e.instances, 0),
      requested: this.requested, unloaded: this.unloaded, disposedInstances: this.disposedInstances,
      activeChunks: loaded.map(e => e.meta.id).sort(), targetChunks: [...this.target].sort(),
      maxResidentChunks: this.maxResidentChunks, loadRadius: this.loadRadius, unloadRadius: this.unloadRadius };
  }
  dispose() {
    this.disposed = true;
    for (const entry of this.entries.values()) {
      entry.controller?.abort(); entry.resolve?.(false);
      if (entry.state === 'loaded') this.unload(entry);
      entry.state = 'disposed';
    }
    this.target.clear(); this.queue.length = 0;
  }
}

/** Chunk payloads are real static scene data, never executable JavaScript. */
export function validateCityChunk(data, id) {
  if (!data || data.version !== 1 || data.id !== id || !Array.isArray(data.batches) || data.batches.length > 200)
    throw new Error(`Invalid city district ${id}`);
  let count = 0;
  for (const batch of data.batches) {
    if (typeof batch.kind !== 'string' || typeof batch.material !== 'string' || !Array.isArray(batch.transforms))
      throw new Error(`Invalid district batch ${id}`);
    count += batch.transforms.length;
    if (count > 50000) throw new Error(`District too large ${id}`);
    for (const t of batch.transforms) if (!Array.isArray(t) || t.length !== 9 || !t.every(Number.isFinite) || t.slice(3, 6).some(n => n <= 0))
      throw new Error(`Invalid district transform ${id}`);
  }
  return data;
}
