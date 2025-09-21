# Torrent Streaming Site

A web application that allows users to stream torrents directly in the browser using magnet links.

## Features

- Add torrents using magnet links
- Stream video and audio files directly in the browser
- View download progress and speed
- See list of files in the torrent

## How It Works

1. User enters a magnet link
2. The application adds the torrent and begins downloading
3. User can select any file to stream while it's downloading
4. Files are streamed directly in the browser using HTML5 video/audio players

## Technology Stack

- **Frontend**: React.js
- **Backend**: Node.js with Express
- **Torrent Handling**: WebTorrent library
- **Streaming**: HTML5 Media Elements

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the React frontend:
   ```bash
   cd src/client
   npm run build
   cd ../..
   ```

## Usage

1. Start the server:
   ```bash
   node src/server/server.js
   ```
2. Open your browser and navigate to `http://localhost:5000`
3. Enter a magnet link in the input field
4. Click "Add Torrent"
5. Once files appear, click on any file to stream it

## API Endpoints

- `POST /api/add-torrent` - Add a new torrent
  - Body: `{ "magnetURI": "magnet:?xt=urn:btih:..." }`
  - Response: `{ "infoHash": "...", "status": "..." }`

- `GET /api/torrent/:infoHash` - Get torrent information
  - Response: Torrent metadata including progress, speed, and files

- `GET /api/stream/:infoHash/:fileIndex` - Stream a file from the torrent
  - Response: File stream

## How to Find Magnet Links

You can find magnet links on various torrent sites. Here are some examples:
- [The Pirate Bay](https://thepiratebay.org)
- [1337x](https://1337x.to)
- [RARBG](https://rarbg.to)

## Legal Disclaimer

This application is for educational purposes only. Please ensure you have the right to access any content you download or stream. Respect copyright laws in your jurisdiction.

## License

MIT License