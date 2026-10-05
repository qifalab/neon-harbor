# Exact fresh-run CI observer preparation

This packet is preparation only. The observer has not run, no GitHub request was made during preparation, and there is no CI conclusion in this packet. Repository source, Git refs, builds, project tests, browser/GPU processes, releases and Pages were untouched.

Run it only after the fresh workflow run exists and its exact committed HEAD is known. It uses the already configured `gh` authentication. Start it as an owned exec session so the root agent can continue work and report progress. The output directory must not exist; the observer refuses overwrite or resume.

```sh
PYTHONDONTWRITEBYTECODE=1 python3 /workspace/neon-candidates/final-world-sample-fresh-ci-observer-preparation-20261005/observe-fresh-ci.py \
  --repo qifalab/neon-harbor \
  --run-id ACTUAL_RUN_ID \
  --head EXACT_40_CHARACTER_COMMITTED_HEAD \
  --attempt 1 \
  --output /workspace/neon-evidence/ACTUAL_FRESH_RUN_OBSERVER_DIRECTORY \
  --fetch-logs-at-closure
```

`--attempt` is optional; without it, the first actual run response binds the attempt. A rerun/attempt change is rejected and requires a new invocation and fresh output. Exact run ID, repository and full HEAD are checked. Job responses must match that run ID and HEAD. The script uses GET requests only; no shell commands or credential values are emitted.

The defaults are one snapshot start per at least 60 seconds, a 180-minute total observation bound and a 45-second timeout for each API request. Permitted CLI ranges are 60–300 seconds cadence, 1–240 minutes duration and 5–60 seconds request timeout. Each paginated collection is capped at 1,000 entries. Three consecutive incomplete API observations close the observer without a fabricated conclusion. API stdout and stderr are retained as original files, with size and SHA-256 recorded; stderr contents are never printed. It stores full original run/jobs/artifact-metadata responses and derived `state.json` separately. It does not download artifact payloads or ZIPs.

SIGINT/SIGTERM requests a stop. The in-flight `gh` request remains bounded by its timeout; the script starts no further API request after the signal. Waiting uses one-second stoppable increments. `owner_pid` is recorded in state. A terminal `closure.json` seals the original and derived file ledger. Signal, binding, API and deadline closures are explicit and never converted into success.

The 12 required labels come from the current local CI workflow: 11 `Build and gameplay tests (...)` variants and `Multiplayer rooms in two browsers`. The selected native labels are the actual reusable-workflow labels for Bus, Tram and Ferry. Missing and duplicate names, failed, cancelled, skipped, queued and in-progress jobs remain visible in the complete job rows. The three selected native jobs are required by this observer's successful exit; all other jobs are also retained. The script does not assert manual art acceptance or deployment.

When the actual run response first reports `completed`, normal polling stops permanently. That same observation fetches its job and artifact metadata once. If this terminal metadata cannot be captured, closure records it as incomplete and does not resume polling. With `--fetch-logs-at-closure`, it then fetches the 11 verify job logs exactly once each, without another run/jobs poll. Log failures remain explicit. Omitting the flag leaves rule counts unset.

Closed logs are parsed conservatively for actual top-level TAP `# Subtest:` names and final `# tests`, `# pass`, `# fail` summaries after stripping only GitHub timestamp and ANSI color prefixes. The distinct rule-name count is a set union, never multiplied by 11 jobs. Nested subtests are excluded. If the reporter lacks this TAP form, names are absent or a log is missing, the completeness flag is false; no expected number is substituted. A unique PASS count remains unset because per-job PASS totals are not automatically a unique-rule PASS proof. Original logs and per-job summaries remain inspectable. This parser is preparation-only and has not been validated against the forthcoming run.

Exit codes:

- `0`: actual completed run conclusion is success, with all 12 required and all three selected native jobs uniquely present, completed and successful.
- `1`: actual run completed but that exact gate did not succeed; missing/skipped/failed jobs are retained explicitly.
- `2`: deadline or API/terminal-metadata incompleteness; no gate conclusion is inferred.
- `3`: exact binding rejection or output/filesystem/process setup error.
- `130`: signal stop before ordinary terminal completion.

Preparation validation is limited to Python AST parsing and static local review. No project test, build, browser, observer execution, API request, artifact download or Git mutation was performed. Before actual execution, verify the packet seal against the two files. Source/build/runtime fingerprints belong to the root agent's separate exact-commit verification; this script does not guess those counts.
