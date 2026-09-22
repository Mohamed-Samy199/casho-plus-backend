import { Router } from "express";
import * as controller from "./internal-transfer.controller.js";
import { protect } from "../../middlewares/auth.middleware.js";
import { isAdmin } from "../../middlewares/role.middleware.js";
import validate from "../../middlewares/validate.middleware.js";
import validateQuery from "../../middlewares/validateQuery.middleware.js";
import { createTransferSchema, listTransfersSchema } from "./internal-transfer.validation.js";

const router = Router();
router.use(protect, isAdmin);
router.get("/accounts", controller.listAccountsHandler);
router.get("/", validateQuery(listTransfersSchema), controller.listTransfersHandler);
router.post("/", validate(createTransferSchema), controller.createTransferHandler);
export default router;
