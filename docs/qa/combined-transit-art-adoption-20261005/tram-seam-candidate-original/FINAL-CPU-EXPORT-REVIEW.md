# Final CPU Tram seam correction candidate

Decision: ready for selective source review and adoption; actual pixels and native journey remain pending.

The original lower-deck image contained a triangular white/brown fascia seam. Actual original GLBs expose a 20 mm overlap at height 2.55–2.57 m; two opaque surfaces compete at micrometre-scale depths. This establishes a geometry defect, while the still alone does not establish temporal flicker.

The actual corrected Blender 4.3.2 export moves only three generator lines to begin the brown side/end/corner spandrels at 2.57 m. Original upper heights, waist thickness, envelope, collisions, stairs, door controls, hooks, materials, UVs, images and all other primitives are unchanged. Control exports exactly reproduce all three original GLBs. Each corrected LOD changes one existing paint primitive only; position/normal/tangent changed-row counts are 900/124/125, 464/52/60 and 90/30/30. All glTF JSON and indices remain exact. Actual corrected buffers pass 84 side/end material-presence samples and the original static asset checker once.

Three LODs retain 77,744 / 23,892 / 7,972 triangles; 15 / 14 / 11 materials; 39 / 38 / 31 primitives; 9,715,464 total GLB bytes. Control/corrected exports completed in 5.6369/5.7888 seconds with exit 0; stderr is empty. The control .blend is not claimed byte-identical to the archived master. The corrected editable master is included with provenance from the fresh source recipe.

The selective production payload contains 18 files: 10 replacements and 8 new named review/history records, 21,559,796 bytes. Every existing target SHA is enumerated. Old review files, the six old source/runtime GLBs, original master, licences and native failures remain unchanged. The preceding active manifest is preserved literally in a new named history receipt. CPU control exports, logs and preparation tools outside `payload/` are external QA evidence and must not be adopted into production.

Runtime source changes include THREE GLBs AND the client fingerprint JavaScript module, for FOUR changed paths. Reversing the three SHA substitutions restores the entire old JavaScript byte for byte. Actual emitted runtime identity/count/deltas must be derived from Root's final build; no claim of only three runtime changes or 205 identical resources is made.

Root must inspect new-source actual High Tram seam views and recapture all four Day/Night images after the final source build. Old native failures and old-source pixels cannot become new-source passes. This candidate asserts no pixel, journey, performance, whole-vehicle commercial-quality, AAA or whole-city pass.
