# Detail collector teardown budget and completed evidence review

Verdict: **support the prospective single browser-close cap change from 10s to 30s, while retaining the whole 20-minute hard budget and all physical/rendering/source/cleanup assertions.** No product change is indicated by the two observed close-cap failures. The 469d run provides usable, bounded evidence for its actually completed picture, physical route/exit and owned asset releases. It remains **collector case FAIL / exit 1**; neither subsequent closure nor the proposed future cap changes that original result. Repeating all walking and photography solely to obtain a green collector label is not required to establish those already recorded observations.

Actual close and independent closure observations:

| Run | Browser close started | Original 10s close FAIL | Resources independently absent | Start to absence observation |
| --- | --- | --- | --- | ---: |
| f147 | 2026-10-04T20:41:35.065Z | 2026-10-04T20:41:45.064Z | 2026-10-04T20:41:54Z | 18.935s |
| 469d | 2026-10-04T21:01:08.965Z | 2026-10-04T21:01:18.966Z | 2026-10-04T21:01:29Z | 20.035s |

Both actual failures are `browser cleanup exceeded 10000ms`. The first context closed in 27ms and its server closed immediately; the second context closed in 21ms and its server closed in 1ms. Both independent closure records report absent method PID, `activeChromeProcesses=[]`, port5208 `connect_ex=111`, server closed and GPU/browser released, with no process killed for the check. The later checks are **observations of resource absence**, not precise shutdown timestamps or proof that the `browser.close()` promise resolved after 19/20 seconds. They provide concrete support for more than the existing 10s allowance; 30s is a finite margin beyond both observed ≤20.035s release windows, not a guarantee of a successful future close or proof of a specific SwiftShader/driver cause.

The f147 run's primary failure was still its original .04m walking endpoint assertion; its browser-close timeout was an additional collector issue. Its close photo and real E exit did not happen. The 469d run reached `playableCompletedAt=2026-10-04T21:01:08.919Z`, then context/server closed and only its browser-close cap failed. Its primary error was created during finalization from that single cleanup failure. `finalizationErrors` has no other item; page/console/HTTP/request errors and late unexpected errors are empty. The whole 20-minute budget was respected, with `hardDeadlineReached=false`. This confines the recorded 469d failure to collector shutdown acceptance; it does not erase a product step that had already completed.

Completed 469d evidence may be described separately and precisely:

- Eleven recorded real-helper walks completed with unchanged teleport revision; the actual final player pose (180.440000000006, 0.215, −113.300000000000) is inside the full independently proven ±.18m safe region. Before/after screenshot positions match.
- One original High/1280×800/static16.5/first-person picture exists: PNG SHA256 `fbf75dd9fd9ec35c7677690650c414dcce043084e9241ad99700c597d1eb9e4a`; pose SHA256 `9f50b47d257aca14783cb738adf1ee415d5daad84776326fdc4d2966faaa6164`. The direct recorded eye-to-vice-centre distance is **1.416724123991076m**. The explicit capture reads actual WebGL2/SwiftShader, context not lost and GL error 0. These are actual capture conditions, not hardware FPS or an art-quality grade; a reviewer can inspect the unchanged image for the narrow close-view art question.
- The physical return route and actual E exit completed. The final interior is absent and exterior shell state restored. Actual synchronous owned release records show vice **4 geometry / 4 texture** (including one bone texture) and chest **7 geometry / 3 texture**, with three decoded images closed for each. These are owned Three resource counters, not driver allocation bytes or proof of no city-wide leak.
- Original invocation reports method469d and manifest502af at start and end; freeze-verification reports unchanged156 runtime/53 source/7 method files with no mismatches. The prior separate 201-file owned-resource suite remains unchanged.

The failed collector cannot be advertised as a full native detail case PASS, nor can f147 be changed to PASS. Finite documentation can say that 469d completed and recorded the planned photo, normal gameplay exit and owned releases, with the collector subsequently failing its 10s browser teardown cap and independent process/socket evidence confirming eventual closure. Main resource-suite PASS, any future full CI, hardware performance and artwork acceptance remain separate conclusions.

Prepared **only in /tmp**, not applied to ROOT:

- [30s candidate](/tmp/capture-workshop-vice-detail-browser30-candidate.mjs), SHA256 `1cc5537fe516cf57cbd71ff7f463588b962ce1d102799c1b8ec1fab90f1b4e7d` (28,556 bytes).
- [Exact one-line patch](/tmp/neon-vice-detail-browser30-candidate.patch), SHA256 `32313b02e8ddce905ae1be75b58eedb5deb0206240d24680c5cd9ab605a81557`.

The candidate changes only `boundedClose('browser',()=>browser.close(),10000)` to `...,30000)`. Reversing this one replacement recovers the reviewed469d bytes exactly. Context10s/server5s, per-close `min(cap, remaining whole budget)`, whole20m/hard timer through final persistence, rejection of timeout/late errors, first-error preservation, all actual input/.18 safe body region/High/asset/owned release/source freeze checks and the empty-output requirement are byte-identical. A future successful collector result would still need actual raw evidence; applying this cap does not retrospectively infer one. No new browser/GPU run is needed for the already completed finite 469d observations, and this review does not authorize another run.

This review read only finalized raw metadata/invocation/closure/freeze evidence and method text. The owner is sealing the complete archive separately; no whole archive was rehashed here. A child independently checked actual capture/pose hashes, walk/exit/release fields and source freeze. No GPU/browser, full CPU suite/build, ROOT source change, staging or external write was performed. Exact observed timestamps and input hashes are retained in [provenance JSON](/tmp/neon-vice-detail-browser30-and-limited-evidence-provenance.json).
