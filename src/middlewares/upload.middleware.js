import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { ApiError } from "../utils/ApiError.js";

// ─────────────────────────────────────────────
// التخزين محلي على نفس السيرفر (بدل Cloudinary)
// كل الملفات بتتحفظ جوه /uploads/<subfolder>/ في جذر المشروع
// ─────────────────────────────────────────────

export const UPLOADS_ROOT = path.join(process.cwd(), "uploads");

const allowedExtensions = [".jpg", ".jpeg", ".png", ".webp", ".pdf"];
const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const extensionValid = allowedExtensions.includes(ext);
  const mimeValid = allowedMimeTypes.includes(file.mimetype);

  if (extensionValid && mimeValid) {
    return cb(null, true);
  }
  return cb(new Error("مسموح فقط بملفات JPG, JPEG, PNG, WEBP و PDF."), false);
};

/**
 * بيرجع multer middleware بيحفظ الملفات جوه /uploads/<subfolder>/
 * بأسماء عشوائية (عشان محدش يقدر يخمن اسم ملف حد تاني أو يعمل path traversal)
 */
export function createUploader(subfolder) {
  const destination = path.join(UPLOADS_ROOT, subfolder);
  fs.mkdirSync(destination, { recursive: true });

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, destination),
    filename: (req, file, cb) => {
      const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${path.extname(
        file.originalname
      )}`;
      cb(null, uniqueName);
    },
  });

  return multer({
    storage,
    fileFilter,
    limits: {
      fileSize: 10 * 1024 * 1024, // 10 MB لكل ملف
      files: 10,
    },
  }).array("files", 10);
}