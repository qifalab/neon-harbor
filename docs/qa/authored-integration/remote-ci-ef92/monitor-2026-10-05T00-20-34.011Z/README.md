# Remote CI monitor — ef92 attempt 1

Run 37247048989, attempt 1, authored head ef92c25980f1da12b508971170b72b9dd6230059. The existing CI was dispatched without inputs. This folder contains read-only GitHub API snapshots and original decoded completed-job logs, with derived observations kept separate. Only evidence files are written; no runtime/index/ref, rerun/cancel, browser/GPU/build or local tests are touched.

Expected graph: 11 gameplay jobs plus one multiplayer job; two PR-only evidence jobs skipped on this dispatch; 22 High native cases plus one explicitly Low functional tour. Matrix activation is observed from actual jobs, not inferred from YAML. Each gameplay job runs the same 342 rules; repeated identical rule suites are not multiplied into a unique test total.

Snapshots use run endpoint, exact attempts/1 jobs with per_page=100, and artifacts per_page=100 at roughly 45-second intervals. Server run/jobs states can differ temporarily; original values are preserved. Completed logs are fetched once with the official decoded-log connector and retained without altering original failure. Only stable GitHub API URLs are saved, never authorization values or temporary signed redirects. Artifacts are listed by ID/name/bytes/digest for ROOT to download; this monitor does not download them.

The first API JSON files use the connector's decoded JSON followed by one final newline. Later evidence files preserve the exact decoded UTF-8 content. Every saved body receives a SHA/bytes receipt. Raw native capture completion remains pending manual art review; Low functional evidence is not High artwork evidence. An unfinished run has no final PASS conclusion. monitor-state.json provides resumable progress and initial failure references.
