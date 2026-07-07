/* ============================================================================
   AFTER HOURS — Paul Weiss vs. The Deadline
   A self-contained Three.js third-person arena action game.
   ============================================================================ */
(function () {
  'use strict';

  // ---------------------------------------------------------------- utils --
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const randi = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();

  const $ = (id) => document.getElementById(id);

  // --------------------------------------------------------------- config --
  const CFG = {
    arenaR: 56,
    player: {
      hp: 100, speed: 10.5, accel: 60, friction: 8, jumpV: 9.0, gravity: 26,
      dashV: 27, dashT: 0.22, dashCd: 1.5, penCd: 0.21, penDmg: 12, penSpeed: 58,
      meleeDmg: 30, meleeCd: 0.8, meleeR: 3.0, regenDelay: 5, regenRate: 4,
    },
    tempo: { scale: 0.22, playerScale: 0.62, drain: 34, regen: 16, min: 15 },
    waves: [
      { drones: 6, walkers: 0, copiers: 0 },
      { drones: 6, walkers: 4, copiers: 0 },
      { drones: 8, walkers: 5, copiers: 2 },
      { drones: 10, walkers: 7, copiers: 4 },
      { boss: true, drones: 2, walkers: 2, copiers: 0 },
    ],
  };

  // ================================================================ AUDIO ==
  const Audio = (() => {
    let ctx = null, master, sfxGain, musGain, musFilter, muted = false, started = false;
    let step = 0, nextT = 0, timer = null;
    const BPM = 100, SPB = 60 / BPM / 4; // 16th note

    // A minor synthwave: Am | F | C | G
    const CHORDS = [
      [57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62],
    ];
    const BASS = [33, 29, 24, 31];
    const f = (m) => 440 * Math.pow(2, (m - 69) / 12);

    function init() {
      if (ctx) return;
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
      master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination);
      sfxGain = ctx.createGain(); sfxGain.gain.value = 0.9; sfxGain.connect(master);
      musFilter = ctx.createBiquadFilter(); musFilter.type = 'lowpass'; musFilter.frequency.value = 9000;
      musGain = ctx.createGain(); musGain.gain.value = 0.5;
      musGain.connect(musFilter); musFilter.connect(master);
    }
    function startMusic() {
      init(); if (!ctx || started) return; started = true;
      if (ctx.state === 'suspended') ctx.resume();
      nextT = ctx.currentTime + 0.06;
      timer = setInterval(schedule, 25);
    }
    function schedule() {
      if (!ctx) return;
      while (nextT < ctx.currentTime + 0.14) { playStep(step, nextT); step = (step + 1) % 64; nextT += SPB; }
    }
    function env(g, t, a, peak, d) {
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    }
    function osc(type, freq, t, dur, peak, dest, detune) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = freq; if (detune) o.detune.value = detune;
      env(g, t, 0.01, peak, dur);
      o.connect(g); g.connect(dest || musGain); o.start(t); o.stop(t + dur + 0.1);
    }
    function noise(t, dur, peak, freq, type, dest) {
      const len = Math.max(1, (dur + 0.05) * ctx.sampleRate) | 0;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource(); src.buffer = buf;
      const fl = ctx.createBiquadFilter(); fl.type = type || 'highpass'; fl.frequency.value = freq || 6000;
      const g = ctx.createGain(); env(g, t, 0.005, peak, dur);
      src.connect(fl); fl.connect(g); g.connect(dest || musGain); src.start(t); src.stop(t + dur + 0.1);
    }
    function playStep(s, t) {
      const bar = (s >> 4) % 4, inBar = s % 16;
      // kick on beats
      if (inBar % 4 === 0) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.1);
        env(g, t, 0.004, 0.5, 0.14); o.connect(g); g.connect(musGain); o.start(t); o.stop(t + 0.3);
      }
      // hat on off-8ths
      if (inBar % 2 === 1) noise(t, 0.03, 0.06, 9000, 'highpass');
      // bass pulse 8ths
      if (inBar % 2 === 0) osc('triangle', f(BASS[bar]), t, 0.16, 0.24);
      // arp 16ths
      const ch = CHORDS[bar];
      osc('sawtooth', f(ch[s % 3] + 12), t, 0.07, 0.035);
      // pad at bar start
      if (inBar === 0) for (const n of ch) {
        osc('sawtooth', f(n), t, SPB * 16, 0.028, musGain, -6);
        osc('sawtooth', f(n), t, SPB * 16, 0.028, musGain, 6);
      }
    }
    // ---- SFX ----
    const sfx = {
      pen() { if (!ctx) return; const t = ctx.currentTime;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'square'; o.frequency.setValueAtTime(1400, t); o.frequency.exponentialRampToValueAtTime(300, t + 0.09);
        env(g, t, 0.004, 0.16, 0.09); o.connect(g); g.connect(sfxGain); o.start(t); o.stop(t + 0.15); },
      hit() { if (!ctx) return; noise(ctx.currentTime, 0.05, 0.2, 2500, 'bandpass', sfxGain); },
      die() { if (!ctx) return; const t = ctx.currentTime; noise(t, 0.3, 0.35, 700, 'lowpass', sfxGain);
        const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(300, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.25);
        env(g, t, 0.005, 0.25, 0.25); o.connect(g); g.connect(sfxGain); o.start(t); o.stop(t + 0.4); },
      hurt() { if (!ctx) return; const t = ctx.currentTime;
        const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.18);
        env(g, t, 0.005, 0.3, 0.2); o.connect(g); g.connect(sfxGain); o.start(t); o.stop(t + 0.3); },
      dash() { if (!ctx) return; noise(ctx.currentTime, 0.18, 0.16, 1200, 'bandpass', sfxGain); },
      melee() { if (!ctx) return; const t = ctx.currentTime; noise(t, 0.12, 0.22, 500, 'bandpass', sfxGain);
        osc('triangle', 90, t, 0.15, 0.25, sfxGain); },
      pickup() { if (!ctx) return; const t = ctx.currentTime;
        osc('sine', 880, t, 0.1, 0.2, sfxGain); osc('sine', 1320, t + 0.08, 0.14, 0.2, sfxGain); },
      tempoIn() { if (!ctx) return; const t = ctx.currentTime; const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.setValueAtTime(900, t); o.frequency.exponentialRampToValueAtTime(180, t + 0.3);
        env(g, t, 0.01, 0.18, 0.32); o.connect(g); g.connect(sfxGain); o.start(t); o.stop(t + 0.5);
        if (musFilter) musFilter.frequency.linearRampToValueAtTime(420, t + 0.25); },
      tempoOut() { if (!ctx) return; const t = ctx.currentTime; const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(900, t + 0.2);
        env(g, t, 0.01, 0.14, 0.22); o.connect(g); g.connect(sfxGain); o.start(t); o.stop(t + 0.4);
        if (musFilter) musFilter.frequency.linearRampToValueAtTime(9000, t + 0.25); },
      alarm() { if (!ctx) return; const t = ctx.currentTime;
        for (let i = 0; i < 4; i++) { osc('square', i % 2 ? 622 : 466, t + i * 0.22, 0.18, 0.16, sfxGain); } },
      fanfare() { if (!ctx) return; const t = ctx.currentTime;
        [60, 64, 67, 72].forEach((n, i) => osc('triangle', f(n), t + i * 0.13, 0.5, 0.22, sfxGain)); },
      wave() { if (!ctx) return; const t = ctx.currentTime;
        osc('triangle', 523, t, 0.2, 0.16, sfxGain); osc('triangle', 784, t + 0.14, 0.3, 0.16, sfxGain); },
    };
    function toggleMute() { init(); muted = !muted; if (master) master.gain.value = muted ? 0 : 0.55; return muted; }
    return { init, startMusic, sfx, toggleMute, get ctx() { return ctx; } };
  })();

  // ============================================================= RENDERER ==
  const canvas = $('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070f);
  scene.fog = new THREE.FogExp2(0x0a0e1c, 0.011);

  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 600);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // --------------------------------------------------------------- lights --
  scene.add(new THREE.HemisphereLight(0x2c3a5c, 0x07080e, 0.55));
  const moon = new THREE.DirectionalLight(0xbdd4ff, 1.2);
  moon.position.set(-40, 70, -30);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.left = -70; moon.shadow.camera.right = 70;
  moon.shadow.camera.top = 70; moon.shadow.camera.bottom = -70;
  moon.shadow.camera.far = 200; moon.shadow.bias = -0.0006;
  scene.add(moon);
  const warm = new THREE.PointLight(0xffa94d, 0.7, 90, 1.8); warm.position.set(18, 12, -14); scene.add(warm);
  const cool = new THREE.PointLight(0x4db8ff, 0.8, 100, 1.8); cool.position.set(-20, 14, 16); scene.add(cool);

  // ---------------------------------------------------------- tex helpers --
  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
    return t;
  }
  function windowsTex(seed) {
    return canvasTex(128, 256, (g, w, h) => {
      g.fillStyle = '#0b1020'; g.fillRect(0, 0, w, h);
      const cols = 6, rows = 16, cw = w / cols, ch = h / rows;
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const lit = Math.random() < 0.34;
        g.fillStyle = lit ? pick(['#ffd98a', '#cfe4ff', '#9adcff', '#ffe9c9']) : '#141b30';
        g.globalAlpha = lit ? rand(0.75, 1) : 1;
        g.fillRect(x * cw + 2.5, y * ch + 3, cw - 5, ch - 6);
      }
      g.globalAlpha = 1;
    });
  }
  function signTex(text, color, bg) {
    return canvasTex(512, 128, (g, w, h) => {
      g.fillStyle = bg || '#0a0f1e'; g.fillRect(0, 0, w, h);
      g.font = '700 54px "Segoe UI", Arial, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = color; g.shadowBlur = 26;
      g.fillStyle = color; g.fillText(text, w / 2, h / 2 + 2);
      g.shadowBlur = 0;
      g.strokeStyle = color; g.globalAlpha = 0.65; g.lineWidth = 5;
      g.strokeRect(8, 8, w - 16, h - 16); g.globalAlpha = 1;
    });
  }
  function groundTex() {
    return canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#141824'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2600; i++) {
        g.fillStyle = `rgba(${randi(18, 42)},${randi(22, 48)},${randi(34, 66)},${rand(0.15, 0.5)})`;
        g.fillRect(rand(0, w), rand(0, h), rand(1, 3), rand(1, 3));
      }
      g.strokeStyle = 'rgba(90,110,150,0.10)'; g.lineWidth = 2;
      const step = w / 4;
      for (let i = 0; i <= 4; i++) {
        g.beginPath(); g.moveTo(i * step, 0); g.lineTo(i * step, h); g.stroke();
        g.beginPath(); g.moveTo(0, i * step); g.lineTo(w, i * step); g.stroke();
      }
    });
  }
  function clockFaceTex() {
    return canvasTex(512, 512, (g, w, h) => {
      const cx = w / 2, cy = h / 2, R = w / 2 - 8;
      g.fillStyle = '#12070a'; g.fillRect(0, 0, w, h);
      const grad = g.createRadialGradient(cx, cy, 30, cx, cy, R);
      grad.addColorStop(0, '#2a0e14'); grad.addColorStop(1, '#0d0507');
      g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fillStyle = grad; g.fill();
      g.lineWidth = 10; g.strokeStyle = '#ff3d55'; g.shadowColor = '#ff3d55'; g.shadowBlur = 24; g.stroke();
      g.shadowBlur = 0;
      for (let i = 0; i < 60; i++) {
        const a = i / 60 * TAU, big = i % 5 === 0;
        g.strokeStyle = big ? '#ff8095' : 'rgba(255,128,149,0.4)';
        g.lineWidth = big ? 7 : 3;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * (R - (big ? 34 : 22)), cy + Math.sin(a) * (R - (big ? 34 : 22)));
        g.lineTo(cx + Math.cos(a) * (R - 10), cy + Math.sin(a) * (R - 10));
        g.stroke();
      }
      g.fillStyle = '#ffb3c0'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '800 64px Georgia, serif';
      g.fillText('XII', cx, cy - R + 66);
      g.fillText('VI', cx, cy + R - 66);
      g.fillText('III', cx + R - 62, cy);
      g.fillText('IX', cx - R + 62, cy);
      g.font = '800 34px "Segoe UI", Arial'; g.fillStyle = '#ff3d55';
      g.shadowColor = '#ff3d55'; g.shadowBlur = 16;
      g.fillText('THE DEADLINE', cx, cy + 74); g.shadowBlur = 0;
    });
  }

  // ================================================================ WORLD ==
  const world = new THREE.Group(); scene.add(world);

  // ground
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(140, 64),
    new THREE.MeshStandardMaterial({ map: groundTex(), roughness: 0.92, metalness: 0.08, color: 0x6d789c })
  );
  ground.material.map.wrapS = ground.material.map.wrapT = THREE.RepeatWrapping;
  ground.material.map.repeat.set(18, 18);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  world.add(ground);

  // arena boundary ring
  const ringGeo = new THREE.TorusGeometry(CFG.arenaR + 1.2, 0.12, 8, 96);
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x4db8ff, transparent: true, opacity: 0.55 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.25; world.add(ring);
  const ring2 = ring.clone(); ring2.position.y = 1.1; ring2.material = ring.material.clone();
  ring2.material.opacity = 0.18; world.add(ring2);

  // buildings
  const buildingMats = [];
  for (let i = 0; i < 6; i++) {
    buildingMats.push(new THREE.MeshStandardMaterial({
      color: 0x2a3350, roughness: 0.65, metalness: 0.35,
      emissive: 0xffffff, emissiveMap: windowsTex(i), emissiveIntensity: 0.85,
      map: null,
    }));
  }
  const buildingGeo = new THREE.BoxGeometry(1, 1, 1);
  for (let i = 0; i < 42; i++) {
    const a = (i / 42) * TAU + rand(-0.05, 0.05);
    const r = rand(CFG.arenaR + 16, CFG.arenaR + 62);
    const wdt = rand(9, 20), dep = rand(9, 20), hgt = rand(18, 78);
    const m = new THREE.Mesh(buildingGeo, pick(buildingMats));
    m.scale.set(wdt, hgt, dep);
    m.position.set(Math.cos(a) * r, hgt / 2 - 0.1, Math.sin(a) * r);
    m.rotation.y = -a + rand(-0.3, 0.3);
    world.add(m);
  }
  // second, farther silhouette row
  const farMat = new THREE.MeshBasicMaterial({ color: 0x0c1226 });
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * TAU + rand(-0.1, 0.1);
    const r = rand(CFG.arenaR + 80, CFG.arenaR + 130);
    const m = new THREE.Mesh(buildingGeo, farMat);
    m.scale.set(rand(14, 30), rand(40, 110), rand(14, 30));
    m.position.set(Math.cos(a) * r, m.scale.y / 2, Math.sin(a) * r);
    world.add(m);
  }

  // neon signs mounted on inner buildings
  const SIGNS = [
    ['WEISS & PARTNERS', '#4db8ff'],
    ["CAFÉ '86", '#ffb45d'],
    ['PW CONSULTING', '#7ff0b8'],
    ['MIDNIGHT MARKET', '#ff5d9e'],
    ['TURTLENECK & CO.', '#b48dff'],
    ['GRAND HOTEL PAUL', '#ffd98a'],
  ];
  SIGNS.forEach((s, i) => {
    const a = (i / SIGNS.length) * TAU + 0.35;
    const r = CFG.arenaR + 13.5;
    const tex = signTex(s[0], s[1]);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 4),
      new THREE.MeshBasicMaterial({ map: tex, transparent: false })
    );
    m.position.set(Math.cos(a) * r, rand(10, 22), Math.sin(a) * r);
    m.lookAt(0, m.position.y, 0);
    world.add(m);
  });

  // street lamps
  const lampPole = new THREE.CylinderGeometry(0.09, 0.13, 5.4, 6);
  const lampMatP = new THREE.MeshStandardMaterial({ color: 0x3c455e, roughness: 0.55, metalness: 0.5 });
  const bulbGeo = new THREE.SphereGeometry(0.28, 10, 8);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe2a8 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.2, r = CFG.arenaR * 0.66;
    const g = new THREE.Group();
    const pole = new THREE.Mesh(lampPole, lampMatP); pole.position.y = 2.7; g.add(pole);
    const bulb = new THREE.Mesh(bulbGeo, bulbMat); bulb.position.y = 5.5; g.add(bulb);
    if (i % 2 === 0) { const pl = new THREE.PointLight(0xffd9a0, 0.55, 22, 1.6); pl.position.y = 5.4; g.add(pl); }
    g.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    world.add(g);
  }

  // planters (decor)
  const planterGeo = new THREE.CylinderGeometry(1.3, 1.5, 0.9, 8);
  const planterMat = new THREE.MeshStandardMaterial({ color: 0x1d2436, roughness: 0.85 });
  const bushGeo = new THREE.SphereGeometry(1.1, 10, 8);
  const bushMat = new THREE.MeshStandardMaterial({ color: 0x14351f, roughness: 1 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU, r = CFG.arenaR * 0.42;
    const p = new THREE.Mesh(planterGeo, planterMat); p.position.set(Math.cos(a) * r, 0.45, Math.sin(a) * r);
    const b = new THREE.Mesh(bushGeo, bushMat); b.position.set(p.position.x, 1.35, p.position.z); b.scale.y = 0.75;
    p.castShadow = b.castShadow = true;
    world.add(p); world.add(b);
  }

  // stars
  {
    const n = 700, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), ph = rand(0.06, 1.2), r = 420;
      pos[i * 3] = Math.cos(a) * Math.cos(ph) * r;
      pos[i * 3 + 1] = Math.sin(ph) * r * 0.7 + 30;
      pos[i * 3 + 2] = Math.sin(a) * Math.cos(ph) * r;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xcfe0ff, size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0.8 })));
  }
  // moon disc
  {
    const t = canvasTex(128, 128, (g, w, h) => {
      const gr = g.createRadialGradient(64, 64, 8, 64, 64, 64);
      gr.addColorStop(0, 'rgba(235,244,255,1)'); gr.addColorStop(0.35, 'rgba(210,228,255,0.9)'); gr.addColorStop(1, 'rgba(210,228,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
    sp.position.set(-160, 210, -140); sp.scale.set(60, 60, 1); scene.add(sp);
  }
  // drifting dust motes
  const motes = (() => {
    const n = 260, pos = new Float32Array(n * 3), vel = [];
    for (let i = 0; i < n; i++) {
      pos[i * 3] = rand(-70, 70); pos[i * 3 + 1] = rand(0.4, 16); pos[i * 3 + 2] = rand(-70, 70);
      vel.push(V3(rand(-0.3, 0.3), rand(0.05, 0.3), rand(-0.3, 0.3)));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({
      color: 0x86b8ff, size: 0.14, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    scene.add(p);
    return { p, pos, vel, n, update(dt) {
      for (let i = 0; i < n; i++) {
        pos[i * 3] += vel[i].x * dt; pos[i * 3 + 1] += vel[i].y * dt; pos[i * 3 + 2] += vel[i].z * dt;
        if (pos[i * 3 + 1] > 17) pos[i * 3 + 1] = 0.3;
        if (Math.abs(pos[i * 3]) > 72) pos[i * 3] *= -0.98;
        if (Math.abs(pos[i * 3 + 2]) > 72) pos[i * 3 + 2] *= -0.98;
      }
      g.attributes.position.needsUpdate = true;
    } };
  })();

  // ================================================================= HERO ==
  const MAT = {
    blazer: new THREE.MeshStandardMaterial({ color: 0x0b1f42, roughness: 0.55, metalness: 0.2 }),
    turtleneck: new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.9 }),
  };
  MAT.denim = new THREE.MeshStandardMaterial({ color: 0x141c2c, roughness: 0.85 });
  MAT.skin = new THREE.MeshStandardMaterial({ color: 0xd99f78, roughness: 0.6, emissive: 0x452818, emissiveIntensity: 0.45 });
  MAT.hair = new THREE.MeshStandardMaterial({ color: 0x3d2d1e, roughness: 0.9 });
  MAT.beard = new THREE.MeshStandardMaterial({ color: 0x4a3826, roughness: 0.95 });
  MAT.shoe = new THREE.MeshStandardMaterial({ color: 0x17130f, roughness: 0.4, metalness: 0.1 });
  MAT.silver = new THREE.MeshStandardMaterial({ color: 0xcfd6e0, roughness: 0.25, metalness: 0.9 });
  MAT.watchface = new THREE.MeshBasicMaterial({ color: 0x9fdcff });
  MAT.case = new THREE.MeshStandardMaterial({ color: 0x241a12, roughness: 0.5, metalness: 0.2 });

  function buildHero() {
    const root = new THREE.Group();
    const body = new THREE.Group(); root.add(body);

    // legs
    const mkLeg = (side) => {
      const hip = new THREE.Group(); hip.position.set(0.13 * side, 0.92, 0);
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.45, 0.19), MAT.denim);
      upper.position.y = -0.22; hip.add(upper);
      const knee = new THREE.Group(); knee.position.y = -0.45; hip.add(knee);
      const lower = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.42, 0.17), MAT.denim);
      lower.position.y = -0.2; knee.add(lower);
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.3), MAT.shoe);
      shoe.position.set(0, -0.44, 0.05); knee.add(shoe);
      upper.castShadow = lower.castShadow = true;
      body.add(hip); return { hip, knee };
    };
    const legL = mkLeg(-1), legR = mkLeg(1);

    // torso: black turtleneck core
    const chest = new THREE.Group(); chest.position.y = 1.28; body.add(chest);
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.62, 0.24), MAT.turtleneck);
    core.position.y = 0; core.castShadow = true; chest.add(core);
    // blazer: two front panels + back panel + shoulders, leaving the black center visible
    const panelL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.3), MAT.blazer);
    panelL.position.set(-0.16, -0.01, 0.01); panelL.rotation.y = 0.09; panelL.castShadow = true; chest.add(panelL);
    const panelR = panelL.clone(); panelR.position.x = 0.16; panelR.rotation.y = -0.09; chest.add(panelR);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.6, 0.1), MAT.blazer);
    back.position.set(0, -0.01, -0.12); back.castShadow = true; chest.add(back);
    const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.12, 0.3), MAT.blazer);
    shoulders.position.y = 0.3; shoulders.castShadow = true; chest.add(shoulders);
    // lapels: two thin slanted strips
    const lapelGeo = new THREE.BoxGeometry(0.07, 0.3, 0.02);
    const lapL = new THREE.Mesh(lapelGeo, MAT.blazer);
    lapL.position.set(-0.09, 0.14, 0.145); lapL.rotation.z = 0.35; chest.add(lapL);
    const lapR = lapL.clone(); lapR.position.x = 0.09; lapR.rotation.z = -0.35; chest.add(lapR);
    // belt
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.07, 0.22), MAT.shoe);
    belt.position.y = 0.98; body.add(belt);

    // arms
    const mkArm = (side) => {
      const shoulder = new THREE.Group(); shoulder.position.set(0.3 * side, 1.54, 0);
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.36, 0.15), MAT.blazer);
      upper.position.y = -0.18; upper.castShadow = true; shoulder.add(upper);
      const elbow = new THREE.Group(); elbow.position.y = -0.37; shoulder.add(elbow);
      const fore = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.3, 0.13), MAT.blazer);
      fore.position.y = -0.14; fore.castShadow = true; elbow.add(fore);
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.1), MAT.skin);
      hand.position.y = -0.35; elbow.add(hand);
      body.add(shoulder); return { shoulder, elbow, hand };
    };
    const armL = mkArm(-1), armR = mkArm(1);
    // the silver watch — left wrist
    const watch = new THREE.Group(); watch.position.y = -0.28; armL.elbow.add(watch);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 12), MAT.silver);
    watch.add(band);
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.055, 12), MAT.watchface);
    face.rotation.z = Math.PI / 2; face.position.x = -0.045; watch.add(face);

    // head
    const headG = new THREE.Group(); headG.position.y = 1.62; body.add(headG);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.14, 10), MAT.turtleneck);
    neck.position.y = 0.04; headG.add(neck);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.155, 20, 16), MAT.skin);
    head.position.y = 0.22; head.castShadow = true; headG.add(head);
    // hair — short crop, top/back, forehead exposed
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.162, 20, 12, 0, TAU, 0, Math.PI * 0.38), MAT.hair);
    hair.position.set(0, 0.235, -0.03); hair.scale.set(1, 0.95, 1.05); headG.add(hair);
    // beard — lower jaw only
    const beard = new THREE.Mesh(new THREE.SphereGeometry(0.157, 20, 12, 0, TAU, Math.PI * 0.70, Math.PI * 0.26), MAT.beard);
    beard.position.set(0, 0.228, 0.012); beard.scale.set(0.99, 1.05, 1); headG.add(beard);
    // eyes — flat dark insets on the head surface
    const eyeGeo = new THREE.BoxGeometry(0.034, 0.02, 0.012);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x0a1420 });
    const eL = new THREE.Mesh(eyeGeo, eyeMat); eL.position.set(-0.055, 0.25, 0.142); eL.rotation.y = -0.35; headG.add(eL);
    const eR = eL.clone(); eR.position.x = 0.055; eR.rotation.y = 0.35; headG.add(eR);
    // brows
    const browGeo = new THREE.BoxGeometry(0.05, 0.012, 0.01);
    const bL = new THREE.Mesh(browGeo, MAT.hair); bL.position.set(-0.055, 0.275, 0.14); headG.add(bL);
    const bR = bL.clone(); bR.position.x = 0.055; headG.add(bR);

    // briefcase (appears during melee)
    const briefcase = new THREE.Group();
    const bcBody = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.1), MAT.case);
    briefcase.add(bcBody);
    const bcHandle = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.018, 6, 12, Math.PI), MAT.silver);
    bcHandle.position.y = 0.16; briefcase.add(bcHandle);
    briefcase.visible = false;
    root.add(briefcase);

    root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return { root, body, chest, headG, legL, legR, armL, armR, briefcase, watchFace: face };
  }

  const heroRig = buildHero();
  scene.add(heroRig.root);

  // =============================================================== PLAYER ==
  const player = {
    pos: V3(0, 0, 6), vel: V3(0, 0, 0), yaw: 0, onGround: true,
    hp: CFG.player.hp, maxHp: CFG.player.hp, shield: 0,
    dashT: 0, dashCd: 0, penCd: 0, meleeCd: 0, meleeAnim: 0, throwAnim: 0,
    iframes: 0, sinceHurt: 99, walkPhase: 0, moving: false,
    boost: 0, // espresso timer
    facing: V3(0, 0, 1),
    alive: true,
  };

  // ================================================================ INPUT ==
  const keys = {};
  let mouseDown = false, rmbDown = false;
  let camYaw = 0, camPitch = 0.32;
  const IS_TOUCH = matchMedia('(pointer: coarse)').matches && 'ontouchstart' in window;
  if (IS_TOUCH) document.body.classList.add('touch');

  document.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys[e.code] = true;
    if (e.code === 'KeyM') Audio.toggleMute();
    if (e.code === 'KeyP' || (e.code === 'Escape' && game.mode === 'paused')) togglePause();
    if (e.code === 'KeyE') tryMelee();
    if (e.code === 'Space') e.preventDefault();
  });
  document.addEventListener('keyup', (e) => { keys[e.code] = false; });

  canvas.addEventListener('mousedown', (e) => {
    if (game.mode !== 'playing') return;
    if (e.button === 0) mouseDown = true;
    if (e.button === 2) rmbDown = true;
    if (!IS_TOUCH && document.pointerLockElement !== canvas) canvas.requestPointerLock();
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouseDown = false;
    if (e.button === 2) rmbDown = false;
  });
  window.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === canvas && game.mode === 'playing') {
      camYaw -= e.movementX * 0.0023;
      camPitch = clamp(camPitch + e.movementY * 0.0021, -0.25, 1.05);
    }
  });
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement !== canvas && game.mode === 'playing' && !IS_TOUCH) togglePause(true);
  });

  // touch controls
  const touchState = { mx: 0, mz: 0, fire: false, slow: false };
  (function initTouch() {
    if (!IS_TOUCH) return;
    const stick = $('stick'), nub = $('nub');
    let sid = null, sx = 0, sy = 0;
    stick.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0]; sid = t.identifier;
      const r = stick.getBoundingClientRect(); sx = r.left + r.width / 2; sy = r.top + r.height / 2;
    }, { passive: true });
    stick.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) if (t.identifier === sid) {
        const dx = clamp((t.clientX - sx) / 48, -1, 1), dy = clamp((t.clientY - sy) / 48, -1, 1);
        touchState.mx = dx; touchState.mz = dy;
        nub.style.transform = `translate(${dx * 30}px, ${dy * 30}px)`;
      }
    }, { passive: true });
    const end = (e) => {
      for (const t of e.changedTouches) if (t.identifier === sid) {
        sid = null; touchState.mx = touchState.mz = 0; nub.style.transform = '';
      }
    };
    stick.addEventListener('touchend', end); stick.addEventListener('touchcancel', end);
    // camera drag on right half
    let cid = null, cx0 = 0, cy0 = 0;
    document.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        if (t.clientX > innerWidth * 0.45 && !(e.target.closest && e.target.closest('.tbtn')) && cid === null) {
          cid = t.identifier; cx0 = t.clientX; cy0 = t.clientY;
        }
      }
    }, { passive: true });
    document.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) if (t.identifier === cid) {
        camYaw -= (t.clientX - cx0) * 0.006;
        camPitch = clamp(camPitch + (t.clientY - cy0) * 0.005, -0.25, 1.05);
        cx0 = t.clientX; cy0 = t.clientY;
      }
    }, { passive: true });
    document.addEventListener('touchend', (e) => {
      for (const t of e.changedTouches) if (t.identifier === cid) cid = null;
    });
    const bind = (id, down, up) => {
      const el = $(id);
      el.addEventListener('touchstart', (e) => { e.preventDefault(); down(); });
      el.addEventListener('touchend', (e) => { e.preventDefault(); up && up(); });
    };
    bind('tb-fire', () => { touchState.fire = true; }, () => { touchState.fire = false; });
    bind('tb-jump', () => { keys.Space = true; setTimeout(() => keys.Space = false, 80); });
    bind('tb-dash', () => { keys.ShiftLeft = true; setTimeout(() => keys.ShiftLeft = false, 80); });
    bind('tb-slow', () => { touchState.slow = true; }, () => { touchState.slow = false; });
  })();

  // ============================================================== ENTITIES ==
  const enemies = [];
  const pens = [];
  const hazards = []; // enemy projectiles
  const pickups = [];
  const bursts = []; // particle explosions
  const beams = [];  // spawn beams
  const popups = [];

  // ---- shared geo/mat ----
  const GEO = {
    penBody: new THREE.CylinderGeometry(0.035, 0.035, 0.5, 6),
    penTip: new THREE.ConeGeometry(0.035, 0.12, 6),
    droneBody: new THREE.SphereGeometry(0.55, 14, 10),
    rotor: new THREE.BoxGeometry(1.5, 0.03, 0.14),
    eye: new THREE.SphereGeometry(0.14, 8, 6),
    wadGeo: new THREE.IcosahedronGeometry(0.22, 0),
    shard: new THREE.BoxGeometry(0.3, 0.3, 0.9),
  };
  const M = {
    penBody: new THREE.MeshStandardMaterial({ color: 0x101418, roughness: 0.3, metalness: 0.4 }),
    penGold: new THREE.MeshStandardMaterial({ color: 0xe8c15a, roughness: 0.25, metalness: 0.85 }),
    droneDark: new THREE.MeshStandardMaterial({ color: 0x2c3140, roughness: 0.5, metalness: 0.6 }),
    redEye: new THREE.MeshBasicMaterial({ color: 0xff3d55 }),
    rotor: new THREE.MeshStandardMaterial({ color: 0x555b6e, roughness: 0.4, metalness: 0.6 }),
    botGrey: new THREE.MeshStandardMaterial({ color: 0x3a4257, roughness: 0.55, metalness: 0.5 }),
    tie: new THREE.MeshBasicMaterial({ color: 0xd8384e }),
    copier: new THREE.MeshStandardMaterial({ color: 0x8f97ab, roughness: 0.6, metalness: 0.25 }),
    paper: new THREE.MeshStandardMaterial({ color: 0xe8e6dc, roughness: 0.95 }),
    shardRed: new THREE.MeshBasicMaterial({ color: 0xff4560 }),
    espresso: new THREE.MeshStandardMaterial({ color: 0xf2ede2, roughness: 0.4 }),
    contract: new THREE.MeshStandardMaterial({ color: 0xf5f2e6, roughness: 0.8 }),
    goldSeal: new THREE.MeshBasicMaterial({ color: 0xe8c15a }),
  };

  // pen pool
  function makePen() {
    const g = new THREE.Group();
    const b = new THREE.Mesh(GEO.penBody, M.penBody); b.rotation.x = Math.PI / 2; g.add(b);
    const t = new THREE.Mesh(GEO.penTip, M.penGold); t.rotation.x = Math.PI / 2; t.position.z = 0.31; g.add(t);
    const clip = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.02, 0.16), M.penGold);
    clip.position.set(0.045, 0, -0.12); g.add(clip);
    const trail = new THREE.Mesh(
      new THREE.PlaneGeometry(0.09, 1.4),
      new THREE.MeshBasicMaterial({ color: 0x9fdcff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    );
    trail.position.z = -0.85; trail.rotation.x = 0; g.add(trail);
    g.visible = false; scene.add(g);
    return { mesh: g, vel: V3(), life: 0, active: false, dmg: 0 };
  }
  for (let i = 0; i < 36; i++) pens.push(makePen());

  function firePen(dir, dmg) {
    const p = pens.find((x) => !x.active); if (!p) return;
    p.active = true; p.life = 1.3; p.dmg = dmg;
    p.mesh.visible = true;
    _v4.copy(dir); // dir may alias a shared scratch vector — copy before touching them
    p.mesh.position.copy(player.pos);
    p.mesh.position.y += 1.45;
    // offset a touch to the right hand
    _v1.set(_v4.z, 0, -_v4.x).multiplyScalar(0.25);
    p.mesh.position.add(_v1);
    p.vel.copy(_v4).multiplyScalar(CFG.player.penSpeed);
    p.mesh.lookAt(_v1.copy(p.mesh.position).add(_v4));
    Audio.sfx.pen();
    player.throwAnim = 0.25;
  }

  // ---- particle bursts (pooled) ----
  function makeBurst() {
    const n = 26;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.22, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
    const pts = new THREE.Points(geo, mat); pts.visible = false; scene.add(pts);
    return { pts, vels: Array.from({ length: n }, () => V3()), life: 0, max: 0.6, active: false, n };
  }
  for (let i = 0; i < 14; i++) bursts.push(makeBurst());
  function burst(pos, color, size, count) {
    const b = bursts.find((x) => !x.active); if (!b) return;
    b.active = true; b.life = b.max; b.pts.visible = true;
    b.pts.material.color.set(color); b.pts.material.size = size || 0.22; b.pts.material.opacity = 1;
    const a = b.pts.geometry.attributes.position.array;
    for (let i = 0; i < b.n; i++) {
      a[i * 3] = pos.x; a[i * 3 + 1] = pos.y; a[i * 3 + 2] = pos.z;
      b.vels[i].set(rand(-1, 1), rand(-0.4, 1.4), rand(-1, 1)).normalize().multiplyScalar(rand(3, 9));
    }
    b.pts.geometry.attributes.position.needsUpdate = true;
  }

  // ---- spawn beam ----
  const beamGeo = new THREE.CylinderGeometry(0.7, 0.7, 26, 12, 1, true);
  function spawnBeam(x, z, color) {
    const m = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({
      color: color || 0x4db8ff, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    m.position.set(x, 13, z); scene.add(m);
    beams.push({ m, life: 0.55 });
  }

  // ---- enemies ----
  function makeDrone() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(GEO.droneBody, M.droneDark); body.castShadow = true; g.add(body);
    const eye = new THREE.Mesh(GEO.eye, M.redEye); eye.position.set(0, 0, 0.48); g.add(eye);
    const rotor = new THREE.Mesh(GEO.rotor, M.rotor); rotor.position.y = 0.62; g.add(rotor);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.25, 6), M.rotor);
    mast.position.y = 0.5; g.add(mast);
    return {
      kind: 'drone', mesh: g, rotor, hp: 22, maxHp: 22, r: 0.8, score: 100,
      vel: V3(), state: 'seek', t: rand(0, 5), hitCd: 0, dead: false, baseH: rand(2.2, 3.6),
    };
  }
  function makeWalker() {
    const g = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.0, 0.5), M.botGrey);
    torso.position.y = 1.15; torso.castShadow = true; g.add(torso);
    const tie = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.6), M.tie);
    tie.position.set(0, 1.2, 0.26); g.add(tie);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.45), M.botGrey);
    head.position.y = 1.92; head.castShadow = true; g.add(head);
    const eyeL = new THREE.Mesh(GEO.eye, M.redEye); eyeL.scale.setScalar(0.7); eyeL.position.set(-0.12, 1.94, 0.24); g.add(eyeL);
    const eyeR = eyeL.clone(); eyeR.position.x = 0.12; g.add(eyeR);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, 0.26), M.botGrey);
    legL.position.set(-0.22, 0.35, 0); legL.castShadow = true; g.add(legL);
    const legR = legL.clone(); legR.position.x = 0.22; g.add(legR);
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.8, 0.2), M.botGrey);
    armL.position.set(-0.55, 1.2, 0); g.add(armL);
    const armR = armL.clone(); armR.position.x = 0.55; g.add(armR);
    return {
      kind: 'walker', mesh: g, legL, legR, armL, armR, hp: 45, maxHp: 45, r: 0.9, score: 150,
      vel: V3(), t: rand(0, 5), hitCd: 0, dead: false,
    };
  }
  function makeCopier() {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.0, 1.2), M.copier);
    base.position.y = 0.75; base.castShadow = true; g.add(base);
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.3, 1.0), M.botGrey);
    top.position.y = 1.4; g.add(top);
    const tray = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.5), M.paper);
    tray.position.set(0, 1.1, 0.75); g.add(tray);
    const lamp = new THREE.Mesh(GEO.eye, M.redEye); lamp.position.set(0, 1.62, 0); g.add(lamp);
    const wheelG = new THREE.CylinderGeometry(0.16, 0.16, 0.1, 10);
    for (const [x, z] of [[-0.6, -0.45], [0.6, -0.45], [-0.6, 0.45], [0.6, 0.45]]) {
      const w = new THREE.Mesh(wheelG, M.penBody); w.rotation.z = Math.PI / 2; w.position.set(x, 0.16, z); g.add(w);
    }
    return {
      kind: 'copier', mesh: g, lamp, hp: 35, maxHp: 35, r: 1.1, score: 200,
      vel: V3(), t: rand(0, 3), shootCd: rand(1, 2.4), hitCd: 0, dead: false,
    };
  }

  // ---- boss ----
  let boss = null;
  function makeBoss() {
    const g = new THREE.Group();
    const faceTex = clockFaceTex();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1a0d10, roughness: 0.5, metalness: 0.55 });
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 1.6, 40), bodyMat);
    drum.rotation.x = Math.PI / 2; g.add(drum);
    const faceMat = new THREE.MeshStandardMaterial({ map: faceTex, emissive: 0xffffff, emissiveMap: faceTex, emissiveIntensity: 0.9, roughness: 0.6 });
    const face1 = new THREE.Mesh(new THREE.CircleGeometry(3.45, 40), faceMat);
    face1.position.z = 0.82; g.add(face1);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.28, 12, 40), M.silver || new THREE.MeshStandardMaterial({ color: 0xcfd6e0, metalness: 0.9, roughness: 0.25 }));
    g.add(rim);
    // alarm bells
    const bellG = new THREE.SphereGeometry(0.9, 14, 10, 0, TAU, 0, Math.PI / 2);
    const bellM = new THREE.MeshStandardMaterial({ color: 0xb8434f, roughness: 0.35, metalness: 0.7 });
    const bellL = new THREE.Mesh(bellG, bellM); bellL.position.set(-2.1, 3.3, 0); bellL.rotation.z = 0.3; g.add(bellL);
    const bellR = new THREE.Mesh(bellG, bellM); bellR.position.set(2.1, 3.3, 0); bellR.rotation.z = -0.3; g.add(bellR);
    // clock hands (3D, over the face)
    const handM = new THREE.MeshBasicMaterial({ color: 0xff3d55 });
    const hourHand = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.9, 0.08), handM);
    hourHand.geometry.translate(0, 0.8, 0); hourHand.position.z = 0.9; g.add(hourHand);
    const minHand = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.9, 0.08), handM);
    minHand.geometry.translate(0, 1.3, 0); minHand.position.z = 0.95; g.add(minHand);
    const pin = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), handM); pin.position.z = 0.95; g.add(pin);
    const glow = new THREE.PointLight(0xff3d55, 1.4, 30, 1.6); glow.position.z = 2; g.add(glow);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return {
      kind: 'boss', mesh: g, hourHand, minHand, glow,
      hp: 1250, maxHp: 1250, r: 3.7, score: 5000,
      vel: V3(), t: 0, phase: 1, atkT: 2.2, summonT: 9, slamT: 0, hitCd: 0, dead: false,
      angle: rand(0, TAU),
    };
  }

  function spawnEnemy(kind, x, z) {
    let e;
    if (kind === 'drone') e = makeDrone();
    else if (kind === 'walker') e = makeWalker();
    else if (kind === 'copier') e = makeCopier();
    else if (kind === 'boss') e = makeBoss();
    if (x === undefined) {
      const a = rand(0, TAU), r = CFG.arenaR * rand(0.7, 0.95);
      x = Math.cos(a) * r; z = Math.sin(a) * r;
    }
    e.mesh.position.set(x, kind === 'drone' ? e.baseH : kind === 'boss' ? 6 : 0, z);
    scene.add(e.mesh);
    enemies.push(e);
    spawnBeam(x, z, kind === 'boss' ? 0xff3d55 : 0x4db8ff);
    if (kind === 'boss') { boss = e; $('bosswrap').classList.add('on'); Audio.sfx.alarm(); }
    return e;
  }

  // ---- hazards (enemy projectiles) ----
  function spawnWad(from, target) {
    const m = new THREE.Mesh(GEO.wadGeo, M.paper);
    m.position.copy(from); m.castShadow = true; scene.add(m);
    const dir = _v1.copy(target).sub(from);
    const dist = Math.hypot(dir.x, dir.z);
    const t = clamp(dist / 16, 0.7, 1.6);
    const vx = dir.x / t, vz = dir.z / t;
    const vy = (target.y - from.y) / t + 0.5 * 22 * t;
    hazards.push({ kind: 'wad', mesh: m, vel: V3(vx, vy, vz), grav: 22, life: 4, r: 0.35, dmg: 12 });
  }
  function spawnShard(from, dir, speed) {
    const m = new THREE.Mesh(GEO.shard, M.shardRed);
    m.position.copy(from); scene.add(m);
    m.lookAt(_v1.copy(from).add(dir));
    hazards.push({ kind: 'shard', mesh: m, vel: dir.clone().multiplyScalar(speed || 15), grav: 0, life: 6, r: 0.42, dmg: 14 });
  }

  // ---- pickups ----
  function spawnPickup(kind, x, z) {
    const g = new THREE.Group();
    if (kind === 'espresso') {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.3, 12), M.espresso);
      cup.position.y = 0.15; g.add(cup);
      const coffee = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.04, 12), MAT.case);
      coffee.position.y = 0.31; g.add(coffee);
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.028, 6, 12), M.espresso);
      handle.position.set(0.26, 0.16, 0); g.add(handle);
    } else {
      const page = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.65, 0.04), M.contract);
      page.position.y = 0.4; g.add(page);
      const seal = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 10), M.goldSeal);
      seal.rotation.x = Math.PI / 2; seal.position.set(0.12, 0.25, 0.03); g.add(seal);
    }
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.03, 8, 24),
      new THREE.MeshBasicMaterial({ color: kind === 'espresso' ? 0xffb45d : 0xe8c15a, transparent: true, opacity: 0.7 })
    );
    halo.rotation.x = Math.PI / 2; halo.position.y = 0.06; g.add(halo);
    g.position.set(x, 0, z); scene.add(g);
    pickups.push({ kind, mesh: g, t: rand(0, TAU), life: 22 });
  }

  // ================================================================== HUD ==
  const ui = {
    hud: $('hud'), hp: $('hpbar'), hpFill: $('hpbar').firstElementChild,
    watch: $('watchbar').firstElementChild, score: $('score'), combo: $('combo'),
    waveNum: $('wave-num'), waveLeft: $('wave-left'), announce: $('announce'),
    bosswrap: $('bosswrap'), bossFill: $('bossbar').firstElementChild,
    vignette: $('vignette'), tempotint: $('tempotint'), hint: $('hint'),
  };
  let announceT = null;
  function showAnnounce(main, sub, ms) {
    ui.announce.innerHTML = main + (sub ? `<small>${sub}</small>` : '');
    ui.announce.classList.add('show');
    clearTimeout(announceT);
    announceT = setTimeout(() => ui.announce.classList.remove('show'), ms || 2200);
  }
  function scorePopup(worldPos, text) {
    _v1.copy(worldPos).project(camera);
    if (_v1.z > 1) return;
    const el = document.createElement('div');
    el.className = 'popup'; el.textContent = text;
    el.style.left = ((_v1.x * 0.5 + 0.5) * innerWidth) + 'px';
    el.style.top = ((-_v1.y * 0.5 + 0.5) * innerHeight) + 'px';
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.transform = 'translateY(-46px)'; el.style.opacity = '0'; });
    setTimeout(() => el.remove(), 750);
  }

  // ================================================================= GAME ==
  const game = {
    mode: 'title', // title | playing | paused | gameover | victory
    wave: 0, score: 0, kills: 0, combo: 0, comboT: 0,
    tempoMeter: 100, tempoActive: false,
    time: 0, spawnQueue: [], spawnT: 0, betweenT: 0,
    overtime: false, otLevel: 0,
    best: +(localStorage.getItem('ah_best') || 0),
    started: false,
    quality: { checked: false, acc: 0, n: 0 },
  };

  function resetGame() {
    for (const e of enemies) scene.remove(e.mesh);
    enemies.length = 0; boss = null; ui.bosswrap.classList.remove('on');
    for (const h of hazards) scene.remove(h.mesh);
    hazards.length = 0;
    for (const p of pickups) scene.remove(p.mesh);
    pickups.length = 0;
    for (const p of pens) { p.active = false; p.mesh.visible = false; }
    player.pos.set(0, 0, 6); player.vel.set(0, 0, 0);
    player.hp = player.maxHp; player.shield = 0; player.alive = true;
    player.boost = 0; player.iframes = 0; player.sinceHurt = 99;
    player.dashCd = 0; player.dashT = 0; player.penCd = 0; player.meleeCd = 0;
    game.wave = 0; game.score = 0; game.kills = 0; game.combo = 0; game.comboT = 0;
    game.tempoMeter = 100; game.tempoActive = false; game.time = 0;
    game.spawnQueue = []; game.betweenT = 0; game.overtime = false; game.otLevel = 0;
    camYaw = Math.PI; camPitch = 0.32;
    updateHud(true);
  }

  function startWave(n) {
    game.wave = n;
    const idx = Math.min(n - 1, CFG.waves.length - 1);
    let def = CFG.waves[idx];
    if (game.overtime) {
      const L = game.otLevel;
      def = { drones: 8 + L * 2, walkers: 5 + L, copiers: 2 + Math.floor(L / 2), boss: (n % 5 === 0) };
    }
    game.spawnQueue = [];
    for (let i = 0; i < (def.drones || 0); i++) game.spawnQueue.push('drone');
    for (let i = 0; i < (def.walkers || 0); i++) game.spawnQueue.push('walker');
    for (let i = 0; i < (def.copiers || 0); i++) game.spawnQueue.push('copier');
    // shuffle
    for (let i = game.spawnQueue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [game.spawnQueue[i], game.spawnQueue[j]] = [game.spawnQueue[j], game.spawnQueue[i]];
    }
    if (def.boss) {
      spawnEnemy('boss', 0, -CFG.arenaR * 0.5);
      showAnnounce('THE DEADLINE', 'IT IS ALMOST MIDNIGHT — SURVIVE THE FINAL REVIEW', 3400);
    } else {
      showAnnounce(`WAVE ${n}`, game.overtime ? `OVERTIME LEVEL ${game.otLevel + 1}` : pick([
        'HOSTILE ASSETS INBOUND', 'THE MACHINES SMELL FEAR', 'SCHEDULE CONFLICT DETECTED',
        'MANDATORY MEETING — ATTENDANCE: DEADLY', 'Q4 IS COMING FOR YOU',
      ]), 2400);
      Audio.sfx.wave();
    }
    game.spawnT = 0.4;
    ui.waveNum.textContent = n;
  }

  function waveCleared() {
    if (game.overtime) game.otLevel++;
    // pickups between waves
    if (Math.random() < 0.8) spawnPickup(pick(['espresso', 'contract']), rand(-14, 14), rand(-14, 14));
    game.betweenT = 3.2;
    showAnnounce('WAVE CLEAR', '+250 EFFICIENCY BONUS', 1800);
    addScore(250, null);
    Audio.sfx.wave();
  }

  function addScore(n, pos) {
    const mult = 1 + game.combo * 0.1;
    const v = Math.round(n * mult);
    game.score += v;
    ui.score.textContent = game.score;
    if (pos) scorePopup(pos, '+' + v);
  }

  function damageEnemy(e, dmg, hitPos) {
    if (e.dead) return;
    e.hp -= dmg;
    Audio.sfx.hit();
    burst(hitPos || e.mesh.position, e.kind === 'boss' ? 0xff8095 : 0x9fdcff, 0.16, 12);
    if (e.kind === 'boss') {
      ui.bossFill.style.width = clamp(e.hp / e.maxHp * 100, 0, 100) + '%';
      if (e.hp <= e.maxHp * 0.5 && e.phase === 1) {
        e.phase = 2; showAnnounce('OVERTIME RAGE', 'THE DEADLINE ACCELERATES', 2200); Audio.sfx.alarm();
      }
    }
    if (e.hp <= 0) killEnemy(e);
  }

  function killEnemy(e) {
    e.dead = true;
    game.kills++;
    game.combo++; game.comboT = 4;
    addScore(e.score, e.mesh.position);
    burst(e.mesh.position, e.kind === 'boss' ? 0xff3d55 : 0xffb45d, 0.3, 26);
    Audio.sfx.die();
    if (e.kind !== 'boss' && Math.random() < 0.12) {
      spawnPickup(pick(['espresso', 'contract']), e.mesh.position.x, e.mesh.position.z);
    }
    scene.remove(e.mesh);
    const i = enemies.indexOf(e); if (i >= 0) enemies.splice(i, 1);
    if (e.kind === 'boss') {
      boss = null; ui.bosswrap.classList.remove('on');
      if (!game.overtime) return void winGame();
    }
  }

  function hurtPlayer(dmg) {
    if (player.god || player.iframes > 0 || !player.alive) return;
    if (player.shield > 0) {
      const absorbed = Math.min(player.shield, dmg);
      player.shield -= absorbed; dmg -= absorbed;
      if (dmg <= 0) { Audio.sfx.hit(); return; }
    }
    player.hp -= dmg;
    player.sinceHurt = 0;
    player.iframes = 0.5;
    game.combo = 0;
    Audio.sfx.hurt();
    ui.vignette.style.opacity = '1';
    setTimeout(() => { if (player.hp > 25) ui.vignette.style.opacity = '0'; }, 220);
    if (player.hp <= 0) { player.hp = 0; loseGame(); }
  }

  function tryMelee() {
    if (game.mode !== 'playing' || player.meleeCd > 0 || !player.alive) return;
    player.meleeCd = CFG.player.meleeCd;
    player.meleeAnim = 0.4;
    Audio.sfx.melee();
    const dmg = player.boost > 0 ? CFG.player.meleeDmg * 1.5 : CFG.player.meleeDmg;
    for (const e of [...enemies]) {
      _v1.copy(e.mesh.position).sub(player.pos); _v1.y = 0;
      const d = _v1.length();
      if (d < CFG.player.meleeR + e.r) {
        damageEnemy(e, dmg, e.mesh.position);
        // knockback
        _v1.normalize().multiplyScalar(9);
        e.vel.add(_v1);
      }
    }
    // deflect hazards
    for (const h of hazards) {
      _v1.copy(h.mesh.position).sub(player.pos); _v1.y = 0;
      if (_v1.length() < CFG.player.meleeR + 0.6) { h.life = 0.01; burst(h.mesh.position, 0xffe2a8, 0.14, 8); }
    }
  }

  function winGame() {
    game.mode = 'victory';
    document.exitPointerLock && document.exitPointerLock();
    const t = Math.round(game.time);
    if (game.score > game.best) { game.best = game.score; localStorage.setItem('ah_best', game.best); }
    $('vic-stats').innerHTML =
      `Final score <span class="v">${game.score}</span> · Best <span class="v">${game.best}</span><br>` +
      `Machines dismantled <span class="v">${game.kills}</span> · Time on the clock <span class="v">${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}</span>`;
    $('victory').classList.remove('hidden');
    ui.hud.classList.remove('on');
    Audio.sfx.fanfare();
  }
  function loseGame() {
    player.alive = false;
    game.mode = 'gameover';
    document.exitPointerLock && document.exitPointerLock();
    if (game.score > game.best) { game.best = game.score; localStorage.setItem('ah_best', game.best); }
    const t = Math.round(game.time);
    $('go-stats').innerHTML =
      `Score <span class="v">${game.score}</span> · Best <span class="v">${game.best}</span><br>` +
      `Waves survived <span class="v">${Math.max(0, game.wave - 1)}</span> · Machines dismantled <span class="v">${game.kills}</span> · ` +
      `Time <span class="v">${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}</span>`;
    $('gameover').classList.remove('hidden');
    ui.hud.classList.remove('on');
  }

  function togglePause(force) {
    if (game.mode === 'playing') {
      game.mode = 'paused';
      $('pause').classList.remove('hidden');
      document.exitPointerLock && document.exitPointerLock();
    } else if (game.mode === 'paused' && !force) {
      $('pause').classList.add('hidden');
      game.mode = 'playing';
      if (!IS_TOUCH) canvas.requestPointerLock();
    }
  }

  function startGame(overtime) {
    resetGame();
    if (overtime) { game.overtime = true; }
    ['title', 'pause', 'gameover', 'victory'].forEach((id) => $(id).classList.add('hidden'));
    ui.hud.classList.add('on');
    game.mode = 'playing';
    Audio.startMusic();
    if (!IS_TOUCH) canvas.requestPointerLock();
    startWave(1);
    ui.hint.textContent = IS_TOUCH ? 'Left stick to move · drag right side to aim' : 'Hold Q or right-click to slow time with your watch';
    setTimeout(() => { ui.hint.textContent = ''; }, 6000);
  }

  $('btn-start').addEventListener('click', () => startGame(false));
  $('btn-retry').addEventListener('click', () => startGame(game.overtime));
  $('btn-resume').addEventListener('click', () => togglePause());
  $('btn-restart-p').addEventListener('click', () => { $('pause').classList.add('hidden'); startGame(false); });
  $('btn-restart-v').addEventListener('click', () => startGame(false));
  $('btn-overtime').addEventListener('click', () => {
    ['victory'].forEach((id) => $(id).classList.add('hidden'));
    game.overtime = true; game.otLevel = 0;
    ui.hud.classList.add('on');
    game.mode = 'playing';
    if (!IS_TOUCH) canvas.requestPointerLock();
    player.hp = player.maxHp;
    startWave(game.wave + 1);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.mode === 'playing') togglePause(true);
  });

  function updateHud(force) {
    ui.hpFill.style.width = clamp(player.hp / player.maxHp * 100, 0, 100) + '%';
    ui.hp.classList.toggle('low', player.hp < 30);
    ui.watch.style.width = clamp(game.tempoMeter, 0, 100) + '%';
    ui.combo.textContent = game.combo >= 2 ? `COMBO ×${(1 + game.combo * 0.1).toFixed(1)}` : '';
    const alive = enemies.filter((e) => e.kind !== 'boss').length + game.spawnQueue.length;
    ui.waveLeft.textContent = boss ? '· FINAL' : alive > 0 ? `· ${alive} hostile${alive > 1 ? 's' : ''}` : '';
    ui.vignette.style.opacity = player.hp > 0 && player.hp < 30 ? String(0.4 + 0.3 * Math.sin(game.time * 5)) : (player.iframes > 0.3 ? '0.8' : '0');
  }

  // ============================================================ MAIN LOOP ==
  const clock = new THREE.Clock();

  function aimDirection() {
    // shoot along camera forward, with soft auto-aim
    camera.getWorldDirection(_v1);
    let best = null;
    for (const e of enemies) {
      _v2.copy(e.mesh.position).sub(camera.position).normalize();
      const dot = _v2.dot(_v1);
      const co = e.kind === 'boss' ? 0.94 : 0.966; // ~15 degree assist cone
      if (dot > co && (!best || dot > best.dot)) best = { e, dot };
    }
    if (best) {
      _v2.copy(best.e.mesh.position);
      _v2.sub(player.pos).sub(_v3.set(0, 1.45, 0)).normalize();
      return _v2;
    }
    return _v1;
  }

  function updatePlayer(dt, rawDt) {
    const P = CFG.player;
    // timers
    player.dashCd = Math.max(0, player.dashCd - rawDt);
    player.penCd = Math.max(0, player.penCd - rawDt);
    player.meleeCd = Math.max(0, player.meleeCd - rawDt);
    player.meleeAnim = Math.max(0, player.meleeAnim - rawDt);
    player.throwAnim = Math.max(0, player.throwAnim - rawDt);
    player.iframes = Math.max(0, player.iframes - rawDt);
    player.sinceHurt += rawDt;
    player.boost = Math.max(0, player.boost - rawDt);
    if (player.sinceHurt > P.regenDelay && player.hp < player.maxHp) {
      player.hp = Math.min(player.maxHp, player.hp + P.regenRate * rawDt);
    }

    // movement input (camera relative)
    let mx = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) + touchState.mx;
    let mz = (keys.KeyS ? 1 : 0) - (keys.KeyW ? 1 : 0) + touchState.mz;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
    // camera forward on ground plane (camera sits behind the player along +yaw)
    const fwdX = -Math.sin(camYaw), fwdZ = -Math.cos(camYaw);
    const rightX = -fwdZ, rightZ = fwdX;
    let ax = rightX * mx + fwdX * (-mz);
    let az = rightZ * mx + fwdZ * (-mz);
    const aLen = Math.hypot(ax, az);
    player.moving = aLen > 0.1;
    const maxSpd = (player.boost > 0 ? P.speed * 1.25 : P.speed);

    if (player.dashT > 0) {
      player.dashT -= rawDt;
    } else {
      if (player.moving) {
        ax /= aLen; az /= aLen;
        player.vel.x += ax * P.accel * dt;
        player.vel.z += az * P.accel * dt;
        const sp = Math.hypot(player.vel.x, player.vel.z);
        if (sp > maxSpd) { player.vel.x *= maxSpd / sp; player.vel.z *= maxSpd / sp; }
      } else {
        const f = Math.max(0, 1 - P.friction * dt);
        player.vel.x *= f; player.vel.z *= f;
      }
    }

    // dash
    if ((keys.ShiftLeft || keys.ShiftRight) && player.dashCd <= 0 && player.alive) {
      keys.ShiftLeft = keys.ShiftRight = false;
      player.dashCd = P.dashCd; player.dashT = P.dashT;
      player.iframes = Math.max(player.iframes, 0.3);
      let dx = ax, dz = az;
      if (aLen < 0.1) { dx = fwdX; dz = fwdZ; }
      const dl = Math.hypot(dx, dz) || 1;
      player.vel.x = dx / dl * P.dashV; player.vel.z = dz / dl * P.dashV;
      Audio.sfx.dash();
      burst(_v1.copy(player.pos).add(_v2.set(0, 0.8, 0)), 0x9fdcff, 0.14, 12);
    }

    // jump
    if (keys.Space && player.onGround && player.alive) {
      player.vel.y = P.jumpV; player.onGround = false;
    }
    player.vel.y -= P.gravity * dt;
    player.pos.x += player.vel.x * dt;
    player.pos.z += player.vel.z * dt;
    player.pos.y += player.vel.y * dt;
    if (player.pos.y <= 0) { player.pos.y = 0; player.vel.y = 0; player.onGround = true; }

    // arena clamp
    const r = Math.hypot(player.pos.x, player.pos.z);
    if (r > CFG.arenaR) {
      player.pos.x *= CFG.arenaR / r; player.pos.z *= CFG.arenaR / r;
    }

    // firing
    if ((mouseDown || keys.KeyF || touchState.fire) && player.penCd <= 0 && player.alive) {
      player.penCd = player.boost > 0 ? P.penCd * 0.7 : P.penCd;
      const dmg = player.boost > 0 ? P.penDmg * 1.5 : P.penDmg;
      firePen(aimDirection(), dmg);
    }

    // facing: aim direction if firing recently, else move direction
    if (player.throwAnim > 0 || mouseDown || touchState.fire) {
      player.facing.set(fwdX, 0, fwdZ);
    } else if (player.moving) {
      player.facing.set(player.vel.x, 0, player.vel.z).normalize();
    }
    const targetYaw = Math.atan2(player.facing.x, player.facing.z);
    let dy = targetYaw - player.yaw;
    while (dy > Math.PI) dy -= TAU; while (dy < -Math.PI) dy += TAU;
    player.yaw += dy * Math.min(1, 14 * dt);

    // rig
    heroRig.root.position.copy(player.pos);
    heroRig.root.rotation.y = player.yaw;
    const spd = Math.hypot(player.vel.x, player.vel.z);
    if (player.onGround && spd > 0.5) {
      player.walkPhase += dt * spd * 1.35;
      const swing = Math.sin(player.walkPhase) * clamp(spd / CFG.player.speed, 0, 1.15) * 0.85;
      heroRig.legL.hip.rotation.x = swing;
      heroRig.legR.hip.rotation.x = -swing;
      heroRig.legL.knee.rotation.x = Math.max(0, -swing) * 0.9;
      heroRig.legR.knee.rotation.x = Math.max(0, swing) * 0.9;
      heroRig.armL.shoulder.rotation.x = -swing * 0.8;
      heroRig.armR.shoulder.rotation.x = swing * 0.8;
      heroRig.root.position.y = player.pos.y + Math.abs(Math.sin(player.walkPhase)) * 0.05;
      heroRig.chest.rotation.z = Math.sin(player.walkPhase) * 0.03;
    } else if (!player.onGround) {
      heroRig.legL.hip.rotation.x = lerp(heroRig.legL.hip.rotation.x, -0.5, 0.2);
      heroRig.legR.hip.rotation.x = lerp(heroRig.legR.hip.rotation.x, 0.3, 0.2);
      heroRig.legL.knee.rotation.x = lerp(heroRig.legL.knee.rotation.x, 0.9, 0.2);
      heroRig.legR.knee.rotation.x = lerp(heroRig.legR.knee.rotation.x, 0.5, 0.2);
      heroRig.armL.shoulder.rotation.x = lerp(heroRig.armL.shoulder.rotation.x, -1.2, 0.15);
      heroRig.armR.shoulder.rotation.x = lerp(heroRig.armR.shoulder.rotation.x, -1.2, 0.15);
    } else {
      const idle = Math.sin(game.time * 2.1) * 0.03;
      heroRig.legL.hip.rotation.x = lerp(heroRig.legL.hip.rotation.x, 0, 0.15);
      heroRig.legR.hip.rotation.x = lerp(heroRig.legR.hip.rotation.x, 0, 0.15);
      heroRig.legL.knee.rotation.x = lerp(heroRig.legL.knee.rotation.x, 0, 0.15);
      heroRig.legR.knee.rotation.x = lerp(heroRig.legR.knee.rotation.x, 0, 0.15);
      heroRig.armL.shoulder.rotation.x = lerp(heroRig.armL.shoulder.rotation.x, idle, 0.1);
      heroRig.armR.shoulder.rotation.x = lerp(heroRig.armR.shoulder.rotation.x, -idle, 0.1);
      heroRig.chest.rotation.z = lerp(heroRig.chest.rotation.z, 0, 0.1);
      heroRig.root.position.y = player.pos.y + Math.abs(idle) * 0.4;
    }
    // dash lean
    heroRig.body.rotation.x = lerp(heroRig.body.rotation.x, player.dashT > 0 ? 0.42 : 0, 0.25);
    // throw arm override
    if (player.throwAnim > 0) {
      const k = player.throwAnim / 0.25;
      heroRig.armR.shoulder.rotation.x = -2.4 * (1 - Math.abs(k - 0.6) * 2.2);
      heroRig.armR.elbow.rotation.x = -0.4;
    } else {
      heroRig.armR.elbow.rotation.x = lerp(heroRig.armR.elbow.rotation.x, 0, 0.2);
    }
    // melee briefcase spin
    if (player.meleeAnim > 0) {
      heroRig.briefcase.visible = true;
      const k = 1 - player.meleeAnim / 0.4;
      const ang = k * TAU * 1.0;
      heroRig.briefcase.position.set(Math.sin(ang) * 1.5, 1.2 + Math.sin(k * Math.PI) * 0.3, Math.cos(ang) * 1.5);
      heroRig.briefcase.rotation.y = ang + Math.PI / 2;
      heroRig.briefcase.rotation.z = k * 1.2;
    } else heroRig.briefcase.visible = false;
    // tempo watch glow
    heroRig.watchFace.material.color.setHex(game.tempoActive ? 0xffffff : 0x9fdcff);

    // pickups collect
    for (let i = pickups.length - 1; i >= 0; i--) {
      const pk = pickups[i];
      _v1.copy(pk.mesh.position).sub(player.pos); _v1.y = 0;
      if (_v1.length() < 1.2) {
        if (pk.kind === 'espresso') {
          player.boost = 8;
          showAnnounce('DOUBLE ESPRESSO', 'SPEED + DAMAGE UP', 1400);
        } else {
          player.shield = 40;
          showAnnounce('IRONCLAD CONTRACT', 'SHIELD +40', 1400);
        }
        Audio.sfx.pickup();
        addScore(50, pk.mesh.position);
        scene.remove(pk.mesh); pickups.splice(i, 1);
      }
    }
  }

  function updateEnemies(dt) {
    for (const e of [...enemies]) {
      e.t += dt;
      e.hitCd = Math.max(0, e.hitCd - dt);
      const toP = _v1.copy(player.pos).sub(e.mesh.position);
      const distXZ = Math.hypot(toP.x, toP.z);

      if (e.kind === 'drone') {
        e.rotor.rotation.y += dt * 30;
        const targetH = e.baseH + Math.sin(e.t * 2.2) * 0.35;
        // seek
        _v2.set(toP.x, 0, toP.z).normalize().multiplyScalar(4.2);
        e.vel.x = lerp(e.vel.x, _v2.x, 2.4 * dt);
        e.vel.z = lerp(e.vel.z, _v2.z, 2.4 * dt);
        let hTarget = targetH;
        if (distXZ < 5) hTarget = 1.2 + Math.max(0, player.pos.y); // dive
        e.vel.y = (hTarget - e.mesh.position.y) * 2.6;
        e.mesh.position.addScaledVector(e.vel, dt);
        e.mesh.lookAt(player.pos.x, e.mesh.position.y, player.pos.z);
        // contact damage
        _v2.copy(player.pos); _v2.y += 1.2;
        if (e.mesh.position.distanceTo(_v2) < e.r + 0.7 && e.hitCd <= 0) {
          e.hitCd = 1.0; hurtPlayer(10);
          _v3.set(toP.x, 0, toP.z).normalize().multiplyScalar(-6);
          e.vel.add(_v3);
        }
      } else if (e.kind === 'walker') {
        _v2.set(toP.x, 0, toP.z).normalize();
        const spd = 2.8;
        e.vel.x = lerp(e.vel.x, _v2.x * spd, 3 * dt);
        e.vel.z = lerp(e.vel.z, _v2.z * spd, 3 * dt);
        e.mesh.position.x += e.vel.x * dt;
        e.mesh.position.z += e.vel.z * dt;
        e.mesh.position.y = 0;
        e.mesh.lookAt(player.pos.x, 0, player.pos.z);
        const ph = e.t * 7;
        e.legL.rotation.x = Math.sin(ph) * 0.5; e.legR.rotation.x = -Math.sin(ph) * 0.5;
        e.armL.rotation.x = -Math.sin(ph) * 0.4; e.armR.rotation.x = Math.sin(ph) * 0.4;
        if (distXZ < e.r + 0.9 && e.hitCd <= 0) {
          e.hitCd = 1.2; hurtPlayer(14);
          e.armL.rotation.x = -1.6; e.armR.rotation.x = -1.6;
        }
      } else if (e.kind === 'copier') {
        // keep distance ~14
        _v2.set(toP.x, 0, toP.z).normalize();
        const want = distXZ > 17 ? 1 : distXZ < 11 ? -1 : 0;
        e.mesh.position.x += _v2.x * want * 1.6 * dt;
        e.mesh.position.z += _v2.z * want * 1.6 * dt;
        e.mesh.lookAt(player.pos.x, 0, player.pos.z);
        e.lamp.material = M.redEye;
        e.shootCd -= dt;
        if (e.shootCd <= 0 && distXZ < 34) {
          e.shootCd = rand(2.2, 3.4);
          _v2.copy(e.mesh.position); _v2.y = 1.2;
          _v3.copy(player.pos); _v3.y = 0.6;
          spawnWad(_v2, _v3);
        }
      } else if (e.kind === 'boss') {
        updateBoss(e, dt, toP, distXZ);
      }

      // clamp to arena
      const rr = Math.hypot(e.mesh.position.x, e.mesh.position.z);
      const lim = CFG.arenaR + (e.kind === 'boss' ? 6 : 2);
      if (rr > lim) { e.mesh.position.x *= lim / rr; e.mesh.position.z *= lim / rr; }
      // decay knockback
      e.vel.multiplyScalar(Math.max(0, 1 - 1.8 * dt));
    }
  }

  function updateBoss(e, dt, toP, distXZ) {
    const speedMul = e.phase === 2 ? 1.45 : 1;
    e.angle += dt * 0.22 * speedMul;
    const R = 16;
    const tx = Math.cos(e.angle) * R, tz = Math.sin(e.angle) * R;
    e.mesh.position.x = lerp(e.mesh.position.x, tx, 0.5 * dt * speedMul + 0.002);
    e.mesh.position.z = lerp(e.mesh.position.z, tz, 0.5 * dt * speedMul + 0.002);
    e.mesh.position.y = 5.4 + Math.sin(e.t * 1.1) * 0.8;
    // face player (yaw only)
    e.mesh.lookAt(player.pos.x, e.mesh.position.y, player.pos.z);
    // hands spin toward midnight
    e.hourHand.rotation.z = -e.t * 0.35 * speedMul;
    e.minHand.rotation.z = -e.t * 1.7 * speedMul;
    e.glow.intensity = 1.2 + Math.sin(e.t * 6) * 0.5;

    e.atkT -= dt;
    if (e.atkT <= 0) {
      const roll = Math.random();
      if (roll < 0.45) {
        // radial burst of second-hand shards
        const n = e.phase === 2 ? 16 : 11;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + e.t;
          _v2.set(Math.cos(a), 0, Math.sin(a));
          _v3.copy(e.mesh.position); _v3.y = 1.4;
          spawnShard(_v3, _v2.clone().setY(-0.06).normalize(), 13 * speedMul);
        }
        e.atkT = e.phase === 2 ? 2.2 : 3.2;
      } else {
        // aimed volley
        const shots = e.phase === 2 ? 5 : 3;
        for (let i = 0; i < shots; i++) {
          setTimeout(() => {
            if (e.dead || game.mode !== 'playing') return;
            _v2.copy(player.pos); _v2.y += 1.1;
            _v3.copy(e.mesh.position); _v3.y -= 1;
            const dir = _v2.sub(_v3).normalize();
            spawnShard(_v3, dir, 20 * speedMul);
          }, i * 190);
        }
        e.atkT = e.phase === 2 ? 1.9 : 2.8;
      }
    }
    e.summonT -= dt;
    if (e.summonT <= 0) {
      e.summonT = e.phase === 2 ? 8 : 11;
      const kinds = ['drone', 'drone', pick(['walker', 'copier'])];
      for (const k of kinds) {
        if (enemies.length < 26) {
          const a = rand(0, TAU), r = rand(14, 30);
          spawnEnemy(k, e.mesh.position.x + Math.cos(a) * 8, e.mesh.position.z + Math.sin(a) * 8);
        }
      }
      showAnnounce('REINFORCEMENTS', 'THE DEADLINE DELEGATES', 1500);
    }
  }

  function updateProjectiles(dt, playerDt) {
    // pens
    for (const p of pens) {
      if (!p.active) continue;
      p.life -= playerDt;
      p.mesh.position.addScaledVector(p.vel, playerDt);
      p.mesh.rotateZ(playerDt * 14);
      let hit = false;
      for (const e of enemies) {
        const hitR = e.r + 0.25;
        const ep = e.kind === 'drone' || e.kind === 'boss' ? e.mesh.position : _v2.copy(e.mesh.position).setY(1.1);
        if (p.mesh.position.distanceToSquared(ep) < hitR * hitR ||
            (e.kind === 'walker' && p.mesh.position.distanceToSquared(_v3.copy(e.mesh.position).setY(1.9)) < 0.6)) {
          damageEnemy(e, p.dmg, p.mesh.position); hit = true; break;
        }
      }
      if (hit || p.life <= 0 || p.mesh.position.y < 0) {
        p.active = false; p.mesh.visible = false;
      }
    }
    // hazards
    for (let i = hazards.length - 1; i >= 0; i--) {
      const h = hazards[i];
      h.life -= dt;
      h.vel.y -= h.grav * dt;
      h.mesh.position.addScaledVector(h.vel, dt);
      if (h.kind === 'wad') h.mesh.rotation.x += dt * 8;
      // hit player
      _v1.copy(player.pos); _v1.y += 1.0;
      if (h.mesh.position.distanceTo(_v1) < h.r + 0.55) {
        hurtPlayer(h.dmg);
        burst(h.mesh.position, 0xff8095, 0.16, 10);
        h.life = 0;
      }
      if (h.mesh.position.y < 0.05 && h.grav > 0) {
        burst(h.mesh.position, 0xd8d6cc, 0.12, 8);
        h.life = 0;
      }
      if (h.life <= 0) { scene.remove(h.mesh); hazards.splice(i, 1); }
    }
  }

  function updateFx(dt) {
    for (const b of bursts) {
      if (!b.active) continue;
      b.life -= dt;
      if (b.life <= 0) { b.active = false; b.pts.visible = false; continue; }
      const a = b.pts.geometry.attributes.position.array;
      for (let i = 0; i < b.n; i++) {
        b.vels[i].y -= 9 * dt;
        a[i * 3] += b.vels[i].x * dt; a[i * 3 + 1] += b.vels[i].y * dt; a[i * 3 + 2] += b.vels[i].z * dt;
      }
      b.pts.geometry.attributes.position.needsUpdate = true;
      b.pts.material.opacity = b.life / b.max;
    }
    for (let i = beams.length - 1; i >= 0; i--) {
      const bm = beams[i];
      bm.life -= dt;
      bm.m.material.opacity = Math.max(0, bm.life / 0.55) * 0.75;
      bm.m.scale.x = bm.m.scale.z = 1 + (0.55 - bm.life) * 2.2;
      if (bm.life <= 0) { scene.remove(bm.m); beams.splice(i, 1); }
    }
    for (const pk of pickups) {
      pk.t += dt * 2; pk.life -= dt;
      pk.mesh.position.y = 0.25 + Math.sin(pk.t) * 0.12;
      pk.mesh.rotation.y += dt * 1.6;
    }
    for (let i = pickups.length - 1; i >= 0; i--) {
      if (pickups[i].life <= 0) { scene.remove(pickups[i].mesh); pickups.splice(i, 1); }
    }
    ring.rotation.z += dt * 0.1;
    motes.update(dt);
  }

  function updateCamera(rawDt) {
    const dist = 7.6, height = 2.6;
    const cx = player.pos.x + Math.sin(camYaw) * Math.cos(camPitch) * dist;
    const cz = player.pos.z + Math.cos(camYaw) * Math.cos(camPitch) * dist;
    const cy = player.pos.y + height + Math.sin(camPitch) * dist * 0.85;
    _v1.set(cx, Math.max(0.5, cy), cz);
    camera.position.lerp(_v1, 1 - Math.pow(0.0001, rawDt));
    _v2.set(player.pos.x, player.pos.y + 1.6, player.pos.z);
    camera.lookAt(_v2);
    // subtle FOV kick on dash / tempo
    const targetFov = game.tempoActive ? 56 : player.dashT > 0 ? 68 : 62;
    camera.fov = lerp(camera.fov, targetFov, 0.12);
    camera.updateProjectionMatrix();
  }

  function updateDirector(dt) {
    // spawn queue
    if (game.spawnQueue.length > 0) {
      game.spawnT -= dt;
      if (game.spawnT <= 0) {
        game.spawnT = rand(0.35, 0.85);
        const kind = game.spawnQueue.pop();
        if (enemies.length < 24) spawnEnemy(kind);
        else game.spawnQueue.push(kind);
      }
    }
    // wave cleared?
    if (game.betweenT > 0) {
      game.betweenT -= dt;
      if (game.betweenT <= 0) startWave(game.wave + 1);
    } else if (game.spawnQueue.length === 0 && enemies.length === 0 && game.mode === 'playing') {
      waveCleared();
    }
    // combo decay
    if (game.comboT > 0) { game.comboT -= dt; if (game.comboT <= 0) game.combo = 0; }
  }

  let lastQualityCheck = 0;
  function autoQuality(rawDt) {
    const q = game.quality;
    q.acc += rawDt; q.n++;
    if (q.acc > 3 && !q.checked) {
      const avg = q.acc / q.n;
      if (avg > 0.04) {
        renderer.setPixelRatio(1);
        moon.shadow.mapSize.set(1024, 1024);
        if (avg > 0.06) { renderer.shadowMap.enabled = false; }
        q.checked = true;
      } else if (game.time > 12) q.checked = true;
      q.acc = 0; q.n = 0;
    }
  }

  function frame() {
    requestAnimationFrame(frame);
    const rawDt = Math.min(clock.getDelta(), 0.05);

    if (game.mode === 'playing') {
      // tempo (time slow)
      const wantSlow = (keys.KeyQ || rmbDown || touchState.slow) && game.tempoMeter > (game.tempoActive ? 0 : CFG.tempo.min);
      if (wantSlow && !game.tempoActive) { game.tempoActive = true; Audio.sfx.tempoIn(); ui.tempotint.style.opacity = '1'; }
      if (!wantSlow && game.tempoActive) { game.tempoActive = false; Audio.sfx.tempoOut(); ui.tempotint.style.opacity = '0'; }
      if (game.tempoActive) {
        game.tempoMeter -= CFG.tempo.drain * rawDt;
        if (game.tempoMeter <= 0) { game.tempoMeter = 0; game.tempoActive = false; Audio.sfx.tempoOut(); ui.tempotint.style.opacity = '0'; }
      } else {
        game.tempoMeter = Math.min(100, game.tempoMeter + CFG.tempo.regen * rawDt);
      }

      const ts = game.tempoActive ? CFG.tempo.scale : 1;
      const worldDt = rawDt * ts;
      const playerDt = rawDt * (game.tempoActive ? CFG.tempo.playerScale : 1);
      game.time += rawDt;

      updatePlayer(playerDt, rawDt);
      updateEnemies(worldDt);
      updateProjectiles(worldDt, playerDt);
      updateDirector(worldDt);
      updateFx(rawDt * (ts === 1 ? 1 : 0.55));
      updateHud();
      autoQuality(rawDt);
    } else {
      // idle scene motion on menus
      updateFx(rawDt * 0.6);
      if (game.mode === 'title') {
        const t = performance.now() * 0.00012;
        camera.position.set(Math.sin(t) * 16, 6.5 + Math.sin(t * 0.7) * 1.5, Math.cos(t) * 16);
        camera.lookAt(0, 2, 0);
      }
    }
    if (game.mode !== 'title' && game.mode !== 'lookdev') updateCamera(rawDt);
    renderer.render(scene, camera);
  }

  // idle hero pose on title screen
  heroRig.root.position.set(0, 0, 6);
  frame();

  // =========================================================== TEST HOOKS ==
  window.__AH = {
    version: '1.0.0',
    get game() { return game; },
    get player() { return player; },
    get enemies() { return enemies; },
    get boss() { return boss; },
    renderer, scene, camera, heroRig,
    state() {
      return {
        mode: game.mode, wave: game.wave, score: game.score, kills: game.kills,
        hp: player.hp, shield: player.shield, tempo: game.tempoMeter,
        enemies: enemies.length, queued: game.spawnQueue.length,
        hazards: hazards.length, pickups: pickups.length,
        playerPos: { x: +player.pos.x.toFixed(2), y: +player.pos.y.toFixed(2), z: +player.pos.z.toFixed(2) },
        boss: boss ? { hp: boss.hp, phase: boss.phase } : null,
        drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
      };
    },
    start() { startGame(false); },
    key(code, down) { keys[code] = down === undefined ? true : down; },
    fire(on) { mouseDown = !!on; },
    aim(yaw, pitch) { camYaw = yaw; if (pitch !== undefined) camPitch = pitch; },
    hurt(n) { hurtPlayer(n); },
    god(on) { player.god = !!on; },
    killAll() { for (const e of [...enemies]) killEnemy(e); },
    skipToBoss() {
      for (const e of [...enemies]) { e.dead = true; scene.remove(e.mesh); }
      enemies.length = 0; game.spawnQueue = []; game.betweenT = 0;
      game.wave = CFG.waves.length - 1;
      startWave(CFG.waves.length);
    },
    damageBoss(n) { if (boss) damageEnemy(boss, n, boss.mesh.position); },
    spawn(kind, x, z) { return !!spawnEnemy(kind, x, z); },
    melee() { tryMelee(); },
    clearWave() { game.spawnQueue.length = 0; for (const e of [...enemies]) killEnemy(e); },
  };
})();
