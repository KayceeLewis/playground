// =====================
// SINGLE PAGE DODGEBALL CLIENT
// Handles lobby + game in one WebSocket connection
// =====================

// DOM Elements - Lobby
const lobbyContainer = document.getElementById('lobbyContainer');
const gameContainer = document.getElementById('gameContainer');
const menuEl = document.getElementById('menu');
const waitingEl = document.getElementById('waiting');
const errorEl = document.getElementById('error');
const createBtn = document.getElementById('createBtn');
const joinBtn = document.getElementById('joinBtn');
const roomCodeInput = document.getElementById('roomCode');
const shareUrlInput = document.getElementById('shareUrl');
const roomCodeDisplay = document.getElementById('roomCodeDisplay');
const copyBtn = document.getElementById('copyBtn');
const singlePlayerBtn = document.getElementById('singlePlayerBtn');

// Canvas setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game constants
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 400;
const GROUND_Y = 350;

// =====================
// AUDIO
// =====================
let audioCtx = null;
function getAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
}

function playThrowSound() {
    try {
        const ctx = getAudioContext();
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        oscillator.frequency.setValueAtTime(400, ctx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.1);
    } catch (e) {}
}

function playHitSound() {
    try {
        const ctx = getAudioContext();
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(150, ctx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.2);
        gainNode.gain.setValueAtTime(0.4, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.2);
    } catch (e) {}
}

function playExplosionSound() {
    try {
        const ctx = getAudioContext();
        const bufferSize = ctx.sampleRate * 0.5;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const gainNode = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1000, ctx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.5);
        noise.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(ctx.destination);
        gainNode.gain.setValueAtTime(0.5, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        noise.start(ctx.currentTime);
    } catch (e) {}
}

function playWinSound() {
    try {
        const ctx = getAudioContext();
        const notes = [523, 659, 784, 1047];
        notes.forEach((freq, i) => {
            const oscillator = ctx.createOscillator();
            const gainNode = ctx.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);
            oscillator.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.15);
            gainNode.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.15);
            gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.15 + 0.3);
            oscillator.start(ctx.currentTime + i * 0.15);
            oscillator.stop(ctx.currentTime + i * 0.15 + 0.3);
        });
    } catch (e) {}
}

function playLoseSound() {
    try {
        const ctx = getAudioContext();
        const notes = [400, 350, 300, 200];
        notes.forEach((freq, i) => {
            const oscillator = ctx.createOscillator();
            const gainNode = ctx.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);
            oscillator.type = 'sawtooth';
            oscillator.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.2);
            gainNode.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.2);
            gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.2 + 0.25);
            oscillator.start(ctx.currentTime + i * 0.2);
            oscillator.stop(ctx.currentTime + i * 0.2 + 0.25);
        });
    } catch (e) {}
}

// =====================
// EXPLOSIONS
// =====================
let explosionParticles = [];

function createExplosion(x, y, color) {
    const particleCount = 30;
    for (let i = 0; i < particleCount; i++) {
        const angle = (Math.PI * 2 * i) / particleCount + Math.random() * 0.5;
        const speed = 3 + Math.random() * 5;
        explosionParticles.push({
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 2,
            life: 1,
            color,
            size: 3 + Math.random() * 4
        });
    }
}

function updateExplosions() {
    for (let i = explosionParticles.length - 1; i >= 0; i--) {
        const p = explosionParticles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.2;
        p.life -= 0.02;
        if (p.life <= 0) {
            explosionParticles.splice(i, 1);
        }
    }
}

