import express, { type Express } from 'express';
import cors from 'cors';
import pinoHttp from 'pino-http';
import rateLimit from 'express-rate-limit';
import router from './routes/index.js';
import { logger } from './lib/logger.js';
import { sessionMiddleware } from './lib/session-store.js';
import { attachFrontend } from './lib/frontend.js';

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split('?')[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Trust the first reverse proxy hop when running behind a load balancer.
app.set('trust proxy', 1);

// ── CORS ────────────────────────────────────────────────────────────
// Production MUST use an explicit allow-list.
// Development may reflect any origin for convenience.
const isProduction = process.env['NODE_ENV'] === 'production';

const rawOrigins = process.env['CORS_ORIGINS'];

const allowedOrigins = rawOrigins
  ? rawOrigins
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
  : [];

if (isProduction && allowedOrigins.length === 0) {
  logger.error(
    'CORS_ORIGINS is required in production. Refusing to start with an open CORS policy.',
  );

  throw new Error(
    'CORS_ORIGINS must be configured in production.',
  );
}

app.use(
  cors({
    origin: isProduction
      ? (origin, callback) => {
          // Requests without an Origin header are normally server-to-server
          // requests, health checks, webhooks, or other non-browser requests.
          if (!origin) {
            callback(null, true);
            return;
          }

          if (allowedOrigins.includes(origin)) {
            callback(null, true);
            return;
          }

          logger.warn(
            { origin },
            'CORS: rejected request from unlisted origin',
          );

          callback(new Error('Not allowed by CORS policy.'));
        }
      : true,

    credentials: true,
  }),
);

logger.info(
  {
    mode: process.env['NODE_ENV'],
    allowedOrigins: isProduction
      ? allowedOrigins
      : 'all (development)',
  },
  'CORS configured',
);

// ── Raw body capture for HMAC signature verification ─────────────────────────
// Monnify and WhatsApp webhooks verify signatures against the exact raw bytes.
app.use(
  express.json({
    verify: (
      req: express.Request & { rawBody?: string },
      _res,
      buf,
    ) => {
      req.rawBody = buf.toString('utf8');
    },
  }),
);

app.use(express.urlencoded({ extended: true }));

// ── Body safety guard ────────────────────────────────────────────────────────
// Requests with no Content-Type leave req.body undefined.
// Default to {} so route handlers can safely destructure request bodies.
app.use((req, _res, next) => {
  if (req.body === undefined) {
    req.body = {};
  }

  next();
});

// ── Session ───────────────────────────────────────────────────────────
// Imported from lib/session-store so Socket.io can share the same middleware.
app.use(sessionMiddleware);

// ── Rate Limiting ─────────────────────────────────────────────────────────

// Admin login: strict protection against brute-force PIN/password guessing.
// Only POST /api/admin/session is affected.
// 5 attempts per 15 minutes per IP.
app.use(
  '/api/admin/session',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error:
        'Too many admin login attempts. Please try again in 15 minutes.',
    },
    skip: (req) => req.method !== 'POST',
  }),
);

// Auth mutations: 10 attempts per 15 minutes per IP
// (login, register, forgot-pin).
app.use(
  '/api/auth',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error:
        'Too many attempts. Please try again in 15 minutes.',
    },
    skip: (req) => req.method === 'GET',
  }),
);

// Purchase: 30 requests per minute per IP.
app.use(
  '/api/purchase',
  rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error:
        'Too many purchase requests. Please slow down.',
    },
  }),
);

// Check PIN: strict — 10 per 15 minutes.
app.use(
  '/api/user/check-pin',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error:
        'Too many PIN attempts. Please try again in 15 minutes.',
    },
  }),
);

// Payment webhooks: generous for provider retries,
// while still preventing uncontrolled flooding.
app.use(
  '/api/payment/monnify/webhook',
  rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'Webhook rate limit exceeded.',
    },
  }),
);

// WhatsApp webhook: generous for Meta/provider retries.
app.use(
  '/api/whatsapp/webhook',
  rateLimit({
    windowMs: 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

// Support chat: 60 messages per minute per IP.
app.use(
  '/api/support',
  rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error:
        'Too many messages. Please slow down.',
    },
  }),
);

// ── API Routes ─────────────────────────────────────────────────────
app.use('/api', router);

// ── Frontend Static Assets ─────────────────────────────────────────
// Serves the Vite production build. Safe if frontend dist is absent:
// static middleware simply returns 404 for missing assets.
try {
  attachFrontend(app);

  logger.info('Frontend static serving attached');
} catch (error) {
  logger.warn(
    { err: error },
    'Could not attach frontend static assets',
  );
}

export default app;
