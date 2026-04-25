import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const config = {
  mediaPath: process.env.MEDIA_PATH || path.join(os.homedir(), 'Downloads'),
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  scanCron: process.env.SCAN_CRON || '0 3 * * *', // 3 AM daily
  dbPath: process.env.DB_PATH || path.join(__dirname, '../data/media.db'),
  maxBitrate: parseInt(process.env.MAX_BITRATE || '9600', 10), // kbps
  enableTranscoding: process.env.ENABLE_TRANSCODING !== 'false',
  cacheDir: process.env.CACHE_DIR || path.join(__dirname, '../cache'),
  
  // Supported formats
  audioFormats: ['.flac', '.dsf', '.dff', '.wav', '.ape', '.mp3', '.m4a', '.aac', '.ogg', '.opus', '.wma', '.alac', '.webm'],
  videoFormats: ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.wmv'],
  imageFormats: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif'],
};
