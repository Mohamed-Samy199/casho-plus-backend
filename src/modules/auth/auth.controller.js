import * as authService from "./auth.service.js";
import asyncHandler from "../../utils/asyncHandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";

/**
 * POST /api/auth/login
 * Public
 */
export const login = asyncHandler(async (req, res) => {
  const { phone, password } = req.body;
  const { user, token } = await authService.login({ phone, password });
  return ApiResponse.ok(res, "تم تسجيل الدخول بنجاح.", { user, token });
});

/**
 * GET /api/auth/me
 * Protected
 */
export const getMe = asyncHandler(async (req, res) => {
  const user = await authService.getMe(req.user._id);
  return ApiResponse.ok(res, "تم جلب بيانات المستخدم بنجاح.", { user });
});

/**
 * PATCH /api/auth/change-password
 * Protected
 */
export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const { token } = await authService.changePassword(req.user._id, {
    currentPassword,
    newPassword,
  });
  return ApiResponse.ok(res, "تم تغيير كلمة المرور بنجاح.", { token });
});

/**
 * POST /api/auth/users
 * Admin only — إنشاء حساب موظف/أدمن جديد
 */
export const createUser = asyncHandler(async (req, res) => {
  const user = await authService.createUser(req.body, req.user._id);
  return ApiResponse.created(res, "تم إنشاء الحساب بنجاح.", { user });
});

/**
 * GET /api/auth/users
 * Admin only
 */
export const listUsers = asyncHandler(async (req, res) => {
  const users = await authService.listUsers();
  return ApiResponse.ok(res, "تم جلب المستخدمين بنجاح.", users);
});

/**
 * PATCH /api/auth/users/:userId/role
 * Admin only
 */
export const changeUserRole = asyncHandler(async (req, res) => {
  const result = await authService.changeUserRole(req.params.userId, req.body.role, req.user._id);
  return ApiResponse.ok(
    res,
    `تم تغيير الدور من ${result.oldRole} إلى ${result.newRole}.`,
    { user: result.user }
  );
});

/**
 * POST /api/auth/users/:userId/phones
 * Admin only — إضافة رقم تلفون جديد للموظف
 */
export const addPhoneNumber = asyncHandler(async (req, res) => {
  const user = await authService.addPhoneNumber(req.params.userId, req.body.phone);
  return ApiResponse.ok(res, "تم إضافة رقم التلفون بنجاح.", { user });
});

/**
 * DELETE /api/auth/users/:userId/phones/:phone
 * Admin only — حذف رقم تلفون من الموظف
 */
export const removePhoneNumber = asyncHandler(async (req, res) => {
  const user = await authService.removePhoneNumber(req.params.userId, req.params.phone);
  return ApiResponse.ok(res, "تم حذف رقم التلفون بنجاح.", { user });
});