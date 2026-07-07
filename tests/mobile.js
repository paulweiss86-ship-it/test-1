/* Mobile end-to-end test: emulates a phone (touch, small viewport, high DPR)
   and — critically — a blocked-storage environment like a sandboxed iframe or
   iOS Safari with cross-site tracking prevention, where localStorage access throws.
   Usage: node tests/mobile.js */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..');
const shotsDir = path.join(__dirname, 'shots');
fs.mkdirSync(shotsDir, { recursive: true });

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

let failures = 0;
function check(name, cond, extra) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
  if (!cond) failures++;
}

async function runScenario(browser, url, { blockStorage, label }) {
  console.log(`\n--- scenario: ${label} ---`);
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon/i.test(m.text())) errors.push(m.text()); });

  if (blockStorage) {
    // simulate sandboxed-iframe / ITP storage: any access throws SecurityError
    await page.addInitScript(() => {
      const deny = () => { throw new DOMException('The operation is insecure.', 'SecurityError'); };
      Object.defineProperty(window, 'localStorage', { get: deny });
      Object.defineProperty(window, 'sessionStorage', { get: deny });
    });
  }

  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(1500);

  check(`[${label}] page boots without errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  check(`[${label}] game hooks exist (script survived init)`, await page.evaluate(() => !!window.__AH));
  check(`[${label}] touch mode detected`, await page.evaluate(() => document.body.classList.contains('touch')));

  // keep headless CPU rendering fast enough to actually simulate
  await page.evaluate(() => window.__AH && window.__AH.setFx({ bloom: false, rain: false })).catch(() => {});

  // tap Clock In like a phone would
  await page.tap('#btn-start');
  const started = await page.waitForFunction(
    () => window.__AH && window.__AH.state().mode === 'playing',
    null, { timeout: 8000 }
  ).then(() => true).catch(() => false);
  check(`[${label}] tapping Clock In starts the game`, started,
    'mode=' + await page.evaluate(() => window.__AH ? window.__AH.state().mode : 'no-hooks'));

  const hudOn = await page.evaluate(() => document.getElementById('hud').classList.contains('on'));
  check(`[${label}] HUD appears`, hudOn);
  const touchUiVisible = await page.evaluate(() => {
    const el = document.getElementById('touch');
    return getComputedStyle(el).display !== 'none';
  });
  check(`[${label}] touch controls visible`, touchUiVisible);

  // virtual joystick: touch the stick and drag — player should move
  const p0 = await page.evaluate(() => window.__AH.state().playerPos);
  const stick = await page.locator('#stick').boundingBox();
  const cx = stick.x + stick.width / 2, cy = stick.y + stick.height / 2;
  await page.touchscreen.tap(cx, cy); // ensure element is warm
  // manual drag via CDP-backed touchscreen: press, move, hold
  await page.evaluate(async () => {
    const stickEl = document.getElementById('stick');
    const r = stickEl.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const mkTouch = (x, y, id) => new Touch({ identifier: id, target: stickEl, clientX: x, clientY: y });
    const fire = (type, x, y) => stickEl.dispatchEvent(new TouchEvent(type, {
      touches: type === 'touchend' ? [] : [mkTouch(x, y, 1)],
      changedTouches: [mkTouch(x, y, 1)],
      bubbles: true, cancelable: true,
    }));
    fire('touchstart', cx, cy);
    fire('touchmove', cx, cy - 44);
    await new Promise((r2) => setTimeout(r2, 2500));
    fire('touchend', cx, cy - 44);
  });
  const p1 = await page.evaluate(() => window.__AH.state().playerPos);
  const moved = Math.hypot(p1.x - p0.x, p1.z - p0.z);
  check(`[${label}] virtual joystick moves the player`, moved > 0.7, `moved ${moved.toFixed(2)}m`);

  // fire button deals damage eventually (spawn a target ring around the player)
  await page.evaluate(() => {
    const AH = window.__AH;
    AH.god(true);
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2;
      AH.spawn('walker', AH.player.pos.x + Math.cos(a) * 5, AH.player.pos.z + Math.sin(a) * 5);
    }
  });
  await page.evaluate(() => {
    const btn = document.getElementById('tb-fire');
    btn.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true }));
  });
  const hitOk = await page.waitForFunction(
    () => window.__AH.state().kills > 0 || window.__AH.state().score > 0,
    null, { timeout: 20000 }
  ).then(() => true).catch(() => false);
  check(`[${label}] fire button attacks`, hitOk);
  await page.evaluate(() => {
    document.getElementById('tb-fire').dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true }));
  });

  await page.screenshot({ path: path.join(shotsDir, `mobile-${blockStorage ? 'blocked' : 'plain'}.png`) });
  check(`[${label}] no errors during play`, errors.length === 0, errors.slice(0, 4).join(' | '));

  await ctx.close();
}

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
  });

  await runScenario(browser, url, { blockStorage: false, label: 'mobile' });
  await runScenario(browser, url, { blockStorage: true, label: 'mobile+blocked-storage' });

  await browser.close();
  server.close();
  console.log(`\n${failures === 0 ? 'ALL MOBILE TESTS PASSED' : failures + ' FAILURE(S)'}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('RUNNER CRASH:', e); process.exit(1); });