function drawExplosions() {
    for (const p of explosionParticles) {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
}

// =====================
// STATE
// =====================
let appState = 'lobby'; // 'lobby', 'waiting', 'countdown', 'playing'
let currentRoomId = null;
let myPlayerNumber = null;
let isSinglePlayer = false;
let countdownSeconds = null;
let currentLevel = 1;
let gameState = null;
let renderState = null;
let gameOverSoundPlayed = false;
let prevLives = { player1: 3, player2: 3 };
let prevBallCount = 0;

// Client-side interpolation
let lastServerUpdate = 0;
const LERP_FACTOR = 0.3;

// Client-side prediction constants (must match server)
const PLAYER_SPEED = 5;
const JUMP_FORCE = -12;
const GRAVITY = 0.5;

// Local player prediction state
let localPlayerState = null;
let localVelocityY = 0;

// Input state
const keys = { left: false, right: false, jump: false, duck: false, throw: false };

// =====================
// WEBSOCKET
// =====================
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${wsProtocol}//${window.location.host}`);

// Check if joining from URL (e.g., /game/ABC123)
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
            currentRoomId = msg.roomId;
            if (msg.singlePlayer) {
                isSinglePlayer = true;
                // Auto-join the single player room
                ws.send(JSON.stringify({ type: 'join', roomId: msg.roomId }));
            } else {
                showWaiting(msg.roomId);
            }
            break;

        case 'player_joined':
            myPlayerNumber = msg.playerNumber;
            currentRoomId = msg.roomId;
            if (msg.singlePlayer) {
                isSinglePlayer = true;
            }
            if (msg.reconnected) {
                // Reconnected to active game
                switchToGame();
            } else if (pathMatch || isSinglePlayer) {
                // Joined via URL or single player - stay in lobby view until countdown
                showWaiting(msg.roomId);
            }
            break;

        case 'opponent_joined':
            // Both players are in - countdown will start
            break;

        case 'countdown':
            countdownSeconds = msg.seconds;
            appState = 'countdown';
            switchToGame();
            break;

        case 'game_start':
            appState = 'playing';
            countdownSeconds = null;
            break;

        case 'state':
            appState = 'playing';
            isSinglePlayer = !!msg.aiPlayers;
            if (msg.level) currentLevel = msg.level;

            // Sound triggers
            if (gameState) {
                if (msg.balls.length > prevBallCount) {
                    playThrowSound();
                }
                prevBallCount = msg.balls.length;

                if (msg.players.player1.lives < prevLives.player1) {
                    playHitSound();
                    if (msg.players.player1.lives <= 0) {
                        createExplosion(msg.players.player1.x, msg.players.player1.y - 30, '#0000FF');
                    }
                }
                prevLives.player1 = msg.players.player1.lives;

                if (isSinglePlayer && msg.aiPlayers) {
                    msg.aiPlayers.forEach((ai, idx) => {
                        const prevAI = prevLives[`ai${idx}`] || 3;
                        if (ai.lives < prevAI) {
                            playHitSound();
                            if (ai.lives <= 0) {
                                createExplosion(ai.x, ai.y - 30, '#FF0000');
                            }
                        }
                        prevLives[`ai${idx}`] = ai.lives;
                    });
                } else if (msg.players.player2) {
                    if (msg.players.player2.lives < (prevLives.player2 || 3)) {
                        playHitSound();
                        if (msg.players.player2.lives <= 0) {
                            createExplosion(msg.players.player2.x, msg.players.player2.y - 30, '#FF0000');
                        }
                    }
                    prevLives.player2 = msg.players.player2.lives;
                }

                if ((msg.gameState === 'gameover' || msg.gameState === 'levelcomplete') && !gameOverSoundPlayed) {
                    gameOverSoundPlayed = true;
                    if (msg.gameState === 'gameover' && msg.winner === 'ai') {
                        playExplosionSound();
                        setTimeout(() => playLoseSound(), 300);
                    } else if (msg.gameState === 'levelcomplete') {
                        playWinSound();
                    } else {
                        playExplosionSound();
                        const youWon = msg.winner === myPlayerNumber;
                        setTimeout(() => {
                            if (youWon) playWinSound();
                            else playLoseSound();
                        }, 300);
                    }
                }
            }

            gameState = msg;
            lastServerUpdate = Date.now();

            if (!renderState) {
                renderState = JSON.parse(JSON.stringify(msg));
            }
            break;

        case 'opponent_disconnected':
            // Game continues with AI if needed
            break;

        case 'opponent_reconnected':
            // Opponent is back
            break;

        case 'level_up':
            currentLevel = msg.level;
            gameOverSoundPlayed = false;
            prevLives = { player1: 3 };
            prevBallCount = 0;
            break;

        case 'error':
            showError(msg.message);
            break;
    }
};

