import * as noteService from "./note.service.js";
import asyncHandler from "../../utils/asyncHandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";

export const listNotesHandler = asyncHandler(async (req, res) => {
  const notes = await noteService.listNotes(req.query);
  return ApiResponse.ok(res, "تم جلب الملاحظات بنجاح.", notes);
});

export const createNoteHandler = asyncHandler(async (req, res) => {
  const note = await noteService.createNote(req.body, req.user._id);
  return ApiResponse.created(res, "تم إنشاء الملاحظة بنجاح.", note);
});

export const updateNoteHandler = asyncHandler(async (req, res) => {
  const note = await noteService.updateNote(req.params.id, req.body, req.user);
  return ApiResponse.ok(res, "تم تعديل الملاحظة بنجاح.", note);
});

export const togglePinHandler = asyncHandler(async (req, res) => {
  const note = await noteService.togglePin(req.params.id, req.user);
  return ApiResponse.ok(res, "تم تحديث تثبيت الملاحظة.", note);
});

export const archiveNoteHandler = asyncHandler(async (req, res) => {
  const note = await noteService.setArchived(req.params.id, req.body.archived, req.user);
  return ApiResponse.ok(res, req.body.archived ? "تمت أرشفة الملاحظة." : "تم استرجاع الملاحظة.", note);
});
