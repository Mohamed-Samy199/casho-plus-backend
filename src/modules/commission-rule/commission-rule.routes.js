import { Router } from "express";
import * as commissionRuleController from "./commission-rule.controller.js";
import { protect } from "../../middlewares/auth.middleware.js";
import { isAdmin } from "../../middlewares/role.middleware.js";
import validate from "../../middlewares/validate.middleware.js";
import { upsertCommissionRuleSchema } from "./commission-rule.validation.js";

const router = Router();

router.use(protect, isAdmin); // تعديل العمولات إعداد حساس — أدمن بس

router.get("/", commissionRuleController.listCommissionRulesHandler);
router.put("/", validate(upsertCommissionRuleSchema), commissionRuleController.upsertCommissionRuleHandler);

export default router;