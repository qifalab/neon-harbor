/** The optional state argument exists only for CPU preparation checks. Native
 * callers supply expectedRevision alone, so this reads the actual game snapshot.
 * No state setter, render invocation, clock update or GL call is involved. */
export function currentRenderedCamera({expectedRevision,state}) {
 const s=state??globalThis.window.__NEON__.snapshot(),c=s.camera,subject=s.presentation?.subject;
 if(s.teleportRevision!==expectedRevision||!c||c.fov!==65||!Number.isFinite(c.yaw)||!Number.isFinite(c.pitch))return false;
 if(!subject||!['x','y','z'].every(axis=>Number.isFinite(subject[axis])))return false;
 for(const point of[c.position,c.target,c.focus])if(!point||!['x','y','z'].every(axis=>Number.isFinite(point[axis])))return false;
 return Math.hypot(c.position.x-subject.x,c.position.y-subject.y-1.62,c.position.z-subject.z)<.03;
}
export function phaseTimeout(now,wholeDeadline,phaseDeadline) {
 const result=Math.min(60000,wholeDeadline-now,phaseDeadline-now);
 if(result<=0)throw new Error('Current render readiness phase/whole-case deadline exhausted');
 return result;
}
