import express, {
  type Express,
} from 'express';

import cors from 'cors';

import pinoHttp from 'pino-http';

import rateLimit from 'express-rate-limit';

import router from './routes/index.js';

import {
  logger,
} from './lib/logger.js';

import {
  sessionMiddleware,
} from './lib/session-store.js';

import {
  attachFrontend,
} from './lib/frontend.js';

const app: Express =
  express();

app.use(
  pinoHttp({
    logger,

    serializers: {
      req(req) {
        return {
          id:
            req.id,

          method:
            req.method,

          url:
            req.url?.split(
              '?',
            )[0],
        };
      },

      res(res) {
        return {
          statusCode:
            res.statusCode,
        };
      },
    },
  }),
);

// Trust the first reverse-proxy hop.
// Required when the API is running behind Render's proxy.
app.set(
  'trust proxy',
  1,
);

// ─────────────────────────────────────────────────────────────────────────────
// CORS
// ─────────────────────────────────────────────────────────────────────────────

const rawOrigins =
  process.env[
    'CORS_ORIGINS'
  ];

const configuredOrigins =
  rawOrigins
    ? rawOrigins
        .split(',')
        .map((origin) =>
          origin.trim(),
        )
        .filter(Boolean)
    : [];

/*
 * Capacitor Android normally serves the WebView application from
 * a localhost-style origin.
 *
 * These are intentionally allowed in addition to the normal
 * browser origins configured through CORS_ORIGINS.
 */
const capacitorOrigins = [
  'https://localhost',
  'capacitor://localhost',
];

const allowedOrigins =
  Array.from(
    new Set([
      ...configuredOrigins,
      ...capacitorOrigins,
    ]),
  );

const isProduction =
  process.env['NODE_ENV'] ===
  'production';

if (
  isProduction &&
  configuredOrigins.length === 0
) {
  logger.warn(
    'CORS_ORIGINS is not configured. Capacitor localhost origins are still allowed, but browser production origins must be configured.',
  );
}

app.use(
  cors({
    origin:
      isProduction
        ? (
            origin,
            callback,
          ) => {
            /*
             * Requests without an Origin header include
             * server-to-server requests and certain tools.
             */
            if (!origin) {
              callback(
                null,
                true,
              );

              return;
            }

            if (
              allowedOrigins.includes(
                origin,
              )
            ) {
              callback(
                null,
                true,
              );

              return;
            }

            logger.warn(
              { origin },
              'CORS: rejected request from unlisted origin',
            );

            callback(
              new Error(
                'Not allowed by CORS policy.',
              ),
            );
          }
        : true,

    /*
     * Required for Express session cookies.
     */
    credentials:
      true,
  }),
);

logger.info(
  {
    mode:
      process.env[
        'NODE_ENV'
      ],

    allowedOrigins:
      isProduction
        ? allowedOrigins
        : 'all (development)',
  },

  'CORS configured',
);

// ─────────────────────────────────────────────────────────────────────────────
// Raw body capture
// ─────────────────────────────────────────────────────────────────────────────

app.use(
  express.json({
    verify: (
      req: express.Request & {
        rawBody?: string;
      },
      _res,
      buf,
    ) => {
      req.rawBody =
        buf.toString(
          'utf8',
        );
    },
  }),
);

app.use(
  express.urlencoded({
    extended:
      true,
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// Body safety guard
// ─────────────────────────────────────────────────────────────────────────────

app.use(
  (
    req,
    _res,
    next,
  ) => {
    if (
      req.body ===
      undefined
    ) {
      req.body = {};
    }

    next();
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Session
// ─────────────────────────────────────────────────────────────────────────────

app.use(
  sessionMiddleware,
);

// ─────────────────────────────────────────────────────────────────────────────
// Rate limiting
// ─────────────────────────────────────────────────────────────────────────────

app.use(
  '/api/admin/session',
  rateLimit({
    windowMs:
      15 *
      60 *
      1000,

    max:
      5,

    standardHeaders:
      true,

    legacyHeaders:
      false,

    message: {
      error:
        'Too many admin login attempts. Please try again in 15 minutes.',
    },

    skip: (req) =>
      req.method !==
      'POST',
  }),
);

app.use(
  '/api/auth',
  rateLimit({
    windowMs:
      15 *
      60 *
      1000,

    max:
      10,

    standardHeaders:
      true,

    legacyHeaders:
      false,

    message: {
      error:
        'Too many attempts. Please try again in 15 minutes.',
    },

    skip: (req) =>
      req.method ===
      'GET',
  }),
);

app.use(
  '/api/purchase',
  rateLimit({
    windowMs:
      60 *
      1000,

    max:
      30,

    standardHeaders:
      true,

    legacyHeaders:
      false,

    message: {
      error:
        'Too many purchase requests. Please slow down.',
    },
  }),
);

app.use(
  '/api/user/check-pin',
  rateLimit({
    windowMs:
      15 *
      60 *
      1000,

    max:
      10,

    standardHeaders:
      true,

    legacyHeaders:
      false,

    message: {
      error:
        'Too many PIN attempts. Please try again in 15 minutes.',
    },
  }),
);

app.use(
  '/api/payment/monnify/webhook',
  rateLimit({
    windowMs:
      60 *
      1000,

    max:
      200,

    standardHeaders:
      true,

    legacyHeaders:
      false,

    message: {
      error:
        'Webhook rate limit exceeded.',
    },
  }),
);

app.use(
  '/api/whatsapp/webhook',
  rateLimit({
    windowMs:
      60 *
      1000,

    max:
      500,

    standardHeaders:
      true,

    legacyHeaders:
      false,
  }),
);

app.use(
  '/api/support',
  rateLimit({
    windowMs:
      60 *
      1000,

    max:
      60,

    standardHeaders:
      true,

    legacyHeaders:
      false,

    message: {
      error:
        'Too many messages. Please slow down.',
    },
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// API routes
// ─────────────────────────────────────────────────────────────────────────────

app.use(
  '/api',
  router,
);

// ─────────────────────────────────────────────────────────────────────────────
// Frontend static serving
// ─────────────────────────────────────────────────────────────────────────────

try {
  attachFrontend(
    app,
  );

  logger.info(
    'Frontend static serving attached',
  );
} catch (error) {
  logger.warn(
    {
      err:
        error,
    },

    'Could not attach frontend static assets',
  );
}

export default app;
