# Hit Me Online Multiplayer - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add online multiplayer to Hit Me with server-authoritative game logic, WebSocket communication, shareable game links, and AI takeover when players disconnect.

**Architecture:** Node.js server runs authoritative game simulation at 60 ticks/second. Clients connect via WebSockets, send only inputs, and render state received from server. Room system manages game sessions with shareable URLs. AI generates inputs for disconnected players.

**Tech Stack:** Node.js, Express, ws (WebSocket library), vanilla JavaScript client

---

## Task 1: Project Setup and Server Skeleton

**Files:**
- Create: `dodgeball/server/package.json`
- Create: `dodgeball/server/index.js`
- Create: `dodgeball/package.json`

**Step 1: Create server package.json**

Create `dodgeball/server/package.json`:

```json
{
  "name": "hit-me-server",
  "version": "1.0.0",
  "type": "module",
  "main": "index.js",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "ws": "^8.16.0"
  }
}
```

**Step 2: Create basic Express + WebSocket server**

Create `dodgeball/server/index.js`:

```javascript
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;

// Serve static files from public directory
app.use(express.static(join(__dirname, '../public')));

// WebSocket connection handling
wss.on('connection', (ws) => {
    console.log('Client connected');

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            console.log('Received:', message);
        } catch (e) {
            console.error('Invalid message:', e);
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
    });
});

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
```

**Step 3: Create root package.json with convenience scripts**

Create `dodgeball/package.json`:

```json
{
  "name": "hit-me",
  "version": "2.0.0",
  "scripts": {
    "start": "cd server && npm start",
    "install-server": "cd server && npm install"
  }
}
```

**Step 4: Test the server**

```bash
cd ~/Documents/playground/dodgeball/server
npm install
npm start
```

Expected: Server starts, shows "Server running on http://localhost:3000"

**Step 5: Commit**

```bash
cd ~/Documents/playground
git add dodgeball/server/ dodgeball/package.json
git commit -m "feat: add Node.js server skeleton with Express and WebSocket"
```

---

## Task 2: Room Management

**Files:**
- Create: `dodgeball/server/Room.js`
- Modify: `dodgeball/server/index.js`

**Step 1: Create Room class**

Create `dodgeball/server/Room.js`:

```javascript
function generateRoomId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

export class Room {
    constructor(id) {
        this.id = id || generateRoomId();
        this.players = {
            player1: null,
            player2: null
        };
        this.state = 'waiting'; // waiting, countdown, playing, gameover
        this.createdAt = Date.now();
    }

    addPlayer(ws) {
        if (!this.players.player1) {
            this.players.player1 = { ws, connected: true, isAI: false };
            return 'player1';
        } else if (!this.players.player2) {
            this.players.player2 = { ws, connected: true, isAI: false };
            return 'player2';
        }
        return null; // Room full
    }

    removePlayer(playerNumber) {
        if (this.players[playerNumber]) {
            this.players[playerNumber].connected = false;
            this.players[playerNumber].ws = null;
            // AI takes over if game is in progress
            if (this.state === 'playing') {
                this.players[playerNumber].isAI = true;
            }
        }
    }

    reconnectPlayer(playerNumber, ws) {
        if (this.players[playerNumber]) {
            this.players[playerNumber].ws = ws;
            this.players[playerNumber].connected = true;
            this.players[playerNumber].isAI = false;
        }
    }

    isFull() {
        return this.players.player1 !== null && this.players.player2 !== null;
    }

    isEmpty() {
        const p1Connected = this.players.player1?.connected;
        const p2Connected = this.players.player2?.connected;
        return !p1Connected && !p2Connected;
    }

    broadcast(message) {
        const data = JSON.stringify(message);
        if (this.players.player1?.ws?.readyState === 1) {
            this.players.player1.ws.send(data);
        }
        if (this.players.player2?.ws?.readyState === 1) {
            this.players.player2.ws.send(data);
        }
    }

    sendTo(playerNumber, message) {
        const player = this.players[playerNumber];
        if (player?.ws?.readyState === 1) {
            player.ws.send(JSON.stringify(message));
        }
    }
}

export class RoomManager {
    constructor() {
        this.rooms = new Map();
    }

    createRoom() {
        const room = new Room();
        this.rooms.set(room.id, room);
        return room;
    }

    getRoom(roomId) {
        return this.rooms.get(roomId);
    }

    deleteRoom(roomId) {
        this.rooms.delete(roomId);
    }

    // Clean up old empty rooms
    cleanup() {
        const now = Date.now();
        for (const [id, room] of this.rooms) {
            if (room.isEmpty() && now - room.createdAt > 60000) {
                this.rooms.delete(id);
            }
        }
    }
}
```

**Step 2: Update index.js to use Room management**

Replace `dodgeball/server/index.js`:

