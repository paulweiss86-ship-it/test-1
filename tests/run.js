/* Headless end-to-end test for AFTER HOURS.
   Usage: node tests/run.js [--shots-dir DIR]
   Exits 0 on pass, 1 on failure. Writes screenshots to DIR (default tests/shots). */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const shotsDir = argv.includes('--shots-dir') ? argv[argv.indexOf('--shots-dir') + 1] : path.join(__dirname, 'shots');
fs.mkdirSync(shotsDir, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (p.endsWith('/')) p += 'index.html';
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); res.end('nope'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  });
});

let failures = 0;
function check(name, cond, extra) {
  const ok = !!cond;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
  if (!ok) failures++;
}

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/index.html`;

  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon/i.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  const waitState = async (fn, timeout, label) => {
    try { await page.waitForFunction(fn, null, { timeout }); return true; }
    catch (e) { return false; }
  };

  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(1200);

  check('page loads without JS errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  check('test hooks present', await page.evaluate(() => !!window.__AH));
  check('WebGL rendering active', await page.evaluate(() => window.__AH.renderer.info.render.calls > 5),
    'draw calls: ' + await page.evaluate(() => window.__AH.renderer.info.render.calls));

  await page.screenshot({ path: path.join(shotsDir, '01-title.png') });

  // ---- start game ----
  await page.evaluate(() => window.__AH.start());
  await page.waitForTimeout(2500);
  let st = await page.evaluate(() => window.__AH.state());
  check('game starts in playing mode', st.mode === 'playing', `mode=${st.mode}`);
  check('wave 1 spawns enemies', st.enemies + st.queued > 0, `enemies=${st.enemies} queued=${st.queued}`);
  await page.screenshot({ path: path.join(shotsDir, '02-wave1.png') });

  // ---- movement ----
  const p0 = st.playerPos;
  await page.evaluate(() => window.__AH.key('KeyW', true));
  const movedOk = await page.waitForFunction(
    (start) => { const p = window.__AH.state().playerPos; return Math.hypot(p.x - start.x, p.z - start.z) > 3; },
    p0, { timeout: 10000 }
  ).then(() => true).catch(() => false);
  await page.evaluate(() => window.__AH.key('KeyW', false));
  check('player moves with WASD', movedOk);

  // ---- jump ----
  await page.evaluate(() => window.__AH.key('Space', true));
  const jumpOk = await page.waitForFunction(
    () => window.__AH.state().playerPos.y > 0.6,
    null, { timeout: 6000 }
  ).then(() => true).catch(() => false);
  await page.evaluate(() => window.__AH.key('Space', false));
  check('player jumps', jumpOk);

  // ---- combat: keep aiming at nearest enemy and fire until something is hit ----
  await page.evaluate(() => {
    const AH = window.__AH;
    AH.god(true);
    AH.fire(true);
    window.__aimLoop = setInterval(() => {
      if (!AH.enemies.length) return;
      let best = null, bd = 1e9;
      for (const e of AH.enemies) {
        const d = e.mesh.position.distanceTo(AH.player.pos);
        if (d < bd) { bd = d; best = e; }
      }
      const e = best.mesh.position, p = AH.player.pos;
      AH.aim(Math.atan2(-(e.x - p.x), -(e.z - p.z)), 0.15);
    }, 100);
  });
  const hitOk = await page.waitForFunction(
    () => { const s = window.__AH.state(); return s.score > 0 || s.kills > 0; },
    null, { timeout: 15000 }
  ).then(() => true).catch(() => false);
  st = await page.evaluate(() => window.__AH.state());
  await page.screenshot({ path: path.join(shotsDir, '03-combat.png') });
  await page.evaluate(() => { window.__AH.fire(false); clearInterval(window.__aimLoop); });
  check('pens damage enemies', hitOk, `score=${st.score} kills=${st.kills}`);

  // ---- tempo ----
  await page.evaluate(() => window.__AH.key('KeyQ', true));
  await page.waitForTimeout(700);
  st = await page.evaluate(() => window.__AH.state());
  check('tempo drains while active', st.tempo < 99, `tempo=${st.tempo.toFixed(0)}`);
  await page.screenshot({ path: path.join(shotsDir, '04-tempo.png') });
  await page.evaluate(() => window.__AH.key('KeyQ', false));

  // ---- damage & shield ----
  await page.evaluate(() => { window.__AH.god(false); window.__AH.hurt(25); });
  st = await page.evaluate(() => window.__AH.state());
  check('player takes damage', st.hp <= 75, `hp=${st.hp}`);

  // ---- melee ----
  await page.evaluate(() => {
    const AH = window.__AH;
    AH.god(true);
    AH.spawn('walker', AH.player.pos.x + 1.5, AH.player.pos.z);
  });
  const killsBefore = (await page.evaluate(() => window.__AH.state())).kills;
  await page.evaluate(() => { window.__AH.melee(); });
  await page.waitForTimeout(300);
  const walkerHp = await page.evaluate(() => {
    const w = window.__AH.enemies.filter((e) => e.kind === 'walker').pop();
    return w ? w.hp : -1;
  });
  check('melee damages nearby enemy', walkerHp === -1 || walkerHp < 45, `walker hp=${walkerHp}`);

  // ---- wave clear progression (organic path: clear → 3.2s break → next wave) ----
  const waveBefore = (await page.evaluate(() => window.__AH.state())).wave;
  await page.evaluate(() => window.__AH.clearWave());
  const nextWaveOk = await page.waitForFunction(
    (w) => { const s = window.__AH.state(); return s.wave > w && (s.enemies + s.queued) > 0; },
    waveBefore, { timeout: 25000 }
  ).then(() => true).catch(() => false);
  st = await page.evaluate(() => window.__AH.state());
  check('next wave starts after clear', nextWaveOk, `wave=${st.wave} enemies=${st.enemies} queued=${st.queued}`);

  // ---- boss ----
  await page.evaluate(() => window.__AH.skipToBoss());
  await page.waitForTimeout(1500);
  st = await page.evaluate(() => window.__AH.state());
  check('boss spawns on final wave', st.boss !== null, JSON.stringify(st.boss));
  await page.screenshot({ path: path.join(shotsDir, '05-boss.png') });

  // boss fires hazards eventually (radial burst every ~3.2 game-seconds)
  const bossAtkOk = await page.waitForFunction(
    () => { const s = window.__AH.state(); return s.hazards > 0; },
    null, { timeout: 25000 }
  ).then(() => true).catch(() => false);
  st = await page.evaluate(() => window.__AH.state());
  check('boss attacks with projectiles', bossAtkOk, `hazards=${st.hazards} enemies=${st.enemies}`);

  // phase 2
  await page.evaluate(() => window.__AH.damageBoss(700));
  st = await page.evaluate(() => window.__AH.state());
  check('boss enters phase 2 below 50%', st.boss && st.boss.phase === 2, JSON.stringify(st.boss));

  // ---- victory ----
  await page.evaluate(() => { window.__AH.damageBoss(9999); window.__AH.killAll(); });
  await page.waitForTimeout(800);
  st = await page.evaluate(() => window.__AH.state());
  check('victory after boss dies', st.mode === 'victory', `mode=${st.mode}`);
  await page.screenshot({ path: path.join(shotsDir, '06-victory.png') });

  // ---- game over path ----
  await page.evaluate(() => document.getElementById('btn-restart-v').click());
  await page.waitForTimeout(600);
  await page.evaluate(() => { window.__AH.god(false); window.__AH.hurt(9999); });
  await page.waitForTimeout(400);
  st = await page.evaluate(() => window.__AH.state());
  check('game over when hp reaches 0', st.mode === 'gameover', `mode=${st.mode}`);
  await page.screenshot({ path: path.join(shotsDir, '07-gameover.png') });

  // ---- retry from game over ----
  await page.evaluate(() => document.getElementById('btn-retry').click());
  await page.waitForTimeout(800);
  st = await page.evaluate(() => window.__AH.state());
  check('retry restarts cleanly', st.mode === 'playing' && st.hp === 100 && st.wave === 1, `mode=${st.mode} hp=${st.hp} wave=${st.wave}`);

  // ---- perf sanity ----
  const perf = await page.evaluate(() => new Promise((res) => {
    let frames = 0; const t0 = performance.now();
    const tick = () => { frames++; if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else res({ fps: frames / 2, calls: window.__AH.state().drawCalls, tris: window.__AH.state().triangles }); };
    requestAnimationFrame(tick);
  }));
  check('renders at a sane frame rate (headless swiftshader is ~10x slower than a real GPU)', perf.fps > 4, `fps=${perf.fps.toFixed(0)} drawCalls=${perf.calls} tris=${perf.tris}`);

  check('no JS errors during entire run', errors.length === 0, errors.slice(0, 5).join(' | '));

  await browser.close();
  server.close();
  console.log(`\n${failures === 0 ? 'ALL TESTS PASSED' : failures + ' FAILURE(S)'}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('RUNNER CRASH:', e); process.exit(1); });
