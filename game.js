const MAX_PLAYERS = ArenaModel.MAX_PLAYERS;
const TICK_RATE = 30;
const SNAPSHOT_RATE = 20;
const W = 960;
const H = 540;

const lobby = document.getElementById("lobby");
const gameWrap = document.getElementById("gameWrap");
const statusEl = document.getElementById("status");
const hostBtn = document.getElementById("hostBtn");
const soloBtn = document.getElementById("soloBtn");
const dashBtn = document.getElementById("dashBtn");
const pulseBtn = document.getElementById("pulseBtn");
const joinBtn = document.getElementById("joinBtn");
const joinCodeEl = document.getElementById("joinCode");
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const statsEl = document.getElementById("stats");
const roomInfoEl = document.getElementById("roomInfo");
const startBtn = document.getElementById("startBtn");
const inviteLink = document.getElementById("inviteLink");
const pauseBtn = document.getElementById("pauseBtn");
const gameHelp = document.getElementById("gameHelp");
const cancelConnectBtn = document.getElementById("cancelConnectBtn");

let peer = null;
let isHost = false;
let isSolo = false;
let soloPaused = false;
let myId = null;
let hostId = null;
let conns = new Map();
let hostConn = null;

let keys = new Set();
let mouse = { x: W / 2, y: H / 2, down: false };
let snapshot = { players: {}, bullets: [], enemies: [], particles: [], score: 0, wave: 1 };
let world = null;
let lastSendInput = 0;
let session = 0;
let sessionTimers = [];
let animationFrame = null;
let connectionTimeout = null;
let lobbyReturnFocus = hostBtn;
const touchKeys = new Set();
const touchActions = { dash: false, pulse: false };
const pendingActions = { dash: false, pulse: false };
const actionPresses = { dash: 0, pulse: 0 };
const controlResets = [];
let aimPointer = null;

function stopSession(message = "Left room.", restoreFocus = true) {
  const wasSolo = isSolo;
  session += 1; // Invalidate late callbacks before closing their connections.
  const previousPeer = peer;
  peer = null;
  hostConn = null;
  conns.clear();
  world = null;
  isHost = false;
  isSolo = false;
  soloPaused = false;
  myId = null;
  hostId = null;
  releaseControls();
  lastSendInput = 0;
  snapshot = { players: {}, bullets: [], enemies: [], particles: [], score: 0, wave: 1 };
  for (const timer of sessionTimers) clearInterval(timer);
  sessionTimers = [];
  clearTimeout(connectionTimeout);
  connectionTimeout = null;
  if (animationFrame !== null) cancelAnimationFrame(animationFrame);
  animationFrame = null;
  if (previousPeer) previousPeer.destroy();
  soloBtn.disabled = false;
  hostBtn.disabled = false;
  joinBtn.disabled = false;
  lobby.classList.remove("hidden");
  gameWrap.classList.add("hidden");
  inviteLink.hidden = true;
  cancelConnectBtn.hidden = true;
  gameHelp.open = false;
  setStatus(wasSolo ? "Host a room or join with a code." : message);
  if (restoreFocus) lobbyReturnFocus.focus();
}

function beginSession(hosting, code) {
  stopSession(hosting ? "Opening room..." : "Connecting...", false);
  lobbyReturnFocus = hosting ? hostBtn : joinCodeEl;
  const token = session;
  isHost = hosting;
  hostId = code;
  hostBtn.disabled = true;
  joinBtn.disabled = true;
  cancelConnectBtn.hidden = false;
  try { peer = hosting ? new Peer(code) : new Peer(); }
  catch { stopSession("Connection unavailable. Check your connection and try again."); return null; }
  const currentPeer = peer;
  connectionTimeout = setTimeout(() => {
    if (session === token) stopSession("Connection timed out. Check the room code and try again.");
  }, 15000);
  currentPeer.on("error", err => {
    if (session === token) stopSession(`Connection error: ${err.type || err.message}. Try again.`);
  });
  currentPeer.on("disconnected", () => {
    if (session === token) stopSession("Signaling disconnected. Reopen or rejoin the room.");
  });
  currentPeer.on("close", () => {
    if (session === token) stopSession("Room closed. You can host or join again.");
  });
  return { token, currentPeer };
}

function shortCode() {
  return "arena-" + Math.random().toString(36).slice(2, 8);
}

function setStatus(text) {
  statusEl.textContent = text;
  document.getElementById("gameStatus").textContent = text;
}

function sanitizeInput(input) {
  return ArenaModel.sanitizeInput(input);
}

