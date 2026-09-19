import jwt from "jsonwebtoken";
import { JWT_SECRET, JWT_EXPIRES_IN } from "../../config/env.config.js";
import { ApiError } from "../../utils/ApiError.js";
import User from "../../models/User.model.js";
import { UserRole } from "../../utils/common/index.js";
import { findOne, findById, create, find } from "../../db/database.repository.js";

const generateToken = (userId) => {
  return jwt.sign({ id: userId }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN || "7d",
  });
};

// ── تسجيل الدخول (رقم التلفون + كلمة المرور) ────────────────────
export const login = async ({ phone, password }) => {
  const user = await findOne({
    model: User,
    filter: { phoneNumbers: phone },
    select: "+password",
    options: { lean: false },
  });

  if (!user || !user.isActive) {
    throw ApiError.unauthorized("رقم التلفون أو كلمة المرور غير صحيحة.");
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) throw ApiError.unauthorized("رقم التلفون أو كلمة المرور غير صحيحة.");

  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  const token = generateToken(user._id);
  return { user: user.toSafeObject(), token };
};

// ── بيانات المستخدم الحالي ──────────────────────────────────────
export const getMe = async (userId) => {
  const user = await findById({ model: User, id: userId, options: { lean: false } });
  if (!user) throw ApiError.notFound("المستخدم غير موجود.");
  return user.toSafeObject();
};

// ── تغيير كلمة المرور ────────────────────────────────────────────
export const changePassword = async (userId, { currentPassword, newPassword }) => {
  const user = await findById({
    model: User,
    id: userId,
    select: "+password",
    options: { lean: false },
  });
  if (!user) throw ApiError.notFound("المستخدم غير موجود.");

  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) throw ApiError.unauthorized("كلمة المرور الحالية غير صحيحة.");

  user.password = newPassword;
  await user.save();

  const token = generateToken(user._id);
  return { token };
};

// ── إنشاء حساب موظف/أدمن جديد (أدمن بس) ─────────────────────────
export const createUser = async ({ name, phoneNumbers, password, role, email }, adminId) => {
  const existing = await findOne({
    model: User,
    filter: { phoneNumbers: { $in: phoneNumbers } },
  });
  if (existing) throw ApiError.conflict("رقم التلفون مستخدم بالفعل مع حساب آخر.");

  const user = await create({
    model: User,
    data: {
      name,
      phoneNumbers,
      password,
      role: role || UserRole.EMPLOYEE,
      email,
      createdBy: adminId,
    },
  });

  return user.toSafeObject();
};

// ── إضافة رقم تلفون جديد لموظف موجود (أدمن بس) ───────────────────
export const addPhoneNumber = async (userId, phone) => {
  const existing = await findOne({ model: User, filter: { phoneNumbers: phone } });
  if (existing) throw ApiError.conflict("رقم التلفون ده مستخدم بالفعل مع حساب آخر.");

  const user = await findById({ model: User, id: userId, options: { lean: false } });
  if (!user) throw ApiError.notFound("المستخدم غير موجود.");

  user.phoneNumbers.push(phone);
  await user.save();

  return user.toSafeObject();
};

// ── حذف رقم تلفون (أدمن بس) — لازم يفضل رقم واحد على الأقل ────────
export const removePhoneNumber = async (userId, phone) => {
  const user = await findById({ model: User, id: userId, options: { lean: false } });
  if (!user) throw ApiError.notFound("المستخدم غير موجود.");

  if (user.phoneNumbers.length <= 1) {
    throw ApiError.badRequest("لازم يفضل رقم تلفون واحد على الأقل للموظف.");
  }

  user.phoneNumbers = user.phoneNumbers.filter((p) => p !== phone);
  await user.save();

  return user.toSafeObject();
};

// ── إدارة أرقام الحساب الحالي ───────────────────────────────────
export const addMyPhoneNumber = (userId, phone) => addPhoneNumber(userId, phone);

export const removeMyPhoneNumber = (userId, phone) => removePhoneNumber(userId, phone);

// ── عرض كل المستخدمين (أدمن بس) ──────────────────────────────────
export const listUsers = async () => {
  return find({ model: User, filter: {}, options: { sort: { createdAt: -1 }, lean: true } });
};

// ── تغيير دور مستخدم (أدمن بس) ────────────────────────────────────
export const changeUserRole = async (targetUserId, newRole, adminId) => {
  if (!Object.values(UserRole).includes(newRole)) {
    throw ApiError.badRequest("الدور المحدد غير صحيح.");
  }
  if (targetUserId.toString() === adminId.toString()) {
    throw ApiError.badRequest("لا يمكنك تغيير دورك الخاص.");
  }

  const user = await findById({ model: User, id: targetUserId, options: { lean: false } });
  if (!user) throw ApiError.notFound("المستخدم غير موجود.");

  const oldRole = user.role;
  user.role = newRole;
  await user.save();

  return { user: user.toSafeObject(), oldRole, newRole };
};
