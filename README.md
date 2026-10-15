# Music Player

A static web music player. No npm, no bundler, no build step — just HTML, CSS, and vanilla JavaScript served as static files.

## Features

- Plays tracks from `music/manifest.json` or local file uploads
- Drag & drop, file picker, and File System Access API (Chrome/Edge) support
- Search and favorites filter
- Favorites, volume, and playback position persisted in `localStorage`
- Shuffle and repeat modes (off → all → one)
- Keyboard shortcuts
- Media Session API (system-level media controls)
- Responsive design with collapsible sidebar on mobile

## Requirements

- Node.js (only for the manifest generator script)
- A modern web browser

## Getting Started

### Option 1: Local HTTP Server

```bash
python3 -m http.server 8000
# or
npx serve .
```

Then open `http://localhost:8000`.

> **Note:** Opening `index.html` directly via `file://` may work due to CORS restrictions on `fetch('music/manifest.json')`; an HTTP server is recommended.

### Option 2: Docker

```bash
docker compose up --build
```

Then open `http://localhost:8080`.

## Adding Music

1. Copy your audio files into the `music/` directory.
2. Run the manifest generator:
   ```bash
   node tools/gen-manifest.js
   ```
3. Click the ⟳ button in the UI to reload the playlist.

### Supported Formats

MP3, OGG, WAV, M4A, FLAC, OPUS

### Filename Convention

The generator parses `Artist - Title.ext` from filenames. Files without the ` - ` separator default to `Artista desconocido` as the artist.

## Project Structure

```
├── index.html          # Entry point
├── css/
│   └── style.css       # Styles
├── js/
│   ├── store.js        # localStorage persistence
│   └── app.js          # Player logic
├── music/
│   └── manifest.json   # Track list (generated, fetched at runtime)
├── tools/
│   └── gen-manifest.js # Manifest generator (Node ESM)
├── Dockerfile          # nginx-based container
└── compose.yaml        # Docker Compose config
```

## Keyboard Shortcuts

| Key         | Action                |
|-------------|-----------------------|
| `Space`     | Play / Pause          |
| `←` / `→`   | Seek ±10 seconds      |
| `↑` / `↓`   | Volume up / down      |
| `N`         | Next track            |
| `P`         | Previous track        |
| `S`         | Toggle shuffle        |
| `F`         | Toggle favorite       |
| `M`         | Mute                  |

## Persistence

Player state is stored in `localStorage` under the key `music-player-v1`:

- `favorites` — Array of track IDs (src strings)
- `volume` — Number between 0 and 1
- `lastIndex` — Last played track index
- `shuffle` — Boolean
- `repeat` — `"off"` | `"all"` | `"one"`

## License

See [LICENSE](LICENSE) for details.
