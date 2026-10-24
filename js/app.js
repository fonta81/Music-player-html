/* Reproductor de música. IIFE, depende del global `store` (js/store.js). */
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

  // Estado persistido (ver store.js)
  const s = store.load();

  const AUDIO_EXTENSIONS = ['mp3', 'ogg', 'wav', 'm4a', 'flac', 'opus'];
  const AUDIO_EXT = new RegExp(`\\.(${AUDIO_EXTENSIONS.join('|')})$`, 'i');
  const isAudio = (file) => !!(file && (file.type?.startsWith('audio/') || AUDIO_EXT.test(file.name || '')));
  const buildLocalTrack = (file) => ({
    title: file.name.replace(/\.[^.]+$/, '') || 'Sin título',
    artist: 'Archivo local',
    src: URL.createObjectURL(file),
    cover: '',
    local: true,
  });

  // ---------- Modelo ----------
  let tracks = [];       // [{title, artist, src, cover, local?}]
  let order = [];        // índices en orden de reproducción
  let pos = 0;           // posición actual en `order`
  let filter = 'all', query = '';

  // ---------- Iconos (Lucide) ----------
  // Refresca iconos Lucide (<i data-lucide> → <svg>)
  const refreshIcons = () => { if (window.lucide) window.lucide.createIcons(); };
  // HTML de un icono pendiente de conversión
  const iconHTML = (name, cls = '') => `<i data-lucide="${name}"${cls ? ` class="${cls}"` : ''}></i>`;

  // ---------- Utilidades ----------
  // Segundos → "m:ss"
  const fmt = (t) => {
    if (!isFinite(t) || t == null) return '0:00';
    const m = Math.floor(t / 60), sec = Math.floor(t % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  };
  // Identidad de pista = su `src`
  const idOf = (t) => t.src;
  const isFav = (t) => s.favorites.includes(idOf(t));

  // ---------- Carga ----------
  // Carga manifest.json; si falla, conserva solo uploads locales
  async function loadManifest() {
    try {
      const res = await fetch('music/manifest.json', { cache: 'no-store' });
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      // Acepta array plano u objeto { tracks: [...] }
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
    // Restaurar última posición o repintar
    if (tracks.length && !audio.src) {
      loadTrack(order[Math.min(s.lastIndex, order.length - 1)] ?? 0, false);
    } else {
      render();
    }
  }

  // Reconstruye `order` (Fisher-Yates si shuffle activo)
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
  // Pistas filtradas por favoritos y búsqueda
  function visibleTracks() {
    return tracks
      .map((t, i) => ({ ...t, idx: i }))
      .filter((t) => (filter !== 'favorites' || isFav(t)) && (t.title + ' ' + t.artist).toLowerCase().includes(query));
  }

  // Repinta la playlist (usa .textContent para evitar inyección HTML)
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
    // Alterna estado vacío / now playing
    emptyState.classList.toggle('hidden', tracks.length > 0);
    nowPlaying.classList.toggle('hidden', tracks.length === 0);
    updateShuffleRepeatUI();
    refreshIcons();
  }

  // Portada: imagen o icono por defecto
  function setCover(el, track) {
    if (track.cover) { el.style.backgroundImage = `url("${track.cover}")`; el.textContent = ''; }
    else { el.style.backgroundImage = ''; el.innerHTML = iconHTML('music'); }
  }

  // Carga y reproduce la pista `i`
  function loadTrack(i, autoplay = true) {
    const t = tracks[i];
    if (!t) return;
    // `pos` apunta a la posición en `order`
    pos = Math.max(0, order.indexOf(i));
    s.lastIndex = pos; store.save();
    audio.src = t.src;
    const syncTrackUI = (track) => {
      trackTitle.textContent = track.title;
      trackArtist.textContent = track.artist;
      miniTitle.textContent = track.title;
      miniArtist.textContent = track.artist;
      setCover(coverEl, track); setCover(coverMiniEl, track);
      updateFavUI(track);
    };
    syncTrackUI(t);
    // MediaSession (teclas multimedia / pantalla de bloqueo)
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.artist, album: 'Music Player' });
    }
    render();
    // catch: el autoplay puede estar bloqueado
    if (autoplay) audio.play().catch(() => { });
  }

  // Alterna favorito y sincroniza UI
  function toggleFav(t) {
    const id = idOf(t);
    const i = s.favorites.indexOf(id);
    if (i >= 0) s.favorites.splice(i, 1); else s.favorites.push(id);
    store.save(); render();
    const cur = tracks[order[pos]];
    if (cur && idOf(cur) === id) updateCurrentFavUI();
  }
  const updateCurrentFavUI = () => {
    const cur = tracks[order[pos]];
    if (cur) updateFavUI(cur);
  };
  function updateFavUI(t) {
    const fav = isFav(t);
    favBtn.classList.toggle('on', fav);
    favBtn.setAttribute('aria-pressed', fav);
  }

  // ---------- Controles ----------
  playBtn.onclick = () => (audio.paused ? audio.play() : audio.pause()).catch(() => { });
  // Alterna icono play/pause vía .is-playing
  const setPlayingUI = (playing) => {
    playBtn.classList.toggle('is-playing', playing);
    playBtn.setAttribute('aria-label', playing ? 'Pausar' : 'Reproducir');
  };
  audio.onplay = () => setPlayingUI(true);
  audio.onpause = () => setPlayingUI(false);
  audio.onloadedmetadata = () => { $('dur').textContent = fmt(audio.duration); };
  // Reloj + seek (slider 0–1000)
  audio.ontimeupdate = () => {
    $('cur').textContent = fmt(audio.currentTime);
    if (audio.duration) seek.value = Math.round((audio.currentTime / audio.duration) * 1000);
  };
  // Fin de pista: avanza según modo de repetición
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
  // Anterior: >3s reinicia, si no va a la pista previa
  $('prevBtn').onclick = () => {
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    if (order.length) loadTrack(order[(pos - 1 + order.length) % order.length]);
  };
  // Shuffle: reconstruye orden manteniendo pista actual
  shuffleBtn.onclick = () => {
    const cur = order[pos];
    s.shuffle = !s.shuffle; store.save();
    rebuildOrder();
    if (cur !== undefined) pos = order.indexOf(cur);
    render();
  };
  // Ciclo: off → all → one → off
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
    repeatBtn.dataset.mode = s.repeat;
    repeatBtn.title = labels.title;
    repeatBtn.setAttribute('aria-label', labels.ariaLabel);
  }

  // ---------- Volumen ----------
  vol.value = Math.round((s.volume ?? 0.9) * 100);
  audio.volume = s.volume ?? 0.9;
  vol.oninput = () => { audio.volume = vol.value / 100; s.volume = audio.volume; store.save(); updateMute(); };
  muteBtn.onclick = () => { audio.muted = !audio.muted; updateMute(); };
  // Icono de volumen según nivel
  function updateMute() {
    const silent = audio.muted || audio.volume === 0;
    muteBtn.dataset.level = silent ? 'muted' : audio.volume < 0.5 ? 'low' : 'high';
    muteBtn.setAttribute('aria-label', silent ? 'Activar sonido' : 'Silenciar');
  }
  updateMute();

  // Botón favorito de now playing
  favBtn.onclick = () => { const t = tracks[order[pos]]; if (t) toggleFav(t); };

  // ---------- Filtros + búsqueda ----------
  // Filtros: un solo activo a la vez
  document.querySelectorAll('.filter').forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll('.filter').forEach((x) => x.classList.remove('active'));
      b.classList.add('active'); filter = b.dataset.filter; render();
    };
  });
  searchEl.oninput = () => { query = searchEl.value.trim().toLowerCase(); render(); };

  // ---------- Añadir archivos ----------
  $('fileInput').onchange = (e) => addFiles(e.target.files);
  // Añade archivos como pistas locales (blob URL) y reproduce la primera
  function addFiles(files) {
    const audios = [...files].filter(isAudio);
    audios.forEach((file) => tracks.push(buildLocalTrack(file)));
    if (audios.length) {
      rebuildOrder();
      loadTrack(tracks.length - audios.length, true);
    }
  }

  // ---------- Drag & drop ----------
  // preventDefault() necesario para habilitar el drop
  const dz = $('dropZone'), hint = $('dropHint');
  ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); hint.classList.add('over'); }));
  dz.addEventListener('dragleave', (e) => { e.preventDefault(); hint.classList.remove('over'); });
  dz.addEventListener('drop', (e) => {
    e.preventDefault();
    hint.classList.remove('over');
    addFiles(e.dataTransfer.files);
  });

  // ---------- File System Access: abrir carpeta ./music ----------
  // Solo Chrome/Edge; avisa si no está soportado
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

  // Móvil: logo alterna sidebar
  document.querySelector('.logo').onclick = () => $('sidebar').classList.toggle('open');

  // ---------- Teclado + MediaSession ----------
  // Atajos de teclado
  const keyBtnMap = { n: 'nextBtn', p: 'prevBtn', m: 'muteBtn', f: 'favBtn', s: 'shuffleBtn' };
  document.addEventListener('keydown', (e) => {
    // Ignorar atajos en campos de texto (excepto sliders)
    if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
    const k = e.key.toLowerCase();
    if (e.code === 'Space') { e.preventDefault(); playBtn.click(); }
    else if (e.key === 'ArrowRight') audio.currentTime += 10;
    else if (e.key === 'ArrowLeft') audio.currentTime -= 10;
    else if (e.key === 'ArrowUp') { e.preventDefault(); vol.value = Math.min(100, +vol.value + 5); vol.oninput(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); vol.value = Math.max(0, +vol.value - 5); vol.oninput(); }
    else if (keyBtnMap[k]) $(keyBtnMap[k]).click();
  });
  // Teclas multimedia del SO / Bluetooth
  try {
    navigator.mediaSession.setActionHandler('play', () => audio.play());
    navigator.mediaSession.setActionHandler('pause', () => audio.pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => $('prevBtn').click());
    navigator.mediaSession.setActionHandler('nexttrack', () => $('nextBtn').click());
  } catch { }

  // Arranque
  refreshIcons();
  loadManifest();
})();
