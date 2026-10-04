# Final integrated harbor comparison

The final integrated v0.8 build is compared with the independently built public v0.7 baseline, using the real promenade start button, visible settings, High, 1280×800, fixed 16.5/23.9 hours, the same position and camera, and Chromium 151.0.7922.34 / SwiftShader. `comparison-verification.json` checks these conditions; both metadata files contain the build manifests and screenshot hashes. No game coordinates or clocks were written through debug APIs.

The four original images were visually reviewed. Day and night render fully without a black frame or a conspicuous broad colour change. Nearby wall contact shading is clearer, and the HUD exposes the new harbor services. The existing skyline and waterfront remain visibly procedural; this comparison does not show an overall jump to commercial AAA production quality. It also does not frame the newly authored shops or vehicle cabins closely enough to judge their craft.

Reported drawing calls rise from 311 to 440 by day, and 338 to 467 by night. Triangles rise from 494,636 to 532,622 by day, and 500,376 to 538,362 by night. The extra integrated transit and population have a real rendering cost. These figures are a single viewpoint's counters, not hardware frame-time measurements. Recorded software FPS is rounded and cannot establish desktop GPU performance.

`diagnostics/pre-static-batching/` retains the prior integrated captures and their manifest. Combining 101 fixed transit parts into 16 independent street/pier batches reduces this viewpoint by only nine calls (449→440 / 476→467). It adds 876 reported triangles because aggregate bounds draw some parts that were individually culled. The 85 fewer scene meshes are not an 85-call measured reduction. The candidate manifest is `b83ccae70a56a111ec5bd44e550b48fbb47d0634caf5899035713341b2aa4ab9`; relative to the first browser build, only `src/harbor-transit-renderer.js` changed among fingerprinted runtime files. No hardware speed improvement is claimed.

`diagnostics/browser-mismatch/` retains an initially rejected comparison. That attempt used system Chromium 151.0.7922.173 against the older 151.0.7922.34 baseline. Its captures were rendered, but the tool correctly rejected the browser mismatch. The candidate was then recaptured with the same Playwright Chromium as the baseline; the matching run passed. Moving traffic, water and boats are not locked to the same animation frame; their timestamps are recorded.

Reproduce with the existing baseline first and a frozen candidate, using one Chromium executable for both:

```sh
node tools/capture-harbor-comparison.mjs v07 --root /path/to/v07/dist --output test-results/final-harbor
node tools/capture-harbor-comparison.mjs v08 --output test-results/final-harbor
```
