# Near resident source art

Pinned official MakeHuman graphical assets are CC0-1.0; the original MakeHuman program is separately AGPL-3.0-or-later. No application logic was copied or run. Independent Neon Harbor conversion, renderer and FK code are MIT. Read `licenses/LICENSE.md` and `licenses/LICENSE.ASSETS.md` for full source terms, and `source/*download-manifest.json` for original exact-byte checksums and provenance.

`editable`, `editable-commuter`, `editable-shopkeeper` contain actual glTF + BIN + texture sources. `source` retains original anatomical OBJ, Asian male/female macro targets, default skeleton and weights, official core clothes/shoes/hair/skin/eyes, and copied official licence/page evidence. The three wardrobes are `male_worksuit01`, `male_casualsuit03`, `female_elegantsuit01`; hair is `short01`/`bob02`. Their official core MHCLO/MHMAT headers explicitly declare CC0. Community assets with unverified licence are not used.

The original base helper geometry is discarded; garment hidden-body masks are respected. The female skirt's extra hidden thigh coverage uses only leg/pelvis-dominant skin weights, preserving hand and finger topology. Source originals remain unchanged. Runtime only ships the three `assets/resident/core-*/{role}.glb` and manifests; editable/source art is not a build entry.
