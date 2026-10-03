import Joi from "joi";

const noteFields = {
  title: Joi.string().trim().min(1).max(120).required(),
  content: Joi.string().trim().min(1).max(5000).required(),
  category: Joi.string().valid("general", "operations", "finance", "follow_up", "reminder").default("general"),
  priority: Joi.string().valid("low", "medium", "high").default("medium"),
  tags: Joi.array().items(Joi.string().trim().max(30)).max(10).default([]),
  dueDate: Joi.date().iso().allow(null, ""),
  isPinned: Joi.boolean().default(false),
};

export const createNoteSchema = Joi.object(noteFields);
export const updateNoteSchema = Joi.object(noteFields).fork(Object.keys(noteFields), (schema) => schema.optional()).min(1);
export const listNotesSchema = Joi.object({
  search: Joi.string().trim().max(100).allow(""),
  category: Joi.string().valid("general", "operations", "finance", "follow_up", "reminder").empty(""),
  priority: Joi.string().valid("low", "medium", "high").empty(""),
  archived: Joi.boolean().default(false),
  page: Joi.number().integer().min(1).default(1),
  size: Joi.number().integer().min(1).max(50).default(12),
});
