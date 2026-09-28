# Peer-Hosted Arena Shooter

A cooperative top-down browser shooter. One browser simulates the match and other players join with its room code. The configured room limit is 16 players; that limit is not a measured network-capacity guarantee.

## Run and join

Serve this directory with Python 3 and open `http://localhost:8080`:

```sh
python -m http.server 8080
```

There is no npm install or build step. The page downloads PeerJS 1.5.5 from cdnjs and uses its default signaling service, so creating a room requires network access even when serving locally.

1. The host chooses **Host Game** and chooses **Copy invite** or shares the displayed `arena-...` code. Clipboard denial reveals a selectable link.
2. Guests open the same game version, open the invite (which fills the code but does not auto-connect) or enter the code, then choose **Join Game** or press Enter.
3. The room waits safely while players join. The host chooses **Start wave** when ready.
4. Move with **WASD/arrows**, aim with the mouse and fire with the **left mouse button**.
5. The host can **Restart wave** to reset score, enemies and health without reconnecting the group.
6. Use **Leave room** to return to the lobby. If the host leaves, guests must create or join another room.

Connection failures and disconnections return to a usable lobby. A connection attempt times out after 15 seconds. Repeated clicks do not create multiple peers. Leaving cancels simulation/render timers and invalidates callbacks from the old room before retrying.

## Network and save behavior

PeerJS uses WebRTC data connections and a signaling service; static hosting alone does not provide matchmaking. NAT/firewall restrictions can prevent peers from reaching one another. There is no bundled TURN relay or dedicated authoritative game server. Hosting quality depends on the host's machine and network; keep the host tab active.

The host simulates at 30 ticks per second and sends snapshots at 20 per second. Clients submit inputs; the host owns the game state. Losing local window focus clears held movement/firing but does not pause everyone's match. Room migration and reconnect-to-existing-player recovery are not implemented.

All scores and match state are memory-only. Reload, host closure or leaving discards the session. There is no account, persistent world or cloud save. This is a private-match prototype, not a hardened public competitive service.

## Development and deployment

```sh
node --check game.js
node --test tests/*.test.cjs
```

Tests cover malformed input, focus release, timer/peer cleanup, stale callbacks, double-click prevention, failure/timeout retries and full-room handling, waiting/start/restart, stale death timers and invite clipboard recovery using simulated PeerJS events. They do not prove physical-network connectivity, signaling uptime or 16-player performance.

For a real smoke test, host in one browser and join from a second; verify movement/fire, guest leave/rejoin, host closure and retry. Repeat on the target physical network before claiming connectivity.

Deploy `index.html`, `style.css` and `game.js` to a static HTTPS host such as GitHub Pages. The external PeerJS script and signaling service must remain reachable. Configure an explicitly managed PeerServer/relay deployment before relying on this prototype for public use.
