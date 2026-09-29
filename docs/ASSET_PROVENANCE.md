# Metropolis material provenance

## Created for this project

The four architectural color textures were generated for Neon Harbor on 2026-09-29 using the built-in OpenAI image-generation tool. No reference photograph, brand asset, external texture library, or third-party artwork was supplied.

These are AI-generated albedo/color images. They are **not** scanned materials and are **not** a complete PBR material set. Roughness, metallic response, and lighting are implemented separately in `src/metropolis-materials.js`; there are no claimed measured normal, displacement, roughness, or reflectance maps.

| File | Source / processing | Dimensions | Runtime use |
| --- | --- | --- | --- |
| `metropolis-original-atlas.webp` | Generated four-quadrant atlas, encoded as WebP quality 90 | 1254 × 1254 | Kept for provenance; never requested by the game |
| `limestone.webp` | Upper-left 627 × 627 quadrant, downsampled, WebP quality 86 | 512 × 512 | Stone walls, paving, details |
| `lime-plaster.webp` | Upper-right quadrant, downsampled, WebP quality 86 | 512 × 512 | Plaster walls |
| `oak.webp` | Lower-left quadrant, downsampled, WebP quality 86 | 512 × 512 | Timber floors and joinery |
| `jade-tile.webp` | Lower-right quadrant, downsampled, WebP quality 86 | 512 × 512 | Ceramic walls and fittings |

The tool returned 1254 × 1254 pixels despite the prompt requesting 2048 × 2048. The actual resolution is documented above. Deterministic cropping and compression used ImageMagick. The source PNG remains in the generation workspace; the repository carries the compact source atlas and the four game-ready images.

The four runtime images total 203,710 bytes (about 199 KiB). The atlas adds 307,754 bytes to the repository but is never loaded by the renderer. Each image is loaded once per Three.js namespace. Material clones share the same texture and update subscription. Mirrored repeating addresses generated edge mismatch; world-space triplanar projection keeps the same physical texture density on differently scaled and instanced geometry. Texture anisotropy and mipmaps reduce distant shimmer. Transparent glass is intentionally opt-in to avoid facade sorting artifacts.

Concrete, roof finishes, ceramic, leather and steel, plus temporary fallback versions of image surfaces, use deterministic procedural color textures created by this project's code. Asphalt was replaced by the v0.4 image below. Glass, foliage, lights and brass use project-authored material values. A failed network/image request leaves a procedural texture visible. No browser image APIs are invoked during Node/SSR construction.

## License

The project-authored material code, procedural textures, and generated texture assets are distributed with this repository under its MIT license (`LICENSE`), to the extent rights in these assets are held by the project. No third-party texture-library license or paid asset dependency applies. This entry records creation and redistribution intent; it does not claim exclusive copyright protection for AI-generated pixels.

## Generation prompt

Built-in image-generation mode was used, with an opaque background and no input images.

```text
Use case: photorealistic-natural
Asset type: original game environment albedo texture atlas, to be split into four square reusable texture maps.
Primary request: Generate one EXACT square 2 by 2 texture atlas at 2048 by 2048 resolution. Each quadrant is an independent material photographed straight on in perfectly flat orthographic view. No surrounding scene, no frame, no divider, no labels. Vertical split exactly at 50% of width and horizontal split exactly at 50% of height.
Top left quadrant: warm grey Hong Kong limestone paving and fine mineral flecks, a subtle rectangular ashlar layout with narrow natural stone joins, weathered tactile surface, restrained contrast.
Top right quadrant: aged pale ivory lime plaster wall, delicate fine grit and cloudy limewash variation, tiny chips, muted warm beige, no exposed brick and no major cracks.
Bottom left quadrant: finely grained medium warm oak wood planks, four parallel strips with subtle straight joins and diverse grain, realistic satin worn wood.
Bottom right quadrant: deep jade green glazed small square ceramic wall tiles, regular straight grid, narrow warm grey grout, mild variation among individual tiles and delicate glaze crazing.
Lighting: perfectly diffuse even illumination; neutral albedo only; no directional lights, no highlights, no vignette, no gradients, no cast shadows, no perspective.
Constraints: the crop of EACH individual quadrant must itself be seamless and tileable on all four edges. Detail reaches the exact outer boundary of each quadrant. Color balance feels like believable urban building materials. These are color maps only, not a promotional illustration or a display board. No text, logos, people, objects or borders.
```

