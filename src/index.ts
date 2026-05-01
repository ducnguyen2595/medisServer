import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import { networkInterfaces } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase, db } from './database.js';
import { config } from './config.js';
import { MediaScanner } from './scanner.js';
import { rebuildBubbleIndex } from './bubbleIndex.js';
import routes from './api/routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files (HTML players)
app.use('/static', express.static(path.join(__dirname, '..')));

// Routes
app.use('/api', routes);

// Root and mobile endpoints - serve mobile player for all devices
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../mobile-player-v2.html'));
});

app.get('/mobile', (req, res) => {
  res.sendFile(path.join(__dirname, '../mobile-player-v2.html'));
});

// Deprecated routes (redirect to new mobile player)
app.get('/player', (req, res) => {
  res.redirect('/mobile');
});

app.get('/mobile-v1', (req, res) => {
  res.redirect('/mobile');
});

// API info endpoint
app.get('/info', (req, res) => {
  res.json({
    name: 'Medis Server',
    version: '1.0.0',
    description: 'Audiophile-grade media streaming server',
    endpoints: {
      player: '/ or /mobile - Responsive web player',
      health: '/api/health',
      media: '/api/media',
      search: '/api/search',
      stream: '/api/stream/:id',
      thumbnail: '/api/thumbnail/:id',
      artists: '/api/artists',
      albums: '/api/albums',
      genres: '/api/genres',
      stats: '/api/stats',
      scan: '/api/scan (POST)',
    },
  });
});

// Initialize database
initDatabase();

// Check if bubble snapshot exists; if not, build it
const snap = db.prepare('SELECT id FROM bubble_snapshot WHERE id = 1').get();
if (!snap) {
  console.log('🫧 No bubble snapshot found — building...');
  rebuildBubbleIndex();
}

// Schedule daily scan
console.log(`⏰ Scheduled daily scan: ${config.scanCron}`);
cron.schedule(config.scanCron, async () => {
  console.log('🔄 Starting scheduled media scan...');
  const scanner = new MediaScanner();
  try {
    const stats = await scanner.scanAll();
    console.log('✅ Scheduled scan completed:', stats);
  } catch (error) {
    console.error('❌ Scheduled scan failed:', error);
  }
});

// Get local IP addresses
function getLocalIPs(): string[] {
  const nets = networkInterfaces();
  const ips: string[] = [];

  for (const name of Object.keys(nets)) {
    const interfaces = nets[name];
    if (!interfaces) continue;

    for (const net of interfaces) {
      // Skip internal (loopback) and non-IPv4 addresses
      if (net.family === 'IPv4' && !net.internal) {
        ips.push(net.address);
      }
    }
  }

  return ips;
}

// Start server
app.listen(config.port, config.host, () => {
  console.log('\n🎵 ═══════════════════════════════════════════════════════');
  console.log('   Medis Server - Audiophile Media Streaming');
  console.log('   ═══════════════════════════════════════════════════════');
  console.log(`\n   📁 Media Paths:`);
  config.mediaPaths.forEach(p => console.log(`      - ${p}`));
  console.log(`   🗄️  Database: ${config.dbPath}`);
  console.log(`\n   🌐 Server running on:`);
  console.log(`      - Local:   http://localhost:${config.port}`);
  
  const localIPs = getLocalIPs();
  localIPs.forEach(ip => {
    console.log(`      - Network: http://${ip}:${config.port}`);
  });

  console.log(`\n   📱 Access from your phone using any of the network URLs above`);
  console.log(`\n   🎧 Audiophile Features:`);
  console.log(`      - Bit-perfect streaming for FLAC, DSF, WAV`);
  console.log(`      - DSD support (DSF/DFF)`);
  console.log(`      - On-demand transcoding`);
  console.log(`      - High bitrate streaming (up to ${config.maxBitrate}kbps)`);
  console.log(`\n   📊 API Documentation: http://localhost:${config.port}/`);
  console.log('   ═══════════════════════════════════════════════════════\n');
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down Medis Server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Shutting down Medis Server...');
  process.exit(0);
});
