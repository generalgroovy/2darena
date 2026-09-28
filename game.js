const MAX_PLAYERS = 16;
const TICK_RATE = 30;
const SNAPSHOT_RATE = 20;
const W = 960;
const H = 540;

const lobby = document.getElementById("lobby");
const gameWrap = document.getElementById("gameWrap");
const statusEl = document.getElementById("status");
const hostBtn = document.getElementById("hostBtn");
const joinBtn = document.getElementById("joinBtn");
const joinCodeEl = document.getElementById("joinCode");
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const statsEl = document.getElementById("stats");
const roomInfoEl = document.getElementById("roomInfo");

const colors = ["#6ee7b7","#93c5fd","#fca5a5","#fcd34d","#c4b5fd","#fdba74","#67e8f9","#f9a8d4","#bef264","#ddd6fe","#a7f3d0","#fecaca","#bfdbfe","#fde68a","#e9d5ff","#ccfbf1"];

let peer = null;
let isHost = false;
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

function stopSession(message = "Left room.", restoreFocus = true) {
  session += 1; // Invalidate late callbacks before closing their connections.
  const previousPeer = peer;
  peer = null;
  hostConn = null;
  conns.clear();
  world = null;
  isHost = false;
  myId = null;
  hostId = null;
  keys.clear();
  mouse.down = false;
  lastSendInput = 0;
  snapshot = { players: {}, bullets: [], enemies: [], particles: [], score: 0, wave: 1 };
  for (const timer of sessionTimers) clearInterval(timer);
  sessionTimers = [];
  clearTimeout(connectionTimeout);
  connectionTimeout = null;
  if (animationFrame !== null) cancelAnimationFrame(animationFrame);
  animationFrame = null;
  if (previousPeer) previousPeer.destroy();
  hostBtn.disabled = false;
  joinBtn.disabled = false;
  lobby.classList.remove("hidden");
  gameWrap.classList.add("hidden");
  setStatus(message);
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
  const value = input && typeof input === "object" ? input : {};
  return {
    up: value.up === true, down: value.down === true,
    left: value.left === true, right: value.right === true,
    shoot: value.shoot === true,
    mx: Number.isFinite(value.mx) ? clamp(value.mx, 0, W) : W / 2,
    my: Number.isFinite(value.my) ? clamp(value.my, 0, H) : H / 2
  };
}

function showGame(roomCode) {
  lobby.classList.add("hidden");
  gameWrap.classList.remove("hidden");
  roomInfoEl.textContent = `Room: ${roomCode}${isHost ? " · hosting" : ""}`;
  canvas.focus();
}

function initWorld() {
  world = { players: {}, bullets: [], enemies: [], particles: [], score: 0, wave: 1, spawnTimer: 0 };
}

function makePlayer(id, name) {
  const n = Object.keys(world.players).length;
  return {
    id, name,
    x: 160 + Math.random() * (W - 320),
    y: 120 + Math.random() * (H - 240),
    r: 14,
    speed: 250,
    health: 100,
    fireCooldown: 0,
    input: { up: false, down: false, left: false, right: false, mx: W / 2, my: H / 2, shoot: false },
    color: colors[n % colors.length],
    alive: true
  };
}

