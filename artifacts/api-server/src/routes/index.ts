import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import clubkonnectRouter from "./clubkonnect.js";
import authRouter from "./auth.js";
import userRouter from "./user.js";
import purchaseRouter from "./purchase.js";
import adminRouter from "./admin.js";
import adminSuperRouter from "./admin-super.js";
import adminCCRouter    from "./admin-cc.js";
import adminFinanceRouter from "./admin-finance.js";
import supportInboxRouter from "./support-inbox.js";
import paymentRouter from "./payment.js";
import whatsappRouter from "./whatsapp.js";
import supportChatRouter from "./support-chat.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth",           authRouter);
router.use("/user",           userRouter);
router.use("/purchase",       purchaseRouter);
router.use("/clubkonnect",    clubkonnectRouter);
router.use("/admin",          adminRouter);
router.use("/admin",          adminSuperRouter);
router.use("/admin",          adminCCRouter);
router.use("/admin",          adminFinanceRouter);
router.use("/admin",          supportInboxRouter);
router.use("/payment",        paymentRouter);
router.use("/whatsapp",       whatsappRouter);
router.use("/support",        supportChatRouter);

export default router;
