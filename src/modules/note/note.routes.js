import { Router } from "express";
import Joi from "joi";
import { protect } from "../../middlewares/auth.middleware.js";
import validate from "../../middlewares/validate.middleware.js";
import validateQuery from "../../middlewares/validateQuery.middleware.js";
import * as noteController from "./note.controller.js";
import { createNoteSchema, updateNoteSchema, listNotesSchema } from "./note.validation.js";

const router = Router();
router.use(protect);

router.get("/", validateQuery(listNotesSchema), noteController.listNotesHandler);
router.post("/", validate(createNoteSchema), noteController.createNoteHandler);
router.patch("/:id", validate(updateNoteSchema), noteController.updateNoteHandler);
router.patch("/:id/pin", noteController.togglePinHandler);
router.patch("/:id/archive", validate(Joi.object({ archived: Joi.boolean().required() })), noteController.archiveNoteHandler);

export default router;
