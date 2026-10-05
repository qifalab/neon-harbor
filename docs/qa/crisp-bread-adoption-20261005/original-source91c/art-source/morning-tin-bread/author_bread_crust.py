#!/usr/bin/env python3
"""Original baked-crust PBR authoring; MIT; NumPy + Pillow only.

No photos, downloaded textures, AI images, or screenshot pixels are inputs.
UV 0..1 describes a 304 x 196 mm display loaf. All relief is nondirectional
height, and all colour variation describes baking/flour, never a lit shadow.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent
SIZE = 256
SEED = 2026100594
WIDTH_M, DEPTH_M = 0.304, 0.196
MAX_RELIEF_M = 0.0008


def smooth_noise(rng, nx, ny):
    """Periodic C2-interpolated value noise, independent X/Z metre scales."""
    grid = rng.uniform(-1.0, 1.0, (ny, nx))
    x = np.arange(SIZE) * nx / SIZE
    y = np.arange(SIZE) * ny / SIZE
    ix, iy = np.floor(x).astype(int), np.floor(y).astype(int)
    fx, fy = x - ix, y - iy
    wx = fx * fx * fx * (fx * (fx * 6.0 - 15.0) + 10.0)
    wy = fy * fy * fy * (fy * (fy * 6.0 - 15.0) + 10.0)
    a = grid[iy[:, None] % ny, ix[None, :] % nx]
    b = grid[iy[:, None] % ny, (ix[None, :] + 1) % nx]
    c = grid[(iy[:, None] + 1) % ny, ix[None, :] % nx]
    d = grid[(iy[:, None] + 1) % ny, (ix[None, :] + 1) % nx]
    return ((a * (1-wx) + b * wx) * (1-wy[:, None])
            + (c * (1-wx) + d * wx) * wy[:, None])


def smoothstep(lo, hi, values):
    t = np.clip((values-lo)/(hi-lo), 0.0, 1.0)
    return t*t*(3.0-2.0*t)


def periodic_delta(values, centre, span):
    return (values-centre+span/2) % span-span/2


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, sort_keys=True,
                               indent=2) + "\n", encoding="utf-8")


def main():
    rng = np.random.default_rng(SEED)
    x, z = np.meshgrid(np.arange(SIZE)*WIDTH_M/SIZE,
                       np.arange(SIZE)*DEPTH_M/SIZE)
    # Different broad frequencies and warped boundaries eliminate a regular
    # ball/spots pattern. Cell wavelengths are baking patch diameters, not pores.
    broad = smooth_noise(rng, 13, 8)
    medium = smooth_noise(rng, 27, 18)
    fine = smooth_noise(rng, 76, 49)
    grain = smooth_noise(rng, 111, 73)
    warp_x = smooth_noise(rng, 38, 24) * 0.00105
    warp_z = smooth_noise(rng, 43, 29) * 0.00085
    broad_bake = 0.66*broad + 0.24*medium + 0.10*fine

    blister = np.zeros((SIZE, SIZE))
    toasted_blister = np.zeros_like(blister)
    blister_parameters = []
    # Clusters have unequal populations, spacing, eccentricity and branching
    # irregular boundaries. They are raised baked skin, never embossed circles.
    for cluster in range(14):
        cx, cz = rng.uniform(0, WIDTH_M), rng.uniform(0, DEPTH_M)
        for _ in range(int(rng.integers(3, 7))):
            bx = (cx+rng.normal(0, .011)) % WIDTH_M
            bz = (cz+rng.normal(0, .010)) % DEPTH_M
            major = float(rng.uniform(.003, .010))
            minor = major*float(rng.uniform(.35, .82))
            angle = float(rng.uniform(-np.pi, np.pi))
            dx = periodic_delta(x+warp_x, bx, WIDTH_M)
            dz = periodic_delta(z+warp_z, bz, DEPTH_M)
            u = (dx*np.cos(angle)+dz*np.sin(angle))/(major/2)
            v = (-dx*np.sin(angle)+dz*np.cos(angle))/(minor/2)
            # Variable skew plus local noise makes asymmetrical fused patches.
            q = u*u*(1+.25*np.tanh(v)) + v*v*(1+.19*np.tanh(u))
            q *= 1 + .23*medium + .13*fine
            hump = np.exp(-q*1.9)
            amplitude = float(rng.uniform(.11, .43))
            blister = np.maximum(blister, hump*amplitude)
            toasted_blister += hump*float(rng.uniform(-.06, .22))
            blister_parameters.append({"cluster": cluster, "x_m": round(bx,7),
                "z_m": round(bz,7), "major_diameter_m": round(major,7),
                "minor_diameter_m": round(minor,7), "angle_rad": round(angle,7),
                "relative_height": round(amplitude,7)})

    # Tiny discontinuous, forked fissure clusters. These do not draw the large
    # deliberate loaf scoring, which belongs to the separate physical geometry.
    fissure = np.zeros_like(blister)
    fissure_parameters = []
    for cluster in range(9):
        centre = np.array([rng.uniform(0, WIDTH_M), rng.uniform(0, DEPTH_M)])
        base_angle = rng.uniform(-np.pi, np.pi)
        nodes = [centre]
        angle = base_angle
        for _ in range(int(rng.integers(2, 5))):
            angle += rng.uniform(-.75, .75)
            step = rng.uniform(.0035, .0075)
            nodes.append(nodes[-1]+np.array([np.cos(angle),np.sin(angle)])*step)
        paths = [nodes]
        if len(nodes)>2:
            junction = nodes[int(rng.integers(1,len(nodes)-1))]
            branch_angle = base_angle+rng.choice([-1,1])*rng.uniform(.7,1.3)
            paths.append([junction, junction+np.array([np.cos(branch_angle),
                np.sin(branch_angle)])*rng.uniform(.004,.008)])
        for path in paths:
            width = float(rng.uniform(.00024,.00052))
            for a,b in zip(path[:-1],path[1:]):
                ab=b-a
                dx=periodic_delta(x+warp_x*.22,a[0],WIDTH_M)
                dz=periodic_delta(z+warp_z*.22,a[1],DEPTH_M)
                t=np.clip((dx*ab[0]+dz*ab[1])/(ab@ab),0,1)
                dist2=(dx-t*ab[0])**2+(dz-t*ab[1])**2
                segment=np.exp(-dist2/(2*width**2))
                segment *= .78+.22*fine
                fissure=np.maximum(fissure,segment)
            fissure_parameters.append({"cluster":cluster,
                "width_sigma_m":round(width,8),
                "nodes_xz_m":[[round(float(n[0]),7),round(float(n[1]),7)] for n in path]})

    bake=np.clip(.53 + .48*broad_bake + toasted_blister - .06*fissure,0,1)
    # An explicit warm baked palette (sRGB) avoids exaggerated black burn spots.
    stops=np.array([0,.25,.55,.8,1.])
    palette=np.array([[226,184,124],[209,156,90],[180,109,52],
                       [150,80,34],[121,58,25]],dtype=float)
    albedo=np.stack([np.interp(bake,stops,palette[:,c]) for c in range(3)],axis=-1)
    flour_gate=smoothstep(.23,.65,smooth_noise(rng,16,11))
    flour_dust=smoothstep(.04,.66,grain*.7+fine*.3)
    flour=flour_gate*flour_dust*.15
    flour_colour=np.array([224,201,164])
    albedo=albedo*(1-flour[...,None])+flour_colour*flour[...,None]
    # Nondirectional fine chromatic grain is subordinate to the broad bake.
    albedo += fine[...,None]*np.array([2.9,2.1,1.25])
    albedo_u8=np.clip(np.rint(albedo),0,255).astype(np.uint8)

    height=.37+.11*medium+.045*fine+.018*grain+blister-.14*fissure
    height=np.clip(height,.06,.92)
    height_u8=np.rint(height*255).astype(np.uint8)
    # Three's roughness map multiplies scalar roughness: use scalar=1.0 so the
    # green channel itself yields the authored interval rather than double .94.
    rough=.86-.115*smoothstep(.36,.9,bake)-.025*blister + .055*flour/.15
    rough += .026*medium + .011*fine + .018*fissure
    rough=np.clip(rough,.68,.94)
    # Quantization must remain inside the promised physical interval: .94
    # rounds to 240/255 > .94, so explicitly bound the encoded green channel.
    rough_u8=np.clip(np.rint(rough*255),np.ceil(.68*255),np.floor(.94*255)).astype(np.uint8)

    Image.fromarray(albedo_u8,"RGB").save(ROOT/"bread-crust-albedo.png", optimize=True)
    Image.fromarray(height_u8,"L").save(ROOT/"bread-crust-height.png", optimize=True)
    Image.fromarray(rough_u8,"L").save(ROOT/"bread-crust-roughness.png", optimize=True)
    write_json(ROOT/"bread-crust-recipe.json", {
        "schema":1,"author":"Neon Harbor original procedural asset",
        "seed":SEED,"size_px":[SIZE,SIZE],"reference_uv_size_m":[WIDTH_M,DEPTH_M],
        "target_loaf_width_m":[.286,.322],"target_loaf_depth_m":[.184,.208],
        "albedo_colour_space":"sRGB", "height_colour_space":"linear",
        "roughness_colour_space":"linear", "recommended_bump_scale_m":MAX_RELIEF_M,
        "recommended_material":{"color":"#ffffff","metalness":0,"emissive":"#000000",
            "roughness":1,"map":"bread-crust-albedo.png","bumpMap":"bread-crust-height.png",
            "roughnessMap":"bread-crust-roughness.png","bumpScale":MAX_RELIEF_M,
            "wrapping":"RepeatWrapping","minFilter":"LinearMipmapLinearFilter",
            "magFilter":"LinearFilter","vertexColors":"neutral multiplier only; do not multiply brown crust again"},
        "bake_patch_reference_m":[.008,.030],"blister_major_reference_m":[.003,.010],
        "blisters":blister_parameters,"fissures":fissure_parameters,
        "exclusions":["no baked lighting","no score stripes","no photograph input",
            "no emissive","no metallic","no black or white spots","no external textures"],
        "score_geometry_note":"Do not apply this map to full-rectangle strip UVs. Keep actual crumb cuts independently shaded or project their UVs to the loaf's surface.",
        "license_assets":"CC0-1.0","license_authoring_code":"MIT"
    })
    # Unlit texture preview only. It makes no assertion about runtime art.
    preview=Image.new("RGB",(SIZE*3,SIZE))
    preview.paste(Image.fromarray(albedo_u8,"RGB"),(0,0))
    preview.paste(Image.fromarray(height_u8,"L").convert("RGB"),(SIZE,0))
    preview.paste(Image.fromarray(rough_u8,"L").convert("RGB"),(SIZE*2,0))
    preview.save(ROOT/"texture-channel-preview.png",optimize=True)
    files=[]
    for name in ["bread-crust-albedo.png","bread-crust-height.png","bread-crust-roughness.png",
                 "bread-crust-recipe.json","texture-channel-preview.png"]:
        data=(ROOT/name).read_bytes()
        files.append({"file":name,"bytes":len(data),"sha256":hashlib.sha256(data).hexdigest()})
    write_json(ROOT/"cpu-statistics.json", {
        "status":"ORIGINAL_TEXTURE_GENERATION_CPU_CHECKED_RUNTIME_ART_PENDING",
        "seed":SEED,"size_px":[SIZE,SIZE],"channels":{
            "albedo":{"mode":"RGB","colour_space":"sRGB",
                "min_rgb":albedo_u8.reshape(-1,3).min(axis=0).tolist(),
                "max_rgb":albedo_u8.reshape(-1,3).max(axis=0).tolist(),
                "mean_rgb":albedo_u8.reshape(-1,3).mean(axis=0).tolist(),
                "std_rgb":albedo_u8.reshape(-1,3).std(axis=0).tolist()},
            "height":{"mode":"L","colour_space":"linear","min_byte":int(height_u8.min()),
                "max_byte":int(height_u8.max()),"std_byte":float(height_u8.std()),
                "physical_range_m":[float(height_u8.min()/255*MAX_RELIEF_M),
                                    float(height_u8.max()/255*MAX_RELIEF_M)]},
            "roughness":{"mode":"L","colour_space":"linear","min_byte":int(rough_u8.min()),
                "max_byte":int(rough_u8.max()),"std_byte":float(rough_u8.std()),
                "decoded_range":[float(rough_u8.min()/255),float(rough_u8.max()/255)]}},
        "physical_pixel_size_m":[WIDTH_M/SIZE,DEPTH_M/SIZE],
        "target_width_pixel_scale_m":[.286/SIZE,.322/SIZE],
        "target_depth_pixel_scale_m":[.184/SIZE,.208/SIZE],
        "patch_width_pixels_reference":[.008/WIDTH_M*SIZE,.030/WIDTH_M*SIZE],
        "blister_width_pixels_reference":[.003/WIDTH_M*SIZE,.010/WIDTH_M*SIZE],
        "patch_screen_pixels_at_100px_loaf":[.008/WIDTH_M*100,.030/WIDTH_M*100],
        "blister_screen_pixels_at_100px_loaf":[.003/WIDTH_M*100,.010/WIDTH_M*100],
        "blister_count":len(blister_parameters),"fissure_path_count":len(fissure_parameters),
        "runtime_textures_bytes":sum(f["bytes"] for f in files[:3]),
        "gpu_base_level_bytes_rgb8_plus_two_r8":SIZE*SIZE*5,
        "gpu_rgba8_upload_upper_bound_with_mips_bytes":SIZE*SIZE*4*3*4//3,
        "gpu_bytes_note":"Format estimates only, not actual measured VRAM.",
        "files":files})


if __name__ == "__main__":
    main()