```javascript
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { RoomManager } from './Room.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });
const roomManager = new RoomManager();

const PORT = process.env.PORT || 3000;

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
            handleCreate(ws);
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

function handleCreate(ws) {
    const room = roomManager.createRoom();
    const playerNumber = room.addPlayer(ws);
    wsData.set(ws, { roomId: room.id, playerNumber });

    ws.send(JSON.stringify({
        type: 'room_created',
        roomId: room.id,
        shareUrl: `/game/${room.id}`
    }));

    console.log(`Room ${room.id} created`);
}

function handleJoin(ws, roomId) {
    const room = roomManager.getRoom(roomId?.toUpperCase());

    if (!room) {
        ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
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

    // Notify other player
    const otherPlayer = data.playerNumber === 'player1' ? 'player2' : 'player1';
    room.sendTo(otherPlayer, {
        type: 'opponent_disconnected',
        aiTakeover: room.state === 'playing'
    });

    console.log(`Player ${data.playerNumber} disconnected from room ${room.id}`);

    // Clean up empty rooms
    if (room.isEmpty()) {
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
            room.broadcast({ type: 'game_start' });
            // Game loop will be added in next task
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
```

**Step 3: Test room creation**

Restart server and test with browser console:
```javascript
const ws = new WebSocket('ws://localhost:3000');
ws.onmessage = (e) => console.log(JSON.parse(e.data));
ws.onopen = () => ws.send(JSON.stringify({ type: 'create' }));
```

Expected: Receive `room_created` message with roomId

**Step 4: Commit**

```bash
cd ~/Documents/playground
git add dodgeball/server/
git commit -m "feat: add room management with create/join/disconnect handling"
```

---

## Task 3: Server-Side Game Simulation

**Files:**
- Create: `dodgeball/server/Game.js`
- Modify: `dodgeball/server/index.js`

**Step 1: Create Game class with physics**

Create `dodgeball/server/Game.js`:

