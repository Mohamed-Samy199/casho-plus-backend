import { Router } from "express";
import * as notificationController from "./notification.controller.js";
import { protect } from "../../middlewares/auth.middleware.js";

const router = Router();

router.use(protect);

router.get("/", notificationController.listNotificationsHandler);
router.patch("/:id/read", notificationController.markAsReadHandler);
router.patch("/read-all", notificationController.markAllAsReadHandler);

export default router;