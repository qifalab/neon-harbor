# Original workshop and waterfront image review

Reviewed on 2026-10-05. Read-only review of 12 original, unedited PNG files with `view_image` at original resolution, plus their companion pose, build and metadata files. No repository edits, tests, builds, browser runs, GPU work or network calls were performed.

The authored images bind to `ef92c25980f1da12b508971170b72b9dd6230059` and its 190-asset build. The baseline images bind to `7a90f7934b7c9d1af5c4494bf08c4ec337c373e4` and its 156-asset build. Subsequent resident and storefront changes in ROOT are outside this evidence. This review does not accept the current working candidate or a public release.

## Outcome and evidence limits

The authored workshop has visible, useful furnishing improvements: separate workstations, an archive desk and chair, several shelves, and more differentiated furniture surfaces. The frames do not support describing the rooms as polished or comparable with GTA/Cyberpunk production quality. Both whole-room views still show a very sparse, large rectangular room with uniform walls and ceiling. The waterfront pairs show essentially the same skyline and lighting; they support an absence of an obvious static-image regression at this viewpoint, not a newly improved waterfront.

No reviewed frame is black, and no conspicuous furniture-through-wall intersection, missing whole building shell, or broken color output is visible. A static frame cannot establish absence of shimmer, flicker, loading transitions or collisions. The metadata `errors` arrays are empty for all six captures; this does not override the original workshop failures.

The original workshop pair status remains `FAILED`; both variants timed out before completing the route. Their four photographs each can be reviewed as partial visual evidence only. Original day and night pair status remains `CAPTURE_COMPLETE_ART_REVIEW_PENDING`. This report does not rewrite those results or change their artifact metadata.

## Capture comparability

All 12 files are 1280 × 800, device scale factor 1. Poses use High quality, first person and FOV 65. Workshop and daytime waterfront have a fixed 16:30 clock; night has a fixed 22:00 clock. Settings within every baseline/authored pair are exactly equal. The scene frame size is 1280 × 800 and the recorded eye offset is 1.62 m.

Workshop pictures cover `south-086`, lobby rooms `港口修缮工坊 101` and `货运档案室 102`. Pitch is equal within each pair; tiny yaw differences are below 0.000001 rad. The actual body positions differ, as recorded below. These are comparable authored camera plans, not identical pixels or perfectly identical physical poses.

| Photo | Authored minus baseline X / Z (m) | Body-position distance (m) |
| --- | --- | --- |
| Workshop whole | 0 / +0.026667 | 0.026667 |
| Assembly close | -0.000000073 / +0.066432 | 0.066432 |
| Archive whole | -0.093333 / +0.159766 | 0.185030 |
| Retrieval close | +0.106667 / -0.000299 | 0.106667 |

Both waterfront pairs use identical actual body coordinates `(285.5, 0.18, 42)`, eye coordinates `(285.5, 1.8, 42)`, yaw π/2, pitch -0.06 and FOV 65. Before/after simulation times differ between variants, so moving objects and water phases can differ even with identical camera pose.

The decoded RGB comparison is descriptive only. Day has 10,815 changed pixels out of 1,024,000, with mean per-channel absolute difference about 0.0042–0.0047 on a 0–255 scale. Night has 7,623 changed pixels with means about 0.0014–0.0046. The sky, skyline silhouette and major material responses are visually almost unchanged. These small differences do not establish an artistic improvement.

## Workshop observations

**Workshop whole pair:** baseline has a single small table and a box/cabinet near the far right of an otherwise empty room. Authored adds left and right work benches, a nearer assembly bench, a trolley and equipment at the far right. Clear floor routes remain visually legible. The dark, textured worktop and green supports are more specific than the baseline furniture. However, the large unbroken pale walls, flat ceiling, sparse distribution and repeated right-angle bench construction still dominate the room. A single simple ceiling fixture does little to explain the broad uniform illumination. This view gives the room a use, but does not make it a richly authored workshop.

