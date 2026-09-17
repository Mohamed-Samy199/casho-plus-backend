import Joi from "joi";
import { PartyType, DebtDirection, Channel, BalanceType } from "../../utils/common/index.js";

export const createDebtSchema = Joi.object({
  partyType: Joi.string()
    .valid(...Object.values(PartyType))
    .required(),
  partyId: Joi.string().hex().length(24).required().messages({
    "any.required": "الطرف المرتبط بالدين مطلوب.",
  }),
  direction: Joi.string()
    .valid(...Object.values(DebtDirection))
    .required()
    .messages({
      "any.required": "نوع الدين (ليا / عليا) مطلوب.",
    }),
  amount: Joi.number().integer().min(1).required().messages({
    "any.required": "قيمة الدين مطلوبة.",
    "number.min": "قيمة الدين يجب أن تكون أكبر من صفر.",
  }),
  description: Joi.string().max(500).optional().allow(""),
  dueDate: Joi.date().optional().allow(null),
});

export const repayDebtSchema = Joi.object({
  amount: Joi.number().integer().min(1).required().messages({
    "any.required": "قيمة السداد مطلوبة.",
    "number.min": "قيمة السداد يجب أن تكون أكبر من صفر.",
  }),
  notes: Joi.string().max(500).optional().allow(""),

  // لو true، لازم partnerId + channel + balanceType
  affectsCapital: Joi.boolean().optional().default(false),
  partnerId: Joi.string()
    .hex()
    .length(24)
    .when("affectsCapital", { is: true, then: Joi.required() })
    .messages({ "any.required": "الشريك مطلوب لو السداد هيأثر على رأس المال." }),
  channel: Joi.string()
    .valid(...Object.values(Channel))
    .when("affectsCapital", { is: true, then: Joi.required() })
    .messages({ "any.required": "الوسيلة مطلوبة لو السداد هيأثر على رأس المال." }),
  phoneNumber: Joi.string()
    .pattern(/^01[0-9]{9}$/)
    .when("affectsCapital", { is: true, then: Joi.required() })
    .messages({ "any.required": "رقم الشريحة مطلوب لو السداد هيأثر على رأس المال." }),
  balanceType: Joi.string()
    .valid(...Object.values(BalanceType))
    .when("affectsCapital", { is: true, then: Joi.required() })
    .messages({ "any.required": "نوع الرصيد مطلوب لو السداد هيأثر على رأس المال." }),
});

export const listDebtsSchema = Joi.object({
  partyType: Joi.string()
    .valid(...Object.values(PartyType))
    .optional(),
  partyId: Joi.string().hex().length(24).optional(),
  direction: Joi.string()
    .valid(...Object.values(DebtDirection))
    .optional(),
  status: Joi.string().valid("open", "settled").optional(),
  page: Joi.number().integer().min(1).optional(),
  size: Joi.number().integer().min(1).max(100).optional(),
});