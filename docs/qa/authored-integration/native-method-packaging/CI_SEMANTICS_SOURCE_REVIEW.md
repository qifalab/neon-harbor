Source-only event/default review; execution and dispatch activation remain pending.

| Entry/event | capture_native value | New optional reusable job |
|---|---|---|
| Manual registered ci.yml on adopted feature, no inputs | workflow_dispatch default true | Expected to execute; actual run job graph must prove it |
| Manual CI with explicit false | false | Skips |
| Pages → workflow_call of CI, no passed flag | workflow_call default false | Skips, including inherited workflow_dispatch event_name |
| Other workflow_call without flag | default false | Skips |
| push / pull_request | absent; event condition false | Skips |
| Explicit workflow_call true from manual caller | true and inherited event workflow_dispatch | Executes by explicit opt-in |
| Direct native-art workflow_dispatch | no CI flag | Optional direct entry; does not depend on default registration for adoption |

The exact new CI expression is `${{ github.event_name == 'workflow_dispatch' && inputs.capture_native == true }}`. Explicit boolean types prevent string "false" truthiness. The callee receives no elevated permissions or secrets. Existing CI's top-level concurrency/cancellation policy is retained unchanged; this preparation does not auto-dispatch, cancel or rerun anything.

Source checks compare the complete original jobs text through its EOF with the proposed prefix before the appended native-art job. The original Pages file is only read for SHA provenance, never included as a changed payload. CI's original 14 expanded top-level jobs (11 game matrix + MP + 2 PR-only) become 15 with the optional reusable call; the original required functional jobs remain 12. On a manual feature run, the new callee is expected to expand to 23 independently bounded VM cases. Report actual jobs and actual results after the run, including skipped PR-only jobs and every failed native case; no source-only matrix count constitutes a pass.
