import { Router } from "express";
import * as attendanceController from "./attendance.controller.js";
import { protect } from "../../middlewares/auth.middleware.js";
import { isAdmin } from "../../middlewares/role.middleware.js";
import validate from "../../middlewares/validate.middleware.js";
import validateQuery from "../../middlewares/validateQuery.middleware.js";
import { adminUpsertAttendanceSchema, listAttendanceSchema } from "./attendance.validation.js";

const router = Router();

router.use(protect);

// كل مستخدم (موظف أو أدمن) يسجل حضوره/انصرافه بنفسه
router.post("/check-in", attendanceController.checkInHandler);
router.post("/check-out", attendanceController.checkOutHandler);
router.get("/today", attendanceController.getTodayStatusHandler);

// السجل — الموظف يشوف بتاعه بس، الأدمن يشوف أي حد (متحكم فيه جوه الكنترولر)
router.get("/", validateQuery(listAttendanceSchema), attendanceController.listAttendanceHandler);

// أدمن بس
router.put(
  "/manual",
  isAdmin,
  validate(adminUpsertAttendanceSchema),
  attendanceController.adminUpsertAttendanceHandler
);
router.get("/monthly-report", isAdmin, attendanceController.getMonthlyReportHandler);

export default router;