```javascript
// Game constants (must match client)
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 400;
const GROUND_Y = 350;
const PLAYER_SPEED = 5;
const JUMP_FORCE = -12;
const GRAVITY = 0.5;
const BALL_SPEED = 10;
const RESPAWN_TIME = 90;
const INVINCIBLE_TIME = 120;

export class Game {
    constructor(room) {
        this.room = room;
        this.state = {
            gameState: 'playing',
            players: {
                player1: this.createPlayer(150, 'left'),
                player2: this.createPlayer(650, 'right')
            },
            balls: [],
            respawnTimers: { player1: 0, player2: 0 }
        };
        this.tickInterval = null;
    }

    createPlayer(x, side) {
        return {
            x,
            y: GROUND_Y,
            side,
            velocityY: 0,
            isJumping: false,
            isDucking: false,
            lives: 3,
            hasBall: true,
            isInvincible: false,
            invincibleTimer: 0,
            facingRight: side === 'left',
            throwAnimation: 0
        };
    }

    start() {
        // Run game loop at 60 ticks per second
        this.tickInterval = setInterval(() => this.tick(), 1000 / 60);
    }

    stop() {
        if (this.tickInterval) {
            clearInterval(this.tickInterval);
            this.tickInterval = null;
        }
    }

    tick() {
        if (this.state.gameState !== 'playing') return;

        // Process inputs for each player
        this.processPlayerInput('player1');
        this.processPlayerInput('player2');

        // Update players
        this.updatePlayer('player1');
        this.updatePlayer('player2');

        // Update balls
        this.updateBalls();

        // Check collisions
        this.checkCollisions();

        // Update respawn timers
        this.updateRespawnTimers();

        // Check game over
        this.checkGameOver();

        // Broadcast state to clients (throttled to ~30 times/sec)
        if (Date.now() % 2 === 0) {
            this.broadcastState();
        }
    }

    processPlayerInput(playerNumber) {
        const roomPlayer = this.room.players[playerNumber];
        const gamePlayer = this.state.players[playerNumber];

        if (!roomPlayer || !gamePlayer) return;

        // Get input (from player or AI)
        let input;
        if (roomPlayer.isAI) {
            input = this.generateAIInput(playerNumber);
        } else {
            input = roomPlayer.currentInput || {};
        }

        // Apply movement
        if (input.left) {
            const boundary = gamePlayer.side === 'left' ? 30 : CANVAS_WIDTH / 2 + 30;
            if (gamePlayer.x > boundary) {
                gamePlayer.x -= PLAYER_SPEED;
            }
            gamePlayer.facingRight = false;
        }
        if (input.right) {
            const boundary = gamePlayer.side === 'left' ? CANVAS_WIDTH / 2 - 30 : CANVAS_WIDTH - 30;
            if (gamePlayer.x < boundary) {
                gamePlayer.x += PLAYER_SPEED;
            }
            gamePlayer.facingRight = true;
        }
        if (input.jump && !gamePlayer.isJumping) {
            gamePlayer.velocityY = JUMP_FORCE;
            gamePlayer.isJumping = true;
        }
        gamePlayer.isDucking = !!input.duck;

        // Handle throw
        if (input.throw && gamePlayer.hasBall) {
            this.throwBall(playerNumber);
            // Clear throw input to prevent continuous throwing
            if (roomPlayer.currentInput) {
                roomPlayer.currentInput.throw = false;
            }
        }
    }

    updatePlayer(playerNumber) {
        const player = this.state.players[playerNumber];

        // Apply gravity
        player.velocityY += GRAVITY;
        player.y += player.velocityY;

        // Ground collision
        if (player.y >= GROUND_Y) {
            player.y = GROUND_Y;
            player.velocityY = 0;
            player.isJumping = false;
        }

        // Update invincibility
        if (player.isInvincible) {
            player.invincibleTimer--;
            if (player.invincibleTimer <= 0) {
                player.isInvincible = false;
            }
        }

        // Update throw animation
        if (player.throwAnimation > 0) {
            player.throwAnimation--;
        }
    }

    throwBall(playerNumber) {
        const player = this.state.players[playerNumber];
        if (!player.hasBall) return;

        player.hasBall = false;
        player.throwAnimation = 10;
        this.state.respawnTimers[playerNumber] = RESPAWN_TIME;

        const height = player.isDucking ? 35 : 60;
        const armY = player.y - height + 15;
        const direction = player.facingRight ? 1 : -1;
        const ballX = player.x + (direction * 23);

        this.state.balls.push({
            x: ballX,
            y: armY,
            velocityX: direction * BALL_SPEED,
            owner: player.side,
            active: true
        });
    }

    updateBalls() {
        for (const ball of this.state.balls) {
            if (!ball.active) continue;
            ball.x += ball.velocityX;

            // Deactivate if off screen
            if (ball.x < -10 || ball.x > CANVAS_WIDTH + 10) {
                ball.active = false;
            }
        }

        // Remove inactive balls
        this.state.balls = this.state.balls.filter(b => b.active);
    }

    checkCollisions() {
        for (const ball of this.state.balls) {
            if (!ball.active) continue;

            for (const playerNumber of ['player1', 'player2']) {
                const player = this.state.players[playerNumber];

                // Don't hit the player who threw it
                if (ball.owner === player.side) continue;

                // Don't hit invincible players
                if (player.isInvincible) continue;

                // Check collision
                if (this.checkBallPlayerCollision(ball, player)) {
                    ball.active = false;
                    player.lives--;
                    player.isInvincible = true;
                    player.invincibleTimer = INVINCIBLE_TIME;
                }
            }
        }
    }

    checkBallPlayerCollision(ball, player) {
        const height = player.isDucking ? 35 : 60;
        const playerLeft = player.x - 15;
        const playerRight = player.x + 15;
        const playerTop = player.y - height;
        const playerBottom = player.y;

        const ballLeft = ball.x - 8;
        const ballRight = ball.x + 8;
        const ballTop = ball.y - 8;
        const ballBottom = ball.y + 8;

        return ballRight > playerLeft &&
               ballLeft < playerRight &&
               ballBottom > playerTop &&
               ballTop < playerBottom;
    }

    updateRespawnTimers() {
        for (const playerNumber of ['player1', 'player2']) {
            const player = this.state.players[playerNumber];
            if (!player.hasBall) {
                this.state.respawnTimers[playerNumber]--;
                if (this.state.respawnTimers[playerNumber] <= 0) {
                    player.hasBall = true;
                }
            }
        }
    }

    checkGameOver() {
        const p1Lives = this.state.players.player1.lives;
        const p2Lives = this.state.players.player2.lives;

        if (p1Lives <= 0 || p2Lives <= 0) {
            this.state.gameState = 'gameover';
            this.state.winner = p1Lives > 0 ? 'player1' : 'player2';
            this.stop();
            this.broadcastState();
        }
    }

    generateAIInput(playerNumber) {
        const ai = this.state.players[playerNumber];
        const opponent = this.state.players[playerNumber === 'player1' ? 'player2' : 'player1'];
        const input = { left: false, right: false, jump: false, duck: false, throw: false };

        // Find incoming balls
        const incomingBall = this.state.balls.find(ball => {
            if (ball.owner === ai.side) return false;
            const movingTowardAI = (ai.side === 'left' && ball.velocityX < 0) ||
                                   (ai.side === 'right' && ball.velocityX > 0);
            const closeEnough = Math.abs(ball.x - ai.x) < 200;
            return movingTowardAI && closeEnough;
        });

        if (incomingBall) {
            // Dodge the ball
            const aiHeight = ai.isDucking ? 35 : 60;
            const aiTop = ai.y - aiHeight;
            const aiBottom = ai.y;
            const ballY = incomingBall.y;

            if (ballY < aiTop + 20) {
                // Ball is high, duck
                input.duck = true;
            } else if (ballY > aiBottom - 30 && !ai.isJumping) {
                // Ball is low, jump
                input.jump = true;
            } else {
                // Move away from ball
                input.left = ai.side === 'right';
                input.right = ai.side === 'left';
            }
        } else if (ai.hasBall) {
            // Has ball, consider throwing
            if (Math.random() < 0.02) {
                input.throw = true;
            }
            // Face opponent
            if (ai.side === 'left') {
                input.right = Math.random() < 0.1;
            } else {
                input.left = Math.random() < 0.1;
            }
        } else {
            // Move around randomly
            if (Math.random() < 0.05) {
                input.left = Math.random() < 0.5;
                input.right = !input.left;
            }
        }

        return input;
    }

    broadcastState() {
        this.room.broadcast({
            type: 'state',
            ...this.state,
            players: {
                player1: {
                    ...this.state.players.player1,
                    isAI: this.room.players.player1?.isAI || false
                },
                player2: {
                    ...this.state.players.player2,
                    isAI: this.room.players.player2?.isAI || false
                }
            }
        });
    }

    reset() {
        this.state = {
            gameState: 'playing',
            players: {
                player1: this.createPlayer(150, 'left'),
                player2: this.createPlayer(650, 'right')
            },
            balls: [],
            respawnTimers: { player1: 0, player2: 0 }
        };
    }
}
```