**Assembly close pair:** authored introduces a dark wood-grain worktop and a grey cylindrical assembly/motor-like object on a green metal bench; the background bench remains near the window. The foreground object has a readable cylinder silhouette and broad metal shading, but little visible fastening, wiring, abrasion or work-related detail. It should not be called a close-up validation of the scanned vice: the small vise-like object is at the distant window bench. The foreground working surfaces look cleaner and simpler than a convincing used repair shop. No glaring geometric intersection is visible in this frame.

**Archive whole pair:** authored replaces the very sparse baseline presentation with a grey desk, an actual chair, a desk lamp, three tall shelves and a right-side retrieval table. The added desk and shelving identify the room's function. The central furniture island is still small relative to the mostly vacant floor, and the walls and ceiling remain largely undifferentiated. Shelves are repeated in a uniform line, so the room still reads as a shared layout dressed with a few objects.

**Retrieval close pair:** authored brings the desk into the foreground. Its blue-grey top has subtle mottling and a rounded edge; the cabinet below has a different rougher surface. The chair's narrow metal legs and darker seat/back, plus the shelf wood and rows of file-like volumes, provide more material separation than the baseline. The lamp, pale papers and green desk object remain simple and visually clean. Text labels are small at this captured distance. No obvious chair/desk or shelf/wall penetration is apparent, but this image alone cannot verify collision clearance.

**Art limits for this original candidate:** visible improvement is furnishing and local surface specificity. There is no resident working in these original frames and no evidence of workplace use marks, cabling, utility fittings, dense props or authored ceiling treatment. The pictures cannot prove the new resident physically works in this room. They do not justify “plastic appearance solved,” “all rooms finished,” or AAA claims.

## Daytime waterfront observations

The skyline has differentiated heights and some curved, tapered and faceted tower silhouettes, avoiding a completely cuboid skyline. Daylight keeps the skyline readable against the mountain backdrop and hazy blue sky. Repeated narrow window grids and pale facade bands remain strong, and the low waterfront edge is a long straight strip. The water is mainly a flat muted blue with weak horizontal variation; this frame does not exhibit a convincing reflected skyline, boat wakes or detailed near-water edge. The foreground parapet and pavement have broad, simple surfaces. These are limitations of the actual view, not evidence of a missing texture request or a postprocessing failure.

Baseline and authored are visually almost identical here. No black screen, large dirty halo, obvious broken exposure or missing skyline section is visible. A still frame cannot verify reflection stability or anti-aliasing under motion. This waterfront frame supports a readable stylized city backdrop, not a new photoreal rendering milestone.

## Night waterfront observations

Lit windows outline most buildings against a dark blue sky. The mountain and tower silhouettes remain readable, so the frame is dark without being an all-black output. Tall towers display strongly repeated horizontal bright bands; smaller buildings have more scattered lights. The shore and water are very dark and contain little visible layered light or reflected window structure. At this distance there are no clearly developed street-level signs, moving ferry lights or layered pools of illumination. The foreground parapet is largely grey-blue and flat.

The authored view is essentially the same composition, brightness and window-light scheme as baseline. Small differences around low foreground/shore objects are not enough to establish a night-lighting improvement. These images also do not prove a lighting regression. More viewpoints, temporal observation and the final source-bound capture are needed before accepting a final night scene.

## What these images can support

They support a limited claim that the original authored workshop adds useful furniture and some more specific materials, and that the original day/night skyline can be rendered at the recorded High settings without an obvious static-image failure at this public viewpoint. They leave the polished-harbor goal open. Current ROOT work needs its own completed routes and final source-bound images; the original 12 images cannot be inherited as current art acceptance.

`ledger.json` records the original source paths, PNG byte counts and SHA-256 digests, pose and metadata SHA-256 digests, exact settings, actual before/after poses and descriptive pixel comparisons. `png-sha256.json` is the compact 12-PNG digest ledger. The originals were read in place and not modified.
