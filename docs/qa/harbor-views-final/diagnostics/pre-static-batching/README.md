# Final integrated harbor comparison

The final integrated v0.8 build is compared with the independently built public v0.7 baseline, using the real promenade start button, visible settings, High, 1280×800, fixed 16.5/23.9 hours, the same position and camera, and Chromium 151.0.7922.34 / SwiftShader. `comparison-verification.json` checks these conditions; both metadata files contain the build manifests and screenshot hashes. No game coordinates or clocks were written through debug APIs.

The four original images were visually reviewed. Day and night render fully without a black frame or a conspicuous broad colour change. Nearby wall contact shading is clearer, and the HUD exposes the new harbor services. The existing skyline and waterfront remain visibly procedural; this comparison does not show an overall jump to commercial AAA production quality. It also does not frame the newly authored shops or vehicle cabins closely enough to judge their craft.

Reported drawing calls rise from 311 to 449 by day, and 338 to 476 by night. Triangles rise from 494,636 to 531,746 by day, and 500,376 to 537,486 by night. The extra integrated transit and population have a real rendering cost. These figures are a single viewpoint's counters, not hardware frame-time measurements. Recorded software FPS is rounded and cannot establish desktop GPU performance.

`diagnostics/browser-mismatch/` retains an initially rejected comparison. That attempt used system Chromium 151.0.7922.173 against the older 151.0.7922.34 baseline. Its captures were rendered, but the tool correctly rejected the browser mismatch. The candidate was then recaptured with the same Playwright Chromium as the baseline; the matching run passed. Moving traffic, water and boats are not locked to the same animation frame; their timestamps are recorded.

Reproduce with the existing baseline first and a frozen candidate, using one Chromium executable for both:

```sh
node tools/capture-harbor-comparison.mjs v07 --root /path/to/v07/dist --output test-results/final-harbor
node tools/capture-harbor-comparison.mjs v08 --output test-results/final-harbor
```
