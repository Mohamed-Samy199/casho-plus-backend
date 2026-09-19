import Joi from "joi";
import { Channel } from "../../utils/common/index.js";

const phoneNumber = Joi.string()
  .pattern(/^01[0-9]{9}$/)
  .required()
  .messages({
    "any.required": "رقم التلفون مطلوب.",
    "string.pattern.base": "رقم التلفون غير صحيح.",
  });

const adjustmentAmount = Joi.number().integer().min(0).default(0).messages({
  "number.min": "قيمة الرصيد لا يمكن أن تكون سالبة.",
});

export const balanceAdjustmentSchema = Joi.object({
  partnerId: Joi.string().hex().length(24).required(),
  channel: Joi.string().valid(...Object.values(Channel)).required(),
  phoneNumber,
  liquidityAmount: adjustmentAmount,
  walletAmount: adjustmentAmount,
  note: Joi.string().max(500).allow("").optional(),
});

export const balanceHistoryQuerySchema = Joi.object({
  partnerId: Joi.string().hex().length(24).optional(),
  phoneNumber: Joi.string().pattern(/^01[0-9]{9}$/).optional(),
  limit: Joi.number().integer().min(1).max(100).optional(),
});