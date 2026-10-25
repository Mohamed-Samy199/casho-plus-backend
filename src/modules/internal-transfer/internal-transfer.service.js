import mongoose from "mongoose";
import Wallet from "../../models/Wallet.model.js";
import User from "../../models/User.model.js";
import Partner from "../../models/Partner.model.js";
import InternalTransfer from "../../models/InternalTransfer.model.js";
import { ApiError } from "../../utils/ApiError.js";

const OWNER_MODELS = { User, Partner };
const getBalanceKey = (asset) => (asset === "wallet" ? "walletBalance" : "liquidityBalance");

export async function listAccounts() {
  const [users, partners, wallets] = await Promise.all([
    User.find({ isActive: { $ne: false } }).select("name phoneNumbers role partner").sort({ name: 1 }).lean(),
    Partner.find({ isActive: { $ne: false } }).select("name phoneNumbers").sort({ name: 1 }).lean(),
    Wallet.find({}).select("ownerType owner partner channel phoneNumber liquidityBalance walletBalance").lean(),
  ]);
  const result = [];
  const normalize = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  const linkedUsersByPartner = new Map(
    users
      .filter((user) => user.partner)
      .map((user) => [String(user.partner), user])
  );
  const partnerNames = new Set(partners.map((partner) => normalize(partner.name)));
  const partnerPhones = new Set(partners.flatMap((partner) => (partner.phoneNumbers || []).map(normalize)));
  const getOwnerWallets = (record, type) => {
    const directWallets = wallets.filter((wallet) =>
      type === "User"
        ? wallet.ownerType === "User" && String(wallet.owner) === String(record._id)
        : (wallet.ownerType === "Partner" || !wallet.ownerType) && String(wallet.partner || wallet.owner) === String(record._id)
    );
    // عند تحويل الشريك إلى أدمن قد تظل المحافظ القديمة مملوكة لسجل Partner.
    // نعرضها مع الحساب الحالي، مع الاحتفاظ بمالك المحفظة الحقيقي للتنفيذ.
    if (type !== "User" || !record.partner) return directWallets;
    const legacyPartnerWallets = wallets.filter((wallet) =>
      (wallet.ownerType === "Partner" || !wallet.ownerType) && String(wallet.partner || wallet.owner) === String(record.partner)
    );
    const seen = new Set(directWallets.map((wallet) => String(wallet._id)));
    return [...directWallets, ...legacyPartnerWallets.filter((wallet) => !seen.has(String(wallet._id)))];
  };
  const addOwner = (record, type, walletsOverride) => {
    const ownerWallets = walletsOverride || getOwnerWallets(record, type);
    result.push({
      type,
      id: record._id,
      name: record.name,
      role: record.role,
      phoneNumbers: record.phoneNumbers || [],
      wallets: ownerWallets.map((wallet) => ({
        id: wallet._id,
        ownerType: wallet.ownerType || (wallet.partner ? "Partner" : type),
        ownerId: wallet.owner || wallet.partner || record._id,
        channel: wallet.channel,
        phoneNumber: wallet.phoneNumber,
        liquidityBalance: wallet.liquidityBalance || 0,
        walletBalance: wallet.walletBalance || 0,
      })),
    });
  };
  // الحساب المرتبط بصلاحية «شريك» يمثل نفس سجل الشريك، فلا نعرض نسختين.
  // إذا تغيرت الصلاحية إلى أدمن/موظف نعرض حساب User فقط.
  users.forEach((user) => {
    if (user.partner && user.role === "partner") return;
    if (!user.partner && (partnerNames.has(normalize(user.name)) || (user.phoneNumbers || []).some((phone) => partnerPhones.has(normalize(phone))))) return;
    addOwner(user, "User");
  });
  const seenPartnerNames = new Set();
  const seenPartnerPhones = new Set();
  const orderedPartners = [...partners].sort((left, right) => {
    const leftLinkedPartner = linkedUsersByPartner.get(String(left._id));
    const rightLinkedPartner = linkedUsersByPartner.get(String(right._id));
    const leftIsCurrentPartner = leftLinkedPartner?.role === "partner" ? 1 : 0;
    const rightIsCurrentPartner = rightLinkedPartner?.role === "partner" ? 1 : 0;
    if (leftIsCurrentPartner !== rightIsCurrentPartner) return rightIsCurrentPartner - leftIsCurrentPartner;
    const leftWalletCount = getOwnerWallets(left, "Partner").length;
    const rightWalletCount = getOwnerWallets(right, "Partner").length;
    if (leftWalletCount !== rightWalletCount) return rightWalletCount - leftWalletCount;
    return new Date(right.createdAt || 0) - new Date(left.createdAt || 0);
  });
  orderedPartners.forEach((partner) => {
    const linkedUser = linkedUsersByPartner.get(String(partner._id));
    if (linkedUser && linkedUser.role !== "partner") return;
    const nameKey = normalize(partner.name);
    const phones = (partner.phoneNumbers || []).map((phone) => normalize(phone));
    // لا نعرض سجل شريك قديمًا إذا كان نفس الشخص موجودًا كحساب User حالي.
    // حماية إضافية من السجلات المكررة القديمة بنفس الاسم أو أحد أرقام الهاتف.
    if (seenPartnerNames.has(nameKey) || phones.some((phone) => seenPartnerPhones.has(phone))) return;
    addOwner(partner, "Partner");
    seenPartnerNames.add(nameKey);
    phones.forEach((phone) => seenPartnerPhones.add(phone));
  });
  return result;
}

