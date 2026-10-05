# Source-only preparation review

The collector and its three local dependencies were prepared in `/tmp` only. ROOT source, tests, tools, distribution and existing evidence were not edited. No browser, server, GPU, game scene, build, runtime test or screenshot was executed. `node --check` validates syntax only.

An independent source audit by `/root/sample_native_review/tour_script_audit` confirmed the public welcome/reset/time/harbor-start sequencing and the real camera fields. It also reviewed this collector's menus, error preservation, frozen manifest comparisons and nominal AABB segment formula.

It found one concrete geometry evidence gap: the copied input helper checks only its moving axis, so the route must independently verify both axes after each waypoint to retain the plan's two-axis ±.15 assumption. The collector now records each real endpoint and strictly checks X/Z `<.15`, same floor, and same teleport revision; an error immediately fails without new input, retry or a larger tolerance. The independent auditor read only this repair and confirmed that the reported blocker is closed. No additional runtime result was inferred.

The v3 `input.mjs` and `render-readiness.mjs` remain exact byte copies; source-plan tolerance, radius, actual input order within those helpers, finite simulation/held-key guards and 60s camera phase are unchanged. The selected lobby's long final central-aisle return includes its source-defined building-centre waypoint, preserving every segment's static clearance check and avoiding a single 47.5m leg under the existing 120s hold bound.

Browser process lifecycle remains evidence: normal teardown has one total 30s window. A failed normal close and hard-kill request always produce FAIL. An immediate null child exit status after SIGKILL is not proof that the process has exited; the supervising parent must check that original owned PID/port before granting any next GPU lease. No preparation result claims GPU release for a process that has not been started.

Future execution must pin the selected frozen runtime, use an empty output directory and one fresh browser, and receive a separate explicit parent GPU GO. Capture completion remains `capture-complete-art-review-pending`; no pixel, hardware-performance, visual-quality or AAA approval is asserted by this review.
