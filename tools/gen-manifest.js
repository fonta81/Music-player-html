// Genera music/manifest.json escaneando ./music/*.mp3|ogg|wav|m4a|flac|opus
// Uso: node tools/gen-manifest.js
import { readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const musicDir = join(root, 'music');
const out = join(musicDir, 'manifest.json');
const AUDIO = /\.(mp3|ogg|wav|m4a|flac|opus)$/i;

let prev = [];
try {
  if (existsSync(out)) {
    const raw = JSON.parse((await import('node:fs')).readFileSync(out, 'utf8'));
    prev = Array.isArray(raw) ? raw : raw.tracks || [];
  }
} catch {}

const files = readdirSync(musicDir).filter((f) => AUDIO.test(f)).sort();
const bySrc = new Map(prev.map((t) => [t.src, t]));

const tracks = files.map((f) => {
  const src = `music/${f}`;
  if (bySrc.has(src)) return bySrc.get(src);
  const base = f.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  const [artist, ...rest] = base.split(' - ');
  return {
    title: rest.length ? rest.join(' - ') : base || f,
    artist: rest.length ? artist : 'Artista desconocido',
    src,
    cover: '',
  };
});

writeFileSync(out, JSON.stringify(tracks, null, 2) + '\n');
console.log(`manifest.json: ${tracks.length} canciones`);
