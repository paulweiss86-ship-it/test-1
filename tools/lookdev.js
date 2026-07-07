/* Look-dev screenshot tool: poses the camera around the hero / enemies and captures
   close-ups so character & lighting can be reviewed without playing.
   Usage: node tools/lookdev.js */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'tests', 'shots');
fs.mkdirSync(OUT, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript' };
const server = http.createServer((req, res) => {
  let p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (p.endsWith('/')) p += 'index.html';
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  });
});

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.error('PAGEERROR:', String(e)));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(1000);

  // freeze into a controlled scene: start game, remove enemies, park everything
  await page.evaluate(() => {
    const AH = window.__AH;
    AH.start();
    AH.god(true);
    AH.game.spawnQueue.length = 0;
    AH.killAll();
    AH.game.betweenT = 1e9; // hold wave director
    document.getElementById('hud').classList.remove('on');
  });
  await page.waitForTimeout(600);

  const shot = async (name, setup) => {
    await page.evaluate(setup);
    // one manual render with the posed camera (loop keeps rendering; camera set each eval)
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(OUT, name) });
    console.log('captured', name);
  };

  // Hero front 3/4 close-up. The game loop overrides the camera each frame via
  // updateCamera(), so instead pose the PLAYER and set camYaw so the follow cam
  // lands where we want; for true close-ups we pause the game (mode swap) and
  // drive the camera directly.
  await page.evaluate(() => {
    const AH = window.__AH;
    AH.game.mode = 'lookdev'; // any value !== 'playing' stops sim; !== 'title' skips orbit
    document.getElementById('pause').classList.add('hidden');
  });

  await shot('ld-hero-front.png', () => {
    const AH = window.__AH;
    const h = AH.heroRig.root.position;
    AH.heroRig.root.rotation.y = 0; // face +Z
    AH.camera.position.set(h.x + 1.3, 1.7, h.z + 2.6);
    AH.camera.lookAt(h.x, 1.25, h.z);
    AH.camera.fov = 40; AH.camera.updateProjectionMatrix();
  });

  await shot('ld-hero-face.png', () => {
    const AH = window.__AH;
    const h = AH.heroRig.root.position;
    AH.camera.position.set(h.x + 0.5, 1.95, h.z + 1.1);
    AH.camera.lookAt(h.x, 1.8, h.z);
    AH.camera.fov = 32; AH.camera.updateProjectionMatrix();
  });

  await shot('ld-hero-back.png', () => {
    const AH = window.__AH;
    const h = AH.heroRig.root.position;
    AH.camera.position.set(h.x - 1.2, 1.9, h.z - 2.4);
    AH.camera.lookAt(h.x, 1.2, h.z);
    AH.camera.fov = 40; AH.camera.updateProjectionMatrix();
  });

  // enemy lineup
  await shot('ld-enemies.png', () => {
    const AH = window.__AH;
    AH.spawn('drone', -4, -6); AH.enemies[AH.enemies.length - 1].mesh.position.set(-4, 2.4, -6);
    AH.spawn('walker', 0, -6);
    AH.spawn('copier', 4, -6);
    AH.camera.position.set(0, 2.6, 1.5);
    AH.camera.lookAt(0, 1.4, -6);
    AH.camera.fov = 55; AH.camera.updateProjectionMatrix();
  });

  // boss close-up
  await shot('ld-boss.png', () => {
    const AH = window.__AH;
    AH.spawn('boss', 0, -14);
    const b = AH.enemies.find((e) => e.kind === 'boss');
    b.mesh.position.set(0, 5.4, -14);
    b.mesh.lookAt(0, 5.4, 20);
    AH.camera.position.set(3.5, 5.2, -4);
    AH.camera.lookAt(0, 5.2, -14);
    AH.camera.fov = 55; AH.camera.updateProjectionMatrix();
  });

  // wide environment establishing shot
  await shot('ld-env.png', () => {
    const AH = window.__AH;
    AH.camera.position.set(24, 9, 24);
    AH.camera.lookAt(0, 3, 0);
    AH.camera.fov = 60; AH.camera.updateProjectionMatrix();
  });

  await browser.close();
  server.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
