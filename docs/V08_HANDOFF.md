# v0.8 development checkpoint — 2026-10-04

This checkpoint is **not a verified release**. The published v0.7 site remains
unchanged. Do not deploy this revision before completing regression and visual QA.

## Implemented locally

- Separate analytic finishes for paint, skin, fabric, leather, metal and mineral
  surfaces; cloth folds and soft-furniture geometry.
- Depth contact occlusion for High/Balanced, with offscreen colour/depth rendering,
  filtered composition and multisampling. Low retains direct rendering.
- Approximate architectural radiance proxies supplement the sky environment;
  this is not planar reflection, SSR or a full-scene reflection capture.
- Existing building shells now have 220 address records: 48 north, 96 south and
  76 east; 4,374 floor records. Newly opened interiors use shared programmes.
- Compact southern layouts, east-shore support/collision, entry/exit checks,
  exterior hiding/restoration, lazy atlas room lists and save integration.
- Multiplayer world ID v08, horizontal bounds 1,800 m and height limit 460 m.

## Verification status

Intermediate builds, representative floor-geometry checks and one real WebGL
harbour capture completed. Those checks preceded subsequent edits and do not
verify the final checkpoint. An intermediate unit run had four resident-network
failures; the fixture scope was then adjusted but has not been rerun to completion.
The temporary original log is no longer available.

New unit coverage is in `tests/city-materials-v08.test.js`; new browser coverage
is in `tests/e2e/city-materials.spec.js` and is wired into CI. Neither new suite
has been executed to completion. The existing north-shore resident network must
remain tested; residents are not yet simulated equivalently across new districts.

## Continue here

1. Run `npm test` and `npm run build`; fix actual failures without weakening gates.
2. Run the new browser suite and existing gameplay, transport, resident,
   streaming, traffic and two-browser multiplayer suites.
3. Check every address's usable entry/exit, compact stair and lift clearances,
   floor slabs, furniture paths and exterior restoration across streaming.
4. Review real High-quality near views and matching before/after captures. Check
   occlusion edges, flicker, colours, antialiasing, resource lifetime and performance.
5. Review the hard-coded coordinate and catch/retry in the new living-room test.
6. Update README and QA documents; currently they still describe the earlier release.
7. Only then publish through the existing GitHub Pages verification workflow and
   confirm the live revision and asset hashes.

The expanded directory, passing functional tests and increased floor count must
not be described as AAA-quality completion or individually handcrafted rooms.
