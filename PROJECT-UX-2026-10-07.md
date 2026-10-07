# Arena usability pass — 7 October 2026

## What changed

The old lobby described the whole game as “Not connected” even when offline solo was ready. Solo is now the first, full-width action with an explicit ready state. Hosting, joining, connection feedback and connection help belong to a separate **Play with friends** group. Pending connections have **Cancel connection**, retaining the typed room code and restoring focus for retry.

Solo now has **Pause / Resume** above the arena. Escape pauses while the arena is focused. Pausing freezes the authoritative simulation, including health, enemies, spawns, projectiles and cooldowns; it also clears held and queued controls. Resume returns focus to the arena without replaying held fire or abilities. Opening **Controls & tips**, losing window focus or hiding the document pauses solo. Returning or closing help does not resume unexpectedly. Restart clears pause and starts a fresh wave.

The active game retains assisted-fire **F** guidance and a concise, always-available **Controls & tips** disclosure. Multiplayer exposes no pause control; its help explicitly says the shared match keeps running. Host authority, combat, caps, validated snapshots, room membership and offline solo independence are unchanged.

## Evidence and review

- Base: `2aa67fbadf1554f99dda6f2ec062603f110c050b` (`origin/main`). Candidate branch: `codex/ux-clarity-2026-10-07`.
- Local: `node --check game.js`, `node --check tests/browser.mjs`, `node --test tests/*.test.cjs` — **31 passed**; `git diff --check` passed.
- Added behavior coverage proves full simulation freeze, neutral resume and focus, focus/visibility/help pause, explicit restart, multiplayer no-pause, cancellation teardown, retained code and stale callback rejection. Existing combat, crowded simulation, network validation and retry tests remain.
- Portable browser CI expanded to 1366×768, 390×844, 320×740 and 844×420 with signaling blocked. It checks lobby/active layout, solo movement/fire/abilities, Escape/Resume focus, frozen simulation, help state, restart from paused play and retry. Result pending until recorded below.
- Independent source review and root rendered browser review: pending. Owner does not promote main or deploy.

## Limits

Simulated PeerJS events and Chromium emulation do not establish physical-network connectivity, 16-player performance, physical touch ergonomics or human enjoyment. No external rooms or hardware were activated. Match state remains memory-only; leaving/reloading discards it. Target release URL: <https://generalgroovy.github.io/2darena/>.
