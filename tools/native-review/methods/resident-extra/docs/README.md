# Resident extra native cases — prepared source, not executed

Tool: `tools/capture-resident-extra.mjs`. It runs one bounded case in a fresh context, outside ROOT and the private game source. Original `7bb` core seal is untouched. This derivative includes core-v2's real-camera readiness and owned 30-second cleanup within the original 1080-second total deadline. Only source inspection and `node --check` were performed; no tests, browser, GPU, build or full-world construction ran during preparation.

Every case uses actual Playwright Chromium **151.0.7922.34**, High **1280×800**, DPR **1**, hour **16.5**, cycle off, public UI and ordinary mouse/WASD. It verifies the actual served manifest's full asset dictionary and source/build agreement, records explicit git HEAD/status, tool/server hashes, raw WebM, unedited PNG, actual snapshots and first plus secondary errors. No hidden state/storage/time/position write, forced NPC job or retry is present.

Cases are separate fresh observations, not one continuous cross-city trip:

| Case | Actual source target | Approach and scope |
| --- | --- | --- |
| `north-book` | `resident-design-foundry-3`, original `Citizen book`, commuter near role | Public Atlas design-foundry; real front pavement. Social person 3 initially retains its book identity. |
| `north-phone` | `resident-lantern-tower-1`, original `Citizen phone`, commuter | Public Atlas lantern-tower; actual initial left-front position. Initial shopping state preserves this bank-clerk identity's phone. |
| `north-cup-owner` | `resident-jade-bank-3`, original `Citizen cup`, shopkeeper | Public Atlas jade-bank; front pavement. Cup, actual role/resource quality readbacks and far/return remain in this one block. |
| `south-parcel` | Materialized agent with original `Actual delivery cargo`, worker role | Public Harbor supply button, then real 2.4 m walk towards its door within the source-selected clear door-to-counter segment. Watch actual autonomous pickup/delivery, at most 360 wall seconds. Requires the final authored review probe. |

North approaches plan once from read-only current logical coordinates, then use single key holds with one key-up and no correction. Front viewpoints add an outward 1.8 m pavement offset, clearing the second social NPC while keeping the target within 3.5 m. A moved or obstructed target causes a preserved first failure. No chase, clock reset or synthetic pose is used.

Each successful initial target records its actual visible original prop UUID, parent, effective visibility, hand, cached world position and real wrist/hand anchors. Every North character still owns original book/phone/cup objects, so all three sets of references/transforms are retained in the receipt. **Hidden entries do not count as three visible actions.** Separate cases establish only the visible type actually observed, pending manual image review.

The motion segment is at least **45 wall seconds**, unpaused with no menu/Atlas operation: released-input observation, real 4 m walk out/back, then released input while aiming through public mouse control at the actual remaining target. It records actual simulation seconds independently, identities/activities/rooms, real prop and skeleton UUIDs, actor movement and original eight FK angle changes. An NPC entering a room or leaving view is recorded; it is not frozen or brought back. It does not certify all 240 residents or imported motion capture.

The jade-bank owner case then shows a visible local commuter plus actual nearby residents, selects **High → Low → High** through the public settings menu, and reads actual owners after resuming frames. Low must have zero live near instances, template geometry/ImageBitmap owners and instance skeletons; successful bitmap.close calls must account for the previously owned images. High must request and own a real role again with a new local skeleton UUID. Original NPC props keep their original UUIDs if that NPC remains materialized; a naturally absent target is explicitly marked.

Near/far continues on the same clear front pavement: first person hides the local player, a real walk to x=-530 exceeds the 21 m hysteresis, then 13 **actual simulation seconds** of unpaused cooldown are observed with a 240-wall-second ceiling. Actual template and instance owners must clear. A real return plus public V makes the local commuter visible again and must lazily acquire a new role. This avoids depending on a resident staying idle through the whole ownership sequence. Camera/world coordinates, generation/requests, renderer counts and owner counters are retained at every step. CPU reference/dispose/close counts and decoded texture estimates are not measured driver VRAM or physical allocator reclamation.

A South delivery mesh is visible in the actual renderer only when the agent has an actual `cargoJobId`. The tool requires this original mesh to be effectively visible on the actual near actor and genuinely parented to the real left hand within 3.5 m; it does not accept a hidden cargo reference. Public summary lacks the agent job ID, so job-ID evidence is **unavailable**, while visible mesh, logical agent and hand matrices are recorded. Failure to see a parcel within the finite window is a first failure, not evidence of successful autonomous delivery. Baseline lacks this hand/cargo probe; `south-parcel` is authored-only. North cases and the public quality/near-far operations support baseline with missing asset probes explicitly unavailable.

Run only after the GPU slot is released, with a new output directory. No build is embedded:

```sh
node /tmp/neon-resident-native-extra/tools/capture-resident-extra.mjs --mode authored --case north-cup-owner --project-root /tmp/neon-harbor-authored-integration --root /tmp/neon-harbor-authored-integration/dist --git-root /workspace/scratch/neon-harbor --output /tmp/neon-resident-extra-cup-01 --port 5194
```

Use another new output directory and `--case north-book`, `north-phone`, or `south-parcel` for each independent case. For baseline North/cup use ROOT project/dist and `--mode baseline`. `docs/METHOD_PROVENANCE.json` records the exact prepared method and inspected final-private source hashes. Preparation itself does not establish native material, face/eyes, garment, prop or animation quality.
