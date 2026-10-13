/* Reproductor: fuente ./music/manifest.json + upload + File System Access */
(() => {
  const $ = (id) => document.getElementById(id);
  const audio = $('audio'), playlistEl = $('playlist'), searchEl = $('search');
  const playBtn = $('playBtn'), seek = $('seek'), vol = $('vol');
  const s = store.load();

  let tracks = [];       // {id,title,artist,src,cover,local?}
  let order = [];        // índices en orden de reproducción (shuffle o no)
  let pos = 0;           // posición dentro de order
  let filter = 'all', query = '';
  let audioCtx = null, analyser = null, srcNode = null, rafId = null;

  const fmt = (t) => {
    if (!isFinite(t) || t == null) return '0:00';
    const m = Math.floor(t / 60), sec = Math.floor(t % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  };
  const idOf = (t) => t.src;

  // ---------- Carga ----------
  async function loadManifest() {
    try {
      const res = await fetch('music/manifest.json', { cache: 'no-store' });
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
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
    render();
    if (tracks.length && !audio.src) loadTrack(order[Math.min(s.lastIndex, order.length - 1)] ?? 0, false);
  }

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
  function visibleTracks() {
    return tracks
      .map((t, i) => ({ ...t, idx: i }))
      .filter((t) => (filter === 'favorites' ? s.favorites.includes(idOf(t)) : true))
      .filter((t) => (t.title + ' ' + t.artist).toLowerCase().includes(query));
  }

  function render() {
    const list = visibleTracks();
    $('count').textContent = `${list.length} ${list.length === 1 ? 'canción' : 'canciones'}`;
    playlistEl.innerHTML = '';
    const currentIdx = order[pos];
    list.forEach((t) => {
      const li = document.createElement('li');
      if (t.idx === currentIdx) li.classList.add('active');
      const fav = s.favorites.includes(idOf(t));
      li.innerHTML = `<div class="meta"><div class="t"></div><div class="a"></div></div>
        <button class="like ${fav ? 'on' : ''}" title="Favorito">♥</button>`;
      li.querySelector('.t').textContent = t.title;
      li.querySelector('.a').textContent = t.artist;
      li.onclick = (e) => { if (!e.target.classList.contains('like')) playIndex(t.idx); };
      li.querySelector('.like').onclick = () => toggleFav(t);
      playlistEl.appendChild(li);
    });
    $('emptyState').classList.toggle('hidden', tracks.length > 0);
    $('nowPlaying').classList.toggle('hidden', tracks.length === 0);
    updateShuffleRepeatUI();
  }

  function setCover(el, track) {
    if (track.cover) { el.style.backgroundImage = `url("${track.cover}")`; el.textContent = ''; }
    else { el.style.backgroundImage = ''; el.textContent = '♪'; }
  }

  function loadTrack(i, autoplay = true) {
    const t = tracks[i];
    if (!t) return;
    pos = Math.max(0, order.indexOf(i));
    s.lastIndex = pos; store.save();
    audio.src = t.src;
    $('trackTitle').textContent = t.title;
    $('trackArtist').textContent = t.artist;
    $('miniTitle').textContent = t.title;
    $('miniArtist').textContent = t.artist;
    setCover($('cover'), t); setCover($('coverMini'), t);
    updateFavUI(t);
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.artist, album: 'Music Player' });
    }
    render();
    if (autoplay) audio.play().catch(() => {});
  }

  function playIndex(i) { loadTrack(i, true); }

  function toggleFav(t) {
    const id = idOf(t);
    const i = s.favorites.indexOf(id);
    if (i >= 0) s.favorites.splice(i, 1); else s.favorites.push(id);
    store.save(); render();
    const cur = tracks[order[pos]];
    if (cur && idOf(cur) === id) updateFavUI(cur);
  }
  function updateFavUI(t) {
    $('favBtn').classList.toggle('on', s.favorites.includes(idOf(t)));
    $('favBtn').textContent = s.favorites.includes(idOf(t)) ? '♥' : '♡';
  }

  // ---------- Controles ----------
  playBtn.onclick = () => (audio.paused ? audio.play() : audio.pause()).catch(() => {});
  audio.onplay = () => { playBtn.textContent = '⏸'; setupVisualizer(); };
  audio.onpause = () => { playBtn.textContent = '▶'; };
  audio.onloadedmetadata = () => { $('dur').textContent = fmt(audio.duration); };
  audio.ontimeupdate = () => {
    $('cur').textContent = fmt(audio.currentTime);
    if (audio.duration) seek.value = Math.round((audio.currentTime / audio.duration) * 1000);
  };
  audio.onended = () => {
    if (s.repeat === 'one') { audio.currentTime = 0; audio.play(); return; }
    if (pos < order.length - 1) loadTrack(order[pos + 1]);
    else if (s.repeat === 'all' && order.length) loadTrack(order[0]);
  };
  seek.oninput = () => { if (audio.duration) audio.currentTime = (seek.value / 1000) * audio.duration; };

  $('nextBtn').onclick = () => order.length && loadTrack(order[(pos + 1) % order.length]);
  $('prevBtn').onclick = () => {
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    if (order.length) loadTrack(order[(pos - 1 + order.length) % order.length]);
  };
  $('shuffleBtn').onclick = () => {
    const cur = order[pos];
    s.shuffle = !s.shuffle; store.save();
    rebuildOrder();
    if (cur !== undefined) pos = order.indexOf(cur);
    render();
  };
  $('repeatBtn').onclick = () => {
    s.repeat = s.repeat === 'off' ? 'all' : s.repeat === 'all' ? 'one' : 'off';
    store.save(); updateShuffleRepeatUI();
  };
  function updateShuffleRepeatUI() {
    $('shuffleBtn').classList.toggle('active', s.shuffle);
    $('repeatBtn').classList.toggle('active', s.repeat !== 'off');
    $('repeatBadge').textContent = s.repeat === 'one' ? '1' : s.repeat === 'all' ? '∞' : '';
    $('repeatBtn').title = `Repetir: ${s.repeat}`;
  }

  vol.value = Math.round((s.volume ?? 0.9) * 100);
  audio.volume = s.volume ?? 0.9;
  vol.oninput = () => { audio.volume = vol.value / 100; s.volume = audio.volume; store.save(); updateMute(); };
  $('muteBtn').onclick = () => { audio.muted = !audio.muted; updateMute(); };
  function updateMute() { $('muteBtn').textContent = audio.muted || audio.volume === 0 ? '🔇' : '🔊'; }
  updateMute();

  $('favBtn').onclick = () => { const t = tracks[order[pos]]; if (t) toggleFav(t); };

  // Filtros + búsqueda
  document.querySelectorAll('.filter').forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll('.filter').forEach((x) => x.classList.remove('active'));
      b.classList.add('active'); filter = b.dataset.filter; render();
    };
  });
  searchEl.oninput = () => { query = searchEl.value.trim().toLowerCase(); render(); };

  // ---------- Añadir archivos ----------
  $('fileInput').onchange = (e) => addFiles(e.target.files);
  function addFiles(files) {
    const audios = [...files].filter((f) => f.type.startsWith('audio/'));
    audios.forEach((f) => {
      tracks.push({
        title: f.name.replace(/\.[^.]+$/, ''),
        artist: 'Archivo local',
        src: URL.createObjectURL(f),
        cover: '',
        local: true,
      });
    });
    if (audios.length) { rebuildOrder(); render(); loadTrack(tracks.length - audios.length, true); }
  }

  // Drag & drop
  const dz = $('dropZone'), hint = $('dropHint');
  ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); hint.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); hint.classList.remove('over'); }));
  dz.addEventListener('drop', (e) => addFiles(e.dataTransfer.files));

  // File System Access: abrir carpeta ./music
  $('folderBtn').onclick = async () => {
    if (!window.showDirectoryPicker) { alert('Tu navegador no soporta abrir carpetas. Usa "Añadir música" o arrastra archivos.'); return; }
    try {
      const dir = await window.showDirectoryPicker();
      const found = [];
      for await (const entry of dir.values()) {
        if (entry.kind === 'file' && /\.(mp3|ogg|wav|m4a|flac|opus)$/i.test(entry.name)) {
          const file = await entry.getFile();
          found.push(file);
        }
      }
      addFiles(found);
    } catch {}
  };

  $('rescanBtn').onclick = loadManifest;
  $('genHint').onclick = () => alert('Pon tus .mp3 en la carpeta ./music y ejecuta:\n\n  node tools/gen-manifest.js\n\nLuego pulsa ⟳ para recargar.');

  // Móvil: tocar logo alterna sidebar
  document.querySelector('.logo').onclick = () => $('sidebar').classList.toggle('open');

  // ---------- Visualizador ----------
  function setupVisualizer() {
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        srcNode = audioCtx.createMediaElementSource(audio);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        srcNode.connect(analyser); analyser.connect(audioCtx.destination);
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();
      draw();
    } catch {}
  }
  function draw() {
    if (!analyser) return;
    const canvas = $('visualizer'), ctx = canvas.getContext('2d');
    const data = new Uint8Array(analyser.frequencyBinCount);
    const render2 = () => {
      if (audio.paused) return;
      analyser.getByteFrequencyData(data);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const w = canvas.width / data.length;
      data.forEach((v, i) => {
        const h = (v / 255) * canvas.height;
        ctx.fillStyle = '#1db954';
        ctx.fillRect(i * w, canvas.height - h, w - 2, h);
      });
      rafId = requestAnimationFrame(render2);
    };
    cancelAnimationFrame(rafId);
    render2();
  }

  // ---------- Teclado + MediaSession ----------
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
    const k = e.key.toLowerCase();
    if (e.code === 'Space') { e.preventDefault(); playBtn.click(); }
    else if (e.key === 'ArrowRight') audio.currentTime += 10;
    else if (e.key === 'ArrowLeft') audio.currentTime -= 10;
    else if (e.key === 'ArrowUp') { e.preventDefault(); vol.value = Math.min(100, +vol.value + 5); vol.oninput(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); vol.value = Math.max(0, +vol.value - 5); vol.oninput(); }
    else if (k === 'n') $('nextBtn').click();
    else if (k === 'p') $('prevBtn').click();
    else if (k === 'm') $('muteBtn').click();
    else if (k === 'f') $('favBtn').click();
    else if (k === 's') $('shuffleBtn').click();
  });
  try {
    navigator.mediaSession.setActionHandler('play', () => audio.play());
    navigator.mediaSession.setActionHandler('pause', () => audio.pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => $('prevBtn').click());
    navigator.mediaSession.setActionHandler('nexttrack', () => $('nextBtn').click());
  } catch {}

  loadManifest();
})();
