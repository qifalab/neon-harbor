# Morning Tin original crisp bread V3

Original CC0 procedural crust / crumb maps and editable MIT authoring code. This revision responds to the AEC actual High bakery close-ups: low-frequency brown clouds and smooth pale score bands were insufficient. No screenshot pixels, photos, external texture or lighting are input.

`python3 author_bread_crust.py` generates three deterministic 512×512 atlas PNGs using NumPy and Pillow. Left 384 pixels hold amber dry crust, interrupted blister edges and fine branched fractures; right 128 pixels independently hold pale dry porous crumb. The maps are albedo (sRGB), height (linear) and roughness (linear). Both materials share exactly three owner textures and select their own atlas region. This is an original procedural approximation, not a scan.

`src/harbor-frontage-profiles.js:createBakedDisplayLoaf` is the editable geometry source. Five slight dome/shoulder variants use integral 13 mm nominal recessed cuts with an asymmetric narrow baked ear; no floating stripe. Old actual Float32 maxima constrain the ridge. Collapsed pole faces are removed. All loaves keep their original transforms and AABBs; cups, glass, other stores and physics are unchanged.

Three compressed PNGs and atlas bounds are recorded in assets/harbor/bakery/manifest.json. A three-RGBA8 complete mip-chain upper bound is 4 MiB, versus 1 MiB for the prior 256 maps; these are format estimates, not measured VRAM. Six-store CPU geometry remains within the existing 110000 triangles / 102 draw calls limit. Owner disposal and late decode closure use the existing lifecycle.

CPU generation/decoding, geometry and owners are validated. Actual High close-up recapture and independent art acceptance remain pending. Texture size, triangle count and rule checks do not establish high-quality or AAA rendering.
