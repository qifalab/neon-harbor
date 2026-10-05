// UNEXECUTED /tmp proposal fragment. Does not alter ROOT or assert a PASS.
// Integrate only after review. Existing cabinMotion and angle are unchanged.
// At the two ferry walkLocal call sites, pass batchProgress: kind === 'ferry'.

async function walkLocalCandidate(page, target, pointer, { precision = true, batchProgress = false } = {}) {
  const start = await cabinMotion(page), deadline = Date.now() + 150000, samples = [start];
  let current = start;
  const secondaryErrors = [];
  try {
    for (let step = 0; Math.hypot(target.x - current.local.x, target.z - current.local.z) >= .06 && step < 1800; step++) {
      expect(Date.now(), 'local walking retains its wall-clock deadline').toBeLessThan(deadline);
      const dx = target.x - current.local.x, dz = target.z - current.local.z;
      const distance = Math.hypot(dx, dz);
      const key = Math.abs(dx) > Math.abs(dz) ? dx > 0 ? 'a' : 'd' : dz > 0 ? 'w' : 's';
      const offset = { w: 0, s: Math.PI, a: Math.PI / 2, d: -Math.PI / 2 }[key];
      const desired = current.vehicle.yaw + Math.atan2(dx, dz) - offset;
      const delta = angle(desired - pointer.orbitYaw);
      if (Math.abs(delta) > .002) {
        pointer.x -= delta / (.005 * current.sensitivity);
        await page.mouse.move(pointer.x, pointer.y);
        pointer.orbitYaw = desired;
        await page.waitForFunction(yaw => {
          const actual = window.__NEON__.snapshot().camera.yaw;
          return Math.abs(Math.atan2(Math.sin(actual - yaw), Math.cos(actual - yaw))) < .025;
        }, desired, { polling: 'raf', timeout: Math.min(15000, Math.max(1, deadline - Date.now())) });
      }
      const slow = precision || distance < 1.2;
      // Only precision ferry segments batch; short endpoint corrections stay .009.
      const stride = batchProgress && precision ? distance >= 1.2 ? .225 : distance >= .45 ? .075 : .009 : .009;
      let firstError = null;
      const preserve = (error, stage) => {
        if (!firstError) firstError = error;
        else if (error !== firstError) secondaryErrors.push({ stage, message: error.message, stack: error.stack });
      };
      try {
        if (slow) await page.keyboard.down('z');
        await page.keyboard.down(key);
        await page.waitForFunction(({ before, target, direction, stride, batched }) => {
          const p = window.__NEON__.snapshot().city.sample.transit.passengerLocal;
          if (!p) return false;
          if (Math.hypot(target.x - p.x, target.z - p.z) < .06) return true;
          const mx = p.x - before.x, mz = p.z - before.z;
          return batched ? mx * direction.x + mz * direction.z > stride : Math.hypot(mx, mz) > .009;
        }, { before: current.local, target, direction: { x: dx / distance, z: dz / distance }, stride,
          batched: batchProgress && precision && distance >= .45 },
        { polling: 'raf', timeout: Math.max(1, deadline - Date.now()) });
      } catch (error) { preserve(error, 'real movement'); }
      finally {
        try { await page.keyboard.up(key); } catch (error) { preserve(error, `release ${key}`); }
        if (slow) {
          try { await page.keyboard.up('z'); } catch (error) { preserve(error, 'release z'); }
        }
      }
      if (firstError) throw firstError;
      current = await cabinMotion(page); samples.push({ ...current, key, slow });
      expect(current.teleportRevision, 'cabin movement must not relocate the player').toBe(start.teleportRevision);
    }
    expect(Math.hypot(target.x - current.local.x, target.z - current.local.z), 'actual local waypoint reached').toBeLessThan(.06);
    if (target.y != null) expect(Math.abs(current.local.y - target.y)).toBeLessThan(.15);
  } catch (error) {
    error.message += `\nCabin movement diagnostics: ${JSON.stringify({ target, start, current, samples, secondaryErrors })}`;
    throw error;
  }
  return samples;
}

// Use around each original upper/lower pointer-held route body. Retains first error.
async function routeWithPointerCleanupCandidate(page, routeBody) {
  let firstError = null;
  const secondaryErrors = [];
  try { await routeBody(); } catch (error) { firstError = error; }
  try { await page.mouse.up(); }
  catch (error) {
    if (!firstError) firstError = error;
    else secondaryErrors.push({ stage: 'release pointer', message: error.message, stack: error.stack });
  }
  if (firstError) {
    firstError.message += `\nPointer cleanup secondary errors: ${JSON.stringify(secondaryErrors)}`;
    throw firstError;
  }
}
