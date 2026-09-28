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
import adminSmeApiCreditRouter from './admin-smeapi-credit.js';
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

router.use(
  '/admin',
  adminRouter,
);

/* -------------------------------------------------------------------------- */
/* Super Admin SME-backed wallet credit                                       */
/* -------------------------------------------------------------------------- */

/*
 * IMPORTANT:
 *
 * This MUST come before admin-compat.ts.
 *
 * admin-compat.ts already contains:
 *
 *   POST /admin/users/:id/fund-wallet
 *
 * This specialized router therefore needs to run first so that
 * Super Admin wallet credits are checked against the live SME API
 * balance before the wallet is increased.
 *
 * It also provides:
 *
 *   GET /admin/smeapi/credit-balance
 */
router.use(
  '/admin',
  adminSmeApiCreditRouter,
);

/* -------------------------------------------------------------------------- */
/* General admin read models                                                  */
/* -------------------------------------------------------------------------- */

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
