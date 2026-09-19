import Attendance from "../../models/Attendance.model.js";
import { ApiError } from "../../utils/ApiError.js";
import { paginate } from "../../db/database.repository.js";

function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfMonth(year, month) {
  // month: 1-12
  return new Date(year, month, 0, 23, 59, 59, 999);
}

function startOfMonth(year, month) {
  return new Date(year, month - 1, 1, 0, 0, 0, 0);
}

// ── تسجيل حضور — مرة واحدة بس في اليوم ────────────────────────
export async function checkIn(userId) {
  const date = startOfDay();

  const openRecord = await Attendance.findOne({
    user: userId,
    checkInAt: { $ne: null },
    checkOutAt: null,
  }).sort({ checkInAt: -1 });
  if (openRecord) {
    throw ApiError.badRequest(
      "لازم تسجل الانصراف للحضور المفتوح الأول قبل تسجيل حضور جديد."
    );
  }

  const existing = await Attendance.findOne({ user: userId, date });
  if (existing?.checkInAt) {
    throw ApiError.badRequest("تم تسجيل الحضور اليوم بالفعل.");
  }

  if (existing) {
    existing.checkInAt = new Date();
    await existing.save();
    return existing;
  }

  return Attendance.create({ user: userId, date, checkInAt: new Date() });
}

// ── تسجيل انصراف — لازم يكون سجّل حضور الأول ─────────────────
export async function checkOut(userId) {
  const record = await Attendance.findOne({
    user: userId,
    checkInAt: { $ne: null },
    checkOutAt: null,
  }).sort({ checkInAt: -1 });
  if (!record) {
    throw ApiError.badRequest("لازم تسجل حضور الأول قبل الانصراف.");
  }

  record.checkOutAt = new Date();
  await record.save();
  return record;
}

// ── حالة اليوم — عشان الفرونت يعرف يعرض أي زرار ─────────────
export async function getTodayStatus(userId) {
  const date = startOfDay();
  // السجل المفتوح له الأولوية حتى يظل زر الانصراف ظاهرًا بعد منتصف الليل.
  const openRecord = await Attendance.findOne({
    user: userId,
    checkInAt: { $ne: null },
    checkOutAt: null,
  })
    .sort({ checkInAt: -1 })
    .lean();
  if (openRecord) return openRecord;

  const record = await Attendance.findOne({ user: userId, date }).lean();
  return record || null;
}

// ── إضافة/تعديل سجل حضور يدويًا (أدمن بس) ────────────────────
export async function adminUpsertAttendance(
  { userId, date, checkInAt, checkOutAt, notes },
  adminId
) {
  const day = startOfDay(new Date(date));
  let normalizedCheckOutAt = checkOutAt ? new Date(checkOutAt) : checkOutAt;
  if (checkInAt && normalizedCheckOutAt) {
    const normalizedCheckInAt = new Date(checkInAt);
    if (normalizedCheckOutAt < normalizedCheckInAt) {
      normalizedCheckOutAt = new Date(normalizedCheckOutAt.getTime() + 24 * 60 * 60 * 1000);
    }
  }

  const record = await Attendance.findOneAndUpdate(
    { user: userId, date: day },
    {
      user: userId,
      date: day,
      ...(checkInAt !== undefined && { checkInAt: checkInAt ? new Date(checkInAt) : null }),
      ...(checkOutAt !== undefined && { checkOutAt: normalizedCheckOutAt || null }),
      notes,
      recordedBy: adminId,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return record;
}

// ── سجل الحضور (أدمن بس، أو الموظف لنفسه) ─────────────────────
export async function listAttendance({ userId, from, to, page = "all", size = 30 }) {
  const filter = {};
  if (userId) filter.user = userId;
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = startOfDay(new Date(from));
    if (to) filter.date.$lte = startOfDay(new Date(to));
  }

  return paginate({
    model: Attendance,
    filter,
    page,
    size,
    options: {
      sort: { date: -1 },
      populate: [{ path: "user", select: "name" }],
      lean: true,
    },
  });
}

// ── تقرير شهري: عدد أيام الحضور + إجمالي الساعات لكل موظف ─────
export async function getMonthlyReport({ year, month }) {
  const from = startOfMonth(year, month);
  const to = endOfMonth(year, month);

  const report = await Attendance.aggregate([
    { $match: { date: { $gte: from, $lte: to }, checkInAt: { $ne: null } } },
    {
      $addFields: {
        hoursWorked: {
          $cond: [
            { $and: ["$checkInAt", "$checkOutAt"] },
            {
              $let: {
                vars: { durationMs: { $subtract: ["$checkOutAt", "$checkInAt"] } },
                in: {
                  $divide: [
                    {
                      $cond: [
                        { $lt: ["$$durationMs", 0] },
                        { $add: ["$$durationMs", 24 * 60 * 60 * 1000] },
                        "$$durationMs",
                      ],
                    },
                    1000 * 60 * 60,
                  ],
                },
              },
            },
            0,
          ],
        },
      },
    },
    {
      $group: {
        _id: "$user",
        daysPresent: { $sum: 1 },
        totalHours: { $sum: "$hoursWorked" },
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "user",
      },
    },
    { $unwind: "$user" },
    {
      $project: {
        _id: 0,
        userId: "$_id",
        name: "$user.name",
        daysPresent: 1,
        totalHours: { $round: ["$totalHours", 1] },
      },
    },
    { $sort: { name: 1 } },
  ]);

  return report;
}
