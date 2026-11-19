import '../src/config/loadEnv.js';
import mongoose from 'mongoose';
import connectDatabase from '../src/config/database.js';
import RevokedToken from '../src/models/RevokedToken.js';

const [role, id] = process.argv.slice(2);
if (!['user', 'store'].includes(role) || !/^[a-f\d]{24}$/i.test(id || '')) {
  throw new Error('Usage: node scripts/revokeSessions.js <user|store> <account-id>');
}
try {
  await connectDatabase();
  await RevokedToken.updateOne({ _id: `account:${role}:${id}` }, { $set: {
    revokedBefore: new Date(), expiresAt: new Date(Date.now() + 60 * 60 * 1000)
  } }, { upsert: true });
  console.log('Existing account sessions revoked. A fresh sign-in is required.');
} finally {
  await mongoose.disconnect();
}
