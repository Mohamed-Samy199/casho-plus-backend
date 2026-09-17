import Joi from "joi";
import { Channel, OperationStage } from "../../utils/common/index.js";

export const upsertCommissionRuleSchema = Joi.object({
  channel: Joi.string()
    .valid(...Object.values(Channel))
    .required(),
  stage: Joi.string()
    .valid(...Object.values(OperationStage))
    .required(),
  type: Joi.string().valid("flat", "proportional").required(),
  flatAmount: Joi.number().integer().min(0).default(0),
  proportionalRate: Joi.number().integer().min(0).default(0),
  proportionalThreshold: Joi.number().integer().min(0).default(0),
  isActive: Joi.boolean().default(true),
});