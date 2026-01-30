# Hit Me - Game Design

## Overview

A 2D side-view dodgeball game called "Hit Me" for web browsers where two players compete on the same keyboard. Each player has 3 lives. Get hit by a ball, lose a life. Last player standing wins.

## Technology

- **HTML5 Canvas** - For drawing game graphics
- **Vanilla JavaScript** - No frameworks, keeps it simple and educational
- **No build tools** - Just HTML, CSS, and JS files you can open in a browser

## Visual Style

- **Players:** Stick figures (circle head, lines for body/arms/legs)
- **Court:** Side-view with center dividing line
- **Player 1** on the left, **Player 2** on the right

### Stick Figure Animations

- **Idle:** Standing pose
- **Moving:** Legs alternate to show walking/running
- **Throwing:** Arm winds back then extends forward
- **Getting hit:** Stagger or knockback animation

## Controls

### Player 1 (Left Side)

| Key | Action |
|-----|--------|
| W | Jump |
| A | Move left |
| D | Move right |
| S | Duck/crouch |
| F | Throw ball |

### Player 2 (Right Side)

| Key | Action |
|-----|--------|
| Arrow Up | Jump |
| Arrow Left | Move left |
| Arrow Right | Move right |
| Arrow Down | Duck/crouch |
| / (slash) | Throw ball |

## Core Mechanics

- Players cannot cross the center line
- Each side has 1-2 balls that respawn after being thrown
- Balls travel in a straight line (arc/gravity can be added later)
- Jumping and ducking allow dodging incoming balls
- Getting hit while holding a ball still costs a life (no blocking)
- Brief invincibility period (1-2 seconds) after getting hit

## Game States

1. **Title Screen** - "Press SPACE to start" with control instructions
2. **Playing** - Main game, both players active
3. **Round Over** - One player lost all lives, show winner, option to rematch

## UI Elements

- Player 1 lives displayed on left side (3 hearts/icons)
- Player 2 lives displayed on right side (3 hearts/icons)
- Center line clearly visible (dashed or solid)

## Visual Feedback

- **Hit:** Screen flash or player blinks red
- **Throwing:** Ball launches from hand position
- **Life lost:** Icon disappears with animation

## Project Structure

```
dodgeball/
├── index.html      (page structure, loads the game)
├── style.css       (minimal styling, canvas centering)
└── game.js         (all game logic)
```

## Phases

### Phase 1: Local Two-Player (Current)

Build a fully functional local multiplayer game.

### Phase 2: Online Multiplayer (Future)

- Node.js server
- WebSocket connections for real-time play
- Player position and ball state synchronization
- Join/disconnect handling

## Audio (Future Enhancement)

- Throw sound
- Hit sound
- Win fanfare

Audio will be added after core gameplay is solid.
