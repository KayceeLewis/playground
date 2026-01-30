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
const POWERUP_TIME = 300; // 5 seconds at 60fps = 300 ticks to get powerup
const POWERUP_BALL_SIZE = 16; // Double the normal size of 8

export class Game {
    constructor(room) {
        this.room = room;
        const level = room.level || 1;
        const numAI = room.isSinglePlayer ? level : 1;
        this.lastBroadcast = 0;
        this.broadcastInterval = 33; // Send updates every 33ms (30/sec) for smoother multiplayer

        this.state = {
            gameState: 'playing',
            level: level,
            players: {
                player1: this.createPlayer(150, 'left')
            },
            aiPlayers: [], // Array of AI opponents for level system
            balls: [],
            respawnTimers: { player1: 0 }
        };

        // Create AI opponents based on level
        if (room.isSinglePlayer) {
            this.createAIPlayers(numAI);
        } else {
            // Standard 2-player mode
            this.state.players.player2 = this.createPlayer(650, 'right');
            this.state.respawnTimers.player2 = 0;
        }

        this.tickInterval = null;
    }

    createPlayer(x, side, id = null) {
        return {
            id: id,
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
            throwAnimation: 0,
            // Power-up: bigger ball after avoiding hits
            noHitTimer: 0,
            hasPowerup: false
        };
    }

    createAIPlayers(count) {
        // Position AI players evenly across the right side
        const rightStart = CANVAS_WIDTH / 2 + 50;
        const rightEnd = CANVAS_WIDTH - 50;
        const spacing = (rightEnd - rightStart) / Math.max(1, count);

        for (let i = 0; i < count; i++) {
            const x = rightStart + spacing * (i + 0.5);
            const ai = this.createPlayer(x, 'right', `ai${i + 1}`);
            ai.isAI = true;
            this.state.aiPlayers.push(ai);
            this.state.respawnTimers[`ai${i + 1}`] = 0;
        }
    }

