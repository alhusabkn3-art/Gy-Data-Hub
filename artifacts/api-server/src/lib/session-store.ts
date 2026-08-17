/**
 * Shared session configuration.
 *
 * Exported so both Express (app.ts) and Socket.io (index.ts) can use
 * the same session middleware instance — this ensures Socket.io can
 * authenticate connections via the same session cookie.
 */
import session from 'express-session';
import connectPg from 'connect-pg-simple';
import { pool } from '@workspace/db';
import { logger } from './logger.js';

const PgStore = connectPg(session);

let _sessionStoreInstance: InstanceType<typeof PgStore> | undefined;
let _sessionMiddlewareInstance: ReturnType<typeof session> | undefined;
let initialized = false;

function ensureInitialized() {
  if (initialized) return;

  const secret = process.env['SESSION_SECRET'];
  if (!secret) {
    throw new Error('SESSION_SECRET env var is required but not set.');
  }

  _sessionStoreInstance = new PgStore({
    pool,
    tableName: 'session',
  });

  _sessionMiddlewareInstance = session({
    store: _sessionStoreInstance,
    secret,
    resave: false,
    saveUninitialized: false,
    name: 'gyd_sid',
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env['NODE_ENV'] === 'production',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    },
  });

  initialized = true;
}

export function getSessionStore() {
  ensureInitialized();
  return _sessionStoreInstance!;
}

export function getSessionMiddleware() {
  ensureInitialized();
  return _sessionMiddlewareInstance!;
}

// ── Middleware function wrapper ──────────────────────────────────────────
// This is a real Express middleware function that delegates to the lazy-initialized instance.
// Express recognizes this as a valid middleware and will call it for each request.
export const sessionMiddleware = (req: any, res: any, next: any) => {
  getSessionMiddleware()(req, res, next);
};

// Lazy getter for sessionStore (backward compatibility)
export const sessionStore = new Proxy({} as InstanceType<typeof PgStore>, {
  get(target, prop) {
    return (getSessionStore() as any)[prop];
  },
  has(target, prop) {
    return prop in getSessionStore();
  },
  ownKeys(target) {
    return Reflect.ownKeys(getSessionStore());
  },
  getOwnPropertyDescriptor(target, prop) {
    return Reflect.getOwnPropertyDescriptor(getSessionStore(), prop);
  },
});

// ── Startup env-var validation ────────────────────────────────────────────────

const REQUIRED_VARS = [
  'SESSION_SECRET',
  'DATABASE_URL',
];

const REQUIRED_FOR_PAYMENTS = [
  'MONNIFY_API_KEY',
  'MONNIFY_SECRET_KEY',
  'MONNIFY_CONTRACT_CODE',
];

const REQUIRED_FOR_DATA_AIRTIME = [
  'CLUBKONNECT_USER_ID',
  'CLUBKONNECT_API_KEY',
];

const OPTIONAL_VARS = [
  { key: 'MONNIFY_BASE_URL',                  desc: 'Monnify API base URL (default: sandbox)' },
  { key: 'WHATSAPP_ACCESS_TOKEN',             desc: 'Meta WhatsApp Cloud API access token' },
  { key: 'WHATSAPP_PHONE_NUMBER_ID',          desc: 'WhatsApp Business phone number ID' },
  { key: 'WHATSAPP_BUSINESS_ACCOUNT_ID',      desc: 'WhatsApp Business account ID' },
  { key: 'WHATSAPP_WEBHOOK_VERIFY_TOKEN',     desc: 'WhatsApp webhook verify token' },
  { key: 'WHATSAPP_APP_SECRET',               desc: 'WhatsApp app secret for signature verification' },
  { key: 'OPENAI_API_KEY',                    desc: 'OpenAI API key for AI support (optional)' },
  { key: 'CORS_ORIGINS',                      desc: 'Comma-separated allowed CORS origins (production)' },
  { key: 'ADMIN_EMAIL',                       desc: 'Bootstrap super-admin email' },
  { key: 'ADMIN_PIN',                         desc: 'Bootstrap super-admin PIN (min 6 digits, change after first login)' },
  { key: 'LOG_LEVEL',                         desc: 'Pino log level (default: info)' },
];

export function validateEnv(): void {
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const key of REQUIRED_VARS) {
    if (!process.env[key]) missing.push(key);
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // Payment gateway — warn but don't fatal (app still starts, payments just disabled)
  for (const key of REQUIRED_FOR_PAYMENTS) {
    if (!process.env[key]) {
      warnings.push(`${key} not set — Monnify payments will be unavailable`);
    }
  }

  // Data/Airtime provider — warn but don't fatal
  for (const key of REQUIRED_FOR_DATA_AIRTIME) {
    if (!process.env[key]) {
      warnings.push(`${key} not set — Data/Airtime purchases will be unavailable`);
    }
  }

  // Optional vars — informational only
  for (const { key, desc } of OPTIONAL_VARS) {
    if (!process.env[key]) {
      logger.debug({ key }, `${desc} not configured`);
    }
  }

  if (warnings.length > 0) {
    for (const warning of warnings) {
      logger.warn(warning);
    }
  }
}
