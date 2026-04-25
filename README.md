# 🎵 Medis Server

**Audiophile-grade media streaming server for local network access**

Stream your FLAC, DSD, WAV, and all media files from `~/Downloads` to your phone with pristine quality.

## ✨ Features

- 🎧 **Audiophile Quality**: Bit-perfect streaming for lossless formats (FLAC, DSF, WAV, APE)
- 🔊 **DSD Support**: Native streaming of DSD64/DSD128 files (DSF/DFF)
- 📱 **Mobile Access**: Access from any device on your local WiFi network
- 🔄 **Auto-Scanning**: Daily automatic media library updates
- 🎬 **Multi-Format**: Supports audio, video, and images
- ⚡ **Smart Transcoding**: On-demand conversion for incompatible devices
- 🗄️ **Rich Metadata**: Artist, album, genre browsing with full metadata extraction

## 🎼 Supported Formats

### Audio (Audiophile-grade)
- **Lossless**: FLAC, WAV, APE, DSF, DFF, ALAC
- **Lossy**: MP3, M4A, AAC, OGG, Opus, WMA

### Video
- MP4, MOV, MKV, AVI, WebM, WMV

### Images
- JPG, PNG, GIF, WebP, HEIC

## 🚀 Quick Start

### Prerequisites

1. **Node.js** (v18 or higher)
2. **FFmpeg** (for transcoding)

Install FFmpeg:
```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt install ffmpeg

# Windows
# Download from https://ffmpeg.org/download.html
```

### Installation

```bash
# Install dependencies
npm install

# Run initial scan (optional)
npm run scan

# Start server
npm run dev
```

The server will display network URLs you can use to access from your phone.

## 📖 API Documentation

### Base URL
```
http://<your-local-ip>:3000/api
```

### Endpoints

#### 🏥 Health Check
```http
GET /api/health
```

#### 📚 Browse Media

**Get all media files**
```http
GET /api/media?type=audio&limit=50&offset=0&sort=title&order=ASC
```

Query Parameters:
- `type`: Filter by type (`audio`, `video`, `image`)
- `artist`: Filter by artist name
- `album`: Filter by album name
- `genre`: Filter by genre
- `search`: Full-text search across title, artist, album, filename
- `limit`: Results per page (default: 50)
- `offset`: Pagination offset (default: 0)
- `sort`: Sort column (`title`, `artist`, `album`, `year`, `duration`, `created_at`, `file_name`)
- `order`: Sort order (`ASC`, `DESC`)

**Get single media file**
```http
GET /api/media/:id
```

#### 🎵 Stream Media

**Direct streaming (bit-perfect)**
```http
GET /api/stream/:id
```

**Transcoded streaming**
```http
GET /api/stream/:id?transcode=true&bitrate=320&format=mp3
```

Query Parameters:
- `transcode`: Force transcoding (`true`/`false`)
- `bitrate`: Target bitrate in kbps (e.g., `320`, `192`, `128`)
- `format`: Output format (`mp3`, `aac`, `ogg`, `opus`, `flac`)

#### 👤 Browse by Artist
```http
GET /api/artists
```

Returns list of all artists with track counts.

#### 💿 Browse by Album
```http
GET /api/albums?artist=<artist_name>
```

Returns list of all albums, optionally filtered by artist.

#### 🎸 Browse by Genre
```http
GET /api/genres
```

Returns list of all genres with track counts.

#### 📊 Library Statistics
```http
GET /api/stats
```

Returns:
- Total files by type
- Total storage size
- Total duration
- Last scan information

#### 🔄 Trigger Manual Scan
```http
POST /api/scan
```

Starts a background media library scan.

## 🎧 Streaming Quality Guide

### For Maximum Quality (Audiophile)

**FLAC, DSF, WAV files**: Use direct streaming without transcoding
```
http://192.168.1.100:3000/api/stream/123
```

Benefits:
- Bit-perfect audio
- No quality loss
- Original sample rate preserved (up to 192kHz, DSD128)
- Original bit depth (16/24/32-bit)

### For Compatibility

Some mobile players may not support all formats. Use transcoding:
```
http://192.168.1.100:3000/api/stream/123?transcode=true&bitrate=320&format=mp3
```

Recommended settings:
- **High quality**: `bitrate=320` (320kbps MP3)
- **Balanced**: `bitrate=192` (192kbps MP3)
- **Data saving**: `bitrate=128` (128kbps MP3)

## 📱 Mobile App Integration

### Example: Using VLC on iOS/Android

1. Open VLC
2. Go to Network Stream
3. Enter: `http://<server-ip>:3000/api/stream/<media-id>`
4. Play!

