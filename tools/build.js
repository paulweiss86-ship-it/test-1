/* Builds dist/after-hours.html — a single self-contained file with Three.js
   and the game inlined, playable offline from anywhere.
   Usage: node tools/build.js */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let html = read('index.html');

// inline every local <script src> so the output is fully self-contained
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => `<script>\n${read(src)}\n</script>`);

if (/<script src=/.test(html)) {
  console.error('build failed: external script tags remain');
  process.exit(1);
}

fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
const out = path.join(ROOT, 'dist', 'after-hours.html');
fs.writeFileSync(out, html);
console.log('built', out, (fs.statSync(out).size / 1024).toFixed(0) + ' KB');
