# AFTER HOURS — Paul Weiss vs. The Deadline

A 3D third-person arena action game that runs entirely in the browser. No install,
no build step, no external assets — one hero, one city, one very hostile clock.

> The financial district, 11:58 PM. The office machines have unionized under a
> corrupted mainframe called **THE DEADLINE**, and it has scheduled the end of the
> world for midnight. One consultant stands in its way. Sharp suit. Sharper pens.
> And a silver watch that can bend time itself.

## Play

**Easiest:** open `dist/after-hours.html` in any modern browser — it is a single
self-contained file (Three.js inlined).

**From source:**

```bash
python3 -m http.server 8080   # or any static server, from the repo root
# then open http://localhost:8080
```

Works on desktop (keyboard + mouse with pointer lock) and mobile (virtual
joystick + touch buttons).

## Controls

| Input | Action |
|---|---|
| `W A S D` | Move |
| Mouse | Aim camera |
| Left click / `F` | Throw fountain pen (hold for auto-fire, soft aim assist) |
| `E` | Briefcase swing — melee with knockback, deflects projectiles |
| `R` | **Closing Argument** — ultimate: radial pen storm + shockwave (charged by kills) |
| `Space` | Jump (also dodges the boss's slam shockwaves) |
| `Shift` | Dash (brief invulnerability, afterimage trail) |
| `Q` / Right-click (hold) | **Tempo** — the silver watch slows the world to 22% while you keep moving |
| `M` | Mute music/SFX |
| `P` | Pause |

## The game

- **6 waves** in the neon plaza: hover **drones**, suit-and-tie **walker bots**,
  paper-lobbing **rogue copiers**, and telegraph-then-charge **shredders**, ending
  with **THE DEADLINE** — a building-sized alarm clock with radial shard bursts,
  aimed volleys, minion summons, jump-to-dodge slam shockwaves, and an enraged
  phase below half health.
- **Executive Perks:** a roguelite draft after every wave — choose 1 of 3 from a
  pool of 9 (triple-shot pens, piercing, +damage, melee build, dash build, tempo
  efficiency, max-HP, lifesteal, permanent speed).
- **Closing Argument:** kill-charged ultimate — 24 piercing pens in every
  direction plus a knockback blast.
- **Difficulty:** Associate / Partner / Senior Partner, picked on the title screen.
- **Pickups:** *Double Espresso* (speed + damage + fire-rate) and *Ironclad
  Contract* (40-point shield).
- **Combo scoring** with multiplier and tier bonuses (tempo refill at ×5,
  instant ultimate at ×10); best score kept in `localStorage`.
- **Overtime mode** after victory: endless escalating waves.
- Synthesized soundtrack and SFX via WebAudio — zero audio files.

## Tech notes

- Three.js r147 (vendored UMD build, `vendor/three.min.js`) plus its
  post-processing stack (`vendor/postfx.js`): UnrealBloom + gamma correction,
  with automatic quality scaling that sheds bloom, rain and shadows on weak GPUs.
- One hand-rolled scene: procedural city (canvas-texture windows, neon signs with
  flicker, rooftop beacons and crown lights), gradient sky dome, cube-map
  environment reflections, wet ground with puddles, rain, steam vents, pooled
  projectiles/particles/flashes, dash afterimages, procedural character animation.
- The hero is modeled in primitives on a real person: navy blazer over a black
  turtleneck, dark jeans, short crop and beard, and the silver watch on the left
  wrist that powers the Tempo mechanic.
- `window.__AH` exposes a test API (state snapshot, spawn/kill, god mode,
  input injection) used by the automated suite.

## Development

```bash
npm install          # playwright-core for tests (uses the preinstalled Chromium)
npm test             # 20-check end-to-end suite: boots the game headless with
                     # SwiftShader WebGL, plays through waves, boss, victory,
                     # death and retry, and screenshots every phase
npm run lookdev      # character/boss/environment close-up screenshots
npm run build        # regenerate dist/after-hours.html
```
