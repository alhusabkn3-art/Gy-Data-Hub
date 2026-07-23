import http from 'http';
import app from './app.js';
import { initSocket } from './lib/socket.js';
import { logger } from './lib/logger.js';

const rawPort = process.env['PORT'];

if (!rawPort) {
  throw new Error('PORT environment variable is required but was not provided.');
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const httpServer = http.createServer(app);

// ── Socket.io ──────────────────────────────────────────────────────────────
const io = initSocket(httpServer);

io.use((socket, next) => {
  // Authenticate socket connections via session.
  // The express-session cookie is forwarded by the client automatically.
  // We parse the session from the upgrade request using the same session
  // middleware — for now we allow anonymous connections and authenticate
  // per-event if needed. Restrict rooms at the event level.
  next();
});

io.on('connection', (socket) => {
  logger.info({ socketId: socket.id }, 'Socket.io client connected');

  // Join a personal room keyed by userId (sent by the client after login).
  socket.on('join', (userId: string) => {
    if (typeof userId === 'string' && userId.length > 0) {
      void socket.join(`user:${userId}`);
      logger.debug({ socketId: socket.id, userId }, 'Socket joined user room');
    }
  });

  // Join an admin room (admin panel uses this for live stats / inbox updates).
  socket.on('join:admin', (adminId: string) => {
    if (typeof adminId === 'string' && adminId.length > 0) {
      void socket.join(`admin:${adminId}`);
      void socket.join('admins'); // broadcast room
      logger.debug({ socketId: socket.id, adminId }, 'Socket joined admin room');
    }
  });

  // Join a support conversation room.
  socket.on('join:conversation', (conversationId: string) => {
    if (typeof conversationId === 'string' && conversationId.length > 0) {
      void socket.join(`conversation:${conversationId}`);
    }
  });

  socket.on('disconnect', () => {
    logger.info({ socketId: socket.id }, 'Socket.io client disconnected');
  });
});

httpServer.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, 'Error listening on port');
    process.exit(1);
  }
  logger.info({ port }, 'Server listening (HTTP + Socket.io)');
});
