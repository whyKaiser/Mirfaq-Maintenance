import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import propertiesRouter from "./properties";
import unitsRouter from "./units";
import requestsRouter from "./requests";
import techniciansRouter from "./technicians";
import dashboardRouter from "./dashboard";
import residentsRouter from "./residents";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(propertiesRouter);
router.use(unitsRouter);
router.use(requestsRouter);
router.use(techniciansRouter);
router.use(dashboardRouter);
router.use(residentsRouter);

export default router;
