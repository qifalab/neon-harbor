# Actual tiny WebGL cleanup-order comparison

This is a bounded diagnostic probe, not a game collector rerun or native-art acceptance. Both serial probes used the installed Playwright1.62.1 and actual Chromium151.0.7922.34, official launchServer/connect, identical enable-webgl/use-angle=swiftshader/enable-unsafe-swiftshader flags,1280×800 viewport/deviceScaleFactor1, a real WebGL2 canvas,12 RAF clears, GL error0 and no context loss. Actual renderer was ANGLE Vulkan SwiftShader Device (Subzero). The raw probe and owning wrapper receipts are preserved.

| Actual serial order | Context close | Client disconnect | Owner server.close | Chromium exit |
| --- | ---: | ---: | ---: | --- |
| context→client→owner | 6.742ms | 1.154ms | 27.776ms | code0 / no signal |
| context→owner→client-if-connected | 6.093ms | owner disconnected client automatically | 42.187ms | code0 / no signal |

Each variant used the same finite shared30000ms closure window; no cap was widened. The wrapper's whole window was120000ms and actual elapsed1.215473 seconds. Launch root PID101032 was identity-bound before first poll; browser roots101044/startTicks4449874 and101099/startTicks4449916 and all12 observed descendants were pidfd-bound using an already-owned live parent's exact identity. The first set was confirmed closed before the second browser launched. Both Chromium owner processes disappeared normally. The final wrapper receipt confirms no surviving bound owned processes, no first error, no timeout and no signal fallback. It did not signal any process.

The old order disconnects the remote client, yet the owning launchServer pipe still closes the actual browser normally in this probe. Therefore this actual evidence contradicts a universal claim that client.close necessarily invalidates owner graceful shutdown. The reordered sequence is valid here, but was slower by~14ms and does not establish a fix for the30-second full-scene collector failure. No cleanup-order patch or35-second cap increase is justified as a proven repair by this result.

This probe intentionally has no city, loaded Three assets, shadows, AO, screenshots or long-running scene. Its drawing-buffer read after RAF returned zeros with the default non-preserved buffer; successful context creation, actual renderer, clears and GL error/context-loss checks are the probe's GL evidence. It does not claim a visible game frame or comparable GPU teardown load. The artifact has no CPU/GPU profile or evidence attributing the real collector delay to protocol disconnect, shader work or driver resource drain.

Keep the original full-scene collector's first FAIL and original cleanup/raw evidence unchanged. A future cleanup method must earn an actual full-scene result without extending whole-case/routes/guards, and must separately preserve first error, owner process closure and failure artifacts. No ROOT/source/index/refs/build/rules were changed here. Child CPU work was paused for the serial probe and resumed only after owned closure.
