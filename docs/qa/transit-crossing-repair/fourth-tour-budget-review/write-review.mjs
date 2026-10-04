import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const dir='/tmp/neon-harbor-fourth-tour-budget-review';
const d=JSON.parse(fs.readFileSync(path.join(dir,'budget-calculation.json')));
const n=v=>v.toFixed(3), model=d.models.find(x=>x.tramServicePerSimulation===.67&&!x.extraOutboundCycle), phase=id=>model.phases.find(p=>p.label===id);
const low=Math.min(...d.empirical.lateProgressIntervals.map(p=>p.simPerWall));
const dest=phase('tram-lower-lantern-destination-wait').simulationSeconds;
const board=phase('tram-wait-for-quay-boarding').simulationSeconds, upper=phase('tram-upper-real-open-berth-wait').simulationSeconds;
const lowerProposal={status:'proposed only; NOT applied to candidate or ROOT',constant:'metadata.destinationWaitWallMilliseconds',currentMilliseconds:900000,proposedMilliseconds:2400000,scope:'The existing common destination-door wait for bus/ferry/tram; no world or input change. A tram-only alternative would require a separate conditional scope, so this proposal explicitly uses the present shared constant.',derivedTramWaitSimulationSeconds:dest,observedLowestPreFailureWindowSimPerWall:low,requiredWallSecondsAtObservedLow:dest/low,headroomWallSeconds:2400-dest/low,minimumSimPerWallFor900:dest/900,minimumSimPerWallFor2400:dest/2400,unchanged:['boarding600000','upper-berth600000','ordinarycabin150000','finalferrydoor300000','.06endpoint/.15height','WASD/Z/mouse/E ordering','route.duration*2+120 and route.duration*3+180','realpositiondisplacement/revision/deckguards','heldSeconds < geometricMetres/.3+3','noAtlasafterroutestart/no state writes/no retry'],remainingLocalRisk:{boardingSimulationSeconds:board,boarding600RequiredSimPerWall:board/600,upperSimulationSeconds:upper,upper600RequiredSimPerWall:upper/600},notAcceptance:'This extrapolated suffix was not completed in the third run. An additional missed tram cycle or different final-build throughput can exceed this proposal. A future failure remains a failure and cannot trigger an automatic retry.'};
fs.writeFileSync(path.join(dir,'destination-wait-proposal.json'),JSON.stringify(lowerProposal,null,2)+'\n');
const rows=d.wallScenarios.filter(s=>s.tramServicePerSimulation===.67&&!s.extraOutboundCycle).map(s=>`| ${n(s.simPerWall)} | ${n(s.suffixWallMinutes)} | ${n(s.caseMinutesIncludingObservedPrefixAndWallReserves)} |`).join('\n');
const ledgerRows=d.ledgers.map(l=>`| ${l.directory} | ${l.listedFiles} | ${l.ledgerSha256} |`).join('\n');
const phaseRows=model.phases.map(p=>`| ${p.label} | ${n(p.simulationSeconds)} |`).join('\n');
const report=`# Fourth tour whole-case budget review (CPU derivation only)

Generated ${d.generatedAt}. This report reads the immutable third-run evidence, imports only frozen 7145 transit/layout modules in Node and computes a conditional suffix. No browser/GPU, world edits, build, full tests or repeated mocks were run. The suffix is a planning estimate, not evidence that a complete tour passed.

## Finite recommendation and limitations

The prepared candidate changes only the whole-case budget from 90 to **180 wall minutes** plus the three corresponding textual explanations. Its SHA is **7a752952d03bf9f7574b4a2620911070dd39bef4082841b30700e84c64ea956f**, 59,888 bytes. Reversing the four allowed replacements recovers reviewed 6a byte-for-byte; Node syntax check passed. All local caps and physical/input/progress requirements remain unchanged. ROOT still uses 60436; this candidate has not been applied.

At the observed tram service ratio about 0.67 and a conditional average renderer ratio 0.089sim/wall, the estimated full case is **162.055 minutes**, leaving about 17.945 minutes in 180. At the actual lowest pre-failure 30-second window, **${n(low)}sim/wall**, the same suffix produces **${n((d.thirdFailure.caseUsedSeconds+model.totalSuffixSimulationSeconds/low+330)/60)} minutes**, exceeding 180. At ratio0.067 it is197.501 minutes. Therefore180 is a finite practical envelope for the observed0.089 case, not a worst-case promise. A150-minute envelope would already truncate the162-minute case. Sustained minima would require at least about200 minutes under this model, and an extra nominal tram circuit adds178.799 simulation seconds at service ratio0.67. Do not silently expand an in-flight run.

The common **900-second destination wait has a separate measurable risk**: the predicted tram lower-door wait is${n(dest)}sim seconds. It requires a renderer average≥${n(dest/900)}sim/wall. A **proposed2400-second destination wait** gives${n(dest/low)} seconds at the lowest recorded pre-failure ratio and${n(2400-dest/low)} seconds of headroom. This proposal is not applied. It would use the existing shared destination constant, affecting bus/ferry/tram destination waits only; a tram-only cap is a different method design requiring a separate review. It preserves route.duration*3+180, displacement, revision, .06 endpoint, held-input and all real geometry/input assertions; no world speed, dt, clock or default quality changes.

Even2400 destination does not ensure the rest passes: predicted tram boarding${n(board)}sim seconds needs≥${n(board/600)}sim/wall under the retained600-second cap; upper real-open-berth waiting${n(upper)}sim needs≥${n(upper/600)}. Persistent0.067–0.089 can fail either first. These conditional estimates justify exposing all risks before root chooses the final method, not a claim that GPU exclusivity cures them. Concurrent ART CPU work was stopped at18:58:10, after the18:57:33.776 failure; no causal explanation is proved.

## Evidence and geometry

The third case started18:08:57.473, continuous route18:11:02.447, failed18:57:33.776. It consumed **48m36.303s** of the90-minute case and left **41m23.697s**. Its46m31.329s route was incomplete. Public native Low selection remains512×320video/viewport and409×256GL software functional evidence, not native art or hardware FPS.

Remaining planned streets are77m north-pier→address,73.8m address→north-pier,135.6m south-pier→tram and134.649m tram→home: **421.049m** over16 actual collider-planned waypoints. Remaining pier/ramp walking is19.5m north exit+19.5m return+24m south exit=**63m**. Outdoor suffix total **484.049m**. North maritime room enter/leave adds42.65m horizontal; each physical home stair/kitchen pass about20.123m horizontal (including the0.1m approach below the helper's.18 endpoint tolerance), done once before save and once after reload. Tram stairs up/down require11.92m horizontal with continuous real height change.

Empirical calibration: the earlier501.556m street segment advanced116.25sim seconds in485.364wall seconds,4.315m/sim; the24m south pier advanced8.233sim in39.448wall. Actual home descent/room exit advanced21.417sim; equal authored geometry estimates a21.417sim return ascent. North-room helper ideal17.045sim is multiplied by the observed home's helper overhead ratio to estimate20.356sim. Bus actual climb31.650sim/descent33.000sim minus its ideal.3m/s held durations calibrate tram climb28.917sim/descent30.267sim. These estimates omit unknown future collision/phase changes and are not upper bounds.

Frozen nominal ferry loop81.28436497sim seconds, North→South40.65502823sim; tram loop119.79546400sim, Quay→Lantern59.16213067sim. While the player visited the shop/walked to the ferry, the two actual tram service clocks advanced0.689115 and0.673452 service seconds per simulation second, including normal traffic/signals. This distinct transit-service ratio must not be confused with renderer sim/wall. The main model uses0.67, the exact recorded two vehicle phases, and ordinary scheduled boarding/berth calculations. It predicts that physical stairs down after checking the upper open berth miss the same Lantern opening and use the next circuit.

At the first failure the final ferry-door distance was0.104746m,0.044746m outside the.06 endpoint, requiring at least0.149153 held simulation seconds at.3m/s to reach that threshold. Extra150wall seconds for the newly allowed final door are reserved in the wall scenarios below; this is a budget reservation, not padding. Another180wall seconds is reserved for actual menu/export/reload/loading/recording closure; the run must perform real operations and never sleep to consume that reserve. Whole-case assertions and final recording closure retain a finite hard deadline.

## Conditional suffix ledger

This sums to **576.452325sim seconds**, including the second physical home2F ascent after reload. It is not a reconstruction of missing third-run cabin samples. The same branch with an extra ferry loop happens to meet a different tram opening and yields the same downstream finish in this deterministic phase model; that coincidence is not a bound for arbitrary delays.

| Operation | Estimated simulation seconds |
|---|---:|
${phaseRows}

| Assumed sim/wall | Remaining suffix wall minutes | Full case minutes with actual48.605m prefix+5.5m reserved real-operation budget |
|---|---:|---:|
${rows}

90 minutes is tight even at the earlier0.24 ratio once the actual tram traffic progression is included (94.136m). At0.20 the derived full case is102.143m. These values support reviewing the global cap before another unique run. They do not relax any room, deck, transaction, save or input requirement.

## Current freeze and raw preservation

Reviewed6a candidate59,884B/SHA6a0178c8fb0b099dda2a82b1bc8157206861c35bb8e00cd1b4661216450027db; root tool53,037B/SHA60436d2fe8db8af646c1a02d93f9e70fc3e1ce34181d257a1c3ea39aae850702. Dist manifest7145fa443190896ff24050d518a54fea364ddb0547ddfa71756a33d64c515fb3,146assets/52sources all match; helper/server hashes still match the third method. This report is bound to7145. A final ART build must receive a new freeze and source/asset inventory and must not be described as7145 merely because layout is similar.

The archived59 method-review originals and all prior native/tour ledgers were verified byte/hash-exact; none were edited:

| Directory | Ledger entries | SHA of evidence-files.json |
|---|---:|---|
${ledgerRows}

Third video is the originalsinglepage@f3a37dcd9bfa366ae4707ebb074324d8.webm,71,548,336B,2950.72seconds,VP8 512×320,SHA69971a38c7d91c24192d793c30038a1665cef3105ba29c1bb2f48ce4b0c1cac9. Its metadata and ledger still explicitly retain **published:false/publicationUrl:null**. The independent ffprobe result remains in the unchanged post-run-verification.json. Video duration includes startup, setup and failure cleanup and cannot be substituted for route-completion evidence.

Machine-readable derivation: budget-calculation.json; executable arithmetic: derive-budget.mjs; exact global diff: whole-case-180m.patch; scope proof: scope-check.json; lower-wait proposal: destination-wait-proposal.json. Node exit1 from diff -u means the expected four differences, not a syntax failure. No18/24mocks or full game tests were rerun for this constant-only candidate.
`;
fs.writeFileSync(path.join(dir,'REVIEW.md'),report);
fs.writeFileSync(path.join(dir,'final-freeze-run-closure-checklist.md'),`# Final fourth-tour freeze/run/closure checklist

Prepared only; no browser, no root application and no next evidence directory has been created. Proposed unique destination **docs/qa/final-asset-freeze/continuous-tour** (root may choose another unused name beforeGO), independent log **/tmp/neon-harbor-tour-final-asset-freeze.log**, port5193. Never reuse the three failed-tour directories or the59-file method archive.

## Before the one authorized run

- Root chooses/reviews the exact final global/local-budget method and applies it once. Current prepared180 candidate is7a752952…;2400 destination remains a proposal. Freeze method bytes plus tools/server.mjs, walking.js, occupied.js before launch. Do not run the /tmp candidate directly; its relative imports are only valid after root places the reviewed exact bytes in tools/capture-harbor-tour.mjs.
- Finish final ART/product source, required rules and one build first. Record actual build-info raw bytes/SHA/version/revision/assets; verify every served asset and every matching rootsrc file, not only manifest counts. Record gitHEAD/worktree state. Freeze all runtime/dist/method files from launch through closure. If the final manifest differs from7145, keep its separate identity and do not mislabel the arithmetic as final-build measured throughput.
- Verify the59 original method-review entries and old native16/firsttour13/second15/third19 ledgers all hash-exact. Explicitly check third metadata.video published:false, URL:null,71,548,336B/SHA69971a38… and raw metadata/log/fullstate/autosave/method/video unchanged.
- Confirm chosen output absent or empty and independent log unused; no staleport5193server/Chromium from prior tours. Archive exact executedmethod bytes and method/dependency manifest into the new directory using the tool's normal mechanism.
- CPU/GPU exclusivity is arranged before launch: no concurrent builds, npmtest, scene generation or another WebGL task. This mitigates contention only; it does not prove the previous cause or guarantee speed.
- DefaultChromium151.0.7922.34, noCHROMIUM_PATH. Keep initialdefaultHighassert, select publicLow512×320/GL409×256, thennormalstart/readiness/focus/V. Initial publicAtlas+E/elevator setup only before residential2F route marker; the continuous route then has noAtlas/sample fasttravel, debug/state/coordinates/clock/dt/storage injection. Onefreshbrowser, oneuneditedvideo, noretry/no artificially added padding.

## While it runs

- Record sessionID and launchUTC. Poll only existingprocess/log/metadata to report new genuine phases around30–45seconds. Do not add pageoperations or new diagnostics into the run. Do not modify budgets/source/method after launch.
- Required sequence: realhome2F room→physicalstairsdown/Eexit→buswait/Eboard/physicalbothdecks/realupperopenberthdenial/lowerEalight→legalEpurchase with actualemployee+stock+fund/inventorydelta→realshopdoor/Eentry/groceryroom/physicalexit→street/ramp→ferrybothdecks/realupperopenberthdenial/lowerEalight→northpier/street/actualnorthmaritimeroom/Eexit→normalferryreturn→tramphysicalbothdecks/realupperberthdenial/lowerEalight→street/originalhome/Eentry/stairs/kitchen.
- New6a evidence must preserve every attempted walkLocal segmentJSON immediately on completion/failure, including originalerror.message/stack, actualcollected samples, inputdispatch/currentobservedheldstate, and everyattemptedride index. Cleanup errors must remain separate from primaryerrors. No invented oldsamples and no silentretries.
- On firstfailure allow normal catch/finally evidence/video closure, retain raw fullstate/autosave/errorUTC/log and notifyroot. Never fix/restart inside the same directory. A durationover20m remains failed if the full route or suffix failed.

## Successful route and reload requirements

- routeEndedAt must exist, actual residential-room-to-original-room route elapsed≥20wallmin through real operations. Video duration includes setup/load/waits and is recorded separately.
- Pause via actual productsettings; export exactoriginalJSON; cash/inventory reflect exactly oneEpurchase. Indoor save is explicitly safe street-door restoration, not exactroom storage.
- Reload while paused, verify safehomeentrance/cash/inventory/fleetclock, publicwelcome-settings export must deeplyequal entire finaloriginalJSON, thennormalstart/focus and actualEentry/physicalstairs/room reach2F again. Whole-case includes setup/export/reload/postreloadstairs/recordingfinalization and must remain under the frozen harddeadline.
- Endverify all source/assets/manifest/dependencies/methodSHA identical to launch; assert no page/shader/console/HTTP errors. Validate revisions unchanged forphysicalstreet/room/stair/cabinsegments while legalEscene transitions are recorded separately.

## Raw closure and publication accuracy

- OneoriginalWebM, await normalcontextclose/video finalization, retain timestamps for close request/finalization. Independentffprobe codec/viewport/duration; comparevideo duration to realrecordingwalltime, recordSHA/bytes. Preserve raw log including firstcause and failedphases. Do not edit or splicevideo.
- Write independentpost-run-verification, README scope/status/unreachedsuffix/case-vs-route-vs-video timings, exactexecutedmethod/build/source/resource identities, source assetendfreeze results; no passing claim based solely on elapsedvideo or featurecounts.
- Inventory everynewrawfile and supplementaldoc into evidence-files.json with SHA/bytes; verify all previousledgers stillunchanged after closure. Include complete newsegment/ridefiles and rawpublicsaveJSON, not onlyscreenshots.
- Retain published:false and URL:null until root actuallycommits or uploads. A >100MB rawvideo stays local/downloadable with SHA metadata or becomes an explicitlylinkedreleaseartifact after actualupload; do not forceGit or inventupload. Ignoredcapture-original.log requires gitadd-f only when root makes the real archivecommit.
- Root separatelyreviews finalHighnativeart evidence and its matching finalasset identity; thisLowSwiftShader functional route cannot prove GTA/Cyberpunk/AAA visualquality or hardwareFPS. No report ofcompletedgoal until actualfullroute, sourcefreeze, multiplayer compatibility and publicrelease checks are fulfilled.
`);
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const files=fs.readdirSync(dir).filter(f=>f!=='artifact-ledger.json').map(file=>{const bytes=fs.readFileSync(path.join(dir,file));return{file,bytes:bytes.length,sha256:sha(bytes)};});
fs.writeFileSync(path.join(dir,'artifact-ledger.json'),JSON.stringify({generatedAt:new Date().toISOString(),scope:'Derived candidate/review only; no original edits or browser',published:false,files},null,2)+'\n');
console.log(JSON.stringify({dir,files:files.length,reviewSha256:sha(fs.readFileSync(path.join(dir,'REVIEW.md'))),candidateSha256:sha(fs.readFileSync(path.join(dir,'capture-harbor-tour-180m.mjs'))),proposed2400:lowerProposal},null,2));