**Step 2: Integrate Game into server**

Update `dodgeball/server/index.js` - add Game import and modify startCountdown:

Add import at top:
```javascript
import { Game } from './Game.js';
```

Add games map after roomManager:
```javascript
const games = new Map();
```

Update startCountdown function:
```javascript
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
```

Update handleDisconnect to stop game if both players leave:
```javascript
function handleDisconnect(ws) {
    const data = wsData.get(ws);
    if (!data) return;

    const room = roomManager.getRoom(data.roomId);
    if (!room) return;

    room.removePlayer(data.playerNumber);

    // Notify other player
    const otherPlayer = data.playerNumber === 'player1' ? 'player2' : 'player1';
    room.sendTo(otherPlayer, {
        type: 'opponent_disconnected',
        aiTakeover: room.state === 'playing'
    });

    console.log(`Player ${data.playerNumber} disconnected from room ${room.id}`);

    // Clean up empty rooms
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
```

**Step 3: Test game simulation**

Restart server. Game loop is running but we need the client to see it.

**Step 4: Commit**

```bash
cd ~/Documents/playground
git add dodgeball/server/
git commit -m "feat: add server-side game simulation with physics and AI"
```

---

## Task 4: Landing Page (Create/Join UI)

**Files:**
- Create: `dodgeball/public/index.html`
- Create: `dodgeball/public/lobby.css`
- Rename: `dodgeball/index.html` → `dodgeball/public/game.html`
- Rename: `dodgeball/style.css` → `dodgeball/public/style.css`
- Rename: `dodgeball/game.js` → `dodgeball/public/game-local.js` (keep for reference)

**Step 1: Move existing files to public folder**

```bash
cd ~/Documents/playground/dodgeball
mkdir -p public
mv index.html public/game.html
mv style.css public/style.css
mv game.js public/game-local.js
```

**Step 2: Create landing page**

