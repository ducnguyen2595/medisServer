# 📡 Medis Server API Reference

Complete REST API documentation for Medis Server.

## Base URL

```
http://<server-ip>:3000/api
```

## Response Format

All responses are in JSON format.

### Success Response
```json
{
  "data": [...],
  "pagination": {
    "total": 1000,
    "limit": 50,
    "offset": 0
  }
}
```

### Error Response
```json
{
  "error": "Error message"
}
```

---

## Endpoints

### 🏥 Health Check

**Endpoint**: `GET /api/health`

**Description**: Check if server is running

**Response**:
```json
{
  "status": "ok",
  "timestamp": 1704067200000
}
```

---

### 📚 Media Files

#### Get All Media Files

**Endpoint**: `GET /api/media`

**Description**: Retrieve paginated list of media files with filtering

**Query Parameters**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `type` | string | - | Filter by media type: `audio`, `video`, `image` |
| `artist` | string | - | Filter by artist name (partial match) |
| `album` | string | - | Filter by album name (partial match) |
| `genre` | string | - | Filter by genre (partial match) |
| `search` | string | - | Search across title, artist, album, filename |
| `limit` | number | 50 | Results per page (max 1000) |
| `offset` | number | 0 | Pagination offset |
| `sort` | string | title | Sort by: `title`, `artist`, `album`, `year`, `duration`, `created_at`, `file_name` |
| `order` | string | ASC | Sort order: `ASC` or `DESC` |

**Example Request**:
```http
GET /api/media?type=audio&artist=Beatles&limit=20&sort=year&order=DESC
```

**Response**:
```json
{
  "data": [
    {
      "id": 1,
      "file_path": "/Users/user/Downloads/DucMusic/...",
      "file_name": "song.flac",
      "file_size": 45678901,
      "media_type": "audio",
      "title": "Song Title",
      "artist": "Artist Name",
      "album": "Album Name",
      "album_artist": "Album Artist",
      "genre": "Rock",
      "year": 1970,
      "track_number": 1,
      "disc_number": 1,
      "duration": 245.67,
      "codec": "FLAC",
      "bit_rate": 1411000,
      "sample_rate": 44100,
      "bits_per_sample": 16,
      "channels": 2,
      "file_modified_at": 1704067200000,
      "scanned_at": 1704067200000,
      "created_at": 1704067200
    }
  ],
  "pagination": {
    "total": 562,
    "limit": 20,
    "offset": 0
  }
}
```

#### Get Single Media File

**Endpoint**: `GET /api/media/:id`

**Description**: Get details of a specific media file

**Path Parameters**:
- `id` (number): Media file ID

**Example Request**:
```http
GET /api/media/123
```

**Response**:
```json
{
  "id": 123,
  "file_path": "/Users/user/Downloads/DucMusic/song.flac",
  "file_name": "song.flac",
  "title": "Song Title",
  "artist": "Artist Name",
  ...
}
```

**Error Response** (404):
```json
{
  "error": "Media file not found"
}
```

---

### 🎵 Streaming

#### Stream Media File

**Endpoint**: `GET /api/stream/:id`

**Description**: Stream media file (audio/video) with optional transcoding

**Path Parameters**:
- `id` (number): Media file ID

**Query Parameters**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `transcode` | boolean | false | Force transcoding |
| `bitrate` | number | 320 | Target bitrate in kbps (if transcoding) |
| `format` | string | mp3 | Output format: `mp3`, `aac`, `ogg`, `opus`, `flac` |

**Example Requests**:

**Direct streaming (bit-perfect, no transcoding)**:
```http
GET /api/stream/123
```

**Transcoded streaming**:
```http
GET /api/stream/123?transcode=true&bitrate=320&format=mp3
```

**Response**:
- Content-Type: Audio/video MIME type
- Supports HTTP range requests for seeking
- Direct streaming: 206 Partial Content
- Transcoded: 200 OK with chunked transfer encoding

**Headers** (Direct Stream):
```
HTTP/1.1 206 Partial Content
Content-Range: bytes 0-1023/4567890
Accept-Ranges: bytes
Content-Length: 1024
Content-Type: audio/flac
Cache-Control: public, max-age=31536000
```

**Headers** (Transcoded):
```
HTTP/1.1 200 OK
Content-Type: audio/mpeg
Transfer-Encoding: chunked
Cache-Control: no-cache
```

#### Get Media Info

**Endpoint**: `GET /api/info/:id`

**Description**: Get detailed technical information about a media file (uses ffprobe)

**Path Parameters**:
- `id` (number): Media file ID

**Example Request**:
```http
GET /api/info/123
```

**Response**:
```json
{
  "id": 123,
  "file_path": "/path/to/file.flac",
  "title": "Song Title",
  ...
  "technical": {
    "streams": [
      {
        "codec_name": "flac",
        "codec_type": "audio",
        "sample_rate": "96000",
        "channels": 2,
        "bits_per_sample": 24,
        "duration": "245.67"
      }
    ],
    "format": {
      "filename": "/path/to/file.flac",
      "format_name": "flac",
      "duration": "245.67",
      "size": "45678901",
      "bit_rate": "1411000"
    }
  }
}
```

---

### 👤 Artists

