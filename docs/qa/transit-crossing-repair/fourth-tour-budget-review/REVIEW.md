# Fourth tour whole-case budget review (CPU derivation only)

Generated 2026-10-04T19:41:00.581Z. This report reads the immutable third-run evidence, imports only frozen 7145 transit/layout modules in Node and computes a conditional suffix. No browser/GPU, world edits, build, full tests or repeated mocks were run. The suffix is a planning estimate, not evidence that a complete tour passed.

## Finite recommendation and limitations

The prepared candidate changes only the whole-case budget from 90 to **180 wall minutes** plus the three corresponding textual explanations. Its SHA is **7a752952d03bf9f7574b4a2620911070dd39bef4082841b30700e84c64ea956f**, 59,888 bytes. Reversing the four allowed replacements recovers reviewed 6a byte-for-byte; Node syntax check passed. All local caps and physical/input/progress requirements remain unchanged. ROOT still uses 60436; this candidate has not been applied.

At the observed tram service ratio about 0.67 and a conditional average renderer ratio 0.089sim/wall, the estimated full case is **162.055 minutes**, leaving about 17.945 minutes in 180. At the actual lowest pre-failure 30-second window, **0.066sim/wall**, the same suffix produces **199.386 minutes**, exceeding 180. At ratio0.067 it is197.501 minutes. Therefore180 is a finite practical envelope for the observed0.089 case, not a worst-case promise. A150-minute envelope would already truncate the162-minute case. Sustained minima would require at least about200 minutes under this model, and an extra nominal tram circuit adds178.799 simulation seconds at service ratio0.67. Do not silently expand an in-flight run.

The common **900-second destination wait has a separate measurable risk**: the predicted tram lower-door wait is148.533sim seconds. It requires a renderer average≥0.165sim/wall. A **proposed2400-second destination wait** gives2246.037 seconds at the lowest recorded pre-failure ratio and153.963 seconds of headroom. This proposal is not applied. It would use the existing shared destination constant, affecting bus/ferry/tram destination waits only; a tram-only cap is a different method design requiring a separate review. It preserves route.duration*3+180, displacement, revision, .06 endpoint, held-input and all real geometry/input assertions; no world speed, dt, clock or default quality changes.

Even2400 destination does not ensure the rest passes: predicted tram boarding70.236sim seconds needs≥0.117sim/wall under the retained600-second cap; upper real-open-berth waiting59.385sim needs≥0.099. Persistent0.067–0.089 can fail either first. These conditional estimates justify exposing all risks before root chooses the final method, not a claim that GPU exclusivity cures them. Concurrent ART CPU work was stopped at18:58:10, after the18:57:33.776 failure; no causal explanation is proved.

## Evidence and geometry

The third case started18:08:57.473, continuous route18:11:02.447, failed18:57:33.776. It consumed **48m36.303s** of the90-minute case and left **41m23.697s**. Its46m31.329s route was incomplete. Public native Low selection remains512×320video/viewport and409×256GL software functional evidence, not native art or hardware FPS.

