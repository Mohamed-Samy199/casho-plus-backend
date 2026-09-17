import { ApiError } from "../utils/ApiError.js";
import { UserRole } from "../utils/common/index.js";

export const isAdmin = (req, res, next) => {
  if (req.user.role !== UserRole.ADMIN) {
    throw ApiError.forbidden("هذا الإجراء متاح للأدمن فقط.");
  }
  next();
};