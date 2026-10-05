# Six shop frontage geometry v2: full outdoor cardinal audit

**Source-only result:** the proposed six wide-view out-and-back routes and revised complete planned outdoor cardinal legs through the original door station are clear against the explicitly modelled static colliders and conservative authored lower geometry. The original 092 and 096 routes contain lamp collisions; their outbound and return sides both require the authorized outside-corner detour. 090/091/094/095 retain their original outdoor legs.

This v2 supersedes the current proposal portion of [the sealed first review](/tmp/neon-frontage-wide-static-geometry-2026-10-05/review.md). That earlier report/JSON/ledger remains unchanged. V2 adds all six original outdoor route and endpoint-circle flags, the complete revised outdoor route checks, both 092/096 outbound/return detours, and exact baseline/authored runtime source-pin dictionaries. It does not certify interior legs, E scene transitions, native walking, wall-clock completion, moving vehicles, rendered framing or art acceptance.

No ROOT, original package, original evidence, candidate route, input helper, or deadline was changed by this agent. No product source was imported or executed; no world, renderer, browser, GPU, test, build or network was used. Only independent /tmp geometry scripts and reports were produced. The parent prepares the concrete candidate and controls its separately authorized budget.

## Exact delivery shape

`geometry.json` has `cases[shop]` with exact `wideStanding`, `originalDoorStation`, `publicDoor`, `outwardWaypoints`, `returnWaypoints` and `fixtureDetour`. For **092 and 096**, `fixtureDetour.outboundWaypoints` and `fixtureDetour.waypoints` / `returnWaypoints` contain exact cardinal source coordinates; the other four have null detours. The original photos retain their coordinates. `sourceHashes.baseline` and `.authored` use relative `src/...` keys directly comparable to the collector's `runtime.hashes`. Each key matches the original actual native verified runtime dictionary, the frozen expected mode dictionary and that mode's Git blob. The baseline intentionally omits authored-only `src/harbor-frontage-profiles.js`; its absence is not presented as a baseline door-metadata fix.

Authored source is ef92 `ef92c25980f1da12b508971170b72b9dd6230059`; baseline is D2 `7a90f7934b7c9d1af5c4494bf08c4ec337c373e4`. The original captured eight-address dictionary exactly matches the ef92 native `actualAddressCatalogue`. Historical actual dimensions for all 96 south shells are usable because their frozen `world.js`/`world-config.js` hashes equal ef92. All source pins also match current authored Git blobs. Baseline differences in `harbor-district.js`, `city-exploration.js` and `harbor-transit-renderer.js` were read statically: permanent collider/support rules are unchanged; art/factory/owner/render additions do not move those solids. Original baseline arches (max out .795), sill .81 and panel .55 fit the conservative authored lower profile bound .855; shared lower props are unchanged.

## Six added wide views

Actual public plane is `face = building.z + depth/2`, then `publicDoorZ=face+.64`. All proposed wide stations have **9m perpendicular distance to that plane** and ground support **y=0**. The two L stations have horizontal door-center distance **23.30772404161333m**, rather than 9m. All preserved door stations have y=.18.

| Shop | Original door station X,Z | Wide X,Z,Y | Added route |
| --- | --- | --- | --- |
| 090 | 187,145.42007884336635 | 187,153.06007884336634,0 | +Z, reverse −Z |
| 091 | 213,117.67839586455375 | 234.5,125.31839586455375,0 | X to 234.5, +Z; reverse Z then X |
| 092 | 213,144.11998675437644 | 213,151.75998675437643,0 | +Z, reverse −Z |
| 094 | 187,223.75940199801698 | 187,231.39940199801697,0 | +Z, reverse −Z |
| 095 | 213,198.95595548301935 | 234.5,206.59595548301934,0 | X to 234.5, +Z; reverse Z then X |
| 096 | 213,224.31897145090625 | 213,231.95897145090623,0 | +Z, reverse −Z |

Added physics tube minimum clearance is .95m for every shop. Conservative authored lower solid minimum is .345m for 090/094 and .365m for the other four. Literal straight normal retreat for 091/095 is blocked by the next row; x=233 also intersects 095's far-left full-width view ray. x=234.5 is the checked L location.

The exact horizontal view polygon covers the complete ±.15m observer square and both full shell-width-plus-.5m endpoints on the public door plane. It is clear of every other south shell, modelled tall street obstacle and other shop's conservative lower geometry. **095 is the tightest other-shell view margin, .09682625155048409m**, against 096; 091 has 1.401069863624089m. This is a conservative source-level horizontal visibility condition at eye/door-center height, not a native claim of unobscured full-height framing. Own shop props remain part of the photographed scene.

## Full original and revised outdoor routes

All original cardinal points, every leg's static/body-envelope minimum and all endpoint circles are in `originalOutdoorCardinalRouteAudits`. With the prescribed detours the corresponding `revisedCompleteOutdoorCardinalRouteAudits` are clear for all six within the stated source model.

