import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure ffmpeg paths
ffmpeg.setFfmpegPath('/opt/homebrew/bin/ffmpeg');
ffmpeg.setFfprobePath('/opt/homebrew/bin/ffprobe');

// Thumbnail cache directory
const THUMB_DIR = path.join(__dirname, '../data/thumbnails');

// Ensure thumbnail directory exists
if (!fs.existsSync(THUMB_DIR)) {
  fs.mkdirSync(THUMB_DIR, { recursive: true });
}

/**
 * Generate a thumbnail for a video file
 */
export async function generateVideoThumbnail(
  filePath: string,
  width: number = 320
): Promise<string> {
  // Generate unique filename based on source file path and size
  const hash = crypto.createHash('md5').update(filePath + width).digest('hex');
  const thumbPath = path.join(THUMB_DIR, `${hash}.jpg`);

  // Return cached thumbnail if it exists
  if (fs.existsSync(thumbPath)) {
    return thumbPath;
  }

  return new Promise((resolve, reject) => {
    ffmpeg(filePath)
      .screenshots({
        timestamps: ['10%'], // Take screenshot at 10% into the video
        filename: `${hash}.jpg`,
        folder: THUMB_DIR,
        size: `${width}x?`, // Maintain aspect ratio
      })
      .on('end', () => {
        resolve(thumbPath);
      })
      .on('error', (err) => {
        console.error('Error generating thumbnail:', err.message);
        reject(err);
      });
  });
}

/**
 * Extract album art from audio file
 */
export async function extractAlbumArt(filePath: string): Promise<string | null> {
  const hash = crypto.createHash('md5').update(filePath).digest('hex');
  const artPath = path.join(THUMB_DIR, `${hash}.jpg`);

  // Return cached art if it exists
  if (fs.existsSync(artPath)) {
    return artPath;
  }

  return new Promise((resolve) => {
    ffmpeg(filePath)
      .outputOptions(['-an', '-vcodec', 'copy'])
      .output(artPath)
      .on('end', () => {
        resolve(artPath);
      })
      .on('error', (err) => {
        console.error('Error extracting album art:', err.message);
        resolve(null); // No album art available
      })
      .run();
  });
}

/**
 * Generate fallback thumbnail with gradient and text
 */