    start() {
        this.startTime = Date.now(); // Track when game started for reconnection grace period
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

        // Process inputs for player1
        this.processPlayerInput('player1');

        // Process player2 or AI players
        if (this.room.isSinglePlayer) {
            for (const ai of this.state.aiPlayers) {
                this.processAIPlayerInput(ai);
            }
        } else {
            this.processPlayerInput('player2');
        }

        // Update player1
        this.updatePlayer('player1');

        // Update player2 or AI players
        if (this.room.isSinglePlayer) {
            for (const ai of this.state.aiPlayers) {
                this.updateAIPlayer(ai);
            }
        } else {
            this.updatePlayer('player2');
        }

        // Update balls
        this.updateBalls();

        // Check collisions
        this.checkCollisions();

        // Update respawn timers
        this.updateRespawnTimers();

        // Check game over
        this.checkGameOver();

        // Broadcast state to clients (throttled to 20/sec for network efficiency)
        const now = Date.now();
        if (now - this.lastBroadcast >= this.broadcastInterval) {
            this.lastBroadcast = now;
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

        // Update power-up timer (only for human players)
        const roomPlayer = this.room.players[playerNumber];
        if (roomPlayer && !roomPlayer.isAI) {
            player.noHitTimer++;
            if (player.noHitTimer >= POWERUP_TIME && !player.hasPowerup) {
                player.hasPowerup = true;
            }
        }
    }

    processAIPlayerInput(ai) {
        if (ai.lives <= 0) return;

        const input = this.generateAIInputForPlayer(ai);

        // Apply movement (AI stays on right side)
        if (input.left) {
            if (ai.x > CANVAS_WIDTH / 2 + 30) {
                ai.x -= PLAYER_SPEED;
            }
            ai.facingRight = false;
        }
        if (input.right) {
            if (ai.x < CANVAS_WIDTH - 30) {
                ai.x += PLAYER_SPEED;
            }
            ai.facingRight = true;
        }
        if (input.jump && !ai.isJumping) {
            ai.velocityY = JUMP_FORCE;
            ai.isJumping = true;
        }
        ai.isDucking = !!input.duck;

        // Handle throw
        if (input.throw && ai.hasBall) {
            this.throwBallFromAI(ai);
        }
    }

    updateAIPlayer(ai) {
        if (ai.lives <= 0) return;

        // Apply gravity
        ai.velocityY += GRAVITY;
        ai.y += ai.velocityY;

        // Ground collision
        if (ai.y >= GROUND_Y) {
            ai.y = GROUND_Y;
            ai.velocityY = 0;
            ai.isJumping = false;
        }

        // Update invincibility
        if (ai.isInvincible) {
            ai.invincibleTimer--;
            if (ai.invincibleTimer <= 0) {
                ai.isInvincible = false;
            }
        }

        // Update throw animation
        if (ai.throwAnimation > 0) {
            ai.throwAnimation--;
        }
    }

    throwBallFromAI(ai) {
        if (!ai.hasBall) return;

        ai.hasBall = false;
        ai.throwAnimation = 10;
        this.state.respawnTimers[ai.id] = RESPAWN_TIME;

        const height = ai.isDucking ? 35 : 60;
        const armY = ai.y - height + 15;
        const direction = ai.facingRight ? 1 : -1;
        const ballX = ai.x + (direction * 23);

        this.state.balls.push({
            x: ballX,
            y: armY,
            velocityX: direction * BALL_SPEED,
            owner: ai.side,
            active: true
        });
    }

    generateAIInputForPlayer(ai) {
        const player1 = this.state.players.player1;
        const input = { left: false, right: false, jump: false, duck: false, throw: false };

        // Find incoming balls - AI only reacts when ball is closer (easier to hit)
        const incomingBall = this.state.balls.find(ball => {
            if (ball.owner === ai.side) return false;
            const movingTowardAI = ball.velocityX > 0; // Moving right toward AI
            const closeEnough = Math.abs(ball.x - ai.x) < 120; // Reduced from 200 - slower reaction
            return movingTowardAI && closeEnough;
        });

        if (incomingBall) {
            // AI has slower reactions - only dodge 60% of the time
            if (Math.random() < 0.6) {
                // Dodge the ball
                const aiHeight = ai.isDucking ? 35 : 60;
                const aiTop = ai.y - aiHeight;
                const aiBottom = ai.y;
                const ballY = incomingBall.y;

                if (ballY < aiTop + 20) {
                    input.duck = true;
                } else if (ballY > aiBottom - 30 && !ai.isJumping) {
                    input.jump = true;
                } else {
                    // Move away from ball path
                    input.right = Math.random() < 0.5;
                    input.left = !input.right;
                }
            }
        } else if (ai.hasBall) {
            // Has ball, consider throwing - reduced frequency from 0.02 to 0.01
            if (Math.random() < 0.01) {
                input.throw = true;
                // Face player1 (left side)
                ai.facingRight = false;
            }
            // Move around a bit - less frequently
            if (Math.random() < 0.05) {
                input.left = Math.random() < 0.5;
                input.right = !input.left;
            }
        } else {
            // No ball, move around randomly - less frequently
            if (Math.random() < 0.03) {
                input.left = Math.random() < 0.5;
                input.right = !input.left;
            }
        }

        return input;
    }

    throwBall(playerNumber) {
        const player = this.state.players[playerNumber];
        if (!player.hasBall) return;

        // Check if player has power-up for bigger ball
        const hasPowerup = player.hasPowerup;
        const ballSize = hasPowerup ? POWERUP_BALL_SIZE : 8;

        // Use the power-up (one-time use)
        if (hasPowerup) {
            player.hasPowerup = false;
            player.noHitTimer = 0;
        }

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
            active: true,
            size: ballSize,
            isPowered: hasPowerup
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

            // Check collision with player1
            const player1 = this.state.players.player1;
            if (ball.owner !== player1.side && !player1.isInvincible) {
                if (this.checkBallPlayerCollision(ball, player1, ball.size || 8)) {
                    ball.active = false;
                    player1.lives--;
                    player1.isInvincible = true;
                    player1.invincibleTimer = INVINCIBLE_TIME;
                    // Reset power-up on hit
                    player1.noHitTimer = 0;
                    player1.hasPowerup = false;
                    continue;
                }
            }

            // Check collision with player2 or AI players
            if (this.room.isSinglePlayer) {
                for (const ai of this.state.aiPlayers) {
                    if (ai.lives <= 0) continue;
                    if (ball.owner === ai.side) continue;
                    if (ai.isInvincible) continue;

                    if (this.checkBallPlayerCollision(ball, ai, ball.size || 8)) {
                        ball.active = false;
                        ai.lives--;
                        ai.isInvincible = true;
                        ai.invincibleTimer = INVINCIBLE_TIME;
                        break;
                    }
                }
            } else {
                const player2 = this.state.players.player2;
                if (player2 && ball.owner !== player2.side && !player2.isInvincible) {
                    if (this.checkBallPlayerCollision(ball, player2, ball.size || 8)) {
                        ball.active = false;
                        player2.lives--;
                        player2.isInvincible = true;
                        player2.invincibleTimer = INVINCIBLE_TIME;
                        // Reset power-up on hit
                        player2.noHitTimer = 0;
                        player2.hasPowerup = false;
                    }
                }
            }
        }
    }

    checkBallPlayerCollision(ball, player, ballSize = 8) {
        const height = player.isDucking ? 35 : 60;
        const playerLeft = player.x - 15;
        const playerRight = player.x + 15;
        const playerTop = player.y - height;
        const playerBottom = player.y;

        const ballLeft = ball.x - ballSize;
        const ballRight = ball.x + ballSize;
        const ballTop = ball.y - ballSize;
        const ballBottom = ball.y + ballSize;

        return ballRight > playerLeft &&
               ballLeft < playerRight &&
               ballBottom > playerTop &&
               ballTop < playerBottom;
    }

