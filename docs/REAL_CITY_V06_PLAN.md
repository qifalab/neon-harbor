# Neon Harbor v0.6 · occupied city

Continuation of the unfinished work in REAL_CITY_V05_PLAN.md. The v0.5 release and its 204 rule checks, 18 browser scenarios and deployment checks remain the baseline.

## Delivery and evidence

1. Give all 48 addresses an ordered, gap-free natural storey schedule from the entrance to the observation elevation. Preserve the stable lobby/gallery/workplace/observation IDs and the first three elevations for saved games. Nominal storey rise is 4.2 m; distribute the remaining height evenly so no short, inaccessible leftover storey is created. Lotus Market's old 15 m terrace rises to 16.2 m to leave two usable storeys above 8.4 m; the other observation elevations are preserved. Roof crowns and equipment above the observation level are roof structures, not invented occupied storeys.
2. Connect every neighbouring storey with physical, guarded stairs and the operating elevator. Keep at most three detailed floors resident; retain overlapping batches, release evicted instances and sign textures, and preserve collision during both walking and lift travel.
3. Author the upper programme separately for each address, with purposeful residential, hotel, medical, academic, cultural or working rooms. Extend room art with readable room numbers, address-specific graphic collections, wall details, lighting and small lived-in objects. Shared geometry and materials are allowed; changing a room title alone does not satisfy the room-art goal.
4. Residents need persistent home/work/errand destinations, legal sidewalk and crossing routes, actual station access, boarding of the same clock-driven fleet as the player, continuous travel poses, alighting and building/room occupancy. Keep pauses and visibility budgets; indoor residents must use their own floor height, not the outdoor height sampler.
5. Verify every storey and every room threshold with renderer-independent collision checks. Use public controls and read-only snapshots for browser gameplay. Capture all addresses and representative upper programmes for visual review; record the extent of visual evidence honestly rather than calling structural checks per-room art acceptance.
6. Run the complete existing regression, additional occupied-city scenarios, the Pages workflow and custom-domain smoke verification before reporting publication.

## Acceptance ledger

- Implementation: all-storey schedules, 48 upper programmes, streamed detailing, persistent residents, marked crossings, shared transit and station access are implemented. Room-title numbers now match actual door numbers.
- All-floor continuity and room access: 920 floors / 3,680 rooms / 872 stair flights pass rule verification, including bidirectional physical walking. Actual 16F–17F walking, room entry and repeated floor eviction pass local browser verification. Upper front stair landings now keep 3.6 m clearance from the façade.
- Resident journey completion, crossing safety, boarding and occupancy: 240 residents complete work and home visits during a 9,000-second test, using all four shared routes. Seven resident checks also cover working-period retention and all 480 assigned home/work room approaches and departures. A rendered resident has been observed arriving at the real museum workplace.
- Visual review: pending; no claim that every room has been individually reviewed.
- Full regression and live revision: pending.
