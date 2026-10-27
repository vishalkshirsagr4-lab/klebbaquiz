/**
 * Secure administrator password recovery and account unlock script for QuizMaster.
 *
 * Can be run from:
 *   - Termux / Android CLI
 *   - Local developer terminal
 *   - GitHub Actions workflow (workflow_dispatch)
 *
 * Security:
 *   - Verifies the account exists and role === 'admin' (refuses to reset non-admins)
 *   - Clears lockout state (lockUntil, failedLoginCount: 0)
 *   - Enforces password complexity rules
 *   - Increments tokenVersion (invalidating existing active JWT sessions)
 *   - Creates an immutable AuditLog entry
 *   - Never echoes, prints, or logs the plaintext password
 *   - Fails safely without database fallback
 */
const readline = require('readline');
const mongoose = require('mongoose');
const dns = require('dns');

try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {}

require('dotenv').config();

const env = require('../src/config/env');
const User = require('../src/models/User');
const AuditLog = require('../src/models/AuditLog');
const { password: passwordSchema } = require('../src/validators');

function askHidden(query) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    if (process.stdin.isTTY) {
      rl._writeToOutput = function _writeToOutput(stringToWrite) {
        if (stringToWrite.includes(query)) {
          rl.output.write(stringToWrite);
        } else if (stringToWrite === '\r\n' || stringToWrite === '\n') {
          rl.output.write(stringToWrite);
        } else {
          rl.output.write('*');
        }
      };
    }

    rl.question(query, (answer) => {
      rl.close();
      if (!process.stdin.isTTY) console.log();
      resolve(answer.trim());
    });
  });
}

function askText(query) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function run() {
  console.log('\n===================================================');
  console.log('   QuizMaster: Administrator Password Recovery CLI');
  console.log('===================================================\n');

  // 1. Verify Database Configuration
  const uri = process.env.MONGODB_URI;
  if (!uri || uri.trim() === '') {
    console.error('[Error] MONGODB_URI environment variable is not defined.');
    console.error('Please specify your MongoDB connection string (e.g., MONGODB_URI="mongodb+srv://...").');
    process.exit(1);
  }

  const isLocalUri = uri.includes('localhost') || uri.includes('127.0.0.1');
  if (process.env.NODE_ENV === 'production' && isLocalUri) {
    console.error('[Security Error] NODE_ENV is "production" but MONGODB_URI points to localhost.');
    console.error('Aborting. Refusing to operate on production database using local URI.');
    process.exit(1);
  }

  // 2. Connect to MongoDB
  console.log('[Connecting] Connecting to database...');
  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 15000,
    });
    console.log('[Connected] Database connection established.\n');
  } catch (connErr) {
    console.error('\n[Database Error] Failed to connect to MongoDB:', connErr.message);
    if (connErr.name === 'MongoServerSelectionError' || connErr.message.includes('buffering timed out')) {
      console.error('\nTroubleshooting MongoDB Atlas Network Access:');
      console.error('1. Your current IP address is likely not whitelisted in MongoDB Atlas.');
      console.error('2. Go to: cloud.mongodb.com -> Security -> Network Access.');
      console.error('3. Add your current public IP, or temporarily allow 0.0.0.0/0.');
      console.error('4. Alternatively, use the GitHub Actions workflow in .github/workflows/admin-task.yml.\n');
    }
    process.exit(1);
  }

  // 3. Gather inputs
  let identifier = process.env.ADMIN_IDENTIFIER || process.env.ADMIN_USERNAME;
  let newPassword = process.env.NEW_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD;

  const isInteractive = !newPassword;

  if (isInteractive) {
    if (!identifier) {
      identifier = await askText('Admin username or email to recover: ');
    }
  }

  if (!identifier || identifier.trim() === '') {
    console.error('[Error] Please specify the administrator username or email.');
    process.exit(1);
  }

  identifier = identifier.trim().toLowerCase();

  // 4. Verify Account & Admin Role
  const adminAccount = await User.findOne({
    $or: [{ username: identifier }, { email: identifier }],
  }).select('+passwordHash');

  if (!adminAccount) {
    console.error(`\n[Account Error] No user account found matching "${identifier}".`);
    console.error('Run "npm run check-admin-status" to list existing administrator usernames.\n');
    process.exit(1);
  }

  if (adminAccount.role !== 'admin') {
    console.error(`\n[Security Error] Account "${identifier}" exists but has role "${adminAccount.role}".`);
    console.error('This recovery script can ONLY be used for accounts with role "admin".');
    console.error('Aborting.\n');
    process.exit(1);
  }

  console.log(`\nFound Administrator Account:`);
  console.log(`- ID:           ${adminAccount._id}`);
  console.log(`- Username:     ${adminAccount.username || '(not set)'}`);
  console.log(`- Email:        ${adminAccount.email || '(not set)'}`);
  console.log(`- Name:         ${adminAccount.name}`);
  console.log(`- Status:       ${adminAccount.isActive ? 'Active' : 'Inactive/Disabled'}`);
  console.log(`- Locked:       ${adminAccount.lockUntil && adminAccount.lockUntil > new Date() ? 'YES (locked until ' + adminAccount.lockUntil.toISOString() + ')' : 'NO'}`);
  console.log(`- Failed count: ${adminAccount.failedLoginCount || 0}\n`);

  if (isInteractive) {
    newPassword = await askHidden('Enter new admin password (min 10 chars, upper+lower+number): ');
    const confirm = await askHidden('Confirm new password: ');
    if (newPassword !== confirm) {
      console.error('\n[Error] Passwords do not match. Aborting.');
      process.exit(1);
    }
  }

  // 5. Enforce Password Rules
  const pwRes = passwordSchema.safeParse(newPassword);
  if (!pwRes.success) {
    console.error('\n[Validation Error] New password does not meet security requirements:');
    pwRes.error.issues.forEach((i) => console.error(`  - ${i.message}`));
    process.exit(1);
  }

  // 6. Update Password, Unlock Account, Invalidate Active Sessions
  const newHash = await User.hashPassword(newPassword);
  adminAccount.passwordHash = newHash;
  adminAccount.failedLoginCount = 0;
  adminAccount.lockUntil = undefined;
  adminAccount.isActive = true;
  adminAccount.mustChangePassword = false;
  adminAccount.tokenVersion = (adminAccount.tokenVersion || 0) + 1; // signs out any other active session
  adminAccount.passwordChangedAt = new Date();

  await adminAccount.save();

  // 7. Record Audit Log
  try {
    await AuditLog.create({
      actor: adminAccount._id,
      actorLabel: adminAccount.username || adminAccount.email,
      action: 'ADMIN_PASSWORD_RESET_CLI',
      entityType: 'User',
      entityId: String(adminAccount._id),
      meta: {
        username: adminAccount.username,
        email: adminAccount.email,
        resetAt: new Date(),
        method: isInteractive ? 'interactive_cli' : 'env_cli',
        unlocked: true,
      },
    });
  } catch (auditErr) {
    console.warn('[Warning] Could not record audit log:', auditErr.message);
  }

  console.log('\n===================================================');
  console.log('✔ Administrator Password Successfully Reset & Account Unlocked!');
  console.log('===================================================');
  console.log(`- Sign-in identifier: ${adminAccount.username || adminAccount.email}`);
  console.log('- Account active:     YES');
  console.log('- Account locked:     NO');
  console.log('- Previous sessions:  Terminated (tokenVersion incremented)');
  console.log('===================================================\n');
}

run()
  .catch((err) => {
    console.error('\n[Fatal Error]:', err.message);
    process.exit(1);
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    process.exit(0);
  });
