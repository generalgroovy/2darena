# Arena usability pass — 7 October 2026

## What changed

The old lobby described the whole game as “Not connected” even when offline solo was ready. Solo is now the first, full-width action with an explicit ready state. Hosting, joining, connection feedback and connection help belong to a separate **Play with friends** group. Pending connections have **Cancel connection**, retaining the typed room code and restoring focus for retry.

Solo now has **Pause / Resume** above the arena. Escape pauses while the arena is focused. Pausing freezes the authoritative simulation, including health, enemies, spawns, projectiles and cooldowns; it also clears held and queued controls. Resume returns focus to the arena without replaying held fire or abilities. Opening **Controls & tips**, losing window focus or hiding the document pauses solo. Returning or closing help does not resume unexpectedly. Restart clears pause and starts a fresh wave.

The active game retains assisted-fire **F** guidance and a concise, always-available **Controls & tips** disclosure. Short landscape places the complete arena beside its movement and ability controls, keeping both available without scrolling. Multiplayer exposes no pause control; its help explicitly says the shared match keeps running. Host authority, combat, caps, validated snapshots, room membership and offline solo independence are unchanged.

## Evidence and review

- Base: `2aa67fbadf1554f99dda6f2ec062603f110c050b` (`origin/main`). Candidate branch: `codex/ux-clarity-2026-10-07`.
- Local: `node --check game.js`, `node --check tests/browser.mjs`, `node --test tests/*.test.cjs` — **32 passed** after review fixes; `git diff --check` passed.
- Added behavior coverage proves full simulation freeze, neutral resume and focus, focus/visibility/help pause, explicit restart, multiplayer no-pause, cancellation teardown, retained code and stale callback rejection. Existing combat, crowded simulation, network validation and retry tests remain.
- Runtime commit: `aaf223b724a327acededbc4ab069c770d39bdd64`.
- [Quality CI 37604352411](https://github.com/generalgroovy/2darena/actions/runs/37604352411): **SUCCESS**, including 32 behavior tests and portable browser checks at 1366×768, 390×844, 320×740 and 844×420 with signaling blocked. Checks cover lobby/active layout, solo movement/fire/abilities, Escape/Resume focus, frozen simulation, help state, restart from paused play and retry. Short landscape additionally asserts that the entire canvas, movement pad, abilities and Pause are inside the viewport. **Zero page errors and zero horizontal overflow.** Results/screenshots are in `docs/evidence/ux-2026-10-07/ci-37604352411/`.
- Independent reviewer `ux_fighter` found that an OS repeated keydown could re-latch fire/movement after Resume. Fixed with a repeat guard for all gameplay keys; added F/W release-and-fresh-press regression. Reviewer reran 17 session checks and independently reproduced closure; final landscape CSS/test-only delta also source-reviewed with no blocker.
- The first CI run exposed the movement pad hidden at the newly tested 844×420 width. Responsive detection was corrected. Screenshot inspection then showed the controls below the full-height canvas despite no horizontal overflow; the final landscape layout and viewport-position assertions resolve that separate issue. Earlier run JSON is retained as historical evidence, not acceptance.
- Owner inspected rendered CI screenshots including 320px lobby/paused play and final 844×420 landscape.
- Root interactive CUA review **accepted** runtime `aaf223b7`: desktop, 390px and 320px layouts have no horizontal overflow; 844×420 shows the entire arena, movement pad, abilities and Pause together. Root exercised Solo → Pause → Resume → Controls & tips (automatic pause) → close tips (still paused) → Restart wave (running, canvas focused) → Escape pause → Back to menu (Play solo focused). Visible simulation and health remained unchanged while paused. Screenshots: `docs/evidence/ux-2026-10-07/root/arena-after-{desktop,mobile,landscape}.png`.
- With both review gates accepted, root authorized the owner to record this receipt, promote by normal fast-forward push, wait for Pages deployment, and verify all four public runtime files against committed bytes. The release receipt is tracked separately from these local and browser checks.

## Limits

Simulated PeerJS events and Chromium emulation do not establish physical-network connectivity, 16-player performance, physical touch ergonomics or human enjoyment. No external rooms or hardware were activated. Match state remains memory-only; leaving/reloading discards it. Target release URL: <https://generalgroovy.github.io/2darena/>.
