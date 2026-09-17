import Partner from "../../models/Partner.model.js";
import Wallet from "../../models/Wallet.model.js";
import { ApiError } from "../../utils/ApiError.js";
import { create, find, findById, findOne, findOneAndUpdate } from "../../db/database.repository.js";

export async function createPartner({ name, phoneNumbers }, userId) {
  if (phoneNumbers?.length) {
    const existing = await findOne({
      model: Partner,
      filter: { phoneNumbers: { $in: phoneNumbers } },
    });
    if (existing) throw ApiError.conflict("رقم التلفون مستخدم بالفعل مع شريك آخر.");
  }

  return create({
    model: Partner,
    data: { name, phoneNumbers, createdBy: userId },
  });
}

export async function listPartners({ isActive } = {}) {
  const filter = {};
  if (isActive !== undefined) filter.isActive = isActive;
  return find({ model: Partner, filter, options: { sort: { createdAt: -1 }, lean: true } });
}

/**
 * تفاصيل شريك واحد + رصيده مفصّل لكل رقم/شريحة على حدة
 */
export async function getPartnerDetails(id) {
  const partner = await findById({ model: Partner, id, options: { lean: true } });
  if (!partner) throw ApiError.notFound("الشريك غير موجود.");

  const wallets = await Wallet.find({ partner: id }).lean();

  const lines = wallets.map((w) => ({
    channel: w.channel,
    phoneNumber: w.phoneNumber,
    liquidityBalance: w.liquidityBalance,
    walletBalance: w.walletBalance,
  }));

  const totalLiquidity = lines.reduce((sum, l) => sum + l.liquidityBalance, 0);
  const totalWalletBalance = lines.reduce((sum, l) => sum + l.walletBalance, 0);

  return { ...partner, lines, totalLiquidity, totalWalletBalance };
}

export async function updatePartner(id, { name, isActive }) {
  const partner = await findOneAndUpdate({
    model: Partner,
    filter: { _id: id },
    update: { ...(name !== undefined && { name }), ...(isActive !== undefined && { isActive }) },
    options: { lean: true },
  });
  if (!partner) throw ApiError.notFound("الشريك غير موجود.");
  return partner;
}

export async function addPhoneNumber(partnerId, phone) {
  const existing = await findOne({ model: Partner, filter: { phoneNumbers: phone } });
  if (existing) throw ApiError.conflict("رقم التلفون ده مستخدم بالفعل مع شريك آخر.");

  const partner = await findById({ model: Partner, id: partnerId, options: { lean: false } });
  if (!partner) throw ApiError.notFound("الشريك غير موجود.");

  partner.phoneNumbers = [...(partner.phoneNumbers || []), phone];
  await partner.save();

  return partner;
}

export async function removePhoneNumber(partnerId, phone) {
  const partner = await findById({ model: Partner, id: partnerId, options: { lean: false } });
  if (!partner) throw ApiError.notFound("الشريك غير موجود.");

  partner.phoneNumbers = (partner.phoneNumbers || []).filter((p) => p !== phone);
  await partner.save();

  return partner;
}