function soloGame() {
  if (soloBtn.disabled) return;
  stopSession("Solo practice.", false);
  lobbyReturnFocus = soloBtn;
  isHost = true;
  isSolo = true;
  myId = "solo";
  initWorld();
  world.players[myId] = makePlayer(myId, "You");
  showGame("Solo");
  startRound();
  sessionTimers = [setInterval(hostTick, 1000 / TICK_RATE)];
  animationFrame = requestAnimationFrame(drawLoop);
}

function showGame(roomCode) {
  lobby.classList.add("hidden");
  gameWrap.classList.remove("hidden");
  roomInfoEl.textContent = isSolo ? "Solo · no connection needed" : `Room: ${roomCode}${isHost ? " · hosting" : ""}`;
  document.getElementById("copyBtn").hidden = isSolo;
  document.getElementById("leaveBtn").textContent = isSolo ? "Back to menu" : "Leave room";
  startBtn.hidden = !isHost;
  startBtn.textContent = "Start wave";
  cancelConnectBtn.hidden = true;
  pauseBtn.hidden = !isSolo;
  pauseBtn.textContent = "Pause";
  document.getElementById("pauseHelp").textContent = isSolo
    ? "Solo pauses here and when you switch away. Resume when ready. Escape also pauses while the arena is focused."
    : "Multiplayer keeps running while you read or switch away. Keep the host's tab active.";
  canvas.focus();
}

function setSoloPaused(paused, focus = true) {
  if (!isSolo || !world || world.phase !== "playing" || soloPaused === paused) return;
  soloPaused = paused;
  releaseControls();
  // Remove the last sampled controls too: resume starts from a neutral frame.
  world.players[myId].input = sanitizeInput({});
  pauseBtn.textContent = paused ? "Resume" : "Pause";
  setStatus(paused ? "Solo paused. Resume when ready." : "Solo in progress. Hold F for assisted fire.");
  if (!paused) gameHelp.open = false;
  if (focus) (paused ? pauseBtn : canvas).focus();
}

function suspendSolo() {
  releaseControls();
  setSoloPaused(true, false);
}

function initWorld() {
  world = ArenaModel.createWorld();
}

function startRound() {
  if (!isHost || !world) return;
  ArenaModel.startRound(world);
  soloPaused = false;
  pauseBtn.textContent = "Pause";
  gameHelp.open = false;
  releaseControls();
  startBtn.textContent = "Restart wave";
  snapshot = compressWorld(world);
  broadcastSnapshot();
  setStatus(isSolo ? "Solo in progress. Hold F for assisted fire." : "Wave in progress. Hold F for assisted fire.");
  canvas.focus();
}

async function copyInvite() {
  if (!hostId) return;
  const token = session;
  const url = new URL(window.location.href);
  url.searchParams.set("room", hostId);
  url.hash = "";
  const value = url.href;
  try {
    await navigator.clipboard.writeText(value);
    if (session === token) setStatus("Invite copied.");
  } catch {
    if (session !== token) return;
    inviteLink.value = value;
    inviteLink.hidden = false;
    inviteLink.focus();
    inviteLink.select();
    setStatus("Copy the selected invite link.");
  }
}

function makePlayer(id, name) {
  return ArenaModel.makePlayer(id, name, Object.keys(world.players).length);
}

function hostGame() {
  if (hostBtn.disabled) return;
  const started = beginSession(true, shortCode());
  if (!started) return;
  const { token, currentPeer } = started;
  currentPeer.on("open", id => {
    if (session !== token || world) return;
    clearTimeout(connectionTimeout);
    myId = id;
    hostId = id;
    initWorld();
    world.players[myId] = makePlayer(myId, "Host");
    showGame(id);
    setStatus("Room open. Invite friends, then Start wave.");
    snapshot = compressWorld(world);
    sessionTimers = [setInterval(hostTick, 1000 / TICK_RATE), setInterval(broadcastSnapshot, 1000 / SNAPSHOT_RATE)];
    animationFrame = requestAnimationFrame(drawLoop);
  });
  currentPeer.on("connection", conn => {
    if (session !== token) { conn.close(); return; }
    conn.on("open", () => {
      if (session !== token || !world) { conn.close(); return; }
      if (typeof conn.peer !== "string" || !conn.peer || conn.peer.length > 128 || conn.peer === myId || conns.has(conn.peer) || ["__proto__", "constructor", "prototype"].includes(conn.peer)) { conn.close(); return; }
      if (Object.keys(world.players).length >= MAX_PLAYERS) {
        conn.send({ type: "full" });
        conn.close();
        return;
      }
      conns.set(conn.peer, conn);
      world.players[conn.peer] = makePlayer(conn.peer, `P${Object.keys(world.players).length + 1}`);
      conn.send({ type: "welcome", id: conn.peer, hostId, maxPlayers: MAX_PLAYERS });
      snapshot = compressWorld(world);
      broadcastSnapshot();
    });
    conn.on("data", msg => {
      if (session !== token || conns.get(conn.peer) !== conn || !msg || typeof msg !== "object") return;
      if (msg.type === "input" && world?.players[conn.peer]) {
        world.players[conn.peer].input = sanitizeInput(msg.input);
        world.players[conn.peer].inputAge = 0;
      }
    });
    const removeGuest = () => {
      if (session !== token || conns.get(conn.peer) !== conn) return;
      conns.delete(conn.peer);
      if (world?.players[conn.peer]) delete world.players[conn.peer];
    };
    conn.on("close", removeGuest);
    conn.on("error", removeGuest);
  });
}

