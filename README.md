# Casho Plus — Backend

Backend API for the financial operations management system of the Kashu Plus office. Node.js + Express + MongoDB.


## Features
- Vodafone Cash transactions (cash deposits/withdrawals, wallet balance deposits/withdrawals) — separate balances for each number/SIM card
- Adjustable commission rates without modifying code (`CommissionRule`)
- Debt management (receivables/payables) with flexible repayment options that can optionally impact total capital
- Aggregation of total capital across all partners and numbers
- Alerts (low balance, overdue debts, overdue key clients)
- Attendance tracking (single session/day, monthly reports)
- Admin/Employee permission levels

## Operation

```bash
npm install
cp .env.example .env   # واملأ القيم الحقيقية بتاعتك
npm run seed            # بيعمل أول أدمن + قواعد العمولة الافتراضية
npm run dev
```

The server will run on `http://localhost:5000` (or the `PORT` you specified in `.env`).

After the first `npm run seed`, you will find an admin account ready:
- Phone number: `01000000000`
- Password: `Admin@12345`

**Change this password immediately after your first login.**

## Project Structure
```
src/
├── config/       # Environment variables
├── db/           # MongoDB connection + general helpers
├── models/       # Mongoose schemas
├── middlewares/  # auth, validation, error handling, rate limiting
├── modules/      # Each feature in its own folder (controller/routes/service/validation)
└── utils/        # ApiError, ApiResponse, asyncHandler, enums
```

## Key Point
All amounts are stored in **piastres** (as integers) rather than pounds to avoid decimal point issues. Conversion to pounds happens only on the front end at the time of display.