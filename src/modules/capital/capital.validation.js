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

const adjustmentFields = {
  channel: Joi.string().valid(...Object.values(Channel)).required(),
  phoneNumber,
  liquidityAmount: adjustmentAmount,
  walletAmount: adjustmentAmount,
  note: Joi.string().max(500).allow("").optional(),
};

export const balanceAdjustmentSchema = Joi.object({
  partnerId: Joi.string().hex().length(24).required(),
  ...adjustmentFields,
});

// إضافة رصيد للأدمن: ownerId يتم أخذه من req.user داخل controller، وليس من body.
export const myBalanceAdjustmentSchema = Joi.object(adjustmentFields);

export const balanceHistoryQuerySchema = Joi.object({
  partnerId: Joi.string().hex().length(24).optional(),
  phoneNumber: Joi.string().pattern(/^01[0-9]{9}$/).optional(),
  limit: Joi.number().integer().min(1).max(100).optional(),
});

export const myBalanceHistoryQuerySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).optional(),
});

const reconciliationDate = Joi.string()
  .pattern(/^\d{4}-\d{2}-\d{2}$/)
  .required()
  .messages({ "string.pattern.base": "التاريخ يجب أن يكون بصيغة YYYY-MM-DD." });

export const reconciliationQuerySchema = Joi.object({
  date: reconciliationDate,
});

export const reconciliationHistoryQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  size: Joi.number().integer().min(1).max(50).default(10),
});

export const treasuryMovementsQuerySchema = Joi.object({
  from: reconciliationDate,
  to: reconciliationDate,
  asset: Joi.string().valid("liquidity", "wallet").default("liquidity"),
  page: Joi.number().integer().min(1).default(1),
  size: Joi.number().integer().min(1).max(50).default(20),
});

export const closeReconciliationSchema = Joi.object({
  date: reconciliationDate,
  actualLiquidity: Joi.number().integer().min(0).required(),
  actualWalletBalance: Joi.number().integer().min(0).required(),
  notes: Joi.string().max(1000).allow("").optional(),
});
