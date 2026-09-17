import dotenv from 'dotenv';

dotenv.config({
  path: './src/config/.env'
});

// dotenv.config({
//   path: './src/config/.env.production'
// });

const required = [
  'PORT',
  'MONGODB_URI',
  'JWT_SECRET',
  'JWT_EXPIRES_IN',
  'CLIENT_URL',
];

required.forEach((key) => {
  if (!process.env[key]) {
    throw new Error(`❌ Missing required environment variable: ${key}`);
  }
});

export const NODE_ENV   = process.env.NODE_ENV || process.env.DEVELOPMENT;
export const PORT       = process.env.PORT || 4000;
export const CLIENT_URL = process.env.CLIENT_URL;
export const MONGODB_URI = process.env.MONGODB_URI;

export const JWT_SECRET            = process.env.JWT_SECRET;
export const JWT_EXPIRES_IN        = process.env.JWT_EXPIRES_IN;

export const ADMIN_NAME = process.env.SEED_ADMIN_NAME;
export const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL;
export const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD;

export const LOW_BALANCE_THRESHOLD = process.env.LOW_BALANCE_THRESHOLD || 100000; // 1000 جنيه (بالقرش) افتراضي