# Dodgeball Game Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a 2D side-view dodgeball game where two local players compete using the same keyboard, with stick figure characters and lives-based elimination.

**Architecture:** Single-page HTML5 Canvas game with vanilla JavaScript. All game logic lives in one file (game.js) with a standard game loop pattern: process input → update state → render. Game state machine handles title screen, playing, and game over states.

**Tech Stack:** HTML5 Canvas API, vanilla JavaScript (ES6+), CSS for page styling only

---

## Task 1: Project Setup and Game Loop Foundation

**Files:**
- Create: `dodgeball/index.html`
- Create: `dodgeball/style.css`
- Create: `dodgeball/game.js`

**Step 1: Create the HTML file**

Create `dodgeball/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dodgeball</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <canvas id="gameCanvas" width="800" height="400"></canvas>
    <script src="game.js"></script>
</body>
</html>
```

**Step 2: Create the CSS file**

Create `dodgeball/style.css`:

```css
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    background-color: #1a1a2e;
}

canvas {
    border: 2px solid #eee;
    background-color: #87CEEB;
}
```

**Step 3: Create game.js with basic game loop**

Create `dodgeball/game.js`:

```javascript
// Canvas setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game constants
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 400;
const GROUND_Y = 350;

// Game state
let gameState = 'title'; // 'title', 'playing', 'gameover'

// Main game loop
function gameLoop() {
    update();
    render();
    requestAnimationFrame(gameLoop);
}

function update() {
    // Game logic will go here
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

    // Draw title screen text
    if (gameState === 'title') {
        ctx.fillStyle = '#000000';
        ctx.font = '48px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('DODGEBALL', CANVAS_WIDTH / 2, 100);
        ctx.font = '24px Arial';
        ctx.fillText('Press SPACE to start', CANVAS_WIDTH / 2, 150);
    }
}

// Start the game
gameLoop();
```

**Step 4: Test in browser**

Open `dodgeball/index.html` in a web browser. You should see:
- Blue sky background
- Brown ground at the bottom
- White dashed center line
- "DODGEBALL" title and "Press SPACE to start" text

**Step 5: Commit**

```bash
cd ~/Documents/playground
git add dodgeball/
git commit -m "feat: add dodgeball project with basic game loop and title screen"
```

---

## Task 2: Input Handling

**Files:**
- Modify: `dodgeball/game.js`

**Step 1: Add keyboard state tracking**

Add after the game state variables in `game.js`:

```javascript
// Input tracking
const keys = {};

// Keyboard event listeners
document.addEventListener('keydown', (e) => {
    keys[e.key] = true;

    // Prevent default for game keys
    if (['w', 'a', 's', 'd', 'f', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', '/'].includes(e.key)) {
        e.preventDefault();
    }

    // Start game on space
    if (e.key === ' ' && gameState === 'title') {
        gameState = 'playing';
    }

    // Restart game on space
    if (e.key === ' ' && gameState === 'gameover') {
        resetGame();
    }
});

document.addEventListener('keyup', (e) => {
    keys[e.key] = false;
});

function resetGame() {
    gameState = 'playing';
    // Will reset player state later
}
```

**Step 2: Test in browser**

Open the game, press SPACE. The title text should disappear (game enters 'playing' state).

**Step 3: Commit**

```bash
cd ~/Documents/playground
git add dodgeball/game.js
git commit -m "feat: add keyboard input handling and game state transitions"
```

---

## Task 3: Stick Figure Player Class

**Files:**
- Modify: `dodgeball/game.js`

**Step 1: Add Player class**

Add after the input tracking code in `game.js`:

