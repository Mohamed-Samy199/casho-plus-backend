import { Router } from "express";
import * as clientController from "./client.controller.js";
import { protect } from "../../middlewares/auth.middleware.js";
import { isAdmin } from "../../middlewares/role.middleware.js";
import validate from "../../middlewares/validate.middleware.js";
import validateQuery from "../../middlewares/validateQuery.middleware.js";
import {
  createClientSchema,
  updateClientSchema,
  addPhoneSchema,
  listClientsSchema,
} from "./client.validation.js";

const router = Router();

router.use(protect);

// الموظف يقدر يتصفح ويسجل عمليات، بس إضافة/تعديل بيانات العميل الرئيسي أدمن بس
// (زي ما اتفقنا: العميل الرئيسي مالوش أكونت، الأدمن هو اللي بيدير بياناته)
router.get("/", validateQuery(listClientsSchema), clientController.listClientsHandler);
router.get("/:id", clientController.getClientHandler);

router.post("/", isAdmin, validate(createClientSchema), clientController.createClientHandler);
router.patch("/:id", isAdmin, validate(updateClientSchema), clientController.updateClientHandler);
router.post("/:id/phones", isAdmin, validate(addPhoneSchema), clientController.addPhoneNumberHandler);
router.delete("/:id/phones/:phone", isAdmin, clientController.removePhoneNumberHandler);

export default router;