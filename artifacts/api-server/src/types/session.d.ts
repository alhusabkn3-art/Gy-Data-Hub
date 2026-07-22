import 'express-session';

declare module 'express-session' {
  interface SessionData {
    userId:  string;
    isAdmin: boolean;
  }
}

// Augment Express.Request with rawBody, populated by the express.json verify
// callback in app.ts for use by the Monnify webhook signature verifier.
declare global {
  namespace Express {
    interface Request {
      rawBody?: string;
    }
  }
}
