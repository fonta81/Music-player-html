/* Reproductor: fuente ./music/manifest.json + upload + File System Access.
   Todo vive dentro de una IIFE para no exponer nada al ámbito global.
   Dependencia: el objeto global `store` (js/store.js), cargado ANTES por index.html. */
(() => {
  // ---------- Referencias al DOM ----------
  const $ = (id) => document.getElementById(id);
  const audio = $('audio'), playlistEl = $('playlist'), searchEl = $('search');
  const playBtn = $('playBtn'), seek = $('seek'), vol = $('vol');
  const emptyState = $('emptyState'), nowPlaying = $('nowPlaying'), countEl = $('count');
  const trackTitle = $('trackTitle'), trackArtist = $('trackArtist');
  const miniTitle = $('miniTitle'), miniArtist = $('miniArtist');
  const coverEl = $('cover'), coverMiniEl = $('coverMini'), favBtn = $('favBtn');
  const shuffleBtn = $('shuffleBtn'), repeatBtn = $('repeatBtn'), muteBtn = $('muteBtn');

  // Estado persistido en localStorage (ver store.js):
  // favorites, volume, lastIndex, shuffle y repeat sobreviven al recargar la página.
  const s = store.load();

  // ---------- Modelo ----------
  let tracks = [];       // [{title, artist, src, cover, local?}]; la identidad de la pista es su `src`
  let order = [];        // índices a `tracks` en orden de reproducción (aleatorio o secuencial)
  let pos = 0;           // posición actual DENTRO de `order` (no índice directo a `tracks`)
  let filter = 'all', query = ''; // filtro activo y texto de búsqueda (no persisten)

  // ---------- Iconos (Lucide) ----------
  // Convierte los <i data-lucide="..."> pendientes en <svg>. Es idempotente y barato,
  // por eso se invoca de nuevo tras cada render() dinámico de la playlist.
  const refreshIcons = () => { if (window.lucide) window.lucide.createIcons(); };
  // HTML de un icono aún pendiente de conversión (será reemplazado por refreshIcons()).
  const iconHTML = (name, cls = '') => `<i data-lucide="${name}"${cls ? ` class="${cls}"` : ''}></i>`;

  // ---------- Utilidades ----------
  // Segundos → "m:ss". Devuelve "0:00" si aún no hay metadatos (NaN/Infinity).
  const fmt = (t) => {
    if (!isFinite(t) || t == null) return '0:00';
    const m = Math.floor(t / 60), sec = Math.floor(t % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  };
  // La identidad de una pista es su `src`. Ojo: renombrar/mover un archivo dentro
  // de ./music invalida silenciosamente los favoritos guardados con ese src.
  const idOf = (t) => t.src;
  const isFav = (t) => s.favorites.includes(idOf(t));

  // ---------- Carga ----------
  // Descarga music/manifest.json y reconstruye el catálogo.
  // Si el fetch falla (p.ej. al abrir con file://), conserva solo los uploads locales.
  async function loadManifest() {
    try {
      const res = await fetch('music/manifest.json', { cache: 'no-store' });
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      // El manifest puede ser array plano u objeto { tracks: [...] }; aceptamos ambos.
      const items = Array.isArray(data) ? data : data.tracks || [];
      tracks = items.map((t) => ({
        title: t.title || (t.src || '').split('/').pop() || 'Sin título',
        artist: t.artist || 'Artista desconocido',
        src: t.src,
        cover: t.cover || '',
        local: false,
      })).filter((t) => t.src);
    } catch {
      tracks = tracks.filter((t) => t.local); // sin manifest: conservar uploads
    }
    rebuildOrder();
    // Restaurar la última posición reproducida (con clamp por si la lista cambió)
    // o, si ya hay src cargado, limitarse a repintar.
    if (tracks.length && !audio.src) {
      loadTrack(order[Math.min(s.lastIndex, order.length - 1)] ?? 0, false);
    } else {
      render();
    }
  }

  // Reconstruye `order` desde cero: secuencial, o Fisher-Yates si el shuffle está
  // activo. Se invoca en cada toggle de shuffle, recarga del manifest y archivo añadido.
  function rebuildOrder() {
    order = tracks.map((_, i) => i);
    if (s.shuffle) {
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
    }
    pos = 0;
  }

  // ---------- Render ----------
  // Pistas visibles: todas las del catálogo + su índice original, filtradas por
  // favoritos y por el texto de búsqueda (título + artista, en minúsculas).
  function visibleTracks() {
    return tracks
      .map((t, i) => ({ ...t, idx: i }))
      .filter((t) => (filter !== 'favorites' || isFav(t)) && (t.title + ' ' + t.artist).toLowerCase().includes(query));
  }

  // Repinta la playlist completa. El innerHTML deja <div class="t/a"> vacíos y el
  // título/artista se asigna DESPUÉS con .textContent: así un título con HTML
  // especial (<, &) nunca se interpreta como marcado.
  function render() {
    const list = visibleTracks();
    countEl.textContent = `${list.length} ${list.length === 1 ? 'canción' : 'canciones'}`;
    playlistEl.innerHTML = '';
    const currentIdx = order[pos];
    list.forEach((t) => {
      const li = document.createElement('li');
      if (t.idx === currentIdx) li.classList.add('active');
      const fav = isFav(t);
      li.innerHTML = `<div class="meta"><div class="t"></div><div class="a"></div></div>
        <button class="like ${fav ? 'on' : ''}" title="Favorito" aria-label="Favorito" aria-pressed="${fav}">${iconHTML('heart')}</button>`;
      li.querySelector('.t').textContent = t.title;
      li.querySelector('.a').textContent = t.artist;
      li.onclick = (e) => { if (!e.target.closest('.like')) loadTrack(t.idx); };
      li.querySelector('.like').onclick = () => toggleFav(t);
      playlistEl.appendChild(li);
    });
    // Alterna estado vacío vs. tarjeta "now playing" según haya pistas o no.
    emptyState.classList.toggle('hidden', tracks.length > 0);
    nowPlaying.classList.toggle('hidden', tracks.length === 0);
    updateShuffleRepeatUI();
    refreshIcons();
  }

  // Portada: imagen de fondo si hay `cover`; si no, icono por defecto.
  function setCover(el, track) {
    if (track.cover) { el.style.backgroundImage = `url("${track.cover}")`; el.textContent = ''; }
    else { el.style.backgroundImage = ''; el.innerHTML = iconHTML('music'); }
  }

  // Carga la pista `i` (índice dentro de `tracks`) y la reproduce.
  function loadTrack(i, autoplay = true) {
    const t = tracks[i];
    if (!t) return;
    // `pos` apunta a la pista dentro de `order` (el orden de reproducción),
    // no al índice directo en `tracks`.
    pos = Math.max(0, order.indexOf(i));
    s.lastIndex = pos; store.save();
    audio.src = t.src;
    trackTitle.textContent = t.title;
    trackArtist.textContent = t.artist;
    miniTitle.textContent = t.title;
    miniArtist.textContent = t.artist;
    setCover(coverEl, t); setCover(coverMiniEl, t);
    updateFavUI(t);
    // Integración con el sistema operativo: teclas multimedia y pantalla de bloqueo.
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.artist, album: 'Music Player' });
    }
    render();
    // .catch(() => {}): el navegador puede bloquear el autoplay por falta de gesto previo.
    if (autoplay) audio.play().catch(() => { });
  }

  // Alterna favorito por identidad (src) y sincroniza el botón grande
  // de "now playing" si la pista tocada es la que suena.
  function toggleFav(t) {
    const id = idOf(t);
    const i = s.favorites.indexOf(id);
    if (i >= 0) s.favorites.splice(i, 1); else s.favorites.push(id);
    store.save(); render();
    const cur = tracks[order[pos]];
    if (cur && idOf(cur) === id) updateFavUI(cur);
  }
  function updateFavUI(t) {
    const fav = isFav(t);
    favBtn.classList.toggle('on', fav);   // el CSS rellena el corazón con .on
    favBtn.setAttribute('aria-pressed', fav);
  }

  // ---------- Controles ----------
  playBtn.onclick = () => (audio.paused ? audio.play() : audio.pause()).catch(() => { });
  // El CSS alterna los iconos play/pause según la clase .is-playing.
  const setPlayingUI = (playing) => {
    playBtn.classList.toggle('is-playing', playing);
    playBtn.setAttribute('aria-label', playing ? 'Pausar' : 'Reproducir');
  };
  audio.onplay = () => setPlayingUI(true);
  audio.onpause = () => setPlayingUI(false);
  audio.onloadedmetadata = () => { $('dur').textContent = fmt(audio.duration); };
  // Reloj + seek. El slider va de 0 a 1000 para no depender de floating point.
  audio.ontimeupdate = () => {
    $('cur').textContent = fmt(audio.currentTime);
    if (audio.duration) seek.value = Math.round((audio.currentTime / audio.duration) * 1000);
  };
  // Fin de pista: repeat=one lo resuelve `audio.loop` (ver updateShuffleRepeatUI);
  // aquí solo avanzamos según el modo activo.
  audio.onended = () => {
    if (s.repeat === 'one' || !order.length) return;
    if (s.repeat === 'all') {
      loadTrack(order[(pos + 1) % order.length]);
      return;
    }
    if (pos < order.length - 1) loadTrack(order[pos + 1]);
  };
  seek.oninput = () => { if (audio.duration) audio.currentTime = (seek.value / 1000) * audio.duration; };

  $('nextBtn').onclick = () => order.length && loadTrack(order[(pos + 1) % order.length]);
  // "Anterior": si la pista lleva más de 3 s, vuelve a su inicio (convención Spotify);
  // solo si acaba de empezar, salta realmente a la pista previa.
  $('prevBtn').onclick = () => {
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    if (order.length) loadTrack(order[(pos - 1 + order.length) % order.length]);
  };
  // Shuffle: reconstruye el orden de reproducción y reancla `pos` a la pista
  // que sonaba para no perder el contexto.
  shuffleBtn.onclick = () => {
    const cur = order[pos];
    s.shuffle = !s.shuffle; store.save();
    rebuildOrder();
    if (cur !== undefined) pos = order.indexOf(cur);
    render();
  };
  // Ciclo de repetición: off → all → one → off ...
  repeatBtn.onclick = () => {
    s.repeat = s.repeat === 'off' ? 'all' : s.repeat === 'all' ? 'one' : 'off';
    store.save(); updateShuffleRepeatUI();
  };
  function updateShuffleRepeatUI() {
    const repeatLabels = {
      off: { title: 'Repetir: desactivado', ariaLabel: 'Repetición desactivada' },
      all: { title: 'Repetir: toda la lista', ariaLabel: 'Repetir toda la lista' },
      one: { title: 'Repetir: pista actual', ariaLabel: 'Repetir pista actual' },
    };
    const labels = repeatLabels[s.repeat] || repeatLabels.off;
    audio.loop = s.repeat === 'one';
    shuffleBtn.classList.toggle('active', s.shuffle);
    shuffleBtn.setAttribute('aria-pressed', s.shuffle);
    repeatBtn.classList.toggle('active', s.repeat !== 'off');
    repeatBtn.setAttribute('aria-pressed', s.repeat !== 'off');
    repeatBtn.dataset.mode = s.repeat;   // off | all | one → el CSS muestra repeat o repeat-1
    repeatBtn.title = labels.title;
    repeatBtn.setAttribute('aria-label', labels.ariaLabel);
  }

  // ---------- Volumen ----------
  vol.value = Math.round((s.volume ?? 0.9) * 100);
  audio.volume = s.volume ?? 0.9;
  vol.oninput = () => { audio.volume = vol.value / 100; s.volume = audio.volume; store.save(); updateMute(); };
  muteBtn.onclick = () => { audio.muted = !audio.muted; updateMute(); };
  // Elige el icono volume-x / volume-1 / volume-2 vía data-level (lo interpreta el CSS).
  function updateMute() {
    const silent = audio.muted || audio.volume === 0;
    muteBtn.dataset.level = silent ? 'muted' : audio.volume < 0.5 ? 'low' : 'high';
    muteBtn.setAttribute('aria-label', silent ? 'Activar sonido' : 'Silenciar');
  }
  updateMute();

  // Botón grande de favorito de "now playing": togglea la pista actual.
  favBtn.onclick = () => { const t = tracks[order[pos]]; if (t) toggleFav(t); };

  // ---------- Filtros + búsqueda ----------
  // Un solo filtro puede estar activo; el click marca el botón y repinta.
  document.querySelectorAll('.filter').forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll('.filter').forEach((x) => x.classList.remove('active'));
      b.classList.add('active'); filter = b.dataset.filter; render();
    };
  });
  searchEl.oninput = () => { query = searchEl.value.trim().toLowerCase(); render(); };

  // ---------- Añadir archivos ----------
  // OJO: esta regex está DUPLICADA en tools/gen-manifest.js; al cambiar los formatos
  // soportados hay que actualizar ambas.
  const AUDIO_EXT = /\.(mp3|ogg|wav|m4a|flac|opus)$/i;
  // Acepta por MIME (audio/*) o por extensión (para archivos sin type fiable).
  const isAudio = (f) => f && (f.type?.startsWith('audio/') || AUDIO_EXT.test(f.name || ''));
  $('fileInput').onchange = (e) => addFiles(e.target.files);
  // Convierte File(s) en pistas locales (blob URL, no persisten al recargar) y
  // reproduce la primera de las añadidas.
  function addFiles(files) {
    const audios = [...files].filter(isAudio);
    audios.forEach((f) => {
      tracks.push({
        title: f.name.replace(/\.[^.]+$/, ''),
        artist: 'Archivo local',
        src: URL.createObjectURL(f),
        cover: '',
        local: true,
      });
    });
    if (audios.length) { rebuildOrder(); loadTrack(tracks.length - audios.length, true); }
  }

  // ---------- Drag & drop ----------
  // dragover/drop requieren preventDefault(); sin él el navegador no permite soltar.
  const dz = $('dropZone'), hint = $('dropHint');
  ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); hint.classList.add('over'); }));
  dz.addEventListener('dragleave', (e) => { e.preventDefault(); hint.classList.remove('over'); });
  dz.addEventListener('drop', (e) => {
    e.preventDefault();
    hint.classList.remove('over');
    addFiles(e.dataTransfer.files);
  });

  // ---------- File System Access: abrir carpeta ./music ----------
  // Solo Chrome/Edge (window.showDirectoryPicker); en otros navegadores avisa.
  $('folderBtn').onclick = async () => {
    if (!window.showDirectoryPicker) { alert('Tu navegador no soporta abrir carpetas. Usa "Añadir música" o arrastra archivos.'); return; }
    try {
      const dir = await window.showDirectoryPicker();
      const found = [];
      for await (const entry of dir.values()) {
        if (entry.kind === 'file' && isAudio(entry)) {
          const file = await entry.getFile();
          found.push(file);
        }
      }
      addFiles(found);
    } catch { } // el usuario canceló el diálogo o denegó el permiso: no hacer nada
  };

  // ---------- Misceláneo ----------
  $('rescanBtn').onclick = loadManifest;
  $('genHint').onclick = () => alert('Pon tus .mp3 en la carpeta ./music y ejecuta:\n\n  node tools/gen-manifest.js\n\nLuego pulsa el botón de recargar (↻) para actualizar la lista.');

  // Móvil: tocar el logo alterna la sidebar (comportamiento definido en el
  // @media (max-width: 860px) del CSS).
  document.querySelector('.logo').onclick = () => $('sidebar').classList.toggle('open');

  // ---------- Teclado + MediaSession ----------
  // Letras sueltas → clic en el botón equivalente; flechas y espacio tienen
  // comportamiento propio más abajo.
  const keyBtnMap = { n: 'nextBtn', p: 'prevBtn', m: 'muteBtn', f: 'favBtn', s: 'shuffleBtn' };
  document.addEventListener('keydown', (e) => {
    // Ignorar atajos con el foco en campos de texto (p.ej. la búsqueda);
    // los <input type="range"> sí responden a las flechas.
    if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
    const k = e.key.toLowerCase();
    if (e.code === 'Space') { e.preventDefault(); playBtn.click(); }
    else if (e.key === 'ArrowRight') audio.currentTime += 10;
    else if (e.key === 'ArrowLeft') audio.currentTime -= 10;
    else if (e.key === 'ArrowUp') { e.preventDefault(); vol.value = Math.min(100, +vol.value + 5); vol.oninput(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); vol.value = Math.max(0, +vol.value - 5); vol.oninput(); }
    else if (keyBtnMap[k]) $(keyBtnMap[k]).click();
  });
  // Teclas multimedia del SO / auriculares Bluetooth → mismos handlers que los botones.
  try {
    navigator.mediaSession.setActionHandler('play', () => audio.play());
    navigator.mediaSession.setActionHandler('pause', () => audio.pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => $('prevBtn').click());
    navigator.mediaSession.setActionHandler('nexttrack', () => $('nextBtn').click());
  } catch { }

  // Arranque: convertir los iconos del HTML estático y cargar el catálogo.
  refreshIcons();
  loadManifest();
})();
