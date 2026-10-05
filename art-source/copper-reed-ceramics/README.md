# Original Copper Reed ceramic source

`src/harbor-ceramic-art.js` is the editable and deterministic original map
recipe. It generates six 256 × 256 RGBA maps, allocated only when the south-096
near frontage is resident. Pigment uses sRGB; height and roughness use linear
data. All maps use mipmaps and linear filtering. Fired ivory glaze has irregular
warm pigment and variable roughness, while bare clay has greater grain relief
and a distinct roughness range. There are no external texture inputs.

`createCraftVesselGeometry` in `src/harbor-frontage-profiles.js` samples the
original outer thrown spline at 24 subdivisions and its inner wall at 16,
with 32 radial segments. The rounded rim remains open above a closed inner
floor and foot. Degenerate axis triangles are removed and duplicated UV seam
normals are averaged. The old actual Float32 maximum radius and height stay
exact. This is a visual geometry and material revision; it adds no colliders.

Six maps contain 1,572,864 base-level bytes; all levels of a complete uncompressed
RGBA mip chain contain 2,097,144 bytes. These are calculated texel counts,
not a measurement of hardware VRAM. The existing near-frontage owner releases
the two new materials and six maps on distance unload and final disposal.

CPU checks demonstrate geometry, source identity and resource ownership.
They do not demonstrate native material readability or constitute art approval.
The old fixed-camera High captures must be retained when comparing a new image.
