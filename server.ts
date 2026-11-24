import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, type WebSocket } from 'ws';
import { RoomManager, type ConnectedClient } from './server/gameEngine.ts';
import {
  DEFAULT_BOT_COUNT,
  MAX_HUMANS_PER_ROOM,
  WORLD_RADIUS,
  type ClientMessage,
  type ServerMessage,
} from './src/shared/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

async function startServer() {
  const app = express();
  app.use(express.json());

  const roomManager = new RoomManager();

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/rooms', (_req, res) => {
    res.json({
      rooms: roomManager.listPublicRooms(),
      maxHumans: MAX_HUMANS_PER_ROOM,
    });
  });

  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  let nextClientSeq = 1;
  const clientsByWs = new Map<WebSocket, ConnectedClient>();

  function send(ws: WebSocket, msg: ServerMessage) {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(msg));
    }
  }

  function leaveCurrentRoom(client: ConnectedClient) {
    if (!client.roomCode) return;
    const oldRoom = roomManager.getRoom(client.roomCode);
    if (oldRoom) {
      oldRoom.removeClient(client.id);
    }
    client.roomCode = null;
    client.snakeId = null;
  }

  wss.on('connection', (ws) => {
    const client: ConnectedClient = {
      id: `p_${nextClientSeq++}_${Math.random().toString(36).slice(2, 6)}`,
      ws,
      roomCode: null,
      snakeId: null,
      spectateX: 0,
      spectateY: 0,
      lastDeathCamX: 0,
      lastDeathCamY: 0,
      spectateAngle: 0,
    };
    clientsByWs.set(ws, client);

    ws.on('message', (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(String(raw)) as ClientMessage;
      } catch {
        return;
      }
      if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;

      if (msg.type === 'ping') {
        send(ws, { type: 'pong', t: typeof msg.t === 'number' ? msg.t : Date.now() });
        return;
      }

      if (msg.type === 'join_room') {
        leaveCurrentRoom(client);

        let targetRoom;
        if (msg.mode === 'create') {
          const bots =
            typeof msg.botCount === 'number' && Number.isFinite(msg.botCount)
              ? Math.max(0, Math.min(34, Math.floor(msg.botCount)))
              : DEFAULT_BOT_COUNT;
          targetRoom = roomManager.createRoom(true, bots);
        } else if (msg.mode === 'join' && typeof msg.roomCode === 'string') {
          const code = msg.roomCode.trim().toUpperCase().slice(0, 6);
          targetRoom = roomManager.getRoom(code);
          if (!targetRoom) {
            send(ws, { type: 'room_error', message: `Room "${code}" not found.` });
            return;
          }
          if (targetRoom.humanCount >= MAX_HUMANS_PER_ROOM) {
            send(ws, {
              type: 'room_error',
              message: `Room "${code}" is full (${MAX_HUMANS_PER_ROOM}/${MAX_HUMANS_PER_ROOM} players).`,
            });
            return;
          }
        } else {
          targetRoom = roomManager.findOrCreatePublicRoom();
        }

        const joined = targetRoom.addClient(client);
        if (!joined) {
          send(ws, {
            type: 'room_error',
            message: `Room "${targetRoom.code}" is full (${MAX_HUMANS_PER_ROOM}/${MAX_HUMANS_PER_ROOM} players).`,
          });
          return;
        }

        send(ws, {
          type: 'room_joined',
          roomCode: targetRoom.code,
          playerId: client.id,
          maxHumans: MAX_HUMANS_PER_ROOM,
          botCount: targetRoom.targetBotCount,
          isPrivate: targetRoom.isPrivate,
          worldRadius: WORLD_RADIUS,
        });
        return;
      }

      if (msg.type === 'spawn') {
        if (!client.roomCode) {
          const fallback = roomManager.findOrCreatePublicRoom();
          fallback.addClient(client);
          send(ws, {
            type: 'room_joined',
            roomCode: fallback.code,
            playerId: client.id,
            maxHumans: MAX_HUMANS_PER_ROOM,
            botCount: fallback.targetBotCount,
            isPrivate: fallback.isPrivate,
            worldRadius: WORLD_RADIUS,
          });
        }
        const room = client.roomCode ? roomManager.getRoom(client.roomCode) : undefined;
        if (!room) return;
        const snake = room.spawnHuman(client.id, msg.name, msg.skinId, msg.customColors);
        if (snake) {
          send(ws, { type: 'spawned', snakeId: snake.id });
        }
        return;
      }

      if (msg.type === 'input') {
        if (!client.roomCode) return;
        const room = roomManager.getRoom(client.roomCode);
        if (!room) return;
        room.handleInput(client.id, msg.angle, Boolean(msg.boosting));
      }
    });

    const cleanup = () => {
      leaveCurrentRoom(client);
      clientsByWs.delete(ws);
    };

    ws.on('close', cleanup);
    ws.on('error', cleanup);
  });

  if (IS_PROD) {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Slither Arena server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