export async function generateFallbackThumbnail(
  title: string,
  artist: string,
  filename: string
): Promise<string> {
  const hash = crypto.createHash('md5').update(filename + 'fallback').digest('hex');
  const thumbPath = path.join(THUMB_DIR, `${hash}.svg`);

  // Return cached thumbnail if exists
  if (fs.existsSync(thumbPath)) {
    return thumbPath;
  }

  // Generate random gradient colors based on filename
  const colors = generateColorsFromString(filename);
  
  // Create SVG with gradient and text
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="400" height="400" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${colors[0]};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${colors[1]};stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="400" height="400" fill="url(#grad)" />
  <text x="200" y="180" font-family="Arial, sans-serif" font-size="32" font-weight="bold" fill="white" text-anchor="middle" style="text-shadow: 0 2px 8px rgba(0,0,0,0.3);">
    ${escapeXml(truncateText(title, 20))}
  </text>
  <text x="200" y="220" font-family="Arial, sans-serif" font-size="20" fill="rgba(255,255,255,0.9)" text-anchor="middle" style="text-shadow: 0 2px 8px rgba(0,0,0,0.3);">
    ${escapeXml(truncateText(artist, 25))}
  </text>
  <circle cx="200" cy="280" r="40" fill="rgba(255,255,255,0.2)" />
  <path d="M 190 270 L 190 290 L 210 280 Z" fill="white" />
</svg>`;

  fs.writeFileSync(thumbPath, svg);
  return thumbPath;
}

/**
 * Generate gradient colors from string
 */
function generateColorsFromString(str: string): [string, string] {
  const hash = crypto.createHash('md5').update(str).digest('hex');
  const hue1 = parseInt(hash.substring(0, 2), 16);
  const hue2 = (hue1 + 60) % 360;
  
  return [
    `hsl(${hue1}, 70%, 50%)`,
    `hsl(${hue2}, 70%, 35%)`
  ];
}

/**
 * Truncate text with ellipsis
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Escape XML special characters
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Fetch album art from online sources
 */
async function fetchAlbumArtOnline(
  title: string,
  artist: string,
  album?: string
): Promise<string | null> {
  const hash = crypto.createHash('md5').update(`${artist}-${title}-${album || 'unknown'}-online`).digest('hex');
  const artPath = path.join(THUMB_DIR, `${hash}.jpg`);

  // Return cached if exists
  if (fs.existsSync(artPath)) {
    return artPath;
  }

  try {
    // Try iTunes API first (reliable, good coverage)
    const searchQuery = `${artist} ${album || title}`;
    const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(searchQuery)}&entity=song&limit=1`;
    
    console.log(`🎨 Searching album art online: "${artist}" - "${title}"`);
    
    const response = await fetch(itunesUrl);
    if (response.ok) {
      const data = await response.json();
      
      if (data.results && data.results.length > 0) {
        const artworkUrl = data.results[0].artworkUrl100?.replace('100x100', '600x600') || data.results[0].artworkUrl100;
        
        if (artworkUrl) {
          // Download the artwork
          const artResponse = await fetch(artworkUrl);
          if (artResponse.ok) {
            const buffer = await artResponse.arrayBuffer();
            fs.writeFileSync(artPath, Buffer.from(buffer));
            console.log(`✅ Album art downloaded and cached`);
            return artPath;
          }
        }
      }
    }

    // Try MusicBrainz as fallback
    const mbUrl = `https://musicbrainz.org/ws/2/recording/?query=artist:${encodeURIComponent(artist)}%20AND%20recording:${encodeURIComponent(title)}&fmt=json&limit=1`;
    const mbResponse = await fetch(mbUrl, {
      headers: {
        'User-Agent': 'Medis-Server/1.0 (https://github.com/medis-server)'
      }
    });

    if (mbResponse.ok) {
      const mbData = await mbResponse.json();
      if (mbData.recordings && mbData.recordings.length > 0) {
        const releaseId = mbData.recordings[0].releases?.[0]?.id;
        
        if (releaseId) {
          // Try to get cover art from Cover Art Archive
          const coverUrl = `https://coverartarchive.org/release/${releaseId}/front-500`;
          const coverResponse = await fetch(coverUrl);
          
          if (coverResponse.ok) {
            const buffer = await coverResponse.arrayBuffer();
            fs.writeFileSync(artPath, Buffer.from(buffer));
            console.log(`✅ Album art downloaded from MusicBrainz`);
            return artPath;
          }
        }
      }
    }

    return null;
  } catch (error) {
    console.error('Error fetching album art online:', error);
    return null;
  }
}

/**
 * Get thumbnail path (cached or generate new)
 */
export async function getThumbnail(
  filePath: string,
  mediaType: 'audio' | 'video',
  width: number = 320,
  title?: string,
  artist?: string,
  filename?: string
): Promise<string | null> {
  try {
    if (mediaType === 'video') {
      return await generateVideoThumbnail(filePath, width);
    } else if (mediaType === 'audio') {
      // Step 1: Try embedded album art
      const albumArt = await extractAlbumArt(filePath);
      if (albumArt) {
        return albumArt;
      }
      
      // Step 2: Try fetching from online sources
      if (title && artist) {
        const onlineArt = await fetchAlbumArtOnline(title, artist);
        if (onlineArt) {
          return onlineArt;
        }
      }
      
      // Step 3: Generate gradient fallback
      if (title && artist && filename) {
        return await generateFallbackThumbnail(title, artist, filename);
      }
      
      return null;
    }
    return null;
  } catch (error) {
    console.error('Error getting thumbnail:', error);
    
    // Generate fallback even on error if we have the info
    if (mediaType === 'audio' && title && artist && filename) {
      try {
        return await generateFallbackThumbnail(title, artist, filename);
      } catch (fallbackError) {
        console.error('Error generating fallback thumbnail:', fallbackError);
      }
    }
    
    return null;
  }
}

/**
 * Clear thumbnail cache
 */
export function clearThumbnailCache(): void {
  if (fs.existsSync(THUMB_DIR)) {
    const files = fs.readdirSync(THUMB_DIR);
    files.forEach((file) => {
      fs.unlinkSync(path.join(THUMB_DIR, file));
    });
    console.log('✅ Thumbnail cache cleared');
  }
}
