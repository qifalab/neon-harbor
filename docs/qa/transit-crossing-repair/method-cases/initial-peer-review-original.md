# Harbor transit / pedestrian review

Read-only source review and pure Node geometry recomputation; no shared source,
dist, tools, or WebGL changes. Reviewed the draft at
`/tmp/harbor-life-fix/src/harbor-life.js`.

## Observed failures

1. The actual crossing line differs from its nominal lane by up to 2 m.
   The natural bus-2 failure has the vertical crossing at x=224, although the
   crossing descriptor names lane 226. Reservation must use the actual path.
2. A completed crossing ID survives an orthogonal next leg. Fresh next legs
   need their own signal. Clearing the ID at the completed safe endpoint fixes
   that transition; an already-in-carriageway old save needs physical recovery.
3. Reserving only when the current person is within 5 m of a lane is too late:
   the complete remaining crossing segment must reserve each intersecting lane.
4. Current side clearance alone is insufficient for turning vehicles.

## Original stopped pairs: future bus geometry

The bus route phase was recovered from its piece `remaining` value and then
sampled at 0.01 service-second intervals for seven service seconds. With a
stationary person of radius .6 and the actual transit collision shell
(bus hx=1.355, hz=5.58), there were no contacts for either original pair:

| Evidence | Bus route phase | Fixed person | Minimum local side |
| --- | ---: | --- | ---: |
| coupled world | 13.365326353765568 | (154.06700000000228,148) | 1.9735238638828978 |
| natural no-sedan case | 36.20661460247669 | (224,165.9549999999992) | 1.987049723501647 |

Both margins increased as those particular buses cleared. This validates those
specific pairs, not a general current-side-only exception.

## Concrete turning tram counterexample

The actual navigation route from the south-093 home to harbor-tram-lantern
contains crossing-x:240:146 with the actual segment (230,144) -> (252,144).
A legal point on that segment is (235.93460490463215,144).

At tram route serviceTime=111.76:

- centre=(232.6823729213,142.4172882022), yaw=.5823086391;
- current circleOBB with person radius .6 and tram hx=1.23/hz=4.58 is false;
- both sin(yaw) and cos(yaw) are below .85, so the original angle filter skips;
- route serviceTime+.05 already overlaps that fixed person;
- moveVehicle's existing swept solver reports one contact for that .05 step.

Directly calling the latest reviewed draft still returns Infinity for this
person. Even after the .85 filter is removed and radius projection corrected,
the *remaining-path lane slab* check continues early because the person has
just cleared the current strip by about 1.6 cm. The later mayClear sweep is
therefore never called. A real turning vehicle sweeps back into the person.

The actual current/next-swept contact guard must run before every projection
early-out (normal, longitudinal lookahead, or remaining-path slab), not only
inside the mayClear exception. This example should be a regression fixture.

## Capsule projection

Use (body.hx + radius)/abs(normalSpeed) for the oblique lane interval. Leaving
radius outside the division under-reserves by .09282 m at 30 degrees, .10588 m
at normalSpeed=.85, and .24853 m at 45 degrees for radius .6.

Near-parallel or rapidly turning poses also need the actual contact guard.
A far centre-line intersection does not imply the present long vehicle's
corner cannot touch the pedestrian in its next movement step.

## Acceptance requirements

- Fresh orthogonal crossing legs recheck their own signal at the safe endpoint.
- Actual remaining path lines, not nominal descriptor lanes, reserve vehicles.
- Every existing relevant claimant remains considered individually.
- Occupied-line clearance is only allowed when current and next swept bodies
  are physically safe for that person; a person in the corridor still holds it.
- Old saves physically finish or retreat along clear legal space, using normal
  speed bounds. Do not erase a still-occupied declaration to release a vehicle.
- A conservative .6 m buffer overlap may require a monotonic real escape step;
  simply rejecting every step still inside that buffer can preserve deadlock.
- Require exact old-save recovery and fresh coupled-world completion, not only
  no-overlap counts. The initial draft's fresh world had zero .43 contacts but
  still stranded bus-2, so collision safety alone is not completion.
