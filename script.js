/* ============================================================
   Paul Weiss — AI Consultant
   Interactions & animations (no dependencies)
   ============================================================ */

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- Intro loader ---------- */

(function initLoader() {
  const loader = document.querySelector(".loader");
  const html = document.documentElement;
  if (!loader) {
    html.classList.remove("loading");
    return;
  }
  if (prefersReducedMotion) {
    html.classList.remove("loading");
    loader.remove();
    return;
  }

  let finished = false;
  const done = () => {
    if (finished) return;
    finished = true;
    html.classList.remove("loading");
    loader.classList.add("is-done");
    document.dispatchEvent(new CustomEvent("pw:loaded"));
    setTimeout(() => loader.remove(), 900);
  };

  if (document.readyState === "complete") {
    setTimeout(done, 900);
  } else {
    window.addEventListener("load", () => setTimeout(done, 400));
    setTimeout(done, 2400); // never hold the page hostage
  }
})();

/* ---------- Nav: glass background after scrolling ---------- */

const nav = document.getElementById("nav");
const onScroll = () => nav.classList.toggle("is-scrolled", window.scrollY > 24);
onScroll();
window.addEventListener("scroll", onScroll, { passive: true });

/* ---------- Scroll reveal (staggered per section) ---------- */

const revealEls = document.querySelectorAll(".reveal");

// Stagger siblings that enter together: delay grows with index within parent
revealEls.forEach((el) => {
  const siblings = [...el.parentElement.querySelectorAll(":scope > .reveal")];
  const i = siblings.indexOf(el);
  if (i > 0) el.style.setProperty("--reveal-delay", `${Math.min(i * 0.09, 0.45)}s`);
});

if ("IntersectionObserver" in window) {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
  );

  revealEls.forEach((el) => revealObserver.observe(el));

  // Watchdog: if anything in the viewport is still hidden a few seconds
  // after load (observer quirks in embedded browsers), reveal it.
  setTimeout(() => {
    revealEls.forEach((el) => {
      if (el.getBoundingClientRect().top < innerHeight) {
        el.classList.add("is-visible");
      }
    });
  }, 3000);
} else {
  revealEls.forEach((el) => el.classList.add("is-visible"));
}

/* ---------- Hero: neural-network particle canvas ---------- */

