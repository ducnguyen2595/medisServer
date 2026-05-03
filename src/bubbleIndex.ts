import { db } from './database.js';

interface Bucket {
  name: string;
  count: number;
  overflow?: boolean;
}

interface Facet {
  key: string;
  buckets: Bucket[];
}

interface BubbleSnapshot {
  facets: Facet[];
}

// Graph types
interface GraphNode {
  id: string;
  type: 'artist' | 'album' | 'genre';
  label: string;
  value: number;
  artist?: string; // for album nodes
}

interface GraphLink {
  source: string;
  target: string;
}

interface GraphPayload {
  nodes: GraphNode[];
  links: GraphLink[];
}

const FACET_LEVELS = {
  genre: [
    { field: 'genre', fallback: 'Unknown' },
    { field: 'artist', fallback: 'Unknown Artist' },
    { field: 'album', fallback: 'Singles' },
  ],
  artist: [
    { field: 'artist', fallback: 'Unknown Artist' },
    { field: 'album', fallback: 'Singles' },
  ],
  album: [{ field: 'album', fallback: 'Unknown Album' }],
  decade: [
    { field: 'decade', derived: true },
    { field: 'artist', fallback: 'Unknown Artist' },
    { field: 'album', fallback: 'Singles' },
  ],
  format: [
    { field: 'format', derived: true },
    { field: 'artist', fallback: 'Unknown Artist' },
    { field: 'album', fallback: 'Singles' },
  ],
  recent: [
    { field: 'recent', derived: true },
    { field: 'artist', fallback: 'Unknown Artist' },
    { field: 'album', fallback: 'Singles' },
  ],
};

function getFormatBucket(codec: string | null, sampleRate: number | null, bitsPerSample: number | null): string {
  const c = (codec || '').toUpperCase();
  if (c.includes('DSD')) return 'DSD';
  if (c === 'FLAC' && ((sampleRate ?? 0) > 48000 || (bitsPerSample ?? 0) > 16)) return 'Hi-Res';
  if (['FLAC', 'ALAC', 'WAV'].includes(c)) return 'Lossless';
  return 'Lossy';
}

function getRecentBucket(createdAt: number): string {
  const now = Math.floor(Date.now() / 1000);
  const ageSeconds = now - createdAt;
  const DAY = 86400;
  const WEEK = 7 * DAY;
  const MONTH = 30 * DAY;
  const QUARTER = 90 * DAY;

  if (ageSeconds < DAY) return 'Today';
  if (ageSeconds < WEEK) return 'This week';
  if (ageSeconds < MONTH) return 'This month';
  if (ageSeconds < QUARTER) return 'Last 3 months';
  return 'Older';
}

function capAndMergeOverflow(buckets: Array<[string, number]>, limit = 50): Bucket[] {
  if (buckets.length <= limit) {
    return buckets.map(([name, count]) => ({ name, count }));
  }

  const sorted = buckets.sort((a, b) => b[1] - a[1]);
  const kept = sorted.slice(0, limit);
  const dropped = sorted.slice(limit);

  const result: Bucket[] = kept.map(([name, count]) => ({ name, count }));
  if (dropped.length > 0) {
    const overflowCount = dropped.reduce((sum, [, count]) => sum + count, 0);
    result.push({
      name: `+${dropped.length} more`,
      count: overflowCount,
      overflow: true,
    });
  }

  return result;
}

