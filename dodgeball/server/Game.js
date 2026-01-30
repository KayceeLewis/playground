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
