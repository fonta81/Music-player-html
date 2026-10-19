// Genera music/manifest.json escaneando ./music/*.mp3|ogg|wav|m4a|flac|opus
// Uso: node tools/gen-manifest.js
import { readdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Raíz del repo = directorio padre de tools/, así funciona desde cualquier CWD.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const musicDir = join(root, 'music');
const out = join(musicDir, 'manifest.json');
// OJO: esta regex está DUPLICADA en js/app.js (const AUDIO_EXT); al cambiar los
// formatos soportados hay que actualizar ambas.
const AUDIO = /\.(mp3|ogg|wav|m4a|flac|opus)$/i;

// Lee el manifest anterior para reutilizar la metadata (title/artist/cover)
// de los src que sigan existiendo en disco.
let prev = [];
try {
  if (existsSync(out)) {
    const raw = JSON.parse(readFileSync(out, 'utf8'));
    prev = Array.isArray(raw) ? raw : raw.tracks || [];
  }
} catch { }

// Solo archivos de audio SUELTOS en music/ (readdirSync sin recursión), ordenados.
const files = readdirSync(musicDir).filter((f) => AUDIO.test(f)).sort();
const bySrc = new Map(prev.map((t) => [t.src, t]));

// Por cada archivo: conservar la entrada previa si existe; si no, derivar
// título/artista del nombre con la convención "Artista - Título.ext".
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

// Escritura destructiva: el archivo anterior se sobrescribe completo.
writeFileSync(out, JSON.stringify(tracks, null, 2) + '\n');
console.log(`manifest.json: ${tracks.length} canciones`);