function joinGame() {
  if (joinBtn.disabled) return;
  const code = joinCodeEl.value.trim();
  if (!/^arena-[a-z0-9]{1,32}$/.test(code)) { setStatus(code ? "Use the arena- room code from your invite." : "Enter a host code."); joinCodeEl.focus(); return; }
  const started = beginSession(false, code);
  if (!started) return;
  const { token, currentPeer } = started;
  currentPeer.on("open", id => {
    if (session !== token || hostConn) return;
    myId = id;
    const conn = currentPeer.connect(code, { reliable: false });
    hostConn = conn;
    conn.on("open", () => {
      if (session !== token) return;
      clearTimeout(connectionTimeout);
      showGame(code);
      setStatus("Connected. Waiting for the host to start.");
      animationFrame = requestAnimationFrame(clientLoop);
    });
    conn.on("data", msg => {
      if (session !== token || !msg || typeof msg !== "object") return;
      if (msg.type === "snapshot") {
        const next = ArenaModel.validateSnapshot(msg.snapshot);
        if (!next) return;
        if (snapshot.phase !== next.phase) setStatus(next.phase === "waiting" ? "Waiting for the host to start." : "Wave in progress. Dash through danger; pulse through groups.");
        snapshot = next;
      }
      if (msg.type === "full") stopSession("Room is full. Try another room.");
    });
    conn.on("close", () => { if (session === token) stopSession("Disconnected from host. You can join again."); });
    conn.on("error", () => { if (session === token) stopSession("Host connection failed. You can join again."); });
  });
}

function localInput() {
  if (isSolo && soloPaused) return sanitizeInput({});
  const held = key => keys.has(key) || touchKeys.has(key);
  let mx = mouse.x, my = mouse.y;
  const me = snapshot.players?.[myId];
  if (held("f") && me && snapshot.enemies.length) {
    const target = snapshot.enemies.reduce((best, e) => distance(e, me) < distance(best, me) ? e : best);
    mx = target.x; my = target.y;
  }
  const input = {
    up: held("w") || held("arrowup"), down: held("s") || held("arrowdown"),
    left: held("a") || held("arrowleft"), right: held("d") || held("arrowright"),
    mx, my, shoot: mouse.down || held("f"),
    dash: held(" ") || held("shift") || touchActions.dash || pendingActions.dash,
    pulse: held("q") || touchActions.pulse || pendingActions.pulse,
    dashPress: actionPresses.dash, pulsePress: actionPresses.pulse
  };
  pendingActions.dash = false; pendingActions.pulse = false;
  return input;
}

function hostTick() {
  if (!world || (isSolo && soloPaused)) return;
  if (world.players[myId]) {
    world.players[myId].input = localInput();
    world.players[myId].inputAge = 0;
  }
  ArenaModel.step(world, 1 / TICK_RATE);
  snapshot = compressWorld(world);
}

function broadcast(msg) {
  for (const conn of conns.values()) {
    if (conn.open) conn.send(msg);
  }
}

function broadcastSnapshot() {
  if (!world) return;
  broadcast({ type: "snapshot", snapshot });
}

function compressWorld(w) {
  return ArenaModel.snapshot(w);
}

function clientLoop(now) {
  if (!peer || isHost) return;
  if (hostConn?.open && now - lastSendInput > 33) {
    hostConn.send({ type: "input", input: localInput() });
    lastSendInput = now;
  }
  drawSnapshot(snapshot);
  animationFrame = requestAnimationFrame(clientLoop);
}

