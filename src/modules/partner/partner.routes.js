import { Router } from "express";
import * as partnerController from "./partner.controller.js";
import { protect } from "../../middlewares/auth.middleware.js";
import { isAdmin } from "../../middlewares/role.middleware.js";
import validate from "../../middlewares/validate.middleware.js";
import validateQuery from "../../middlewares/validateQuery.middleware.js";
import {
  createPartnerSchema,
  updatePartnerSchema,
  addPhoneSchema,
  listPartnersSchema,
  createPartnerAccountSchema,
} from "./partner.validation.js";

const router = Router();

router.use(protect);

// إدارة الشركاء (إضافة/تعديل/أرقام) أدمن بس — التصفح والاطلاع متاح للموظف كمان
router.get("/", validateQuery(listPartnersSchema), partnerController.listPartnersHandler);
router.get("/:id", partnerController.getPartnerHandler);

router.post("/", isAdmin, validate(createPartnerSchema), partnerController.createPartnerHandler);
router.patch("/:id", isAdmin, validate(updatePartnerSchema), partnerController.updatePartnerHandler);
router.post(
  "/:id/account",
  isAdmin,
  validate(createPartnerAccountSchema),
  partnerController.createPartnerAccountHandler
);
router.post("/:id/phones", isAdmin, validate(addPhoneSchema), partnerController.addPhoneNumberHandler);
router.delete("/:id/phones/:phone", isAdmin, partnerController.removePhoneNumberHandler);

export default router;