Create `dodgeball/public/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Hit Me! - Online Dodgeball</title>
    <link rel="stylesheet" href="lobby.css">
</head>
<body>
    <div class="container">
        <h1>HIT ME!</h1>
        <p class="subtitle">Online Dodgeball</p>

        <div id="menu" class="menu">
            <button id="createBtn" class="btn btn-primary">Create Game</button>
            <div class="divider">or</div>
            <div class="join-section">
                <input type="text" id="roomCode" placeholder="Enter room code" maxlength="6">
                <button id="joinBtn" class="btn btn-secondary">Join Game</button>
            </div>
        </div>

        <div id="waiting" class="waiting hidden">
            <p>Waiting for opponent...</p>
            <p class="share-text">Share this link:</p>
            <div class="share-link">
                <input type="text" id="shareUrl" readonly>
                <button id="copyBtn" class="btn btn-small">Copy</button>
            </div>
            <p class="room-code">Room Code: <span id="roomCodeDisplay"></span></p>
        </div>

        <div id="error" class="error hidden"></div>
    </div>

    <script>
        const ws = new WebSocket(`ws://${window.location.host}`);

        const menuEl = document.getElementById('menu');
        const waitingEl = document.getElementById('waiting');
        const errorEl = document.getElementById('error');
        const createBtn = document.getElementById('createBtn');
        const joinBtn = document.getElementById('joinBtn');
        const roomCodeInput = document.getElementById('roomCode');
        const shareUrlInput = document.getElementById('shareUrl');
        const roomCodeDisplay = document.getElementById('roomCodeDisplay');
        const copyBtn = document.getElementById('copyBtn');

        // Check if joining from URL
        const pathMatch = window.location.pathname.match(/^\/game\/([A-Z0-9]{6})$/i);

        ws.onopen = () => {
            if (pathMatch) {
                // Auto-join from URL
                ws.send(JSON.stringify({ type: 'join', roomId: pathMatch[1] }));
            }
        };

        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);

            switch (msg.type) {
                case 'room_created':
                    showWaiting(msg.roomId);
                    break;
                case 'player_joined':
                    // Successfully joined, wait for opponent or start
                    if (pathMatch) {
                        showWaiting(msg.roomId);
                    }
                    break;
                case 'opponent_joined':
                case 'game_start':
                    // Redirect to game
                    window.location.href = `/game.html?room=${roomCodeDisplay.textContent || pathMatch?.[1]}`;
                    break;
                case 'countdown':
                    // Redirect to game on countdown
                    const roomId = roomCodeDisplay.textContent || pathMatch?.[1];
                    window.location.href = `/game.html?room=${roomId}`;
                    break;
                case 'error':
                    showError(msg.message);
                    break;
            }
        };

        createBtn.addEventListener('click', () => {
            ws.send(JSON.stringify({ type: 'create' }));
        });

        joinBtn.addEventListener('click', () => {
            const code = roomCodeInput.value.trim().toUpperCase();
            if (code.length === 6) {
                ws.send(JSON.stringify({ type: 'join', roomId: code }));
            } else {
                showError('Please enter a 6-character room code');
            }
        });

        roomCodeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') joinBtn.click();
        });

        copyBtn.addEventListener('click', () => {
            shareUrlInput.select();
            document.execCommand('copy');
            copyBtn.textContent = 'Copied!';
            setTimeout(() => copyBtn.textContent = 'Copy', 2000);
        });

        function showWaiting(roomId) {
            menuEl.classList.add('hidden');
            waitingEl.classList.remove('hidden');
            errorEl.classList.add('hidden');

            const url = `${window.location.origin}/game/${roomId}`;
            shareUrlInput.value = url;
            roomCodeDisplay.textContent = roomId;

            // Update URL without reload
            history.pushState({}, '', `/game/${roomId}`);
        }

        function showError(message) {
            errorEl.textContent = message;
            errorEl.classList.remove('hidden');
            setTimeout(() => errorEl.classList.add('hidden'), 3000);
        }
    </script>
</body>
</html>
```

**Step 3: Create lobby styles**

Create `dodgeball/public/lobby.css`:

```css
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: Arial, sans-serif;
    background-color: #1a1a2e;
    color: white;
    min-height: 100vh;
    display: flex;
    justify-content: center;
    align-items: center;
}

.container {
    text-align: center;
    padding: 2rem;
}

h1 {
    font-size: 4rem;
    margin-bottom: 0.5rem;
    color: #FFD700;
}

.subtitle {
    font-size: 1.5rem;
    color: #87CEEB;
    margin-bottom: 2rem;
}

.menu {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    align-items: center;
}

.btn {
    padding: 1rem 2rem;
    font-size: 1.2rem;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: transform 0.1s, background-color 0.2s;
}

.btn:hover {
    transform: scale(1.05);
}

.btn:active {
    transform: scale(0.98);
}

.btn-primary {
    background-color: #4CAF50;
    color: white;
}

.btn-primary:hover {
    background-color: #45a049;
}

.btn-secondary {
    background-color: #2196F3;
    color: white;
}

.btn-secondary:hover {
    background-color: #1976D2;
}

.btn-small {
    padding: 0.5rem 1rem;
    font-size: 1rem;
}

.divider {
    color: #888;
    margin: 0.5rem 0;
}

.join-section {
    display: flex;
    gap: 0.5rem;
}

input[type="text"] {
    padding: 1rem;
    font-size: 1.2rem;
    border: 2px solid #444;
    border-radius: 8px;
    background-color: #2a2a4e;
    color: white;
    text-transform: uppercase;
    text-align: center;
    width: 150px;
}

input[type="text"]:focus {
    outline: none;
    border-color: #2196F3;
}

.waiting {
    animation: pulse 2s infinite;
}

@keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
}

.share-text {
    margin-top: 1.5rem;
    color: #888;
}

.share-link {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.5rem;
    justify-content: center;
}

.share-link input {
    width: 300px;
    text-transform: none;
}

.room-code {
    margin-top: 1rem;
    font-size: 1.5rem;
}

.room-code span {
    color: #FFD700;
    font-weight: bold;
    letter-spacing: 2px;
}

