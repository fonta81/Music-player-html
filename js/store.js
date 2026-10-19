// Persistencia simple en localStorage.
// OJO al orden de carga: index.html incluye este ANTES que js/app.js, porque
// app.js lee el objeto global `store` al arrancar su IIFE.
const store = {
  KEY: 'music-player-v1', // clave única en localStorage para todo el estado del reproductor
  state: { favorites: [], volume: 0.9, lastIndex: 0, shuffle: false, repeat: 'off' },
  // Mezcla lo guardado (si existe) sobre los valores por defecto; nunca lanza excepción.
  load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (raw) Object.assign(this.state, JSON.parse(raw));
    } catch { }
    return this.state;
  },
  save() {
    try { localStorage.setItem(this.KEY, JSON.stringify(this.state)); } catch { }
  }
};