### Example: Using Fetch API in Web App

```javascript
// Get all audio files
const response = await fetch('http://192.168.1.100:3000/api/media?type=audio');
const { data } = await response.json();

// Stream a file
const audioPlayer = new Audio(`http://192.168.1.100:3000/api/stream/${data[0].id}`);
audioPlayer.play();
```

### Example: Building Custom Client

```javascript
// Search for songs
const search = async (query) => {
  const response = await fetch(
    `http://192.168.1.100:3000/api/media?search=${encodeURIComponent(query)}`
  );
  return response.json();
};

// Get all albums by artist
const getArtistAlbums = async (artist) => {
  const response = await fetch(
    `http://192.168.1.100:3000/api/albums?artist=${encodeURIComponent(artist)}`
  );
  return response.json();
};
```

## ⚙️ Configuration

Create a `.env` file (optional):

```bash
# Media library path
MEDIA_PATH=/Users/yourusername/Downloads

# Server configuration
PORT=3000
HOST=0.0.0.0

# Scan schedule (cron format)
# Default: 3 AM daily
SCAN_CRON=0 3 * * *

# Database path
DB_PATH=./data/media.db

# Streaming settings
MAX_BITRATE=9600
ENABLE_TRANSCODING=true
CACHE_DIR=./cache
```

## 🔧 Scripts

```bash
# Development mode with auto-reload
npm run dev

# Build TypeScript
npm run build

# Production mode
npm start

# Manual scan
npm run scan
```

## 📂 Project Structure

```
medisServer/
├── src/
│   ├── index.ts           # Main server entry point
│   ├── config.ts          # Configuration management
│   ├── database.ts        # SQLite database setup
│   ├── scanner.ts         # Media file scanner
│   ├── streaming.ts       # Streaming & transcoding logic
│   └── api/
│       └── routes.ts      # API endpoints
├── data/                  # Database storage (auto-created)
├── cache/                 # Transcoding cache (auto-created)
├── package.json
├── tsconfig.json
└── README.md
```

## 🎯 Use Cases

### Home Audio Streaming
Stream your lossless FLAC collection to your phone anywhere in your home.

### Video Library Access
Watch your MP4/MOV videos on mobile devices without transferring files.

### Photo Browsing
Access your HEIC photos from iOS backup on any device.

### Car Audio
Stream high-quality audio to your car's head unit via WiFi hotspot.

## 🔒 Security Notes

⚠️ **Important**: This server is designed for **local network use only**.

- No authentication implemented (anyone on your WiFi can access)
- Binds to `0.0.0.0` for local network access
- Do NOT expose to the internet without adding authentication
- Recommended for home/trusted networks only

## 🐛 Troubleshooting

**Server won't start:**
```bash
# Check if port 3000 is already in use
lsof -i :3000

# Use a different port
PORT=3001 npm run dev
```

**FFmpeg not found:**
```bash
# Verify FFmpeg installation
ffmpeg -version

# Install if missing
brew install ffmpeg  # macOS
```

**Files not showing up:**
```bash
# Trigger manual scan
npm run scan

# Check logs for errors
```

**Can't connect from phone:**
- Ensure phone and server are on same WiFi network
- Check firewall settings
- Try the IP address shown in server startup logs

## 📈 Performance Tips

1. **SSD Storage**: Keep media on SSD for faster scanning and streaming
2. **Direct Streaming**: Avoid transcoding when possible for lower CPU usage
3. **Database Location**: Keep database on fast storage (default: `./data/`)
4. **Scheduled Scans**: Adjust `SCAN_CRON` to run during low-usage hours

## 🎼 Audiophile Technical Details

### Supported Audio Specs
- **Sample Rates**: 44.1kHz, 48kHz, 88.2kHz, 96kHz, 176.4kHz, 192kHz
- **Bit Depths**: 16-bit, 24-bit, 32-bit
- **DSD**: DSD64 (2.8MHz), DSD128 (5.6MHz)
- **Channels**: Mono, Stereo, Multi-channel (5.1, 7.1)

### Streaming Method
- **Direct**: File streamed as-is (zero quality loss)
- **Range Support**: HTTP range requests for seeking
- **Caching**: Browser-level caching for frequently accessed files

## 📄 License

MIT

## 🙏 Credits

Built with:
- **Express** - Web framework
- **better-sqlite3** - Fast SQLite database
- **music-metadata** - Audio metadata extraction
- **fluent-ffmpeg** - Audio/video transcoding
- **node-cron** - Task scheduling

---

**Made with ❤️ for audiophiles who refuse to compromise on quality**
