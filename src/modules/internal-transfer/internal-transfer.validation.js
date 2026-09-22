import Joi from "joi";

const ownerType = Joi.string().valid("User", "Partner").required();
const ownerId = Joi.string().hex().length(24).required();
const walletId = Joi.string().hex().length(24).required();

export const createTransferSchema = Joi.object({
  sourceOwnerType: ownerType,
  sourceOwnerId: ownerId,
  sourceWalletId: walletId,
  targetOwnerType: ownerType,
  targetOwnerId: ownerId,
  targetWalletId: walletId,
  asset: Joi.string().valid("liquidity", "wallet").required(),
  amount: Joi.number().integer().min(1).required(),
  notes: Joi.string().max(500).allow("").optional(),
});

export const listTransfersSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  size: Joi.number().integer().min(1).max(100).default(20),
});
