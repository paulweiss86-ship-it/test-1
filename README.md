# test-1

## Podcast Bonus-Sheet Template (Rayk Hahne · Unternehmerwissen)

`podcast-summary-template.html` is a self-contained, modular HTML template for
episode summary sheets of the podcast **"Unternehmerwissen in 15 Minuten"**.
For each new episode, the script is filled into the template and the result is
delivered to listeners as a bonus asset (web page or printed/PDF handout).

### Workflow per episode

1. Duplicate the file (e.g. `folge-1336.html`).
2. Update the header block: episode number, title, date, duration, format,
   shownotes link.
3. Fill the modules with content from the episode script.
4. Delete modules that don't apply (e.g. the guest profile for solo episodes) —
   each `<section class="module">` is independent and the layout adapts.
5. Optional: export as PDF via the browser's print dialog (A4-optimized).

### Modules

| # | Module | Purpose | Optional |
|---|--------|---------|----------|
| 01 | Darum geht's | 2–3 sentence hook / episode intro | no |
| 02 | Kernpunkte | The 3 most important takeaways (TL;DR cards) | no |
| 03 | Themen im Überblick | Chapter list with timestamps | yes |
| 04 | Gast-Profil | Guest bio with links | yes (solo episodes) |
| 05 | Erkenntnisse | Deep-dive insights (add/remove blocks freely) | no |
| 06 | Zitat | Quote of the episode | yes |
| 07 | Trainingsplan | Actionable weekly checklist (print &amp; tick off) | no |
| 08 | Ressourcen | Links and resources mentioned in the episode | yes |
| 09 | Call-to-Action | Booking CTA (raykhahne.de/austausch) | yes |

### Theming

All colors are defined as CSS variables in `:root`. The default theme matches
the Rayk Hahne brand identity (based on screenshots of raykhahne.de):
black/anthracite surfaces, a gold gradient (`#A9862A → #D9B44A → #EED688`) for
accents, pill buttons and the RH monogram, white uppercase headlines, and light
sections with soft white rounded cards. Special formats only need adjusted
`--gold*` variables / `--grad` gradient.