```javascript
// Player class
class Player {
    constructor(x, side) {
        this.x = x;
        this.y = GROUND_Y;
        this.side = side; // 'left' or 'right'
        this.width = 30;
        this.height = 60;
        this.velocityY = 0;
        this.isJumping = false;
        this.isDucking = false;
        this.lives = 3;
        this.hasBall = true;
        this.isInvincible = false;
        this.invincibleTimer = 0;
        this.facingRight = side === 'left'; // left player faces right, right player faces left
    }

    draw() {
        // Skip drawing every other frame if invincible (blinking effect)
        if (this.isInvincible && Math.floor(Date.now() / 100) % 2 === 0) {
            return;
        }

        const headRadius = 10;
        const bodyLength = this.isDucking ? 15 : 25;
        const legLength = this.isDucking ? 10 : 20;

        // Calculate positions
        const headY = this.y - this.height + headRadius;
        const bodyStartY = headY + headRadius;
        const bodyEndY = bodyStartY + bodyLength;
        const footY = this.y;

        ctx.strokeStyle = this.side === 'left' ? '#0000FF' : '#FF0000';
        ctx.lineWidth = 3;

        // Head
        ctx.beginPath();
        ctx.arc(this.x, headY, headRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Body
        ctx.beginPath();
        ctx.moveTo(this.x, bodyStartY);
        ctx.lineTo(this.x, bodyEndY);
        ctx.stroke();

        // Arms
        const armY = bodyStartY + 5;
        const armLength = 15;
        ctx.beginPath();
        ctx.moveTo(this.x - armLength, armY);
        ctx.lineTo(this.x + armLength, armY);
        ctx.stroke();

        // Legs
        const legSpread = this.isDucking ? 15 : 10;
        ctx.beginPath();
        ctx.moveTo(this.x, bodyEndY);
        ctx.lineTo(this.x - legSpread, footY);
        ctx.moveTo(this.x, bodyEndY);
        ctx.lineTo(this.x + legSpread, footY);
        ctx.stroke();

        // Draw ball if holding one
        if (this.hasBall) {
            const ballX = this.facingRight ? this.x + armLength + 8 : this.x - armLength - 8;
            ctx.fillStyle = '#FFFF00';
            ctx.beginPath();
            ctx.arc(ballX, armY, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        ctx.lineWidth = 1;
    }
}
```

**Step 2: Create player instances**

Add after the Player class:

```javascript
// Create players
let player1 = new Player(150, 'left');
let player2 = new Player(650, 'right');
```

**Step 3: Update render function**

Update the render function to draw players when playing:

```javascript
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

    if (gameState === 'title') {
        ctx.fillStyle = '#000000';
        ctx.font = '48px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('DODGEBALL', CANVAS_WIDTH / 2, 100);
        ctx.font = '24px Arial';
        ctx.fillText('Press SPACE to start', CANVAS_WIDTH / 2, 150);
    } else if (gameState === 'playing' || gameState === 'gameover') {
        player1.draw();
        player2.draw();
    }
}
```

**Step 4: Test in browser**

Press SPACE to start. You should see:
- Blue stick figure on the left holding a yellow ball
- Red stick figure on the right holding a yellow ball

**Step 5: Commit**

```bash
cd ~/Documents/playground
git add dodgeball/game.js
git commit -m "feat: add stick figure Player class with ball indicator"
```

---

## Task 4: Player Movement

**Files:**
- Modify: `dodgeball/game.js`

**Step 1: Add movement constants**

Add to the game constants section:

```javascript
const PLAYER_SPEED = 5;
const JUMP_FORCE = -12;
const GRAVITY = 0.5;
```

**Step 2: Add update method to Player class**

Add inside the Player class, after the draw method:

```javascript
    update() {
        // Apply gravity
        this.velocityY += GRAVITY;
        this.y += this.velocityY;

        // Ground collision
        if (this.y >= GROUND_Y) {
            this.y = GROUND_Y;
            this.velocityY = 0;
            this.isJumping = false;
        }

        // Update height based on ducking
        this.height = this.isDucking ? 35 : 60;

        // Update invincibility
        if (this.isInvincible) {
            this.invincibleTimer--;
            if (this.invincibleTimer <= 0) {
                this.isInvincible = false;
            }
        }
    }

    moveLeft() {
        const boundary = this.side === 'left' ? 30 : CANVAS_WIDTH / 2 + 30;
        if (this.x > boundary) {
            this.x -= PLAYER_SPEED;
        }
        this.facingRight = false;
    }

    moveRight() {
        const boundary = this.side === 'left' ? CANVAS_WIDTH / 2 - 30 : CANVAS_WIDTH - 30;
        if (this.x < boundary) {
            this.x += PLAYER_SPEED;
        }
        this.facingRight = true;
    }

    jump() {
        if (!this.isJumping) {
            this.velocityY = JUMP_FORCE;
            this.isJumping = true;
        }
    }

    duck(isDucking) {
        this.isDucking = isDucking;
    }
```

