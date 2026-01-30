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
        this.level = 1; // Current level (for single player mode)
        this.isSinglePlayer = false;
    }

    addPlayer(ws) {
        // Check for empty or disconnected player1 slot
        if (!this.players.player1 || (!this.players.player1.connected && !this.players.player1.isAI)) {
            if (this.players.player1) {
                // Reconnect to existing slot
                this.players.player1.ws = ws;
                this.players.player1.connected = true;
                this.players.player1.isAI = false;
            } else {
                this.players.player1 = { ws, connected: true, isAI: false };
            }
            return 'player1';
        }
        // Check for empty or disconnected player2 slot
        if (!this.players.player2 || (!this.players.player2.connected && !this.players.player2.isAI)) {
            if (this.players.player2) {
                // Reconnect to existing slot
                this.players.player2.ws = ws;
                this.players.player2.connected = true;
                this.players.player2.isAI = false;
            } else {
                this.players.player2 = { ws, connected: true, isAI: false };
            }
            return 'player2';
        }
        return null; // Room truly full
    }

    removePlayer(playerNumber) {
        if (this.players[playerNumber]) {
            this.players[playerNumber].connected = false;
            this.players[playerNumber].ws = null;
            // AI takes over only if game is actively playing (not during countdown/waiting)
            // This allows reconnection during page navigation
            if (this.state === 'playing' && !this.players[playerNumber].isAI) {
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
        // For single-player rooms, always consider full (AI is permanent opponent)
        if (this.isSinglePlayer) {
            return true;
        }
        // For multiplayer, room is full only if both players are actively connected
        const p1Connected = this.players.player1?.connected === true;
        const p2Connected = this.players.player2?.connected === true;
        return p1Connected && p2Connected;
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
