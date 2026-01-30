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
        case 'next_level':
            handleNextLevel(ws);
            break;
        case 'request_rematch':
            handleRematchRequest(ws);
            break;
        case 'accept_rematch':
            handleRematchAccept(ws);
            break;
        default:
            console.log('Unknown message type:', message.type);
    }
}


function handleNextLevel(ws) {
    const data = wsData.get(ws);
    if (!data) return;

    const room = roomManager.getRoom(data.roomId);
    if (!room || !room.isSinglePlayer) return;

    // Only proceed if level was completed successfully
    if (room.state !== 'gameover' && room.state !== 'playing') {
        // Increment level
        room.level++;
        room.state = 'countdown';

        console.log(`Room ${room.id} advancing to level ${room.level}`);

        // Clean up old game
        const oldGame = games.get(room.id);
        if (oldGame) {
            oldGame.stop();
            games.delete(room.id);
        }

        // Notify client of level up
        ws.send(JSON.stringify({
            type: 'level_up',
            level: room.level
        }));

        // Start countdown for next level
        startCountdown(room);
    }
}

function handleRematchRequest(ws) {
    const data = wsData.get(ws);
    if (!data) return;

    const room = roomManager.getRoom(data.roomId);
    if (!room || room.state !== 'gameover') return;

    // Mark this player as wanting a rematch
    const player = room.players[data.playerNumber];
    if (player) {
        player.wantsRematch = true;
    }

    // Notify the other player
    const otherPlayer = data.playerNumber === 'player1' ? 'player2' : 'player1';
    room.sendTo(otherPlayer, { type: 'rematch_requested', from: data.playerNumber });

    console.log(`Player ${data.playerNumber} requested rematch in room ${room.id}`);

    // Check if both players want rematch (for single player, auto-accept)
    checkRematchReady(room);
}

function handleRematchAccept(ws) {
    const data = wsData.get(ws);
    if (!data) return;

    const room = roomManager.getRoom(data.roomId);
    if (!room || room.state !== 'gameover') return;

    // Mark this player as wanting a rematch
    const player = room.players[data.playerNumber];
    if (player) {
        player.wantsRematch = true;
    }

    console.log(`Player ${data.playerNumber} accepted rematch in room ${room.id}`);

    checkRematchReady(room);
}

function checkRematchReady(room) {
    const p1 = room.players.player1;
    const p2 = room.players.player2;

    // For single player, only need p1 to want rematch
    if (room.isSinglePlayer) {
        if (p1?.wantsRematch) {
            startRematch(room);
        }
        return;
    }

    // For multiplayer, both need to want rematch
    if (p1?.wantsRematch && p2?.wantsRematch) {
        startRematch(room);
    }
}

function startRematch(room) {
    // Clean up old game
    const oldGame = games.get(room.id);
    if (oldGame) {
        oldGame.stop();
        games.delete(room.id);
    }

    // Reset rematch flags
    if (room.players.player1) room.players.player1.wantsRematch = false;
    if (room.players.player2) room.players.player2.wantsRematch = false;

    // Reset level for single player
    if (room.isSinglePlayer) {
        room.level = 1;
    }

    console.log(`Starting rematch in room ${room.id}`);

    // Notify players and start countdown
    room.broadcast({ type: 'rematch_starting' });
    startCountdown(room);
}

function handleCreate(ws, singlePlayer = false) {
    const room = roomManager.createRoom();

    if (singlePlayer) {
        // For single player, don't add player yet - game.html will join
        room.isSinglePlayer = true;
        room.level = 1;
        room.players.player2 = { ws: null, connected: false, isAI: true };

        ws.send(JSON.stringify({
            type: 'room_created',
            roomId: room.id,
            singlePlayer: true
        }));

        console.log(`Room ${room.id} created (single player)`);
    } else {
        // Multiplayer - add player to room
        const playerNumber = room.addPlayer(ws);
        wsData.set(ws, { roomId: room.id, playerNumber });

        ws.send(JSON.stringify({
            type: 'room_created',
            roomId: room.id,
            shareUrl: `/game/${room.id}`
        }));

        console.log(`Room ${room.id} created`);
    }
}

