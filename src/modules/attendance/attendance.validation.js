import Joi from "joi";

export const adminUpsertAttendanceSchema = Joi.object({
  userId: Joi.string().hex().length(24).required().messages({
    "any.required": "الموظف مطلوب.",
  }),
  date: Joi.date().required().messages({
    "any.required": "التاريخ مطلوب.",
  }),
  checkInAt: Joi.date().allow(null).optional(),
  checkOutAt: Joi.date().allow(null).optional(),
  notes: Joi.string().max(300).optional().allow(""),
});

export const listAttendanceSchema = Joi.object({
  userId: Joi.string().hex().length(24).optional(),
  from: Joi.date().optional(),
  to: Joi.date().optional(),
  page: Joi.number().integer().min(1).optional(),
  size: Joi.number().integer().min(1).max(100).optional(),
});