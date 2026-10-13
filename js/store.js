// Persistencia simple en localStorage
const store = {
  KEY: 'music-player-v1',
  state: { favorites: [], volume: 0.9, lastIndex: 0, shuffle: false, repeat: 'off' },
  load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (raw) Object.assign(this.state, JSON.parse(raw));
    } catch {}
    return this.state;
  },
  save() {
    try { localStorage.setItem(this.KEY, JSON.stringify(this.state)); } catch {}
  }
};
