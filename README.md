# Peer-Hosted Arena Shooter

A static GitHub Pages-compatible top-down arena shooter where one browser hosts and up to 15 other players join.

## How it works

- The host clicks **Host Game** and receives a room code.
- Other players open the same GitHub Pages URL, enter the host code, and click **Join Game**.
- The host browser runs the authoritative simulation.
- Clients send input to the host.
- The host broadcasts game snapshots.
- The room is capped at 16 players total.

## Important networking note

This version uses PeerJS over WebRTC. GitHub Pages can host the static client, but browser-to-browser discovery still needs a signaling service. By default, PeerJS uses PeerServer Cloud. For production, host your own PeerServer.

## Deploy on GitHub Pages

1. Upload `index.html`, `style.css`, and `game.js` to your repository.
2. Enable GitHub Pages from the repository settings.
3. Open the Pages URL.
4. One player clicks **Host Game**.
5. Other players use the host code.

## Controls

- Move: WASD or arrow keys
- Aim: mouse
- Shoot: left mouse button

## Limits

- 16 players total
- Best for small private matches
- Host quality depends on the host player's browser, network, and NAT/firewall conditions
- For competitive or public play, use a dedicated authoritative WebSocket server instead

## References

- PeerJS: https://peerjs.com/
- PeerServer: https://peerjs.com/server/getting-started
- cdnjs PeerJS package: https://cdnjs.com/libraries/peerjs
- GitHub Pages: https://docs.github.com/en/pages
