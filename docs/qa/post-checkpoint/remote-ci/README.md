# Post-checkpoint candidate: remote CI evidence

This archive records the final standalone [CI run 37212886714](https://github.com/qifalab/neon-harbor/actions/runs/37212886714), on exact source commit [`0330df7ee1042d0f211304b042e01cdf6a0b4d44`](https://github.com/qifalab/neon-harbor/commit/0330df7ee1042d0f211304b042e01cdf6a0b4d44).

The workflow **completed with failure**: all 11 gameplay matrix jobs succeeded, but the multiplayer job failed. Thus 11 of the 12 required functional jobs passed. The two bulk room-art/detail jobs are PR-only and were skipped for this main push. This is a failed candidate's historical record, not a passing release gate or evidence that Pages published it.

## Final job results

| Job | Final result | GitHub job |
| --- | --- | --- |
| Multiplayer rooms in two browsers | **failure** | [111467450040](https://github.com/qifalab/neon-harbor/actions/runs/37212886714/job/111467450040) |
| Build and gameplay tests (living-city) | success | [111467450244](https://github.com/qifalab/neon-harbor/actions/runs/37212886714/job/111467450244) |
| Build and gameplay tests (metropolis-3) | success | [111467450267](https://github.com/qifalab/neon-harbor/actions/runs/37212886714/job/111467450267) |
| Build and gameplay tests (game) | success | [111467450292](https://github.com/qifalab/neon-harbor/actions/runs/37212886714/job/111467450292) |
| Build and gameplay tests (metropolis-2) | success | [111467450299](https://github.com/qifalab/neon-harbor/actions/runs/37212886714/job/111467450299) |
| Build and gameplay tests (harbor-sample-2) | success | [111467450323](https://github.com/qifalab/neon-harbor/actions/runs/37212886714/job/111467450323) |
| Build and gameplay tests (stability) | success | [111467450347](https://github.com/qifalab/neon-harbor/actions/runs/37212886714/job/111467450347) |
| Build and gameplay tests (occupied-city) | success | [111467450373](https://github.com/qifalab/neon-harbor/actions/runs/37212886714/job/111467450373) |
| Build and gameplay tests (harbor-sample-1) | success | [111467450384](https://github.com/qifalab/neon-harbor/actions/runs/37212886714/job/111467450384) |
| Build and gameplay tests (city-materials) | success | [111467450394](https://github.com/qifalab/neon-harbor/actions/runs/37212886714/job/111467450394) |
| Build and gameplay tests (metropolis-1) | success | [111467450438](https://github.com/qifalab/neon-harbor/actions/runs/37212886714/job/111467450438) |
| Build and gameplay tests (harbor-realism) | success | [111467450443](https://github.com/qifalab/neon-harbor/actions/runs/37212886714/job/111467450443) |
| Rendered room evidence (${{ matrix.shard }}/48) | skipped | [111467450887](https://github.com/qifalab/neon-harbor/actions/runs/37212886714/job/111467450887) |
| Native High room detail (${{ matrix.shard }}/6) | skipped | [111467450990](https://github.com/qifalab/neon-harbor/actions/runs/37212886714/job/111467450990) |

## Multiplayer startup failure

Both tests failed before boot or player movement: `tracing.start: Tracing has been already started` at `tests/multiplayer-browser/rooms.spec.js:85` and `:128`. Their durations were 447 ms and 295 ms. The added explicit context tracing start conflicted with tracing already started by Playwright's test configuration. Build and browser installation had succeeded; this was an actual test startup regression.

The retained progress attachments corroborate the trigger. The first case records `phases = []` and two clients with `ready = false`; the second records `phases = []` and `final = []`. There is no initialized player pose or simulation clock for either case. This failure cannot establish a collision, traffic, terrain, synchronization, chat, or elevator regression or success. A subsequent corrected candidate must run both real-browser multiplayer cases and pass the full release gate.

The original [failure artifact 11307072991](https://github.com/qifalab/neon-harbor/actions/runs/37212886714/artifacts/11307072991) is preserved without repacking as `neon-0330df7-multiplayer-trace-start-failure.zip`: **115,324 bytes**, SHA-256 `72625a88e64fb36fdc633dd3ddd47a7aa23a11ece54c1ada417a89330a490be3`. `37212886714-mp-failure-artifact.json` records provenance. Its progress JSON attachments are also extracted under `37212886714-mp-failure/`.

## Successful rechecks belonging to this source

These logs are from commit 0330df7 itself, not copied results from the previous candidate:

- **living-city:** 2/2 browser cases passed in 4.0 minutes, including the real furnished-bedroom elevator/doorway/return route (2.6 minutes) and default High materials/infrastructure case (1.1 minutes). The prior elapsed-time measurement failure did not recur on this candidate.
- **occupied-city:** 2/2 cases passed in 23.7 minutes. Upper-storey selection, a real upper stair flight, room entry and three-floor residency passed in 7.3 minutes. The resident physically entered its workplace and stayed working in the visible room in 16.2 minutes. Progress logs retain its actual route and simulation clock; no forced position or clock was used to bypass the wait.
- **harbor-sample-2:** 2/2 cases passed in 16.2 minutes. Ferry boarding, physical upper-deck stairs, travel and lower-door alighting passed in 10.2 minutes; funded cargo delivery, a real purchase, save/reload and the actual High shop room passed in 5.9 minutes.
- The three highlighted successful gameplay logs each report **298/298 rule tests, zero failures, zero skipped**, and successful builds. The other eight gameplay jobs' complete raw logs are retained too. All eleven report 298/298 rules passed, zero failures and zero skipped. `37212886714-gameplay-case-index.json` indexes each job's actual case-result lines: **27 gameplay browser cases passed across 11 shards**; the two multiplayer cases failed before boot, so the whole workflow still failed.

These are functional checks under software rendering. Different runners and wall durations are not a controlled performance comparison. They do not establish native GPU performance, whole-city art acceptance, a complete resident day, continuous 20-minute sample play, or AAA visual quality.

## Files and monitoring

The workflow was monitored read-only at 45-second intervals. `37212886714-changes.json` preserves changes in job/run status, while `*-run.json`, `*-jobs.json`, `*-artifacts.json` and `*-captured-at.json` hold the final raw GitHub metadata and capture details. The monitor stopped after the run completed; no failed job was automatically rerun.

The twelve `*.log` files preserve the exact decoded UTF-8 job-log payloads, including original timestamps, whitespace, ANSI sequences and terminal newlines. Logs and the failure artifact were obtained through the GitHub connector because ordinary `gh run view --log` redirects were unavailable under this session's network policy. No proxy bypass was used. Logs are ignored by the project's general Git pattern and must be explicitly included when this evidence is committed.

`evidence-files.json` records byte lengths and SHA-256 hashes for every retained file except itself. Any later successful CI/Pages run and online asset-fingerprint verification must identify its own source commit separately.