function drawLoop() {
  if ((!peer && !isSolo) || !isHost) return;
  drawSnapshot(snapshot);
  animationFrame = requestAnimationFrame(drawLoop);
}

function drawSnapshot(s) {
  ctx.clearRect(0, 0, W, H);
  drawGrid();

  for (const p of s.particles || []) {
    ctx.globalAlpha = clamp(p.life * 3, 0, 1);
    ctx.fillStyle = "#ffd166";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  for (const b of s.bullets || []) {
    ctx.fillStyle = b.pulse ? "#e9d5ff" : "#8be9fd";
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const e of s.enemies || []) {
    if (e.kind === "charger" && (e.phase === "aim" || e.phase === "charge")) {
      ctx.strokeStyle = e.phase === "aim" ? "#fcd34d" : "#fb923c";
      ctx.lineWidth = e.phase === "aim" ? 3 : 6;
      ctx.setLineDash(e.phase === "aim" ? [10, 8] : []);
      ctx.beginPath(); ctx.moveTo(e.x, e.y);
      ctx.lineTo(e.x + Math.cos(e.angle) * 280, e.y + Math.sin(e.angle) * 280); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.fillStyle = e.kind === "charger" ? "#fbbf24" : e.r < 13 ? "#ff7b7b" : "#ff4d6d";
    ctx.beginPath();
    if (e.kind === "charger") {
      ctx.moveTo(e.x, e.y - e.r); ctx.lineTo(e.x + e.r, e.y); ctx.lineTo(e.x, e.y + e.r); ctx.lineTo(e.x - e.r, e.y); ctx.closePath();
    } else ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
    ctx.fill();
    if (e.kind === "charger") {
      ctx.fillStyle = "#111822";
      for (let i = 0; i < e.health; i++) ctx.fillRect(e.x - 9 + i * 5, e.y - 2, 3, 4);
    }
  }

  const players = Object.values(s.players || {});
  for (const p of players) {
    ctx.globalAlpha = p.alive ? 1 : 0.3;
    ctx.fillStyle = p.color || "#6ee7b7";
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();

    if (p.invulnerable > 0) {
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 6, 0, Math.PI * 2); ctx.stroke();
    }
    const a = Math.atan2((p.input?.my ?? p.y) - p.y, (p.input?.mx ?? p.x) - p.x);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + Math.cos(a) * 26, p.y + Math.sin(a) * 26);
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.font = "12px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(p.id === myId ? "YOU" : p.name, p.x, p.y - 24);

    ctx.fillStyle = "#111827";
    ctx.fillRect(p.x - 18, p.y + 22, 36, 5);
    ctx.fillStyle = "#6ee7b7";
    ctx.fillRect(p.x - 18, p.y + 22, 36 * Math.max(0, p.health) / 100, 5);
  }
  ctx.globalAlpha = 1;

  statsEl.textContent = `Players: ${players.length}/${MAX_PLAYERS} · Enemies: ${(s.enemies || []).length} · Score: ${s.score || 0} · Wave: ${s.wave || 1}`;
  const me = s.players?.[myId];
  const active = s.phase === "playing" && me?.alive && !soloPaused;
  for (const [button, label, cooldown, key] of [[dashBtn, "Dash", me?.dashCooldown, "Space"], [pulseBtn, "Pulse", me?.pulseCooldown, "Q"]]) {
    const text = `${label} · ${cooldown > 0 ? cooldown.toFixed(1) + "s" : key}`;
    if (button.textContent !== text) button.textContent = text;
    button.setAttribute("aria-disabled", String(!active || cooldown > 0));
  }
  const health = document.getElementById("health");
  const healthText = me ? me.alive ? `Health ${Math.ceil(me.health)}/100` : "Respawning…" : "Connecting…";
  if (health.textContent !== healthText) health.textContent = healthText;
  if (soloPaused || s.phase === "waiting" || me?.alive === false) {
    ctx.fillStyle = "rgba(8,17,31,.88)";
    ctx.fillRect(170, H / 2 - 32, W - 340, 64);
    ctx.fillStyle = "#ffffff";
    ctx.font = "22px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(soloPaused ? "Paused · Resume when ready" : me?.alive === false ? "Respawning…" : isHost ? "Ready? Start wave below." : "Waiting for host", W / 2, H / 2 + 8);
  }
}

function drawGrid() {
  ctx.strokeStyle = "rgba(255,255,255,.045)";
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 48) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y < H; y += 48) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function releaseControls() {
  for (const reset of controlResets) reset();
  keys.clear(); touchKeys.clear(); mouse.down = false;
  touchActions.dash = false; touchActions.pulse = false; aimPointer = null;
  pendingActions.dash = false; pendingActions.pulse = false;
}

