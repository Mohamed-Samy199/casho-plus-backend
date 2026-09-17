import Joi from "joi";
import { UserRole } from "../../utils/common/index.js";

// رقم تلفون مصري بسيط (قابل للتعديل لاحقًا لو الصيغة هتختلف)
const phoneRule = Joi.string()
  .pattern(/^01[0-9]{9}$/)
  .messages({ "string.pattern.base": "رقم التلفون غير صحيح." });

export const loginSchema = Joi.object({
  phone: phoneRule.required().messages({
    "any.required": "رقم التلفون مطلوب.",
  }),
  password: Joi.string().required().messages({
    "any.required": "كلمة المرور مطلوبة.",
  }),
});

export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required().messages({
    "any.required": "كلمة المرور الحالية مطلوبة.",
  }),
  newPassword: Joi.string().min(8).required().messages({
    "string.min": "كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل.",
    "any.required": "كلمة المرور الجديدة مطلوبة.",
  }),
  newPasswordConfirm: Joi.string().valid(Joi.ref("newPassword")).required().messages({
    "any.only": "كلمتا المرور غير متطابقتين.",
    "any.required": "تأكيد كلمة المرور الجديدة مطلوب.",
  }),
});

export const createUserSchema = Joi.object({
  name: Joi.string().min(2).max(100).required().messages({
    "any.required": "الاسم مطلوب.",
  }),
  // أول رقم في المصفوفة هو الرقم الأساسي (تسجيل الدخول + ربط العمليات)
  phoneNumbers: Joi.array().items(phoneRule).min(1).required().messages({
    "array.min": "لازم رقم تلفون واحد على الأقل.",
    "any.required": "رقم التلفون مطلوب.",
  }),
  email: Joi.string().email({ tlds: { allow: false } }).optional().allow(""),
  password: Joi.string().min(8).required().messages({
    "string.min": "كلمة المرور يجب أن تكون 8 أحرف على الأقل.",
    "any.required": "كلمة المرور مطلوبة.",
  }),
  role: Joi.string()
    .valid(...Object.values(UserRole))
    .optional(),
});

export const changeRoleSchema = Joi.object({
  role: Joi.string()
    .valid(...Object.values(UserRole))
    .required()
    .messages({
      "any.required": "الدور مطلوب.",
      "any.only": "الدور يجب أن يكون admin أو employee.",
    }),
});

export const addPhoneSchema = Joi.object({
  phone: phoneRule.required().messages({
    "any.required": "رقم التلفون مطلوب.",
  }),
});