export function rebuildBubbleIndex(): void {
  const facets: Facet[] = [];

  // Genre
  const genreRows = db
    .prepare(
      "SELECT genre AS name, COUNT(*) AS count FROM media_files WHERE media_type='audio' AND genre IS NOT NULL AND TRIM(genre) != '' GROUP BY genre"
    )
    .all() as Array<{ name: string; count: number }>;
  facets.push({
    key: 'genre',
    buckets: capAndMergeOverflow(genreRows.map(r => [r.name, r.count])),
  });

  // Artist
  const artistRows = db
    .prepare(
      "SELECT artist AS name, COUNT(*) AS count FROM media_files WHERE media_type='audio' AND artist IS NOT NULL AND TRIM(artist) != '' GROUP BY artist"
    )
    .all() as Array<{ name: string; count: number }>;
  facets.push({
    key: 'artist',
    buckets: capAndMergeOverflow(artistRows.map(r => [r.name, r.count])),
  });

  // Decade
  const decadeRows = db
    .prepare(
      "SELECT (year/10)*10 AS name, COUNT(*) AS count FROM media_files WHERE media_type='audio' AND year IS NOT NULL GROUP BY name"
    )
    .all() as Array<{ name: number | null; count: number }>;
  const decadeBuckets = capAndMergeOverflow(
    decadeRows.map(r => [r.name !== null ? `${r.name}s` : 'Unknown', r.count])
  );
  facets.push({
    key: 'decade',
    buckets: decadeBuckets,
  });

  // Format (derived from codec, sample_rate, bits_per_sample)
  const formatRows = db
    .prepare(
      'SELECT id, codec, sample_rate, bits_per_sample FROM media_files WHERE media_type=\'audio\''
    )
    .all() as Array<{ id: number; codec: string | null; sample_rate: number | null; bits_per_sample: number | null }>;

  const formatBuckets = new Map<string, number>();
  for (const row of formatRows) {
    const bucket = getFormatBucket(row.codec, row.sample_rate, row.bits_per_sample);
    formatBuckets.set(bucket, (formatBuckets.get(bucket) ?? 0) + 1);
  }
  facets.push({
    key: 'format',
    buckets: capAndMergeOverflow(Array.from(formatBuckets.entries())),
  });

  // Recent (derived from created_at)
  const recentRows = db
    .prepare('SELECT created_at FROM media_files WHERE media_type=\'audio\'')
    .all() as Array<{ created_at: number }>;

  const recentBuckets = new Map<string, number>();
  for (const row of recentRows) {
    const bucket = getRecentBucket(row.created_at);
    recentBuckets.set(bucket, (recentBuckets.get(bucket) ?? 0) + 1);
  }

  const recentOrder = ['Today', 'This week', 'This month', 'Last 3 months', 'Older'];
  const recentBucketList = recentOrder
    .filter(name => recentBuckets.has(name))
    .map(name => [name, recentBuckets.get(name)!] as [string, number]);

  facets.push({
    key: 'recent',
    buckets: capAndMergeOverflow(recentBucketList),
  });

  // Get total audio track count
  const countResult = db.prepare("SELECT COUNT(*) as count FROM media_files WHERE media_type='audio'").get() as {
    count: number;
  };

  const payload: BubbleSnapshot = { facets };
  const builtAt = Math.floor(Date.now() / 1000);

  db.prepare(
    'INSERT OR REPLACE INTO bubble_snapshot (id, payload, track_count, built_at) VALUES (1, ?, ?, ?)'
  ).run(JSON.stringify(payload), countResult.count, builtAt);
}

export function drillBuckets(
  facet: string,
  path: string[]
): { buckets?: Array<{ name: string; count: number }>; atLeaf: boolean; leafTracks?: any[] } {
  const levels = (FACET_LEVELS as any)[facet];
  if (!levels) {
    throw new Error(`Unknown facet: ${facet}`);
  }

  const depth = path.length;

  // At leaf level
  if (depth >= levels.length) {
    const filters = buildFilters(facet, path);
    let query = 'SELECT * FROM media_files WHERE media_type=\'audio\'';
    const params: any[] = [];

    for (const filter of filters) {
      query += ` AND ${filter.sql}`;
      params.push(...filter.params);
    }

    query += ' LIMIT 200';

    const tracks = db.prepare(query).all(...params);
    return { atLeaf: true, leafTracks: tracks };
  }

  // Drill down to next level
  const currentLevel = levels[depth];
  const filters = buildFilters(facet, path);

  let query = 'SELECT * FROM media_files WHERE media_type=\'audio\'';
  const params: any[] = [];

  for (const filter of filters) {
    query += ` AND ${filter.sql}`;
    params.push(...filter.params);
  }

  const allTracks = db.prepare(query).all(...params) as any[];

  const buckets = new Map<string, number>();
  for (const track of allTracks) {
    let bucketName: string;
    if (currentLevel.derived) {
      if (currentLevel.field === 'format') {
        bucketName = getFormatBucket(track.codec, track.sample_rate, track.bits_per_sample);
      } else if (currentLevel.field === 'decade') {
        bucketName = track.year !== null ? `${Math.floor(track.year / 10) * 10}s` : 'Unknown';
      } else if (currentLevel.field === 'recent') {
        bucketName = getRecentBucket(track.created_at);
      } else {
        bucketName = currentLevel.fallback;
      }
    } else {
      bucketName = (track[currentLevel.field] || currentLevel.fallback).trim() || currentLevel.fallback;
    }

    buckets.set(bucketName, (buckets.get(bucketName) ?? 0) + 1);
  }

  const bucketArray = capAndMergeOverflow(Array.from(buckets.entries()));
  return { atLeaf: false, buckets: bucketArray };
}

