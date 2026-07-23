import express, { type Express } from 'express';
import cors from 'cors';
import pinoHttp from 'pino-http';
import session from 'express-session';
import connectPg from 'connect-pg-simple';
import rateLimit from 'express-rate-limit';
import { pool } from '@workspace/db';
import router from './routes/index.js';
import { logger } from './lib/logger.js';

const PgStore = connectPg(session);

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split('?')[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

// Trust first proxy (Replit reverse proxy / Vite dev proxy)
app.set('trust proxy', 1);

app.use(cors({
  origin: true,      // reflect request origin
  credentials: true, // allow cookies
}));

// Capture the raw request body before JSON parsing so the Monnify webhook
// handler can verify HMAC-SHA512 signatures against the exact original bytes.
app.use(express.json({
  verify: (req: express.Request & { rawBody?: string }, _res, buf) => {
    req.rawBody = buf.toString('utf8');
  },
}));
app.use(express.urlencoded({ extended: true }));

// ── Session ────────────────────────────────────────────────────────────────
app.use(
  session({
    store: new PgStore({
      pool,
      tableName: 'session',
      // Table is created via DB migration — createTableIfMissing is
      // unreliable in bundled (esbuild) output because connect-pg-simple
      // reads its SQL file with a relative fs path that breaks after bundling.
    }),
    secret: (() => {
      const s = process.env['SESSION_SECRET'];
      if (!s) throw new Error('SESSION_SECRET env var is required but not set.');
      return s;
    })(),
    resave: false,
    saveUninitialized: false,
    name: 'gyd_sid',
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env['NODE_ENV'] === 'production',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    },
  }),
);

// ── Rate Limiting ──────────────────────────────────────────────────────────

// Auth: strict — 10 attempts per 15 minutes per IP
app.use(
  '/api/auth',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many attempts. Please try again in 15 minutes.' },
    skip: (req) => req.method === 'GET', // only throttle mutations
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
    message: { error: 'Too many purchase requests. Please slow down.' },
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
    message: { error: 'Webhook rate limit exceeded.' },
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
    message: { error: 'Too many messages. Please slow down.' },
  }),
);

app.use('/api', router);

export default app;
