import Joi from "joi";

const id = Joi.string().hex().length(24).required();

export const createPendingFundSchema = Joi.object({
  sourceOwnerType: Joi.string().valid("User", "Partner").required(),
  sourceOwnerId: id,
  sourceWalletId: id,
  amount: Joi.number().integer().min(1).required(),
  reason: Joi.string().valid("customer_mistake", "provider_issue", "wrong_transfer", "technical_issue", "other").required(),
  recoveryOwner: Joi.string().valid("customer", "provider", "none").required(),
  expectedReturnAt: Joi.date().iso().allow(null, ""),
  transactionReference: Joi.string().trim().max(100).allow("", null),
  notes: Joi.string().trim().max(1000).allow("", null),
});

export const listPendingFundsSchema = Joi.object({
  status: Joi.string().valid("pending", "partially_returned", "returned", "written_off").optional(),
  page: Joi.number().integer().min(1).default(1),
  size: Joi.number().integer().min(1).max(100).default(20),
});

export const returnPendingFundSchema = Joi.object({
  amount: Joi.number().integer().min(1).required(),
  notes: Joi.string().trim().max(500).allow("", null),
});

export const writeOffPendingFundSchema = Joi.object({
  notes: Joi.string().trim().max(500).allow("", null),
});