**Step 3: Update the main update function**

Replace the update function:

```javascript
function update() {
    if (gameState !== 'playing') return;

    // Player 1 controls (WASD + F)
    if (keys['a'] || keys['A']) player1.moveLeft();
    if (keys['d'] || keys['D']) player1.moveRight();
    if (keys['w'] || keys['W']) player1.jump();
    player1.duck(keys['s'] || keys['S']);

    // Player 2 controls (Arrows + /)
    if (keys['ArrowLeft']) player2.moveLeft();
    if (keys['ArrowRight']) player2.moveRight();
    if (keys['ArrowUp']) player2.jump();
    player2.duck(keys['ArrowDown']);

    // Update players
    player1.update();
    player2.update();
}
```

**Step 4: Test in browser**

Press SPACE, then test:
- Player 1: WASD to move/jump/duck
- Player 2: Arrow keys to move/jump/duck
- Players cannot cross center line
- Jumping has gravity
- Ducking makes the figure shorter

**Step 5: Commit**

```bash
cd ~/Documents/playground
git add dodgeball/game.js
git commit -m "feat: add player movement with jumping, ducking, and boundary limits"
```

---

## Task 5: Ball Throwing

**Files:**
- Modify: `dodgeball/game.js`

**Step 1: Add Ball class**

Add after the Player class:

```javascript
// Ball class
class Ball {
    constructor(x, y, velocityX, owner) {
        this.x = x;
        this.y = y;
        this.radius = 8;
        this.velocityX = velocityX;
        this.velocityY = 0;
        this.owner = owner; // 'left' or 'right' - who threw it
        this.active = true;
    }

    update() {
        this.x += this.velocityX;

        // Deactivate if off screen
        if (this.x < -this.radius || this.x > CANVAS_WIDTH + this.radius) {
            this.active = false;
        }
    }

    draw() {
        ctx.fillStyle = '#FFFF00';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.stroke();
    }
}

// Balls array
let balls = [];
const BALL_SPEED = 10;
```

**Step 2: Add throw method to Player class**

Add to the Player class:

```javascript
    throw() {
        if (!this.hasBall) return null;

        this.hasBall = false;
        const armY = this.y - this.height + 10 + 5; // headRadius + 5
        const direction = this.facingRight ? 1 : -1;
        const ballX = this.x + (direction * 23); // armLength + ball radius

        return new Ball(ballX, armY, direction * BALL_SPEED, this.side);
    }
```

**Step 3: Add ball respawn timer tracking**

Add after the balls array:

```javascript
// Ball respawn tracking
let player1RespawnTimer = 0;
let player2RespawnTimer = 0;
const RESPAWN_TIME = 90; // frames (about 1.5 seconds at 60fps)
```

**Step 4: Update the main update function for throwing and ball updates**

Update the update function:

```javascript
function update() {
    if (gameState !== 'playing') return;

    // Player 1 controls (WASD + F)
    if (keys['a'] || keys['A']) player1.moveLeft();
    if (keys['d'] || keys['D']) player1.moveRight();
    if (keys['w'] || keys['W']) player1.jump();
    player1.duck(keys['s'] || keys['S']);

    // Player 1 throw
    if (keys['f'] || keys['F']) {
        const ball = player1.throw();
        if (ball) {
            balls.push(ball);
            player1RespawnTimer = RESPAWN_TIME;
        }
        keys['f'] = false;
        keys['F'] = false;
    }

    // Player 2 controls (Arrows + /)
    if (keys['ArrowLeft']) player2.moveLeft();
    if (keys['ArrowRight']) player2.moveRight();
    if (keys['ArrowUp']) player2.jump();
    player2.duck(keys['ArrowDown']);

    // Player 2 throw
    if (keys['/']) {
        const ball = player2.throw();
        if (ball) {
            balls.push(ball);
            player2RespawnTimer = RESPAWN_TIME;
        }
        keys['/'] = false;
    }

    // Update players
    player1.update();
    player2.update();

    // Update balls
    balls.forEach(ball => ball.update());
    balls = balls.filter(ball => ball.active);

    // Ball respawn
    if (!player1.hasBall) {
        player1RespawnTimer--;
        if (player1RespawnTimer <= 0) {
            player1.hasBall = true;
        }
    }
    if (!player2.hasBall) {
        player2RespawnTimer--;
        if (player2RespawnTimer <= 0) {
            player2.hasBall = true;
        }
    }
}
```