function handleJoin(ws, roomId) {
    const room = roomManager.getRoom(roomId?.toUpperCase());

    if (!room) {
        ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
        return;
    }

    // Single-player rooms
    if (room.isSinglePlayer) {
        // Check if player1 slot is available (first join or reconnect)
        if (!room.players.player1 || !room.players.player1.connected) {
            if (room.players.player1) {
                // Reconnect
                room.reconnectPlayer('player1', ws);
            } else {
                // First join
                room.players.player1 = { ws, connected: true, isAI: false };
            }
            wsData.set(ws, { roomId: room.id, playerNumber: 'player1' });

            ws.send(JSON.stringify({
                type: 'player_joined',
                playerNumber: 'player1',
                roomId: room.id,
                singlePlayer: true
            }));

            console.log(`Player joined single-player room ${room.id}`);

            // Start countdown immediately for single player (if not already in progress)
            if (room.state === 'waiting') {
                startCountdown(room);
            }
            return;
        }
        // Otherwise, single-player rooms can't be joined by others
        ws.send(JSON.stringify({ type: 'error', message: 'This is a single-player game' }));
        return;
    }

    // If game is in progress (countdown or playing), allow reconnection to disconnected slots
    if (room.state === 'countdown' || room.state === 'playing') {
        // Try to reconnect to a disconnected slot
        // Check both the connected flag AND the actual WebSocket state
        // Also handle the race condition where old WebSocket hasn't closed yet
        // Allow taking over from AI within first 5 seconds of game (grace period for page navigation)
        let reconnectedAs = null;

        const p1 = room.players.player1;
        const p2 = room.players.player2;

        const game = games.get(room.id);
        const gameJustStarted = !game || (Date.now() - (game.startTime || 0) < 5000);

        // A slot is available if:
        // - not connected, OR websocket is closed/null
        // - OR the websocket is different from current one (page navigation race condition)
        // - AI slots can be taken over if game just started (grace period)
        const canTakeOverAI = (player) => player?.isAI && gameJustStarted && !room.isSinglePlayer;
        const p1Available = p1 && (
            canTakeOverAI(p1) ||
            (!p1.isAI && (!p1.connected || !p1.ws || p1.ws.readyState !== 1 || (p1.ws !== ws && p1.ws.readyState === 1)))
        );
        const p2Available = p2 && (
            canTakeOverAI(p2) ||
            (!p2.isAI && (!p2.connected || !p2.ws || p2.ws.readyState !== 1 || (p2.ws !== ws && p2.ws.readyState === 1)))
        );

        console.log(`Room ${room.id} reconnection check: p1Available=${p1Available}, p2Available=${p2Available}, gameJustStarted=${gameJustStarted}`);
        console.log(`  p1: connected=${p1?.connected}, wsState=${p1?.ws?.readyState}, isAI=${p1?.isAI}`);
        console.log(`  p2: connected=${p2?.connected}, wsState=${p2?.ws?.readyState}, isAI=${p2?.isAI}`);

        if (p1Available) {
            const wasAI = p1.isAI;
            // Force close old websocket if it's still open (race condition fix)
            if (p1.ws && p1.ws !== ws && p1.ws.readyState === 1) {
                console.log(`Force closing old p1 websocket for room ${room.id}`);
                wsData.delete(p1.ws);
                p1.ws.close();
            }
            room.reconnectPlayer('player1', ws);
            reconnectedAs = 'player1';
            if (wasAI) {
                console.log(`Human taking over from AI for player1 in room ${room.id}`);
            }
        } else if (p2Available) {
            const wasAI = p2.isAI;
            // Force close old websocket if it's still open (race condition fix)
            if (p2.ws && p2.ws !== ws && p2.ws.readyState === 1) {
                console.log(`Force closing old p2 websocket for room ${room.id}`);
                wsData.delete(p2.ws);
                p2.ws.close();
            }
            room.reconnectPlayer('player2', ws);
            reconnectedAs = 'player2';
            if (wasAI) {
                console.log(`Human taking over from AI for player2 in room ${room.id}`);
            }
        }

        if (reconnectedAs) {
            wsData.set(ws, { roomId: room.id, playerNumber: reconnectedAs });
            ws.send(JSON.stringify({
                type: 'player_joined',
                playerNumber: reconnectedAs,
                roomId: room.id,
                reconnected: true
            }));

            // Notify other player of reconnection
            const otherPlayer = reconnectedAs === 'player1' ? 'player2' : 'player1';
            room.sendTo(otherPlayer, { type: 'opponent_reconnected' });

            console.log(`Player reconnected to room ${room.id} as ${reconnectedAs}`);
            return;
        }

        // No slot available for reconnection
        console.log(`Room ${room.id}: No slots available, sending 'Room is full' error`);
        ws.send(JSON.stringify({ type: 'error', message: 'Room is full' }));
        return;
    }

    // Normal join flow for waiting rooms
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

            // Check if any players are still disconnected - AI takes over
            // This handles the case where a player couldn't reconnect during countdown
            for (const playerNumber of ['player1', 'player2']) {
                const player = room.players[playerNumber];
                if (player && !player.connected && !player.isAI) {
                    player.isAI = true;
                    console.log(`AI taking over ${playerNumber} in room ${room.id} (failed to reconnect)`);
                }
            }

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
