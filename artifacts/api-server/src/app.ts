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
// Production:
//   CORS_ORIGINS must contain the exact browser origins allowed to use
//   the API, separated by commas.
//
// Development:
//   Any origin is allowed for local development convenience.
//
// Important:
//   If production is missing CORS_ORIGINS, do NOT fall back to
//   origin: true. This prevents accidentally opening the API to arbitrary
//   browser origins because of a missing deployment environment variable.
const rawOrigins = process.env['CORS_ORIGINS'];

const allowedOrigins = rawOrigins
  ? rawOrigins
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean)
  : [];

const isProduction = process.env['NODE_ENV'] === 'production';

if (isProduction && allowedOrigins.length === 0) {
  logger.error(
    'CORS_ORIGINS is not configured in production. Browser cross-origin requests will be rejected until CORS_ORIGINS is set.',
  );
}

app.use(
  cors({
    origin: isProduction
      ? (origin, callback) => {
          // Allow server-to-server requests and requests without an
          // Origin header. Browser requests must match an explicitly
          // configured origin.
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
// Requests with no Content-Type (e.g. curl with no -H) leave req.body undefined.
// Destructuring undefined throws a TypeError, so default to {} here once globally.
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

// Admin login: strict protection against brute-force PIN guessing.
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

// Auth mutations: 10 attempts per 15 minutes per IP (login, register, forgot-pin)
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

// Purchase: 30 requests per minute per IP (prevents wallet-drain scripts)
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

// Check PIN: strict — 10 per 15 min (prevent brute-force of authenticated PIN)
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

// Payment webhooks: generous — allow many calls but block flooding
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

// WhatsApp webhook: generous for Meta's delivery retries
app.use(
  '/api/whatsapp/webhook',
  rateLimit({
    windowMs: 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

// Support chat: 60 messages per minute per IP
app.use(
  '/api/support',
  rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'Too many messages. Please slow down.',
    },
  }),
);

app.use('/api', router);

// Attach frontend static assets (serves Vite production build). This is safe to
// run even if the frontend dist is absent — static middleware will simply 404
// asset requests and the app continues serving API routes.
try {
  attachFrontend(app);
  logger.info('Frontend static serving attached');
} catch (e) {
  logger.warn(
    { err: e },
    'Could not attach frontend static assets',
  );
}

export default app;
