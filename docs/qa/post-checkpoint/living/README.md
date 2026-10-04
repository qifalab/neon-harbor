# Residential lift regression after checkpoint integration

The original first `living-city.spec.js` scenario passed once on the frozen local v0.8 build: **1 passed, 0 failed, 0 skipped, 0 retries**. The test took 139.220 seconds; the complete Playwright run took 149.300 seconds. It used Google Chrome for Testing 151.0.7922.34 with SwiftShader, the existing 640×400 viewport, and the test's explicit Low setting.

The player used the public city guide, E interaction, floor buttons, and real walking to enter Camellia Court, ride to the gallery, walk through the bedroom doorway, return by lift, and exit onto the street. The test asserted furnished-room occupancy, floor height, three resident interior floors, restored outdoor traffic, and no page, console, or HTTP errors. No game coordinate or clock writes were made.

| Journey | First active → first idle simulation time | Measured seconds | Original limit | Observed phases |
| --- | --- | --- | --- | --- |
| Lobby → gallery | 7.116667 → 10.850000 | 3.733333 | < 5.2 | closing, moving, opening, idle |
| Gallery → lobby | 27.883333 → 31.633333 | 3.750000 | < 5.2 | closing, moving, opening, idle |

Both arrivals have fully open doors and the correct floor elevation: gallery 4.2 m, lobby 0 m. The browser RAF observer records the first active and first idle frames, so later protocol polling does not add idle time to the lift journey. It retains the original `duration + 3` simulation limit and 90-second wall-clock deadline. Every recorded frame also passed the cabin x/z stability assertions. Full phase, y, position, and door diagnostics are preserved in [the upward journey](living-city-lift-gallery.json) and [the downward journey](living-city-lift-lobby.json).

[The bedroom image](living-city-camellia-bedroom.png) was visually inspected and shows the player inside the furnished room. This Low-resolution functional capture does not establish art quality. The unchanged default High scenario was not repeated in this targeted run.

The tested manifest SHA-256 is `bfe5c2276acffcdcf5adb01d9e9cb9f3e27d6b09fa7393d7ec8ee8ab06d45f3a`, containing 145 fingerprinted files. Its revision is `null`, because this was a local build with uncommitted checkpoint integration above Git base `3a81a74d9503836934e9eff10d3cadc88afa2e80`. [Run context](run-context.json) records the command, browser, test/helper hashes, and every runtime source hash; [build-info.json](build-info.json) preserves the exact tested manifest. This is local evidence and does not establish deployment or remote CI success.

[Verification](verification.json), [raw run log](run.log), [raw Playwright test report](playwright-test-report.json), [raw summary](playwright-report-summary.json), and the [original embedded report ZIP](playwright-report.zip) preserve the result. [Evidence hashes](evidence-files.json) cover every evidence file.
