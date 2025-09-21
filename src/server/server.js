const express = require('express');
const cors = require('cors');
const path = require('path');
const WebTorrent = require('webtorrent');
const fs = require('fs').promises;
const fsSync = require('fs');
const crypto = require('crypto');

const app = express();
const client = new WebTorrent();
// Use PORT provided by Vercel or default to 5000
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
// Serve static files from the React app build directory
app.use(express.static(path.join(__dirname, '../client/build')));

// Store active torrents
const activeTorrents = new Map();

// History file path
const HISTORY_FILE = path.join(__dirname, 'torrent_history.json');

// Load history from file
let torrentHistory = [];
try {
  if (fsSync.existsSync(HISTORY_FILE)) {
    const data = fsSync.readFileSync(HISTORY_FILE, 'utf8');
    torrentHistory = JSON.parse(data);
  }
} catch (err) {
  console.error('Error loading history:', err);
  torrentHistory = [];
}

// Save history to file
const saveHistory = async () => {
  try {
    await fs.writeFile(HISTORY_FILE, JSON.stringify(torrentHistory, null, 2));
  } catch (err) {
    console.error('Error saving history:', err);
  }
};

// Extract thumbnail and title from torrent (simplified implementation)
const extractTorrentInfo = (torrent) => {
  // In a real implementation, you would extract actual metadata
  // For now, we'll generate mock data
  const title = torrent.name || 'Unknown Title';
  
  // Generate a mock thumbnail URL based on the torrent name
  const hash = crypto.createHash('md5').update(torrent.infoHash).digest('hex');
  const thumbnail = `https://via.placeholder.com/300x450/333/fff?text=${encodeURIComponent(title.substring(0, 20))}`;
  
  return {
    title,
    thumbnail,
    infoHash: torrent.infoHash,
    createdAt: new Date().toISOString()
  };
};

// API Routes
app.post('/api/add-torrent', (req, res) => {
  const { magnetURI } = req.body;
  
  if (!magnetURI) {
    return res.status(400).json({ error: 'Magnet URI is required' });
  }

  // Check if torrent is already added
  if (activeTorrents.has(magnetURI)) {
    const existingTorrent = activeTorrents.get(magnetURI);
    return res.json({ 
      infoHash: existingTorrent.infoHash,
      status: 'already_added'
    });
  }

  // Add torrent with error handling
  client.add(magnetURI, (torrent) => {
    console.log('Torrent added:', torrent.infoHash);
    
    // Store torrent reference
    activeTorrents.set(magnetURI, torrent);
    
    // Extract and save torrent info to history
    const torrentInfo = extractTorrentInfo(torrent);
    torrentHistory.unshift(torrentInfo); // Add to beginning of history
    
    // Keep only the last 100 entries to prevent file from growing too large
    if (torrentHistory.length > 100) {
      torrentHistory = torrentHistory.slice(0, 100);
    }
    
    // Save history
    saveHistory();
    
    // When torrent is ready
    torrent.on('ready', () => {
      console.log('Torrent ready:', torrent.infoHash);
    });
    
    // When torrent is done
    torrent.on('done', () => {
      console.log('Torrent finished downloading:', torrent.infoHash);
    });
    
    // Handle torrent errors
    torrent.on('error', (err) => {
      console.error('Torrent error:', err);
      // Remove from active torrents on error
      activeTorrents.delete(magnetURI);
    });
    
    res.json({ 
      infoHash: torrent.infoHash,
      status: 'added'
    });
  }).on('error', (err) => {
    console.error('WebTorrent client error:', err);
    return res.status(500).json({ error: 'Failed to add torrent: ' + err.message });
  });
});

