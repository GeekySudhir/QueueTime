const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// In-memory application state
let state = {
  currentSong: null,
  queue: [],
  isPlaying: false
};

// Helper: Extract YouTube Video ID from any standard link
function extractYouTubeId(url) {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.trim().match(regExp);
  return (match && match[2].length === 11) ? match[2] : (url.trim().length === 11 ? url.trim() : null);
}

function playNextSong() {
  if (state.queue.length > 0) {
    state.currentSong = state.queue.shift();
    state.isPlaying = true;
  } else {
    state.currentSong = null;
    state.isPlaying = false;
  }
  io.emit('state-update', state);
  if (state.currentSong) {
    io.emit('play-video', state.currentSong);
  }
}

io.on('connection', (socket) => {
  // Sync state to newly connected user/admin
  socket.emit('state-update', state);

  // User adds a song to the queue
  socket.on('add-song', (data) => {
    const videoId = extractYouTubeId(data.url);
    if (!videoId) {
      socket.emit('error-msg', 'Invalid YouTube URL or ID.');
      return;
    }

    const song = {
      id: Date.now().toString(),
      videoId: videoId,
      title: data.title.trim() || `YouTube Track (${videoId})`,
      addedBy: data.addedBy.trim() || 'Gym Member',
      addedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    state.queue.push(song);
    io.emit('state-update', state);

    // Auto-play if no song is currently loaded
    if (!state.currentSong && state.queue.length === 1) {
      playNextSong();
    }
  });

  // Admin triggers manual skip
  socket.on('admin-next-song', () => {
    playNextSong();
  });

  // Admin updates playback state (play/pause)
  socket.on('admin-status-change', (isPlaying) => {
    state.isPlaying = isPlaying;
    io.emit('state-update', state);
  });

  // Admin or user removes a song from queue
  socket.on('remove-song', (songId) => {
    state.queue = state.queue.filter(s => s.id !== songId);
    io.emit('state-update', state);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`========================================`);
  console.log(`Server active!`);
  console.log(`User Interface:  http://localhost:${PORT}`);
  console.log(`Admin Dashboard: http://localhost:${PORT}/admin.html`);
  console.log(`========================================`);
});