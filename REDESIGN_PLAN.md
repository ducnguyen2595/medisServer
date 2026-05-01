# Mobile Player Redesign Plan

Target file: `mobile-player-v2.html` (single-file, served at `/`).

## Aesthetic direction

**"Studio Hi-Fi"** — the feel of a high-end DAC / amplifier panel, not a streaming-app clone. Black with warmth, copper/amber indicator-light accents (not green), incandescent glow rather than neon. Specs (sample rate, bit depth, codec, bitrate) treated as the hero — like the readout on a Naim / McIntosh / Devialet front panel. SVG icons throughout (no emoji — the biggest "AI-slop" tell in the current file).

### Typography

| Role | Font |
|---|---|
| Display serif | **Fraunces** (variable, characterful, warm) |
| UI sans | **Geist** |
| Mono — specs, timecodes, labels | **Geist Mono** |

### Palette

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0c0a08` | Warm near-black background |
| `--surface` | `#161310` | Cards, list rows |
| `--surface-elev` | `#1f1b16` | Sticky bars, elevated panels |
| `--accent` | `#d4a574` | Copper/amber — indicator lights, active states |
| `--accent-rust` | `#a0522d` | Secondary accent |
| `--text` | `#f5efe6` | Primary text |
| `--text-dim` | `#a39a8e` | Secondary text |
| `--text-subdued` | `#5a5249` | Tertiary, hairlines |

Format-coded badges:
- FLAC → copper
- DSD → brass `#c8956d`
- Hi-Res → warm gold
- Lossy → neutral

### Signature details

- Hairline panel-line dividers; glass blur only where needed (sticky bars over content)
- Mono "spec strip" under every title (`FLAC · 96/24 · 5:14`)
- Tabs styled like a channel selector with a tiny LED-dot active indicator
- VU-bar EQ animation on the now-playing track (replaces the emoji pulse)
- Subtle SVG grain texture overlay on dark surfaces

## Tab restructure

`HOME · LIBRARY · VIDEO · SEARCH · SOURCES`

Stats merges into a new **Sources** tab alongside the scan-a-folder UI — that's the natural home for "library health + add media".

## Per-surface changes

| Surface | Change |
|---|---|
| **Header** | Wordmark `MEDIS / hi-fi` (serif + mono), live LED status dot, current-format readout when playing |
| **Tabs** | Letter-spaced mono caps, LED-dot active indicator |
| **Home** | "Fresh Pressings" + "Library" sections; preset row (Shuffle All / Recent / Browse) styled as tuner-preset buttons |
| **Library** | Sticky codec filter chips (All / FLAC / DSD / Hi-Res / Lossy), sort selector, infinite scroll preserved |
| **Track item** | Square artwork (4px radius), serif title, mono spec strip below, EQ-bars animation when playing |
| **Video** | 16:9 thumbnail, resolution badge in corner (`4K`, `1080p`), mono spec strip |
| **Search** | Wider input, mono caret styling, filter chips refined |
| **Sources** *(new)* | (a) Scan full library button, (b) "Scan a folder" — text input for absolute path + scan button with toast feedback, (c) existing stats cards redesigned as instrument-style readouts, (d) last-scan timestamp |
| **Mini player** | Hairline progress on top, square artwork, mono spec, SVG transport icons, swipe gestures preserved |
| **Full player** | Large square artwork (vinyl-jacket feel), serif title, mono spec strip, hairline progress with accent fill, SVG transport icons, "power-button" play. Dynamic color extraction preserved but used subtly — background tint only, not full wash. |
| **Lyrics panel + view** | Active line in serif accent; past/future in dim mono. Karaoke auto-scroll and size toggle preserved. |
| **Queue** | Same item styling, drag handles preserved |
| **Video player** | Native controls kept, header refined |
| **Toast** | Mono caps, slim, SVG icon prefix |

## What's preserved (nothing dropped)

All behavior, every function:

- `playAudio`, `playVideo`
- `togglePlay`, `nextTrack`, `previousTrack`
- `toggleShuffle` (loads full library and Fisher-Yates shuffles)
- `toggleRepeat` (off / all / one)
- `seekTo`, `updateProgress`
- `openFullPlayer` / `closeFullPlayer`
- `openQueue` / `clearQueue` / `playFromQueue`
- `toggleLyricsPanel`
- `openLyrics` / `closeLyrics` / `toggleLyricsSize`
- `startLyricsSync` / `stopLyricsSync` (LRC sync at 100ms)
- `extractAlbumColors` / `updatePlayerBackground` (canvas-based dominant color)
- Infinite scroll on Library + Video
- Swipe gestures: left/right = prev/next, up = expand full player, down = close
- Search debounce (300ms)
- Codec quick-filter
- Quality indicator
- All 5 tabs' content loaders
- Native video player

API call surface unchanged.

## New API surface used

- `POST /api/scan` (no body) — full rescan of all configured roots
- `POST /api/scan` with `{ "path": "/abs/dir" }` — ad-hoc folder scan (surfaced in Sources tab)

## Implementation approach

Single file, in-place rewrite of `mobile-player-v2.html`. JS function names and DOM IDs that the script relies on stay identical → reduces breakage risk on a 2.8k-line refactor. CSS fully replaced. New SVG icon set inline (~20 icons). Google Fonts loaded over CDN (Fraunces, Geist, Geist Mono).

## Out of scope

- Server doesn't currently expose configured `mediaPaths` over API. The Sources panel will not list configured roots. If wanted, follow-up: add `GET /api/config` returning `{ mediaPaths }`.
- Pre-existing TypeScript build errors — unchanged by this work.
- `ffmpeg` still not installed; transcoding endpoints still won't work, but the UI doesn't depend on them.