| Shop | Original nominal outdoor route | Minimum original static tube clearance | Minimum revised static tube clearance | Minimum revised authored lower envelope |
| --- | --- | --- | --- | --- |
| 090 | Clear | .950000m | .950000m | .345000m |
| 091 | Clear | .910000m | .910000m | .365000m |
| 092 | **Nonclear: lamp (225.5,145.5)** | −.519987m | .670000m | .165000m |
| 094 | Clear | .950000m | .950000m | .345000m |
| 095 | Clear | .910000m | .910000m | .365000m |
| 096 | **Nonclear: lamp (225.5,225.5)** | −.650000m | .481029m | .165000m |

091 original east X is 225.6443515154533, entrance Z118.67839586455375; 095 east X225.8058217712678, entrance Z199.95595548301935. Their complete original entrance→east→photo→entrance→center→door route avoids the low fixtures, meters and lamps. Nearest registered collider is the east planter, with 1.71m raw X gap and .91m after radius/tolerance. An independent child source audit confirms these two original routes and their lower authored props need no detour.

## Authorized 092 and 096 outside-corner legs

For both shops preserve the original `Z to entrance` alignment after the south-door photo. **Add Z to `face+1.8` before the original X-to-east-photo leg**, then proceed on X to the original east photo X and on Z to the unchanged building-center photo Z. After that photo, replace the direct return Z with `Z to face+1.8`, `X to building.x`, `Z to original entrance`; keep the following original X-center/Z-close/door/E steps.

| Shop | Original east photo X,Z | Safe Z = face+1.8 | Original entrance X,Z |
| --- | --- | --- | --- |
| 092 | 225.8373617986217,133 | **143.91998675437645** | 213,145.11998675437644 |
| 096 | 225.37591856345534,213 | **224.11897145090626** | 213,225.31897145090625 |

The exact forward/reverse waypoints and per-leg minima are stored under `cases[shop].fixtureDetour`. All detour points and ±.15m tolerance envelopes lie on flat sidewalk y=.18. The 092 east longitudinal leg has registered-table clearance .67m and conservative planter foliage clearance .365946m; its horizontal leg has lamp clearance .680013m. The 096 horizontal/longitudinal lamp bound has minimum .4810285490937417m. Both detours' conservative public-door/sill bound has minimum .165m.

The rejected `face+1.2` is only .15m clear of the physics shell, while its body/tolerance capsule intersects the authored door/sill envelope by .435m. Source max lower projections are sill .835, handles .759, frame approximately .692 and rolled shutter .855 (`harbor-frontage-profiles.js`). face+1.8 avoids them; no visual obstacle is silently omitted because it lacks a physics collider.

## Original collision interpretation

For 092 the old nominal east entrance X225.8373617986217/Z145.11998675437644 intersects the lamp. Parent supplied original actual X225.8253757320793 (baseline) and X225.98537573207915 (authored), with Z144.74960060537225. At those **fixed X** values the north-side legal return bounds are Z144.79032321727843 and 144.87656371436015, leaving original-target errors .329663537098m and .243423040016m, each larger than .15m. An east bypass at the old target needs X≥226.18659405236957.

For 096 the nominal east entrance point has unexpanded lamp AABB gap only .084531...m, smaller than the .65m body radius. At nominal fixed X225.37591856345534 its legal north-side bound is Z224.75044624209082, leaving .56852520881543m error from the old target. `original096StaticCollisionCounterexample` records the exact value and coordinates.

These are exact static counterexamples to the original straight nominal paths. They are **not unconditional reachability proofs**: `collision.js:313–350` can correct both axes and preserve tangent motion, while the old input only asserts its requested axis. Source geometry does not establish whether an unexecuted leg could eventually slide around within its finite budget. The supplied actual excerpts are explicitly attributed to parent; this agent did not read or reinterpret their native timing traces.

## Coverage and limits

The independent calculation uses 317 source-formula AABBs including all 96 south shells and 48 conservative authored lower solid envelopes. Rectangle expansion by .15m on each axis, followed by exact cardinal segment distance minus .65m radius, covers the complete tolerance square; it is not station sampling. Registered fixtures at 0/π/2 use exact cardinal transforms. Leaf envelopes use a rotation-independent vertex/scale norm bound. Decorative paving at base+.026m is treated as floor decoration, so foot rendering overlap is not certified.

[The independent global source-bounds review](/tmp/neon-six-shop-collision-ground-readonly-2026-10-05/source-rules-review.md) excludes north/infrastructure/metro/harbor/pier contributors and checks support priority. Its SHA is `fb60a67e1b8780fa5ec5137f6973e331ab4d485a30b62304e15880b372118230`; its JSON SHA is `8ea39591129b9a613aee69e6b7f18a6f699917a3ea602767b6020c7049127e2d`. Its earlier x=233 coordinate suggestion is superseded by this version, while its source-bounds evidence remains intact.

Wide legs cross sidewalk ramps and .3m fallback ground strips, with support .18→0→−.03→0; all wide endpoints are asphalt0. The 091 horizontal route crosses the real x232 tram track; the x234.5 longitudinal segment has .47m tolerance-adjusted distance beyond the tram/body widths, but crossing timing is unproved. Actual traffic positions, accumulated native input drift, frame cost, camera/FOV, screenshots and art judgment remain outside this source-only result. The original interior-only `common-pose-proof.clear` is not used as a global collision proof, and no instantiated full-world collider array is claimed.

`ledger.json` seals the final JSON, source-only arithmetic script and this review. The collector must still record actual evidence and retain first errors rather than treating this preparation as a completed native result.
