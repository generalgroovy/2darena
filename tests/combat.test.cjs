const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../arena-model.js');
const fixed = () => .5;
function game() {
  const w = M.createWorld(); w.players.me = M.makePlayer('me', 'You', 0, fixed); M.startRound(w, fixed);
  w.spawnTimer = 100; w.players.me.x = 200; w.players.me.y = 270;
  return w;
}
function input(w, value) { w.players.me.input = M.sanitizeInput(value); w.players.me.inputAge = 0; }
function tick(w, count, value = {}) { for (let i = 0; i < count; i++) { input(w, value); M.step(w, 1 / 30, fixed); } }
function enemy(x, y = 270, extra = {}) { return { x, y, r: 17, speed: 0, health: 3, damage: 14, kind: 'chaser', phase: 'chase', ...extra }; }

test('dash moves in the chosen direction, protects from collision, and requires a fresh press', () => {
  const w = game(); w.enemies = [enemy(240)];
  tick(w, 1, { right: true, dash: true });
  assert.equal(w.players.me.x, 224); assert.equal(w.players.me.health, 100);
  assert.equal(w.players.me.dashCooldown, M.DASH_COOLDOWN);
  tick(w, 60, { dash: true });
  assert.equal(w.players.me.dashCooldown, 0); assert.equal(w.players.me.dashTime, 0);
  tick(w, 1); tick(w, 1, { dash: true, mx: 0, my: 270 });
  assert.equal(w.players.me.dashCooldown, M.DASH_COOLDOWN); assert.equal(w.players.me.dashX, -1);
});

test('pulse pierces four targets in travel order and cannot damage a target twice', () => {
  const w = game(); w.enemies = [230, 300, 370, 440, 510].map(x => enemy(x));
  tick(w, 1, { pulse: true, mx: 960, my: 270 });
  tick(w, 20);
  assert.equal(w.score, 40); assert.equal(w.enemies.length, 1); assert.equal(w.enemies[0].x, 510);
  const durable = game(); durable.enemies = [enemy(230, 270, { health: 10 })];
  tick(durable, 1, { pulse: true, mx: 960, my: 270 }); tick(durable, 20);
  assert.equal(durable.enemies[0].health, 7);
});

test('ordinary shots hit only the nearer target, with swept collision between ticks', () => {
  const w = game(); w.players.me.invulnerable = 1; w.enemies = [enemy(250), enemy(230)];
  tick(w, 1, { shoot: true, mx: 960, my: 270 });
  assert.equal(w.enemies[1].health, 2); assert.equal(w.enemies[0].health, 3); assert.equal(w.bullets.length, 0);
  assert.equal(M.segmentDistance(0, 0, 100, 0, { x: 50, y: 2 }), 2);
});

test('press identities preserve a fresh press between ticks without repeating a held action', () => {
  const w = game(); tick(w, 1, { pulse: true, pulsePress: 1 });
  tick(w, 80, { pulse: true, pulsePress: 1 }); assert.equal(w.players.me.pulseCooldown, 0);
  tick(w, 1, { pulse: true, pulsePress: 2 }); assert.equal(w.players.me.pulseCooldown, M.PULSE_COOLDOWN);
  tick(w, 1, { pulse: true, pulsePress: 3 }); const cooldown = w.players.me.pulseCooldown;
  tick(w, 1, { pulse: true, pulsePress: 3 }); assert.ok(w.players.me.pulseCooldown < cooldown);
});

test('charger locks a visible direction, waits, commits straight and then recovers', () => {
  const w = game(); w.enemies = [enemy(400, 270, { kind: 'charger', health: 4, phase: 'chase', timer: 0 })];
  tick(w, 1); const e = w.enemies[0]; const angle = e.angle;
  assert.equal(e.phase, 'aim'); assert.equal(e.x, 400);
  w.players.me.y = 100; tick(w, 20);
  assert.equal(e.phase, 'aim'); assert.equal(e.angle, angle); assert.equal(e.x, 400);
  tick(w, 6); assert.equal(e.phase, 'charge'); assert.equal(e.y, 270);
  tick(w, 16); assert.equal(e.phase, 'recover'); const x = e.x;
  tick(w, 10); assert.equal(e.x, x);
});

test('stale input expires and dead players respawn with a grace period', () => {
  const w = game(); input(w, { right: true, shoot: true, pulse: true });
  for (let i = 0; i < 20; i++) M.step(w, 1 / 30, fixed);
  const x = w.players.me.x; M.step(w, 1 / 30, fixed); assert.equal(w.players.me.x, x); assert.equal(w.players.me.input.shoot, false);
  w.players.me.health = 1; w.enemies = [enemy(x, w.players.me.y)]; tick(w, 1);
  assert.equal(w.players.me.alive, false); tick(w, 77);
  assert.equal(w.players.me.alive, true); assert.equal(w.players.me.health, 100); assert.ok(w.players.me.invulnerable > .8);
});

test('one crowded collision has recovery time; waiting and restart preserve player identity', () => {
  const w = game(); w.enemies = Array.from({ length: 5 }, () => enemy(200)); tick(w, 1);
  assert.equal(w.players.me.health, 86);
  const color = w.players.me.color; M.startRound(w, fixed);
  assert.equal(w.players.me.color, color); assert.equal(w.players.me.health, 100);
  assert.equal(w.players.me.pulseCooldown, 0); assert.equal(w.enemies.length, 0);
  w.phase = 'waiting'; tick(w, 300, { shoot: true, dash: true, pulse: true }); assert.equal(w.enemies.length, 0); assert.equal(w.bullets.length, 0);
});

test('simulation caps enemies, projectiles and particles during a long crowded run', () => {
  const w = game(); w.spawnTimer = 0;
  for (let i = 0; i < 100; i++) M.spawnEnemy(w, fixed);
  assert.equal(w.enemies.length, M.LIMITS.enemies);
  for (let i = 1; i < M.MAX_PLAYERS; i++) w.players['p' + i] = M.makePlayer('p' + i, 'Player', i, fixed);
  for (let n = 0; n < 9000; n++) {
    for (const p of Object.values(w.players)) { p.input = M.sanitizeInput({ shoot: true, mx: 0, my: 0 }); p.inputAge = 0; p.invulnerable = 1; }
    M.step(w, 1 / 30, fixed);
    assert.ok(w.enemies.length <= M.LIMITS.enemies); assert.ok(w.bullets.length <= M.LIMITS.bullets); assert.ok(w.particles.length <= M.LIMITS.particles);
  }
  assert.ok(w.enemies.length > 0);
});

test('snapshots validate finite bounded geometry and retain visible authoritative cooldowns', () => {
  const w = game(); tick(w, 1, { dash: true, pulse: true });
  const source = M.snapshot(w); const valid = M.validateSnapshot(JSON.parse(JSON.stringify(source)));
  assert.ok(valid); assert.equal(valid.players.me.dashCooldown, M.DASH_COOLDOWN); assert.equal(valid.bullets[0].pulse, true);
  assert.equal('speed' in valid.players.me, false);
  for (const change of [s => s.players.me.x = NaN, s => s.bullets[0].r = -1, s => s.enemies = Array(81).fill(enemy(0)), s => s.players = [], s => s.phase = 'anything']) {
    const s = structuredClone(source); change(s); assert.equal(M.validateSnapshot(s), null);
  }
});
