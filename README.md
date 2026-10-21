# Music Player

A lightweight static web music player. Built with pure HTML, CSS, and vanilla JavaScript — no npm packages, bundlers, build steps, or runtime frameworks.

## Features

- **Playlist & Audio Sources**: Plays tracks indexed in `music/manifest.json` as well as local files added via drag & drop, file picker, or the File System Access API (Chrome/Edge).
- **Search & Filter**: Real-time search across track titles and artists, plus a quick filter for favorite tracks.
- **State Persistence**: Favorites, volume level, last played track, shuffle, and repeat settings persist in `localStorage` (the elapsed time of a track is *not* persisted — playback always resumes from the beginning).
- **Playback Modes**: Supports sequential playback, Fisher-Yates shuffle, and three-state repeat mode (`off` → `all` → `one`). Pressing *Previous* within the first 3 seconds of a track jumps to the previous one; after that it restarts the current track (Spotify convention).
- **Icons & UI**: Modern icon set powered by [Lucide Icons](https://lucide.dev/) (loaded via CDN with SRI validation).
- **Accessibility & Shortcuts**: Accessible controls with ARIA states (`aria-label`, `aria-pressed`) and extensive keyboard shortcuts.
- **System Integration**: Media Session API integration for OS/hardware-level media keys and lock screen controls.
- **Responsive Layout**: Clean desktop layout with a collapsible mobile sidebar and a fixed bottom playback bar that keeps every playback control visible on phones.

## Requirements

- A modern web browser supporting ES2020+ (the code relies on optional chaining, nullish coalescing, and async/await).
- Python 3, Node.js, or Docker (only to serve files locally via HTTP or to run the manifest generator).
- Node.js 22+ if you plan to run the manifest generator — `tools/gen-manifest.js` is an ESM script and this repo has no `package.json`, so it relies on Node's ESM syntax detection. Older versions throw a `SyntaxError` unless you invoke it with `node --experimental-default-type=module tools/gen-manifest.js`.

## Getting Started

Because modern browsers block `fetch('music/manifest.json')` over the `file://` protocol due to CORS security policies, serve the project using a local HTTP server or container.

### Option 1: Local HTTP Server

```bash
# Using Python
python3 -m http.server 8000

# Or using Node
npx serve .
```

Open `http://localhost:8000` in your browser.

> **Note on `file://`:** Opening `index.html` directly from the filesystem (`file://`) will fail to fetch `music/manifest.json`. However, loading local audio files on the fly via drag-and-drop or the file picker will still function.

### Option 2: Docker

```bash
docker compose up --build
```

Open `http://localhost:8080` in your browser.

## Adding Music

1. Place your audio files inside the `music/` directory.
2. Run the manifest generator:
   ```bash
   node tools/gen-manifest.js
   ```
3. Click the reload button (⟳) in the sidebar or refresh the page.

> **Heads up:** the generator only scans audio sitting directly in `music/`. If your tracks live in `music/canciones/`, running it will **overwrite the manifest and drop those entries**, leaving an empty playlist. Move the files to the top of `music/` before generating, or catalog them by hand — see the notes below.

### Manifest Format

`music/manifest.json` is either a flat array or an object with a `tracks` array (both are accepted at runtime):

```json
[
  {
    "title": "Metal Mario [Cover]",
    "artist": "Artista desconocido",
    "src": "music/canciones/Metal Mario [Cover].mp3",
    "cover": ""
  }
]
```

- `src` — Path or URL of the audio file. **It is the identity of the track**: renaming or moving the file silently drops its saved favorite.
- `cover` — Optional image path or URL used as the artwork background. When empty or missing, a default music icon is shown.
- `title` / `artist` — Optional; both fall back to values derived from the file name when absent.

### Supported Audio Formats

MP3, OGG, WAV, M4A, FLAC, OPUS (`.mp3`, `.ogg`, `.wav`, `.m4a`, `.flac`, `.opus`). The same extension regex lives in two places — `tools/gen-manifest.js` and `js/app.js` (`AUDIO_EXT`) — so both must be updated when changing supported formats.

### Filename Convention & Generator Details

- The generator expects `Artist - Title.ext` format. Files without the ` - ` separator will use the filename as the title and default the artist to `Artista desconocido`.
- **Preservation**: If an audio file's `src` already exists in `music/manifest.json`, custom metadata (such as `cover` URLs) is retained when re-running the generator.
- **Scanning**: The generator scans `music/` directly (non-recursive). Audio placed in nested subdirectories (such as `music/canciones/`) should be cataloged manually or kept at the top level of `music/`.
- **Destructive write**: the generator rewrites `music/manifest.json` from scratch on every run. Entries whose file is no longer in `music/` are removed.

## Project Structure

```
├── index.html          # Main HTML entry point & Lucide Icons CDN script
├── css/
│   └── style.css       # Layout, theme variables, and custom styling
├── js/
│   ├── store.js        # Simple localStorage state management
│   └── app.js          # Player engine, UI event handlers, keyboard shortcuts
├── music/
│   ├── manifest.json   # Track catalog (served via HTTP, read at runtime, tracked in git)
│   └── canciones/      # Audio directory (sample/local tracks — git-ignored)
├── tools/
│   └── gen-manifest.js # Node.js ESM script to regenerate music/manifest.json
├── Dockerfile          # Nginx-based static container image
├── compose.yaml        # Docker Compose configuration
├── AGENTS.md           # Instructions and gotchas for AI assistants
└── README.md           # Project documentation
```

- `music/canciones/` is listed in `.gitignore`, so a fresh clone ships an **empty playlist** even though `music/manifest.json` is tracked. Drop your own files into `music/` to get started.
- The `Dockerfile` copies only `index.html`, `css/`, `js/`, and `music/` — there is no bind mount and `tools/` is not shipped. After adding tracks, rebuild with `docker compose up --build`.

## Keyboard Shortcuts

| Key         | Action                      |
|-------------|-----------------------------|
| `Space`     | Play / Pause                |
| `←` / `→`   | Seek backward / forward 10s |
| `↑` / `↓`   | Volume up / down (5%)       |
| `N`         | Next track                  |
| `P`         | Previous track              |
| `S`         | Toggle shuffle              |
| `F`         | Toggle favorite             |
| `M`         | Toggle mute                 |

> Shortcuts are automatically ignored when focused inside text input fields (such as the search bar).

## Persistence

Player state is stored in `localStorage` under the key `music-player-v1`:

- `favorites` — Array of track source strings (`t.src`)
- `volume` — Float between `0` and `1` (defaults to `0.9`)
- `lastIndex` — Position of the last played track in the current playback order (not a stable track id; it is clamped if the list changed)
- `shuffle` — Boolean (`true` / `false`)
- `repeat` — Current repeat mode (`"off"` | `"all"` | `"one"`)

> Because favorites are stored by `src`, renaming or moving an audio file removes it from your favorites without warning.

Files added through the file picker, drag & drop, or the directory picker are turned into in-memory blob URLs and are **not** persisted — they only survive until you reload the page.

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
