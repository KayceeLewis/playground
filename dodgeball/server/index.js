import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { RoomManager } from './Room.js';
import { Game } from './Game.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });
const roomManager = new RoomManager();
const games = new Map();

const PORT = process.env.PORT || 3000;

// Route for game room URLs
app.get('/game/:roomId', (req, res) => {
    res.sendFile(join(__dirname, '../public/index.html'));
});

// Serve static files from public directory
app.use(express.static(join(__dirname, '../public')));

// Track which room/player each WebSocket belongs to
const wsData = new WeakMap();

// WebSocket connection handling
wss.on('connection', (ws) => {
    console.log('Client connected');

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            handleMessage(ws, message);
        } catch (e) {
            console.error('Invalid message:', e);
        }
    });

    ws.on('close', () => {
        handleDisconnect(ws);
    });
});

function handleMessage(ws, message) {
    switch (message.type) {
        case 'create':
            handleCreate(ws, message.singlePlayer);
            break;
        case 'join':
            handleJoin(ws, message.roomId);
            break;
        case 'input':
            handleInput(ws, message.keys);
            break;
        default:
            console.log('Unknown message type:', message.type);
    }
}

function handleCreate(ws, singlePlayer = false) {
    const room = roomManager.createRoom();
    const playerNumber = room.addPlayer(ws);
    wsData.set(ws, { roomId: room.id, playerNumber });

    ws.send(JSON.stringify({
        type: 'room_created',
        roomId: room.id,
        shareUrl: `/game/${room.id}`
    }));

    console.log(`Room ${room.id} created${singlePlayer ? ' (single player)' : ''}`);

    // For single player mode, add AI as player 2 and start immediately
    if (singlePlayer) {
        room.players.player2 = { ws: null, connected: false, isAI: true };
        startCountdown(room);
    }
}

function handleJoin(ws, roomId) {
    const room = roomManager.getRoom(roomId?.toUpperCase());

    if (!room) {
        ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
        return;
    }

    // Check if this is a single-player room needing reconnection
    // (player1 disconnected during page navigation, player2 is AI)
    if (room.players.player2?.isAI && !room.players.player1?.connected) {
        // Reconnect as player1
        room.reconnectPlayer('player1', ws);
        wsData.set(ws, { roomId: room.id, playerNumber: 'player1' });

        ws.send(JSON.stringify({
            type: 'player_joined',
            playerNumber: 'player1',
            roomId: room.id
        }));

        console.log(`Player reconnected to single-player room ${room.id}`);
        return;
    }

    if (room.isFull()) {
        ws.send(JSON.stringify({ type: 'error', message: 'Room is full' }));
        return;
    }

    const playerNumber = room.addPlayer(ws);
    wsData.set(ws, { roomId: room.id, playerNumber });

    ws.send(JSON.stringify({
        type: 'player_joined',
        playerNumber,
        roomId: room.id
    }));

    // Notify other player
    const otherPlayer = playerNumber === 'player1' ? 'player2' : 'player1';
    room.sendTo(otherPlayer, { type: 'opponent_joined' });

    console.log(`Player joined room ${room.id} as ${playerNumber}`);

    // Start countdown if room is now full
    if (room.isFull()) {
        startCountdown(room);
    }
}

function handleInput(ws, keys) {
    const data = wsData.get(ws);
    if (!data) return;

    const room = roomManager.getRoom(data.roomId);
    if (!room || room.state !== 'playing') return;

    // Store input for game tick processing
    const player = room.players[data.playerNumber];
    if (player) {
        player.currentInput = keys;
    }
}

function handleDisconnect(ws) {
    const data = wsData.get(ws);
    if (!data) return;

    const room = roomManager.getRoom(data.roomId);
    if (!room) return;

    room.removePlayer(data.playerNumber);

    // Notify other player (only if not AI)
    const otherPlayer = data.playerNumber === 'player1' ? 'player2' : 'player1';
    if (!room.players[otherPlayer]?.isAI) {
        room.sendTo(otherPlayer, {
            type: 'opponent_disconnected',
            aiTakeover: room.state === 'playing'
        });
    }

    console.log(`Player ${data.playerNumber} disconnected from room ${room.id}`);

    // For single-player rooms during countdown, keep room alive briefly for reconnection
    const isSinglePlayerRoom = room.players.player2?.isAI;
    const isCountdownOrPlaying = room.state === 'countdown' || room.state === 'playing';

    if (isSinglePlayerRoom && isCountdownOrPlaying) {
        // Give 10 seconds for page navigation/reconnection
        setTimeout(() => {
            const currentRoom = roomManager.getRoom(data.roomId);
            if (currentRoom && currentRoom.isEmpty()) {
                const game = games.get(data.roomId);
                if (game) {
                    game.stop();
                    games.delete(data.roomId);
                }
                roomManager.deleteRoom(data.roomId);
                console.log(`Room ${data.roomId} deleted (single-player timeout)`);
            }
        }, 10000);
        return;
    }

    // Clean up empty rooms immediately for multiplayer
    if (room.isEmpty()) {
        const game = games.get(room.id);
        if (game) {
            game.stop();
            games.delete(room.id);
        }
        roomManager.deleteRoom(room.id);
        console.log(`Room ${room.id} deleted (empty)`);
    }
}

function startCountdown(room) {
    room.state = 'countdown';
    let count = 3;

    const interval = setInterval(() => {
        room.broadcast({ type: 'countdown', seconds: count });
        count--;

        if (count < 0) {
            clearInterval(interval);
            room.state = 'playing';

            // Create and start game
            const game = new Game(room);
            games.set(room.id, game);
            game.start();

            room.broadcast({ type: 'game_start' });
        }
    }, 1000);
}

// Periodic room cleanup
setInterval(() => {
    roomManager.cleanup();
}, 60000);

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
