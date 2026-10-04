# ART fleet lifecycle — static DERIVED review

Read-only review of `/workspace/scratch/neon-harbor-art-pilot/src/harbor-transit-renderer.js`, `harbor-vehicle-models.js`, `city-exploration.js`, `main.js`, and the short transit-service reset definition. Referenced `/tmp/neon-art-native-fail-resource-review.md`. No Node scene construction, browser, GPU, tests, build, or project/source edits occurred. This report describes code mechanisms; it is not native geometry UUID attribution.

**Conclusion:** the current code does not reconstruct the harbor fleet on each real interior entry/exit, in-page reset, or bind. Frequent fleet LOD changes select cached geometry; they do not construct new geometry. Previously unseen cached tiers can nevertheless be registered by the renderer for the first time and remain registered, so a +35 tier-sized increment is a specific candidate. The original native UUID identity/history is missing, so the observed increment is not proved to be that candidate or a harmless cache event.

## Shared geometry and tier creation

- `harbor-vehicle-models.js:21,146–159`: module WeakMap keyed by the imported THREE namespace holds a kind→template map. A kind's three templates are built only when absent. Subsequent same-kind instances recursively clone those templates and replace materials with per-instance clones. Mesh cloning retains underlying geometry references. The two bus instances therefore share one bus template set; the two tram instances share one tram set. Separate kinds and tiers are independently built.
- `harbor-vehicle-models.js:236–262,667–676`: geometry construction and merging occur when `buildVehicle` creates a tier template, not in an LOD update. Temporary merge inputs are disposed during template assembly; finished template geometry remains in the library.
- `harbor-vehicle-models.js:152,159,201–205`: near/middle/far levels already exist, with distances bus/tram 0/42/120 and ferry 0/85/220, hysteresis .12. `setDetail` changes visibility; `updateLOD` updates matrices and calls the existing LOD. It allocates temporary Vector3s but no geometry. Repeated selection of an already-created tier does not make new geometry objects.

## Renderer, reset, and real re-entry

- `harbor-transit-renderer.js:121–124`: the fleet Map and its five meshes are populated once during system creation. `render` at 125–140 only updates existing mesh pose, door state, wheels, lighting, LOD, gangway visibility, and existing sign textures. At creation its camera-less `render()` selects tier 1. A riding vehicle is forced to tier 0; all others use the actual camera.
- `city-exploration.js:31` creates the sample transit renderer once in its world closure. Ordinary E interactions at 103–118 and forced leave/travel at 127–150 update interior/service state and collision/scene context, not the fleet constructor.
- `city-exploration.js:210–224`: `bind` reuses that renderer/service. It leaves special locations, resets life and sample transit service state, restores saved service state, and synchronizes collision context. `harbor-transit.js:432–437` resets passenger/ticket/time/vehicle-state fields on existing vehicles; it does not rebuild meshes or geometry.
- `main.js:193–194`: import/reset-save use `world.bind`, including two binds around `sim.reset`; they do not call `createCityExploration` again. `enterCity` at 84–88 prepares the existing location. Reload-nearby at 190 goes through prepare/retry streaming, not fleet construction. The only world constructor call in this file is startup at 406. A full document reload is a new page/module/renderer lifetime, distinct from these in-page cycles.
- `main.js:385` continues `sample.transit.updateRender(camera, hour)` every rendered frame. `city-exploration.js:161` still advances the sample service while indoors, and 264–270 hide outdoor roots only for the closed elevator cabin. Ordinary rooms therefore permit moving fleet poses and camera-relative LOD changes. This makes first registration of an unseen tier during an interior near→return phase possible without any fleet reconstruction.

## Disposal lifetime

- `harbor-vehicle-models.js:216`: `disposeInstance` disables its lights and disposes the per-instance material palette. It does not call geometry.dispose, remove the cached kind, or dispose template materials/geometry. Shared template geometry is intentionally outside instance ownership.
- `harbor-transit-renderer.js:145`: full service disposal invokes those instance disposers, disposes its own static/sign resources, and detaches the root. It still does not dispose shared vehicle template geometry or clear the library. No normal entry/exit/bind/reset call site invokes this service disposer in the reviewed main/world paths.
- With the same live THREE import, the library retains the finished template geometry. Even reconstructing another transit renderer in that page would reuse the same templates, although it would create new renderer-owned static/sign resources and per-instance materials. There is no such repeated constructor call in the reviewed in-page paths.

## What remains unproved about +35

The referenced earlier read-only report enumerated bus/tram tiers as 35/35/32 and ferry tiers as 44/44/41 using a separate CPU process. Those sizes fit first-use registration of a bus/tram near or middle tier. That prior enumeration is not this native run's UUID registry, and this review deliberately did not repeat its construction probe.

Lazy first registration of shared cached tiers is finite within one renderer/template-library lifetime. Once those same geometry UUIDs have already been registered, an identical tier switch alone cannot produce another +35. Persistent per-cycle growth after every relevant tier is known resident would require another owner/construction/disposal path or a fresh lifetime; it cannot be certified as normal solely from this code.

The old capture lacks the actual registered geometry UUID set, first-registration owner/tier, and per-frame fleet LOD/pose identities across the growth interval. The aggregate counter, matching tier size, CPU UUIDs, and reset code cannot fill that gap. Retain the original FAIL and distinguish pilot-owned synchronous disposal checks from any claim about all-city resource stability.
