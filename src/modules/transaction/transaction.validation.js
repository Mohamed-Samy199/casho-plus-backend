import Joi from "joi";
import { Channel, OperationStage, PartyType } from "../../utils/common/index.js";

export const createTransactionSchema = Joi.object({
  partnerId: Joi.string().hex().length(24).required().messages({
    "any.required": "الشريك مطلوب.",
  }),
  channel: Joi.string()
    .valid(...Object.values(Channel))
    .required()
    .messages({
      "any.required": "وسيلة الدفع مطلوبة.",
      "any.only": "وسيلة الدفع غير مدعومة.",
    }),
  phoneNumber: Joi.string()
    .pattern(/^01[0-9]{9}$/)
    .required()
    .messages({
      "any.required": "لازم تحدد رقم/شريحة الشريك اللي هتتنفذ بيه العملية.",
      "string.pattern.base": "رقم التلفون غير صحيح.",
    }),
  stage: Joi.string()
    .valid(...Object.values(OperationStage))
    .required()
    .messages({
      "any.required": "مرحلة العملية مطلوبة.",
      "any.only": "مرحلة العملية غير صحيحة.",
    }),
  partyType: Joi.string()
    .valid(...Object.values(PartyType))
    .required(),
  partyId: Joi.string().hex().length(24).required().messages({
    "any.required": "الطرف الآخر في العملية مطلوب.",
  }),
  amount: Joi.number().integer().min(1).required().messages({
    "any.required": "المبلغ مطلوب.",
    "number.min": "المبلغ يجب أن يكون أكبر من صفر.",
  }),
  // لو الموظف مبعتش عمولة، السيستم بيحسبها تلقائي من الديفولت
  commission: Joi.number().integer().min(0).optional(),
  agreedDueAt: Joi.date().optional().allow(null),
  notes: Joi.string().max(500).optional().allow(""),
});

export const listTransactionsSchema = Joi.object({
  partnerId: Joi.string().hex().length(24).optional(),
  partyType: Joi.string()
    .valid(...Object.values(PartyType))
    .optional(),
  partyId: Joi.string().hex().length(24).optional(),
  channel: Joi.string()
    .valid(...Object.values(Channel))
    .optional(),
  phoneNumber: Joi.string()
    .pattern(/^01[0-9]{9}$/)
    .optional(),
  stage: Joi.string()
    .valid(...Object.values(OperationStage))
    .optional(),
  from: Joi.date().optional(),
  to: Joi.date().optional(),
  page: Joi.number().integer().min(1).optional(),
  size: Joi.number().integer().min(1).max(100).optional(),
});