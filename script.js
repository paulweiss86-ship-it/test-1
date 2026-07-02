/* ============================================================
   Paul Weiss — AI Consultant
   Interactions & animations (no dependencies)
   ============================================================ */

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
  const blobs = [...document.querySelectorAll(".blob")];
  const blobDrift = [0.05, -0.06, 0.04];
  let mouseNX = 0, mouseNY = 0;
  let pending = false;

  function apply() {
    pending = false;
    const y = window.scrollY;

    if (progress) {
      const max = document.documentElement.scrollHeight - innerHeight;
      progress.style.transform = `scaleX(${max > 0 ? Math.min(y / max, 1) : 0})`;
    }

    if (prefersReducedMotion) return;

    // hero shrinks and fades as it scrolls out of view
    if (heroContent && y < innerHeight) {
      const p = y / innerHeight;
      heroContent.style.transform = `translateY(${y * 0.3}px) scale(${1 - p * 0.1})`;
      heroContent.style.opacity = Math.max(1 - p * 1.15, 0);
    }

    // blobs: mouse parallax + slow scroll drift for depth.
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
  }
  request();
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

  goTo(0);
  restartAutoplay();
})();
