# Third tour offline review — DERIVED, not original run evidence

Reviewed read-only on 2026-10-04. No browser, GPU, gameplay input, build, test, retry, or changes to original source/tool/artifacts were made. This document combines saved evidence with offline geometric calculations; calculations do not recover missing gameplay samples.

## Sources

- Original copied method: `/workspace/scratch/neon-harbor/docs/qa/transit-crossing-repair/continuous-tour-budget-review/capture-harbor-tour-original.mjs`; independently verified SHA-256 `60436d2fe8db8af646c1a02d93f9e70fc3e1ce34181d257a1c3ea39aae850702`.
- Original full snapshot and metadata in that same evidence directory; original periodic log `/tmp/neon-harbor-tour-destination-budget.log`.
- Offline `createHarborVehicleLayout('ferry')` from the frozen built module, plus read-only `src/harbor-transit.js` collider and interaction definitions.

## Actual failure and likely target

Metadata failureAt is `18:57:33.776Z`, route elapsed 2,791,329 ms, case elapsed 2,916,303 ms (48m36s). Failure was a RAF camera-heading wait at copied method 356–357, called from the descending target loop at 409–411. The case remained well inside its 5,400,000 ms / 90-minute budget. This was not the destination-station wait at 425–426.

The full snapshot at first failure has simulationTime 687.4333333330368, lower passengerLocal `(-2.5961293047241165, 1.3, -7.213511147958965)`, revision 11, and ferry-1 moving at 6.681457582232042 m/s with held null. The ferry has stopId null, doorsOpen false, and north arrival 3.470923155824636 nominal simulation seconds away. Use `city.sample.transit`, not the unrelated generic `city.transit` street state.

The planned descending targets are (1) stair top `(1.78, 3.7, .61)`, (2) stair midpoint `(1.78, 2.5, 3.09)`, (3) stair bottom `(1.78, 1.3, 5.57)`, (4) aisle bottom `(0, 1.3, 5.57)`, (5) aisle door level `(0, 1.3, -7.2)`, and (6) port door.inside `(-2.7, 1.3, -7.2)`. Failure local is strongly consistent with the sixth and final door approach. Distances to these targets are respectively 8.964253, 11.194322, 13.511797, 13.044464, 2.596164, and 0.104746 m. The actual active target was not saved, so its index is an inference, not a recovered sample.

Exact XZ distance to door.inside is 0.1047457514950583 m. Method endpoint requires `< .06` at 349/371, leaving 0.0447457514950583 m beyond that tolerance. At the product slow speed `.3` m/s (transit source 303), the geometric lower bound is another 0.149152505 input simulation seconds to cross the tolerance, or 0.349152505 seconds to reach the exact center. These are straight-line calculations, not observed inputs.

## Collider and interaction distinction

Offline calculations included all authored blockers overlapping the lower passenger body's height and the four real boarding-edge colliders appended by transit source 120–125; passenger radius is .3 m. Both the straight residual failure-local→door.inside segment and the authored final aisle `(0,-7.2)`→door.inside segment remain clear. Exact minimum horizontal clearance after subtracting passenger radius is .44 m, at `ferry-door-0-port-boarding-edge`; nearest authored rail residual clearance is .5303356753 m. Both endpoints have `lower-floor-8` support, floor Y 1.3, X bounds ±3.174057730956581, Z [-7.6,-7.125]. Thus the saved endpoint and intended short residual segment are not geometrically blocked. This does not prove that the unrecorded actual path never touched a collider earlier.

Product availableExit at transit source 243–247 requires an actual stopped berth, no significant passenger jump, lower-deck Y within .22, and local distance to the correct door.inside `< 1.25`. The failure position meets the saved spatial door-distance/height conditions by a wide margin, but its actual ferry was moving and stopId null; it was not ready to alight. The tool's 6 cm target requirement is much stricter than the game's 1.25 m interaction contact range and remains an explicit method assertion.

## Why the timeout says 1 ms

Each walkLocal call creates an independent `Date.now() + remaining(150000)` deadline at 345–346. Turning, mouse dispatch, snapshots, and held movement all consume this same wall budget. The loop checks the deadline before mouse movement at 350, but the subsequent heading wait uses `Math.min(15000, Math.max(1, localDeadline-Date.now()))` at 356–357. A reported 1 ms therefore means at most about 1 ms remained when that wait was configured; it is not a separately intended 1 ms walking budget. The absent waypoint-start timestamp prevents exact recovery of this target's elapsed time.

