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
let activePage;
try {
  for (const [width, height, touch] of [[1366, 768, false], [390, 844, true], [320, 740, true], [844, 420, true]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
    const page = await context.newPage();
    activePage = page;
    page.on('pageerror', e => errors.push(e.message));
    // Prove the solo journey stays usable when the signaling library is unavailable.
    await page.route('https://cdnjs.cloudflare.com/**', route => route.abort());
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    assert.equal(await page.getByText('Solo is ready · no connection needed', { exact: true }).isVisible(), true);
    assert.match(await page.locator('#status').textContent(), /Host a room or join/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, `lobby overflow at ${width}`);
    await page.screenshot({ path: `test-results/lobby-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Play solo', exact: true }).click();
    await page.waitForFunction(() => world?.phase === 'playing' && world.enemies.length > 0);
    assert.equal(await page.evaluate(() => typeof Peer), 'undefined');
    assert.equal(await page.locator('#copyBtn').isVisible(), false);
    assert.match(await page.locator('.play-status').textContent(), /Hold F/);
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
    if (!touch) {
      await page.locator('#pulseBtn').focus();
      await page.keyboard.down('Space');
      await page.waitForTimeout(2700);
      await page.keyboard.up('Space');
      assert.equal(await page.evaluate(() => world.players.solo.pulseCooldown), 0, 'held cooldown press must not fire later');
      await page.keyboard.press('Space');
      await page.waitForFunction(() => world.players.solo.pulseCooldown > 1.8);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.equal(overflow, false, `overflow at ${width}`);
    for (const id of ['dashBtn', 'pulseBtn', ...(touch ? ['move-w', 'move-a', 'move-s', 'move-d'] : [])]) {
      const box = await page.locator('#' + id).boundingBox(); assert.ok(box.width >= 44 && box.height >= 44, `${id} touch target`);
    }
    if (touch) {
      await page.waitForFunction(() => world.players.solo.dashTime === 0);
      await page.locator('#move-a').focus(); const start = await page.evaluate(() => world.players.solo.x);
      await page.keyboard.down('Space'); await page.waitForTimeout(150); await page.keyboard.up('Space');
      assert.ok(await page.evaluate(() => world.players.solo.x) < start - 20);
    }
    // Solo freezes the actual simulation, not just rendering. No held input survives resume.
    await page.locator('#game').focus();
    await page.keyboard.down('f');
    await page.keyboard.press('Escape');
    await page.keyboard.up('f');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'pauseBtn');
    assert.equal(await page.getByRole('button', { name: 'Resume', exact: true }).isVisible(), true);
    const frozen = await page.evaluate(() => JSON.stringify(world));
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => JSON.stringify(world)), frozen, 'pause freezes movement, health, cooldowns and spawning');
    await page.screenshot({ path: `test-results/paused-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Resume', exact: true }).press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'game');
    assert.equal(await page.evaluate(() => localInput().shoot), false);
    await page.locator('#gameHelp summary').click();
    await page.waitForFunction(() => soloPaused);
    await page.locator('#gameHelp summary').click();
    assert.equal(await page.evaluate(() => soloPaused), true, 'closing help must not resume unexpectedly');
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    // Deterministic renderer fixture exercises the charger telegraph; model tests prove its timing.
    await page.evaluate(() => {
      const p = world.players.solo;
      world.enemies = [{ x: 680, y: 250, r: 19, kind: 'charger', health: 4, speed: 0, damage: 22, phase: 'aim', angle: Math.atan2(p.y - 250, p.x - 680), timer: .8 }];
      world.spawnTimer = 100;
    });
    await page.waitForTimeout(80);
    await page.screenshot({ path: `test-results/arena-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.getByRole('button', { name: 'Restart wave', exact: true }).click();
    assert.equal(await page.evaluate(() => soloPaused), false);
    assert.equal(await page.evaluate(() => world.score), 0);
    assert.equal(await page.evaluate(() => world.players.solo.health), 100);
    assert.equal(await page.evaluate(() => world.players.solo.pulseCooldown), 0);
    await page.getByRole('button', { name: 'Back to menu', exact: true }).click();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'soloBtn');
    assert.equal(await page.evaluate(() => world), null);
    assert.equal(await page.evaluate(() => sessionTimers.length), 0);
    assert.equal(await page.evaluate(() => animationFrame), null);
    await page.getByRole('button', { name: 'Host Game', exact: true }).click();
    assert.match(await page.locator('#status').textContent(), /Connection unavailable/);
    await page.getByRole('button', { name: 'Play solo', exact: true }).click();
    await page.waitForFunction(() => world?.phase === 'playing');
    assert.equal(await page.evaluate(() => Object.keys(world.players).length), 1);
    results.push({ width, height, touch, soloWithoutSignaling: 'PASS', movementFireAbilities: 'PASS', pauseHelpResumeFocus: 'PASS', restartAndRecovery: 'PASS', overflow: false });
    await context.close();
  }
  assert.deepEqual(errors, []);
  await writeFile('test-results/results.json', JSON.stringify({ results, pageErrors: errors, multiplayer: 'NOT_RUN: model PeerJS events only; no physical-network claim' }, null, 2));
  console.log(JSON.stringify(results, null, 2));
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({ path: 'test-results/failure.png', fullPage: true });
    await writeFile('test-results/failure.json', JSON.stringify({ error: error.message, pageErrors: errors,
      state: await activePage.evaluate(() => ({ input: localInput(), player: world?.players?.solo, focus: document.activeElement?.id })) }, null, 2));
  }
  throw error;
} finally { await browser.close(); server.close(); }
