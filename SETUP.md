# 🚀 Quick Setup Guide

## Your Media Server is Ready!

The server is **currently running** at:
- **Local**: http://localhost:3000
- **Network**: http://192.168.10.3:3000 (or http://10.183.137.220:3000)

---

## 📱 Access from Your Phone

### Option 1: Web Player (Easiest)

1. **Open the HTML player** on your phone's browser:
   - Use the network URL: `http://192.168.10.3:3000` (or the IP shown in your terminal)
   - Or open these files directly:
     - `client-example.html` - Full-featured desktop/tablet player
     - `mobile-player.html` - Mobile-optimized player (recommended for phones)

2. **Update the server URL** in the HTML files:
   - Edit line: `const SERVER_URL = 'http://192.168.10.3:3000';`
   - Change to your server's IP address

3. **Save to home screen** (iOS/Android):
   - Open the player in Safari/Chrome
   - Tap Share → Add to Home Screen
   - Now it works like a native app!

### Option 2: Use Any Music/Video Player App

Most mobile players support HTTP streaming:

**VLC (iOS/Android)**:
```
1. Open VLC
2. Network Stream
3. Enter: http://192.168.10.3:3000/api/stream/<media-id>
```

**foobar2000 (iOS/Android)**:
```
1. Add URL
2. Paste stream URL
3. Play!
```

---

## 🎯 API Endpoints

### Browse Your Library
```bash
# Get all audio files
curl http://192.168.10.3:3000/api/media?type=audio&limit=50

# Search
curl http://192.168.10.3:3000/api/media?search=beatles

# Get artists
curl http://192.168.10.3:3000/api/artists

# Get albums
curl http://192.168.10.3:3000/api/albums
```

### Stream Audio (Bit-Perfect)
```bash
# Direct streaming (no quality loss)
http://192.168.10.3:3000/api/stream/123

# Transcoded (for compatibility)
http://192.168.10.3:3000/api/stream/123?transcode=true&bitrate=320&format=mp3
```

---

## 📊 Your Library Stats

```
Total Files:    1,496
  - Audio:      889 files
  - Video:      50 files
  - Images:     557 files

Total Size:     ~61.5 GB
Total Duration: ~76 hours
```

### Audio Formats Found:
- ✅ FLAC (562 files) - Lossless
- ✅ DSF (86 files) - DSD audiophile format
- ✅ WAV (191 files) - Uncompressed
- ✅ APE (30 files) - Lossless
- ✅ MP3 (14 files)
- ✅ M4A (6 files)

---

## 🛠️ Server Management

### Start/Stop Server
```bash
# Start (already running)
npm run dev

# Stop
# Press Ctrl+C in the terminal

# Production mode
npm start
```

### Manual Scan
```bash
# Scan for new/changed files
npm run scan

# Or trigger via API
curl -X POST http://localhost:3000/api/scan
```

### Auto Scanning
The server automatically scans your `~/Downloads` folder **every day at 3 AM**.

To change the schedule, edit `config.ts`:
```typescript
scanCron: '0 3 * * *'  // Cron format: min hour day month weekday
```

---

## 🔧 Configuration

Edit `src/config.ts` to customize:

```typescript
export const config = {
  mediaPath: '/Users/nguyend/Downloads',  // Your media folder
  port: 3000,                             // Server port
  host: '0.0.0.0',                        // Listen on all interfaces
  scanCron: '0 3 * * *',                  // Daily at 3 AM
  maxBitrate: 9600,                       // Max bitrate for transcoding
  enableTranscoding: true,                // Allow on-demand transcoding
};
```

---

## 🎧 Audiophile Quality Tips

### For Best Quality:
1. **Use direct streaming** (no transcoding)
2. **Use wired connection** or strong WiFi
3. **Use a player that supports lossless formats**
   - iOS: foobar2000, VOX, Flacbox
   - Android: Poweramp, USB Audio Player PRO, Neutron

### Your DSD Files:
- 86 DSD files (DSF format) detected
- Streamed bit-perfectly when supported
- Auto-transcodes for incompatible devices

### Bit Rates Available:
- **FLAC**: 16-bit/44.1kHz to 24-bit/192kHz
- **DSF**: DSD64 (2.8MHz) and DSD128 (5.6MHz)
- **WAV**: Uncompressed PCM

---

## 📱 Mobile Player Setup

### Update Server IP

1. Open `mobile-player.html`
2. Find line 235: `const SERVER_URL = 'http://192.168.10.3:3000';`
3. Change to your network IP (shown when server starts)
4. Open in phone browser
5. Add to home screen

### Features:
- 🎵 Browse music/videos
- 🔍 Real-time search
- 📊 Library statistics
- ▶️ Tap to play
- 🎨 Beautiful mobile UI

---

## 🌐 Network Access

Your server is accessible on:
- **Local**: `http://localhost:3000`
- **WiFi**: `http://192.168.10.3:3000`
- **VPN**: `http://10.183.137.220:3000`

**Security Note**: This server has no authentication. It's designed for local network use only. Don't expose it to the internet.

---

## 🐛 Troubleshooting

### Can't connect from phone?
1. Check both devices are on same WiFi
2. Try both IP addresses shown in terminal
3. Disable firewall temporarily to test
4. Make sure server is running

### Files not showing?
```bash
# Manual scan
npm run scan

# Check logs
cat data/media.db

# Restart server
npm run dev
```

### Audio won't play?
- Try transcoding: Add `?transcode=true` to stream URL
- Check phone supports format (FLAC, DSF may need special players)
- Try VLC or foobar2000 instead

---

## 📚 Full Documentation

- `README.md` - Complete feature documentation
- `API.md` - Full API reference
- `client-example.html` - Desktop web player
- `mobile-player.html` - Mobile web player

---

## 🎉 You're All Set!

Your audiophile media server is running and ready to stream high-quality audio to all your devices!

**Next Steps**:
1. Open `mobile-player.html` on your phone
2. Update the server IP
3. Add to home screen
4. Enjoy your music library! 🎵

---

**Need help?** Check the documentation or inspect the terminal logs.