.error {
    margin-top: 1rem;
    padding: 1rem;
    background-color: #f44336;
    border-radius: 8px;
}

.hidden {
    display: none !important;
}
```

**Step 4: Add route for /game/:roomId**

Update `dodgeball/server/index.js` - add route before static middleware:

```javascript
// Route for game room URLs
app.get('/game/:roomId', (req, res) => {
    res.sendFile(join(__dirname, '../public/index.html'));
});
```

**Step 5: Test landing page**

```bash
cd ~/Documents/playground/dodgeball/server
npm start
```

Open http://localhost:3000 - should see the lobby UI

**Step 6: Commit**

```bash
cd ~/Documents/playground
git add dodgeball/
git commit -m "feat: add landing page with create/join game UI"
```

---

## Task 5: Multiplayer Game Client

**Files:**
- Create: `dodgeball/public/client.js`
- Modify: `dodgeball/public/game.html`

**Step 1: Create multiplayer client**

Create `dodgeball/public/client.js`:

```javascript
// Canvas setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game constants
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 400;
const GROUND_Y = 350;

// Get room ID from URL
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('room');

if (!roomId) {
    window.location.href = '/';
}

// WebSocket connection
const ws = new WebSocket(`ws://${window.location.host}`);

// Game state (received from server)
let gameState = null;
let myPlayerNumber = null;
let countdownSeconds = null;
let connectionStatus = 'connecting';

// Input state
const keys = {
    left: false,
    right: false,
    jump: false,
    duck: false,
    throw: false
};

// Keyboard event listeners
document.addEventListener('keydown', (e) => {
    let changed = false;

    switch (e.key.toLowerCase()) {
        case 'a':
        case 'arrowleft':
            if (!keys.left) { keys.left = true; changed = true; }
            break;
        case 'd':
        case 'arrowright':
            if (!keys.right) { keys.right = true; changed = true; }
            break;
        case 'w':
        case 'arrowup':
            if (!keys.jump) { keys.jump = true; changed = true; }
            break;
        case 's':
        case 'arrowdown':
            if (!keys.duck) { keys.duck = true; changed = true; }
            break;
        case 'f':
        case '/':
            if (!keys.throw) { keys.throw = true; changed = true; }
            break;
    }

    if (changed) {
        sendInput();
        e.preventDefault();
    }
});

document.addEventListener('keyup', (e) => {
    let changed = false;

    switch (e.key.toLowerCase()) {
        case 'a':
        case 'arrowleft':
            if (keys.left) { keys.left = false; changed = true; }
            break;
        case 'd':
        case 'arrowright':
            if (keys.right) { keys.right = false; changed = true; }
            break;
        case 'w':
        case 'arrowup':
            if (keys.jump) { keys.jump = false; changed = true; }
            break;
        case 's':
        case 'arrowdown':
            if (keys.duck) { keys.duck = false; changed = true; }
            break;
        case 'f':
        case '/':
            if (keys.throw) { keys.throw = false; changed = true; }
            break;
    }

    if (changed) {
        sendInput();
    }
});

function sendInput() {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', keys }));
    }
}

// WebSocket handlers
ws.onopen = () => {
    connectionStatus = 'joining';
    ws.send(JSON.stringify({ type: 'join', roomId }));
};

ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);

    switch (msg.type) {
        case 'player_joined':
            myPlayerNumber = msg.playerNumber;
            connectionStatus = 'waiting';
            break;
        case 'opponent_joined':
            connectionStatus = 'ready';
            break;
        case 'countdown':
            countdownSeconds = msg.seconds;
            connectionStatus = 'countdown';
            break;
        case 'game_start':
            connectionStatus = 'playing';
            countdownSeconds = null;
            break;
        case 'state':
            gameState = msg;
            break;
        case 'opponent_disconnected':
            if (msg.aiTakeover) {
                // Game continues with AI
            }
            break;
        case 'opponent_reconnected':
            // Opponent is back
            break;
        case 'error':
            alert(msg.message);
            window.location.href = '/';
            break;
    }
};

ws.onclose = () => {
    connectionStatus = 'disconnected';
};

