# Final static review addendum

This addendum preserves the first report without editing it. Review remained read-only: source, diff, hashes, test logs and proof files were inspected; no imports, tests, builds, browser, world construction, GPU or network were run by this reviewer. ROOT source was not changed.

Final source pins verified from the files on disk:

- `src/harbor-frontage-profiles.js`: `bdc48b86d9043e5fa263a0db23e15ce27415b2aef9d8d3d7ce50c70ded4231c0`
- `src/harbor-district.js`: `0e00bc483ece05f73e5711aa7a6e1ee59de2ebe415a9405d94211c66b5dd696d`

`source-after.json` and `display-bounds-proof.json` carry the same pins.

**Final disposition: no remaining static blocker identified within this narrow candidate.** The formerly unsupported noodle bowl has been corrected: the lower noodle display now constructs the bowl instead of first placing a cup at the same location. Bowl centre is `shelfY+.025+.105`; the lower hemisphere bottom is `shelfY+.025`, only 0.0025 m above the shelf top at `shelfY+.0225`. The chopsticks follow the bowl rim. This resolves the specific support concern recorded in the first report. Other main lower goods sit on shelves or trays; upper goods use the second shelf.

The final glass explicitly sets `emissiveIntensity=0`, retains transparency 0.20 and depthWrite false, and retains both castShadow guards plus `noShadow=true` for glazing. The global High-quality traversal therefore cannot restore its opaque shadow. Public-door dark panels and original glass remain unchanged, and the dedicated brass handles retain their original geometry and transforms.

The final existing actual-world district test log (`cpu-harbor-district-final.stdout.txt`) reports 7/7 passing tests, 831.081716 ms, including the six-resident geometry budget and unload regression checks. The inspected synthetic-fixture material/budget/dispose proof reports 88 draw calls and 70,244 triangles, versus baseline 74 / 42,292, within the unchanged 100 / 85,000 limits. It explicitly exercises balanced-to-high quality and mirrors the application's later global traversal, checks transparent non-emissive glass and brass values, records all 88 loaded near geometries disposed on unload, keeps shared glass/handle materials alive during unload, and records each material disposed exactly once at final teardown. Its root is detached and empty after disposal. The proof script uses six synthetic shells; its numerical metrics should retain that scope even though the separately recorded actual-world regression passed.

Static containment, source preservation, material ownership and lifecycle findings from the first report otherwise continue to apply. The refreshed bounds proof remains CPU evidence, with all helper operations within local bay width/height and out 0.18–0.683 m.

This signature approves the final static/source candidate for the requested review scope. It does not establish native visual/art acceptance or actual entry/exit behavior. New matched native views and interaction evidence must use these final source pins; original failed captures and their reports remain valid historical evidence.