    updateRespawnTimers() {
        // Player 1
        const player1 = this.state.players.player1;
        if (!player1.hasBall) {
            this.state.respawnTimers.player1--;
            if (this.state.respawnTimers.player1 <= 0) {
                player1.hasBall = true;
            }
        }

        // Player 2 or AI players
        if (this.room.isSinglePlayer) {
            for (const ai of this.state.aiPlayers) {
                if (ai.lives <= 0) continue;
                if (!ai.hasBall) {
                    this.state.respawnTimers[ai.id]--;
                    if (this.state.respawnTimers[ai.id] <= 0) {
                        ai.hasBall = true;
                    }
                }
            }
        } else if (this.state.players.player2) {
            const player2 = this.state.players.player2;
            if (!player2.hasBall) {
                this.state.respawnTimers.player2--;
                if (this.state.respawnTimers.player2 <= 0) {
                    player2.hasBall = true;
                }
            }
        }
    }

    checkGameOver() {
        const p1Lives = this.state.players.player1.lives;

        if (this.room.isSinglePlayer) {
            // Check if all AI players are defeated
            const allAIDefeated = this.state.aiPlayers.every(ai => ai.lives <= 0);

            if (p1Lives <= 0) {
                this.state.gameState = 'gameover';
                this.state.winner = 'ai';
                this.room.state = 'gameover'; // Sync room state for rematch handling
                this.stop();
                this.broadcastState();
            } else if (allAIDefeated) {
                this.state.gameState = 'levelcomplete';
                this.state.winner = 'player1';
                this.room.state = 'levelcomplete'; // Sync room state
                this.stop();
                this.broadcastState();
            }
        } else {
            const p2Lives = this.state.players.player2?.lives || 0;

            if (p1Lives <= 0 || p2Lives <= 0) {
                this.state.gameState = 'gameover';
                this.state.winner = p1Lives > 0 ? 'player1' : 'player2';
                this.room.state = 'gameover'; // Sync room state for rematch handling
                this.stop();
                this.broadcastState();
            }
        }
    }

    generateAIInput(playerNumber) {
        const ai = this.state.players[playerNumber];
        const opponent = this.state.players[playerNumber === 'player1' ? 'player2' : 'player1'];
        const input = { left: false, right: false, jump: false, duck: false, throw: false };

        // Find incoming balls - AI only reacts when ball is closer (easier to hit)
        const incomingBall = this.state.balls.find(ball => {
            if (ball.owner === ai.side) return false;
            const movingTowardAI = (ai.side === 'left' && ball.velocityX < 0) ||
                                   (ai.side === 'right' && ball.velocityX > 0);
            const closeEnough = Math.abs(ball.x - ai.x) < 120; // Reduced from 200
            return movingTowardAI && closeEnough;
        });

        if (incomingBall) {
            // AI has slower reactions - only dodge 60% of the time
            if (Math.random() < 0.6) {
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
            }
        } else if (ai.hasBall) {
            // Has ball, consider throwing - reduced frequency
            if (Math.random() < 0.01) {
                input.throw = true;
            }
            // Face opponent - less movement
            if (ai.side === 'left') {
                input.right = Math.random() < 0.05;
            } else {
                input.left = Math.random() < 0.05;
            }
        } else {
            // Move around randomly - less frequently
            if (Math.random() < 0.03) {
                input.left = Math.random() < 0.5;
                input.right = !input.left;
            }
        }

        return input;
    }

    broadcastState() {
        const player1 = this.state.players.player1;
        const stateToSend = {
            type: 'state',
            gameState: this.state.gameState,
            level: this.state.level,
            balls: this.state.balls,
            winner: this.state.winner,
            players: {
                player1: {
                    ...player1,
                    isAI: this.room.players.player1?.isAI || false,
                    powerupProgress: Math.min(100, Math.floor((player1.noHitTimer / POWERUP_TIME) * 100)),
                    hasPowerup: player1.hasPowerup
                }
            }
        };

        if (this.room.isSinglePlayer) {
            // Send AI players array
            stateToSend.aiPlayers = this.state.aiPlayers.map(ai => ({
                ...ai,
                isAI: true
            }));
        } else if (this.state.players.player2) {
            const player2 = this.state.players.player2;
            stateToSend.players.player2 = {
                ...player2,
                isAI: this.room.players.player2?.isAI || false,
                powerupProgress: Math.min(100, Math.floor((player2.noHitTimer / POWERUP_TIME) * 100)),
                hasPowerup: player2.hasPowerup
            };
        }

        this.room.broadcast(stateToSend);
    }

    reset() {
        const level = this.room.level || 1;
        const numAI = this.room.isSinglePlayer ? level : 1;

        this.state = {
            gameState: 'playing',
            level: level,
            players: {
                player1: this.createPlayer(150, 'left')
            },
            aiPlayers: [],
            balls: [],
            respawnTimers: { player1: 0 }
        };

        if (this.room.isSinglePlayer) {
            this.createAIPlayers(numAI);
        } else {
            this.state.players.player2 = this.createPlayer(650, 'right');
            this.state.respawnTimers.player2 = 0;
        }
    }
}
