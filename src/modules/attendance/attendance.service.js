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
  const date = startOfDay();

  const record = await Attendance.findOne({ user: userId, date });
  if (!record || !record.checkInAt) {
    throw ApiError.badRequest("لازم تسجل حضور الأول قبل الانصراف.");
  }
  if (record.checkOutAt) {
    throw ApiError.badRequest("تم تسجيل الانصراف اليوم بالفعل.");
  }

  record.checkOutAt = new Date();
  await record.save();
  return record;
}

// ── حالة اليوم — عشان الفرونت يعرف يعرض أي زرار ─────────────
export async function getTodayStatus(userId) {
  const date = startOfDay();
  const record = await Attendance.findOne({ user: userId, date }).lean();
  return record || null;
}

// ── إضافة/تعديل سجل حضور يدويًا (أدمن بس) ────────────────────
export async function adminUpsertAttendance(
  { userId, date, checkInAt, checkOutAt, notes },
  adminId
) {
  const day = startOfDay(new Date(date));
  const normalizedCheckIn = checkInAt ? new Date(checkInAt) : null;
  let normalizedCheckOut = checkOutAt ? new Date(checkOutAt) : null;

  // حماية إضافية للسجلات اليدوية القديمة/الواردة بنفس التاريخ:
  // 03:00 م إلى 02:00 ص تعني أن الانصراف في اليوم التالي.
  if (normalizedCheckIn && normalizedCheckOut && normalizedCheckOut < normalizedCheckIn) {
    normalizedCheckOut = new Date(normalizedCheckOut);
    normalizedCheckOut.setDate(normalizedCheckOut.getDate() + 1);
  }

  const record = await Attendance.findOneAndUpdate(
    { user: userId, date: day },
    {
      user: userId,
      date: day,
      ...(checkInAt !== undefined && { checkInAt: normalizedCheckIn }),
      ...(checkOutAt !== undefined && { checkOutAt: normalizedCheckOut }),
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
                $divide: [
                  {
                    $subtract: [
                      {
                        $cond: [
                          { $lt: ["$checkOutAt", "$checkInAt"] },
                          { $add: ["$checkOutAt", 24 * 60 * 60 * 1000] },
                          "$checkOutAt",
                        ],
                      },
                      "$checkInAt",
                    ],
                  },
                  1000 * 60 * 60,
                ],
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