**Step 5: Update render to draw balls**

Add to the render function, after drawing players:

```javascript
        // Draw balls
        balls.forEach(ball => ball.draw());
```

**Step 6: Test in browser**

- Press F (Player 1) or / (Player 2) to throw
- Ball flies across screen
- Ball in hand disappears when thrown
- Ball respawns after ~1.5 seconds

**Step 7: Commit**

```bash
cd ~/Documents/playground
git add dodgeball/game.js
git commit -m "feat: add ball throwing with respawn mechanic"
```

---

## Task 6: Hit Detection and Lives

**Files:**
- Modify: `dodgeball/game.js`

**Step 1: Add collision detection function**

Add after the Ball class:

```javascript
function checkBallPlayerCollision(ball, player) {
    // Don't hit the player who threw it
    if (ball.owner === player.side) return false;

    // Don't hit invincible players
    if (player.isInvincible) return false;

    // Simple box collision
    const playerLeft = player.x - 15;
    const playerRight = player.x + 15;
    const playerTop = player.y - player.height;
    const playerBottom = player.y;

    const ballLeft = ball.x - ball.radius;
    const ballRight = ball.x + ball.radius;
    const ballTop = ball.y - ball.radius;
    const ballBottom = ball.y + ball.radius;

    return ballRight > playerLeft &&
           ballLeft < playerRight &&
           ballBottom > playerTop &&
           ballTop < playerBottom;
}
```

**Step 2: Add hit handling to update function**

Add to the update function, after updating balls:

```javascript
    // Check for hits
    balls.forEach(ball => {
        if (ball.active && checkBallPlayerCollision(ball, player1)) {
            ball.active = false;
            player1.lives--;
            player1.isInvincible = true;
            player1.invincibleTimer = 120; // 2 seconds at 60fps
        }
        if (ball.active && checkBallPlayerCollision(ball, player2)) {
            ball.active = false;
            player2.lives--;
            player2.isInvincible = true;
            player2.invincibleTimer = 120;
        }
    });

    // Check for game over
    if (player1.lives <= 0 || player2.lives <= 0) {
        gameState = 'gameover';
    }
```

**Step 3: Add lives display to render**

Add to render function, in the playing/gameover section:

```javascript
        // Draw lives
        ctx.font = '20px Arial';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#0000FF';
        ctx.fillText('P1: ' + '❤️'.repeat(player1.lives), 10, 30);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#FF0000';
        ctx.fillText('P2: ' + '❤️'.repeat(player2.lives), CANVAS_WIDTH - 10, 30);
```

**Step 4: Add game over display**

Add to render function, after drawing lives:

```javascript
        if (gameState === 'gameover') {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

            ctx.fillStyle = '#FFFFFF';
            ctx.font = '48px Arial';
            ctx.textAlign = 'center';
            const winner = player1.lives > 0 ? 'Player 1' : 'Player 2';
            ctx.fillText(winner + ' Wins!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
            ctx.font = '24px Arial';
            ctx.fillText('Press SPACE to play again', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 50);
        }
```

**Step 5: Update resetGame function**

Replace the resetGame function:

```javascript
function resetGame() {
    gameState = 'playing';
    player1 = new Player(150, 'left');
    player2 = new Player(650, 'right');
    balls = [];
    player1RespawnTimer = 0;
    player2RespawnTimer = 0;
}
```

**Step 6: Test in browser**

- Throw balls and hit the other player
- Lives decrease, player blinks when hit
- Can't be hit again while blinking
- Game ends when a player loses all lives
- SPACE restarts the game

**Step 7: Commit**

```bash
cd ~/Documents/playground
git add dodgeball/game.js
git commit -m "feat: add hit detection, lives system, and game over screen"
```

---

## Task 7: Control Instructions on Title Screen

**Files:**
- Modify: `dodgeball/game.js`

**Step 1: Update title screen rendering**

Replace the title screen rendering section in render():

