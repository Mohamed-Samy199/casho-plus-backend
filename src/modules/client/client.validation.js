import Joi from "joi";
import { ClientType } from "../../utils/common/index.js";

const phoneRule = Joi.string()
  .pattern(/^01[0-9]{9}$/)
  .messages({ "string.pattern.base": "رقم التلفون غير صحيح." });

const keyClientSettingsSchema = Joi.object({
  defaultAgreedHours: Joi.number().integer().min(1).optional(),
  defaultLateCommission: Joi.number().integer().min(0).optional(),
});

export const createClientSchema = Joi.object({
  name: Joi.string().min(2).max(100).required().messages({
    "any.required": "اسم العميل مطلوب.",
  }),
  phoneNumbers: Joi.array().items(phoneRule).optional(),
  type: Joi.string()
    .valid(...Object.values(ClientType))
    .required()
    .messages({ "any.required": "نوع العميل مطلوب (فرد أو عميل رئيسي)." }),
  // منطقية بس لو type = key_client، بس مش هنمنعها لو بعتها لعميل عادي، هتتجاهل في السيرفيس
  keyClientSettings: keyClientSettingsSchema.optional(),
  notes: Joi.string().max(500).optional().allow(""),
});

export const updateClientSchema = Joi.object({
  name: Joi.string().min(2).max(100).optional(),
  notes: Joi.string().max(500).optional().allow(""),
  isActive: Joi.boolean().optional(),
  keyClientSettings: keyClientSettingsSchema.optional(),
});

export const addPhoneSchema = Joi.object({
  phone: phoneRule.required().messages({
    "any.required": "رقم التلفون مطلوب.",
  }),
});

export const listClientsSchema = Joi.object({
  type: Joi.string()
    .valid(...Object.values(ClientType))
    .optional(),
  isActive: Joi.boolean().optional(),
  page: Joi.number().integer().min(1).optional(),
  size: Joi.number().integer().min(1).max(100).optional(),
});