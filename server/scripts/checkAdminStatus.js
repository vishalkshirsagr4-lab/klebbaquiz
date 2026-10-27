/**
 * Diagnostic tool to inspect administrator accounts in QuizMaster.
 *
 * Checks:
 *   - Total accounts in the database
 *   - Administrator accounts and their status (active, locked, failed logins)
 *   - Does NOT expose passwords or password hashes
 */
const mongoose = require('mongoose');
const dns = require('dns');

try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {}

require('dotenv').config();

const User = require('../src/models/User');

async function run() {
  console.log('\n===================================================');
  console.log('   QuizMaster: Administrator Status Diagnostic CLI');
  console.log('===================================================\n');

  const uri = process.env.MONGODB_URI;
  if (!uri || uri.trim() === '') {
    console.error('[Error] MONGODB_URI environment variable is not defined.');
    process.exit(1);
  }

  console.log('[Connecting] Connecting to database...');
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
    console.log('[Connected] Database connection established.\n');
  } catch (err) {
    console.error('\n[Database Error] Could not connect to database:', err.message);
    if (err.name === 'MongoServerSelectionError' || err.message.includes('buffering timed out')) {
      console.error('\nTroubleshooting MongoDB Atlas Network Access:');
      console.error('1. Your current IP address is likely not whitelisted in MongoDB Atlas.');
      console.error('2. Go to: cloud.mongodb.com -> Security -> Network Access.');
      console.error('3. Add your current public IP, or temporarily allow 0.0.0.0/0.\n');
    }
    process.exit(1);
  }

  const totalUsers = await User.countDocuments();
  const admins = await User.find({ role: 'admin' })
    .select('username email name role isActive failedLoginCount lockUntil lastLoginAt createdAt')
    .lean();

  console.log(`Total database accounts: ${totalUsers}`);
  console.log(`Administrator accounts found: ${admins.length}\n`);

  if (admins.length === 0) {
    console.log('[Status] No administrator accounts exist in this database yet.');
    console.log('Run "npm run setup-admin" to initialize the first administrator.\n');
  } else {
    admins.forEach((admin, index) => {
      const isLocked = admin.lockUntil && new Date(admin.lockUntil) > new Date();
      console.log(`Admin #${index + 1}:`);
      console.log(`  - Username:          ${admin.username || '(not set)'}`);
      console.log(`  - Email:             ${admin.email || '(not set)'}`);
      console.log(`  - Full Name:         ${admin.name}`);
      console.log(`  - Active:            ${admin.isActive ? 'YES' : 'NO (Deactivated)'}`);
      console.log(`  - Locked:            ${isLocked ? `YES (Locked until ${new Date(admin.lockUntil).toISOString()})` : 'NO'}`);
      console.log(`  - Failed Attempts:   ${admin.failedLoginCount || 0}`);
      console.log(`  - Last Sign-in:      ${admin.lastLoginAt ? new Date(admin.lastLoginAt).toISOString() : 'Never'}`);
      console.log(`  - Created At:        ${admin.createdAt ? new Date(admin.createdAt).toISOString() : 'Unknown'}`);
      console.log();
    });
  }
}

run()
  .catch((err) => {
    console.error('[Fatal Error]:', err.message);
    process.exit(1);
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    process.exit(0);
  });
