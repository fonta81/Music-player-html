// Genera manifest.json desde ./music/   Uso: node tools/gen-manifest.js
import { readdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Raíz del repo
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const musicDir = join(root, 'music');
const out = join(musicDir, 'manifest.json');
// OJO: regex duplicada en js/app.js (AUDIO_EXT)
const AUDIO = /\.(mp3|ogg|wav|m4a|flac|opus)$/i;

// Reutiliza metadata del manifest anterior
let prev = [];
try {
  if (existsSync(out)) {
    const raw = JSON.parse(readFileSync(out, 'utf8'));
    prev = Array.isArray(raw) ? raw : raw.tracks || [];
  }
} catch { }

// Archivos de audio en music/ (sin recursión)
const files = readdirSync(musicDir).filter((f) => AUDIO.test(f)).sort();
const bySrc = new Map(prev.map((t) => [t.src, t]));

// Conserva entrada previa o deriva de "Artista - Título.ext"
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

// Sobrescribe manifest.json
writeFileSync(out, JSON.stringify(tracks, null, 2) + '\n');
console.log(`manifest.json: ${tracks.length} canciones`);
