import mongoose from 'mongoose';
import dns from 'dns';
import { MONGODB_URI } from '../config/env.config.js';

dns.setServers(['8.8.8.8', '1.1.1.1']);

export const connectDB = async () => {
  try {
    await mongoose.connect(MONGODB_URI);

    console.log('✅ MongoDB Connected');
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};