import { Router } from "express";
import * as authController from "./auth.controller.js";
import { protect } from "../../middlewares/auth.middleware.js";
import { isAdmin } from "../../middlewares/role.middleware.js";
import validate from "../../middlewares/validate.middleware.js";
import { authLimiter } from "../../middlewares/rateLimit.middleware.js";
import {
  loginSchema,
  changePasswordSchema,
  createUserSchema,
  changeRoleSchema,
  addPhoneSchema,
} from "./auth.validation.js";

const router = Router();

// ── Public ────────────────────────────────────────────────────
router.post("/login", authLimiter, validate(loginSchema), authController.login);

// ── Protected ─────────────────────────────────────────────────
router.get("/me", protect, authController.getMe);
router.patch("/change-password", protect, validate(changePasswordSchema), authController.changePassword);
router.post("/me/phones", protect, validate(addPhoneSchema), authController.addMyPhoneNumber);
router.delete("/me/phones/:phone", protect, authController.removeMyPhoneNumber);

// ── Admin Only ────────────────────────────────────────────────
router.post("/users", protect, isAdmin, validate(createUserSchema), authController.createUser);
router.get("/users", protect, isAdmin, authController.listUsers);
router.patch("/users/:userId/role", protect, isAdmin, validate(changeRoleSchema), authController.changeUserRole);
router.post("/users/:userId/phones", protect, isAdmin, validate(addPhoneSchema), authController.addPhoneNumber);
router.delete("/users/:userId/phones/:phone", protect, isAdmin, authController.removePhoneNumber);

export default router;
