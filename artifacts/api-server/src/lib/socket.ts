/**
 * Socket.io singleton.
 *
 * Import `io` wherever you need to emit real-time events from route handlers.
 * The Server instance is attached in index.ts after the HTTP server is created.
 */
import { Server } from 'socket.io';

let _io: Server | null = null;

export function initSocket(server: import('http').Server): Server {
  _io = new Server(server, {
    cors: {
      origin: true,
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });
  return _io;
}

export function getIo(): Server {
  if (!_io) throw new Error('Socket.io not yet initialised — call initSocket first.');
  return _io;
}

// Convenience re-export so callers can write `import { io } from '../lib/socket.js'`
export const io = {
  get instance() { return getIo(); },
  to: (room: string) => getIo().to(room),
  emit: (...args: Parameters<Server['emit']>) => (getIo() as Server).emit(...args),
};
