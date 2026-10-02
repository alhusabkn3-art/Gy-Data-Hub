// artifacts/api-server/src/routes/index.ts

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
import supportChatRouter from './support-chat.js';

import paymentRouter from './payment.js';
import whatsappRouter from './whatsapp.js';

import cashbackRouter from './cashback.js';
import cashbackUserRouter from './cashback-user.js';

const router: IRouter =
  Router();

/* -------------------------------------------------------------------------- */
/* PUBLIC / CUSTOMER ROUTES                                                   */
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

router.use(
  '/purchase',
  purchaseRouter,
);

router.use(
  '/purchase',
  purchaseDataV2Router,
);

router.use(
  '/smeapi',
  smeapiRouter,
);

/* -------------------------------------------------------------------------- */
/* ADMIN AUTHENTICATION                                                       */
/* -------------------------------------------------------------------------- */

router.use(
  '/admin',
  adminRouter,
);

/* -------------------------------------------------------------------------- */
/* ADMIN / SUPER ADMIN                                                        */
/* -------------------------------------------------------------------------- */

router.use(
  '/admin',
  adminSmeApiCreditRouter,
);

router.use(
  '/admin',
  adminCompatRouter,
);

router.use(
  '/admin',
  adminSuperRouter,
);

router.use(
  '/admin',
  adminCCRouter,
);

router.use(
  '/admin',
  adminFinanceRouter,
);

/*
 * IMPORTANT:
 *
 * cashback.ts already defines:
 *
 *   /cashback/settings
 *   /cashback/plans
 *   /cashback/reports
 *
 * Therefore it MUST be mounted at /admin.
 *
 * This produces:
 *
 *   /api/admin/cashback/settings
 *   /api/admin/cashback/plans
 *   /api/admin/cashback/reports
 *
 * The old incorrect mounting at /cashback produced:
 *
 *   /api/cashback/cashback/settings
 *
 * which is why the Super Admin global cashback switch could not work.
 */
router.use(
  '/admin',
  cashbackRouter,
);

/* -------------------------------------------------------------------------- */
/* SUPPORT                                                                    */
/* -------------------------------------------------------------------------- */

router.use(
  '/support',
  supportInboxRouter,
);

router.use(
  '/support',
  supportChatRouter,
);

/* -------------------------------------------------------------------------- */
/* PAYMENTS                                                                   */
/* -------------------------------------------------------------------------- */

router.use(
  '/payment',
  paymentRouter,
);

/* -------------------------------------------------------------------------- */
/* WHATSAPP                                                                   */
/* -------------------------------------------------------------------------- */

router.use(
  '/whatsapp',
  whatsappRouter,
);

/* -------------------------------------------------------------------------- */
/* USER CASHBACK ROUTES                                                       */
/* -------------------------------------------------------------------------- */

router.use(
  '/cashback',
  cashbackUserRouter,
);

export default router;
