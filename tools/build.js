/* Builds dist/after-hours.html — a single self-contained file with Three.js
   and the game inlined, playable offline from anywhere.
   Usage: node tools/build.js */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let html = read('index.html');
const three = read('vendor/three.min.js');
const game = read('src/game.js');

html = html.replace(
  '<script src="vendor/three.min.js"></script>',
  () => `<script>\n${three}\n</script>`
);
html = html.replace(
  '<script src="src/game.js"></script>',
  () => `<script>\n${game}\n</script>`
);

if (html.includes('vendor/three.min.js') || html.includes('src/game.js')) {
  console.error('build failed: script tags not fully inlined');
  process.exit(1);
}

fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
const out = path.join(ROOT, 'dist', 'after-hours.html');
fs.writeFileSync(out, html);
console.log('built', out, (fs.statSync(out).size / 1024).toFixed(0) + ' KB');