function queueAbility(name) {
  if (isSolo && soloPaused) return;
  pendingActions[name] = true;
  actionPresses[name] = actionPresses[name] % Number.MAX_SAFE_INTEGER + 1;
}

window.addEventListener("keydown", e => {
  // Shortcuts belong to the arena. Links, dialogs and other controls keep browser keys.
  if (e.target !== canvas || e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return;
  if (e.key === "Escape" && isSolo) {
    e.preventDefault();
    if (!e.repeat) setSoloPaused(!soloPaused);
    return;
  }
  if (isSolo && soloPaused) return;
  if (e.key.startsWith("Arrow") || e.key === " ") e.preventDefault();
  // A held key must be released and pressed again after pause or focus loss.
  if (e.repeat) return;
  if ([" ", "Shift"].includes(e.key)) queueAbility("dash");
  if (e.key.toLowerCase() === "q") queueAbility("pulse");
  keys.add(e.key.toLowerCase());
});
window.addEventListener("keyup", e => keys.delete(e.key.toLowerCase()));
window.addEventListener("blur", suspendSolo);
canvas.addEventListener("blur", releaseControls);
document.addEventListener?.("visibilitychange", () => { if (document.hidden) suspendSolo(); });

function aimAt(e) {
  const rect = canvas.getBoundingClientRect();
  mouse.x = clamp((e.clientX - rect.left) * (canvas.width / rect.width), 0, W);
  mouse.y = clamp((e.clientY - rect.top) * (canvas.height / rect.height), 0, H);
}
canvas.addEventListener("pointermove", e => { if (e.pointerType === "mouse" || aimPointer === e.pointerId) aimAt(e); });
canvas.addEventListener("pointerdown", e => {
  if (isSolo && soloPaused) { canvas.focus(); return; }
  if (e.button !== 0 || aimPointer !== null) return;
  e.preventDefault(); canvas.focus(); aimAt(e);
  aimPointer = e.pointerId; canvas.setPointerCapture(e.pointerId); mouse.down = true;
});
const stopAim = e => { if (aimPointer === e.pointerId) { aimPointer = null; mouse.down = false; } };
canvas.addEventListener("pointerup", stopAim);
canvas.addEventListener("pointercancel", stopAim);
canvas.addEventListener("lostpointercapture", stopAim);
window.addEventListener("pointerup", stopAim);
canvas.addEventListener("contextmenu", e => e.preventDefault());

function holdButton(button, on, off) {
  let pointer = null;
  controlResets.push(() => { pointer = null; off(); });
  button.addEventListener("pointerdown", e => {
    if (e.button !== 0 || pointer !== null) return;
    e.preventDefault(); pointer = e.pointerId; button.setPointerCapture(pointer); on();
  });
  const release = e => { if (pointer === e.pointerId) { pointer = null; off(); } };
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) button.addEventListener(event, release);
  button.addEventListener("keydown", e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); if (!e.repeat) on(); } });
  button.addEventListener("keyup", e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); off(); } });
  button.addEventListener("blur", off);
}
for (const key of ["w", "a", "s", "d"]) holdButton(document.getElementById(`move-${key}`), () => touchKeys.add(key), () => touchKeys.delete(key));
holdButton(dashBtn, () => { touchActions.dash = true; queueAbility("dash"); }, () => touchActions.dash = false);
holdButton(pulseBtn, () => { touchActions.pulse = true; queueAbility("pulse"); }, () => touchActions.pulse = false);

soloBtn.addEventListener("click", soloGame);
hostBtn.addEventListener("click", hostGame);
joinBtn.addEventListener("click", joinGame);
joinCodeEl.addEventListener("keydown", e => {
  if (e.key === "Enter") joinGame();
});

document.getElementById("leaveBtn").addEventListener("click", () => stopSession());
cancelConnectBtn.addEventListener("click", () => stopSession("Connection cancelled. Host or join when ready."));
pauseBtn.addEventListener("click", () => setSoloPaused(!soloPaused));
gameHelp.addEventListener("toggle", () => { if (gameHelp.open) setSoloPaused(true, false); });
startBtn.addEventListener("click", startRound);
document.getElementById("copyBtn").addEventListener("click", copyInvite);
if (window.location?.href) {
  const room = new URL(window.location.href).searchParams.get("room");
  if (room && /^arena-[a-z0-9]{1,32}$/.test(room)) {
    joinCodeEl.value = room;
    setStatus("Invite ready. Choose Join Game.");
  }
}