(function initParticles() {
  if (prefersReducedMotion) return;
  const canvas = document.querySelector(".hero-canvas");
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext("2d");
  const COLORS = ["94,92,230", "191,90,242", "100,210,255"];
  const LINK_DIST = 130;
  let w, h, particles = [], sparks = [];
  let raf = null;
  const mouse = { x: -9999, y: -9999 };

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.min(Math.floor(w / 14), 110);
    particles = Array.from({ length: count }, () => {
      const bvx = (Math.random() - 0.5) * 0.35;
      const bvy = (Math.random() - 0.5) * 0.35;
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        vx: bvx, vy: bvy,   // current velocity
        bvx, bvy,           // base drift it always eases back to
        r: Math.random() * 1.8 + 0.6,
        c: COLORS[(Math.random() * COLORS.length) | 0],
      };
    });
  }

  // launch moment: gather everything at the center and blast it outward;
  // the easing back to base velocity settles it into the normal drift
  let burstDone = false;
  function burst() {
    if (burstDone || !particles.length) return;
    burstDone = true;
    for (const p of particles) {
      p.x = w / 2 + (Math.random() - 0.5) * 60;
      p.y = h * 0.45 + (Math.random() - 0.5) * 60;
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 8;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
    }
  }
  document.addEventListener("pw:loaded", burst, { once: true });
  setTimeout(burst, 3200); // in case the loader never announced itself

  // tap / click sparks
  canvas.parentElement.addEventListener("pointerdown", (e) => {
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    for (let i = 0; i < 14 && sparks.length < 90; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 4.5;
      sparks.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        c: COLORS[(Math.random() * COLORS.length) | 0],
      });
    }
  }, { passive: true });

  function step() {
    ctx.clearRect(0, 0, w, h);

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      // ease back toward the base drift (no-op unless bursting)
      p.vx += (p.bvx - p.vx) * 0.03;
      p.vy += (p.bvy - p.vy) * 0.03;
      const dx = mouse.x - p.x, dy = mouse.y - p.y;
      if (dx * dx + dy * dy < 160 * 160) {
        p.x += dx * 0.004;
        p.y += dy * 0.004;
      }
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
      p.x = Math.max(0, Math.min(w, p.x));
      p.y = Math.max(0, Math.min(h, p.y));
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, 7);
      ctx.fillStyle = `rgba(${p.c},0.7)`;
      ctx.fill();
    }

    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.x += s.vx;
      s.y += s.vy;
      s.vx *= 0.96;
      s.vy *= 0.96;
      s.life -= 0.022;
      if (s.life <= 0) { sparks.splice(i, 1); continue; }
      ctx.beginPath();
      ctx.arc(s.x, s.y, 1.6 * s.life + 0.4, 0, 7);
      ctx.fillStyle = `rgba(${s.c},${s.life * 0.9})`;
      ctx.fill();
    }

    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const a = particles[i], b = particles[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < LINK_DIST * LINK_DIST) {
          ctx.strokeStyle = `rgba(140,140,255,${(1 - Math.sqrt(d2) / LINK_DIST) * 0.16})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    raf = requestAnimationFrame(step);
  }

  const start = () => { if (raf === null) raf = requestAnimationFrame(step); };
  const stop = () => { if (raf !== null) { cancelAnimationFrame(raf); raf = null; } };

  resize();
  window.addEventListener("resize", resize);
  canvas.parentElement.addEventListener("mousemove", (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
  }, { passive: true });
  canvas.parentElement.addEventListener("mouseleave", () => {
    mouse.x = -9999;
    mouse.y = -9999;
  });

  // only burn cycles while the hero is on screen and the tab is visible
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(
      ([entry]) => (entry.isIntersecting ? start() : stop()),
      { threshold: 0.05 }
    ).observe(canvas.parentElement);
  } else {
    start();
  }
  document.addEventListener("visibilitychange", () => {
    document.hidden ? stop() : start();
  });
})();

/* ---------- Custom cursor: dot + trailing ring ---------- */

(function initCursor() {
  if (prefersReducedMotion) return;
  if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  const dot = document.querySelector(".cursor-dot");
  const ring = document.querySelector(".cursor-ring");
  if (!dot || !ring) return;

  document.documentElement.classList.add("cursor-on");
  let x = innerWidth / 2, y = innerHeight / 2;
  let rx = x, ry = y;
  let hovering = false;

  window.addEventListener("mousemove", (e) => {
    x = e.clientX;
    y = e.clientY;
    dot.style.opacity = ring.style.opacity = "1";
    hovering = !!(e.target.closest && e.target.closest("a, button, .tilt"));
  }, { passive: true });

  document.addEventListener("mouseleave", () => {
    dot.style.opacity = ring.style.opacity = "0";
  });

  (function loop() {
    rx += (x - rx) * 0.16;
    ry += (y - ry) * 0.16;
    dot.style.transform = `translate(${x}px, ${y}px)`;
    ring.style.transform = `translate(${rx}px, ${ry}px) scale(${hovering ? 1.6 : 1})`;
    requestAnimationFrame(loop);
  })();
})();

/* ---------- Cursor glow ---------- */

const glow = document.querySelector(".cursor-glow");
if (glow && !prefersReducedMotion) {
  let gx = innerWidth / 2, gy = innerHeight / 2;
  let tx = gx, ty = gy;

  window.addEventListener("mousemove", (e) => {
    tx = e.clientX;
    ty = e.clientY;
    glow.style.opacity = "1";
  });

  (function animateGlow() {
    gx += (tx - gx) * 0.08;
    gy += (ty - gy) * 0.08;
    glow.style.left = gx + "px";
    glow.style.top = gy + "px";
    requestAnimationFrame(animateGlow);
  })();
}

/* ---------- Unified motion loop: progress bar, hero parallax, blobs ---------- */

(function initMotion() {
  const progress = document.querySelector(".scroll-progress");
  const heroContent = document.querySelector(".hero__content");
  const marquee = document.querySelector(".marquee");
  const blobs = [...document.querySelectorAll(".blob")];
  const blobDrift = [0.05, -0.06, 0.04];
  let mouseNX = 0, mouseNY = 0;
  let lastY = window.scrollY, skew = 0;
  let pending = false;

  function apply() {
    pending = false;
    const y = window.scrollY;

    if (progress) {
      const max = document.documentElement.scrollHeight - innerHeight;
      progress.style.transform = `scaleX(${max > 0 ? Math.min(y / max, 1) : 0})`;
    }

    if (prefersReducedMotion) { lastY = y; return; }

    // hero shrinks and fades as it scrolls out of view
    if (heroContent && y < innerHeight) {
      const p = y / innerHeight;
      heroContent.style.transform = `translateY(${y * 0.3}px) scale(${1 - p * 0.1})`;
      heroContent.style.opacity = Math.max(1 - p * 1.15, 0);
    }

    // logo marquee skews with scroll velocity, then relaxes
    const velocity = y - lastY;
    lastY = y;
    skew += (Math.max(-8, Math.min(8, -velocity * 0.25)) - skew) * 0.18;
    if (marquee) marquee.style.transform = `skewX(${skew.toFixed(2)}deg)`;
    if (Math.abs(skew) > 0.05) request(); // keep relaxing after scroll stops

    // blobs: pointer/tilt parallax + slow scroll drift for depth.
    // Margins are used because transform belongs to the drift keyframes.
    blobs.forEach((blob, i) => {
      const depth = (i + 1) * 14;
      blob.style.marginLeft = mouseNX * depth + "px";
      blob.style.marginTop = mouseNY * depth + y * blobDrift[i] + "px";
    });
  }

  function request() {
    if (!pending) {
      pending = true;
      requestAnimationFrame(apply);
    }
  }

  window.addEventListener("scroll", request, { passive: true });

  if (matchMedia("(hover: hover)").matches) {
    window.addEventListener("mousemove", (e) => {
      mouseNX = e.clientX / innerWidth - 0.5;
      mouseNY = e.clientY / innerHeight - 0.5;
      request();
    }, { passive: true });
  } else if (window.DeviceOrientationEvent && !prefersReducedMotion) {
    // touch devices: tilt the phone to move the liquid background
    const onTilt = (e) => {
      if (e.gamma == null || e.beta == null) return;
      mouseNX = Math.max(-0.9, Math.min(0.9, e.gamma / 25));
      mouseNY = Math.max(-0.9, Math.min(0.9, (e.beta - 40) / 25));
      request();
    };
    const attach = () =>
      window.addEventListener("deviceorientation", onTilt, { passive: true });
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
      // iOS only grants motion access after a user gesture
      window.addEventListener("touchend", function ask() {
        DeviceOrientationEvent.requestPermission()
          .then((state) => { if (state === "granted") attach(); })
          .catch(() => {});
      }, { once: true, passive: true });
    } else {
      attach();
    }
  }

  request();
})();

/* ---------- Mobile menu ---------- */

(function initMobileMenu() {
  const burger = document.querySelector(".nav__burger");
  const menu = document.querySelector(".mobile-menu");
  if (!burger || !menu) return;

  const set = (open) => {
    menu.classList.toggle("is-open", open);
    burger.classList.toggle("is-open", open);
    burger.setAttribute("aria-expanded", String(open));
    menu.setAttribute("aria-hidden", String(!open));
    document.body.style.overflow = open ? "hidden" : "";
  };

  burger.addEventListener("click", () => set(!menu.classList.contains("is-open")));
  menu.querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", () => set(false))
  );
})();

/* ---------- Word-by-word title reveal ---------- */

if (!prefersReducedMotion && "IntersectionObserver" in window) {
  const titles = [...document.querySelectorAll(".section__title")];

  titles.forEach((title) => {
    let wi = 0;
    (function walk(node) {
      [...node.childNodes].forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) {
              frag.appendChild(document.createTextNode(part));
              return;
            }
            const w = document.createElement("span");
            w.className = "word";
            w.style.setProperty("--wi", wi++);
            w.textContent = part;
            frag.appendChild(w);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === Node.ELEMENT_NODE && child.tagName !== "BR") {
          walk(child);
        }
      });
    })(title);
    title.classList.add("split");
  });

  const titleObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("words-in");
          titleObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.3 }
  );

  titles.forEach((t) => titleObserver.observe(t));

  // same watchdog idea as the section reveals
  setTimeout(() => {
    titles.forEach((t) => {
      if (t.getBoundingClientRect().top < innerHeight) t.classList.add("words-in");
    });
  }, 3000);
}

/* ---------- 3D tilt cards + spotlight tracking ---------- */

if (!prefersReducedMotion && matchMedia("(hover: hover)").matches) {
  document.querySelectorAll(".tilt").forEach((card) => {
    card.addEventListener("mousemove", (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      card.style.setProperty("--mx", px * 100 + "%");
      card.style.setProperty("--my", py * 100 + "%");
      const rx = (0.5 - py) * 7;
      const ry = (px - 0.5) * 7;
      card.style.transform =
        `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-4px)`;
    });
    card.addEventListener("mouseleave", () => {
      card.style.transform =
        "perspective(900px) rotateX(0deg) rotateY(0deg) translateY(0)";
    });
    card.style.transition = "transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)";
  });
}

/* ---------- Magnetic buttons ---------- */

if (!prefersReducedMotion && matchMedia("(hover: hover)").matches) {
  document.querySelectorAll(".magnetic").forEach((btn) => {
    btn.addEventListener("mousemove", (e) => {
      const r = btn.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      btn.style.transform = `translate(${dx * 0.18}px, ${dy * 0.3}px)`;
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.transform = "translate(0, 0)";
    });
  });
}

/* ---------- Animated counters ---------- */

const easeOut = (t) => 1 - Math.pow(1 - t, 4);

function animateCounter(el) {
  const target = parseInt(el.dataset.target, 10);
  const duration = 1800;
  const start = performance.now();

  (function tick(now) {
    const t = Math.min((now - start) / duration, 1);
    el.textContent = Math.round(easeOut(t) * target);
    if (t < 1) requestAnimationFrame(tick);
  })(start);
}

const counterObserver = "IntersectionObserver" in window
  ? new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            animateCounter(entry.target);
            counterObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.6 }
    )
  : null;

// Counters hold their final value in the HTML (so they read correctly
// without JS); zero them out only once we know we can animate.
document.querySelectorAll(".counter").forEach((el) => {
  if (!prefersReducedMotion && "IntersectionObserver" in window) {
    el.textContent = "0";
    counterObserver.observe(el);
  }
});

/* ---------- Eyebrow text scramble ---------- */

(function initScramble() {
  if (prefersReducedMotion || !("IntersectionObserver" in window)) return;
  const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ01<>/#+*";
  // only plain-text eyebrows (the hero one contains the pulse dot)
  const eyebrows = [...document.querySelectorAll(".section__eyebrow")]
    .filter((el) => !el.children.length);

  function scramble(el) {
    const final = el.textContent;
    const total = Math.max(16, final.length * 2.5);
    let frame = 0;
    (function tick() {
      frame++;
      const settled = Math.floor((final.length * frame) / total);
      el.textContent =
        final.slice(0, settled) +
        [...final.slice(settled)]
          .map((ch) => (ch === " " ? " " : CHARS[(Math.random() * CHARS.length) | 0]))
          .join("");
      if (settled < final.length) requestAnimationFrame(tick);
      else el.textContent = final;
    })();
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        scramble(entry.target);
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });

  eyebrows.forEach((el) => io.observe(el));
})();

/* ---------- Button click ripple ---------- */

document.querySelectorAll(".btn").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    const r = btn.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 2.2;
    const ripple = document.createElement("span");
    ripple.className = "ripple";
    ripple.style.width = ripple.style.height = size + "px";
    ripple.style.left = e.clientX - r.left - size / 2 + "px";
    ripple.style.top = e.clientY - r.top - size / 2 + "px";
    btn.appendChild(ripple);
    ripple.addEventListener("animationend", () => ripple.remove());
  });
});

/* ---------- Contact panel spotlight ---------- */

(function initContactSpotlight() {
  const panel = document.querySelector(".contact__panel");
  if (!panel || !matchMedia("(hover: hover)").matches) return;
  panel.addEventListener("mousemove", (e) => {
    const r = panel.getBoundingClientRect();
    panel.style.setProperty("--mx", ((e.clientX - r.left) / r.width) * 100 + "%");
    panel.style.setProperty("--my", ((e.clientY - r.top) / r.height) * 100 + "%");
  }, { passive: true });
})();

/* ---------- Testimonial carousel ---------- */

(function initCarousel() {
  const track = document.querySelector(".carousel__track");
  if (!track) return;

  const slides = track.children.length;
  const dotsWrap = document.querySelector(".carousel__dots");
  let index = 0;
  let timer;

  for (let i = 0; i < slides; i++) {
    const dot = document.createElement("button");
    dot.className = "carousel__dot";
    dot.setAttribute("aria-label", `Testimonial ${i + 1}`);
    dot.addEventListener("click", () => goTo(i, true));
    dotsWrap.appendChild(dot);
  }

  const dots = [...dotsWrap.children];

  function goTo(i, manual = false) {
    index = (i + slides) % slides;
    track.style.transform = `translateX(-${index * 100}%)`;
    dots.forEach((d, j) => d.classList.toggle("is-active", j === index));
    [...track.children].forEach((q, j) => q.classList.toggle("is-active", j === index));
    if (manual) restartAutoplay();
  }

  function restartAutoplay() {
    clearInterval(timer);
    if (!prefersReducedMotion) timer = setInterval(() => goTo(index + 1), 6000);
  }

  document.querySelectorAll(".carousel__btn").forEach((btn) => {
    btn.addEventListener("click", () => goTo(index + parseInt(btn.dataset.dir, 10), true));
  });

  // swipe: track follows the finger, then snaps
  const viewport = document.querySelector(".carousel__viewport");
  if (viewport && window.PointerEvent) {
    let startX = 0, dx = 0, dragging = false;
    viewport.style.touchAction = "pan-y"; // browser keeps vertical scroll

    viewport.addEventListener("pointerdown", (e) => {
      dragging = true;
      startX = e.clientX;
      dx = 0;
      track.style.transition = "none";
      clearInterval(timer);
      viewport.setPointerCapture(e.pointerId);
    });

    viewport.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      dx = e.clientX - startX;
      track.style.transform = `translateX(calc(-${index * 100}% + ${dx}px))`;
    });

    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      track.style.transition = "";
      const threshold = viewport.clientWidth * 0.18;
      if (dx < -threshold) goTo(index + 1, true);
      else if (dx > threshold) goTo(index - 1, true);
      else goTo(index, true);
    };

    viewport.addEventListener("pointerup", endDrag);
    viewport.addEventListener("pointercancel", endDrag);
  }

  goTo(0);
  restartAutoplay();
})();
