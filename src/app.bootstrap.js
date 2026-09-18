import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import mongoSanitize from "express-mongo-sanitize";
import compression from "compression";
import xss from "xss";

import errorMiddleware from "./middlewares/error.middleware.js";
import authRoutes from "./modules/auth/auth.routes.js";
import partnerRoutes from "./modules/partner/partner.routes.js";
import clientRoutes from "./modules/client/client.routes.js";
import transactionRoutes from "./modules/transaction/transaction.routes.js";
import debtRoutes from "./modules/debt/debt.routes.js";
import capitalRoutes from "./modules/capital/capital.routes.js";
import commissionRuleRoutes from "./modules/commission-rule/commission-rule.routes.js";
import dashboardRoutes from "./modules/dashboard/dashboard.routes.js";
import notificationRoutes from "./modules/notification/notification.routes.js";
import attendanceRoutes from "./modules/attendance/attendance.routes.js";
import { UPLOADS_ROOT } from "./middlewares/upload.middleware.js";

import { ApiError } from "./utils/ApiError.js";
import { generalLimiter } from "./middlewares/rateLimit.middleware.js";

const app = express();

// ── Security & Parsing Middlewares ─────────────────────────
app.set("trust proxy", 1);
app.use(helmet());
app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
    },
  })
);

// ── XSS Prevention ───────────────────────────────────────────
app.use((req, _res, next) => {
  if (req.body) sanitizeObject(req.body);
  next();
});

const sanitizeObject = (obj) => {
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === "string") {
      obj[key] = xss(obj[key]);
    } else if (typeof obj[key] === "object" && obj[key] !== null) {
      sanitizeObject(obj[key]);
    }
  }
};

const ALLOWED_ORIGINS = [
  process.env.CLIENT_URL,
  "http://localhost:5173",
  "http://localhost:3000",
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ── NoSQL Injection Prevention ────────────────────────────────
app.use(mongoSanitize());

app.use(compression());
app.use("/api", generalLimiter);

if (process.env.NODE_ENV === process.env.DEVELOPMENT) {
  app.use(morgan("dev"));
}

// ── الملفات المرفوعة محليًا (إيصالات الديون وغيرها لاحقًا) ─────
app.use("/uploads", express.static(UPLOADS_ROOT));

// ── Routes ────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/partners", partnerRoutes);
app.use("/api/clients", clientRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/debts", debtRoutes);
app.use("/api/capital", capitalRoutes);
app.use("/api/commission-rules", commissionRuleRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/attendance", attendanceRoutes);

app.get("/api/health", (req, res) => {
  res.status(200).json({ success: true, message: "نظام Casho Plus شغال." });
});

app.all("*", (req, res, next) => {
  next(ApiError.notFound(`المسار ${req.originalUrl} غير موجود.`));
});

app.use(errorMiddleware);

export default app;