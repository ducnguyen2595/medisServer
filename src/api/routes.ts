import { Router } from 'express';
import { db } from '../database.js';
import { streamMedia, getMediaInfo } from '../streaming.js';
import { getThumbnail } from '../thumbnail.js';
import { rebuildBubbleIndex, drillBuckets, rebuildBubbleGraphSnapshot } from '../bubbleIndex.js';
import fs from 'fs';
import path from 'path';

const router = Router();

// Fast search using FTS5
function searchMedia(query: string, type?: string, limit = 100, offset = 0) {
  // Prepare FTS5 query - wrap each word in quotes and use OR
  // Support phrase search if query contains quotes
  let ftsQuery = query;
  if (!query.includes('"')) {
    // Split by spaces and create OR query for better results
    const terms = query.trim().split(/\s+/).filter(t => t.length > 0);
    ftsQuery = terms.map(term => `"${term.replace(/"/g, '""')}"`).join(' OR ');
  }
  
  let sql = `
    SELECT m.* FROM media_files m
    INNER JOIN media_search s ON m.id = s.rowid
    WHERE media_search MATCH ?
  `;
  
  const params: any[] = [ftsQuery];
  
  if (type && ['audio', 'video', 'image'].includes(type)) {
    sql += ' AND m.media_type = ?';
    params.push(type);
  }
  
  sql += ' ORDER BY rank LIMIT ? OFFSET ?';
  params.push(limit, offset);
  
  const stmt = db.prepare(sql);
  const results = stmt.all(...params);
  
  // Get count
  let countSql = `
    SELECT COUNT(*) as total FROM media_files m
    INNER JOIN media_search s ON m.id = s.rowid
    WHERE media_search MATCH ?
  `;
  const countParams: any[] = [ftsQuery];
  
  if (type && ['audio', 'video', 'image'].includes(type)) {
    countSql += ' AND m.media_type = ?';
    countParams.push(type);
  }
  
  const countStmt = db.prepare(countSql);
  const countResult = countStmt.get(...countParams) as { total: number };
  
  return {
    data: results,
    total: countResult.total,
  };
}

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Get all media files with pagination and filtering
router.get('/media', (req, res) => {
  const {
    type,
    artist,
    album,
    genre,
    search,
    limit = '50',
    offset = '0',
    sort = 'title',
    order = 'ASC',
  } = req.query;

  try {
    // Use FTS search if search query is provided
    if (search && typeof search === 'string' && search.trim()) {
      const searchResult = searchMedia(
        search.trim(),
        type as string,
        parseInt(limit as string, 10),
        parseInt(offset as string, 10)
      );
      
      return res.json({
        data: searchResult.data,
        pagination: {
          total: searchResult.total,
          limit: parseInt(limit as string, 10),
          offset: parseInt(offset as string, 10),
        },
      });
    }

    // Regular query without search
    let query = 'SELECT * FROM media_files WHERE 1=1';
    const params: any[] = [];

    if (type && ['audio', 'video', 'image'].includes(type as string)) {
      query += ' AND media_type = ?';
      params.push(type);
    }

    if (artist) {
      query += ' AND artist LIKE ?';
      params.push(`%${artist}%`);
    }

    if (album) {
      query += ' AND album LIKE ?';
      params.push(`%${album}%`);
    }

    if (genre) {
      query += ' AND genre LIKE ?';
      params.push(`%${genre}%`);
    }

    // Validate sort column
    const validSorts = ['title', 'artist', 'album', 'year', 'duration', 'created_at', 'file_name'];
    const sortColumn = validSorts.includes(sort as string) ? sort : 'title';
    const sortOrder = order === 'DESC' ? 'DESC' : 'ASC';

    query += ` ORDER BY ${sortColumn} ${sortOrder}`;
    query += ' LIMIT ? OFFSET ?';
    params.push(parseInt(limit as string, 10), parseInt(offset as string, 10));

    const stmt = db.prepare(query);
    const results = stmt.all(...params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM media_files WHERE 1=1';
    const countParams: any[] = [];

    if (type && ['audio', 'video', 'image'].includes(type as string)) {
      countQuery += ' AND media_type = ?';
      countParams.push(type);
    }

    if (artist) {
      countQuery += ' AND artist LIKE ?';
      countParams.push(`%${artist}%`);
    }

    if (album) {
      countQuery += ' AND album LIKE ?';
      countParams.push(`%${album}%`);
    }

    if (genre) {
      countQuery += ' AND genre LIKE ?';
      countParams.push(`%${genre}%`);
    }

    const countStmt = db.prepare(countQuery);
    const countResult = countStmt.get(...countParams) as { total: number };

    res.json({
      data: results,
      pagination: {
        total: countResult.total,
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
      },
    });
  } catch (error) {
    console.error('Error querying media:', error);
    res.status(500).json({ error: 'Failed to fetch media files' });
  }
});

// Get single media file by ID
router.get('/media/:id', (req, res) => {
  const { id } = req.params;

  try {
    const stmt = db.prepare('SELECT * FROM media_files WHERE id = ?');
    const media = stmt.get(id);

    if (!media) {
      return res.status(404).json({ error: 'Media file not found' });
    }

    res.json(media);
  } catch (error) {
    console.error('Error fetching media:', error);
    res.status(500).json({ error: 'Failed to fetch media file' });
  }
});

// Get thumbnail for media file
router.get('/thumbnail/:id', async (req, res) => {
  const { id } = req.params;
  const { width } = req.query;

  try {
    const stmt = db.prepare('SELECT file_path, media_type, title, artist, file_name FROM media_files WHERE id = ?');
    const media = stmt.get(id) as { file_path: string; media_type: string; title?: string; artist?: string; file_name: string } | undefined;

    if (!media) {
      return res.status(404).json({ error: 'Media file not found' });
    }

    // Parse filename for title/artist if missing (like we do for lyrics)
    let displayTitle = media.title?.trim();
    let displayArtist = media.artist?.trim();
    
    if (!displayTitle || !displayArtist) {
      const parsed = parseFilename(media.file_name);
      displayTitle = displayTitle || parsed.title;
      displayArtist = displayArtist || parsed.artist;
    }

    const thumbnailPath = await getThumbnail(
      media.file_path,
      media.media_type as 'audio' | 'video',
      width ? parseInt(width as string, 10) : 320,
      displayTitle,
      displayArtist,
      media.file_name
    );

    if (!thumbnailPath || !fs.existsSync(thumbnailPath)) {
      return res.status(404).json({ error: 'Thumbnail not available' });
    }

    // Determine content type based on file extension
    const contentType = thumbnailPath.endsWith('.svg') ? 'image/svg+xml' : 'image/jpeg';
    
    // Stream the thumbnail
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
    
    const stream = fs.createReadStream(thumbnailPath);
    stream.pipe(res);
  } catch (error) {
    console.error('Error serving thumbnail:', error);
    res.status(500).json({ error: 'Failed to generate thumbnail' });
  }
});

// Get lyrics for a track
router.get('/lyrics/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const stmt = db.prepare('SELECT lyrics, title, artist, album, duration, file_name FROM media_files WHERE id = ?');
    const media = stmt.get(id) as any;

    if (!media) {
      return res.status(404).json({ error: 'Media file not found' });
    }

    // Check if embedded lyrics exist
    if (media.lyrics) {
      const lyricsData = parseLyrics(media.lyrics);
      return res.json({
        id: parseInt(id),
        title: media.title,
        artist: media.artist,
        lyrics: lyricsData.lyrics,
        synced: lyricsData.synced,
        lines: lyricsData.lines,
        source: 'embedded'
      });
    }

    // No embedded lyrics - try fetching from online API
    // Use filename as fallback if title/artist are missing
    let searchTitle = media.title?.trim();
    let searchArtist = media.artist?.trim();
    
    // Parse filename if metadata is missing (common for WAV files)
    if (!searchTitle || !searchArtist) {
      const parsed = parseFilename(media.file_name);
      searchTitle = searchTitle || parsed.title;
      searchArtist = searchArtist || parsed.artist;
    }
    
    if (searchTitle && searchArtist) {
      console.log(`🔍 Fetching lyrics online for: "${searchArtist}" - "${searchTitle}"`);
      console.log(`   Parsed from filename: "${media.file_name}"`);
      
      const onlineLyrics = await fetchLyricsOnline(searchTitle, searchArtist, media.album, media.duration);
      console.log(`   Result: ${onlineLyrics ? 'Found!' : 'Not found'}`);
      
      if (onlineLyrics) {
        // Cache the fetched lyrics in database
        const updateStmt = db.prepare('UPDATE media_files SET lyrics = ? WHERE id = ?');
        updateStmt.run(onlineLyrics, id);
        
        const lyricsData = parseLyrics(onlineLyrics);
        console.log(`✅ Lyrics found and cached for: ${searchArtist} - ${searchTitle}`);
        
        return res.json({
          id: parseInt(id),
          title: media.title || searchTitle,
          artist: media.artist || searchArtist,
          lyrics: lyricsData.lyrics,
          synced: lyricsData.synced,
          lines: lyricsData.lines,
          source: 'online'
        });
      }
    }

    // No lyrics found anywhere
    return res.json({ 
      id: parseInt(id), 
      lyrics: null,
      title: media.title,
      artist: media.artist,
      message: 'No lyrics available for this track',
      source: 'none'
    });
  } catch (error) {
    console.error('Error fetching lyrics:', error);
    res.status(500).json({ error: 'Failed to fetch lyrics' });
  }
});

