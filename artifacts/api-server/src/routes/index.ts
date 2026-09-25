import {
  Router,
  type IRouter,
} from 'express';

import healthRouter from './health.js';
import authRouter from './auth.js';
import userRouter from './user.js';
import purchaseRouter from './purchase.js';
import smeapiRouter from './smeapi.js';

import adminRouter from './admin.js';
import adminSuperRouter from './admin-super.js';
import adminCCRouter from './admin-cc.js';
import adminFinanceRouter from './admin-finance.js';

import supportInboxRouter from './support-inbox.js';

import paymentRouter from './payment.js';
import whatsappRouter from './whatsapp.js';
import supportChatRouter from './support-chat.js';

import cashbackRouter from './cashback.js';
import cashbackUserRouter from './cashback-user.js';

const router: IRouter = Router();

router.use(
  healthRouter,
);

router.use(
  '/auth',
  authRouter,
);

router.use(
  '/user',
  userRouter,
);

router.use(
  '/purchase',
  purchaseRouter,
);

router.use(
  '/smeapi',
  smeapiRouter,
);

/*
 * IMPORTANT:
 *
 * /api/admin/login and /api/admin/logout and
 * /api/admin/me are defined in admin.ts.
 *
 * admin-super.ts contains:
 *
 *   router.use(requireSuperAdmin)
 *
 * at router level.
 *
 * Therefore admin.ts MUST be mounted BEFORE
 * admin-super.ts.
 *
 * Otherwise:
 *
 * POST /api/admin/login
 *
 * gets intercepted by admin-super.ts before
 * admin.ts can process the login, producing:
 *
 * 401 Admin authentication required.
 *
 * The general admin.ts router does not contain
 * catch-all routes that would block the
 * admin-super routes in this project.
 */

/*
 * Authentication routes FIRST.
 */
router.use(
  '/admin',
  adminRouter,
);

/*
 * Specific admin routers that have their own
 * role middleware.
 *
 * These remain after the authentication router
 * so /admin/login can be reached without an
 * existing admin session.
 */

router.use(
  '/admin/support-inbox',
  supportInboxRouter,
);

router.use(
  '/admin',
  adminCCRouter,
);

router.use(
  '/admin',
  adminFinanceRouter,
);

router.use(
  '/admin',
  cashbackRouter,
);

/*
 * Super Admin routes LAST among the /admin
 * routers because admin-super.ts applies:
 *
 * router.use(requireSuperAdmin)
 *
 * to every request entering that router.
 */
router.use(
  '/admin',
  adminSuperRouter,
);

router.use(
  '/cashback',
  cashbackUserRouter,
);

router.use(
  '/payment',
  paymentRouter,
);

router.use(
  '/whatsapp',
  whatsappRouter,
);

router.use(
  '/support',
  supportChatRouter,
);

export default router;
