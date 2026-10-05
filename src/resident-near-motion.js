// Near presentation only. The licensed skeleton, actor world transform and
// gameplay gait stay owned by their original callers. No new asset is loaded.
export function createResidentNearMotion(THREE, scene) {
  const root = scene.getObjectByName('root'), spine = scene.getObjectByName('spine03'), head = scene.getObjectByName('head');
  const rest = new Map();
  for (const bone of [root, spine, head]) if (bone) rest.set(bone, { position: bone.position.clone(), quaternion: bone.quaternion.clone() });
  scene.updateMatrixWorld(true);
  const inverseScene = scene.matrixWorld.clone().invert();
  const legs = ['L', 'R'].map((side, index) => {
    const hip = scene.getObjectByName(`upperleg01_${side}`), knee = scene.getObjectByName(`lowerleg01_${side}`), foot = scene.getObjectByName(`foot_${side}`);
    if (!hip || !knee || !foot) return null;
    const bindFoot = foot.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverseScene);
    return { hip, knee, foot, bindFoot, upper: knee.position.clone(), lower: foot.position.clone(),
      footQuaternion: foot.quaternion.clone(), offset: index * .5, planted: false, anchor: new THREE.Vector3(), posedFoot: foot.getWorldPosition(new THREE.Vector3()) };
  });
  if (!root || !spine || !head || legs.some(leg => !leg)) return null;
  const previous = new THREE.Vector3(), current = new THREE.Vector3(), forward = new THREE.Vector3();
  const direction = new THREE.Vector3(), bend = new THREE.Vector3(), hipWorld = new THREE.Vector3(), kneeWorld = new THREE.Vector3();
  const target = new THREE.Vector3(), local = new THREE.Vector3(), desired = new THREE.Vector3(), q = new THREE.Quaternion(), footWorld = new THREE.Quaternion();
  const controlled = [...rest.keys(), ...legs.flatMap(leg => [leg.hip, leg.knee, leg.foot]),
    ...['L', 'R'].flatMap(side => [scene.getObjectByName(`upperarm01_${side}`), scene.getObjectByName(`lowerarm01_${side}`)])];
  let initialized = false, distancePhase = 0, previousTime = null, previousGround = null, lastMode = 'legacy', contacts = [], resetCount = 0, lastMotion = null, settledStride = false;
  const cachedPose = controlled.map(bone => ({ bone, position: bone.position.clone(), quaternion: bone.quaternion.clone() }));
  const cachePose = () => { for (const pose of cachedPose) { pose.position.copy(pose.bone.position); pose.quaternion.copy(pose.bone.quaternion); } };
  const wrap = value => ((value % 1) + 1) % 1;
  function solve(leg, ankle, actor) {
    leg.hip.getWorldPosition(hipWorld); direction.copy(ankle).sub(hipWorld);
    const scale = actor.getWorldScale(local).y, a = leg.upper.length() * scale, b = leg.lower.length() * scale;
    const rawDistance = direction.length(), distance = Math.max(.001, Math.min(a + b - .00001, rawDistance));
    direction.normalize();
    bend.copy(forward).addScaledVector(direction, -forward.dot(direction)).normalize();
    const along = (a * a + distance * distance - b * b) / (2 * distance);
    const across = Math.sqrt(Math.max(0, a * a - along * along));
    kneeWorld.copy(hipWorld).addScaledVector(direction, along).addScaledVector(bend, across);
    local.copy(kneeWorld); leg.hip.parent.worldToLocal(local); local.sub(leg.hip.position).normalize();
    leg.hip.quaternion.setFromUnitVectors(desired.copy(leg.upper).normalize(), local);
    leg.hip.updateWorldMatrix(false, true);
    local.copy(ankle); leg.knee.parent.worldToLocal(local); local.sub(leg.knee.position).normalize();
    leg.knee.quaternion.setFromUnitVectors(desired.copy(leg.lower).normalize(), local);
    leg.knee.updateWorldMatrix(false, true);
    leg.foot.parent.getWorldQuaternion(q).invert();
    leg.foot.quaternion.copy(q).multiply(footWorld).multiply(leg.footQuaternion);
    leg.foot.updateWorldMatrix(false, true);
    return rawDistance <= a + b + .001;
  }
  function update(actor, motion) {
    if (!motion || !Number.isFinite(motion.time)) return;
    // A presentation frame can call both setDetail and updateLOD. Consume the
    // caller's motion sample once; repeated synchronization restores that pose.
    if (motion === lastMotion) {
      for (const pose of cachedPose) { pose.bone.position.copy(pose.position); pose.bone.quaternion.copy(pose.quaternion); }
      return;
    }
    lastMotion = motion;
    actor.updateWorldMatrix(true, false); actor.getWorldPosition(current);
    const ground = Number.isFinite(motion.groundY) ? (actor.parent ? actor.parent.localToWorld(local.set(actor.position.x, motion.groundY, actor.position.z)).y : motion.groundY) : current.y;
    const dt = previousTime === null ? 0 : motion.time - previousTime;
    const delta = initialized ? Math.hypot(current.x - previous.x, current.z - previous.z) : 0;
    const vertical = initialized ? Math.abs(ground - previousGround) : 0;
    const continuous = initialized && dt >= 0 && dt <= .3 && delta < .65 && (dt > .00001 || delta < .00001);
    const speed = continuous && dt > .00001 ? delta / dt : 0;
    // Stairs, sprinting and discontinuous public teleports retain the original
    // limb API. This finite layer is authored for level, human-speed movement.
    const supported = !motion.sprinting && ((!initialized && !motion.walking) || (continuous && vertical < .003 && speed <= 2.6));
    previous.copy(current); previousTime = motion.time; previousGround = ground; initialized = true;
    for (const [bone, bind] of rest) { bone.position.copy(bind.position); bone.quaternion.copy(bind.quaternion); }
    for (const leg of legs) leg.foot.quaternion.copy(leg.footQuaternion);
    if (!supported) { for (const leg of legs) leg.planted = false; lastMode = 'legacy'; contacts = []; settledStride = false; cachePose(); return; }
    actor.getWorldQuaternion(footWorld); forward.set(0, 0, 1).applyQuaternion(footWorld).normalize();
    const moving = motion.walking && continuous && delta > .00001;
    if (moving) distancePhase += delta / .78;
    if (moving) settledStride = false;
    else if (lastMode === 'supported-level-walk') settledStride = true;
    const breath = Math.sin(motion.time * 1.75), weight = Math.sin(motion.time * .56);
    root.position.y -= moving || settledStride ? .035 : .006;
    root.position.x += moving ? Math.sin(distancePhase * Math.PI * 2) * .008 : weight * .009;
    spine.rotation.x += breath * .004 + (motion.activity === 'working' ? .018 : 0);
    spine.rotation.z += moving ? -Math.sin(distancePhase * Math.PI * 2) * .008 : -weight * .007;
    head.rotation.x += breath * .005; head.rotation.z -= spine.rotation.z * .5;
    // Arm and hand props keep their original activity signals. A small elbow
    // release avoids a rigid straight-arm idle; working reaches remain visual.
    for (const side of ['L', 'R']) {
      const shoulder = scene.getObjectByName(`upperarm01_${side}`), elbow = scene.getObjectByName(`lowerarm01_${side}`);
      if (moving && Math.abs(elbow.rotation.x) < .4 && Math.abs(shoulder.rotation.x) < .5) {
        shoulder.rotation.x = Math.cos(distancePhase * Math.PI * 2) * (side === 'L' ? .22 : -.22);
      }
      shoulder.rotation.z += (side === 'L' ? -1 : 1) * .025;
      elbow.rotation.x -= .035;
      if (motion.activity === 'working' && side === 'R') { shoulder.rotation.x -= .25; elbow.rotation.x -= .18; }
    }
    scene.updateWorldMatrix(true, true); contacts = [];
    for (const leg of legs) {
      const cycle = wrap(distancePhase + leg.offset), stance = !moving || cycle < .56;
      const fresh = !leg.planted || !continuous || lastMode === 'legacy';
      if (!moving && continuous && lastMode === 'supported-level-walk') {
        // Keep the final real foot positions when stopping, then lower the
        // swing sole. Feet do not snap twenty centimetres back to bind pose.
        leg.anchor.copy(leg.posedFoot); leg.planted = true;
      } else if ((!moving && fresh) || (moving && stance && fresh)) {
        target.copy(leg.bindFoot);
        if (moving) target.z += .2184;
        actor.localToWorld(leg.anchor.copy(target)); leg.anchor.y += ground - current.y; leg.planted = true;
      }
      if (stance) {
        if (!moving) {
          const groundAnkleY = actor.localToWorld(local.copy(leg.bindFoot)).y + ground - current.y;
          leg.anchor.y += (groundAnkleY - leg.anchor.y) * Math.min(1, Math.max(0, dt) * 12);
        }
        target.copy(leg.anchor);
        // Release excessive anchors after a sharp turn rather than stretching
        // bones or moving the actor. Such resets remain observable for review.
        local.copy(target); actor.worldToLocal(local);
        if (Math.hypot(local.x - leg.bindFoot.x, local.z - leg.bindFoot.z) > .34) {
          actor.localToWorld(leg.anchor.copy(leg.bindFoot)); leg.anchor.y += ground - current.y; target.copy(leg.anchor); resetCount++;
        }
      } else {
        leg.planted = false; const swing = (cycle - .56) / .44;
        target.copy(leg.bindFoot); target.z += -.2184 + .4368 * (swing * swing * (3 - 2 * swing));
        target.y += Math.sin(swing * Math.PI) * .075; actor.localToWorld(target); target.y += ground - current.y;
      }
      const reachable = solve(leg, target, actor);
      leg.foot.getWorldPosition(leg.posedFoot);
      const groundAnkleY = actor.localToWorld(local.copy(leg.bindFoot)).y + ground - current.y;
      contacts.push({ side: leg.offset ? 'right' : 'left', stance: stance && Math.abs(target.y - groundAnkleY) < .003, reachable, ankleTarget: target.toArray() });
    }
    lastMode = moving ? 'supported-level-walk' : 'supported-idle';
    cachePose();
  }
  return { update, snapshot: () => ({ mode: lastMode, distancePhase, resetCount, contacts: contacts.map(c => ({ ...c, ankleTarget: [...c.ankleTarget] })) }) };
}