// Parse filename to extract title and artist (fallback for files without metadata)
function parseFilename(filename: string): { title: string, artist: string } {
  // Remove file extension
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
  
  // Remove track numbers at start (e.g., "01 - ", "01. ", "Track 01 - ")
  let cleaned = nameWithoutExt.replace(/^(\d+[\s.-]+|Track\s+\d+[\s.-]+)/i, '');
  
  // Try to split by common delimiters
  // Pattern 1: "Title - Artist" or "Artist - Title"
  if (cleaned.includes(' - ')) {
    const parts = cleaned.split(' - ').map(p => p.trim());
    
    if (parts.length >= 3) {
      // Pattern: "Track - Title - Artist" (already removed track number)
      return { title: parts[0], artist: parts[1] };
    } else if (parts.length === 2) {
      // Common Vietnamese pattern: "Title - Artist"
      // Check if first part looks like a title (longer or has certain words)
      return { title: parts[0], artist: parts[1] };
    }
  }
  
  // Pattern 2: Try other delimiters
  if (cleaned.includes(' _ ')) {
    const parts = cleaned.split(' _ ').map(p => p.trim());
    if (parts.length === 2) {
      return { title: parts[0], artist: parts[1] };
    }
  }
  
  // Fallback: Use whole name as title, artist as "Unknown"
  return { title: cleaned, artist: 'Unknown Artist' };
}

