import "dotenv/config";
import mongoose from "mongoose";
import { MONGODB_URI } from "./config/env.config.js";
import CommissionRule from "./models/CommissionRule.model.js";
import User from "./models/User.model.js";
import { Channel, OperationStage, UserRole } from "./utils/common/index.js";

const defaultVodafoneCashRules = [
  {
    channel: Channel.VODAFONE_CASH,
    stage: OperationStage.WITHDRAW_LIQUIDITY,
    type: "proportional",
    proportionalRate: 1000, // 10 جنيه لكل 1000 جنيه
    proportionalThreshold: 100000, // 1000 جنيه
    flatAmount: 500, // 5 جنيه تحت الألف
  },
  {
    channel: Channel.VODAFONE_CASH,
    stage: OperationStage.DEPOSIT_LIQUIDITY,
    type: "flat",
    flatAmount: 0,
  },
  {
    channel: Channel.VODAFONE_CASH,
    stage: OperationStage.WITHDRAW_WALLET_BALANCE,
    type: "flat",
    flatAmount: 0,
  },
  {
    channel: Channel.VODAFONE_CASH,
    stage: OperationStage.DEPOSIT_WALLET_BALANCE,
    type: "flat",
    flatAmount: 1000, // 10 جنيه على العملية
  },
];

async function seedCommissionRules() {
  for (const rule of defaultVodafoneCashRules) {
    await CommissionRule.findOneAndUpdate(
      { channel: rule.channel, stage: rule.stage },
      rule,
      { upsert: true, new: true }
    );
  }
  console.log("✅ Default commission rules seeded.");
}

async function seedFirstAdmin() {
  const existingAdmin = await User.findOne({ role: UserRole.ADMIN });
  if (existingAdmin) {
    console.log("ℹ️  Admin already exists, skipping.");
    return;
  }

  await User.create({
    name: "Admin",
    phoneNumbers: ["01000000000"], // غيّره فورًا بعد أول تسجيل دخول
    password: "Admin@12345", // غيّرها فورًا بعد أول تسجيل دخول
    role: UserRole.ADMIN,
  });
  console.log(
    "✅ First admin created (phone: 01000000000, password: Admin@12345) — غيّرهم فورًا."
  );
}

async function run() {
  await mongoose.connect(MONGODB_URI);
  await seedCommissionRules();
  await seedFirstAdmin();
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});