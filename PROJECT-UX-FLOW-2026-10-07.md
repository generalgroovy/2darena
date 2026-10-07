# Arena restart decision — 7 October 2026

## Observed friction

The old **Restart wave** button immediately reset the entire run: wave 1, score 0, enemies cleared and full health for every player. The label understated its effect, and a mistaken click discarded progress without a chance to keep the current run.

Baseline `5d1c7c9e352709c1e513eddbdccf505baa7c31e2` matched origin/main. The checkout was clean and no applicable AGENTS.md was present. Candidate branch: `codex/ux-flow-2026-10-07`.

## Result

- **Restart run** opens a compact inline choice with the reset scope and explicit **Restart from wave 1** action. It focuses the non-destructive choice and reveals the section on small screens.
- Solo pauses while choosing. **Keep playing** resumes the existing run with neutral controls; **Keep paused** preserves a prior pause and returns focus to Resume. Escape also cancels. The hidden Resume control cannot bypass an unresolved choice.
- Hosts see **Restart for everyone?** and a clear explanation that all players reset while the room stays connected. Multiplayer keeps running during the choice. Guests cannot initiate a restart. Waiting rooms still start directly with **Start wave**.
- Confirmation uses the existing authoritative reset path, clears the choice, resumes solo and focuses the arena. Leaving clears pending choices; late or repeated confirmation cannot reset another run. Combat, abilities, spawning, networking and room capacity remain unchanged.

## Validation

Local `node --test tests/*.test.cjs`: **37/37 passed**, zero failures/skips. The five new cases cover full-state freeze and cancellation, an already paused run and Escape, confirmed full-run reset with neutral input and focus, waiting/playing host behavior with connected guest membership, and stale/session/guest guards. Existing tests retain combat timing, 9,000-tick simulation bounds, input routing, solo recovery and authoritative network state checks. `node --check game.js`, `node --check tests/browser.mjs` and `git diff --check` passed. This repository has no package.json; its documented direct Node test command is the applicable runner.

The existing CI browser journey now exercises cancellation from running/paused states, unchanged progress, keyboard focus, confirmed reset, usable choice controls and horizontal containment at 1366×768, 390×844, 320×740 and 844×420. CI execution and independent source review are pending at this initial freeze.

Root separately accepted the actual working runtime in CUA: damaged health remained unchanged during the paused choice, Keep playing resumed; prior Pause offered Keep paused and restored Resume focus; confirmation reset health/score/wave and focused the arena. Root inspected `ux-flow-2026-10-07/evidence/arena-restart-phone.png` at 390×844 with complete choice controls. No local browser automation was used by the owner. Root conditionally authorized normal main promotion after frozen CI and independent review pass.

## Release boundary

Candidate only until remaining gates pass. Publication and exact public hashes will be recorded after Pages deployment. Intended URL: <https://generalgroovy.github.io/2darena/>. Simulated PeerJS events establish application semantics, not physical-network connectivity, signaling uptime, touch-device ergonomics or 16-player performance.
