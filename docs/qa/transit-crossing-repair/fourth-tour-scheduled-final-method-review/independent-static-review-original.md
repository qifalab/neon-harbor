# DERIVED independent static budget review

Reviewed only the prepared `/tmp/neon-harbor-tour-scheduled-2400-final-review-2026-10-04T20-08` candidate and copied parent. No browser, GPU, tests, build, mocks, or edits to the candidate/ROOT/original artifacts.

Candidate SHA-256 independently computed: `a8ff1a10fb47c97d2385054e65503b3269ba1a44fc3d2f7318bf5fe39603e537`.
Copied parent SHA-256 independently computed: `7c1d299a91dfb738270f4d8a783dd39f67b7c9acbc381f50522dca1f78b8d802`.

No blocker found in the requested narrow static scope. Independent full diff contains exactly three hunks: ride scheduled boarding at 438 changes remaining(600000) to remaining(2400000); ride upper real-open-berth at 464 changes the same literal; the corresponding destination comment block at 495–497 is updated. There are exactly two literal remaining(2400000) calls and one changed comment block. Undoing only those literals and that block produces the complete parent bytes exactly. Every byte outside ride remains identical.

This full reverse-byte equality establishes that every input command/order, physical target, collision behavior, endpoint .06, height .15, revision/deck/held-input checks, iteration guard, simulation-time/route/displacement checks, evidence/first-error handling, and route/save/reload behavior is otherwise unchanged from 7c. The inherited whole-case 240 minutes, destination 2400 seconds, ordinary cabin 150 seconds, ferry final-door 300 seconds, ground-axis 180 seconds, and shop staff/stock/open 600 seconds remain unchanged. The shop's exact remaining(600000) call remains outside ride.

The supplied conditional arithmetic fits 2400 seconds:

| Basis | Conditional wall seconds | With ×1.2 | Remaining within 2400 |
| --- | ---: | ---: | ---: |
| nominal two-fleet invalid service gap / .67 service-per-sim / sampled sim-per-wall | 1793.790501 | 2152.548601 | 247.451399 s |
| captured two-tram phase invalid service gap / same rates | 1950.354799 | 2340.425758 | 59.574242 s |

Rounded user inputs also fit: 1793.791×1.2=2152.5492 and 1950.355×1.2=2340.426. The static arithmetic independently recomputes the supplied service-gap/rate divisions; it does not recover or certify native phase identity beyond the supplied reviewed basis.

These are finite predeclared wall allowances, not performance guarantees. The .67 service/sim value is an observed mean, and the lowest sampled 30-second sim/wall rate is not a guaranteed future lower bound. Traffic holds, fleet bunching, scheduling, and the actual remaining>2 door window may exceed the model. The unchanged simulation and physical checks must still pass. Each 40-minute local wait remains capped by the unchanged global remaining budget; this arithmetic does not promise that every stage's worst case simultaneously fits the 240-minute whole tour.

No runtime/model/default-quality/clock/state change, retry, padding, or during-run allowance edit is introduced by this candidate diff. Static approval of the narrow change is not a live-tour PASS claim or authorization to start a browser.
