import * as notificationService from "./notification.service.js";
import asyncHandler from "../../utils/asyncHandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";

export const listNotificationsHandler = asyncHandler(async (req, res) => {
  const [notifications, unreadCount] = await Promise.all([
    notificationService.getNotifications(req.query),
    notificationService.getUnreadCount(),
  ]);
  return ApiResponse.ok(res, "تم جلب التنبيهات بنجاح.", { notifications, unreadCount });
});

export const markAsReadHandler = asyncHandler(async (req, res) => {
  const notification = await notificationService.markAsRead(req.params.id, req.user._id);
  return ApiResponse.ok(res, "تم تعليم التنبيه كمقروء.", notification);
});

export const markAllAsReadHandler = asyncHandler(async (req, res) => {
  await notificationService.markAllAsRead(req.user._id);
  return ApiResponse.ok(res, "تم تعليم كل التنبيهات كمقروءة.");
});