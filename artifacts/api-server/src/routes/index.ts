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
import adminCompatRouter from './admin-compat.js';
import adminSuperRouter from './admin-super.js';
import adminCCRouter from './admin-cc.js';
import adminFinanceRouter from './admin-finance.js';

import supportInboxRouter from './support-inbox.js';

import paymentRouter from './payment.js';
import whatsappRouter from './whatsapp.js';
import supportChatRouter from './support-chat.js';

import cashbackRouter from './cashback.js';
import cashbackUserRouter from './cashback-user.js';

const router: IRouter =
  Router();

/* -------------------------------------------------------------------------- */
/* Public / customer routes                                                   */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/* Admin authentication                                                        */
/* -------------------------------------------------------------------------- */

/*
 * admin.ts owns:
 *
 *   POST /api/admin/login
 *   POST /api/admin/logout
 *   GET  /api/admin/me
 *
 * It MUST remain before admin-super.ts because admin-super.ts has a
 * router-level super-admin authentication middleware.
 */
router.use(
  '/admin',
  adminRouter,
);

/* -------------------------------------------------------------------------- */
/* General admin read models                                                  */
/* -------------------------------------------------------------------------- */

/*
 * This router provides dashboard, statistics, revenue, service and wallet
 * read models that are used by the normal Admin UI.
 *
 * It is intentionally mounted before admin-super.ts.
 */
router.use(
  '/admin',
  adminCompatRouter,
);

/* -------------------------------------------------------------------------- */
/* Customer-care                                                              */
/* -------------------------------------------------------------------------- */

router.use(
  '/admin/support-inbox',
  supportInboxRouter,
);

router.use(
  '/admin',
  adminCCRouter,
);

/* -------------------------------------------------------------------------- */
/* Finance                                                                    */
/* -------------------------------------------------------------------------- */

router.use(
  '/admin',
  adminFinanceRouter,
);

/* -------------------------------------------------------------------------- */
/* Cashback                                                                   */
/* -------------------------------------------------------------------------- */

router.use(
  '/admin',
  cashbackRouter,
);

/* -------------------------------------------------------------------------- */
/* Super Admin                                                                */
/* -------------------------------------------------------------------------- */

/*
 * admin-super.ts has:
 *
 *   router.use(requireSuperAdmin)
 *
 * Therefore it stays after the general admin routers.
 */
router.use(
  '/admin',
  adminSuperRouter,
);

/* -------------------------------------------------------------------------- */
/* Customer cashback                                                          */
/* -------------------------------------------------------------------------- */

router.use(
  '/cashback',
  cashbackUserRouter,
);

/* -------------------------------------------------------------------------- */
/* Payments                                                                   */
/* -------------------------------------------------------------------------- */

router.use(
  '/payment',
  paymentRouter,
);

/* -------------------------------------------------------------------------- */
/* WhatsApp                                                                   */
/* -------------------------------------------------------------------------- */

router.use(
  '/whatsapp',
  whatsappRouter,
);

/* -------------------------------------------------------------------------- */
/* Support                                                                    */
/* -------------------------------------------------------------------------- */

router.use(
  '/support',
  supportChatRouter,
);

export default router;
