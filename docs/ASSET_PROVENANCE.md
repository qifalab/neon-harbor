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

Concrete, asphalt, roof finishes, and the temporary fallback versions of the four images are deterministic procedural color textures created by this project's code. Solid metals, glass, foliage, and lights use project-authored material values. A failed network/image request leaves a procedural texture visible. No browser image APIs are invoked during Node/SSR construction.

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

