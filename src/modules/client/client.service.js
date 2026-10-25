import Client from "../../models/Client.model.js";
import Transaction from "../../models/Transaction.model.js";
import { ApiError } from "../../utils/ApiError.js";
import { create, find, findById, findOne, findOneAndUpdate, paginate } from "../../db/database.repository.js";

export async function createClient({ name, phoneNumbers, type, keyClientSettings, notes }, userId) {
  if (phoneNumbers?.length) {
    const existing = await findOne({
      model: Client,
      filter: { phoneNumbers: { $in: phoneNumbers } },
    });
    if (existing) throw ApiError.conflict("رقم التلفون مستخدم بالفعل مع عميل آخر.");
  }

  return create({
    model: Client,
    data: { name, phoneNumbers, type, keyClientSettings, notes, createdBy: userId },
  });
}

export async function listClients({ type, isActive, page = "all", size = 20 } = {}) {
  const filter = {};
  if (type) filter.type = type;
  if (isActive !== undefined) filter.isActive = isActive;

  const paginated = await paginate({
    model: Client,
    filter,
    page,
    size,
    options: { sort: { createdAt: -1 }, lean: true },
  });

  const clientIds = paginated.result.map((client) => client._id);
  if (!clientIds.length) return paginated;

  const summaries = await Transaction.aggregate([
    {
      $match: {
        partyType: "Client",
        partyId: { $in: clientIds },
        remainingAmount: { $gt: 0 },
        $or: [{ reversedAt: { $exists: false } }, { reversedAt: null }],
      },
    },
    {
      $group: {
        _id: "$partyId",
        owedByClient: {
          $sum: {
            $cond: [
              { $in: ["$stage", ["withdraw_liquidity", "withdraw_wallet_balance"]] },
              "$remainingAmount",
              0,
            ],
          },
        },
        owedToClient: {
          $sum: {
            $cond: [
              { $in: ["$stage", ["deposit_liquidity", "deposit_wallet_balance"]] },
              "$remainingAmount",
              0,
            ],
          },
        },
        openTransactions: { $sum: 1 },
        lastTransactionAt: { $max: "$createdAt" },
        nextDueAt: {
          $min: {
            $cond: [{ $ne: ["$agreedDueAt", null] }, "$agreedDueAt", null],
          },
        },
      },
    },
  ]);
  const summariesByClient = new Map(summaries.map((summary) => [String(summary._id), summary]));

  return {
    ...paginated,
    result: paginated.result.map((client) => ({
      ...client,
      financialSummary: summariesByClient.get(String(client._id)) || {
        owedByClient: 0,
        owedToClient: 0,
        openTransactions: 0,
        lastTransactionAt: null,
        nextDueAt: null,
      },
    })),
  };
}

export async function getClientById(id) {
  const client = await findById({ model: Client, id, options: { lean: true } });
  if (!client) throw ApiError.notFound("العميل غير موجود.");
  return client;
}

export async function updateClient(id, { name, notes, isActive, keyClientSettings }) {
  const client = await findOneAndUpdate({
    model: Client,
    filter: { _id: id },
    update: {
      ...(name !== undefined && { name }),
      ...(notes !== undefined && { notes }),
      ...(isActive !== undefined && { isActive }),
      ...(keyClientSettings !== undefined && { keyClientSettings }),
    },
    options: { lean: true },
  });
  if (!client) throw ApiError.notFound("العميل غير موجود.");
  return client;
}

export async function addPhoneNumber(clientId, phone) {
  const existing = await findOne({ model: Client, filter: { phoneNumbers: phone } });
  if (existing) throw ApiError.conflict("رقم التلفون ده مستخدم بالفعل مع عميل آخر.");

  const client = await findById({ model: Client, id: clientId, options: { lean: false } });
  if (!client) throw ApiError.notFound("العميل غير موجود.");

  client.phoneNumbers = [...(client.phoneNumbers || []), phone];
  await client.save();

  return client;
}

export async function removePhoneNumber(clientId, phone) {
  const client = await findById({ model: Client, id: clientId, options: { lean: false } });
  if (!client) throw ApiError.notFound("العميل غير موجود.");

  client.phoneNumbers = (client.phoneNumbers || []).filter((p) => p !== phone);
  await client.save();

  return client;
}
