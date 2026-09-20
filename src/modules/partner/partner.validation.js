import Joi from "joi";

const phoneRule = Joi.string()
  .pattern(/^01[0-9]{9}$/)
  .messages({ "string.pattern.base": "رقم التلفون غير صحيح." });

export const createPartnerSchema = Joi.object({
  name: Joi.string().min(2).max(100).required().messages({
    "any.required": "اسم الشريك مطلوب.",
  }),
  phoneNumbers: Joi.array()
    .items(phoneRule)
    .min(1)
    .required()
    .messages({
      "any.required": "يجب إضافة رقم هاتف واحد على الأقل للشريك.",
      "array.min": "يجب إضافة رقم هاتف واحد على الأقل للشريك.",
    }),
  createAccount: Joi.boolean().default(false),
  password: Joi.when("createAccount", {
    is: true,
    then: Joi.string().min(8).required().messages({
      "any.required": "كلمة المرور مطلوبة عند إنشاء حساب للشريك.",
      "string.min": "كلمة المرور يجب أن تكون 8 أحرف على الأقل.",
    }),
    otherwise: Joi.forbidden(),
  }),
});

export const updatePartnerSchema = Joi.object({
  name: Joi.string().min(2).max(100).optional(),
  isActive: Joi.boolean().optional(),
});

export const addPhoneSchema = Joi.object({
  phone: phoneRule.required().messages({
    "any.required": "رقم التلفون مطلوب.",
  }),
});

export const listPartnersSchema = Joi.object({
  isActive: Joi.boolean().optional(),
});

export const createPartnerAccountSchema = Joi.object({
  password: Joi.string().min(8).required().messages({
    "any.required": "كلمة المرور مطلوبة.",
    "string.min": "كلمة المرور يجب أن تكون 8 أحرف على الأقل.",
  }),
});
