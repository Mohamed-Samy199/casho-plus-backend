import Partner from "../../models/Partner.model.js";
import Wallet from "../../models/Wallet.model.js";
import User from "../../models/User.model.js";
import { Channel, UserRole } from "../../utils/common/index.js";
import { ApiError } from "../../utils/ApiError.js";
import { create, find, findById, findOne, findOneAndUpdate } from "../../db/database.repository.js";

export async function createPartner({ name, phoneNumbers, createAccount = false, password }, userId) {
  if (!Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
    throw ApiError.badRequest("يجب إضافة رقم هاتف واحد على الأقل للشريك.");
  }
  if (new Set(phoneNumbers).size !== phoneNumbers.length) {
    throw ApiError.badRequest("لا يمكن تكرار نفس رقم الهاتف للشريك.");
  }
  if (createAccount) {
    const existingUser = await User.findOne({ phoneNumbers: { $in: phoneNumbers } }).lean();
    if (existingUser) throw ApiError.conflict("أحد أرقام الهاتف مستخدم بالفعل مع حساب دخول آخر.");
  }
  if (phoneNumbers.length) {
    const existing = await findOne({
      model: Partner,
      filter: { phoneNumbers: { $in: phoneNumbers } },
    });
    if (existing) throw ApiError.conflict("رقم التلفون مستخدم بالفعل مع شريك آخر.");
  }

  const partner = await create({
    model: Partner,
    data: { name, phoneNumbers, createdBy: userId },
  });

  // كل رقم للشريك له Wallet مستقلة من لحظة تسجيله، حتى قبل أول عملية.
  if (phoneNumbers?.length) {
    await Wallet.insertMany(
      phoneNumbers.map((phoneNumber) => ({
        partner: partner._id,
        channel: Channel.VODAFONE_CASH,
        phoneNumber,
      }))
    );
  }

  let account = null;
  if (createAccount) {
    const user = await User.create({
      name,
      phoneNumbers,
      password,
      role: UserRole.ADMIN,
      partner: partner._id,
      createdBy: userId,
    });
    account = user.toSafeObject();
  }

  return { ...partner.toObject(), account };
}

export async function createPartnerAccount(partnerId, password, adminId) {
  const partner = await findById({ model: Partner, id: partnerId, options: { lean: true } });
  if (!partner) throw ApiError.notFound("الشريك غير موجود.");
  const phoneNumbers = partner.phoneNumbers || [];
  if (!phoneNumbers.length) throw ApiError.badRequest("لازم يكون للشريك رقم هاتف قبل إنشاء الحساب.");

  const existingAccount = await User.findOne({ partner: partnerId }).lean();
  if (existingAccount) throw ApiError.conflict("الشريك لديه حساب دخول بالفعل.");

  const existingUser = await User.findOne({ phoneNumbers: { $in: phoneNumbers } }).lean();
  if (existingUser) throw ApiError.conflict("رقم الهاتف مستخدم بالفعل مع حساب دخول آخر.");

  const account = await User.create({
    name: partner.name,
    phoneNumbers,
    password,
    role: UserRole.ADMIN,
    partner: partner._id,
    createdBy: adminId,
  });
  return account.toSafeObject();
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
  const account = await User.findOne({ partner: id })
    .select("name phoneNumbers email role isActive lastLoginAt")
    .lean();

  return { ...partner, lines, totalLiquidity, totalWalletBalance, account };
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

  await Wallet.create({
    partner: partner._id,
    channel: Channel.VODAFONE_CASH,
    phoneNumber: phone,
  });

  return partner;
}

export async function removePhoneNumber(partnerId, phone) {
  const partner = await findById({ model: Partner, id: partnerId, options: { lean: false } });
  if (!partner) throw ApiError.notFound("الشريك غير موجود.");

  const wallet = await Wallet.findOne({
    partner: partnerId,
    phoneNumber: phone,
  });
  if (wallet && (wallet.liquidityBalance > 0 || wallet.walletBalance > 0)) {
    throw ApiError.badRequest("لا يمكن حذف رقم عليه رصيد. صفّر الرصيد أولًا.");
  }

  partner.phoneNumbers = (partner.phoneNumbers || []).filter((p) => p !== phone);
  await partner.save();

  if (wallet) await Wallet.deleteOne({ _id: wallet._id });

  return partner;
}
