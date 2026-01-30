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

// Input rate limiting
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
    // Attempt reconnect after 2 seconds
    setTimeout(() => {
        window.location.reload();
    }, 2000);
};

// SPACE to return to lobby after game over
document.addEventListener('keydown', (e) => {
    if (e.key === ' ' && gameState?.gameState === 'gameover') {
        window.location.href = '/';
    }
});

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
            ctx.fillText('Press SPACE to return to lobby', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 50);
        }
    }

    // Connection indicator
    ctx.font = '12px Arial';
    ctx.textAlign = 'right';
    ctx.fillStyle = ws.readyState === WebSocket.OPEN ? '#00FF00' : '#FF0000';
    ctx.fillText(ws.readyState === WebSocket.OPEN ? '● Connected' : '● Disconnected', CANVAS_WIDTH - 10, CANVAS_HEIGHT - 10);

    requestAnimationFrame(render);
}

// Start render loop
render();
