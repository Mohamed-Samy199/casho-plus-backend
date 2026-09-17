import { Router } from "express";
import * as dashboardController from "./dashboard.controller.js";
import { protect } from "../../middlewares/auth.middleware.js";

const router = Router();

router.use(protect);

router.get("/", dashboardController.getDashboardHandler);

export default router;