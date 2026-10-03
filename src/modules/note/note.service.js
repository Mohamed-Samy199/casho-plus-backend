import Note from "../../models/Note.model.js";
import { ApiError } from "../../utils/ApiError.js";

const populateUser = (query) => query.populate("createdBy", "name").populate("updatedBy", "name").populate("archivedBy", "name");

function canManage(note, user) {
  return String(note.createdBy?._id || note.createdBy) === String(user._id) || user.role === "admin";
}

export async function listNotes({ search, category, priority, archived = false, page = 1, size = 12 } = {}) {
  const currentPage = Math.max(1, Number(page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(size) || 12));
  const filter = { isArchived: Boolean(archived) };
  if (category) filter.category = category;
  if (priority) filter.priority = priority;
  if (search) {
    filter.$or = [
      { title: { $regex: search, $options: "i" } },
      { content: { $regex: search, $options: "i" } },
      { tags: { $regex: search, $options: "i" } },
    ];
  }
  const [notes, total] = await Promise.all([
    populateUser(Note.find(filter)).sort({ isPinned: -1, priority: -1, dueDate: 1, updatedAt: -1 }).skip((currentPage - 1) * pageSize).limit(pageSize).lean(),
    Note.countDocuments(filter),
  ]);
  return { result: notes, total, currentPage, pages: Math.ceil(total / pageSize), limit: pageSize };
}

export async function createNote(data, userId) {
  const note = await Note.create({ ...data, createdBy: userId });
  return populateUser(Note.findById(note._id)).lean();
}

export async function updateNote(id, data, user) {
  const note = await Note.findById(id);
  if (!note) throw ApiError.notFound("الملاحظة غير موجودة.");
  if (!canManage(note, user)) throw ApiError.forbidden("يمكنك تعديل ملاحظاتك فقط.");
  const updated = await Note.findByIdAndUpdate(id, { ...data, updatedBy: user._id }, { new: true, runValidators: true });
  return populateUser(Note.findById(updated._id)).lean();
}

export async function togglePin(id, user) {
  const note = await Note.findById(id);
  if (!note) throw ApiError.notFound("الملاحظة غير موجودة.");
  if (!canManage(note, user)) throw ApiError.forbidden("يمكنك تثبيت ملاحظاتك فقط.");
  note.isPinned = !note.isPinned;
  note.updatedBy = user._id;
  await note.save();
  return populateUser(Note.findById(note._id)).lean();
}

export async function setArchived(id, archived, user) {
  const note = await Note.findById(id);
  if (!note) throw ApiError.notFound("الملاحظة غير موجودة.");
  if (!canManage(note, user)) throw ApiError.forbidden("يمكنك أرشفة ملاحظاتك فقط.");
  note.isArchived = archived;
  note.archivedAt = archived ? new Date() : undefined;
  note.archivedBy = archived ? user._id : undefined;
  note.updatedBy = user._id;
  await note.save();
  return populateUser(Note.findById(note._id)).lean();
}