Remaining planned streets are77m north-pier→address,73.8m address→north-pier,135.6m south-pier→tram and134.649m tram→home: **421.049m** over16 actual collider-planned waypoints. Remaining pier/ramp walking is19.5m north exit+19.5m return+24m south exit=**63m**. Outdoor suffix total **484.049m**. North maritime room enter/leave adds42.65m horizontal; each physical home stair/kitchen pass about20.123m horizontal (including the0.1m approach below the helper's.18 endpoint tolerance), done once before save and once after reload. Tram stairs up/down require11.92m horizontal with continuous real height change.

Empirical calibration: the earlier501.556m street segment advanced116.25sim seconds in485.364wall seconds,4.315m/sim; the24m south pier advanced8.233sim in39.448wall. Actual home descent/room exit advanced21.417sim; equal authored geometry estimates a21.417sim return ascent. North-room helper ideal17.045sim is multiplied by the observed home's helper overhead ratio to estimate20.356sim. Bus actual climb31.650sim/descent33.000sim minus its ideal.3m/s held durations calibrate tram climb28.917sim/descent30.267sim. These estimates omit unknown future collision/phase changes and are not upper bounds.

Frozen nominal ferry loop81.28436497sim seconds, North→South40.65502823sim; tram loop119.79546400sim, Quay→Lantern59.16213067sim. While the player visited the shop/walked to the ferry, the two actual tram service clocks advanced0.689115 and0.673452 service seconds per simulation second, including normal traffic/signals. This distinct transit-service ratio must not be confused with renderer sim/wall. The main model uses0.67, the exact recorded two vehicle phases, and ordinary scheduled boarding/berth calculations. It predicts that physical stairs down after checking the upper open berth miss the same Lantern opening and use the next circuit.

At the first failure the final ferry-door distance was0.104746m,0.044746m outside the.06 endpoint, requiring at least0.149153 held simulation seconds at.3m/s to reach that threshold. Extra150wall seconds for the newly allowed final door are reserved in the wall scenarios below; this is a budget reservation, not padding. Another180wall seconds is reserved for actual menu/export/reload/loading/recording closure; the run must perform real operations and never sleep to consume that reserve. Whole-case assertions and final recording closure retain a finite hard deadline.

## Conditional suffix ledger

This sums to **576.452325sim seconds**, including the second physical home2F ascent after reload. It is not a reconstruction of missing third-run cabin samples. The same branch with an extra ferry loop happens to meet a different tram opening and yields the same downstream finish in this deterministic phase model; that coincidence is not a bound for arbitrary delays.

| Operation | Estimated simulation seconds |
|---|---:|
| ferry-final-residual-held-minimum | 0.149 |
| outbound-next-north-berth | 3.322 |
| north-pier-exit | 6.690 |
| north-street-to-address | 17.847 |
| north-real-room-enter-and-exit | 20.356 |
| north-street-to-pier | 17.105 |
| north-pier-return | 6.690 |
| ferry-return-wait-for-boarding | 12.597 |
| ferry-return-north-to-south | 40.655 |
| south-pier-exit | 8.233 |
| south-street-to-tram | 31.429 |
| tram-wait-for-quay-boarding | 70.236 |
| tram-physical-stairs-up | 28.917 |
| tram-upper-real-open-berth-wait | 59.385 |
| tram-physical-stairs-down-and-door | 30.267 |
| tram-lower-lantern-destination-wait | 148.533 |
| tram-street-to-home | 31.209 |
| home-real-E-stairs-kitchen | 21.417 |
| after-reload-real-E-stairs-kitchen | 21.417 |

| Assumed sim/wall | Remaining suffix wall minutes | Full case minutes with actual48.605m prefix+5.5m reserved real-operation budget |
|---|---:|---:|
| 0.240 | 40.031 | 94.136 |
| 0.200 | 48.038 | 102.143 |
| 0.120 | 80.063 | 134.168 |
| 0.089 | 107.950 | 162.055 |
| 0.067 | 143.396 | 197.501 |

90 minutes is tight even at the earlier0.24 ratio once the actual tram traffic progression is included (94.136m). At0.20 the derived full case is102.143m. These values support reviewing the global cap before another unique run. They do not relax any room, deck, transaction, save or input requirement.

## Current freeze and raw preservation

Reviewed6a candidate59,884B/SHA6a0178c8fb0b099dda2a82b1bc8157206861c35bb8e00cd1b4661216450027db; root tool53,037B/SHA60436d2fe8db8af646c1a02d93f9e70fc3e1ce34181d257a1c3ea39aae850702. Dist manifest7145fa443190896ff24050d518a54fea364ddb0547ddfa71756a33d64c515fb3,146assets/52sources all match; helper/server hashes still match the third method. This report is bound to7145. A final ART build must receive a new freeze and source/asset inventory and must not be described as7145 merely because layout is similar.

The archived59 method-review originals and all prior native/tour ledgers were verified byte/hash-exact; none were edited:

| Directory | Ledger entries | SHA of evidence-files.json |
|---|---:|---|
| docs/qa/transit-crossing-repair/ferry-door-method-review | 59 | 19ac77dc7b70e873cc22c96abfab20835bc4ac33b837e9b1512573f99a8bdc4c |
| docs/qa/art-final/native-review | 16 | 06fa99595842c8659a4b050f3ced1d6491677c410b84eb4392dea11d7e5cbeeb |
| docs/qa/art-final/continuous-tour | 13 | f650a77276af2a7b386a3e7eb809c0aaf0ae5f71eb352cfde4797b7b97f46364 |
| docs/qa/transit-crossing-repair/continuous-tour | 15 | b5e6af022f617ad4da6be13fb56bd95e7e0c6601372d0f87cb2ea1d39a55ca70 |
| docs/qa/transit-crossing-repair/continuous-tour-budget-review | 19 | 5b922d928e28e4dbb528241e841cb9454f6868a4e54785a131ee9a696bc1a317 |

Third video is the originalsinglepage@f3a37dcd9bfa366ae4707ebb074324d8.webm,71,548,336B,2950.72seconds,VP8 512×320,SHA69971a38c7d91c24192d793c30038a1665cef3105ba29c1bb2f48ce4b0c1cac9. Its metadata and ledger still explicitly retain **published:false/publicationUrl:null**. The independent ffprobe result remains in the unchanged post-run-verification.json. Video duration includes startup, setup and failure cleanup and cannot be substituted for route-completion evidence.

Machine-readable derivation: budget-calculation.json; executable arithmetic: derive-budget.mjs; exact global diff: whole-case-180m.patch; scope proof: scope-check.json; lower-wait proposal: destination-wait-proposal.json. Node exit1 from diff -u means the expected four differences, not a syntax failure. No18/24mocks or full game tests were rerun for this constant-only candidate.
