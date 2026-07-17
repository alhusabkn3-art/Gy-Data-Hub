import { Router, type IRouter } from "express";
import healthRouter from "./health";
import clubkonnectRouter from "./clubkonnect.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/clubkonnect", clubkonnectRouter);

export default router;