```javascript
    if (gameState === 'title') {
        ctx.fillStyle = '#000000';
        ctx.font = '48px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('DODGEBALL', CANVAS_WIDTH / 2, 80);

        ctx.font = '18px Arial';
        ctx.textAlign = 'left';

        // Player 1 controls
        ctx.fillStyle = '#0000FF';
        ctx.fillText('Player 1 (Blue)', 50, 150);
        ctx.fillStyle = '#000000';
        ctx.fillText('Move: A / D', 50, 180);
        ctx.fillText('Jump: W', 50, 205);
        ctx.fillText('Duck: S', 50, 230);
        ctx.fillText('Throw: F', 50, 255);

        // Player 2 controls
        ctx.textAlign = 'right';
        ctx.fillStyle = '#FF0000';
        ctx.fillText('Player 2 (Red)', CANVAS_WIDTH - 50, 150);
        ctx.fillStyle = '#000000';
        ctx.fillText('Move: ← / →', CANVAS_WIDTH - 50, 180);
        ctx.fillText('Jump: ↑', CANVAS_WIDTH - 50, 205);
        ctx.fillText('Duck: ↓', CANVAS_WIDTH - 50, 230);
        ctx.fillText('Throw: /', CANVAS_WIDTH - 50, 255);

        ctx.textAlign = 'center';
        ctx.font = '24px Arial';
        ctx.fillText('Press SPACE to start', CANVAS_WIDTH / 2, 330);
    }
```

**Step 2: Test in browser**

Title screen should show control instructions for both players.

**Step 3: Commit**

```bash
cd ~/Documents/playground
git add dodgeball/game.js
git commit -m "feat: add control instructions to title screen"
```

---

## Task 8: Final Polish and Testing

**Files:**
- Modify: `dodgeball/game.js`

**Step 1: Add visual feedback for throwing**

Update the Player's throw method to add a brief animation state:

```javascript
    throw() {
        if (!this.hasBall) return null;

        this.hasBall = false;
        this.throwAnimation = 10; // frames of throw animation
        const armY = this.y - this.height + 10 + 5;
        const direction = this.facingRight ? 1 : -1;
        const ballX = this.x + (direction * 23);

        return new Ball(ballX, armY, direction * BALL_SPEED, this.side);
    }
```

Add to Player's update method:

```javascript
        // Update throw animation
        if (this.throwAnimation > 0) {
            this.throwAnimation--;
        }
```

Add `this.throwAnimation = 0;` to the Player constructor.

**Step 2: Update arm drawing for throw animation**

Replace the arm drawing section in Player's draw method:

```javascript
        // Arms
        const armY = bodyStartY + 5;
        const armLength = 15;

        if (this.throwAnimation > 0) {
            // Throwing pose - arm extended forward
            const direction = this.facingRight ? 1 : -1;
            ctx.beginPath();
            ctx.moveTo(this.x, armY);
            ctx.lineTo(this.x + (direction * armLength * 1.5), armY - 5);
            ctx.moveTo(this.x, armY);
            ctx.lineTo(this.x - (direction * armLength * 0.5), armY + 5);
            ctx.stroke();
        } else {
            // Normal arms
            ctx.beginPath();
            ctx.moveTo(this.x - armLength, armY);
            ctx.lineTo(this.x + armLength, armY);
            ctx.stroke();
        }
```

**Step 3: Full playtest**

Test the complete game:
- [ ] Title screen shows with instructions
- [ ] SPACE starts the game
- [ ] Both players can move, jump, duck
- [ ] Players cannot cross center line
- [ ] Throwing works with brief animation
- [ ] Balls respawn after throwing
- [ ] Hits register and reduce lives
- [ ] Invincibility works after being hit
- [ ] Game over shows winner
- [ ] SPACE restarts the game

**Step 4: Commit**

```bash
cd ~/Documents/playground
git add dodgeball/game.js
git commit -m "feat: add throw animation polish"
```

**Step 5: Push to remote**

```bash
cd ~/Documents/playground
git push origin main
```

---

## Summary

After completing all tasks, you will have a fully functional local two-player dodgeball game with:

- Stick figure players (blue vs red)
- Full movement: walk, jump, duck
- Ball throwing with respawn
- Lives system with invincibility frames
- Title screen with controls
- Game over screen with restart

**Next Phase (Future):** Add networking with Node.js and WebSockets for online multiplayer.
