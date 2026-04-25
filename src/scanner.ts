import fs from 'fs';
import path from 'path';
import { parseFile } from 'music-metadata';
import { db, MediaFile, ScanHistory, initDatabase } from './database.js';
import { config } from './config.js';

interface ScanStats {
  scanned: number;
  added: number;
  updated: number;
  removed: number;
}

export class MediaScanner {
  private stats: ScanStats = {
    scanned: 0,
    added: 0,
    updated: 0,
    removed: 0,
  };

  async scanAll(): Promise<ScanStats> {
    console.log(`🔍 Starting media scan: ${config.mediaPath}`);
    
    const scanId = this.createScanHistory();
    this.stats = { scanned: 0, added: 0, updated: 0, removed: 0 };

    try {
      // Scan all media files
      await this.scanDirectory(config.mediaPath);
      
      // Remove deleted files from database
      this.stats.removed = this.cleanupDeletedFiles();
      
      this.completeScanHistory(scanId, 'completed');
      console.log(`✅ Scan complete:`, this.stats);
      
      return this.stats;
    } catch (error) {
      this.completeScanHistory(scanId, 'failed', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  private async scanDirectory(dirPath: string): Promise<void> {
    let entries: fs.Dirent[];
    
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch (error) {
      console.warn(`⚠️  Cannot read directory: ${dirPath}`);
      return;
    }

    for (const entry of entries) {
      // Skip hidden files and directories
      if (entry.name.startsWith('.')) continue;
      
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        await this.scanDirectory(fullPath);
      } else if (entry.isFile()) {
        await this.processFile(fullPath);
      }
    }
  }

  private async processFile(filePath: string): Promise<void> {
    const ext = path.extname(filePath).toLowerCase();
    
    // Determine media type
    let mediaType: 'audio' | 'video' | 'image' | null = null;
    if (config.audioFormats.includes(ext)) {
      mediaType = 'audio';
    } else if (config.videoFormats.includes(ext)) {
      mediaType = 'video';
    } else if (config.imageFormats.includes(ext)) {
      mediaType = 'image';
    }

    if (!mediaType) return;

    this.stats.scanned++;

    try {
      const stats = fs.statSync(filePath);
      const existingFile = this.getExistingFile(filePath);

      // Check if file needs update
      if (existingFile && existingFile.file_modified_at === Math.floor(stats.mtimeMs)) {
        // File unchanged, skip
        return;
      }

      // Extract metadata
      const mediaFile: MediaFile = await this.extractMetadata(filePath, mediaType, stats);

      if (existingFile) {
        this.updateFile(existingFile.id!, mediaFile);
        this.stats.updated++;
      } else {
        this.insertFile(mediaFile);
        this.stats.added++;
      }

      if (this.stats.scanned % 100 === 0) {
        console.log(`📊 Progress: ${this.stats.scanned} files scanned...`);
      }
    } catch (error) {
      console.error(`❌ Error processing ${filePath}:`, error instanceof Error ? error.message : error);
    }
  }

  private getCodecFromExtension(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const codecMap: Record<string, string> = {
      '.dsf': 'DSF',
      '.dff': 'DFF',
      '.flac': 'FLAC',
      '.wav': 'WAV',
      '.mp3': 'MP3',
      '.m4a': 'AAC',
      '.aac': 'AAC',
      '.ogg': 'Vorbis',
      '.opus': 'Opus',
      '.ape': 'APE',
      '.wma': 'WMA',
      '.alac': 'ALAC',
      '.mp4': 'H.264',
      '.mkv': 'Matroska',
      '.avi': 'AVI',
      '.mov': 'QuickTime',
      '.webm': 'VP9',
    };
    return codecMap[ext] || ext.substring(1).toUpperCase();
  }

  private async extractMetadata(
    filePath: string,
    mediaType: 'audio' | 'video' | 'image',
    stats: fs.Stats
  ): Promise<MediaFile> {
    const mediaFile: MediaFile = {
      file_path: filePath,
      file_name: path.basename(filePath),
      file_size: stats.size,
      media_type: mediaType,
      file_modified_at: Math.floor(stats.mtimeMs),
      scanned_at: Math.floor(Date.now()),
    };

    if (mediaType === 'audio' || mediaType === 'video') {
      try {
        const metadata = await parseFile(filePath, { skipCovers: true });

        // Common metadata
        mediaFile.title = metadata.common.title;
        mediaFile.artist = metadata.common.artist;
        mediaFile.album = metadata.common.album;
        mediaFile.album_artist = metadata.common.albumartist;
        mediaFile.genre = metadata.common.genre?.[0];
        mediaFile.year = metadata.common.year;
        mediaFile.track_number = metadata.common.track.no || undefined;
        mediaFile.disc_number = metadata.common.disk.no || undefined;
        mediaFile.duration = metadata.format.duration;
        
        // Extract lyrics if available
        mediaFile.lyrics = metadata.common.lyrics?.[0];


        // Audio technical info
        mediaFile.codec = metadata.format.codec || this.getCodecFromExtension(filePath);
        mediaFile.bit_rate = metadata.format.bitrate;
        mediaFile.sample_rate = metadata.format.sampleRate;
        mediaFile.bits_per_sample = metadata.format.bitsPerSample;
        mediaFile.channels = metadata.format.numberOfChannels;

        // Video info (if available)
        if (mediaType === 'video') {
          // music-metadata doesn't extract video dimensions well
          // You'd need ffprobe for proper video metadata
          // For now, leave as undefined
        }
      } catch (error) {
        console.warn(`⚠️  Could not extract metadata from ${filePath}: ${error instanceof Error ? error.message : error}`);
      }
    }

    return mediaFile;
  }

  private getExistingFile(filePath: string): { id: number; file_modified_at: number } | undefined {
    const stmt = db.prepare('SELECT id, file_modified_at FROM media_files WHERE file_path = ?');
    return stmt.get(filePath) as { id: number; file_modified_at: number } | undefined;
  }

  private insertFile(mediaFile: MediaFile): void {
    const stmt = db.prepare(`
      INSERT INTO media_files (
        file_path, file_name, file_size, media_type,
        title, artist, album, album_artist, genre, year, track_number, disc_number, duration, lyrics,
        codec, bit_rate, sample_rate, bits_per_sample, channels,
        width, height, frame_rate,
        file_modified_at, scanned_at
      ) VALUES (
        @file_path, @file_name, @file_size, @media_type,
        @title, @artist, @album, @album_artist, @genre, @year, @track_number, @disc_number, @duration, @lyrics,
        @codec, @bit_rate, @sample_rate, @bits_per_sample, @channels,
        @width, @height, @frame_rate,
        @file_modified_at, @scanned_at
      )
    `);
    
    // Convert undefined to null for better-sqlite3
    const params = {
      ...mediaFile,
      title: mediaFile.title ?? null,
      artist: mediaFile.artist ?? null,
      album: mediaFile.album ?? null,
      album_artist: mediaFile.album_artist ?? null,
      genre: mediaFile.genre ?? null,
      year: mediaFile.year ?? null,
      track_number: mediaFile.track_number ?? null,
      disc_number: mediaFile.disc_number ?? null,
      duration: mediaFile.duration ?? null,
      codec: mediaFile.codec ?? null,
      bit_rate: mediaFile.bit_rate ?? null,
      sample_rate: mediaFile.sample_rate ?? null,
      bits_per_sample: mediaFile.bits_per_sample ?? null,
      channels: mediaFile.channels ?? null,
      width: mediaFile.width ?? null,
      height: mediaFile.height ?? null,
      frame_rate: mediaFile.frame_rate ?? null,
    };
    
    stmt.run(params);
  }

  private updateFile(id: number, mediaFile: MediaFile): void {
    const stmt = db.prepare(`
      UPDATE media_files SET
        file_name = @file_name,
        file_size = @file_size,
        title = @title,
        artist = @artist,
        album = @album,
        album_artist = @album_artist,
        genre = @genre,
        year = @year,
        track_number = @track_number,
        disc_number = @disc_number,
        duration = @duration,
        lyrics = @lyrics,
        codec = @codec,
        bit_rate = @bit_rate,
        sample_rate = @sample_rate,
        bits_per_sample = @bits_per_sample,
        channels = @channels,
        width = @width,
        height = @height,
        frame_rate = @frame_rate,
        file_modified_at = @file_modified_at,
        scanned_at = @scanned_at
      WHERE id = @id
    `);
    
    // Convert undefined to null for better-sqlite3
    const params = {
      ...mediaFile,
      title: mediaFile.title ?? null,
      artist: mediaFile.artist ?? null,
      album: mediaFile.album ?? null,
      album_artist: mediaFile.album_artist ?? null,
      genre: mediaFile.genre ?? null,
      year: mediaFile.year ?? null,
      track_number: mediaFile.track_number ?? null,
      disc_number: mediaFile.disc_number ?? null,
      duration: mediaFile.duration ?? null,
      codec: mediaFile.codec ?? null,
      bit_rate: mediaFile.bit_rate ?? null,
      sample_rate: mediaFile.sample_rate ?? null,
      bits_per_sample: mediaFile.bits_per_sample ?? null,
      channels: mediaFile.channels ?? null,
      width: mediaFile.width ?? null,
      height: mediaFile.height ?? null,
      frame_rate: mediaFile.frame_rate ?? null,
      id,
    };
    
    stmt.run(params);
  }

  private cleanupDeletedFiles(): number {
    const allFiles = db.prepare('SELECT id, file_path FROM media_files').all() as Array<{ id: number; file_path: string }>;
    let removed = 0;

    const deleteStmt = db.prepare('DELETE FROM media_files WHERE id = ?');

    for (const file of allFiles) {
      if (!fs.existsSync(file.file_path)) {
        deleteStmt.run(file.id);
        removed++;
      }
    }

    return removed;
  }

  private createScanHistory(): number {
    const stmt = db.prepare(`
      INSERT INTO scan_history (started_at) VALUES (?)
    `);
    
    const result = stmt.run(Math.floor(Date.now() / 1000));
    return result.lastInsertRowid as number;
  }

  private completeScanHistory(scanId: number, status: 'completed' | 'failed', error?: string): void {
    const stmt = db.prepare(`
      UPDATE scan_history SET
        completed_at = ?,
        files_scanned = ?,
        files_added = ?,
        files_updated = ?,
        files_removed = ?,
        status = ?,
        error = ?
      WHERE id = ?
    `);
    
    stmt.run(
      Math.floor(Date.now() / 1000),
      this.stats.scanned,
      this.stats.added,
      this.stats.updated,
      this.stats.removed,
      status,
      error || null,
      scanId
    );
  }
}

// CLI execution
import { fileURLToPath } from 'url';

const isMainModule = import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  initDatabase();
  
  const scanner = new MediaScanner();
  scanner.scanAll()
    .then(stats => {
      console.log('\n📈 Final Statistics:');
      console.log(`   Scanned: ${stats.scanned}`);
      console.log(`   Added: ${stats.added}`);
      console.log(`   Updated: ${stats.updated}`);
      console.log(`   Removed: ${stats.removed}`);
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Scan failed:', error);
      process.exit(1);
    });
}