## v0.4 lived-in city surfaces

Three additional **original AI-generated base-color maps** were created on 2026-09-29 with the built-in OpenAI image-generation tool, opaque background, with no input/reference images. Each was a separate generation call. These are generated material studies, not photographs or measured scans. ImageMagick was used only to resize and encode the tool output, not to draw or edit content.

The tool returned 1254 × 1254 pixels for all three despite requesting 1024 × 1024. The repository preserves full-resolution source encodings and runtime versions. No generated content was cropped, composited or retouched.

| File under `assets/materials/v04/` | Dimensions | Bytes | Encoding / use |
| --- | --- | ---: | --- |
| `weathered-plaster-source.webp` | 1254 × 1254 | 431,992 | Full generated image; quality 92; provenance only |
| `weathered-plaster.webp` | 1024 × 1024 | 294,122 | Quality 84; exterior render, limewash walls, painted trim |
| `aggregate-asphalt-source.webp` | 1254 × 1254 | 501,784 | Full generated image; quality 92; provenance only |
| `aggregate-asphalt.webp` | 1024 × 1024 | 359,508 | Quality 82; north-shore streets and paved transport surfaces |
| `woven-linen-source.webp` | 1254 × 1254 | 329,436 | Full generated image; quality 92; provenance only |
| `woven-linen.webp` | 1024 × 1024 | 260,678 | Quality 85; fabric, upholstery and carpet shared map |

The three new runtime files total **914,308 bytes (893 KiB)**. Source encodings are never referenced by the material loader. The earlier `lime-plaster.webp` remains as a historical v0.3 artifact; v0.4 requests `weathered-plaster.webp` instead.

Runtime surfaces use world-space triplanar projection after instance transforms and mirrored repeat. Generation requested matching edges; perfect periodicity is not claimed. Mirroring maintains color continuity at the boundaries without baking new pixels. Plaster and asphalt each repeat over two metres. Linen repeats over 0.4 m, upholstery over 0.45 m, and carpet over 0.75 m. Upholstery, carpet and fabric have separate material response values but **share one texture object and one network load**. Color variants and material clones retain the same load subscription and projection shader; disposing a clone removes its subscription.

The shader adds restrained, art-directed luminance relief and roughness variation. It uses screen-space derivatives of world-metre surface height to perturb normals, with slope clamping at grazing angles. Woven fibres, leather grain and steel brushing add a small procedural component that fades below pixel resolution. This is an inexpensive authored approximation; it is **not measured roughness/normal/displacement data**. Geometry and collisions remain unchanged by relief. There is no extra height-texture download and no per-object image creation.

### v0.4 material keys

| Key | Role | Roughness | Relief amplitude | Shared texture |
| --- | --- | ---: | ---: | --- |
| `plaster` | Weathered mineral render | 0.94 | 9 mm | weathered-plaster |
| `asphalt` | Dry aggregate road surface | 0.97 | 16 mm | aggregate-asphalt |
| `fabric` | Neutral linen bedding/cloth | 0.96 | 1.8 mm | woven-linen |
| `upholstery` | Warm terracotta seating | 0.95 | 2.2 mm | woven-linen |
| `carpet` | Dense muted green floor textile | 0.99 | 7 mm | woven-linen |
| `leather` | Brown leather furnishing | 0.53 | 1.3 mm | procedural |
| `steel`, `metal` | Brushed architectural metal | 0.43 | 0.2 mm | procedural |
| `ceramic` | Pale ceramic with dark grout | 0.29 | 3 mm | procedural |
| `tile` | Existing jade glazed ceramic | 0.34 | 3.5 mm | jade-tile |
| `white` | Painted plaster trim | 0.96 | 3 mm | weathered-plaster |
| `wood`, `timber`, `walnut` | Timber variants | 0.61–0.66 | 3 mm | oak |
| `stone`, `limestone` | Mineral walls and paving | 0.91 | 12 mm | limestone |