export async function listTransfers({ page = 1, size = 20 } = {}) {
  const pageNumber = Number(page);
  const pageSize = Number(size);
  const [result, total] = await Promise.all([
    InternalTransfer.find({})
      .populate("sourceOwner", "name")
      .populate("targetOwner", "name")
      .populate("createdBy", "name")
      .sort({ createdAt: -1 })
      .skip((pageNumber - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    InternalTransfer.countDocuments({}),
  ]);
  return { result, total, currentPage: pageNumber, pages: Math.ceil(total / pageSize) };
}

export async function createTransfer({
  sourceOwnerType,
  sourceOwnerId,
  sourceWalletId,
  targetOwnerType,
  targetOwnerId,
  targetWalletId,
  asset,
  amount,
  notes,
  userId,
}) {
  if (sourceWalletId === targetWalletId) throw ApiError.badRequest("لا يمكن التحويل إلى نفس المحفظة.");
  const numericAmount = Number(amount);
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const SourceModel = OWNER_MODELS[sourceOwnerType];
      const TargetModel = OWNER_MODELS[targetOwnerType];
      if (!SourceModel || !TargetModel) throw ApiError.badRequest("نوع الحساب غير صحيح.");
      const [sourceOwner, targetOwner, sourceWallet, targetWallet] = await Promise.all([
        SourceModel.findById(sourceOwnerId).select("name isActive").session(session).lean(),
        TargetModel.findById(targetOwnerId).select("name isActive").session(session).lean(),
        Wallet.findById(sourceWalletId).session(session),
        Wallet.findById(targetWalletId).session(session),
      ]);
      if (!sourceOwner || !targetOwner) throw ApiError.notFound("أحد الحسابين غير موجود.");
      if (sourceOwner.isActive === false || targetOwner.isActive === false) throw ApiError.badRequest("لا يمكن التحويل من أو إلى حساب غير نشط.");
      if (!sourceWallet || !targetWallet) throw ApiError.notFound("المحفظة المحددة غير موجودة.");
      const owns = (wallet, ownerType, ownerId) => ownerType === "User"
        ? wallet.ownerType === "User" && String(wallet.owner) === String(ownerId)
        : (wallet.ownerType === "Partner" || !wallet.ownerType) && String(wallet.partner || wallet.owner) === String(ownerId);
      if (!owns(sourceWallet, sourceOwnerType, sourceOwnerId) || !owns(targetWallet, targetOwnerType, targetOwnerId)) {
        throw ApiError.badRequest("المحفظة لا تتبع الحساب المحدد.");
      }
      const key = getBalanceKey(asset);
      const sourceBefore = sourceWallet[key] || 0;
      const targetBefore = targetWallet[key] || 0;
      if (!Number.isInteger(numericAmount) || numericAmount < 1) throw ApiError.badRequest("المبلغ يجب أن يكون أكبر من صفر وبالقروش.");
      if (sourceBefore < numericAmount) throw ApiError.badRequest(asset === "wallet" ? "رصيد المحفظة في الحساب المصدر غير كافٍ." : "السيولة في الحساب المصدر غير كافية.");
      const sourceAfter = sourceBefore - numericAmount;
      const targetAfter = targetBefore + numericAmount;
      sourceWallet[key] = sourceAfter;
      targetWallet[key] = targetAfter;
      await sourceWallet.save({ session });
      await targetWallet.save({ session });
      const [transfer] = await InternalTransfer.create([{
        sourceOwnerType,
        sourceOwner: sourceOwnerId,
        sourceWallet: sourceWalletId,
        sourcePhoneNumber: sourceWallet.phoneNumber,
        targetOwnerType,
        targetOwner: targetOwnerId,
        targetWallet: targetWalletId,
        targetPhoneNumber: targetWallet.phoneNumber,
        asset,
        amount: numericAmount,
        sourceBalanceBefore: sourceBefore,
        sourceBalanceAfter: sourceAfter,
        targetBalanceBefore: targetBefore,
        targetBalanceAfter: targetAfter,
        notes,
        createdBy: userId,
      }], { session });
      result = transfer;
    });
    return result;
  } finally {
    await session.endSession();
  }
}