The recorded method uses an incremental input loop, not one uninterrupted key hold: choose the dominant X/Z key, rotate the dragged mouse to a desired heading corrected for the moving vehicle's yaw, await RAF heading agreement, hold Z plus that one key for precision, await local displacement greater than .009 m, release the keys, and take another cabin snapshot (349–365). The final ferry door.inside target has nonzero X, so precision is true (411). The held-input guard uses cumulative observed held simulation seconds `< geometricMetres/.3 + 3` (369). Its actual counters, number of mouse corrections, and precise hold durations are missing in this run; only the method and timeout location are known.

If the final target is door.inside, deriving the aim from the *later saved failure snapshot* gives dominant key `d`, desired heading -1.4508696387083146 rad, saved camera 11.114412837924938 rad, wrapped difference -0.0010881377259193594 rad, already inside the `.025` heading tolerance. This supports an exhausted RAF opportunity, not proof of a persistent bad-heading condition; desired/current values at the actual timeout are missing.

## What the original periodic evidence proves

Original log 137–141 shows actual descent Y 3.594346→3.246278→2.593092→1.719865→1.3, wallMs 2,490,390→2,610,104, sim 636.666667→662.283333. Upper phase at metadata 79451 is `18:51:12.633Z`, sim 623.316667, local `(0.055773, 3.7, .611740)`; failure snapshot later shows a different lower local position near the exit. These establish real net cabin movement and descent.

Late pre-failure log intervals 143–147 advance +3.75, +1.983333, +2.0, +2.666667 simulation seconds per roughly 30 wall seconds, below the earlier 6–9 baseline. Clock advances at each sampled interval; there is no sampled freeze. Failure timing has wallDt 3.1332, dt .25, droppedSeconds 2.8832, droppedTotal 2198.72. These are direct slowdown/clamp observations, not a causal attribution to concurrent CPU work.

Original log 147 (wallMs 2,790,126 / sim 687.183333) is pre-failure. Log 148 (wallMs 2,820,113 / sim 689.183333) is 28.784 seconds after failure, during cleanup; its pose must not replace the first-failure snapshot.

Horizontal periodic world motion includes ferry travel. There are no periodic passengerLocal records or saved ferry cabin waypoints, so continuous passenger input, local stall, exact active target, held-input guard values, and along-path collision cannot be proved from these records.

## Actual evidence gap and reviewable future method options

Copied method 373 appends JSON target/initial/current/samples to `error.message`, but top catch 579 saves only `error.stack`. The retained stack and raw log contain no Cabin diagnostics. Modifying the message after a cached Playwright stack exists did not retain those fields here. Complete `ferry-outbound-cabin-waypoints.json` is written only after `arrived` at 430; this failed before lower-door-ready/arrived, so that file is correctly absent and cannot be recreated as original evidence.

Before any separately authorized future run, a concrete method repair should save a dedicated failure JSON immediately inside walkLocal catch, including active target, initial/current, every actual collected sample, waypoint start/deadline/elapsed time, heldSeconds/geometricMetres, heading desired/observed, error.message, error.stack, and executed method hash. A ride finally should retain each already completed local segment and its actual samples even when a later segment fails. Missing fields from this run remain missing; new records must never be backfilled into old raw artifacts.

Two bounded choices can be reviewed without changing endpoint .06, actual-input stall guard, revision checks, simulation route assertions, 900 s destination wait, or total 90-minute case budget:

1. Retain 150 s per waypoint with exclusive heavy CPU/GPU work for a future authorized run. This preserves the original limits and tests whether baseline simulation progression returns. The evidence does not guarantee a pass or prove CPU contention caused this failure.
2. Predeclare at most 300 wall seconds only for ferry's final lower door.inside approach, keeping every other limit unchanged. It adds slack for turning/RAF overhead under the observed slowdown, without relaxing endpoint or input assertions. A nominal 2.7 m approach at .3 m/s needs 9 input simulation seconds: about 30–45 wall seconds at 6–9 sim/30 s, but about 135 wall seconds at 2 sim/30 s, before input/turning overhead. These are derived scenarios, not the actual missing segment timing or proof that 300 seconds would pass.

The data supports preparing diagnostics and reviewing either finite option; it does not support a blind retry or a game/runtime repair based solely on this failure.
