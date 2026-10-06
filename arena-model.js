(function (root) {
  "use strict";
  const W = 960, H = 540, MAX_PLAYERS = 16;
  const LIMITS = Object.freeze({ enemies: 80, bullets: 256, particles: 256 });
  const DASH_COOLDOWN = 1.6, PULSE_COOLDOWN = 2.4;
  const colors = ["#6ee7b7", "#93c5fd", "#fca5a5", "#fcd34d", "#c4b5fd", "#fdba74", "#67e8f9", "#f9a8d4", "#bef264", "#ddd6fe", "#a7f3d0", "#fecaca", "#bfdbfe", "#fde68a", "#e9d5ff", "#ccfbf1"];
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const neutral = () => ({ up: false, down: false, left: false, right: false, shoot: false, dash: false, pulse: false, dashPress: 0, pulsePress: 0, mx: W / 2, my: H / 2 });

  function sanitizeInput(input) {
    const value = input && typeof input === "object" ? input : {};
    const result = neutral();
    for (const key of ["up", "down", "left", "right", "shoot", "dash", "pulse"]) result[key] = value[key] === true;
    for (const key of ["dashPress", "pulsePress"]) result[key] = Number.isSafeInteger(value[key]) && value[key] > 0 ? value[key] : 0;
    result.mx = Number.isFinite(value.mx) ? clamp(value.mx, 0, W) : W / 2;
    result.my = Number.isFinite(value.my) ? clamp(value.my, 0, H) : H / 2;
    return result;
  }

  function createWorld() {
    return { phase: "waiting", players: Object.create(null), bullets: [], enemies: [], particles: [], score: 0, wave: 1, spawnTimer: 0, spawnCount: 0 };
  }

  function makePlayer(id, name, index = 0, random = Math.random) {
    return { id, name, x: 160 + random() * (W - 320), y: 120 + random() * (H - 240), r: 14, speed: 250,
      health: 100, alive: true, fireCooldown: 0, dashCooldown: 0, pulseCooldown: 0, dashTime: 0,
      dashX: 0, dashY: 0, invulnerable: 0, respawnTime: 0, inputAge: 0, dashHeld: false, pulseHeld: false, lastDashPress: 0, lastPulsePress: 0,
      input: neutral(), color: colors[index % colors.length] };
  }

  function startRound(world, random = Math.random) {
    for (const p of Object.values(world.players)) Object.assign(p, makePlayer(p.id, p.name, 0, random), { color: p.color });
    Object.assign(world, { phase: "playing", bullets: [], enemies: [], particles: [], score: 0, wave: 1, spawnTimer: 0, spawnCount: 0 });
  }

  function burst(world, x, y, count, random) {
    for (let i = 0; i < count && world.particles.length < LIMITS.particles; i++) {
      const a = random() * Math.PI * 2, speed = 50 + random() * 170;
      world.particles.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: .25 + random() * .25 });
    }
  }

  function spawnEnemy(world, random = Math.random) {
    if (world.enemies.length >= LIMITS.enemies) return;
    const side = Math.floor(random() * 4), edge = random();
    const x = side === 1 ? W + 25 : side === 3 ? -25 : edge * W;
    const y = side === 0 ? -25 : side === 2 ? H + 25 : edge * H;
    const level = Math.min(world.wave, 12);
    const charger = ++world.spawnCount % 4 === 0;
    const fast = !charger && random() < Math.min(.35, world.wave * .035);
    world.enemies.push({ x, y, kind: charger ? "charger" : fast ? "runner" : "chaser", r: charger ? 19 : fast ? 11 : 17,
      speed: charger ? 72 : fast ? 115 + level * 7 : 65 + level * 5, health: charger ? 4 : fast ? 1 : 3,
      damage: charger ? 22 : fast ? 8 : 14, phase: "chase", timer: 0, angle: 0 });
  }

  function segmentDistance(x1, y1, x2, y2, target) {
    const dx = x2 - x1, dy = y2 - y1;
    const t = clamp(((target.x - x1) * dx + (target.y - y1) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    return Math.hypot(x1 + t * dx - target.x, y1 + t * dy - target.y);
  }

  function step(world, dt, random = Math.random) {
    if (world.phase !== "playing") return;
    dt = clamp(Number.isFinite(dt) ? dt : 0, 0, 1 / 20);
    for (const p of Object.values(world.players)) {
      p.inputAge += dt;
      if (p.inputAge > .5) p.input = neutral();
      if (!p.alive) {
        p.respawnTime -= dt;
        if (p.respawnTime <= 0) Object.assign(p, makePlayer(p.id, p.name, 0, random), { color: p.color, invulnerable: 1 });
        continue;
      }
      p.fireCooldown = Math.max(0, p.fireCooldown - dt);
      p.dashCooldown = Math.max(0, p.dashCooldown - dt);
      p.pulseCooldown = Math.max(0, p.pulseCooldown - dt);
      p.invulnerable = Math.max(0, p.invulnerable - dt);
      const input = p.input;
      const dx = Number(input.right) - Number(input.left), dy = Number(input.down) - Number(input.up);
      const len = Math.hypot(dx, dy) || 1;
      const aim = Math.atan2(input.my - p.y, input.mx - p.x);
      const freshDash = input.dashPress > 0 ? input.dashPress !== p.lastDashPress : !p.dashHeld;
      const freshPulse = input.pulsePress > 0 ? input.pulsePress !== p.lastPulsePress : !p.pulseHeld;
      if (input.dash && freshDash && p.dashCooldown <= 0) {
        p.dashX = dx || dy ? dx / len : Math.cos(aim);
        p.dashY = dx || dy ? dy / len : Math.sin(aim);
        p.dashTime = .16;
        p.invulnerable = .22;
        p.dashCooldown = DASH_COOLDOWN;
      }
      p.dashHeld = input.dash;
      if (input.dashPress > 0) p.lastDashPress = input.dashPress;
      const dashing = p.dashTime > 0;
      p.x = clamp(p.x + (dashing ? p.dashX * 720 : dx / len * p.speed) * dt, p.r, W - p.r);
      p.y = clamp(p.y + (dashing ? p.dashY * 720 : dy / len * p.speed) * dt, p.r, H - p.r);
      p.dashTime = Math.max(0, p.dashTime - dt);
      const pulse = input.pulse && freshPulse && p.pulseCooldown <= 0;
      p.pulseHeld = input.pulse;
      if (input.pulsePress > 0) p.lastPulsePress = input.pulsePress;
      if ((pulse || input.shoot && p.fireCooldown <= 0) && world.bullets.length < LIMITS.bullets) {
        world.bullets.push({ owner: p.id, x: p.x + Math.cos(aim) * 20, y: p.y + Math.sin(aim) * 20,
          vx: Math.cos(aim) * (pulse ? 850 : 620), vy: Math.sin(aim) * (pulse ? 850 : 620), r: pulse ? 8 : 4,
          life: pulse ? 1.2 : .9, pulse, damage: pulse ? 3 : 1, remaining: pulse ? 4 : 1, hits: new Set() });
        p.fireCooldown = .16;
        if (pulse) p.pulseCooldown = PULSE_COOLDOWN;
      }
    }

    world.wave = 1 + Math.floor(world.score / 250);
    world.spawnTimer -= dt;
    if (world.spawnTimer <= 0) {
      spawnEnemy(world, random);
      world.spawnTimer = Math.max(.3, .95 - world.wave * .04 - Object.keys(world.players).length * .015);
    }

    for (const b of world.bullets) {
      const x = b.x, y = b.y;
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.life <= 0) continue;
      // Resolve in travel order so a normal shot cannot pass through the nearer enemy.
      const hits = world.enemies.filter(e => e.health > 0 && !b.hits.has(e) && segmentDistance(x, y, b.x, b.y, e) < b.r + e.r)
        .sort((a, c) => Math.hypot(a.x - x, a.y - y) - Math.hypot(c.x - x, c.y - y));
      for (const e of hits) {
        e.health -= b.damage;
        b.hits.add(e);
        if (b.pulse) {
          const speed = Math.hypot(b.vx, b.vy) || 1;
          e.x = clamp(e.x + b.vx / speed * 30, -25, W + 25);
          e.y = clamp(e.y + b.vy / speed * 30, -25, H + 25);
        }
        burst(world, e.x, e.y, 5, random);
        if (e.health <= 0) { world.score += e.kind === "charger" ? 30 : e.r < 13 ? 20 : 10; burst(world, e.x, e.y, 8, random); }
        if (--b.remaining <= 0) { b.life = 0; break; }
      }
    }

    const living = Object.values(world.players).filter(p => p.alive);
    for (const e of world.enemies) {
      if (e.health <= 0 || !living.length) continue;
      const target = living.reduce((best, p) => distance(e, p) < distance(e, best) ? p : best);
      let angle = Math.atan2(target.y - e.y, target.x - e.x), speed = e.speed;
      if (e.kind === "charger") {
        e.timer -= dt;
        if (e.phase === "chase" && distance(e, target) < 300) {
          e.phase = "aim"; e.timer = .8; e.angle = angle;
        } else if (e.phase === "aim" && e.timer <= 0) {
          e.phase = "charge"; e.timer = .5;
        } else if (e.phase === "charge" && e.timer <= 0) {
          e.phase = "recover"; e.timer = .65;
        } else if (e.phase === "recover" && e.timer <= 0) e.phase = "chase";
        if (e.phase === "aim" || e.phase === "recover") speed = 0;
        if (e.phase === "charge") { angle = e.angle; speed = 560; }
      }
      e.x = clamp(e.x + Math.cos(angle) * speed * dt, -25, W + 25);
      e.y = clamp(e.y + Math.sin(angle) * speed * dt, -25, H + 25);
      if (target.alive && target.invulnerable <= 0 && distance(e, target) < e.r + target.r) {
        target.health = Math.max(0, target.health - e.damage); e.health = 0;
        target.invulnerable = .35; // A crowded hit cannot consume all health in one tick.
        burst(world, e.x, e.y, 8, random);
        if (target.health <= 0) { target.alive = false; target.respawnTime = 2.5; target.input = neutral(); }
      }
    }
    for (const p of world.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .94; p.vy *= .94; p.life -= dt; }
    world.bullets = world.bullets.filter(b => b.life > 0 && b.x > -30 && b.x < W + 30 && b.y > -30 && b.y < H + 30);
    world.enemies = world.enemies.filter(e => e.health > 0);
    world.particles = world.particles.filter(p => p.life > 0);
  }

  function snapshot(world) {
    const players = Object.create(null);
    for (const p of Object.values(world.players)) {
      const { id, name, x, y, r, health, alive, color, input, dashCooldown, pulseCooldown, invulnerable } = p;
      players[id] = { id, name, x, y, r, health, alive, color, input, dashCooldown, pulseCooldown, invulnerable };
    }
    return { phase: world.phase, players, bullets: world.bullets.map(b => ({ x: b.x, y: b.y, r: b.r, pulse: b.pulse })),
      enemies: world.enemies.map(e => ({ x: e.x, y: e.y, r: e.r, kind: e.kind, phase: e.phase, angle: e.angle, timer: e.timer, health: e.health })),
      particles: world.particles.map(p => ({ x: p.x, y: p.y, life: p.life })), score: world.score, wave: world.wave };
  }

  function validateSnapshot(value) {
    if (!value || typeof value !== "object" || !value.players || typeof value.players !== "object" || Array.isArray(value.players) ||
        !["waiting", "playing"].includes(value.phase) || !Number.isSafeInteger(value.score) || value.score < 0 || !Number.isSafeInteger(value.wave) || value.wave < 1) return null;
    const entries = Object.entries(value.players);
    if (entries.length > MAX_PLAYERS) return null;
    const point = p => p && Number.isFinite(p.x) && p.x >= -100 && p.x <= W + 100 && Number.isFinite(p.y) && p.y >= -100 && p.y <= H + 100;
    const radius = p => Number.isFinite(p.r) && p.r > 0 && p.r <= 30;
    const players = Object.create(null);
    for (const [id, p] of entries) {
      if (!point(p) || !radius(p) || !Number.isFinite(p.health) || p.health < 0 || p.health > 100 || typeof p.alive !== "boolean") return null;
      players[id] = { id, name: typeof p.name === "string" ? p.name.slice(0, 20) : "Player", x: p.x, y: p.y, r: p.r, health: p.health, alive: p.alive,
        color: colors.includes(p.color) ? p.color : colors[0], input: sanitizeInput(p.input),
        dashCooldown: Number.isFinite(p.dashCooldown) ? clamp(p.dashCooldown, 0, DASH_COOLDOWN) : 0,
        pulseCooldown: Number.isFinite(p.pulseCooldown) ? clamp(p.pulseCooldown, 0, PULSE_COOLDOWN) : 0,
        invulnerable: Number.isFinite(p.invulnerable) ? clamp(p.invulnerable, 0, 1) : 0 };
    }
    const result = { phase: value.phase, score: value.score, wave: value.wave, players };
    for (const key of ["bullets", "enemies", "particles"]) {
      const items = value[key];
      if (!Array.isArray(items) || items.length > LIMITS[key]) return null;
      if (items.some(p => !point(p) || (key !== "particles" && !radius(p)))) return null;
      result[key] = items.map(p => key === "particles" ? { x: p.x, y: p.y, life: Number.isFinite(p.life) ? clamp(p.life, 0, 1) : 0 }
        : key === "bullets" ? { x: p.x, y: p.y, r: p.r, pulse: p.pulse === true }
          : { x: p.x, y: p.y, r: p.r, kind: ["chaser", "runner", "charger"].includes(p.kind) ? p.kind : "chaser",
            phase: ["chase", "aim", "charge", "recover"].includes(p.phase) ? p.phase : "chase", angle: Number.isFinite(p.angle) ? p.angle : 0,
            timer: Number.isFinite(p.timer) ? clamp(p.timer, 0, 1) : 0, health: Number.isFinite(p.health) ? clamp(p.health, 0, 4) : 1 });
    }
    return result;
  }

  const api = { W, H, MAX_PLAYERS, LIMITS, DASH_COOLDOWN, PULSE_COOLDOWN, createWorld, makePlayer, startRound, step, snapshot, validateSnapshot, sanitizeInput, spawnEnemy, segmentDistance };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ArenaModel = api;
})(globalThis);
