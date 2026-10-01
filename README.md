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

The server will run on `http://localhost:5000` (or the `PORT` you specified in `.env` ).

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

## Transaction settlement retries

`PATCH /api/transactions/:id/settle` requires an `Idempotency-Key` header (8–128 characters). The frontend generates one key per settlement attempt and reuses it when retrying the same request. Reusing a key with a different amount is rejected, preventing duplicate payments.

`POST /api/transactions` uses the same `Idempotency-Key` rule. A repeated request with the same key and data returns the original transaction without applying the wallet effect again. Reusing the key with different data is rejected.

## Transaction reversals

`POST /api/transactions/:id/reverse` is available to admins only and requires an `Idempotency-Key` header. It never deletes or edits away the original transaction: it creates a linked transaction with the exact opposite wallet/liquidity effects, marks the original as reversed, and stores the reason and user for audit. Each original transaction can be handled once.

`POST /api/transactions/:id/correct` is the admin-facing correction flow. It requires `targetStage` and optionally accepts `reason`. The system atomically creates the opposite-effect audit entry and a new transaction using the selected stage, while preserving the original transaction and linking all records. The current amount and commission stay unchanged during stage correction; changing amounts is intentionally a separate protected workflow.

## Operation references

New transactions receive an immutable internal reference such as `CP-20261001-7A3F9C12`. It is safe to show on receipts and use for search/support; it is not a Vodafone/provider reference. Older records created before this field was introduced may display without an internal reference until migrated.

The model also has a schema-level default, so every new transaction receives a reference even if a future creation path forgets to set it explicitly. To backfill legacy records without changing any financial values, run this once after configuring the database:

```bash
npm run migrate:transaction-references
```

The migration only sets missing `referenceNumber` values and then verifies the unique index.

## Daily reconciliation

Admins can review `GET /api/capital/reconciliation?date=YYYY-MM-DD` and close the day with `POST /api/capital/reconciliation/close`. The report includes transaction count, internal-transfer count, transaction and balance-adjustment movements, expected liquidity/wallet closing balances, and the counted actual balances. The close stores immutable daily audit data and calculates variance as `actual - expected`; it does not edit transactions or wallet balances. The frontend exposes this under the admin `رأس المال` page as `التقفيل اليومي`.

## Request input and XSS handling

JSON and URL-encoded body parsers run before `express-mongo-sanitize`. Mutation routes validate and strip unknown fields with Joi. The backend does not globally rewrite user text with an XSS sanitizer, because that can corrupt legitimate notes and financial labels; the frontend renders text through React's default escaping. If an HTML-rendering feature is added later, sanitize that specific HTML field at its output boundary and keep `dangerouslySetInnerHTML` out of ordinary text rendering.