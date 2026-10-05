# v3 — current rendered camera after a normal E transition

The v2 raw record at `/tmp/neon-native-baseline-home-method-v2-20261004`
shows successful public entry into south-079 lobby, revision 3 and actual
position `(133, .215, 114.34924771878869)`, followed by `camera:null` and the
premature FOV assertion. ROOT `main.js` synchronously calls
`resetPresentation()` after E; `ChaseCamera.reset()` clears its initialized
state, and its snapshot correctly stays null until the next ordinary frame
calls `updateCamera()`. There was no captured image in that attempt. Its first
error, secondary screenshot timeout and all cleanup errors remain preserved.

v3 waits at an event for the actual finite first-person camera, FOV 65,
the expected transition revision and an eye at the current presentation
subject plus 1.62 m. E's public transition and rendering share the original
60-second phase; the wait cannot restart that phase or extend the unchanged
32/25/12-minute whole-case deadlines. Other event waits are capped at 60 seconds
and the remaining whole-case deadline. This is one read-only predicate wait,
without input retry, state setter, camera change or skipped assertion. All
original route/camera/asset/collision/error guards remain in place.

The actual v2 owned browser close exceeded its 15-second cap, then its explicit
owned kill closed the process with SIGKILL. v3 changes that close cap to 30
seconds, still clipped by the same whole-case deadline. Cleanup failure and
the owned-kill fallback remain reported; a longer cap is not evidence that
normal closure now succeeds. The parent independently confirmed PID 79318
gone and port 5228 refused connections after v2.

Only the method CLI, one small readiness helper and the method fingerprint
list change. The separate CPU check covers null/stale/current camera,
wrong revision/FOV/nonfinite values and phase/whole deadline clipping.
No browser, GPU, production source, asset, prior test or native output was
modified or executed while preparing v3. Prior v2 bytes and failure files
are recorded in `v3-resolution-receipt.json`. Use a distinct new output with
the v3 CLI; never overwrite either failed attempt.
