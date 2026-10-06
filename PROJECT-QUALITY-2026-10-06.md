# Arena quality pass — 6 October 2026

## Intended experience

Choose Play solo and immediately move, aim and shoot. Learn two reusable tools: dash through danger and line up a piercing pulse. Then host a waiting room and share an explicit invite to use the same tools together.

## Observed friction and plan

Baseline `95a899c` requires external signaling even for one player. Combat offers constant shooting and two chasers with little counterplay. It has no touch controls, input expiry, enemy cap or validated rendering snapshots. Preserve the existing waiting room, manual invites, host-owned simulation and cleanup while adding an offline solo path, a small skill system, readable enemy windups and bounded network handling.

## Acceptance

- Solo plays without PeerJS or signaling. Leaving and retrying reset all controls and timers.
- Dash and pulse have visible, enforced cooldowns; one input edge triggers one action. The host owns damage and movement.
- Chargers visibly aim before committing to a straight attack; pulse piercing and dash protection reward timing and alignment.
- Old/restarted sessions and stale or malformed guest input cannot keep acting. Snapshots and simulation remain bounded.
- Keyboard, mouse and touch workflows fit narrow screens with usable controls. Tests exercise behavior, not source text.
- Document local/CI/browser results separately; actual NAT connectivity, 16-player capacity and human gameplay balance remain unverified.

## Evidence

- Local: 27 behavior tests pass, including 9,000 simulated ticks with 16 players and collection caps. Both runtime JavaScript syntax checks and `git diff --check` pass.
- Browser CI: [run 37538495740](https://github.com/generalgroovy/2darena/actions/runs/37538495740) passed against runtime commit `f7053d6`. Actual Chromium at 1366×768, touch-emulated 390×844 and 320×800 passed solo with PeerJS blocked, movement/fire, ability taps, held/released cooldown retry, restart and failed-network-to-solo recovery. No page errors or horizontal overflow. All three screenshots were visually inspected; captured telegraph frames use a deterministic enemy fixture, while model tests establish its timing. Screenshots and results are in `docs/evidence/2026-10-06/`. Earlier runs caught a real fast-input issue: releasing and pressing an ability inside one 30Hz tick looked like a held button. Press identities now preserve that edge without bypassing cooldowns. A phone movement test also needed to wait for its preceding dash to finish before measuring ordinary movement.
- Self-review: restricted shortcuts to the arena; cleared touch/queued controls on focus loss and restart; kept solo available while a network connection is pending; rejected duplicate members and repeated peer-open callbacks. Restored the original 16-player color palette.
- NOT RUN: physical-device touch ergonomics, actual PeerJS/WebRTC/NAT connectivity, signaling reliability, 16-player rendered/network capacity and human difficulty/fun assessment. The model stress test is not a performance benchmark.

## Resulting behavior

Solo starts immediately and does not depend on the asynchronous PeerJS download. Multiplayer still has an explicit waiting room, invite and host start/restart. Dash crosses danger, pulse rewards lined-up targets, and a diamond-shaped charger commits to its visible windup direction before recovering. Shape, direction line, cooldown text and health are visible without opening settings. Full learning/connection text is in disclosures. Touch uses captured pointer input; keyboard users can hold F for assisted fire.

The extracted dependency-free `arena-model.js` owns the same combat for solo and host play. Client messages carry sanitized intent only. Invalid rendering snapshots retain the last usable state; guest input stops after half a second without a fresh packet. Respawning uses round state instead of delayed callbacks. No accounts, saves, paid dependencies or external services were added.

## Sources consulted

- [Pointer events and capture](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events) informed cancellation/captured multi-pointer controls.
- [Playwright CI guidance](https://playwright.dev/docs/ci-intro) informed the isolated GitHub browser workflow and retained artifacts. The application remains build-free; Playwright is test-only.

## Release / rollback

Parent reviews and promotes the passing candidate. Publish all four runtime files together: `index.html`, `style.css`, `arena-model.js`, `game.js`. Old and new multiplayer clients should not be mixed; ask the room to reload after a release. Baseline `95a899c411864e5350c3dbf28524d2c8ac1a830a` is the preserved rollback reference. Main/publication have not been changed by this owner.

Release correction: the first Pages publication failed because two Markdown files contained mixed Windows-1252/UTF-8 bytes. Invalid Windows bytes were transcoded to UTF-8 while preserving already valid UTF-8 text. Runtime files are unchanged; deployment must pass before public acceptance.
