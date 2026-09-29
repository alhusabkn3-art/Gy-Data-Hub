import {
  Router,
  type IRouter,
} from 'express';

import healthRouter from './health.js';
import authRouter from './auth.js';
import forgotPinEmailRouter from './forgot-pin-email.js';
import userRouter from './user.js';

import purchaseRouter from './purchase.js';
import purchaseDataV2Router from './purchase-data-v2.js';

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
  '/auth',
  forgotPinEmailRouter,
);

router.use(
  '/user',
  userRouter,
);

/*
 * Existing purchase routes.
 */
router.use(
  '/purchase',
  purchaseRouter,
);

/*
 * SME-backed safe data purchase routes.
 *
 * purchase-data-v2.ts contains:
 *
 * POST /data-safe
 *
 * Therefore mounting it here at /purchase produces:
 *
 * POST /api/purchase/data-safe
 *
 * This was already implemented in the backend but was
 * missing from the main router.
 */
router.use(
  '/purchase',
  purchaseDataV2Router,
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

router.use(
  '/admin',
  adminSmeApiCreditRouter,
);

/* -------------------------------------------------------------------------- */
/* Compatibility / legacy admin routes                                        */
/* -------------------------------------------------------------------------- */

router.use(
  '/admin',
  adminCompatRouter,
);

/* -------------------------------------------------------------------------- */
/* Super Admin routes                                                          */
/* -------------------------------------------------------------------------- */

router.use(
  '/admin',
  adminSuperRouter,
);

/* -------------------------------------------------------------------------- */
/* Customer Care / Support                                                     */
/* -------------------------------------------------------------------------- */

router.use(
  '/admin',
  adminCCRouter,
);

router.use(
  '/admin',
  adminFinanceRouter,
);

router.use(
  '/support',
  supportInboxRouter,
);

router.use(
  '/support',
  supportChatRouter,
);

/* -------------------------------------------------------------------------- */
/* Payments                                                                    */
/* -------------------------------------------------------------------------- */

router.use(
  '/payment',
  paymentRouter,
);

/* -------------------------------------------------------------------------- */
/* WhatsApp                                                                    */
/* -------------------------------------------------------------------------- */

router.use(
  '/whatsapp',
  whatsappRouter,
);

/* -------------------------------------------------------------------------- */
/* Cashback                                                                    */
/* -------------------------------------------------------------------------- */

router.use(
  '/cashback',
  cashbackRouter,
);

router.use(
  '/cashback',
  cashbackUserRouter,
);

export default router;
