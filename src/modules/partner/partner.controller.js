import * as partnerService from "./partner.service.js";
import asyncHandler from "../../utils/asyncHandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";

export const createPartnerHandler = asyncHandler(async (req, res) => {
  const partner = await partnerService.createPartner(req.body, req.user._id);
  return ApiResponse.created(res, "تم إضافة الشريك بنجاح.", partner);
});

export const listPartnersHandler = asyncHandler(async (req, res) => {
  const partners = await partnerService.listPartners(req.query);
  return ApiResponse.ok(res, "تم جلب الشركاء بنجاح.", partners);
});

export const getPartnerHandler = asyncHandler(async (req, res) => {
  const partner = await partnerService.getPartnerDetails(req.params.id);
  return ApiResponse.ok(res, "تم جلب بيانات الشريك بنجاح.", partner);
});

export const updatePartnerHandler = asyncHandler(async (req, res) => {
  const partner = await partnerService.updatePartner(req.params.id, req.body);
  return ApiResponse.ok(res, "تم تحديث بيانات الشريك بنجاح.", partner);
});

export const createPartnerAccountHandler = asyncHandler(async (req, res) => {
  const account = await partnerService.createPartnerAccount(
    req.params.id,
    req.body.password,
    req.user._id
  );
  return ApiResponse.created(res, "تم إنشاء حساب دخول الشريك بنجاح.", account);
});

export const addPhoneNumberHandler = asyncHandler(async (req, res) => {
  const partner = await partnerService.addPhoneNumber(req.params.id, req.body.phone);
  return ApiResponse.ok(res, "تم إضافة رقم التلفون بنجاح.", partner);
});

export const removePhoneNumberHandler = asyncHandler(async (req, res) => {
  const partner = await partnerService.removePhoneNumber(req.params.id, req.params.phone);
  return ApiResponse.ok(res, "تم حذف رقم التلفون بنجاح.", partner);
});
