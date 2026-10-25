import Joi from "joi";

const ownerType = Joi.string().valid("User", "Partner").required();
const id = Joi.string().hex().length(24).required();

export const createExpenseSchema = Joi.object({
  category: Joi.string().valid("asset", "outflow", "advance").required(),
  description: Joi.string().trim().min(2).max(500).required(),
  assetName: Joi.string().trim().max(200).allow("", null),
  sourceOwnerType: ownerType,
  sourceOwnerId: id,
  sourceWalletId: id,
  balanceType: Joi.string().valid("liquidity", "wallet").required(),
  amount: Joi.number().integer().min(1).required(),
  borrowerType: Joi.string().valid("User", "Partner").when("category", {
    is: "advance",
    then: Joi.required(),
    otherwise: Joi.forbidden(),
  }),
  borrowerId: id.when("category", {
    is: "advance",
    then: Joi.required(),
    otherwise: Joi.forbidden(),
  }),
  notes: Joi.string().trim().max(1000).allow("", null),
}).custom((value, helpers) => {
  if (value.category === "advance" && value.sourceOwnerType === value.borrowerType && value.sourceOwnerId === value.borrowerId) {
    return helpers.error("any.custom", { message: "لا يمكن تسجيل سُلفة للحساب نفسه." });
  }
  return value;
}).messages({ "any.custom": "{{#message}}" });

export const listExpensesSchema = Joi.object({
  category: Joi.string().valid("asset", "outflow", "advance").optional(),
  status: Joi.string().valid("active", "sold", "partially_repaid", "repaid").optional(),
  page: Joi.number().integer().min(1).default(1),
  size: Joi.number().integer().min(1).max(100).default(20),
});

export const repayExpenseSchema = Joi.object({
  amount: Joi.number().integer().min(1).required(),
  notes: Joi.string().trim().max(500).allow("", null),
});

export const sellAssetSchema = Joi.object({
  amount: Joi.number().integer().min(1).required(),
  notes: Joi.string().trim().max(500).allow("", null),
});
