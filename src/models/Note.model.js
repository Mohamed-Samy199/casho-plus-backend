import mongoose from "mongoose";

const noteSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    content: { type: String, required: true, trim: true, maxlength: 5000 },
    category: { type: String, enum: ["general", "operations", "finance", "follow_up", "reminder"], default: "general" },
    priority: { type: String, enum: ["low", "medium", "high"], default: "medium" },
    tags: { type: [String], default: [] },
    dueDate: { type: Date },
    isPinned: { type: Boolean, default: false },
    isArchived: { type: Boolean, default: false },
    archivedAt: { type: Date },
    archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

noteSchema.index({ isArchived: 1, isPinned: -1, priority: -1, updatedAt: -1 });
noteSchema.index({ title: "text", content: "text", tags: "text" });

export default mongoose.model("Note", noteSchema);
