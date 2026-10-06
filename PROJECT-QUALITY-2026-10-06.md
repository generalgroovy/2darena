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

In progress.
