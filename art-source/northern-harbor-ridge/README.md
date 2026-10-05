# Original northern harbor ridge

The editable producer is `src/metropolis-northern-ridge.js`. It creates one continuous lateral height field with wandering spine, unequal broad masses, shoulders and bent gullies; it is not twelve repeated round hills. The closed submerged perimeter stays within the original northern union AABB. Original position stamps remain in metropolis-world.js as source layout evidence and are validated by the existing western builder.

This is a decorative skyline backdrop. It adds no collider, walking support, road, building opening, new district or exploration claim. All original 4178 city collision fields, ground callbacks, six sample trees and all other scene/streaming data stay identical. Default quality is unchanged.

The ten western hills keep every original vertex attribute, triangle index and their original material response. North uses a separate MeshStandardMaterial with original vertex colours and two generated 256×256 DataTextures: roughness and tangent normal. Existing mineral surface finish is reused; no new shader modification is introduced. Outputs are CC0, implementation MIT, no external images or meshes.

The combined backdrop changes from 8608 triangles / one draw to 25072 / two draws. North itself is 16752 triangles / one draw. Final west+north geometry buffers total 702984 bytes; two RGBA8 normal/roughness base levels total 524288 bytes, or 699048 bytes with ideal full mip chains. These are source-format costs, not driver VRAM or hardware performance measurements. The producer also uses temporary arrays; the final-buffer budget is not a measured peak JS heap figure.

Actual CPU deterministic generation, original-world comparison, finite/upward normals, zero-area rejection, bounds, 4178 collisions, six tree sites, streaming payloads and resource disposal are checked. The original five western rules now verify the new northern decorative contract, while retaining western scope protections. No full project test/build or browser was run here. Actual High rendered shape/material acceptance remains pending.