function buildFilters(
  facet: string,
  path: string[]
): Array<{ sql: string; params: any[] }> {
  const levels = (FACET_LEVELS as any)[facet];
  const filters: Array<{ sql: string; params: any[] }> = [];

  for (let i = 0; i < path.length; i++) {
    const level = levels[i];
    const value = path[i];

    if (level.derived) {
      if (level.field === 'format') {
        // Format filter: expand to codec + sample_rate/bits_per_sample conditions
        if (value === 'DSD') {
          filters.push({ sql: "codec LIKE '%DSD%'", params: [] });
        } else if (value === 'Hi-Res') {
          filters.push({
            sql: "codec = 'FLAC' AND (sample_rate > 48000 OR bits_per_sample > 16)",
            params: [],
          });
        } else if (value === 'Lossless') {
          filters.push({
            sql: "codec IN ('FLAC', 'ALAC', 'WAV')",
            params: [],
          });
        } else if (value === 'Lossy') {
          filters.push({
            sql: "codec NOT IN ('FLAC', 'ALAC', 'WAV') AND codec NOT LIKE '%DSD%'",
            params: [],
          });
        }
      } else if (level.field === 'decade') {
        // decade='1990s' -> year >= 1990 AND year < 2000
        const match = value.match(/(\d{3})\d/);
        if (match) {
          const decadeStart = parseInt(match[1] + '0');
          const decadeEnd = decadeStart + 10;
          filters.push({
            sql: `year >= ? AND year < ?`,
            params: [decadeStart, decadeEnd],
          });
        }
      } else if (level.field === 'recent') {
        // recent='Today' -> created_at >= (now - 1 day)
        const now = Math.floor(Date.now() / 1000);
        const DAY = 86400;
        const WEEK = 7 * DAY;
        const MONTH = 30 * DAY;
        const QUARTER = 90 * DAY;

        if (value === 'Today') {
          filters.push({ sql: 'created_at >= ?', params: [now - DAY] });
        } else if (value === 'This week') {
          filters.push({
            sql: 'created_at >= ? AND created_at < ?',
            params: [now - WEEK, now - DAY],
          });
        } else if (value === 'This month') {
          filters.push({
            sql: 'created_at >= ? AND created_at < ?',
            params: [now - MONTH, now - WEEK],
          });
        } else if (value === 'Last 3 months') {
          filters.push({
            sql: 'created_at >= ? AND created_at < ?',
            params: [now - QUARTER, now - MONTH],
          });
        } else if (value === 'Older') {
          filters.push({
            sql: 'created_at < ?',
            params: [now - QUARTER],
          });
        }
      }
    } else {
      // Normal field filter
      filters.push({
        sql: `${level.field} = ?`,
        params: [value],
      });
    }
  }

  return filters;
}

