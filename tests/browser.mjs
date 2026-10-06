import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve('.');
const server = createServer(async (req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname;
  const file = resolve(root, '.' + (name === '/' ? '/index.html' : name));
  if (!file.startsWith(root + '/')) { res.writeHead(403).end(); return; }
  try {
    const data = await readFile(file);
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
await mkdir('test-results', { recursive: true });
const browser = await chromium.launch();
const results = [], errors = [];
try {
  for (const [width, height, touch] of [[1366, 768, false], [390, 844, true], [320, 800, true]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    // Prove the solo journey stays usable when the signaling library is unavailable.
    await page.route('https://cdnjs.cloudflare.com/**', route => route.abort());
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Play solo', exact: true }).click();
    await page.waitForFunction(() => world?.phase === 'playing' && world.enemies.length > 0);
    assert.equal(await page.evaluate(() => typeof Peer), 'undefined');
    assert.equal(await page.locator('#copyBtn').isVisible(), false);
    const x = await page.evaluate(() => world.players.solo.x);
    await page.keyboard.down('d'); await page.waitForTimeout(150); await page.keyboard.up('d');
    assert.ok(await page.evaluate(() => world.players.solo.x) > x + 20);
    await page.keyboard.down('f'); await page.waitForTimeout(100); await page.keyboard.up('f');
    assert.ok(await page.evaluate(() => world.bullets.length) > 0);
    if (touch) await page.locator('#dashBtn').tap(); else await page.keyboard.press('Space');
    await page.waitForFunction(() => world.players.solo.dashCooldown > 1);
    if (touch) await page.locator('#pulseBtn').tap(); else await page.keyboard.press('q');
    await page.waitForFunction(() => world.players.solo.pulseCooldown > 1.8);
    assert.match(await page.locator('#pulseBtn').textContent(), /Pulse.*s/);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.equal(overflow, false, `overflow at ${width}`);
    for (const id of ['dashBtn', 'pulseBtn', ...(touch ? ['move-w', 'move-a', 'move-s', 'move-d'] : [])]) {
      const box = await page.locator('#' + id).boundingBox(); assert.ok(box.width >= 44 && box.height >= 44, `${id} touch target`);
    }
    if (touch) {
      await page.locator('#move-a').focus(); const start = await page.evaluate(() => world.players.solo.x);
      await page.keyboard.down('Space'); await page.waitForTimeout(150); await page.keyboard.up('Space');
      assert.ok(await page.evaluate(() => world.players.solo.x) < start - 20);
    }
    // Deterministic renderer fixture exercises the charger telegraph; model tests prove its timing.
    await page.evaluate(() => {
      const p = world.players.solo;
      world.enemies = [{ x: 680, y: 250, r: 19, kind: 'charger', health: 4, speed: 0, damage: 22, phase: 'aim', angle: Math.atan2(p.y - 250, p.x - 680), timer: .8 }];
      world.spawnTimer = 100;
    });
    await page.waitForTimeout(80);
    await page.screenshot({ path: `test-results/arena-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Restart wave', exact: true }).click();
    assert.equal(await page.evaluate(() => world.score), 0);
    assert.equal(await page.evaluate(() => world.players.solo.health), 100);
    assert.equal(await page.evaluate(() => world.players.solo.pulseCooldown), 0);
    await page.getByRole('button', { name: 'Back to menu', exact: true }).click();
    assert.equal(await page.evaluate(() => world), null);
    assert.equal(await page.evaluate(() => sessionTimers.length), 0);
    assert.equal(await page.evaluate(() => animationFrame), null);
    await page.getByRole('button', { name: 'Host Game', exact: true }).click();
    assert.match(await page.locator('#status').textContent(), /Connection unavailable/);
    await page.getByRole('button', { name: 'Play solo', exact: true }).click();
    await page.waitForFunction(() => world?.phase === 'playing');
    assert.equal(await page.evaluate(() => Object.keys(world.players).length), 1);
    results.push({ width, height, touch, soloWithoutSignaling: 'PASS', movementFireAbilities: 'PASS', restartAndRecovery: 'PASS', overflow: false });
    await context.close();
  }
  assert.deepEqual(errors, []);
  await writeFile('test-results/results.json', JSON.stringify({ results, pageErrors: errors, multiplayer: 'NOT_RUN: model PeerJS events only; no physical-network claim' }, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally { await browser.close(); server.close(); }
