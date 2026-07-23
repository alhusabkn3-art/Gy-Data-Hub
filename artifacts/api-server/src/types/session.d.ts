import 'express-session';

declare module 'express-session' {
  interface SessionData {
    /** Regular customer session */
    userId:    string;
    /** Admin session flags */
    isAdmin:   boolean;
    adminId:   string;
    adminRole: 'super_admin' | 'admin' | 'customer_care';
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
