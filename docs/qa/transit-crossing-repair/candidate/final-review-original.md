# Harbor crossing deadlock: verified temporary patch

The shared source/dist/tools were not edited. The proposed patch is `/tmp/harbor-life-fix-v5.patch`; tested module SHA-256 is `034cb5b4b1851071507c30c0cd36a250f0e8252c394ac28df6627de18b0acc5d`. Baseline shared `src/harbor-life.js` remains `6122d6738f36ee281277c80c1c8e7f777a87498295571f568f18be30f10927f8` at preparation.

## Actual failure mechanism

Pure Node `createCityExploration` + `GameSimulation` + the unchanged world.step at 1/60 reproduced the recorded bus exactly: `(152,140.7459745308214)`, yaw `.012862887687415945`, held pedestrian, committed `(160,160,z,+1)`. At 150 simulated seconds resident18 was `(154.06700000000228,148)`, with old saved claim `harbor-crossing-z:160:146` but actual target `(168,148)` marked `harbor-crossing-x:160:146`.

Its next walking step `(154.2300000000023,148)` intersected traffic-5 at `(155.89247437031995,149.3791309080459)`, yaw `3.1412322878205847`, speed0. Traffic-5's pedestrian hook returned0 while the resident waited for its body; the unrelated bus also waited for that same resident. The bus is 11m long, and the shared hook gap receives a further 3.28m front adjustment. The previous code used only the pedestrian's current forward/side coordinate, claimed the next street leg only if no previous claim existed, and cleared claims on null target flags even though actual paths contain small zigzag/null segments inside a carriageway.

North-shore CitizenJourneys is excluded by its actual navigation coordinates at this south-shore position. Vehicle committed status exempts traffic lights, not real pedestrians.

Raw evidence:

- `/tmp/harbor-life-bus-deadlock-world.mjs` and `.json`: full existing world, exact recorded bus pose, 300 simulated seconds.
- `/tmp/harbor-life-bus-deadlock-actual-cars.json`: actual blocking sedan and next-step contact.
- `/tmp/harbor-life-deadlocked-save.json`: validated life/fleet plus original runtime car state at150s.

## Final proposal

The patch retains the normal .6 walking avoidance radius, existing phases, schema/version, saved paths, economic clocks, original test timeouts and 50m traffic lookahead.

1. Follow the actual remaining path until the full pedestrian body reaches the real road edge, including zigzags and null flags. Keep a claim while physically inside the carriageway. A new orthogonal leg at the road corner waits for its own green light; old saved stale IDs are canonicalized for a person already inside the actual current road.
2. Before entering from the curb, check the complete path against existing full vehicle bodies with the shared capsule/swept circle solver. If a vehicle already occupies it, the pedestrian remains at the curb without blocking that vehicle with a new claim.
3. Reserve the actual remaining polyline in vehicle coordinates instead of waiting for the person to come within a fixed lateral strip. This covers the path's real ±2m lane offset and turning/near-parallel vehicles.
4. A real current .6 contact or the public vehicle's next full swept timestep always protects the person before any path bound can omit it. A vehicle already occupying the actual polyline may clear past a pedestrian waiting outside its side only when the current body and its next actual route sweep are clear. Other pedestrians remain independently protected.

All geometry checks use clones; rendering, positions, fleet clocks and inventories are not mutated by traffic queries. No retreat phase or extra save field was introduced.

## Verified results

`node --test /tmp/harbor-life-fix-v5/tests/harbor-life.test.js`: 14/14 passed, 0 failed/skipped, 8.52s. Full output `/tmp/harbor-life-fix-v5-test-results.txt`.

`node /tmp/harbor-life-bus-fixed-v5-world.mjs`: actual fresh city, all original street cars and public bus/tram, 12,000 steps (200s). Bus2 reached market once, was at `(200,168)` at140s, then reached lantern stop `(248,60)` at180s. This first fresh run checked street residents without transit state against all actual car/public-vehicle OBBs with both .43 entity radius and original .6 avoidance radius: **0 contacts for either radius**. Its filter incorrectly omitted approach/waiting commuters, so it is retained as a superseded scan. The corrected full all-phase run completed with exit0: only insideBuildingId and boarding/riding/alighting are excluded; actual approach/waiting/waiting-transit street bodies remain included. All12,000 steps have0 .43 and0 .6 contacts, marketArrivals1, money2972/goods300. Final complete evidence is /tmp/harbor-life-bus-fixed-v5-allphases-world.{mjs,log,json}, /tmp/harbor-life-bus-fixed-v5-allphases-world-summary.json and /tmp/harbor-life-bus-fixed-v5-allphases-fullstate.json. Money2972/goods300 remained conserved. Full trajectory, summary and state are `/tmp/harbor-life-bus-fixed-v5-world.json`, `/tmp/harbor-life-bus-fixed-v5-world-summary.json`, `/tmp/harbor-life-bus-fixed-v5-fullstate.json`.

Independent public-save restore of the original deadlocked life/fleet with the application's normal fresh street-car creation: bus2 reached market at13.8666667s, travelled332.0997367m in90s. 5,400 steps kept money2972 and goods300 with zero error; .43 and .6 initial contact counts, total contacts, new episodes and maximum depth were all0. Evidence `/tmp/harbor-life-v5-oldsave-recovery-review.json`.

Actual tram corner counterexample `(235.93460490463215,144)`, service111.76: current body clear, next nominal pose colliding, swept solver1 contact, final life hook0. This protects the real upcoming contact even after the pedestrian has crossed beyond a nominal projected lane strip.

A synthetic restore preserving all old *runtime* car positions (which ordinary public saves do not persist) exposed a separate traffic-3/bus queue admission conflict after the original resident had reached work. That extra vehicle-to-vehicle conflict is not counted as a successful full route, and this proposal does not add reversing or relax the route's existing wait limits to conceal it.

## QA number update after application

The existing 06:00, .1s ×8400 independent-life command still gives26 purchases,4 deliveries,22 missed periods, consumption12 produce/4 tea/10 meal and unchanged shop stock/sold/received. Wages become99, and this particular snapshot is34,998 bytes. Conserved totals remain2972/300. Shared QA documentation has not been updated before application.

Independent direct-method cases:25/25 passed against the frozen final module, covering sedan/bus/tram front/side/rear, oblique and nearly parallel geometry, actual next route sweep, old/new leg signal separation, full-body curb admission and zigzag/null-marker carriageway retention. Evidence /tmp/harbor-life-v5-method-cases-review.{mjs,json}.
