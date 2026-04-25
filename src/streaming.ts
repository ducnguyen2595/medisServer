import fs from 'fs';
import path from 'path';
import { Request, Response } from 'express';
import ffmpeg from 'fluent-ffmpeg';
import { config } from './config.js';

export interface StreamOptions {
  transcode?: boolean;
  bitrate?: number;
  format?: string;
}

export async function streamMedia(
  filePath: string,
  req: Request,
  res: Response,
  options: StreamOptions = {}
): Promise<void> {
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const ext = path.extname(filePath).toLowerCase();

  // Determine if we need transcoding
  const needsTranscoding = options.transcode || shouldTranscode(ext, options);

  if (needsTranscoding && config.enableTranscoding) {
    return transcodeAndStream(filePath, req, res, options);
  }

  // Direct streaming (bit-perfect for audiophile content)
  return directStream(filePath, fileSize, req, res);
}

function shouldTranscode(ext: string, options: StreamOptions): boolean {
  // DSD formats (DSF/DFF) MUST be transcoded - browsers can't play them natively
  const mustTranscode = ['.dsf', '.dff', '.ape'];
  if (mustTranscode.includes(ext)) {
    return true;
  }

  // These can be streamed directly (browser-compatible)
  const browserCompatible = ['.flac', '.wav', '.mp3', '.m4a', '.aac', '.ogg', '.opus', '.webm'];
  if (browserCompatible.includes(ext) && !options.transcode) {
    return false;
  }

  // Transcode if specific format/bitrate requested
  if (options.format || options.bitrate) {
    return true;
  }

  // Default: transcode unknown formats
  return true;
}

function directStream(
  filePath: string,
  fileSize: number,
  req: Request,
  res: Response
): void {
  const range = req.headers.range;
  const mimeType = getMimeType(filePath);

  if (range) {
    // Parse range header
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': mimeType,
      'Cache-Control': 'public, max-age=31536000',
    });

    const stream = fs.createReadStream(filePath, { start, end });
    stream.pipe(res);
    
    stream.on('error', (error) => {
      console.error('Stream error:', error);
      if (!res.headersSent) {
        res.status(500).end();
      }
    });
  } else {
    // Full file streaming
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': mimeType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=31536000',
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
    
    stream.on('error', (error) => {
      console.error('Stream error:', error);
      if (!res.headersSent) {
        res.status(500).end();
      }
    });
  }
}

async function transcodeAndStream(
  filePath: string,
  req: Request,
  res: Response,
  options: StreamOptions
): Promise<void> {
  const ext = path.extname(filePath).toLowerCase();
  
  // For DSD/audiophile formats, default to lossless FLAC
  const isDSD = ['.dsf', '.dff'].includes(ext);
  const outputFormat = options.format || (isDSD ? 'flac' : 'mp3');
  const bitrate = options.bitrate || 320;

  const mimeType = getMimeTypeForFormat(outputFormat);

  res.writeHead(200, {
    'Content-Type': mimeType,
    'Transfer-Encoding': 'chunked',
    'Cache-Control': 'no-cache',
    'Accept-Ranges': 'none',
  });

  const command = ffmpeg(filePath)
    .audioCodec(getCodecForFormat(outputFormat))
    .format(outputFormat);

  // For FLAC, use highest compression (still lossless)
  if (outputFormat === 'flac') {
    command.audioFrequency(96000); // 96kHz output for audiophile quality
    command.outputOptions([
      '-compression_level', '5', // FLAC compression (0-12, 5 is good balance)
      '-sample_fmt', 's32',       // 32-bit samples for max quality
    ]);
  } else {
    command.audioBitrate(bitrate);
  }

  command
    .on('start', (cmd) => {
      if (outputFormat === 'flac') {
        console.log(`🎵 Transcoding (lossless): ${path.basename(filePath)} -> FLAC @ 96kHz`);
      } else {
        console.log(`🎵 Transcoding: ${path.basename(filePath)} -> ${outputFormat} @ ${bitrate}kbps`);
      }
    })
    .on('error', (err) => {
      console.error('❌ Transcoding error:', err.message);
      if (!res.headersSent) {
        res.status(500).end();
      }
    })
    .on('end', () => {
      console.log(`✅ Transcoding complete: ${path.basename(filePath)}`);
    });

  // Pipe to response
  command.pipe(res, { end: true });

  // Handle client disconnect
  req.on('close', () => {
    command.kill('SIGKILL');
  });
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  
  const mimeTypes: Record<string, string> = {
    // Audio
    '.mp3': 'audio/mpeg',
    '.flac': 'audio/flac',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.ogg': 'audio/ogg',
    '.opus': 'audio/opus',
    '.ape': 'audio/x-ape',
    '.dsf': 'audio/x-dsf',
    '.dff': 'audio/x-dff',
    '.wma': 'audio/x-ms-wma',
    '.webm': 'audio/webm',
    
    // Video
    '.mp4': 'video/mp4',
    '.mkv': 'video/x-matroska',
    '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime',
    '.wmv': 'video/x-ms-wmv',
    
    // Image
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.heic': 'image/heic',
    '.heif': 'image/heif',
  };

  return mimeTypes[ext] || 'application/octet-stream';
}

function getMimeTypeForFormat(format: string): string {
  const mimeTypes: Record<string, string> = {
    'mp3': 'audio/mpeg',
    'flac': 'audio/flac',
    'wav': 'audio/wav',
    'aac': 'audio/aac',
    'ogg': 'audio/ogg',
    'opus': 'audio/opus',
    'mp4': 'video/mp4',
    'webm': 'video/webm',
  };

  return mimeTypes[format] || 'application/octet-stream';
}

function getCodecForFormat(format: string): string {
  const codecs: Record<string, string> = {
    'mp3': 'libmp3lame',
    'flac': 'flac',
    'wav': 'pcm_s32le',  // 32-bit for audiophile quality
    'aac': 'aac',
    'ogg': 'libvorbis',
    'opus': 'libopus',
  };

  return codecs[format] || 'libmp3lame';
}

export async function getMediaInfo(filePath: string): Promise<any> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        reject(err);
      } else {
        resolve(metadata);
      }
    });
  });
}
