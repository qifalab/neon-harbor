# Independent static review: narrow storefront candidate

Reviewed `/tmp/neon-frontage-display-art-candidate-20261005` using source reads, source diffs, SHA256 reads and existing evidence files only. No imports, tests, builds, world construction, browser, GPU or network were run by this reviewer. `/workspace/scratch/neon-harbor` was untouched.

Final reviewed source pins:

- `src/harbor-frontage-profiles.js`: `5610b4ff4847bee580c01a08e9351e75ce6aa99a46d41cfe8d71bc5bca855d85`
- `src/harbor-district.js`: `50d8acd11b5b2e8d5e5335dfc1a37193642d6d38abfe586eab3d24fd01671e8d`

The files read on disk and `display-bounds-proof.json` match these pins. The initial district pin `ce93e7...492e` was superseded during this review to address the shadow blocker described below.

## Disposition

No remaining static blocker found in the requested depth/bounds, public-door, material ownership/disposal or budget-regression logic checks at the final pins. This is not visual/art acceptance. There is one support concern in the noodle display that deserves native-view inspection or a small explicit support correction.

## Fixed blocker

The initial candidate disabled `displayGlass.castShadow` in construction and district `setQuality`, but assigned near glazing `mesh.userData.noShadow=false`. `main.js:204` subsequently traverses the combined city root and sets `castShadow=high` on every mesh without `noShadow`. `city-exploration.js:42` includes `sampleDistrict.root` in that root, so toggling/reapplying High would restore an opaque glass shadow.

The final district source now assigns `mesh.userData.noShadow=!detail||!!material.userData.displayGlass` (`harbor-district.js:283`). Together with both existing cast-shadow guards, this closes that path without changing other near-material shadow behavior.

## Findings by requested area

- **Depth and bay bounds:** The helper explicitly moves the opaque backing to out 0.20 (thickness 0.04), places goods and shelves around out 0.39–0.405, and puts separate glass at out 0.675 (thickness 0.016). Existing CPU evidence reports all six programmes / 16 windows at out min 0.18 and max 0.683, within the specified 0.69 outer allowance. `inspect-display-bounds.mjs:35` checks transformed bounds in local x/y and out for every helper operation. This is local bay containment evidence, not a visibility, rounded-hole clipping, lighting or transparency judgment.
- **Public doors:** The source diff keeps their old dark backing at out 0.43 and old `m.glass` at out 0.505. Both same-face south doors and transformed south doors on east-frontage shops preserve their geometry and transforms. Only the declared handle material changes from `m.metal` to `m.handle`. The proof compares all non-display operation sequences while permitting that material substitution (`inspect-display-bounds.mjs:36–39`).
- **Materials:** Warm handles have a dedicated cache key, color `#d5bd8b`, roughness 0.35 and metalness 0.55. Display glass has its own cache key and kind, is transparent with opacity 0.20 and depthWrite false, and avoids the old kind='glass' emissive initializer. The day/night update continues to change only `baseMaterials.glass.emissiveIntensity`; display glass therefore remains at the StandardMaterial non-emissive default.
- **Ownership/disposal:** New shared materials are owned by `materialCache` and disposed once at district teardown, not on frontage unload. Per-frontage merged geometry is destroyed by unload; all unshared temporary Lathe/Sphere/Torus geometries are released after merging. New display geometry adds no textures, lights, colliders or fixture ownership. No new lifetime mismatch was identified.
- **Collision and fixtures:** The entire localToWorld/collider/fixture source block is identical to `before`; the existing proof records SHA256 `9109ef28068ce757d567afc227bf717c9c74440b377834f34c4d2b182a177ce3`. Diff review supports that result. Display props remain visual-only; shop purchases and inventory code are outside this patch.
- **Budget/streaming:** Hysteresis, near/far thresholds, proxy construction, resident ownership and disposal logic are unchanged. Added parts continue to merge by material, so parts are not independent draw calls. Two additional material buckets per resident frontage are possible. Limits remain 100 calls / 85,000 triangles / six residents. The existing CPU test log reports seven passing district tests including actual six-resident budget and unload checks; its log does not embed source hashes, and this reviewer did not rerun it. No budget claim is derived from part counts alone.

## Remaining art/support concern

`harbor-frontage-profiles.js:79` places the noodle bowl hemisphere at `y=shelfY+.025+.30` with radius 0.105. Its bottom is at `shelfY+.220`; the lower shelf top is at `shelfY+.0225`, a gap of roughly 0.198 m. The cup below reaches `shelfY+.160`, leaving about 0.060 m between its rim and the bowl bottom. There is no bowl support geometry in this helper. This is a deterministic static observation, but whether the intended native composition makes the floating bowl visible must be judged from the new matched views. Bounds acceptance alone does not resolve it.

## Acceptance boundary

The existing bounds proof uses synthetic site placement and placeholder materials and validates CPU geometry only. It does not check the original shell behind the display, camera-angle occlusion, opaque/transparent render ordering, reflected daylight, night response, actual entry/exit, or visual quality. Final art acceptance requires new matched native views from the adopted source pins. Neither the initial failed captures nor CPU containment evidence establishes that result.