ws.onclose = () => {
    appState = 'disconnected';
};

// =====================
// UI FUNCTIONS
// =====================
function showWaiting(roomId) {
    appState = 'waiting';
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

function switchToGame() {
    lobbyContainer.classList.add('hidden');
    gameContainer.classList.remove('hidden');
    // Start render loop if not already running
    if (!renderLoopStarted) {
        renderLoopStarted = true;
        render();
    }
}

function switchToLobby() {
    gameContainer.classList.add('hidden');
    lobbyContainer.classList.remove('hidden');
    menuEl.classList.remove('hidden');
    waitingEl.classList.add('hidden');

    // Reset state
    appState = 'lobby';
    currentRoomId = null;
    myPlayerNumber = null;
    isSinglePlayer = false;
    gameState = null;
    renderState = null;
    localPlayerState = null;
    localVelocityY = 0;
    gameOverSoundPlayed = false;
    prevLives = { player1: 3, player2: 3 };
    prevBallCount = 0;
    currentLevel = 1;

    // Reset URL
    history.pushState({}, '', '/');
}

// =====================
// LOBBY BUTTONS
// =====================
singlePlayerBtn.addEventListener('click', () => {
    ws.send(JSON.stringify({ type: 'create', singlePlayer: true }));
});

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

// =====================
// INPUT HANDLING
// =====================
let lastInputSent = 0;
const INPUT_RATE_LIMIT = 16;

function sendInput() {
    const now = Date.now();
    if (now - lastInputSent < INPUT_RATE_LIMIT) return;
    lastInputSent = now;

    if (ws.readyState === WebSocket.OPEN && appState === 'playing') {
        ws.send(JSON.stringify({ type: 'input', keys }));
    }
}

document.addEventListener('keydown', (e) => {
    // Game over / level complete actions
    if (e.key === ' ') {
        if (gameState?.gameState === 'gameover') {
            switchToLobby();
            return;
        } else if (gameState?.gameState === 'levelcomplete') {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'next_level' }));
            }
            return;
        }
    }
    if (e.key === 'Escape' && gameState?.gameState === 'levelcomplete') {
        switchToLobby();
        return;
    }

    // Game input
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

// =====================
// DRAWING
// =====================
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

    ctx.strokeStyle = player.side === 'left' ? '#4488FF' : '#FF4444';
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

