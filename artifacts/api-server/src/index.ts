// artifacts/api-server/src/index.ts

import http from 'http';
import app from './app.js';
import { initSocket } from './lib/socket.js';
import { logger } from './lib/logger.js';
import {
  validateEnv,
  sessionMiddleware,
} from './lib/session-store.js';
import { db } from '@workspace/db';
import { sql } from 'drizzle-orm';
import {
  initializeDatabase,
} from './lib/database-bootstrap.js';
import {
  ensureSuperAdmin,
} from './routes/admin.js';

const rawPort =
  process.env.PORT ?? '5000';

const port = Number(rawPort);

if (
  !Number.isFinite(port) ||
  port <= 0
) {
  throw new Error(
    `Invalid PORT: "${rawPort}"`,
  );
}

try {
  await initializeDatabase();
  await ensureSuperAdmin();

  logger.info(
    'Database bootstrap and super admin initialization completed successfully',
  );
} catch (err) {
  logger.error(
    { err },
    'Database bootstrap failed',
  );
}

const httpServer =
  http.createServer(app);

const io =
  initSocket(httpServer);

io.engine.use(
  sessionMiddleware,
);

io.on(
  'connection',
  (socket) => {
    logger.info(
      {
        socketId:
          socket.id,
      },
      'Socket.io client connected',
    );

    socket.on(
      'join',
      (
        claimedUserId: string,
      ) => {
        const sess = (
          socket.request as unknown as {
            session?: {
              userId?: string;
            };
          }
        ).session;

        const authenticatedUserId =
          sess?.userId;

        if (
          !authenticatedUserId
        ) {
          logger.warn(
            {
              socketId:
                socket.id,
            },
            'Socket join rejected: no authenticated session',
          );
          return;
        }

        if (
          claimedUserId !==
          authenticatedUserId
        ) {
          logger.warn(
            {
              socketId:
                socket.id,
              claimed:
                claimedUserId,
              actual:
                authenticatedUserId,
            },
            'Socket join rejected: userId mismatch',
          );
          return;
        }

        void socket.join(
          `user:${authenticatedUserId}`,
        );
      },
    );

    socket.on(
      'join:admin',
      () => {
        const sess = (
          socket.request as unknown as {
            session?: {
              isAdmin?: boolean;
              adminId?: string;
            };
          }
        ).session;

        if (
          !sess?.isAdmin ||
          !sess.adminId
        ) {
          logger.warn(
            {
              socketId:
                socket.id,
            },
            'Admin socket join rejected',
          );
          return;
        }

        void socket.join(
          `admin:${sess.adminId}`,
        );
        void socket.join(
          'admins',
        );
      },
    );

    socket.on(
      'disconnect',
      () => {
        logger.info(
          {
            socketId:
              socket.id,
          },
          'Socket.io client disconnected',
        );
      },
    );
  },
);

const server =
  httpServer.listen(
    port,
    '0.0.0.0',
    () => {
      logger.info(
        {
          port,
        },
        'API server listening',
      );
    },
  );

process.on(
  'SIGTERM',
  () => {
    logger.info(
      'SIGTERM received, shutting down',
    );

    server.close(
      () => {
        io.close();
        logger.info(
          'HTTP server closed',
        );
        process.exit(0);
      },
    );
  },
);

process.on(
  'SIGINT',
  () => {
    logger.info(
      'SIGINT received, shutting down',
    );

    server.close(
      () => {
        io.close();
        logger.info(
          'HTTP server closed',
        );
        process.exit(0);
      },
    );
  },
);

process.on(
  'uncaughtException',
  (err) => {
    logger.error(
      { err },
      'Uncaught exception',
    );
  },
);

process.on(
  'unhandledRejection',
  (reason) => {
    logger.error(
      { reason },
      'Unhandled promise rejection',
    );
  },
);

try {
  validateEnv();
} catch (err) {
  logger.error(
    { err },
    'Environment validation failed',
  );
}