// Drawing functions
function drawPlayer(player, isAI) {
    if (player.isInvincible && Math.floor(Date.now() / 100) % 2 === 0) {
        return;
    }

    const height = player.isDucking ? 35 : 60;
    const headRadius = 10;
    const bodyLength = player.isDucking ? 15 : 25;

    const headY = player.y - height + headRadius;
    const bodyStartY = headY + headRadius;
    const bodyEndY = bodyStartY + bodyLength;
    const footY = player.y;

    ctx.strokeStyle = player.side === 'left' ? '#0000FF' : '#FF0000';
    ctx.lineWidth = 3;

    // Head
    ctx.beginPath();
    ctx.arc(player.x, headY, headRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Body
    ctx.beginPath();
    ctx.moveTo(player.x, bodyStartY);
    ctx.lineTo(player.x, bodyEndY);
    ctx.stroke();

    // Arms
    const armY = bodyStartY + 5;
    const armLength = 15;

    if (player.throwAnimation > 0) {
        const direction = player.facingRight ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(player.x, armY);
        ctx.lineTo(player.x + (direction * armLength * 1.5), armY - 5);
        ctx.moveTo(player.x, armY);
        ctx.lineTo(player.x - (direction * armLength * 0.5), armY + 5);
        ctx.stroke();
    } else {
        ctx.beginPath();
        ctx.moveTo(player.x - armLength, armY);
        ctx.lineTo(player.x + armLength, armY);
        ctx.stroke();
    }

    // Legs
    const legSpread = player.isDucking ? 15 : 10;
    ctx.beginPath();
    ctx.moveTo(player.x, bodyEndY);
    ctx.lineTo(player.x - legSpread, footY);
    ctx.moveTo(player.x, bodyEndY);
    ctx.lineTo(player.x + legSpread, footY);
    ctx.stroke();

    // Ball in hand
    if (player.hasBall) {
        const ballX = player.facingRight ? player.x + armLength + 8 : player.x - armLength - 8;
        ctx.fillStyle = '#FFFF00';
        ctx.beginPath();
        ctx.arc(ballX, armY, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    // AI indicator
    if (isAI) {
        ctx.fillStyle = '#FF6600';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('[AI]', player.x, player.y - height - 10);
    }

    ctx.lineWidth = 1;
}

function drawBall(ball) {
    ctx.fillStyle = '#FFFF00';
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.stroke();
}

function render() {
    // Clear canvas
    ctx.fillStyle = '#87CEEB';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw ground
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(0, GROUND_Y, CANVAS_WIDTH, CANVAS_HEIGHT - GROUND_Y);

    // Draw center line
    ctx.strokeStyle = '#FFFFFF';
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.moveTo(CANVAS_WIDTH / 2, 0);
    ctx.lineTo(CANVAS_WIDTH / 2, GROUND_Y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw based on connection status
    ctx.fillStyle = '#000000';
    ctx.font = '24px Arial';
    ctx.textAlign = 'center';

    if (connectionStatus === 'connecting') {
        ctx.fillText('Connecting...', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    } else if (connectionStatus === 'waiting') {
        ctx.fillText('Waiting for opponent...', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
        ctx.font = '16px Arial';
        ctx.fillText(`You are ${myPlayerNumber === 'player1' ? 'Blue (Left)' : 'Red (Right)'}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 30);
    } else if (connectionStatus === 'countdown') {
        ctx.font = '72px Arial';
        ctx.fillText(countdownSeconds, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    } else if (connectionStatus === 'disconnected') {
        ctx.fillText('Disconnected', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
        ctx.font = '16px Arial';
        ctx.fillText('Refresh to reconnect', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 30);
    } else if (gameState) {
        // Draw players
        drawPlayer(gameState.players.player1, gameState.players.player1.isAI);
        drawPlayer(gameState.players.player2, gameState.players.player2.isAI);

        // Draw balls
        for (const ball of gameState.balls) {
            if (ball.active) {
                drawBall(ball);
            }
        }

        // Draw lives
        ctx.font = '20px Arial';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#0000FF';
        ctx.fillText('P1: ' + '\u2764\uFE0F'.repeat(Math.max(0, gameState.players.player1.lives)), 10, 30);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#FF0000';
        ctx.fillText('P2: ' + '\u2764\uFE0F'.repeat(Math.max(0, gameState.players.player2.lives)), CANVAS_WIDTH - 10, 30);

        // Draw "You" indicator
        ctx.font = '14px Arial';
        ctx.fillStyle = '#000000';
        if (myPlayerNumber === 'player1') {
            ctx.textAlign = 'left';
            ctx.fillText('(You)', 10, 50);
        } else {
            ctx.textAlign = 'right';
            ctx.fillText('(You)', CANVAS_WIDTH - 10, 50);
        }

        // Game over overlay
        if (gameState.gameState === 'gameover') {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

            ctx.fillStyle = '#FFFFFF';
            ctx.font = '48px Arial';
            ctx.textAlign = 'center';

            const youWon = gameState.winner === myPlayerNumber;
            ctx.fillText(youWon ? 'You Win!' : 'You Lose!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);

            ctx.font = '24px Arial';
            ctx.fillText('Return to lobby to play again', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 50);
        }
    }

    requestAnimationFrame(render);
}

// Start render loop
render();
```

**Step 2: Update game.html to use multiplayer client**

Update `dodgeball/public/game.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Hit Me! - Playing</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <canvas id="gameCanvas" width="800" height="400"></canvas>
    <script src="client.js"></script>
</body>
</html>
```

**Step 3: Test multiplayer**

1. Start server: `cd dodgeball/server && npm start`
2. Open http://localhost:3000 in browser 1, click "Create Game"
3. Copy the share link, open in browser 2
4. Both should see countdown, then game starts
5. Test controls in both windows

**Step 4: Commit**

```bash
cd ~/Documents/playground
git add dodgeball/public/
git commit -m "feat: add multiplayer game client with server state rendering"
```

---

## Task 6: Polish and Edge Cases

**Files:**
- Modify: `dodgeball/public/client.js`
- Modify: `dodgeball/server/index.js`

**Step 1: Add rematch functionality**

Update `dodgeball/public/client.js` - add after game over rendering:

```javascript
// Add keyboard listener for returning to lobby
document.addEventListener('keydown', (e) => {
    if (e.key === ' ' && gameState?.gameState === 'gameover') {
        window.location.href = '/';
    }
});
```

Update the game over text:
```javascript
ctx.fillText('Press SPACE to return to lobby', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 50);
```

**Step 2: Add connection status indicator**

Add to render function in client.js, at the end before requestAnimationFrame:

```javascript
    // Connection indicator
    ctx.font = '12px Arial';
    ctx.textAlign = 'right';
    ctx.fillStyle = ws.readyState === WebSocket.OPEN ? '#00FF00' : '#FF0000';
    ctx.fillText(ws.readyState === WebSocket.OPEN ? '● Connected' : '● Disconnected', CANVAS_WIDTH - 10, CANVAS_HEIGHT - 10);
```

**Step 3: Handle reconnection gracefully**

Update client.js to attempt reconnection:

```javascript
ws.onclose = () => {
    connectionStatus = 'disconnected';
    // Attempt reconnect after 2 seconds
    setTimeout(() => {
        window.location.reload();
    }, 2000);
};
```

**Step 4: Add input rate limiting**

Update sendInput in client.js to throttle:

```javascript
let lastInputSent = 0;
const INPUT_RATE_LIMIT = 16; // ~60 times per second max

function sendInput() {
    const now = Date.now();
    if (now - lastInputSent < INPUT_RATE_LIMIT) return;
    lastInputSent = now;

    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', keys }));
    }
}
```

**Step 5: Test edge cases**

1. Test disconnect/reconnect
2. Test closing browser mid-game (AI should take over)
3. Test invalid room codes
4. Test joining full room

**Step 6: Commit**

```bash
cd ~/Documents/playground
git add dodgeball/
git commit -m "feat: add polish - rematch, connection status, reconnection, rate limiting"
```

---

## Task 7: Final Testing and Documentation

**Files:**
- Modify: `dodgeball/README.md` (create)

**Step 1: Create README**

Create `dodgeball/README.md`:

```markdown
# Hit Me! - Online Dodgeball

A 2D side-view dodgeball game playable in the browser with online multiplayer.

## Features

- Two-player online multiplayer
- Server-authoritative game logic (cheat-resistant)
- AI takeover when opponent disconnects
- Shareable game links

## Running Locally

```bash
# Install dependencies
cd server
npm install

# Start server
npm start
```

Open http://localhost:3000 in your browser.

## How to Play

1. Click "Create Game" to start a new game
2. Share the link with a friend
3. When both players join, game starts after countdown

### Controls

| Action | Keys |
|--------|------|
| Move Left | A or ← |
| Move Right | D or → |
| Jump | W or ↑ |
| Duck | S or ↓ |
| Throw | F or / |

### Rules

- Each player has 3 lives
- Get hit by a ball, lose a life
- Last player standing wins!
- You can't cross the center line

## Tech Stack

- **Server:** Node.js, Express, WebSocket (ws)
- **Client:** HTML5 Canvas, vanilla JavaScript
```

**Step 2: Full integration test**

1. Start server
2. Create game in browser 1
3. Join in browser 2
4. Play full game to completion
5. Test AI by closing browser 2 mid-game
6. Verify AI continues playing

**Step 3: Commit everything**

```bash
cd ~/Documents/playground
git add dodgeball/
git commit -m "docs: add README with setup and gameplay instructions"
```

**Step 4: Push to GitHub**

```bash
git push origin main
```

---

## Summary

After completing all tasks, you will have:

- Node.js server with Express and WebSocket
- Room system with shareable links
- Server-authoritative game simulation
- AI takeover for disconnected players
- Multiplayer client that renders server state
- Landing page with create/join UI
- Full documentation

**To test locally:** Run `npm start` in the server directory, open http://localhost:3000 in two browser tabs.

**Next steps (future):**
- Deploy to cloud (Render, Railway, Fly.io)
- Add player nicknames
- Add spectator mode
- Add sound effects