// Fetch lyrics from online API (LRCLIB.net)
async function fetchLyricsOnline(
  title: string, 
  artist: string, 
  album?: string | null, 
  duration?: number | null
): Promise<string | null> {
  try {
    // Clean up search terms
    let cleanTitle = title.replace(/[\(\[].*?[\)\]]/g, '').trim(); // Remove (feat.) etc
    let cleanArtist = artist.split(/[,&]/)[0].trim(); // Take first artist if multiple
    
    // Capitalize first letter properly (handle "VI" -> "Vi" etc)
    cleanTitle = cleanTitle.toLowerCase().split(' ').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
    cleanArtist = cleanArtist.toLowerCase().split(' ').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
    
    // Build search URL
    const params = new URLSearchParams({
      track_name: cleanTitle,
      artist_name: cleanArtist,
    });
    
    if (album) {
      params.append('album_name', album);
    }
    if (duration) {
      params.append('duration', Math.round(duration).toString());
    }
    
    const url = `https://lrclib.net/api/get?${params.toString()}`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Medis-Server/1.0'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      
      // Prefer synced lyrics, fallback to plain
      if (data.syncedLyrics) {
        return data.syncedLyrics;
      } else if (data.plainLyrics) {
        return data.plainLyrics;
      }
    }
    
    // If exact match failed, try search API as fallback
    const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(cleanArtist + ' ' + cleanTitle)}`;
    const searchResponse = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Medis-Server/1.0'
      }
    });
    
    if (searchResponse.ok) {
      const results = await searchResponse.json();
      if (results && results.length > 0) {
        // Return first result's lyrics
        const firstResult = results[0];
        if (firstResult.syncedLyrics) {
          return firstResult.syncedLyrics;
        } else if (firstResult.plainLyrics) {
          return firstResult.plainLyrics;
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching online lyrics:', error);
    return null;
  }
}

// Parse lyrics (supports plain text and LRC format)
function parseLyrics(lyrics: string): { lyrics: string, synced: boolean, lines: Array<{time: number, text: string}> } {
  const lrcRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/g;
  const lines: Array<{time: number, text: string}> = [];
  let synced = false;
  
  const matches = [...lyrics.matchAll(lrcRegex)];
  
  if (matches.length > 0) {
    synced = true;
    matches.forEach(match => {
      const minutes = parseInt(match[1]);
      const seconds = parseInt(match[2]);
      const centiseconds = parseInt(match[3].padEnd(3, '0').substring(0, 3));
      const time = minutes * 60 + seconds + centiseconds / 1000;
      const text = match[4].trim();
      
      if (text) {  // Skip empty lines
        lines.push({ time, text });
      }
    });
  }
  
  return {
    lyrics,
    synced,
    lines: lines.sort((a, b) => a.time - b.time)
  };
}

// Stream media file
router.get('/stream/:id', async (req, res) => {
  const { id } = req.params;
  const { transcode, bitrate, format } = req.query;

  try {
    const stmt = db.prepare('SELECT * FROM media_files WHERE id = ?');
    const media = stmt.get(id) as any;

    if (!media) {
      return res.status(404).json({ error: 'Media file not found' });
    }

    const options = {
      transcode: transcode === 'true',
      bitrate: bitrate ? parseInt(bitrate as string, 10) : undefined,
      format: format as string | undefined,
    };

    await streamMedia(media.file_path, req, res, options);
  } catch (error) {
    console.error('Error streaming media:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to stream media file' });
    }
  }
});

// Get media file info (without streaming)
router.get('/info/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const stmt = db.prepare('SELECT * FROM media_files WHERE id = ?');
    const media = stmt.get(id) as any;

    if (!media) {
      return res.status(404).json({ error: 'Media file not found' });
    }

    const info = await getMediaInfo(media.file_path);
    res.json({ ...media, technical: info });
  } catch (error) {
    console.error('Error getting media info:', error);
    res.status(500).json({ error: 'Failed to get media file info' });
  }
});

// Get all artists
router.get('/artists', (req, res) => {
  try {
    const stmt = db.prepare(`
      SELECT artist, COUNT(*) as track_count, COUNT(DISTINCT album) as album_count
      FROM media_files
      WHERE media_type = 'audio' AND artist IS NOT NULL
      GROUP BY artist
      ORDER BY artist ASC
    `);
    const artists = stmt.all();
    res.json(artists);
  } catch (error) {
    console.error('Error fetching artists:', error);
    res.status(500).json({ error: 'Failed to fetch artists' });
  }
});

// Get all albums
router.get('/albums', (req, res) => {
  const { artist } = req.query;

  try {
    let query = `
      SELECT album, artist, album_artist, COUNT(*) as track_count, 
             MIN(year) as year, MIN(genre) as genre
      FROM media_files
      WHERE media_type = 'audio' AND album IS NOT NULL
    `;
    const params: any[] = [];

    if (artist) {
      query += ' AND artist = ?';
      params.push(artist);
    }

    query += ' GROUP BY album, artist ORDER BY album ASC';

    const stmt = db.prepare(query);
    const albums = stmt.all(...params);
    res.json(albums);
  } catch (error) {
    console.error('Error fetching albums:', error);
    res.status(500).json({ error: 'Failed to fetch albums' });
  }
});

// Get all genres
router.get('/genres', (req, res) => {
  try {
    const stmt = db.prepare(`
      SELECT genre, COUNT(*) as track_count
      FROM media_files
      WHERE media_type = 'audio' AND genre IS NOT NULL
      GROUP BY genre
      ORDER BY genre ASC
    `);
    const genres = stmt.all();
    res.json(genres);
  } catch (error) {
    console.error('Error fetching genres:', error);
    res.status(500).json({ error: 'Failed to fetch genres' });
  }
});

// Dedicated search endpoint (faster than /media with search param)
router.get('/search', (req, res) => {
  const { q, type, limit = '50', offset = '0' } = req.query;

  if (!q || typeof q !== 'string' || !q.trim()) {
    return res.status(400).json({ error: 'Query parameter "q" is required' });
  }

  try {
    const searchResult = searchMedia(
      q.trim(),
      type as string,
      parseInt(limit as string, 10),
      parseInt(offset as string, 10)
    );

    res.json({
      query: q,
      data: searchResult.data,
      pagination: {
        total: searchResult.total,
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
      },
    });
  } catch (error) {
    console.error('Error searching media:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Get library statistics
router.get('/stats', (req, res) => {
  try {
    const totalFiles = db.prepare('SELECT COUNT(*) as count FROM media_files').get() as { count: number };
    const audioFiles = db.prepare("SELECT COUNT(*) as count FROM media_files WHERE media_type = 'audio'").get() as { count: number };
    const videoFiles = db.prepare("SELECT COUNT(*) as count FROM media_files WHERE media_type = 'video'").get() as { count: number };
    const imageFiles = db.prepare("SELECT COUNT(*) as count FROM media_files WHERE media_type = 'image'").get() as { count: number };
    const totalSize = db.prepare('SELECT SUM(file_size) as size FROM media_files').get() as { size: number };
    const totalDuration = db.prepare('SELECT SUM(duration) as duration FROM media_files WHERE duration IS NOT NULL').get() as { duration: number };

    const lastScan = db.prepare('SELECT * FROM scan_history ORDER BY started_at DESC LIMIT 1').get();

    res.json({
      total_files: totalFiles.count,
      audio_files: audioFiles.count,
      video_files: videoFiles.count,
      image_files: imageFiles.count,
      total_size_bytes: totalSize.size || 0,
      total_duration_seconds: totalDuration.duration || 0,
      last_scan: lastScan,
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Bubble snapshots: top-level facet aggregations
router.get('/bubbles/top', (req, res) => {
  try {
    const row = db.prepare('SELECT payload, track_count, built_at FROM bubble_snapshot WHERE id = 1').get() as any;
    if (!row) return res.json({ facets: [], track_count: 0, built_at: null });
    const parsed = JSON.parse(row.payload);
    res.set('Cache-Control', 'public, max-age=60');
    res.json({ ...parsed, track_count: row.track_count, built_at: row.built_at });
  } catch (err) {
    console.error('bubbles/top error:', err);
    res.status(500).json({ error: 'Failed to fetch bubble snapshot' });
  }
});

// Drill down into a facet's buckets
router.get('/bubbles/drill', (req, res) => {
  const { facet, path } = req.query;
  if (typeof facet !== 'string') return res.status(400).json({ error: 'facet required' });
  let parsedPath: string[] = [];
  try {
    parsedPath = path ? JSON.parse(path as string) : [];
  } catch {
    return res.status(400).json({ error: 'invalid path JSON' });
  }
  try {
    const result = drillBuckets(facet, parsedPath);
    res.json(result);
  } catch (err: any) {
    console.error('bubbles/drill error:', err);
    res.status(500).json({ error: 'Drill query failed' });
  }
});

// Rebuild bubble index
router.post('/bubbles/rebuild', (req, res) => {
  try {
    rebuildBubbleIndex();
    res.json({ status: 'ok' });
  } catch (err: any) {
    console.error('rebuild failed:', err);
    res.status(500).json({ error: 'Rebuild failed' });
  }
});

// Get graph snapshot
router.get('/bubbles/graph', (req, res) => {
  try {
    const row = db.prepare('SELECT payload, node_count, edge_count, built_at FROM bubble_graph_snapshot WHERE id = 1').get() as any;
    if (!row) return res.status(404).json({ error: 'Graph snapshot not built' });
    const parsed = JSON.parse(row.payload);
    res.set('Cache-Control', 'public, max-age=60');
    res.json({ ...parsed, nodeCount: row.node_count, edgeCount: row.edge_count, builtAt: row.built_at });
  } catch (err) {
    console.error('bubbles/graph error:', err);
    res.status(500).json({ error: 'Failed to fetch graph snapshot' });
  }
});

// Rebuild graph snapshot
router.post('/bubbles/graph/rebuild', (req, res) => {
  try {
    rebuildBubbleGraphSnapshot();
    res.json({ status: 'ok' });
  } catch (err: any) {
    console.error('graph rebuild failed:', err);
    res.status(500).json({ error: 'Graph rebuild failed' });
  }
});

// Record a play event for a track
router.post('/track/:id/played', (req, res) => {
  const { id } = req.params;
  const { started_at, seconds_listened, completed } = req.body;

  if (typeof seconds_listened !== 'number' || seconds_listened < 0) {
    return res.status(400).json({ error: 'seconds_listened must be a non-negative number' });
  }

  try {
    const media = db.prepare('SELECT id FROM media_files WHERE id = ?').get(id);
    if (!media) return res.status(404).json({ error: 'Media file not found' });

    db.prepare(`
      INSERT INTO play_events (media_file_id, started_at, seconds_listened, completed)
      VALUES (?, ?, ?, ?)
    `).run(
      parseInt(id, 10),
      started_at ?? Math.floor(Date.now() / 1000),
      Math.floor(seconds_listened),
      completed ? 1 : 0
    );

    res.json({ status: 'ok' });
  } catch (error) {
    console.error('Error recording play event:', error);
    res.status(500).json({ error: 'Failed to record play event' });
  }
});

// Get listening stats
router.get('/stats/listening', (req, res) => {
  const { limit = '20', period } = req.query;
  const lim = parseInt(limit as string, 10);

  let sinceClause = '';
  const sinceParams: any[] = [];
  if (period && typeof period === 'string') {
    const days = parseInt(period, 10);
    if (!isNaN(days) && days > 0) {
      sinceClause = 'AND pe.started_at >= ?';
      sinceParams.push(Math.floor(Date.now() / 1000) - days * 86400);
    }
  }

  try {
    const topTracks = db.prepare(`
      SELECT
        m.id, m.title, m.artist, m.album, m.duration,
        COUNT(pe.id) AS play_count,
        SUM(pe.seconds_listened) AS total_seconds,
        MAX(pe.started_at) AS last_played
      FROM play_events pe
      JOIN media_files m ON m.id = pe.media_file_id
      WHERE 1=1 ${sinceClause}
      GROUP BY pe.media_file_id
      ORDER BY play_count DESC, total_seconds DESC
      LIMIT ?
    `).all(...sinceParams, lim);

    const topArtists = db.prepare(`
      SELECT
        m.artist,
        COUNT(pe.id) AS play_count,
        SUM(pe.seconds_listened) AS total_seconds
      FROM play_events pe
      JOIN media_files m ON m.id = pe.media_file_id
      WHERE m.artist IS NOT NULL ${sinceClause}
      GROUP BY m.artist
      ORDER BY total_seconds DESC
      LIMIT ?
    `).all(...sinceParams, lim);

    const totals = db.prepare(`
      SELECT COUNT(*) AS total_plays, SUM(seconds_listened) AS total_seconds
      FROM play_events pe
      WHERE 1=1 ${sinceClause}
    `).get(...sinceParams) as { total_plays: number; total_seconds: number };

    const recent = db.prepare(`
      SELECT pe.id, pe.started_at, pe.seconds_listened, pe.completed,
             m.id AS media_id, m.title, m.artist, m.album
      FROM play_events pe
      JOIN media_files m ON m.id = pe.media_file_id
      ORDER BY pe.started_at DESC
      LIMIT ?
    `).all(lim);

    res.json({
      top_tracks: topTracks,
      top_artists: topArtists,
      total_plays: totals.total_plays,
      total_seconds: totals.total_seconds ?? 0,
      recent,
    });
  } catch (error) {
    console.error('Error fetching listening stats:', error);
    res.status(500).json({ error: 'Failed to fetch listening stats' });
  }
});

// Trigger manual scan. Optional body: { "path": "/abs/dir" } to scan a single
// folder once (added to the library but not included in the daily schedule).
router.post('/scan', async (req, res) => {
  try {
    const requestedPath = typeof req.body?.path === 'string' ? req.body.path.trim() : '';

    if (requestedPath) {
      if (!path.isAbsolute(requestedPath)) {
        return res.status(400).json({ error: 'path must be absolute' });
      }
      let stat;
      try {
        stat = fs.statSync(requestedPath);
      } catch {
        return res.status(400).json({ error: `path does not exist: ${requestedPath}` });
      }
      if (!stat.isDirectory()) {
        return res.status(400).json({ error: `path is not a directory: ${requestedPath}` });
      }
    }

    const { MediaScanner } = await import('../scanner.js');
    const scanner = new MediaScanner();

    const run = requestedPath ? scanner.scanPath(requestedPath) : scanner.scanAll();
    run
      .then(stats => {
        console.log('✅ Manual scan completed:', stats);
      })
      .catch(error => {
        console.error('❌ Manual scan failed:', error);
      });

    res.json({
      message: 'Scan started',
      status: 'running',
      scope: requestedPath ? { type: 'path', path: requestedPath } : { type: 'all' },
    });
  } catch (error) {
    console.error('Error starting scan:', error);
    res.status(500).json({ error: 'Failed to start scan' });
  }
});

export default router;
