# Hit Me - Online Multiplayer Design (Phase 2)

## Overview

Add online multiplayer to Hit Me, allowing two players to compete over the internet. Uses a server-authoritative architecture with WebSockets for real-time communication and AI takeover when players disconnect.

## Architecture

### Server-Authoritative Model

- Node.js server runs the game simulation at 60 ticks/second
- Clients send only their inputs (move left, jump, throw, etc.)
- Server calculates all physics, collisions, and game state
- Server broadcasts authoritative game state to all clients
- Clients render what the server tells them

### Connection Flow

1. Player 1 visits site → clicks "Create Game" → gets shareable link (e.g., `/game/ABC123`)
2. Player 1 shares link with friend
3. Player 2 clicks link → joins the room
4. Server detects 2 players → starts countdown → game begins
5. Both players send inputs → server simulates → broadcasts state

## Technology

- **Server:** Node.js with Express (serves static files + handles routes)
- **Real-time:** WebSockets via `ws` library
- **Client:** Canvas game modified to send inputs and render server state

## Game State

### Server State (Authoritative)

```javascript
{
  roomId: "ABC123",
  state: "playing", // "waiting", "countdown", "playing", "gameover"
  players: {
    player1: {
      x, y, velocityY, isJumping, isDucking,
      lives, hasBall, isInvincible, invincibleTimer,
      connected: true, isAI: false
    },
    player2: {
      x, y, velocityY, isJumping, isDucking,
      lives, hasBall, isInvincible, invincibleTimer,
      connected: true, isAI: false
    }
  },
  balls: [{ x, y, velocityX, owner, active }],
  respawnTimers: { player1: 0, player2: 0 }
}
```

### Client → Server (Inputs Only)

```javascript
{ type: "input", keys: { left: false, right: true, jump: false, duck: false, throw: false } }
```

### Server → Client (State Broadcast, 20-30 times/second)

```javascript
{ type: "state", ...fullGameState }
```

## AI Takeover on Disconnect

### When a Player Disconnects

1. Server detects WebSocket close event
2. Player is marked as `connected: false, isAI: true`
3. "Player disconnected - AI taking over" message sent to remaining player
4. Server generates AI inputs for that player each tick
5. If player reconnects, they resume control immediately

### AI Behavior (Rule-Based)

```
Every tick:
1. DODGE: If a ball is coming toward me and will hit me soon:
   - If ball is high → duck
   - If ball is low → jump
   - Otherwise → move away from ball

2. ATTACK: If I have a ball and opponent is in range:
   - Face opponent
   - Throw (with slight randomness so it's not perfect)

3. POSITION: If nothing urgent:
   - Move toward comfortable distance from center line
   - Occasional random movement to seem human-like
```

### Visual Indicator

- Show "[AI]" next to player name when AI-controlled
- Lets human player know they're playing against a bot

## Project Structure

```
dodgeball/
├── server/
│   ├── index.js          # Express server + WebSocket setup
│   ├── Game.js           # Server-side game simulation
│   ├── Room.js           # Room management (create, join, tracking)
│   ├── AI.js             # AI input generation
│   └── package.json      # Node dependencies
├── public/
│   ├── index.html        # Landing page (create/join UI)
│   ├── game.html         # Game page (canvas)
│   ├── style.css         # Styles
│   └── client.js         # WebSocket, input sending, rendering
└── package.json          # Root scripts
```

## Message Protocol

### Client → Server

| Type | Payload | Description |
|------|---------|-------------|
| `join` | `{ roomId }` | Join an existing room |
| `create` | `{}` | Create a new room |
| `input` | `{ keys: {...} }` | Send current input state |
| `ready` | `{}` | Player ready for rematch |

### Server → Client

| Type | Payload | Description |
|------|---------|-------------|
| `room_created` | `{ roomId, shareUrl }` | Room created successfully |
| `player_joined` | `{ playerNumber }` | You joined as player 1 or 2 |
| `opponent_joined` | `{}` | Other player joined |
| `countdown` | `{ seconds }` | Game starting countdown |
| `state` | `{ ...gameState }` | Full game state update |
| `opponent_disconnected` | `{ aiTakeover: true }` | Opponent left, AI active |
| `opponent_reconnected` | `{}` | Opponent returned |
| `error` | `{ message }` | Error message |

## Running Locally

```bash
cd dodgeball
npm install
npm start        # Starts server on http://localhost:3000
```

Open two browser tabs to test multiplayer locally.

## Future Enhancements

- Spectator mode
- Multiple rooms visible in lobby
- Player nicknames
- Match history
- Cloud deployment (Render, Railway, Fly.io)
