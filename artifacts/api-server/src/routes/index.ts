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
 * IMPORTANT ROUTING ORDER
 *
 * The more specific admin routers must be
 * registered before the general admin router.
 *
 * Otherwise a generic /admin route can capture
 * requests intended for the Super Admin router.
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

router.use(
  '/admin',
  adminSuperRouter,
);

/*
 * Keep the general admin router last among
 * the /admin routers so it cannot shadow the
 * Super Admin-specific endpoints.
 */
router.use(
  '/admin',
  adminRouter,
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
