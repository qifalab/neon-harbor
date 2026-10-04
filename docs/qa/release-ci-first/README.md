# First v0.8 release candidate: remote CI failure evidence

This archive belongs to candidate [`3a81a74d9503836934e9eff10d3cadc88afa2e80`](https://github.com/qifalab/neon-harbor/commit/3a81a74d9503836934e9eff10d3cadc88afa2e80). It records an unsuccessful release attempt on 2026-10-04. It is **not acceptance evidence for the subsequent corrected tree**, and this candidate was not published by the Pages run below.

## Final workflow results

- [CI run 37210812941](https://github.com/qifalab/neon-harbor/actions/runs/37210812941): completed, **failure**. Ten gameplay matrix jobs succeeded; the living-city gameplay job and the multiplayer job failed. Both optional bulk room-evidence jobs were skipped.
- [GitHub Pages run 37210818737](https://github.com/qifalab/neon-harbor/actions/runs/37210818737): completed, **cancelled**. Six gameplay matrix jobs succeeded, living-city and occupied-city failed, three gameplay matrix jobs were cancelled, and multiplayer failed. Both optional bulk room-evidence jobs were skipped. Deployment was cancelled.
- Pages cancellation completed at 15:10:34 UTC. The occupied-city failures had already completed at 15:10:09 UTC; they were not caused by that cancellation. Cancellation preserved the failure artifacts and stopped a candidate that could not pass its required verification gate.

| Job / matrix group | Standalone CI | Pages verification |
| --- | --- | --- |
| game | success | success |
| metropolis-1 | success | success |
| metropolis-2 | success | success |
| metropolis-3 | success | cancelled |
| stability | success | success |
| harbor-realism | success | success |
| occupied-city | success | **failure** |
| city-materials | success | cancelled |
| living-city | **failure** | **failure** |
| harbor-sample-1 | success | success |
| harbor-sample-2 | success | cancelled |
| Multiplayer rooms in two browsers | **failure** | **failure** |
| Optional Native High room detail | skipped | skipped |
| Optional Rendered room evidence | skipped | skipped |
| Deployment | not applicable | cancelled |

The raw `*-run.json`, `*-jobs.json` and `*-artifacts.json` files contain GitHub's final results and per-step metadata. `captured-at.json` records the archive snapshot time. Successful individual jobs do not make either failed/cancelled workflow a passing release.

## Observed failures and limits of diagnosis

**Living-city elevator measurement.** The first case failed its existing elevator journey assertion `arrived.simulationTime - moving.simulationTime < elevator.duration + 3`. The standalone CI measured approximately 5.7 simulated seconds against a 5.2-second bound; Pages measured approximately 5.5333 against the same bound. The other living-city case passed. Trace review found that polling and a second full snapshot continued measuring after the elevator first became idle. The corrected local test records the first moving and first idle observations in the browser's RAF loop, while preserving the journey bound and real input. At archival time, that change had not yet passed its final browser recheck.

**Multiplayer first case.** Both workflows timed out after 30 wall-clock seconds while holding the real W key and waiting to come within five metres of the starter car. The original manually created browser contexts did not start their own Playwright tracing, so these traces do not provide a complete rendered frame/network history for that hold. The logs alone do not identify a collision or a sync failure. The corrected test needs retained context tracing and motion diagnostics, followed by a genuine two-browser recheck.

**Multiplayer East-bank case.** Both workflows timed out during the initial lobby walk from z = −167.65 toward z = −217.45, before the intended upper-floor multiplayer assertions. In standalone CI, the character reached approximately z = −210.525 while the simulation advanced only 4.3333 seconds during the 60-second wall-clock budget. In Pages, it reached approximately z = −216.160 while the simulation advanced about 4.7 seconds. These diagnostics show continued movement with an unchanged teleport revision; they do not demonstrate a blocked route. Local work increases the wall-clock budget for this slow software-rendered hold while retaining the simulation-time stall budget, movement assertions, and synchronization checks. A separately identified server/client East-bank terrain discrepancy is being fixed through shared terrain sampling; the old timeout does not itself prove that discrepancy caused it. These changes were not yet rechecked at archival time.

**Pages occupied-city, both cases.** Both failed on the initial long corridor approach, before upper stairs or resident workplace behavior could be asserted:

| Case | z before | z at timeout | z target | Simulated time advanced | Wall-clock wait |
| --- | ---: | ---: | ---: | ---: | ---: |
| Upper-storey selection / stairs | −602.150 | −623.150 | −656.950 | 2.000 s | about 60 s |
| Resident workplace | −461.150 | −500.525 | −517.950 | 3.750 s | about 60 s |

Both kept `teleportRevision = 3`. They advanced 21 m and 39.375 m respectively. The standalone CI's identical two cases passed in 4.5 and 9.0 wall-clock minutes. That contrast supports diagnosing an insufficient wall-clock allowance under software rendering, without treating the old failures as passes. The local fix gives these two long approaches 180-second allowances through the existing helper's timeout option; its default 60 seconds, simulation stall bound, and teleport checks remain unchanged. The affected cases still require an actual browser recheck on the corrected build.

The standalone harbor-sample-2 job passed the real ferry upper-deck journey in 13.7 minutes and the funded delivery/purchase case in 7.3 minutes (two passes, 21.2 minutes total). Its rule suite passed 285/285, zero skipped. Those results apply to this first candidate only. They are functional evidence; they do not measure native GPU performance or establish a AAA art standard.

## Retained files

- The seven `*.log` files are the decoded job-log payloads returned by the GitHub connector. Their original timestamps, terminal newlines, ANSI sequences, and whitespace are preserved. Ordinary `gh run view --log` could not access the redirected log service under this session's network policy; no proxy bypass was used.
- Four downloaded failure archives are retained here without repacking. Three already existed locally and were copied, without downloading them again; the occupied-city archive was fetched after the extra failure was identified. `downloaded-artifact-digests.json` records IDs, byte lengths, and SHA-256 hashes.
- The two occupied-city error-context files are extracted for direct inspection. The ZIP still contains the complete originally uploaded report. This particular artifact contains error contexts and the report but no retained failure trace ZIP; the missing trace must not be invented.
- `failure-summary.json` gives the measured values and states which corrected checks were still pending when the archive was created.
- `evidence-files.json` hashes every retained file except itself. Original unsuccessful logs and artifacts remain available when subsequent fixes are validated.

This archive is deliberately historical. The final release QA must identify the later committed source tree, its new full CI and Pages runs, its asset manifest, and online verification separately.
