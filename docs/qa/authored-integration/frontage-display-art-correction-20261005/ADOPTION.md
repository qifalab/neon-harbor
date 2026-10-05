# Narrow storefront display and handle correction

Production source is frozen at the pins in `source-after.json`; adoption scope is **only** `src/harbor-frontage-profiles.js` and `src/harbor-district.js`. ROOT was not edited. `narrow-art.patch` compares both exact original files.

The candidate gives every actual public door a dedicated brushed warm brass handle material (`#d5bd8b`, roughness 0.35, metalness 0.55), retaining every handle shape, dimension and transform. Existing public door dark panels and opaque glazing remain unchanged. Only non-door ground-level windows receive recessed real display geometry: produce and slatted crates, ceramic vessels, book covers and paper/page bands, curved bread, tea cups and bowls according to the six original programmes. These are visual displays; purchases still use the existing finite occupied counter.

Display backings move from out 0.43 to 0.20. All new shelf/goods/glazing vertices lie within the existing bay frame width/height and out 0.18–0.683 m. The old outer frame envelope is 0.69 m. Dedicated front glazing is out 0.675 m, thickness 0.016 m, opacity 0.20, roughness 0.18, metalness 0.02, transparent, depthWrite false and non-emissive. The dedicated glass does not cast an opaque shadow. Existing other materials, exposure, lights and texture inventory are unchanged.

`inspect-display-bounds.mjs` directly intercepts every actual geometry operation of the new elevation function; `display-bounds-proof.json` records every transformed bounds and source pin. Across 6 programmes / 16 windows it checks all new props stay inside their old bay envelope; after excluding only the two replaced opaque panes per window, the complete old remaining geometry operation sequence is identical, permitting only the declared handle material substitution. The entire production localToWorld/collider/fixture source block is byte-identical, SHA256 `9109ef28068ce757d567afc227bf717c9c74440b377834f34c4d2b182a177ce3`.

No browser, GPU, image editing, native capture, build, Git/API or publication was performed here. CPU/source verification cannot establish the final visual result; new matched native views and actual entry/exit remain required. Original failed captures and the independent original art review stay unchanged. Update the wider capture proof source pins explicitly after adoption rather than treating old source hashes as current.

Final CPU/material/dispose observations and independent review receipt are appended after the brief ROOT GPU probe closes.

## Final CPU observations

After ROOT confirmed its GPU process and all owned descendants had closed, final actual-world `node --test tests/harbor-district.test.js` passed 7/7 in 831.081716 ms. The six-site synthetic shell comparison independently measured 88 draw calls and 70,244 triangles, versus original 74 and 42,292, within unchanged 100 / 85,000 caps. Collider arrays, fixture arrays and public frontage positions were equal. Own balanced→High and the actual main.js global shadow traversal retained non-shadow-casting display glazing. All 88 near merged geometries emitted disposal on unloading; the two dedicated shared materials each emitted exactly one final disposal, and the root was empty/detached.

The independent static reviewer identified two issues during candidate preparation. Global quality traversal could re-enable glazing shadows; the final candidate explicitly sets `userData.noShadow` for that material. A lower noodle bowl had no support; the final candidate places its bottom 0.0025 m above the shelf top and removes the co-located cup. The final bounds proof still passes.

Two diagnostic-script failures are preserved, not reported as passes: attempt 1 demanded emissiveIntensity 0 whereas Three.js defaults to 1 with black emissive colour (the glass was still visually non-emissive); the final candidate makes intensity 0 explicit. Attempt 2 wrongly compared the `surfaceFinish` settings object to a string; the inspection now reads its documented `.kind`. Their original error logs/scripts and the exact first-attempt source are retained. The final successful proof records actual resulting properties.

Final independent static supplement: `independent-review-final.md` verifies both final production SHA pins and reports no remaining static blocker after the two fixes. The original review is retained as `independent-review-first.md`. Final native views remain pending.