function drawArenaBackground() {
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const crowdY = 60;
    const crowdHeight = 80;

    const crowdGradient = ctx.createLinearGradient(0, 0, 0, crowdY + crowdHeight);
    crowdGradient.addColorStop(0, '#0d0d1a');
    crowdGradient.addColorStop(1, '#1a1a2e');
    ctx.fillStyle = crowdGradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, crowdY + crowdHeight);

    ctx.fillStyle = '#2a2a4a';
    for (let x = 0; x < CANVAS_WIDTH; x += 15) {
        const headY = crowdY + 20 + Math.sin(x * 0.3) * 10;
        const size = 6 + Math.random() * 3;
        ctx.beginPath();
        ctx.arc(x + 7, headY, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(x + 2, headY + size, 10, 20);
    }

    ctx.fillStyle = '#202038';
    for (let x = 8; x < CANVAS_WIDTH; x += 15) {
        const headY = crowdY + 5 + Math.sin(x * 0.25) * 8;
        const size = 5 + Math.random() * 2;
        ctx.beginPath();
        ctx.arc(x + 7, headY, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(x + 3, headY + size, 8, 15);
    }

    ctx.fillStyle = '#4a4a6a';
    ctx.fillRect(0, crowdY + crowdHeight - 5, CANVAS_WIDTH, 8);
    ctx.fillStyle = '#3a3a5a';
    ctx.fillRect(0, crowdY + crowdHeight + 3, CANVAS_WIDTH, 3);

    const floorGradient = ctx.createLinearGradient(0, crowdY + crowdHeight, 0, GROUND_Y + 50);
    floorGradient.addColorStop(0, '#1a1a1a');
    floorGradient.addColorStop(0.5, '#252525');
    floorGradient.addColorStop(1, '#1a1a1a');
    ctx.fillStyle = floorGradient;
    ctx.fillRect(0, crowdY + crowdHeight + 6, CANVAS_WIDTH, GROUND_Y - crowdY - crowdHeight + 44);

    const zoneGradient1 = ctx.createLinearGradient(0, 0, CANVAS_WIDTH / 2 - 20, 0);
    zoneGradient1.addColorStop(0, 'rgba(60, 60, 140, 0.4)');
    zoneGradient1.addColorStop(1, 'rgba(80, 60, 160, 0.2)');
    ctx.fillStyle = zoneGradient1;
    ctx.fillRect(10, crowdY + crowdHeight + 20, CANVAS_WIDTH / 2 - 30, GROUND_Y - crowdY - crowdHeight - 10);

    const zoneGradient2 = ctx.createLinearGradient(CANVAS_WIDTH / 2 + 20, 0, CANVAS_WIDTH, 0);
    zoneGradient2.addColorStop(0, 'rgba(160, 60, 80, 0.2)');
    zoneGradient2.addColorStop(1, 'rgba(140, 60, 60, 0.4)');
    ctx.fillStyle = zoneGradient2;
    ctx.fillRect(CANVAS_WIDTH / 2 + 20, crowdY + crowdHeight + 20, CANVAS_WIDTH / 2 - 30, GROUND_Y - crowdY - crowdHeight - 10);

    ctx.strokeStyle = '#6060aa';
    ctx.lineWidth = 3;
    ctx.strokeRect(10, crowdY + crowdHeight + 20, CANVAS_WIDTH / 2 - 30, GROUND_Y - crowdY - crowdHeight - 10);

    ctx.strokeStyle = '#aa6060';
    ctx.strokeRect(CANVAS_WIDTH / 2 + 20, crowdY + crowdHeight + 20, CANVAS_WIDTH / 2 - 30, GROUND_Y - crowdY - crowdHeight - 10);

    ctx.fillStyle = '#FFD700';
    ctx.fillRect(CANVAS_WIDTH / 2 - 3, crowdY + crowdHeight + 10, 6, GROUND_Y - crowdY - crowdHeight);

    const playAreaTop = crowdY + crowdHeight + 20;
    const playAreaHeight = GROUND_Y - playAreaTop;
    const centerY = playAreaTop + playAreaHeight / 2;
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(CANVAS_WIDTH / 2, centerY, 40, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#cc0000';
    ctx.fillRect(0, GROUND_Y, CANVAS_WIDTH, 8);
    ctx.fillStyle = '#990000';
    ctx.fillRect(0, GROUND_Y + 8, CANVAS_WIDTH, CANVAS_HEIGHT - GROUND_Y - 8);

    const lightPositions = [150, 400, 650];
    for (const lx of lightPositions) {
        ctx.fillStyle = '#333';
        ctx.fillRect(lx - 25, 0, 50, 15);
        const lightGlow = ctx.createRadialGradient(lx, 15, 0, lx, 15, 150);
        lightGlow.addColorStop(0, 'rgba(255, 255, 200, 0.15)');
        lightGlow.addColorStop(0.5, 'rgba(255, 255, 200, 0.05)');
        lightGlow.addColorStop(1, 'rgba(255, 255, 200, 0)');
        ctx.fillStyle = lightGlow;
        ctx.fillRect(lx - 150, 0, 300, 300);
        ctx.fillStyle = '#FFFFCC';
        ctx.beginPath();
        ctx.arc(lx, 12, 8, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.fillStyle = '#cc0033';
    ctx.fillRect(200, 5, 400, 35);
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 2;
    ctx.strokeRect(200, 5, 400, 35);
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 22px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('HIT ME! CHAMPIONSHIP', CANVAS_WIDTH / 2, 30);

    ctx.fillStyle = '#333';
    ctx.fillRect(CANVAS_WIDTH - 60, 50, 55, 80);
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 1;
    ctx.strokeRect(CANVAS_WIDTH - 60, 50, 55, 80);
    ctx.strokeStyle = '#666';
    ctx.beginPath();
    ctx.moveTo(CANVAS_WIDTH - 50, 60);
    ctx.lineTo(CANVAS_WIDTH - 30, 60);
    ctx.lineTo(CANVAS_WIDTH - 30, 75);
    ctx.moveTo(CANVAS_WIDTH - 50, 75);
    ctx.lineTo(CANVAS_WIDTH - 30, 75);
    ctx.moveTo(CANVAS_WIDTH - 30, 67);
    ctx.lineTo(CANVAS_WIDTH - 20, 67);
    ctx.lineTo(CANVAS_WIDTH - 20, 105);
    ctx.moveTo(CANVAS_WIDTH - 50, 95);
    ctx.lineTo(CANVAS_WIDTH - 30, 95);
    ctx.lineTo(CANVAS_WIDTH - 30, 110);
    ctx.moveTo(CANVAS_WIDTH - 50, 110);
    ctx.lineTo(CANVAS_WIDTH - 30, 110);
    ctx.moveTo(CANVAS_WIDTH - 30, 102);
    ctx.lineTo(CANVAS_WIDTH - 20, 102);
    ctx.stroke();

    ctx.lineWidth = 1;
}

// Apply client-side prediction for local player
function applyLocalPrediction() {
    if (!localPlayerState || !myPlayerNumber || appState !== 'playing') return;

    const player = localPlayerState;
    const serverPlayer = gameState?.players?.[myPlayerNumber];
    if (!serverPlayer || serverPlayer.lives <= 0) return;

    // Horizontal movement
    if (keys.left && !keys.duck) {
        player.x -= PLAYER_SPEED;
        player.facingRight = false;
    }
    if (keys.right && !keys.duck) {
        player.x += PLAYER_SPEED;
        player.facingRight = true;
    }

    // Boundary constraints (match server logic)
    const minX = player.side === 'left' ? 30 : CANVAS_WIDTH / 2 + 30;
    const maxX = player.side === 'left' ? CANVAS_WIDTH / 2 - 30 : CANVAS_WIDTH - 30;
    player.x = Math.max(minX, Math.min(maxX, player.x));

    // Jumping
    if (keys.jump && !player.isJumping && !keys.duck) {
        localVelocityY = JUMP_FORCE;
        player.isJumping = true;
    }

    // Apply gravity
    localVelocityY += GRAVITY;
    player.y += localVelocityY;

    // Ground collision
    if (player.y >= GROUND_Y) {
        player.y = GROUND_Y;
        localVelocityY = 0;
        player.isJumping = false;
    }

    // Ducking
    player.isDucking = keys.duck && !player.isJumping;

    // Reconcile with server - smoothly correct towards server position
    // This prevents drift while keeping responsiveness
    const serverX = serverPlayer.x;
    const serverY = serverPlayer.y;
    const drift = Math.abs(player.x - serverX) + Math.abs(player.y - serverY);

    // If too far from server, snap back (server is authoritative)
    if (drift > 50) {
        player.x = serverX;
        player.y = serverY;
        localVelocityY = 0;
    } else if (drift > 5) {
        // Gentle correction towards server position
        player.x += (serverX - player.x) * 0.1;
        player.y += (serverY - player.y) * 0.1;
    }

    // Always sync state that we can't predict (lives, ball, etc)
    player.lives = serverPlayer.lives;
    player.hasBall = serverPlayer.hasBall;
    player.isInvincible = serverPlayer.isInvincible;
    player.throwAnimation = serverPlayer.throwAnimation;
    player.side = serverPlayer.side;
    player.isAI = serverPlayer.isAI;
}

function interpolateState() {
    if (!gameState || !renderState) return;

    const lerp = (a, b, t) => a + (b - a) * t;

    // Initialize local player state from server if needed
    if (!localPlayerState && myPlayerNumber && gameState.players[myPlayerNumber]) {
        localPlayerState = JSON.parse(JSON.stringify(gameState.players[myPlayerNumber]));
        localVelocityY = 0;
    }

    // For local player: use predicted state
    // For opponent: use interpolated server state
    const isPlayer1Local = myPlayerNumber === 'player1';
    const isPlayer2Local = myPlayerNumber === 'player2';

    if (gameState.players.player1 && renderState.players.player1) {
        const p1 = renderState.players.player1;
        const target = gameState.players.player1;

        if (isPlayer1Local && localPlayerState) {
            // Use predicted position for local player
            p1.x = localPlayerState.x;
            p1.y = localPlayerState.y;
            p1.isDucking = localPlayerState.isDucking;
            p1.isJumping = localPlayerState.isJumping;
            p1.facingRight = localPlayerState.facingRight;
        } else {
            // Interpolate opponent
            p1.x = lerp(p1.x, target.x, LERP_FACTOR);
            p1.y = lerp(p1.y, target.y, LERP_FACTOR);
            p1.isDucking = target.isDucking;
            p1.isJumping = target.isJumping;
            p1.facingRight = target.facingRight;
        }
        p1.lives = target.lives;
        p1.hasBall = target.hasBall;
        p1.isInvincible = target.isInvincible;
        p1.throwAnimation = target.throwAnimation;
        p1.side = target.side;
        p1.isAI = target.isAI;
    }

    if (gameState.players.player2 && renderState.players.player2) {
        const p2 = renderState.players.player2;
        const target = gameState.players.player2;

        if (isPlayer2Local && localPlayerState) {
            // Use predicted position for local player
            p2.x = localPlayerState.x;
            p2.y = localPlayerState.y;
            p2.isDucking = localPlayerState.isDucking;
            p2.isJumping = localPlayerState.isJumping;
            p2.facingRight = localPlayerState.facingRight;
        } else {
            // Interpolate opponent
            p2.x = lerp(p2.x, target.x, LERP_FACTOR);
            p2.y = lerp(p2.y, target.y, LERP_FACTOR);
            p2.isDucking = target.isDucking;
            p2.isJumping = target.isJumping;
            p2.facingRight = target.facingRight;
        }
        p2.lives = target.lives;
        p2.hasBall = target.hasBall;
        p2.isInvincible = target.isInvincible;
        p2.throwAnimation = target.throwAnimation;
        p2.side = target.side;
        p2.isAI = target.isAI;
    }

    if (gameState.aiPlayers && renderState.aiPlayers) {
        while (renderState.aiPlayers.length < gameState.aiPlayers.length) {
            renderState.aiPlayers.push(JSON.parse(JSON.stringify(gameState.aiPlayers[renderState.aiPlayers.length])));
        }
        for (let i = 0; i < gameState.aiPlayers.length; i++) {
            const ai = renderState.aiPlayers[i];
            const target = gameState.aiPlayers[i];
            ai.x = lerp(ai.x, target.x, LERP_FACTOR);
            ai.y = lerp(ai.y, target.y, LERP_FACTOR);
            ai.lives = target.lives;
            ai.hasBall = target.hasBall;
            ai.isDucking = target.isDucking;
            ai.isJumping = target.isJumping;
            ai.isInvincible = target.isInvincible;
            ai.facingRight = target.facingRight;
            ai.throwAnimation = target.throwAnimation;
            ai.side = target.side;
            ai.isAI = target.isAI;
        }
    }

    if (gameState.balls) {
        renderState.balls = gameState.balls;
    }

    renderState.gameState = gameState.gameState;
    renderState.winner = gameState.winner;
    renderState.level = gameState.level;
}

// =====================
// RENDER LOOP
// =====================
let renderLoopStarted = false;

function render() {
    // Apply client-side prediction for responsive local movement
    applyLocalPrediction();
    interpolateState();
    drawArenaBackground();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '24px Arial';
    ctx.textAlign = 'center';

    if (appState === 'countdown') {
        ctx.font = '72px Arial';
        ctx.fillText(countdownSeconds, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    } else if (appState === 'disconnected') {
        ctx.fillText('Disconnected', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
        ctx.font = '16px Arial';
        ctx.fillText('Refresh to reconnect', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 30);
    } else if (renderState && gameState) {
        updateExplosions();

        if (renderState.players.player1.lives > 0) {
            drawPlayer(renderState.players.player1, renderState.players.player1.isAI);
        }

        if (isSinglePlayer && renderState.aiPlayers) {
            for (const ai of renderState.aiPlayers) {
                if (ai.lives > 0) {
                    drawPlayer(ai, true);
                }
            }
        } else if (renderState.players.player2 && renderState.players.player2.lives > 0) {
            drawPlayer(renderState.players.player2, renderState.players.player2.isAI);
        }

        drawExplosions();

        for (const ball of renderState.balls) {
            if (ball.active) {
                drawBall(ball);
            }
        }

        if (isSinglePlayer) {
            ctx.font = 'bold 18px Arial';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#FFD700';
            ctx.fillText(`LEVEL ${currentLevel}`, CANVAS_WIDTH / 2, 55);
        }

        ctx.font = '20px Arial';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#4488FF';
        ctx.fillText('P1: ' + '\u2764\uFE0F'.repeat(Math.max(0, gameState.players.player1.lives)), 10, 55);

        if (isSinglePlayer && gameState.aiPlayers) {
            ctx.textAlign = 'right';
            ctx.fillStyle = '#FF4444';
            const totalAILives = gameState.aiPlayers.reduce((sum, ai) => sum + Math.max(0, ai.lives), 0);
            ctx.fillText('CPU: ' + '\u2764\uFE0F'.repeat(totalAILives), CANVAS_WIDTH - 70, 55);
        } else if (gameState.players.player2) {
            ctx.textAlign = 'right';
            ctx.fillStyle = '#FF4444';
            ctx.fillText('P2: ' + '\u2764\uFE0F'.repeat(Math.max(0, gameState.players.player2.lives)), CANVAS_WIDTH - 70, 55);
        }

        ctx.font = '14px Arial';
        ctx.fillStyle = '#CCCCCC';
        if (myPlayerNumber === 'player1') {
            ctx.textAlign = 'left';
            ctx.fillText('(You)', 10, 72);
        } else {
            ctx.textAlign = 'right';
            ctx.fillText('(You)', CANVAS_WIDTH - 70, 72);
        }

        // Level complete overlay
        if (gameState.gameState === 'levelcomplete') {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

            ctx.fillStyle = '#FFD700';
            ctx.font = 'bold 48px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('LEVEL COMPLETE!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 30);

            ctx.font = '24px Arial';
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText('Press SPACE for next level', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 20);
            ctx.fillText('Press ESC to return to lobby', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 50);
        }

        // Game over overlay
        if (gameState.gameState === 'gameover') {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

            const youWon = gameState.winner === myPlayerNumber;
            ctx.fillStyle = youWon ? '#00FF00' : '#FF0000';
            ctx.font = 'bold 48px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(youWon ? 'YOU WIN!' : 'GAME OVER', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 20);

            ctx.font = '24px Arial';
            ctx.fillStyle = '#FFFFFF';
            if (isSinglePlayer) {
                ctx.fillText(`Reached Level ${currentLevel}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 20);
                ctx.fillText('Press SPACE to return to lobby', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 60);
            } else {
                ctx.fillText('Press SPACE to return to lobby', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 30);
            }
        }
    }

    // Connection indicator
    ctx.font = '12px Arial';
    ctx.textAlign = 'right';
    ctx.fillStyle = ws.readyState === WebSocket.OPEN ? '#00FF00' : '#FF0000';
    ctx.fillText(ws.readyState === WebSocket.OPEN ? '● Connected' : '● Disconnected', CANVAS_WIDTH - 10, CANVAS_HEIGHT - 10);

    requestAnimationFrame(render);
}
