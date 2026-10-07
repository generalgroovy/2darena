# Peer-Hosted Arena Shooter

A cooperative top-down browser shooter. One browser simulates the match and other players join with its room code. The configured room limit is 16 players; that limit is not a measured network-capacity guarantee.

## Run and join

Serve this directory with Python 3 and open `http://localhost:8080`:

```sh
python -m http.server 8080
```

There is no npm install or build step for the game. **Play solo** works immediately without PeerJS or signaling. Multiplayer loads PeerJS 1.5.5 from cdnjs and uses its default signaling service; hosting/joining requires network access. You can switch to solo while a connection is pending.

For an instant solo run, choose **Play solo**. **Pause** (or Escape while the arena is focused) freezes the whole simulation, including health, spawning and ability cooldowns. **Resume** returns focus to the arena with movement and firing released. Opening **Controls & tips** or switching away also pauses solo; returning does not resume automatically. **Restart wave** starts a fresh run, including from paused play.

For multiplayer, use **Play with friends**:

1. The host chooses **Host Game** and chooses **Copy invite** or shares the displayed `arena-...` code. Clipboard denial reveals a selectable link.
2. Guests open the same game version, open the invite (which fills the code but does not auto-connect) or enter the code, then choose **Join Game** or press Enter.
3. The room waits safely while players join. The host chooses **Start wave** when ready.
4. Move with **WASD/arrows**, aim with the mouse and hold the **left mouse button** to fire. Hold **F** for keyboard-only assisted fire toward the nearest enemy. On touch screens, hold the movement pad and aim/fire on the arena.
5. The host can **Restart wave** to reset score, enemies and health without reconnecting the group.
6. Use **Leave room** to return to the lobby. If the host leaves, guests must create or join another room.

Connection failures and disconnections return to a usable lobby. **Cancel connection** stops a pending attempt immediately and retains the room code for retry; an attempt also times out after 15 seconds. Repeated clicks do not create multiple peers. Leaving cancels simulation/render timers and invalidates callbacks from the old room before retrying. Multiplayer has no pause: reading controls or switching away does not pause the shared match.

## Two tools, many ways to survive

- **Dash — Space/Shift or Dash button:** move in your movement direction (or aim direction when standing still), briefly protected from contact. Ready again after 1.6 seconds. Use it to cross a charge lane, escape a crowd or reposition for a shot.
- **Pulse — Q or Pulse button:** a larger shot that deals three damage, nudges enemies back and pierces up to four targets. Ready again after 2.4 seconds. Line up groups rather than spending it on one weak enemy. Release and press again for each ability.
- **Chargers:** yellow diamonds stop and show a dashed line for 0.8 seconds, then commit to that direction and briefly recover. Their four health pips let you judge when a regular shot plus pulse will finish them. Ordinary chasers and fast runners remain.
- Damage gives a short grace period, so a crowd cannot drain all health in one tick. Respawn restores health after 2.5 seconds and protects you for one second. Restart resets the round without replacing room members.

These are practice/survival rounds with shared score and respawns. There is no persistent leaderboard or match elimination. Movement and assisted-fire guidance stay above the arena; Dash and Pulse stay below it. **Controls & tips** remains available during play. Landscape is easier for touch play.

## Network and save behavior

PeerJS uses WebRTC data connections and a signaling service; static hosting alone does not provide matchmaking. NAT/firewall restrictions can prevent peers from reaching one another. There is no bundled TURN relay or dedicated authoritative game server. Hosting quality depends on the host's machine and network; keep the host tab active.

The host simulates at 30 ticks per second and sends snapshots at 20 per second. Clients submit inputs; the host owns movement, damage, ability cooldowns and enemy charge directions. Guest input expires after half a second without a fresh packet. Rendering snapshots validate finite geometry and bounded collection sizes. Simulation caps are 80 enemies, 256 projectiles and 256 particles; speed and spawn scaling also stop increasing. These bounds are not network-capacity measurements. Losing local window focus clears held movement/firing but does not pause everyone's match. Room migration and reconnect-to-existing-player recovery are not implemented.

All scores and match state are memory-only. Reload, host closure or leaving discards the session. There is no account, persistent world or cloud save. This is a private-match prototype, not a hardened public competitive service.

## Development and deployment

```sh
node --check game.js
node --check arena-model.js
node --test tests/*.test.cjs
```

Dependency-free Node tests cover combat timing, piercing/swept hits, charger telegraphs, stale-input expiry, snapshot validation, a 9,000-tick crowded simulation, solo recovery, input release and room lifecycle using simulated PeerJS events. The Quality GitHub workflow also installs test-only Playwright 1.56.1 and exercises actual Chromium at desktop/390px/320px, with the PeerJS CDN blocked, including touch ability taps, keyboard controls, restart and retry. It saves screenshots and result JSON as an artifact. See PROJECT-QUALITY-2026-10-06.md for current evidence. Neither simulation nor emulation proves physical-network connectivity, signaling uptime, touch-device ergonomics or 16-player performance.

For a real smoke test, host in one browser and join from a second; verify movement/fire, guest leave/rejoin, host closure and retry. Repeat on the target physical network before claiming connectivity.

Deploy `index.html`, `style.css`, `arena-model.js` and `game.js` to a static HTTPS host such as GitHub Pages. The external PeerJS script and signaling service must remain reachable. Configure an explicitly managed PeerServer/relay deployment before relying on this prototype for public use.
