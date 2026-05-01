import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { config } from './config';

const dbDir = path.dirname(config.dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');

// Initialize schema
export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS media_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT UNIQUE NOT NULL,
      file_name TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      media_type TEXT NOT NULL CHECK(media_type IN ('audio', 'video', 'image')),
      
      -- Metadata
      title TEXT,
      artist TEXT,
      album TEXT,
      album_artist TEXT,
      genre TEXT,
      year INTEGER,
      track_number INTEGER,
      disc_number INTEGER,
      duration REAL,
      
      -- Technical info
      codec TEXT,
      bit_rate INTEGER,
      sample_rate INTEGER,
      bits_per_sample INTEGER,
      channels INTEGER,
      
      -- Lyrics
      lyrics TEXT,

      -- Video specific
      width INTEGER,
      height INTEGER,
      frame_rate REAL,
      
      -- Timestamps
      file_modified_at INTEGER NOT NULL,
      scanned_at INTEGER NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      
      -- Index for fast queries
      UNIQUE(file_path)
    );
    
    CREATE INDEX IF NOT EXISTS idx_media_type ON media_files(media_type);
    CREATE INDEX IF NOT EXISTS idx_artist ON media_files(artist);
    CREATE INDEX IF NOT EXISTS idx_album ON media_files(album);
    CREATE INDEX IF NOT EXISTS idx_genre ON media_files(genre);
    CREATE INDEX IF NOT EXISTS idx_file_name ON media_files(file_name);
    
    -- Full-Text Search index for fast searching
    CREATE VIRTUAL TABLE IF NOT EXISTS media_search USING fts5(
      title,
      artist,
      album,
      album_artist,
      genre,
      file_name
    );
    
    -- Triggers to keep FTS index in sync
    CREATE TRIGGER IF NOT EXISTS media_files_ai AFTER INSERT ON media_files BEGIN
      INSERT INTO media_search(rowid, title, artist, album, album_artist, genre, file_name)
      VALUES (new.id, new.title, new.artist, new.album, new.album_artist, new.genre, new.file_name);
    END;
    
    CREATE TRIGGER IF NOT EXISTS media_files_ad AFTER DELETE ON media_files BEGIN
      DELETE FROM media_search WHERE rowid = old.id;
    END;
    
    CREATE TRIGGER IF NOT EXISTS media_files_au AFTER UPDATE ON media_files BEGIN
      DELETE FROM media_search WHERE rowid = old.id;
      INSERT INTO media_search(rowid, title, artist, album, album_artist, genre, file_name)
      VALUES (new.id, new.title, new.artist, new.album, new.album_artist, new.genre, new.file_name);
    END;
    
    -- Playlists table
    CREATE TABLE IF NOT EXISTS playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
    
    CREATE TABLE IF NOT EXISTS playlist_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      playlist_id INTEGER NOT NULL,
      media_id INTEGER NOT NULL,
      position INTEGER NOT NULL,
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
      FOREIGN KEY (media_id) REFERENCES media_files(id) ON DELETE CASCADE
    );
    
    -- Scan history
    CREATE TABLE IF NOT EXISTS scan_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at INTEGER NOT NULL,
      completed_at INTEGER,
      files_scanned INTEGER DEFAULT 0,
      files_added INTEGER DEFAULT 0,
      files_updated INTEGER DEFAULT 0,
      files_removed INTEGER DEFAULT 0,
      status TEXT DEFAULT 'running' CHECK(status IN ('running', 'completed', 'failed')),
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS bubble_snapshot (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      payload TEXT NOT NULL,
      track_count INTEGER NOT NULL,
      built_at INTEGER NOT NULL
    );
  `);
  
  // Rebuild FTS index for existing data
  rebuildSearchIndex();
  
  console.log('✅ Database initialized');
}

// Rebuild full-text search index
export function rebuildSearchIndex() {
  const count = db.prepare('SELECT COUNT(*) as count FROM media_files').get() as { count: number };
  
  if (count.count > 0) {
    // Check if FTS table has data
    const ftsCount = db.prepare('SELECT COUNT(*) as count FROM media_search').get() as { count: number };
    
    if (ftsCount.count === 0) {
      console.log('🔍 Building search index...');
      db.prepare(`
        INSERT INTO media_search(rowid, title, artist, album, album_artist, genre, file_name)
        SELECT id, title, artist, album, album_artist, genre, file_name FROM media_files
      `).run();
      console.log(`✅ Search index built for ${count.count} files`);
    }
  }
}

export interface MediaFile {
  id?: number;
  file_path: string;
  file_name: string;
  file_size: number;
  media_type: 'audio' | 'video' | 'image';
  title?: string;
  artist?: string;
  album?: string;
  album_artist?: string;
  genre?: string;
  year?: number;
  track_number?: number;
  disc_number?: number;
  duration?: number;
  codec?: string;
  bit_rate?: number;
  sample_rate?: number;
  bits_per_sample?: number;
  channels?: number;
  lyrics?: string;
  width?: number;
  height?: number;
  frame_rate?: number;
  file_modified_at: number;
  scanned_at: number;
}

export interface ScanHistory {
  id?: number;
  started_at: number;
  completed_at?: number;
  files_scanned: number;
  files_added: number;
  files_updated: number;
  files_removed: number;
  status: 'running' | 'completed' | 'failed';
  error?: string;
}
