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

/* ---------- Blob parallax on mouse ---------- */

if (!prefersReducedMotion && matchMedia("(hover: hover)").matches) {
  const blobs = document.querySelectorAll(".blob");
  window.addEventListener("mousemove", (e) => {
    const nx = e.clientX / innerWidth - 0.5;
    const ny = e.clientY / innerHeight - 0.5;
    blobs.forEach((blob, i) => {
      const depth = (i + 1) * 14;
      // Offset via CSS variables would fight the drift keyframes,
      // so shift the blob's parent-relative position instead.
      blob.style.marginLeft = nx * depth + "px";
      blob.style.marginTop = ny * depth + "px";
    });
  }, { passive: true });
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
