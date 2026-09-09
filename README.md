# Paul Weiss — AI Consultant

A modern, minimalistic, Apple-inspired portfolio website with a dark liquid-gradient design.

## Features

- **Liquid design** — animated gradient blobs, glassmorphism panels, film grain overlay
- **Animations** — staggered hero reveal, scroll-triggered section reveals, animated stat counters, 3D-tilt cards with spotlight tracking, magnetic buttons, cursor glow, logo marquee, auto-playing testimonial carousel
- **Zero dependencies** — plain HTML, CSS, and vanilla JavaScript; no build step
- **Accessible** — respects `prefers-reduced-motion`, semantic markup
- **Responsive** — works from mobile to widescreen

## Run it

Just open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

Deploys as-is to GitHub Pages, Netlify, Vercel, or any static host.

## Structure

| File | Purpose |
| --- | --- |
| `index.html` | Page structure and content |
| `styles.css` | Design system, layout, and CSS animations |
| `script.js` | Scroll reveals, tilt, counters, carousel, cursor effects |