// Get torrent info - enhanced to re-add torrents from history if needed
app.get('/api/torrent/:infoHash', async (req, res) => {
  const { infoHash } = req.params;
  let torrent = client.get(infoHash);
  
  // If torrent is not found in active torrents, try to re-add it from history
  if (!torrent) {
    // Look for the torrent in history
    const historyItem = torrentHistory.find(item => item.infoHash === infoHash);
    
    if (historyItem) {
      // Try to re-add the torrent using a magnet URI
      // We'll create a basic magnet URI from the infoHash
      const magnetURI = `magnet:?xt=urn:btih:${infoHash}`;
      
      try {
        // Add the torrent
        torrent = await new Promise((resolve, reject) => {
          client.add(magnetURI, (newTorrent) => {
            console.log('Re-added torrent from history:', newTorrent.infoHash);
            
            // Store torrent reference
            activeTorrents.set(magnetURI, newTorrent);
            
            // Handle torrent errors
            newTorrent.on('error', (err) => {
              console.error('Re-added torrent error:', err);
              activeTorrents.delete(magnetURI);
            });
            
            resolve(newTorrent);
          }).on('error', reject);
        });
      } catch (err) {
        console.error('Failed to re-add torrent:', err);
        return res.status(500).json({ error: 'Failed to re-add torrent: ' + err.message });
      }
    } else {
      return res.status(404).json({ error: 'Torrent not found' });
    }
  }
  
  res.json({
    infoHash: torrent.infoHash,
    name: torrent.name,
    length: torrent.length,
    downloaded: torrent.downloaded,
    downloadSpeed: torrent.downloadSpeed,
    uploadSpeed: torrent.uploadSpeed,
    progress: torrent.progress,
    numPeers: torrent.numPeers,
    files: torrent.files.map((file, index) => ({
      name: file.name,
      length: file.length,
      path: file.path,
      mime: file.mime || 'application/octet-stream',
      index: index,
      streamUrl: `/api/stream/${infoHash}/${index}`,
      vlcUrl: `http://localhost:${PORT}/api/stream/${infoHash}/${index}`
    }))
  });
});

// Stream a file from torrent with range request support
app.get('/api/stream/:infoHash/:fileIndex', (req, res) => {
  const { infoHash, fileIndex } = req.params;
  const torrent = client.get(infoHash);
  
  if (!torrent) {
    return res.status(404).json({ error: 'Torrent not found' });
  }
  
  const file = torrent.files[parseInt(fileIndex)];
  if (!file) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  const range = req.headers.range;
  const mimeType = file.mime || 'application/octet-stream';
  
  // Set appropriate headers for streaming
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Length', file.length);
  
  if (range) {
    // Handle range requests for better media playback
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : file.length - 1;
    const chunksize = (end - start) + 1;
    
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${file.length}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': mimeType,
    });
    
    const stream = file.createReadStream({ start: start, end: end });
    stream.pipe(res);
    
    stream.on('error', (err) => {
      console.error('Stream error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Streaming error' });
      }
    });
    
    req.on('close', () => {
      stream.destroy();
    });
  } else {
    // Regular streaming without range requests
    const stream = file.createReadStream();
    stream.pipe(res);
    
    stream.on('error', (err) => {
      console.error('Stream error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Streaming error' });
      }
    });
    
    req.on('close', () => {
      stream.destroy();
    });
  }
});

// Get torrent history with pagination
app.get('/api/history', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  
  const paginatedHistory = torrentHistory.slice(startIndex, endIndex);
  const totalPages = Math.ceil(torrentHistory.length / limit);
  
  res.json({
    history: paginatedHistory,
    pagination: {
      currentPage: page,
      totalPages: totalPages,
      totalItems: torrentHistory.length,
      itemsPerPage: limit
    }
  });
});

// Clear history
app.delete('/api/history', (req, res) => {
  torrentHistory = [];
  saveHistory();
  res.json({ message: 'History cleared' });
});

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/build/index.html'));
});

// Export the app for Vercel
module.exports = app;

// Only start the server if this file is the main module (not imported)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`VLC streaming endpoint: http://localhost:${PORT}/api/stream/{infoHash}/{fileIndex}`);
  });
}