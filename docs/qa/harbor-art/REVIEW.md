# Authored harbor sample art review

The focused work attaches to the existing occupied south-bank shells `south-090`, `south-091`, `south-092`, `south-094`, `south-095`, and `south-096`. It does not create six replacement buildings. The east-facing fronts open onto the real sidewalk west of the x=240 road; the two south-facing fronts open onto the real cross streets. Original names and programmes match the six focused ground-floor shops.

The street layer includes extruded rounded arch surrounds with real open profiles, curved textile canopies and scalloped edges, first-floor balcony rails, blinds, rainwater pipes, shop lettering and menus, café tables with cups and curved chair backs, book shelves, produce racks, ceramic displays, and folded-leaf planters. Original art is combined with two scanned CC0 surface sets. Poly Haven's Plastered Wall 02 and Pavement 03 provide albedo, OpenGL normal and roughness maps at 1024×1024. Their six optimized local JPEGs total 1,431,098 bytes. Source authors, source MD5, transformed-file SHA256, URLs, license, processing and physical scale are recorded in [the material manifest](../../../assets/harbor/material-manifest.json).

Scanned surfaces use projected physical-metre UVs on the actual merged geometry. A 2.23 m plaster scan and 2 m pavement scan keep their scale on broad facades and small trim; normalized unit-box UVs do not stretch one scan across an entire building. Fine original cloth/mineral/metal response uses the existing filtered surface-finish shader. No scene shader or game renderer was replaced by this layer.

Near street detail loads below 72 m and disposes above 96 m. Quiet facade proxies remain resident. Shared JPEG maps load only after the first near frontage and are disposed when the last near frontage unloads. Geometry, local lettering textures and local materials are destroyed on unload. The module uses the actual shell IDs to hide near art and proxies during an occupied-room transition, including details loaded after the shell was hidden. Default quality remains High.

The room layer follows the actual `createInteriorLayout` furniture. It places household tea trays, kettle/tableware, books, small bakery goods, ceramic objects and price cards on existing furniture tops. Existing café cups receive handles, coffee and saucers rather than a second overlapping set of bodies. Already populated book shelves and fruit crates retain their objects. Wall prints and physically pleated linen valances sit above 2.1 m. The layer emits no new floor colliders and does not change doors, lifts, stairs or arrivals.

## Reproduction and technical checks

- Run `node --test tests/harbor-district.test.js` for actual shell placement, original entrance/road/walking-strip clearance, finite geometry, physical scanned UVs, bounded triangles/draw calls, hysteresis/disposal, shell hiding, verified asset provenance, and actual room arrival clearance.
- Run `node docs/qa/harbor-art/capture.mjs` to render the actual seeded world and the authored frontages in WebGL. The corresponding `fixture.html` is inspectable in a browser.
- Run `node docs/qa/harbor-art/capture-rooms.mjs` to render actual focused `createInteriorSystem` shop rooms, with the repository's current room programme, base furnishings and room dressing. The corresponding `room-fixture.html` is inspectable in a browser.

The browser evidence records renderer calls/triangles and scanned-map readiness. Its separate lighting and camera are disclosed: these are source-art inspection images, not frozen before/after gameplay comparisons. Software-renderer timing is not hardware performance evidence. A full game screenshot should be used to judge the art with traffic, citizens, transit, the final atmosphere and gameplay UI.

## Visual inspection, separate from technical tests

The WebGL street views show the new curved profiles and furniture in relation to real walkable sidewalks, existing buildings, crosswalks and road widths. The original grass/tree, generic upper floors and wide road grid remain visibly simpler than the focused storefronts. The distant street image exposes that remaining quality gap. The first inspection also revealed a practical sign problem: an awning obscured the wall-mounted shop name at pedestrian eye height. The shop name was moved to the front canopy fascia and recaptured.

The room fixture was recaptured after the focused layout gained three café/dining tables and pendant lights, a second book/ceramic wall case, and separate market/bakery display and service counters. The same room-arrival camera formula and fixed fixture lighting were retained. The café tables now carry curved tea sets or refinements to their actual pre-existing cups; duplicate per-room cup dressing was corrected by selecting each cup through its supporting table footprint. Existing stocked shelves are not dressed a second time. The images show a materially more furnished room, while preserving a visible entry approach.

The room source fixture uses full authored geometry with fixed ambient/directional lighting, without the game's shadows or contact-occlusion pass. Its renderer state and exact camera pose are recorded alongside the fresh captures. Full-game High screenshots remain the evidence for the final game presentation. Remaining room-art gaps include repeated flat wall/ceiling treatment, simple book/goods silhouettes, generic wood finish and limited visual identity between rooms.

The technical tests establish geometry, placement and resource behaviour. They do not measure broad art quality or prove fidelity to a commercial AAA reference. The images support a focused original streetscape improvement within the existing renderer and leave the broader city's art, lighting and density as further work.
