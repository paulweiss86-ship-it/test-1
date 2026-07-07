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

  // Storage that never throws: sandboxed iframes and iOS Safari with tracking
  // prevention raise SecurityError on any localStorage access, which would
  // otherwise kill the whole game at boot. Falls back to in-memory for the session.
  const store = (() => {
    const mem = {};
    let ls = null;
    try {
      ls = window.localStorage;
      ls.setItem('__ah_probe', '1');
      ls.removeItem('__ah_probe');
    } catch (e) { ls = null; }
    return {
      get(k, d) {
        try {
          const v = ls ? ls.getItem(k) : mem[k];
          return v == null ? d : v;
        } catch (e) { return mem[k] == null ? d : mem[k]; }
      },
      set(k, v) {
        mem[k] = String(v);
        try { if (ls) ls.setItem(k, String(v)); } catch (e) { /* session-only */ }
      },
    };
  })();

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
      { drones: 6 },
      { drones: 6, walkers: 4 },
      { drones: 7, walkers: 4, copiers: 2 },
      { drones: 6, walkers: 5, copiers: 3, shredders: 2 },
      { drones: 8, walkers: 4, copiers: 3, shredders: 4 },
      { boss: true, drones: 2, walkers: 2 },
    ],
    ult: { perKill: 12, pens: 24, blastR: 11, blastDmg: 28 },
  };
  const DIFF = {
    associate: { ehp: 0.75, edmg: 0.7 },
    partner: { ehp: 1, edmg: 1 },
    senior: { ehp: 1.35, edmg: 1.4 },
  };
  const RANKS = [
    ['Intern', 0], ['Analyst', 5000], ['Associate', 15000], ['Senior Associate', 35000],
    ['Vice President', 70000], ['Director', 120000], ['Senior Partner', 200000],
    ['Managing Partner', 350000], ['Name On The Door', 600000],
  ];
  const PERKS = [
    { id: 'triple', name: 'Triple Threat', tag: 'Pens', desc: 'Throw a 3-pen spread. Side pens deal 60% damage.' },
    { id: 'pierce', name: 'Fine Print', tag: 'Pens', desc: 'Pens pierce through up to 2 extra machines.' },
    { id: 'billable', name: 'Billable Hours', tag: 'Damage', desc: '+30% pen damage.' },
    { id: 'espresso', name: 'Espresso IV Drip', tag: 'Body', desc: '+10% move speed, and espresso boosts last twice as long.' },
    { id: 'parachute', name: 'Golden Parachute', tag: 'Body', desc: '+30 max HP and a full heal, effective immediately.' },
    { id: 'timemoney', name: 'Time Is Money', tag: 'Watch', desc: 'Tempo drains 40% slower.' },
    { id: 'takeover', name: 'Hostile Takeover', tag: 'Melee', desc: 'Briefcase deals +60% damage in +40% radius.' },
    { id: 'noncompete', name: 'Non-Compete Clause', tag: 'Mobility', desc: 'Dash recharges 40% faster with longer invulnerability.' },
    { id: 'vampire', name: 'Liquidation Bonus', tag: 'Sustain', desc: 'Destroying a machine restores 3 HP.' },
  ];

  // ================================================================ AUDIO ==
  const Audio = (() => {
    let ctx = null, master, sfxGain, musGain, musFilter, muted = false, started = false;
    let step = 0, nextT = 0, timer = null, intense = false;
    let volMus = 0.5, volSfx = 0.9;
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
      sfxGain = ctx.createGain(); sfxGain.gain.value = volSfx; sfxGain.connect(master);
      musFilter = ctx.createBiquadFilter(); musFilter.type = 'lowpass'; musFilter.frequency.value = 9000;
      musGain = ctx.createGain(); musGain.gain.value = volMus;
      musGain.connect(musFilter); musFilter.connect(master);
    }
    function setVolumes(mus, sfx) {
      volMus = mus; volSfx = sfx;
      if (musGain) musGain.gain.value = volMus;
      if (sfxGain) sfxGain.gain.value = volSfx;
    }
    function setIntense(on) { intense = !!on; }
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
      // kick on beats — boss phase doubles the drive
      if (inBar % 4 === 0 || (intense && inBar % 4 === 2)) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.1);
        env(g, t, 0.004, 0.5, 0.14); o.connect(g); g.connect(musGain); o.start(t); o.stop(t + 0.3);
      }
      // hats — every 16th in boss phase
      if (inBar % 2 === 1 || intense) noise(t, 0.03, intense ? 0.08 : 0.06, 9000, 'highpass');
      // bass pulse 8ths, octave up when intense
      if (inBar % 2 === 0) osc('triangle', f(BASS[bar] + (intense ? 12 : 0)), t, 0.16, 0.24);
      // arp 16ths
      const ch = CHORDS[bar];
      osc('sawtooth', f(ch[s % 3] + 12), t, 0.07, intense ? 0.055 : 0.035);
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
      ult() { if (!ctx) return; const t = ctx.currentTime;
        const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(80, t); o.frequency.exponentialRampToValueAtTime(640, t + 0.35);
        env(g, t, 0.02, 0.3, 0.4); o.connect(g); g.connect(sfxGain); o.start(t); o.stop(t + 0.55);
        noise(t + 0.32, 0.4, 0.4, 900, 'lowpass', sfxGain);
        [72, 76, 79].forEach((n, i) => osc('triangle', f(n), t + 0.36 + i * 0.07, 0.3, 0.2, sfxGain)); },
      tick() { if (!ctx) return; const t = ctx.currentTime;
        osc('square', 1180, t, 0.05, 0.12, sfxGain); },
      perk() { if (!ctx) return; const t = ctx.currentTime;
        [60, 67, 72, 76].forEach((n, i) => osc('sine', f(n), t + i * 0.09, 0.35, 0.18, sfxGain)); },
    };
    function toggleMute() { init(); muted = !muted; if (master) master.gain.value = muted ? 0 : 0.55; return muted; }
    return { init, startMusic, sfx, toggleMute, setVolumes, setIntense, get ctx() { return ctx; } };
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
  scene.fog = new THREE.FogExp2(0x0a0e1c, 0.011);

  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);

  // ---- post-processing (bloom) ----
  const FX = { bloom: true, rain: true };
  const composer = new THREE.EffectComposer(renderer);
  composer.addPass(new THREE.RenderPass(scene, camera));
  const bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.72, 0.42, 0.8);
  composer.addPass(bloomPass);
  composer.addPass(new THREE.ShaderPass(THREE.GammaCorrectionShader));

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
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

  // sky dome — deep night zenith into light-pollution horizon glow
  {
    const skyTex = canvasTex(32, 512, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0.0, '#01020a');
      gr.addColorStop(0.34, '#070c22');
      gr.addColorStop(0.46, '#1b1e40');
      gr.addColorStop(0.505, '#413156');
      gr.addColorStop(0.55, '#191428');
      gr.addColorStop(1.0, '#04050a');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(560, 24, 16),
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false })
    );
    scene.add(dome);
  }
  // environment cube — gives metals, puddles and glass their night-city sheen
  {
    const face = (top, mid, bot) => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d');
      const gr = g.createLinearGradient(0, 0, 0, 64);
      gr.addColorStop(0, top); gr.addColorStop(0.62, mid); gr.addColorStop(1, bot);
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      // scatter a few lit-window speckles for glinty reflections
      for (let i = 0; i < 40; i++) {
        g.fillStyle = Math.random() < 0.5 ? 'rgba(255,214,140,0.7)' : 'rgba(150,200,255,0.7)';
        g.fillRect(Math.random() * 64, 26 + Math.random() * 30, 1.6, 2.4);
      }
      return c;
    };
    const side = () => face('#060a18', '#1c2244', '#2c2440');
    const envTex = new THREE.CubeTexture([side(), side(), face('#03040c', '#05060f', '#0a0c1a'), face('#14182e', '#0c0f20', '#080a14'), side(), side()]);
    envTex.needsUpdate = true;
    envTex.encoding = THREE.sRGBEncoding;
    scene.environment = envTex;
  }

  // ground
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(140, 64),
    new THREE.MeshStandardMaterial({ map: groundTex(), roughness: 0.68, metalness: 0.14, color: 0x525c7e, envMapIntensity: 0.4 })
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
  const innerBuildings = [];
  for (let i = 0; i < 42; i++) {
    const a = (i / 42) * TAU + rand(-0.05, 0.05);
    const r = rand(CFG.arenaR + 16, CFG.arenaR + 62);
    const wdt = rand(9, 20), dep = rand(9, 20), hgt = rand(18, 78);
    const m = new THREE.Mesh(buildingGeo, pick(buildingMats));
    m.scale.set(wdt, hgt, dep);
    m.position.set(Math.cos(a) * r, hgt / 2 - 0.1, Math.sin(a) * r);
    m.rotation.y = -a + rand(-0.3, 0.3);
    world.add(m);
    innerBuildings.push(m);
  }
  // rooftop dressing: synthwave crown bands, antennas, blinking beacons
  const beacons = [];
  {
    const crownColors = [0x35d0ff, 0xff4fa0, 0xffc966, 0x8f7bff];
    const antennaGeo = new THREE.CylinderGeometry(0.08, 0.14, 1, 6);
    const antennaMat = new THREE.MeshStandardMaterial({ color: 0x39415a, roughness: 0.6, metalness: 0.5 });
    const beaconGeo = new THREE.SphereGeometry(0.4, 8, 6);
    const tall = [...innerBuildings].sort((x, y) => y.scale.y - x.scale.y);
    tall.slice(0, 12).forEach((b, i) => {
      const topY = b.position.y + b.scale.y / 2;
      if (i % 2 === 0) {
        const band = new THREE.Mesh(
          new THREE.BoxGeometry(b.scale.x + 0.5, 0.35, b.scale.z + 0.5),
          new THREE.MeshBasicMaterial({ color: pick(crownColors) })
        );
        band.position.set(b.position.x, topY + 0.1, b.position.z);
        band.rotation.y = b.rotation.y;
        world.add(band);
      }
      const ant = new THREE.Mesh(antennaGeo, antennaMat);
      const antH = rand(4, 8);
      ant.scale.y = antH;
      ant.position.set(b.position.x, topY + antH / 2, b.position.z);
      world.add(ant);
      const bc = new THREE.Mesh(beaconGeo, new THREE.MeshBasicMaterial({ color: 0xff3d55 }));
      bc.position.set(b.position.x, topY + antH + 0.3, b.position.z);
      world.add(bc);
      beacons.push({ m: bc, ph: rand(0, TAU) });
    });
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
  const neonSigns = [];
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
    neonSigns.push({ m, flickerT: 0, cd: rand(3, 12) });
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

  // puddles — reflective pools that catch the neon
  {
    const pudMat = new THREE.MeshStandardMaterial({
      color: 0x10182c, roughness: 0.05, metalness: 1.0, envMapIntensity: 2.4,
      emissive: 0x1c2748, emissiveIntensity: 0.32,
    });
    for (let i = 0; i < 12; i++) {
      const a = rand(0, TAU), r = rand(6, CFG.arenaR - 4);
      const p = new THREE.Mesh(new THREE.CircleGeometry(rand(1.1, 2.8), 20), pudMat);
      p.rotation.x = -Math.PI / 2;
      p.rotation.z = rand(0, TAU);
      p.scale.x = rand(1.1, 1.9);
      p.position.set(Math.cos(a) * r, 0.015, Math.sin(a) * r);
      p.receiveShadow = true;
      world.add(p);
    }
  }
  // litter — loose paperwork blown across the plaza
  {
    const litterGeo = new THREE.PlaneGeometry(0.32, 0.42);
    const litterMat = new THREE.MeshStandardMaterial({ color: 0x6e6b5c, roughness: 1, side: THREE.DoubleSide });
    for (let i = 0; i < 22; i++) {
      const a = rand(0, TAU), r = rand(4, CFG.arenaR + 6);
      const l = new THREE.Mesh(litterGeo, litterMat);
      l.rotation.x = -Math.PI / 2 + rand(-0.12, 0.12);
      l.rotation.z = rand(0, TAU);
      l.position.set(Math.cos(a) * r, 0.02 + rand(0, 0.02), Math.sin(a) * r);
      world.add(l);
    }
  }
  // steam vents
  const steamVents = [];
  {
    const spots = [[14, 0.35], [34, 2.4], [46, 4.4]];
    for (const [r, a] of spots) {
      const n = 34, pos = new Float32Array(n * 3), seed = [];
      const ox = Math.cos(a) * r, oz = Math.sin(a) * r;
      for (let i = 0; i < n; i++) seed.push({ ph: rand(0, 4), sp: rand(0.7, 1.5), wig: rand(0.5, 1.6) });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const pts = new THREE.Points(g, new THREE.PointsMaterial({
        color: 0x8093ad, size: 0.8, transparent: true, opacity: 0.11, depthWrite: false,
      }));
      scene.add(pts);
      // vent grate
      const grate = new THREE.Mesh(
        new THREE.CylinderGeometry(0.7, 0.8, 0.12, 10),
        new THREE.MeshStandardMaterial({ color: 0x232a3c, roughness: 0.8, metalness: 0.4 })
      );
      grate.position.set(ox, 0.06, oz); world.add(grate);
      steamVents.push({ pts, pos, seed, n, ox, oz, t: rand(0, 9) });
    }
  }
  // rain — sparse streaks over the whole arena
  const rain = (() => {
    const n = 420;
    const pos = new Float32Array(n * 6);
    const drops = [];
    for (let i = 0; i < n; i++) {
      drops.push({ x: rand(-80, 80), y: rand(0, 34), z: rand(-80, 80), v: rand(20, 30) });
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({
      color: 0x6f8fc0, transparent: true, opacity: 0.34, depthWrite: false,
    }));
    scene.add(lines);
    return { lines, update(dt) {
      if (!FX.rain) { lines.visible = false; return; }
      lines.visible = true;
      for (let i = 0; i < n; i++) {
        const d = drops[i];
        d.y -= d.v * dt;
        if (d.y < 0) { d.y = rand(26, 34); d.x = rand(-80, 80); d.z = rand(-80, 80); }
        pos[i * 6] = d.x; pos[i * 6 + 1] = d.y; pos[i * 6 + 2] = d.z;
        pos[i * 6 + 3] = d.x; pos[i * 6 + 4] = d.y + 0.62; pos[i * 6 + 5] = d.z;
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
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x030609 });
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
    // facial details self-shadow badly at this scale — one clean head shadow is enough
    [hair, beard, eL, eR, bL, bR].forEach((o) => { o.castShadow = false; });
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
    alive: true, god: false,
    perks: new Set(), ghostT: 0,
  };
  const UP = V3(0, 1, 0);
  const _aim = new THREE.Vector3();

  // ================================================================ INPUT ==
  const keys = {};
  let mouseDown = false, rmbDown = false;
  let camYaw = 0, camPitch = 0.32;
  const IS_TOUCH = matchMedia('(pointer: coarse)').matches && 'ontouchstart' in window;
  if (IS_TOUCH) document.body.classList.add('touch');

  // pointer lock is absent or gesture-restricted on some browsers — never let it throw
  function lockPointer() {
    if (IS_TOUCH || !canvas.requestPointerLock) return;
    try {
      const r = canvas.requestPointerLock();
      if (r && typeof r.catch === 'function') r.catch(() => {});
    } catch (e) { /* unsupported */ }
  }

  document.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys[e.code] = true;
    if (e.code === 'KeyM') Audio.toggleMute();
    if (e.code === 'KeyP' || (e.code === 'Escape' && game.mode === 'paused')) togglePause();
    if (e.code === 'KeyE') tryMelee();
    if (e.code === 'KeyR') fireUlt();
    if (game.mode === 'cinematic') game.cineT = Math.min(game.cineT, 0.25);
    if (e.code === 'Space') e.preventDefault();
  });
  document.addEventListener('keyup', (e) => { keys[e.code] = false; });

  canvas.addEventListener('mousedown', (e) => {
    if (game.mode === 'cinematic') { game.cineT = Math.min(game.cineT, 0.25); return; }
    if (game.mode !== 'playing') return;
    if (e.button === 0) mouseDown = true;
    if (e.button === 2) rmbDown = true;
    if (document.pointerLockElement !== canvas) lockPointer();
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouseDown = false;
    if (e.button === 2) rmbDown = false;
  });
  window.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === canvas && game.mode === 'playing') {
      const s = SETTINGS.sens / 100;
      camYaw -= e.movementX * 0.0023 * s;
      camPitch = clamp(camPitch + e.movementY * 0.0021 * s * (SETTINGS.invertY ? -1 : 1), -0.25, 1.05);
    }
  });

  // -------------------------------------------------------------- settings --
  const SETTINGS = Object.assign(
    { music: 50, sfx: 90, sens: 100, invertY: false, bloom: true, rain: true },
    (() => { try { return JSON.parse(store.get('ah_settings', '{}')); } catch (e) { return {}; } })()
  );
  function applySettings() {
    Audio.setVolumes(SETTINGS.music / 100, SETTINGS.sfx / 100);
    FX.bloom = SETTINGS.bloom;
    FX.rain = SETTINGS.rain;
  }
  function saveSettings() { store.set('ah_settings', JSON.stringify(SETTINGS)); }
  (function wireSettings() {
    const bindRange = (id, key) => {
      const el = $(id); el.value = SETTINGS[key];
      el.addEventListener('input', () => { SETTINGS[key] = +el.value; applySettings(); saveSettings(); });
    };
    const bindCheck = (id, key) => {
      const el = $(id); el.checked = SETTINGS[key];
      el.addEventListener('change', () => { SETTINGS[key] = el.checked; applySettings(); saveSettings(); });
    };
    bindRange('set-music', 'music'); bindRange('set-sfx', 'sfx'); bindRange('set-sens', 'sens');
    bindCheck('set-inverty', 'invertY'); bindCheck('set-bloom', 'bloom'); bindCheck('set-rain', 'rain');
    applySettings();
  })();

  // -------------------------------------------------------- career ladder --
  let careerXp = +store.get('ah_xp', 0);
  function rankIdx(xp) {
    let i = 0;
    while (i + 1 < RANKS.length && xp >= RANKS[i + 1][1]) i++;
    return i;
  }
  function rankLineHtml() {
    const i = rankIdx(careerXp);
    const next = RANKS[i + 1];
    return `Career: <b>${RANKS[i][0]}</b> · ${careerXp.toLocaleString()} lifetime billings` +
      (next ? ` · next promotion at ${next[1].toLocaleString()}` : ' · top of the letterhead');
  }
  function updateRankLine() { $('rank-line').innerHTML = rankLineHtml(); }
  function bankScore() {
    const delta = game.score - game.bankedScore;
    if (delta <= 0) return null;
    const before = rankIdx(careerXp);
    careerXp += delta;
    store.set('ah_xp', careerXp);
    game.bankedScore = game.score;
    updateRankLine();
    const after = rankIdx(careerXp);
    return after > before ? RANKS[after][0] : null;
  }
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
    bind('tb-ult', () => fireUlt());
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
  // min distance² from point p to segment ab (dedicated scratch vectors — the
  // shared _v* set is live in the collision loops that call this)
  const _s1 = new THREE.Vector3(), _s2 = new THREE.Vector3(), _s3 = new THREE.Vector3();
  function segDistSq(a, b, p) {
    _s1.subVectors(b, a);
    const len = _s1.lengthSq();
    const t = len > 0 ? clamp(_s2.subVectors(p, a).dot(_s1) / len, 0, 1) : 0;
    _s3.copy(a).addScaledVector(_s1, t);
    return _s3.distanceToSquared(p);
  }

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
    return { mesh: g, vel: V3(), prev: V3(), life: 0, active: false, dmg: 0 };
  }
  for (let i = 0; i < 64; i++) pens.push(makePen());

  function firePen(dir, dmg, pierceOverride) {
    const p = pens.find((x) => !x.active); if (!p) return;
    p.active = true; p.life = 1.3; p.dmg = dmg;
    p.pierce = pierceOverride !== undefined ? pierceOverride : (player.perks.has('pierce') ? 2 : 0);
    p.lastHit = null;
    p.mesh.visible = true;
    _v4.copy(dir); // dir may alias a shared scratch vector — copy before touching them
    p.mesh.position.copy(player.pos);
    p.mesh.position.y += 1.45;
    // offset a touch to the right hand
    _v1.set(_v4.z, 0, -_v4.x).multiplyScalar(0.25);
    p.mesh.position.add(_v1);
    p.vel.copy(_v4).multiplyScalar(CFG.player.penSpeed);
    p.prev.copy(p.mesh.position);
    p.mesh.lookAt(_v1.copy(p.mesh.position).add(_v4));
    flash(p.mesh.position, 0.75, 0x9fdcff);
    Audio.sfx.pen();
    player.throwAnim = 0.25;
  }

  function fireUlt() {
    if (game.mode !== 'playing' || game.ult < 100 || !player.alive) return;
    game.ult = 0;
    Audio.sfx.ult();
    showAnnounce('CLOSING ARGUMENT', 'NO FURTHER QUESTIONS', 1800);
    const n = CFG.ult.pens;
    const dmg = CFG.player.penDmg * 1.6 * (player.perks.has('billable') ? 1.3 : 1);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      firePen(_v4.set(Math.cos(a), 0.02, Math.sin(a)), dmg, 3);
    }
    for (const e of [...enemies]) {
      _v1.copy(e.mesh.position).sub(player.pos); _v1.y = 0;
      const d = _v1.length();
      if (d < CFG.ult.blastR) {
        damageEnemy(e, CFG.ult.blastDmg, e.mesh.position);
        _v1.normalize().multiplyScalar(14); e.vel.add(_v1);
      }
    }
    ui.tempotint.style.opacity = '1';
    setTimeout(() => { if (!game.tempoActive) ui.tempotint.style.opacity = '0'; }, 260);
    burst(_v1.copy(player.pos).setY(1.2), 0xffe9a8, 0.4, 26);
    game.shake = Math.max(game.shake, 0.5);
    game.hitstopT = Math.max(game.hitstopT, 0.09);
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

  // ---- flash sprites (muzzle flashes, impact glints) ----
  const flashes = [];
  {
    const ftex = canvasTex(64, 64, (g) => {
      const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.35, 'rgba(200,225,255,0.7)');
      gr.addColorStop(1, 'rgba(150,190,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    });
    for (let i = 0; i < 12; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: ftex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      sp.visible = false; scene.add(sp);
      flashes.push({ sp, life: 0, max: 0.09 });
    }
  }
  function flash(pos, size, color) {
    const f = flashes.find((x) => x.life <= 0); if (!f) return;
    f.life = f.max;
    f.sp.visible = true;
    f.sp.position.copy(pos);
    f.sp.scale.setScalar(size || 0.9);
    f.sp.material.color.set(color || 0xffffff);
    f.sp.material.opacity = 1;
  }

  // ---- dash afterimages ----
  const ghosts = [];
  function spawnGhost() {
    const g = heroRig.root.clone(true);
    const mat = new THREE.MeshBasicMaterial({ color: 0x5fcaff, transparent: true, opacity: 0.32, depthWrite: false });
    g.traverse((o) => { if (o.isMesh) { o.material = mat; o.castShadow = false; } });
    scene.add(g);
    ghosts.push({ g, mat, life: 0.32, max: 0.32 });
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

  function makeShredder() {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x4a5065, roughness: 0.45, metalness: 0.6 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.75, 1.35), bodyMat);
    body.position.y = 0.72; body.castShadow = true; g.add(body);
    const hood = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, 0.7), bodyMat);
    hood.position.set(0, 1.2, -0.2); hood.rotation.x = 0.15; hood.castShadow = true; g.add(hood);
    // spinning intake blade drum at the front
    const blade = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.34, 0.8, 12),
      new THREE.MeshStandardMaterial({ color: 0xb9c2d6, roughness: 0.25, metalness: 0.95 })
    );
    blade.rotation.z = Math.PI / 2; blade.position.set(0, 0.5, 0.78); g.add(blade);
    const teeth = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.1, 0.74), M.penBody);
    teeth.position.set(0, 0.5, 0.78); g.add(teeth);
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.1, 0.06), M.redEye);
    eye.position.set(0, 1.05, 0.5); g.add(eye);
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 1.3), M.tie);
    stripe.rotation.x = -Math.PI / 2; stripe.position.set(0, 1.11, -0.1); g.add(stripe);
    const wheelG = new THREE.CylinderGeometry(0.2, 0.2, 0.12, 10);
    for (const [x, z] of [[-0.55, -0.45], [0.55, -0.45], [-0.55, 0.5], [0.55, 0.5]]) {
      const w = new THREE.Mesh(wheelG, M.penBody); w.rotation.z = Math.PI / 2; w.position.set(x, 0.2, z); g.add(w);
    }
    return {
      kind: 'shredder', mesh: g, blade, eye, hp: 34, maxHp: 34, r: 0.9, score: 250,
      vel: V3(), t: rand(0, 5), state: 'stalk', stateT: 0, chargeDir: V3(),
      atkCd: rand(1.5, 3), hitCd: 0, dead: false,
    };
  }

  // ---- boss slam shockwave rings (jump to dodge) ----
  const slamRings = [];
  const slamRingGeo = new THREE.TorusGeometry(1, 0.16, 8, 48);
  function spawnSlamRing(x, z) {
    const m = new THREE.Mesh(slamRingGeo, new THREE.MeshBasicMaterial({
      color: 0xff4560, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    m.rotation.x = Math.PI / 2;
    m.position.set(x, 0.25, z);
    scene.add(m);
    slamRings.push({ m, x, z, r: 1, hit: false });
    game.shake = Math.max(game.shake, 0.18);
    Audio.sfx.tick();
  }
  function updateSlamRings(dt) {
    for (let i = slamRings.length - 1; i >= 0; i--) {
      const s = slamRings[i];
      s.r += 11.5 * dt;
      s.m.scale.setScalar(s.r);
      s.m.material.opacity = clamp(1.15 - s.r / 26, 0, 1);
      if (!s.hit && player.onGround) {
        const d = Math.hypot(player.pos.x - s.x, player.pos.z - s.z);
        if (Math.abs(d - s.r) < 1.0) { s.hit = true; hurtPlayer(15); }
      }
      if (s.r > 27) { scene.remove(s.m); s.m.material.dispose(); slamRings.splice(i, 1); }
    }
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
      vel: V3(), t: 0, phase: 1, atkT: 2.2, summonT: 9, slamT: 0, slamN: 0, hitCd: 0, dead: false,
      angle: rand(0, TAU),
    };
  }

  function spawnEnemy(kind, x, z) {
    let e;
    if (kind === 'drone') e = makeDrone();
    else if (kind === 'walker') e = makeWalker();
    else if (kind === 'copier') e = makeCopier();
    else if (kind === 'shredder') e = makeShredder();
    else if (kind === 'boss') e = makeBoss();
    const dm = DIFF[game.diff] || DIFF.partner;
    e.hp = Math.round(e.hp * dm.ehp); e.maxHp = e.hp;
    e.baseScale = 1;
    // overtime elites: bigger, meaner, worth triple
    if (game.overtime && kind !== 'boss' && Math.random() < 0.15) {
      e.elite = true;
      e.baseScale = 1.3;
      e.mesh.scale.setScalar(1.3);
      e.hp = e.maxHp = Math.round(e.hp * 2.5);
      e.score *= 3;
      e.r *= 1.3;
      e.mesh.traverse((o) => {
        if (o.isMesh && o.material && o.material.color) {
          o.material = o.material.clone();
          o.material.color.lerp(new THREE.Color(0xff3040), 0.35);
        }
      });
    }
    if (x === undefined) {
      const a = rand(0, TAU), r = CFG.arenaR * rand(0.7, 0.95);
      x = Math.cos(a) * r; z = Math.sin(a) * r;
    }
    e.mesh.position.set(x, kind === 'drone' ? e.baseH : kind === 'boss' ? 6 : 0, z);
    scene.add(e.mesh);
    enemies.push(e);
    spawnBeam(x, z, kind === 'boss' ? 0xff3d55 : 0x4db8ff);
    if (kind === 'boss') {
      boss = e;
      $('bosswrap').classList.add('on');
      Audio.sfx.alarm();
      Audio.setIntense(true);
      if (game.mode === 'playing' && !game.overtime) {
        game.cineT = 2.8;
        game.mode = 'cinematic';
        document.body.classList.add('cine');
      }
    }
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
    ultbar: $('ultbar'), ult: $('ultbar').firstElementChild,
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
  let popupN = 0;
  function worldPopup(worldPos, text, cls) {
    if (popupN > 14) return;
    _v1.copy(worldPos).project(camera);
    if (_v1.z > 1) return;
    popupN++;
    const el = document.createElement('div');
    el.className = 'popup' + (cls ? ' ' + cls : '');
    el.textContent = text;
    el.style.left = ((_v1.x * 0.5 + 0.5) * innerWidth) + 'px';
    el.style.top = ((-_v1.y * 0.5 + 0.5) * innerHeight) + 'px';
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.transform = 'translateY(-46px)'; el.style.opacity = '0'; });
    setTimeout(() => { el.remove(); popupN--; }, 750);
  }
  function scorePopup(worldPos, text) { worldPopup(worldPos, text); }

  // screen-edge threat arrows
  const edgePool = [];
  for (let i = 0; i < 8; i++) {
    const d = document.createElement('div');
    d.className = 'edge-arrow';
    document.body.appendChild(d);
    edgePool.push(d);
  }
  function updateEdgeArrows() {
    let used = 0;
    const list = boss ? [boss, ...enemies.filter((e) => e !== boss)] : enemies;
    for (const e of list) {
      if (used >= edgePool.length) break;
      _v1.copy(e.mesh.position).project(camera);
      const behind = _v1.z > 1;
      if (!behind && Math.abs(_v1.x) < 0.92 && Math.abs(_v1.y) < 0.92) continue;
      let x = _v1.x, y = _v1.y;
      if (behind) { x = -x; y = -y; }
      const m = Math.max(Math.abs(x), Math.abs(y), 0.0001);
      x = x / m * 0.9; y = y / m * 0.88;
      const sx = (x * 0.5 + 0.5) * innerWidth, sy = (-y * 0.5 + 0.5) * innerHeight;
      const ang = Math.atan2(sy - innerHeight / 2, sx - innerWidth / 2) * 180 / Math.PI + 90;
      const d = edgePool[used++];
      d.style.display = 'block';
      d.classList.toggle('boss', e.kind === 'boss');
      d.style.left = (sx - 11) + 'px';
      d.style.top = (sy - 10) + 'px';
      d.style.transform = `rotate(${ang}deg)`;
    }
    for (let i = used; i < edgePool.length; i++) edgePool[i].style.display = 'none';
  }
  function hideEdgeArrows() { for (const d of edgePool) d.style.display = 'none'; }

  // ================================================================= GAME ==
  const game = {
    mode: 'title', // title | playing | paused | gameover | victory
    wave: 0, score: 0, kills: 0, combo: 0, comboT: 0,
    tempoMeter: 100, tempoActive: false, ult: 0, diff: 'partner',
    hitstopT: 0, shake: 0, cineT: 0, dieT: 0, bankedScore: 0,
    time: 0, spawnQueue: [], spawnT: 0, betweenT: 0,
    overtime: false, otLevel: 0,
    best: +store.get('ah_best', 0),
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
    for (const s of slamRings) { scene.remove(s.m); s.m.material.dispose(); }
    slamRings.length = 0;
    for (const g of ghosts) { scene.remove(g.g); g.mat.dispose(); }
    ghosts.length = 0;
    player.perks.clear();
    player.maxHp = CFG.player.hp;
    player.pos.set(0, 0, 6); player.vel.set(0, 0, 0);
    player.hp = player.maxHp; player.shield = 0; player.alive = true;
    player.boost = 0; player.iframes = 0; player.sinceHurt = 99;
    player.dashCd = 0; player.dashT = 0; player.penCd = 0; player.meleeCd = 0;
    game.wave = 0; game.score = 0; game.kills = 0; game.combo = 0; game.comboT = 0;
    game.tempoMeter = 100; game.tempoActive = false; game.time = 0; game.ult = 0;
    game.spawnQueue = []; game.betweenT = 0; game.overtime = false; game.otLevel = 0;
    game.hitstopT = 0; game.shake = 0; game.cineT = 0; game.dieT = 0; game.bankedScore = 0;
    Audio.setIntense(false);
    document.body.classList.remove('cine');
    camYaw = Math.PI; camPitch = 0.32;
    updateHud(true);
  }

  function startWave(n) {
    game.wave = n;
    const idx = Math.min(n - 1, CFG.waves.length - 1);
    let def = CFG.waves[idx];
    if (game.overtime) {
      const L = game.otLevel;
      def = { drones: 8 + L * 2, walkers: 5 + L, copiers: 2 + Math.floor(L / 2), shredders: 1 + Math.floor(L / 2), boss: (n % 5 === 0) };
    }
    game.spawnQueue = [];
    for (let i = 0; i < (def.drones || 0); i++) game.spawnQueue.push('drone');
    for (let i = 0; i < (def.walkers || 0); i++) game.spawnQueue.push('walker');
    for (let i = 0; i < (def.copiers || 0); i++) game.spawnQueue.push('copier');
    for (let i = 0; i < (def.shredders || 0); i++) game.spawnQueue.push('shredder');
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
    showAnnounce('WAVE CLEAR', '+250 EFFICIENCY BONUS', 1800);
    addScore(250, null);
    Audio.sfx.wave();
    if (!offerPerks()) game.betweenT = 3.2;
  }

  // ---- perk draft ----
  function offerPerks() {
    const avail = PERKS.filter((p) => !player.perks.has(p.id));
    if (avail.length === 0) return false;
    const picks = [];
    while (picks.length < Math.min(3, avail.length)) {
      const c = pick(avail);
      if (!picks.includes(c)) picks.push(c);
    }
    const row = $('perk-row'); row.innerHTML = '';
    picks.forEach((pk) => {
      const el = document.createElement('div');
      el.className = 'perk-card';
      el.innerHTML = `<span class="tag">${pk.tag}</span><h3>${pk.name}</h3><p>${pk.desc}</p>`;
      el.addEventListener('click', () => choosePerk(pk));
      row.appendChild(el);
    });
    game.mode = 'perk';
    $('perks').classList.remove('hidden');
    document.exitPointerLock && document.exitPointerLock();
    Audio.sfx.perk();
    return true;
  }
  function choosePerk(pk) {
    player.perks.add(pk.id);
    if (pk.id === 'parachute') { player.maxHp += 30; player.hp = player.maxHp; }
    $('perks').classList.add('hidden');
    game.mode = 'playing';
    lockPointer();
    game.betweenT = 2.0;
    showAnnounce(pk.name.toUpperCase(), 'PERK ACQUIRED', 1500);
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
    e.popT = 0.15;
    Audio.sfx.hit();
    burst(hitPos || e.mesh.position, e.kind === 'boss' ? 0xff8095 : 0x9fdcff, 0.16, 12);
    flash(hitPos || e.mesh.position, 1.1, 0xbfe2ff);
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
    game.hitstopT = Math.max(game.hitstopT, e.kind === 'boss' ? 0.35 : 0.05);
    if (e.kind === 'boss') game.shake = Math.max(game.shake, 0.8);
    if (e.elite) game.shake = Math.max(game.shake, 0.3);
    game.ult = Math.min(100, game.ult + CFG.ult.perKill);
    if (player.perks.has('vampire')) player.hp = Math.min(player.maxHp, player.hp + 3);
    if (game.combo === 5) { game.tempoMeter = Math.min(100, game.tempoMeter + 30); showAnnounce('ON A ROLL', '+30 TEMPO', 1000); }
    if (game.combo === 10) { game.ult = 100; showAnnounce('RAINMAKER', 'ULTIMATE READY', 1200); }
    if (game.combo === 15) addScore(1000, e.mesh.position);
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
      Audio.setIntense(false);
      if (!game.overtime) return void winGame();
    }
  }

  function hurtPlayer(dmg) {
    if (player.god || player.iframes > 0 || !player.alive) return;
    dmg = Math.round(dmg * (DIFF[game.diff] || DIFF.partner).edmg);
    if (player.shield > 0) {
      const absorbed = Math.min(player.shield, dmg);
      player.shield -= absorbed; dmg -= absorbed;
      if (dmg <= 0) { Audio.sfx.hit(); return; }
    }
    player.hp -= dmg;
    player.sinceHurt = 0;
    player.iframes = 0.5;
    game.combo = 0;
    game.shake = Math.max(game.shake, 0.25);
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
    const dmg = CFG.player.meleeDmg * (player.boost > 0 ? 1.5 : 1) * (player.perks.has('takeover') ? 1.6 : 1);
    const meleeR = CFG.player.meleeR * (player.perks.has('takeover') ? 1.4 : 1);
    for (const e of [...enemies]) {
      _v1.copy(e.mesh.position).sub(player.pos); _v1.y = 0;
      const d = _v1.length();
      if (d < meleeR + e.r) {
        damageEnemy(e, dmg, e.mesh.position);
        game.shake = Math.max(game.shake, 0.13);
        // knockback
        _v1.normalize().multiplyScalar(9);
        e.vel.add(_v1);
      }
    }
    // deflect hazards
    for (const h of hazards) {
      _v1.copy(h.mesh.position).sub(player.pos); _v1.y = 0;
      if (_v1.length() < meleeR + 0.6) { h.life = 0.01; burst(h.mesh.position, 0xffe2a8, 0.14, 8); }
    }
  }

  function careerHtml(promo) {
    return `<br>${rankLineHtml()}` +
      (promo ? `<br><span class="v">★ PROMOTED TO ${promo.toUpperCase()} ★</span>` : '');
  }
  function winGame() {
    game.mode = 'victory';
    document.exitPointerLock && document.exitPointerLock();
    document.body.classList.remove('cine');
    hideEdgeArrows();
    const promo = bankScore();
    const t = Math.round(game.time);
    if (game.score > game.best) { game.best = game.score; store.set('ah_best', game.best); }
    $('vic-stats').innerHTML =
      `Final score <span class="v">${game.score}</span> · Best <span class="v">${game.best}</span><br>` +
      `Machines dismantled <span class="v">${game.kills}</span> · Time on the clock <span class="v">${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}</span>` +
      careerHtml(promo);
    $('victory').classList.remove('hidden');
    ui.hud.classList.remove('on');
    Audio.sfx.fanfare();
  }
  function loseGame() {
    if (!player.alive) return;
    player.alive = false;
    game.mode = 'dying';
    game.dieT = 1.5;
    game.shake = Math.max(game.shake, 0.4);
    document.body.classList.add('cine');
    hideEdgeArrows();
    Audio.sfx.die();
    Audio.setIntense(false);
  }
  function finishGameOver() {
    game.mode = 'gameover';
    document.exitPointerLock && document.exitPointerLock();
    document.body.classList.remove('cine');
    const promo = bankScore();
    if (game.score > game.best) { game.best = game.score; store.set('ah_best', game.best); }
    const t = Math.round(game.time);
    $('go-stats').innerHTML =
      `Score <span class="v">${game.score}</span> · Best <span class="v">${game.best}</span><br>` +
      `Waves survived <span class="v">${Math.max(0, game.wave - 1)}</span> · Machines dismantled <span class="v">${game.kills}</span> · ` +
      `Time <span class="v">${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}</span>` +
      careerHtml(promo);
    $('gameover').classList.remove('hidden');
    ui.hud.classList.remove('on');
  }

  function togglePause(force) {
    if (game.mode === 'playing') {
      game.mode = 'paused';
      $('pause').classList.remove('hidden');
      hideEdgeArrows();
      document.exitPointerLock && document.exitPointerLock();
    } else if (game.mode === 'paused' && !force) {
      $('pause').classList.add('hidden');
      game.mode = 'playing';
      lockPointer();
    }
  }

  function startGame(overtime) {
    resetGame();
    if (overtime) { game.overtime = true; }
    ['title', 'pause', 'gameover', 'victory', 'perks'].forEach((id) => $(id).classList.add('hidden'));
    ui.hud.classList.add('on');
    game.mode = 'playing';
    Audio.startMusic();
    lockPointer();
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
    lockPointer();
    player.hp = player.maxHp;
    startWave(game.wave + 1);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.mode === 'playing') togglePause(true);
  });

  document.querySelectorAll('.diff-btn').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.diff-btn').forEach((x) => x.classList.remove('sel'));
    b.classList.add('sel');
    game.diff = b.dataset.diff;
  }));

  function updateHud(force) {
    ui.hpFill.style.width = clamp(player.hp / player.maxHp * 100, 0, 100) + '%';
    ui.hp.classList.toggle('low', player.hp < 30);
    ui.watch.style.width = clamp(game.tempoMeter, 0, 100) + '%';
    ui.ult.style.width = clamp(game.ult, 0, 100) + '%';
    ui.ultbar.classList.toggle('full', game.ult >= 100);
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
    const maxSpd = P.speed * (player.boost > 0 ? 1.25 : 1) * (player.perks.has('espresso') ? 1.1 : 1);

    if (player.dashT > 0) {
      player.dashT -= rawDt;
      player.ghostT -= rawDt;
      if (player.ghostT <= 0) { spawnGhost(); player.ghostT = 0.09; }
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
      player.dashCd = P.dashCd * (player.perks.has('noncompete') ? 0.6 : 1);
      player.dashT = P.dashT;
      player.iframes = Math.max(player.iframes, player.perks.has('noncompete') ? 0.55 : 0.3);
      spawnGhost(); player.ghostT = 0.09;
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
      const dmg = P.penDmg * (player.boost > 0 ? 1.5 : 1) * (player.perks.has('billable') ? 1.3 : 1);
      _aim.copy(aimDirection());
      firePen(_aim, dmg);
      if (player.perks.has('triple')) {
        firePen(_v4.copy(_aim).applyAxisAngle(UP, 0.13), dmg * 0.6);
        firePen(_v4.copy(_aim).applyAxisAngle(UP, -0.13), dmg * 0.6);
      }
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
          player.boost = player.perks.has('espresso') ? 16 : 8;
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
      } else if (e.kind === 'shredder') {
        e.blade.rotation.x += dt * (e.state === 'charge' ? 40 : 8);
        e.atkCd = Math.max(0, e.atkCd - dt);
        if (e.state === 'stalk') {
          _v2.set(toP.x, 0, toP.z).normalize();
          e.mesh.position.x += _v2.x * 2.3 * dt;
          e.mesh.position.z += _v2.z * 2.3 * dt;
          e.mesh.lookAt(player.pos.x, 0, player.pos.z);
          if (distXZ < 17 && e.atkCd <= 0) {
            e.state = 'telegraph'; e.stateT = 0.75;
            e.eye.scale.set(1.6, 2.2, 1.6);
            Audio.sfx.tick();
          }
        } else if (e.state === 'telegraph') {
          e.stateT -= dt;
          e.mesh.position.x += rand(-0.04, 0.04);
          e.mesh.position.z += rand(-0.04, 0.04);
          e.mesh.lookAt(player.pos.x, 0, player.pos.z);
          if (e.stateT <= 0) {
            e.state = 'charge'; e.stateT = 1.15;
            e.chargeDir.set(toP.x, 0, toP.z).normalize();
            Audio.sfx.dash();
          }
        } else if (e.state === 'charge') {
          e.stateT -= dt;
          e.mesh.position.addScaledVector(e.chargeDir, 16.5 * dt);
          if (distXZ < e.r + 0.8 && e.hitCd <= 0) {
            e.hitCd = 1.2; hurtPlayer(18);
            player.vel.addScaledVector(e.chargeDir, 9);
          }
          const rr0 = Math.hypot(e.mesh.position.x, e.mesh.position.z);
          if (e.stateT <= 0 || rr0 > CFG.arenaR + 1.5) {
            e.state = 'dizzy'; e.stateT = 1.1;
            e.eye.scale.set(1, 1, 1);
            burst(e.mesh.position, 0xb9c2d6, 0.16, 10);
          }
        } else { // dizzy
          e.stateT -= dt;
          e.mesh.rotation.y += dt * 3.5;
          if (e.stateT <= 0) { e.state = 'stalk'; e.atkCd = rand(2.4, 3.8); }
        }
      } else if (e.kind === 'boss') {
        updateBoss(e, dt, toP, distXZ);
      }

      // hit pop
      if (e.popT > 0) {
        e.popT = Math.max(0, e.popT - dt);
        e.mesh.scale.setScalar((e.baseScale || 1) * (1 + 0.16 * (e.popT / 0.15)));
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

    // slam queue: staggered shockwave rings from under the boss
    if (e.slamN > 0) {
      e.slamT -= dt;
      if (e.slamT <= 0) {
        spawnSlamRing(e.mesh.position.x, e.mesh.position.z);
        e.slamN--; e.slamT = 0.75;
      }
    }
    e.atkT -= dt;
    if (e.atkT <= 0) {
      const roll = Math.random();
      if (roll < 0.28 && distXZ < 26) {
        // slam — expanding ground rings; jump over them
        e.slamN = e.phase === 2 ? 4 : 3; e.slamT = 0.3;
        e.atkT = e.phase === 2 ? 3.4 : 4.4;
        showAnnounce('SLAM', 'JUMP THE SHOCKWAVES', 1200);
        Audio.sfx.alarm();
      } else if (roll < 0.55) {
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
      p.prev.copy(p.mesh.position);
      p.mesh.position.addScaledVector(p.vel, playerDt);
      p.mesh.rotateZ(playerDt * 14);
      let stop = false;
      for (const e of enemies) {
        if (e === p.lastHit) continue;
        const hitR = e.r + 0.25;
        const ep = e.kind === 'drone' || e.kind === 'boss' ? e.mesh.position : _v2.copy(e.mesh.position).setY(1.1);
        // swept test — fast pens cover several metres per frame and would tunnel
        if (segDistSq(p.prev, p.mesh.position, ep) < hitR * hitR ||
            (e.kind === 'walker' && segDistSq(p.prev, p.mesh.position, _v3.copy(e.mesh.position).setY(1.9)) < 0.6)) {
          let d = p.dmg;
          const crit = Math.random() < 0.12;
          if (crit) {
            d *= 2.2;
            flash(p.mesh.position, 1.8, 0xffd34d);
            worldPopup(p.mesh.position, 'CRIT ' + Math.round(d), 'crit');
            Audio.sfx.tick();
          } else if (Math.random() < 0.35) {
            worldPopup(p.mesh.position, String(Math.round(d)), 'dmg');
          }
          damageEnemy(e, d, p.mesh.position);
          p.lastHit = e;
          if (p.pierce > 0) p.pierce--; else stop = true;
          break;
        }
      }
      if (stop || p.life <= 0 || p.mesh.position.y < 0) {
        p.active = false; p.mesh.visible = false;
      }
    }
    // hazards
    for (let i = hazards.length - 1; i >= 0; i--) {
      const h = hazards[i];
      h.life -= dt;
      h.vel.y -= h.grav * dt;
      _v4.copy(h.mesh.position);
      h.mesh.position.addScaledVector(h.vel, dt);
      if (h.kind === 'wad') h.mesh.rotation.x += dt * 8;
      // hit player (swept — shards are fast)
      _v1.copy(player.pos); _v1.y += 1.0;
      const hr = h.r + 0.55;
      if (segDistSq(_v4, h.mesh.position, _v1) < hr * hr) {
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

  // ambient world life: rain, steam, beacons, neon flicker, flashes, dash ghosts
  function updateAmbient(dt) {
    rain.update(dt);
    for (const v of steamVents) {
      v.t += dt;
      for (let i = 0; i < v.n; i++) {
        const s = v.seed[i];
        const y = ((s.ph + v.t * s.sp) % 4.4);
        v.pos[i * 3] = v.ox + Math.sin(y * 1.7 + i) * 0.22 * s.wig * y;
        v.pos[i * 3 + 1] = y;
        v.pos[i * 3 + 2] = v.oz + Math.cos(y * 1.4 + i * 2) * 0.2 * s.wig * y;
      }
      v.pts.geometry.attributes.position.needsUpdate = true;
    }
    const tt = performance.now() * 0.001;
    for (const b of beacons) b.m.visible = Math.sin(tt * 2.4 + b.ph) > -0.2;
    for (const s of neonSigns) {
      s.cd -= dt;
      if (s.cd <= 0 && s.flickerT <= 0) { s.flickerT = rand(0.08, 0.45); s.cd = rand(4, 15); }
      if (s.flickerT > 0) {
        s.flickerT -= dt;
        s.m.material.color.setScalar(Math.random() < 0.5 ? 0.3 : 1);
        if (s.flickerT <= 0) s.m.material.color.setScalar(1);
      }
    }
    for (const f of flashes) {
      if (f.life > 0) {
        f.life -= dt;
        f.sp.material.opacity = Math.max(0, f.life / f.max);
        if (f.life <= 0) f.sp.visible = false;
      }
    }
    for (let i = ghosts.length - 1; i >= 0; i--) {
      const g = ghosts[i];
      g.life -= dt;
      g.mat.opacity = 0.32 * Math.max(0, g.life / g.max);
      if (g.life <= 0) { scene.remove(g.g); g.mat.dispose(); ghosts.splice(i, 1); }
    }
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
    // impact shake
    if (game.shake > 0.001) {
      camera.position.x += (Math.random() - 0.5) * game.shake;
      camera.position.y += (Math.random() - 0.5) * game.shake * 0.6;
      camera.position.z += (Math.random() - 0.5) * game.shake;
      game.shake *= Math.max(0, 1 - 6 * rawDt);
    } else game.shake = 0;
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
        FX.bloom = false; FX.rain = false;
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
      let worldDt = rawDt * ts;
      let playerDt = rawDt * (game.tempoActive ? CFG.tempo.playerScale : 1);
      if (game.hitstopT > 0) { game.hitstopT -= rawDt; worldDt *= 0.06; playerDt *= 0.06; }
      game.time += rawDt;

      updatePlayer(playerDt, rawDt);
      updateEnemies(worldDt);
      updateProjectiles(worldDt, playerDt);
      updateSlamRings(worldDt);
      updateDirector(worldDt);
      updateFx(rawDt * (ts === 1 ? 1 : 0.55));
      updateHud();
      updateEdgeArrows();
      autoQuality(rawDt);
    } else if (game.mode === 'cinematic') {
      // boss introduction: letterboxed dolly toward The Deadline
      game.cineT -= rawDt;
      if (boss) {
        _v1.copy(player.pos).sub(boss.mesh.position).setY(0).normalize();
        _v2.set(
          boss.mesh.position.x + _v1.x * 11.5,
          boss.mesh.position.y + 2.4,
          boss.mesh.position.z + _v1.z * 11.5
        );
        camera.position.lerp(_v2, 1 - Math.pow(0.001, rawDt));
        camera.lookAt(boss.mesh.position);
        boss.t += rawDt;
        boss.hourHand.rotation.z = -boss.t * 0.35;
        boss.minHand.rotation.z = -boss.t * 1.7;
        boss.glow.intensity = 1.2 + Math.sin(boss.t * 6) * 0.5;
      }
      updateFx(rawDt * 0.4);
      if (game.cineT <= 0 || !boss) {
        game.mode = 'playing';
        document.body.classList.remove('cine');
      }
    } else if (game.mode === 'dying') {
      // slow collapse + orbiting camera before the terminated screen
      game.dieT -= rawDt;
      heroRig.body.rotation.x = lerp(heroRig.body.rotation.x, -1.5, 1 - Math.pow(0.02, rawDt));
      camYaw += rawDt * 0.6;
      camPitch = Math.min(1.0, camPitch + rawDt * 0.35);
      updateFx(rawDt * 0.25);
      updateHud();
      if (game.dieT <= 0) finishGameOver();
    } else {
      // idle scene motion on menus
      updateFx(rawDt * 0.6);
      if (game.mode === 'title') {
        const t = performance.now() * 0.00012;
        camera.position.set(Math.sin(t) * 16, 6.5 + Math.sin(t * 0.7) * 1.5, Math.cos(t) * 16);
        camera.lookAt(0, 2, 0);
      }
    }
    updateAmbient(rawDt);
    if (game.mode !== 'title' && game.mode !== 'lookdev' && game.mode !== 'cinematic') updateCamera(rawDt);
    if (FX.bloom) composer.render(); else renderer.render(scene, camera);
  }

  // idle hero pose on title screen
  heroRig.root.position.set(0, 0, 6);
  updateRankLine();
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
        hp: player.hp, maxHp: player.maxHp, shield: player.shield, tempo: game.tempoMeter,
        ult: game.ult, perks: [...player.perks], diff: game.diff, rings: slamRings.length,
        xp: careerXp, rank: RANKS[rankIdx(careerXp)][0], shake: +game.shake.toFixed(3),
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
    pickPerk(i) { const c = $('perk-row').children[i || 0]; if (c) c.click(); },
    ult() { game.ult = 100; fireUlt(); },
    setFx(o) { Object.assign(FX, o); },
    setDiff(d) { game.diff = d; },
    slam(x, z) { spawnSlamRing(x || 0, z || 0); },
    skipCine() { if (game.mode === 'cinematic') game.cineT = 0.01; },
    settings: SETTINGS,
  };
})();