function hostGame() {
  if (hostBtn.disabled) return;
  const started = beginSession(true, shortCode());
  if (!started) return;
  const { token, currentPeer } = started;
  currentPeer.on("open", id => {
    if (session !== token) return;
    clearTimeout(connectionTimeout);
    myId = id;
    initWorld();
    world.players[myId] = makePlayer(myId, "Host");
    showGame(id);
    setStatus(`Hosting as ${id}`);
    sessionTimers = [setInterval(hostTick, 1000 / TICK_RATE), setInterval(broadcastSnapshot, 1000 / SNAPSHOT_RATE)];
    animationFrame = requestAnimationFrame(drawLoop);
  });
  currentPeer.on("connection", conn => {
    if (session !== token) { conn.close(); return; }
    conn.on("open", () => {
      if (session !== token || !world) { conn.close(); return; }
      if (Object.keys(world.players).length >= MAX_PLAYERS) {
        conn.send({ type: "full" });
        conn.close();
        return;
      }
      conns.set(conn.peer, conn);
      world.players[conn.peer] = makePlayer(conn.peer, `P${Object.keys(world.players).length + 1}`);
      conn.send({ type: "welcome", id: conn.peer, hostId, maxPlayers: MAX_PLAYERS });
    });
    conn.on("data", msg => {
      if (session !== token || conns.get(conn.peer) !== conn || !msg || typeof msg !== "object") return;
      if (msg.type === "input" && world?.players[conn.peer]) world.players[conn.peer].input = sanitizeInput(msg.input);
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
  if (!code) { setStatus("Enter a host code."); joinCodeEl.focus(); return; }
  const started = beginSession(false, code);
  if (!started) return;
  const { token, currentPeer } = started;
  currentPeer.on("open", id => {
    if (session !== token) return;
    myId = id;
    const conn = currentPeer.connect(code, { reliable: false });
    hostConn = conn;
    conn.on("open", () => {
      if (session !== token) return;
      clearTimeout(connectionTimeout);
      showGame(code);
      setStatus(`Connected to ${code}`);
      animationFrame = requestAnimationFrame(clientLoop);
    });
    conn.on("data", msg => {
      if (session !== token || !msg || typeof msg !== "object") return;
      if (msg.type === "snapshot" && msg.snapshot?.players && Array.isArray(msg.snapshot.bullets) && Array.isArray(msg.snapshot.enemies) && Array.isArray(msg.snapshot.particles)) snapshot = msg.snapshot;
      if (msg.type === "full") stopSession("Room is full. Try another room.");
    });
    conn.on("close", () => { if (session === token) stopSession("Disconnected from host. You can join again."); });
    conn.on("error", () => { if (session === token) stopSession("Host connection failed. You can join again."); });
  });
}

function localInput() {
  return {
    up: keys.has("w") || keys.has("arrowup"),
    down: keys.has("s") || keys.has("arrowdown"),
    left: keys.has("a") || keys.has("arrowleft"),
    right: keys.has("d") || keys.has("arrowright"),
    mx: mouse.x,
    my: mouse.y,
    shoot: mouse.down
  };
}

function hostTick() {
  const dt = 1 / TICK_RATE;
  if (!world) return;

  world.players[myId].input = localInput();

  for (const p of Object.values(world.players)) {
    if (!p.alive) continue;

    let dx = 0, dy = 0;
    if (p.input.up) dy--;
    if (p.input.down) dy++;
    if (p.input.left) dx--;
    if (p.input.right) dx++;

    const len = Math.hypot(dx, dy) || 1;
    p.x = clamp(p.x + dx / len * p.speed * dt, p.r, W - p.r);
    p.y = clamp(p.y + dy / len * p.speed * dt, p.r, H - p.r);
    p.fireCooldown -= dt;

    if (p.input.shoot && p.fireCooldown <= 0) {
      const a = Math.atan2(p.input.my - p.y, p.input.mx - p.x);
      world.bullets.push({
        owner: p.id,
        x: p.x + Math.cos(a) * 20,
        y: p.y + Math.sin(a) * 20,
        vx: Math.cos(a) * 620,
        vy: Math.sin(a) * 620,
        r: 4,
        life: 0.9
      });
      p.fireCooldown = 0.16;
    }
  }

  world.spawnTimer -= dt;
  if (world.spawnTimer <= 0) {
    spawnEnemy();
    world.spawnTimer = Math.max(0.16, 0.95 - world.wave * 0.04 - Object.keys(world.players).length * 0.015);
  }

  world.wave = 1 + Math.floor(world.score / 250);

  for (const b of world.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
  }

  for (const e of world.enemies) {
    const living = Object.values(world.players).filter(p => p.alive);
    if (!living.length) continue;

    let target = living[0];
    let best = distance(e, target);
    for (const p of living) {
      const d = distance(e, p);
      if (d < best) { best = d; target = p; }
    }

    const a = Math.atan2(target.y - e.y, target.x - e.x);
    e.x += Math.cos(a) * e.speed * dt;
    e.y += Math.sin(a) * e.speed * dt;

    if (distance(e, target) < e.r + target.r) {
      target.health -= e.damage;
      e.health = 0;
      burst(e.x, e.y, 8);
      if (target.health <= 0) {
        target.alive = false;
        setTimeout(() => respawnPlayer(target.id), 2500);
      }
    }
  }

  for (const b of world.bullets) {
    for (const e of world.enemies) {
      if (e.health > 0 && distance(b, e) < b.r + e.r) {
        e.health--;
        b.life = 0;
        burst(e.x, e.y, 5);
        if (e.health <= 0) {
          world.score += e.r < 13 ? 20 : 10;
          burst(e.x, e.y, 12);
        }
        break;
      }
    }
  }

  for (const p of world.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.94;
    p.vy *= 0.94;
    p.life -= dt;
  }

  world.bullets = world.bullets.filter(b => b.life > 0 && b.x > -30 && b.x < W + 30 && b.y > -30 && b.y < H + 30);
  world.enemies = world.enemies.filter(e => e.health > 0);
  world.particles = world.particles.filter(p => p.life > 0);

  snapshot = compressWorld(world);
}

function respawnPlayer(id) {
  if (!world?.players?.[id]) return;
  const p = world.players[id];
  p.x = 160 + Math.random() * (W - 320);
  p.y = 120 + Math.random() * (H - 240);
  p.health = 100;
  p.alive = true;
}

function spawnEnemy() {
  const side = Math.floor(Math.random() * 4);
  let x, y;
  if (side === 0) { x = Math.random() * W; y = -25; }
  if (side === 1) { x = W + 25; y = Math.random() * H; }
  if (side === 2) { x = Math.random() * W; y = H + 25; }
  if (side === 3) { x = -25; y = Math.random() * H; }

  const fast = Math.random() < Math.min(0.35, world.wave * 0.035);
  world.enemies.push({
    x, y,
    r: fast ? 11 : 17,
    speed: fast ? 115 + world.wave * 7 : 65 + world.wave * 5,
    health: fast ? 1 : 3,
    damage: fast ? 8 : 14
  });
}

function burst(x, y, count) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 50 + Math.random() * 170;
    world.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.25 + Math.random() * 0.25 });
  }
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
  return {
    players: w.players,
    bullets: w.bullets.map(b => ({ x: b.x, y: b.y, r: b.r })),
    enemies: w.enemies.map(e => ({ x: e.x, y: e.y, r: e.r })),
    particles: w.particles.map(p => ({ x: p.x, y: p.y, life: p.life })),
    score: w.score,
    wave: w.wave
  };
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
  if (!peer || !isHost) return;
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
    ctx.fillStyle = "#8be9fd";
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const e of s.enemies || []) {
    ctx.fillStyle = e.r < 13 ? "#ff7b7b" : "#ff4d6d";
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
    ctx.fill();
  }

  const players = Object.values(s.players || {});
  for (const p of players) {
    ctx.globalAlpha = p.alive ? 1 : 0.3;
    ctx.fillStyle = p.color || "#6ee7b7";
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();

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

window.addEventListener("keydown", e => {
  if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target?.tagName)) return;
  if (e.key.startsWith("Arrow")) e.preventDefault();
  keys.add(e.key.toLowerCase());
});
window.addEventListener("keyup", e => keys.delete(e.key.toLowerCase()));
window.addEventListener("blur", () => { keys.clear(); mouse.down = false; });

canvas.addEventListener("mousemove", e => {
  const rect = canvas.getBoundingClientRect();
  mouse.x = (e.clientX - rect.left) * (canvas.width / rect.width);
  mouse.y = (e.clientY - rect.top) * (canvas.height / rect.height);
});
canvas.addEventListener("mousedown", e => {
  if (e.button !== 0) return;
  canvas.focus();
  mouse.down = true;
});
window.addEventListener("mouseup", () => mouse.down = false);

hostBtn.addEventListener("click", hostGame);
joinBtn.addEventListener("click", joinGame);
joinCodeEl.addEventListener("keydown", e => {
  if (e.key === "Enter") joinGame();
});

document.getElementById("leaveBtn").addEventListener("click", () => stopSession());