**Endpoint**: `GET /api/artists`

**Description**: Get list of all artists with track counts

**Example Request**:
```http
GET /api/artists
```

**Response**:
```json
[
  {
    "artist": "The Beatles",
    "track_count": 213,
    "album_count": 13
  },
  {
    "artist": "Pink Floyd",
    "track_count": 147,
    "album_count": 15
  }
]
```

---

### 💿 Albums

**Endpoint**: `GET /api/albums`

**Description**: Get list of all albums with track counts

**Query Parameters**:
- `artist` (string, optional): Filter albums by artist

**Example Request**:
```http
GET /api/albums?artist=The Beatles
```

**Response**:
```json
[
  {
    "album": "Abbey Road",
    "artist": "The Beatles",
    "album_artist": "The Beatles",
    "track_count": 17,
    "year": 1969,
    "genre": "Rock"
  },
  {
    "album": "Sgt. Pepper's Lonely Hearts Club Band",
    "artist": "The Beatles",
    "album_artist": "The Beatles",
    "track_count": 13,
    "year": 1967,
    "genre": "Rock"
  }
]
```

---

### 🎸 Genres

**Endpoint**: `GET /api/genres`

**Description**: Get list of all genres with track counts

**Example Request**:
```http
GET /api/genres
```

**Response**:
```json
[
  {
    "genre": "Rock",
    "track_count": 450
  },
  {
    "genre": "Jazz",
    "track_count": 234
  }
]
```

---

### 📊 Statistics

**Endpoint**: `GET /api/stats`

**Description**: Get library statistics

**Example Request**:
```http
GET /api/stats
```

**Response**:
```json
{
  "total_files": 825,
  "audio_files": 562,
  "video_files": 50,
  "image_files": 213,
  "total_size_bytes": 123456789012,
  "total_duration_seconds": 145678.9,
  "last_scan": {
    "id": 5,
    "started_at": 1704067200,
    "completed_at": 1704070800,
    "files_scanned": 825,
    "files_added": 15,
    "files_updated": 3,
    "files_removed": 2,
    "status": "completed",
    "error": null
  }
}
```

---

### 🔄 Scan

**Endpoint**: `POST /api/scan`

**Description**: Trigger manual media library scan (runs in background)

**Example Request**:
```http
POST /api/scan
```

**Response**:
```json
{
  "message": "Scan started",
  "status": "running"
}
```

---

## Authentication

⚠️ **No authentication is currently implemented**. This server is designed for local network use only.

---

## Rate Limiting

No rate limiting is currently implemented.

---

## CORS

CORS is enabled for all origins. The server can be accessed from web applications on any domain.

---

## Error Codes

| Status Code | Meaning |
|-------------|---------|
| 200 | Success |
| 206 | Partial Content (range request) |
| 404 | Resource not found |
| 500 | Internal server error |

---

## WebSocket Support

Not currently implemented. Planned for future releases:
- Real-time scan progress
- Playlist updates
- Now playing synchronization

---

## Client Libraries

### JavaScript/TypeScript Example

```typescript
class MedisClient {
  constructor(private baseUrl: string) {}

  async getMedia(params: {
    type?: 'audio' | 'video' | 'image';
    artist?: string;
    album?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }) {
    const query = new URLSearchParams(params as any);
    const response = await fetch(`${this.baseUrl}/api/media?${query}`);
    return response.json();
  }

  getStreamUrl(id: number, transcode = false, bitrate = 320) {
    const params = transcode ? `?transcode=true&bitrate=${bitrate}` : '';
    return `${this.baseUrl}/api/stream/${id}${params}`;
  }

  async getArtists() {
    const response = await fetch(`${this.baseUrl}/api/artists`);
    return response.json();
  }

  async search(query: string) {
    const response = await fetch(
      `${this.baseUrl}/api/media?search=${encodeURIComponent(query)}`
    );
    return response.json();
  }
}

// Usage
const client = new MedisClient('http://192.168.1.100:3000');
const { data } = await client.getMedia({ type: 'audio', limit: 10 });
```

### cURL Examples

**Get audio files**:
```bash
curl "http://192.168.1.100:3000/api/media?type=audio&limit=5"
```

**Stream audio file**:
```bash
curl "http://192.168.1.100:3000/api/stream/123" --output song.flac
```

**Transcode to MP3**:
```bash
curl "http://192.168.1.100:3000/api/stream/123?transcode=true&format=mp3" --output song.mp3
```

**Search**:
```bash
curl "http://192.168.1.100:3000/api/media?search=beatles"
```

**Get statistics**:
```bash
curl "http://192.168.1.100:3000/api/stats"
```

---

## Best Practices

1. **Use pagination**: Always set appropriate `limit` values for large libraries
2. **Cache responses**: Media metadata rarely changes between scans
3. **Prefer direct streaming**: Only use transcoding when necessary
4. **Handle 404s gracefully**: Files may be deleted between scans
5. **Support range requests**: For seeking in audio/video players
6. **Use search wisely**: Consider debouncing search queries

---

## Future API Enhancements

Planned for future releases:
- Playlist management endpoints
- Favorite/rating system
- User preferences
- Real-time updates via WebSocket
- Album artwork endpoints
- Lyrics support
- Audio visualization data