The amplitude is a shader tuning parameter, not a claim that all pictured details have that actual relief. Shader roughness varies around the listed base value. Existing keys remain available, and `ceramic` is intentionally separate from jade `tile` so homes and washrooms can use a pale finish.

### Exact v0.4 prompts

Built-in tool mode, no references, no transparent background.

#### Weathered plaster

```text
Use case: photorealistic-natural
Asset type: original physically plausible base-color texture map for a realtime open-world coastal city game.
Primary request: A single square seamless tileable texture of weathered warm pale grey lime render and concrete plaster from the wall of an inhabited subtropical harbor apartment building. Orthographic front view, filling every pixel edge to edge. A restrained irregular troweled mineral surface, fine sand aggregate, old layered limewash, delicate shallow hairline cracks, a few tiny chips and humid salt-weathered variations, believable and gently aged rather than abandoned. Warm grey ivory palette, luminance balanced across the image. Represents a two metre by two metre wall section.
Lighting: flat diffuse neutral illumination, albedo only, no directional lighting or baked shadows.
Constraints: exactly one material, one square image, no composition or scene. Seamless matching edges on all four sides, details evenly distributed. No bricks, no hard horizontal or vertical panel edges, no broad stains that make repeating obvious, no plants, no objects, no people, no signage, no text, no logos, no watermark, no border, no vignette. Tactile real mineral detail, absolutely no smooth plastic look. Request 1024 by 1024 pixels.
```

#### Aggregate asphalt

```text
Use case: photorealistic-natural
Asset type: original physically plausible base-color texture map for the road surface in a realtime open-world harbor city game.
Primary request: A single square seamless tileable texture of charcoal grey aggregate asphalt in a lived-in subtropical coastal city. Orthographic top down view, filling every pixel edge to edge. Realistic small crushed stone aggregate distributed naturally in dark tar, some gently worn flatter stone pieces, muted charcoal warm grey with very restrained lighter speckle, tiny scattered pores and minute darker grains. Moderately aged and dry, well maintained city street, not rubble. Represents a two metre by two metre patch.
Lighting: flat diffuse neutral illumination, albedo only, no directional lighting or baked shadows, no specular highlight.
Constraints: exactly one material, one square image, no composition or scene. Seamless matching edges on all four sides. No lane markings, curbs, drains, paint, plants, litter, buildings, large cracks, potholes or strong stains, no wet gloss, no text, no logos, no watermark, no border, no vignette. Fine tactile aggregate detail not a noisy star field. Request 1024 by 1024 pixels.
```

#### Woven linen

```text
Use case: photorealistic-natural
Asset type: original base-color texture map for sofa upholstery, linen bedding and tactile fabric furnishings in a realtime open-world city game.
Primary request: A single square seamless tileable texture of high quality natural oatmeal linen upholstery, tightly but visibly woven from slightly irregular flax threads. Orthographic macro front view, filling every pixel edge to edge. A subtle regular plain weave with tiny thread thickness variations, mixed pale ivory and warm light taupe yarn, understated occasional fine fibres. Clean comfortable lived-in textile, unpatterned and matte, neutral enough to recolor in a game shader. The image represents a forty centimetre by forty centimetre piece of real woven fabric, many fine threads rather than oversized rope or burlap.
Lighting: perfectly diffuse even neutral illumination, base color only, no directional shadows, no highlight, no shading gradient.
Constraints: exactly one material, one square image. Seamless matching edges on all four sides. No folds, no seams, no pillows, no borders, no stitching line, no decorations, no objects, no text, no logos, no watermark, no vignette. Real tactile textile microstructure, never smooth plastic or knitted chunky wool. Request 1024 by 1024 pixels.
```

### Source generation identifiers

- Plaster: `exec-851b99c6-75de-487b-9097-abb98b264957.png`
- Asphalt: `exec-355af363-f9f9-4e8c-a114-6c011dd4bb6d.png`
- Linen: `exec-647bd4f4-eabd-447b-be87-4d2b7e1dc039.png`

These identifiers record the tool-returned source files; the durable repository versions are the `*-source.webp` files listed above. The same MIT redistribution intent and AI-pixel copyright qualification described above applies to these additions.
