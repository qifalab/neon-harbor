# Morning Tin original bread and cup source

This source responds to the rejected same-view High south-094 bread images from
5cd2088. The old brown vertex tint and subtle microdetail produced smooth brown
loaves; floating pale scoring strips looked painted. These original maps add
8–30 mm toasted colour patches, irregular small blisters and fissures, with
independent height and roughness. They contain no photograph, external texture,
painted score stripes or directional baked shadow.

Run `python author_bread_crust.py` here using `requirements-authoring.txt`. It
writes the three maps, recipe, CPU statistics and unlit channel preview into
this directory. Compare the generated map hashes with
`assets/harbor/bakery/manifest.json`, then copy only the three PNG files to
`assets/harbor/bakery/`. The seed is fixed and generation is byte reproducible
with the recorded dependencies. This preview does not approve runtime art.

The 256 × 256 map describes an X/Z patch referenced to 304 × 196 mm; individual
loaves project physical X/Z across 286–322 × 184–208 mm with variant offsets.
At the original approximately 100 px loaf width, toast patches span about
2.6–9.9 screen pixels and blister axes approximately 1.0–3.3 pixels. Fissures
and dust remain subordinate under minification. Albedo is sRGB; height and
roughness are linear data. The white crust material uses scalar roughness 1,
zero metalness/emissive and 0.8 mm bump scale; neutral vertices avoid doubling
the previous dark brown tint. Integral exposed crumb has its own colour and
shares only the height texture at lower scale.

Editable geometry lives in `src/harbor-frontage-profiles.js` and
`src/harbor-bread-art.js`, with parameters in `geometry-recipe.json`. Crumb and
crust use disjoint triangles of one physical shell, sharing exact position,
normal and UV at their boundary; no overlay strip remains. Bread stays within
all five original actual AABBs. The south-094 cups have 32 radial segments,
closed internal floors and underside, thick lips and open mouths. Handles use
20 major segments; each shape fits its original actual faceted AABB. Other
five shop geometry/material arrays, entrances, collisions, glazing, light and
quality defaults remain identical in the isolated CPU differential check.

Three maps belong to the one near bakery owner. Disposal releases each Three
texture and both materials once; late callbacks close closable image objects
once. The default browser TextureLoader uses HTMLImageElement, which has no
close method. Scene unload drops the group/owner, allowing its remaining
material/image references to become eligible for collection. CPU disposal
counts do not measure browser GC, native image decoding, GPU upload or VRAM.

Assets and texture recipe: CC0-1.0. Authoring/geometry code and documentation:
MIT. See the asset dedication and MIT license. Actual High surface readability,
PBR response, glass attenuation and performance still require same-view native
art review after integration; no CPU result grants visual acceptance.
