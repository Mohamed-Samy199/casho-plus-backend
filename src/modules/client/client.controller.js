import * as clientService from "./client.service.js";
import asyncHandler from "../../utils/asyncHandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";

export const createClientHandler = asyncHandler(async (req, res) => {
  const client = await clientService.createClient(req.body, req.user._id);
  return ApiResponse.created(res, "تم إضافة العميل بنجاح.", client);
});

export const listClientsHandler = asyncHandler(async (req, res) => {
  const result = await clientService.listClients(req.query);
  return ApiResponse.ok(res, "تم جلب العملاء بنجاح.", result);
});

export const getClientHandler = asyncHandler(async (req, res) => {
  const client = await clientService.getClientById(req.params.id);
  return ApiResponse.ok(res, "تم جلب بيانات العميل بنجاح.", client);
});

export const updateClientHandler = asyncHandler(async (req, res) => {
  const client = await clientService.updateClient(req.params.id, req.body);
  return ApiResponse.ok(res, "تم تحديث بيانات العميل بنجاح.", client);
});

export const addPhoneNumberHandler = asyncHandler(async (req, res) => {
  const client = await clientService.addPhoneNumber(req.params.id, req.body.phone);
  return ApiResponse.ok(res, "تم إضافة رقم التلفون بنجاح.", client);
});

export const removePhoneNumberHandler = asyncHandler(async (req, res) => {
  const client = await clientService.removePhoneNumber(req.params.id, req.params.phone);
  return ApiResponse.ok(res, "تم حذف رقم التلفون بنجاح.", client);
});