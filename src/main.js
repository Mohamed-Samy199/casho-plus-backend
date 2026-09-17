import "dotenv/config";
import app from "./app.bootstrap.js";
import { connectDB } from "./db/connection.db.js";
const PORT = process.env.PORT || 5000;

const start = async () => {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT} [${process.env.NODE_ENV || process.env.PRODUCTION}]`);
  });
};

start();