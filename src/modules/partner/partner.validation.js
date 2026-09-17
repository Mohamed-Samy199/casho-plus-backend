import Joi from "joi";

const phoneRule = Joi.string()
  .pattern(/^01[0-9]{9}$/)
  .messages({ "string.pattern.base": "رقم التلفون غير صحيح." });

export const createPartnerSchema = Joi.object({
  name: Joi.string().min(2).max(100).required().messages({
    "any.required": "اسم الشريك مطلوب.",
  }),
  phoneNumbers: Joi.array().items(phoneRule).optional(),
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