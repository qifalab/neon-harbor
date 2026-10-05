// Read-only actual control fields, with the same current-relative acceptance
// as native199/8a3. This module never writes game state, clock or storage.
export function ferryControlSnapshot() {
  const s = window.__NEON__.snapshot(), t = s.city.sample.transit;
  return { local: t.passengerLocal, vehicle: t.vehicles.find(v => v.id === t.ridingVehicleId),
    cameraYaw: s.camera?.yaw, cameraPitch: s.camera?.pitch, sensitivity: s.settings.sensitivity,
    time: s.simulationTime, timing: s.timing, teleportRevision: s.teleportRevision,
    deck: t.passengerDeck, riding: t.riding, ridingVehicleId: t.ridingVehicleId, started: s.started, paused: s.paused };
}

export function observedFerryMouseTarget(previous, current, desired) {
  const angle = n => Math.atan2(Math.sin(n), Math.cos(n));
  const dt = current.timing?.dt, elapsed = previous ? current.time - previous.time : null;
  if (!previous || previous.vehicle?.id !== current.vehicle?.id || previous.teleportRevision !== current.teleportRevision ||
    !Number.isFinite(elapsed) || elapsed <= 0 || elapsed > .250001 || !Number.isFinite(dt) || dt <= 0 || dt > .250001)
    return { yaw: desired, advance: 0, compensation: 0 };
  const observedDelta = angle(current.vehicle.yaw - previous.vehicle.yaw);
  if (!Number.isFinite(observedDelta) || Math.abs(observedDelta) > .125) return { yaw: desired, advance: 0, compensation: 0 };
  const limit = Math.min(Math.abs(observedDelta), .125), advance = Math.max(-limit, Math.min(limit, observedDelta * Math.min(1, dt / elapsed)));
  const weight = -Math.expm1(-12 * dt), correction = angle(desired + advance - current.cameraYaw) * (1 / weight - 1);
  const compensation = Math.max(-limit, Math.min(limit, correction));
  return Number.isFinite(advance) && Number.isFinite(compensation) && weight > 0
    ? { yaw: desired + advance + compensation, advance, compensation } : { yaw: desired, advance: 0, compensation: 0 };
}

// One browser RPC returns the actual matched observation. It avoids a remote
// handle/jsonValue/dispose chain, while retaining RAF and wall-clock bounds.
export function waitFerryControlFrame(a) {
  return new Promise((resolve, reject) => {
    let finished = false, raf = null, previousControlFrame = null;
    const remaining = a.deadline - Date.now();
    const timeout = setTimeout(() => end(null, new Error('original finite Ferry control deadline')), Math.max(1, remaining));
    const end = (value, error = null) => {
      if (finished) return; finished = true; clearTimeout(timeout); if (raf !== null) cancelAnimationFrame(raf);
      error ? reject(error) : resolve(value);
    };
    const observe = () => {
      try {
        if (Date.now() >= a.deadline) throw new Error('original finite Ferry control deadline');
        const s = window.__NEON__.snapshot(), t = s.city.sample.transit, local = t.passengerLocal;
        const vehicle = t.vehicles.find(v => v.id === t.ridingVehicleId);
        const current = { local, vehicle, cameraYaw: s.camera?.yaw, cameraPitch: s.camera?.pitch,
          sensitivity: s.settings.sensitivity, time: s.simulationTime, timing: s.timing,
          teleportRevision: s.teleportRevision, deck: t.passengerDeck, riding: t.riding, ridingVehicleId: t.ridingVehicleId,
          started: s.started, paused: s.paused };
        if (s.teleportRevision !== a.revision) throw new Error('original cabin teleport revision');
        if (!s.started || s.paused || !t.riding || t.ridingVehicleId !== a.vehicleId || !local || !vehicle)
          throw new Error('original riding vehicle/passenger unavailable');
        if (!['x', 'y', 'z'].every(k => Number.isFinite(local[k])) || !Number.isFinite(vehicle.yaw) ||
          !Number.isFinite(s.simulationTime)) throw new Error('actual finite Ferry control frame');
        const angle = n => Math.atan2(Math.sin(n), Math.cos(n));
        const localHeading = Math.atan2(a.target.x - local.x, a.target.z - local.z);
        const desired = vehicle.yaw + localHeading - a.offset;
        if (a.mode === 'aim') {
          if (Number.isFinite(current.cameraYaw) && Math.abs(angle(current.cameraYaw - desired)) < .025 &&
            Number.isFinite(current.cameraPitch) && Math.abs(current.cameraPitch - a.pitch) < .003)
            return end({ status: 'MATCHED_FRESH_RELATIVE', current, desired, localHeading, previousControlFrame });
          if (a.requestedYaw == null || Math.abs(angle(desired - a.requestedYaw)) >= .025)
            return end({ status: 'PUBLIC_RELATIVE_REAIM_REQUIRED', current, desired, localHeading, previousControlFrame });
        } else {
          const mx = local.x - a.before.local.x, mz = local.z - a.before.local.z;
          const moved = Math.hypot(mx, mz), projected = mx * a.direction.x + mz * a.direction.z;
          const gap = Math.hypot(a.target.x - local.x, a.target.z - local.z);
          const yawChange = Math.abs(angle(vehicle.yaw - a.before.vehicle.yaw));
          const correctCurrentDirection = Number.isFinite(current.cameraYaw) &&
            Math.abs(angle(current.cameraYaw - (vehicle.yaw + a.localHeading - a.offset))) < .025 &&
            Number.isFinite(current.cameraPitch) && Math.abs(current.cameraPitch - a.pitch) < .003;
          const reason = gap < .06 ? 'endpoint' : !correctCurrentDirection ? 'public-direction-reaim'
            : a.ordinaryApproach && gap <= .7 ? 'actual-ordinary-to-slow-handoff'
            : a.batched && moved > .009 && yawChange > .05 ? 'vehicle-yaw-change'
            : (a.batched ? projected > a.stride : moved > .009) ? 'real-progress' : null;
          if (reason) return end({ local: { ...local }, vehicleYaw: vehicle.yaw, cameraYaw: current.cameraYaw,
            simulationTime: current.time, teleportRevision: current.teleportRevision, deck: current.deck,
            moved, projected, remaining: gap, yawChange, stopReason: reason,
            current, previousControlFrame, correctCurrentDirection, reaimRequired: reason === 'public-direction-reaim' });
        }
        previousControlFrame = current; raf = requestAnimationFrame(observe);
      } catch (error) { end(null, error); }
    };
    observe();
  });
}
