import {
  Router,
  type IRouter,
} from 'express';

import healthRouter from './health.js';
import clubkonnectRouter from './clubkonnect.js';
import smedataRouter from './smedata.js';
import authRouter from './auth.js';
import userRouter from './user.js';
import purchaseRouter from './purchase.js';
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

const router: IRouter =
  Router();

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

/*
 * SMEDATA data routes.
 *
 * This creates:
 *
 * GET /api/smedata/data-plans
 */
router.use(
  '/smedata',
  smedataRouter,
);

/*
 * Existing ClubKonnect routes are
 * still mounted for now because airtime
 * has not yet been migrated.
 *
 * We will remove/migrate airtime separately.
 */
router.use(
  '/clubkonnect',
  clubkonnectRouter,
);

router.use(
  '/admin',
  adminRouter,
);

/*
 * CC, Finance, and Inbox routers MUST
 * come before adminSuperRouter.
 */
router.use(
  '/admin',
  adminCCRouter,
);

router.use(
  '/admin/support-inbox',
  supportInboxRouter,
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
  '/cashback',
  cashbackUserRouter,
);

router.use(
  '/admin',
  adminSuperRouter,
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
