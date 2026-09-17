import { Router } from "express";
import * as capitalController from "./capital.controller.js";
import { protect } from "../../middlewares/auth.middleware.js";
import { isAdmin } from "../../middlewares/role.middleware.js";

const router = Router();

// رأس المال الكلي معلومة حساسة — أدمن بس (زي ما اتفقنا: الموظف ميشوفش الأرباح الكاملة)
router.use(protect, isAdmin);

router.get("/summary", capitalController.getCapitalSummaryHandler);
router.get("/by-partner", capitalController.getCapitalByPartnerHandler);

export default router;