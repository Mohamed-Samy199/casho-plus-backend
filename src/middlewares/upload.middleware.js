import multer from "multer";
import { ApiError } from "../utils/ApiError.js";

// ─────────────────────────────────────────────
// Storage
// ─────────────────────────────────────────────

const storage = multer.memoryStorage();

// ─────────────────────────────────────────────
// Allowed Types (صور/PDF بس — لإيصالات ومستندات الديون/العمليات لاحقًا)
// ─────────────────────────────────────────────

const allowedExtensions = [".jpg", ".jpeg", ".png", ".webp", ".pdf"];

const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

// ─────────────────────────────────────────────
// File Filter
// ─────────────────────────────────────────────

const fileFilter = (req, file, cb) => {
  const ext = file.originalname.substring(file.originalname.lastIndexOf(".")).toLowerCase();

  const extensionValid = allowedExtensions.includes(ext);
  const mimeValid = allowedMimeTypes.includes(file.mimetype);

  if (extensionValid && mimeValid) {
    return cb(null, true);
  }

  return cb(new Error("مسموح فقط بملفات JPG, JPEG, PNG, WEBP و PDF."), false);
};

// ─────────────────────────────────────────────
// Upload Middleware
// ─────────────────────────────────────────────

export const uploadFiles = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB لكل ملف (كافي لصور/إيصالات، مش نماذج STL زي المشروع القديم)
    files: 10,
  },
}).array("files", 10);

// ─────────────────────────────────────────────
// Promise Wrapper
// ─────────────────────────────────────────────

export const handleUpload = (req, res) =>
  new Promise((resolve, reject) => {
    uploadFiles(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        return reject(ApiError.badRequest(`خطأ في رفع الملف: ${err.message}`));
      }
      if (err) {
        return reject(ApiError.badRequest(err.message));
      }
      resolve();
    });
  });