import { Router, type IRouter } from "express";
import healthRouter from "./health";
import clubkonnectRouter from "./clubkonnect.js";
import authRouter from "./auth.js";
import userRouter from "./user.js";
import purchaseRouter from "./purchase.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth",        authRouter);
router.use("/user",        userRouter);
router.use("/purchase",    purchaseRouter);
router.use("/clubkonnect", clubkonnectRouter);

export default router;