// Build artist-album-genre graph with cap rules
function buildArtistAlbumGenreGraph(): GraphPayload {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const nodeMap = new Map<string, GraphNode>();

  // Build genres (no threshold, will cap at 20 later)
  const genreRows = db
    .prepare(
      "SELECT genre AS name, COUNT(*) AS count FROM media_files WHERE media_type='audio' AND genre IS NOT NULL AND TRIM(genre) != '' GROUP BY genre ORDER BY count DESC"
    )
    .all() as Array<{ name: string; count: number }>;

  // Cap at 20 genres; remainder goes to "Other"
  const MAX_GENRES = 20;
  let otherGenreCount = 0;
  const useGenres = genreRows.slice(0, MAX_GENRES);
  if (genreRows.length > MAX_GENRES) {
    otherGenreCount = genreRows.slice(MAX_GENRES).reduce((sum, g) => sum + g.count, 0);
  }

  for (const g of useGenres) {
    const id = `g:${g.name}`;
    const node: GraphNode = { id, type: 'genre', label: g.name, value: g.count };
    nodeMap.set(id, node);
    nodes.push(node);
  }

  if (otherGenreCount > 0) {
    const id = 'g:Other';
    const node: GraphNode = { id, type: 'genre', label: 'Other', value: otherGenreCount };
    nodeMap.set(id, node);
    nodes.push(node);
  }

  // Build artists (with >= 2 track threshold)
  const artistRows = db
    .prepare(
      "SELECT artist AS name, COUNT(*) AS count FROM media_files WHERE media_type='audio' AND artist IS NOT NULL AND TRIM(artist) != '' GROUP BY artist HAVING count >= 2 ORDER BY count DESC"
    )
    .all() as Array<{ name: string; count: number }>;

  const artistMap = new Map<string, number>();
  for (const a of artistRows) {
    artistMap.set(a.name, a.count);
    const id = `a:${a.name}`;
    const node: GraphNode = { id, type: 'artist', label: a.name, value: a.count };
    nodeMap.set(id, node);
    nodes.push(node);
  }

  // Build albums (with >= 2 track threshold per artist)
  const albumRows = db
    .prepare(
      `SELECT album AS name, COALESCE(album_artist, artist) AS artist, COUNT(*) AS count
       FROM media_files
       WHERE media_type='audio' AND album IS NOT NULL AND TRIM(album) != ''
       GROUP BY album, COALESCE(album_artist, artist)
       HAVING count >= 2
       ORDER BY count DESC`
    )
    .all() as Array<{ name: string; artist: string; count: number }>;

  for (const al of albumRows) {
    const id = `al:${al.name}|${al.artist}`;
    const node: GraphNode = { id, type: 'album', label: al.name, value: al.count, artist: al.artist };
    nodeMap.set(id, node);
    nodes.push(node);
  }

  // Cap total nodes at 800 by raising artist threshold
  let MAX_NODES = 800;
  while (nodes.length > MAX_NODES && artistRows.length > 0) {
    // Raise the artist threshold and rebuild
    const minArtistCount = Math.min(...artistRows.map(a => a.count)) + 1;
    const filteredArtists = artistRows.filter(a => a.count >= minArtistCount);

    if (filteredArtists.length === 0) break;

    // Rebuild nodes
    nodes.length = 0;
    nodeMap.clear();

    // Re-add genres
    for (const g of useGenres) {
      const id = `g:${g.name}`;
      const node: GraphNode = { id, type: 'genre', label: g.name, value: g.count };
      nodeMap.set(id, node);
      nodes.push(node);
    }
    if (otherGenreCount > 0) {
      const id = 'g:Other';
      const node: GraphNode = { id, type: 'genre', label: 'Other', value: otherGenreCount };
      nodeMap.set(id, node);
      nodes.push(node);
    }

    // Re-add filtered artists
    for (const a of filteredArtists) {
      const id = `a:${a.name}`;
      const node: GraphNode = { id, type: 'artist', label: a.name, value: a.count };
      nodeMap.set(id, node);
      nodes.push(node);
    }

    // Re-add filtered albums
    for (const al of albumRows) {
      if (filteredArtists.some(a => a.name === al.artist)) {
        const id = `al:${al.name}|${al.artist}`;
        const node: GraphNode = { id, type: 'album', label: al.name, value: al.count, artist: al.artist };
        nodeMap.set(id, node);
        nodes.push(node);
      }
    }
  }

  // Build edges: album -> artist
  for (const al of albumRows) {
    const albumId = `al:${al.name}|${al.artist}`;
    const artistId = `a:${al.artist}`;
    if (nodeMap.has(albumId) && nodeMap.has(artistId)) {
      links.push({ source: albumId, target: artistId });
    }
  }

  // Build edges: artist -> genre
  const artistGenreMap = new Map<string, Set<string>>();
  const allTracks = db
    .prepare(
      "SELECT artist, COALESCE(album_artist, artist) AS genre_artist, genre FROM media_files WHERE media_type='audio' AND artist IS NOT NULL AND genre IS NOT NULL"
    )
    .all() as Array<{ artist: string; genre_artist: string; genre: string }>;

  for (const track of allTracks) {
    const artist = track.artist;
    if (!artistGenreMap.has(artist)) {
      artistGenreMap.set(artist, new Set());
    }
    let genre = track.genre;
    // Map to "Other" if genre was collapsed
    if (!useGenres.some(g => g.name === genre) && genre !== 'Other') {
      genre = otherGenreCount > 0 ? 'Other' : genre;
    }
    artistGenreMap.get(artist)!.add(genre);
  }

  for (const [artist, genres] of artistGenreMap.entries()) {
    const artistId = `a:${artist}`;
    if (!nodeMap.has(artistId)) continue;

    for (const genre of genres) {
      const genreId = `g:${genre}`;
      if (nodeMap.has(genreId)) {
        links.push({ source: artistId, target: genreId });
      }
    }
  }

  return { nodes, links };
}

export function rebuildBubbleGraphSnapshot(): void {
  const payload = buildArtistAlbumGenreGraph();
  const builtAt = Math.floor(Date.now() / 1000);

  db.prepare(
    'INSERT OR REPLACE INTO bubble_graph_snapshot (id, payload, node_count, edge_count, built_at) VALUES (1, ?, ?, ?, ?)'
  ).run(JSON.stringify(payload), payload.nodes.length, payload.links.length, builtAt);
}
