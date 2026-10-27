/**
 * Secure administrator account initialization for QuizMaster.
 *
 * Can be run from:
 *   - Termux / Android CLI
 *   - Local developer terminal
 *   - GitHub Actions workflow (workflow_dispatch)
 *
 * Security:
 *   - Interactive hidden password input (never echoed)
 *   - Password complexity enforced via Zod schema
 *   - Bcrypt hashing using project BCRYPT_ROUNDS
 *   - Duplicate username/email prevention
 *   - Never overwrites existing accounts
 *   - Generates an immutable AuditLog entry
 *   - Fails safely without database fallback
 */
const readline = require('readline');
const mongoose = require('mongoose');
const { z } = require('zod');
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
  console.log('   QuizMaster: Secure Administrator Setup CLI');
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
    console.error('Aborting. Refusing to initialize production administrator on local database.');
    process.exit(1);
  }

  // 2. Gather inputs (interactive or environment variables)
  let username = process.env.ADMIN_USERNAME;
  let email = process.env.ADMIN_EMAIL;
  let name = process.env.ADMIN_NAME;
  let password = process.env.ADMIN_PASSWORD;

  const isInteractive = !password;

  if (isInteractive) {
    if (!process.stdin.isTTY && (!username || !password)) {
      console.error('[Error] Non-interactive environment detected without required environment variables.');
      console.error('Required: ADMIN_USERNAME, ADMIN_PASSWORD. Optional: ADMIN_EMAIL, ADMIN_NAME.');
      process.exit(1);
    }

    if (!username) {
      username = await askText('Admin username (sign-in identifier, min 3 chars): ');
    }
    if (!email) {
      email = await askText('Admin email (optional, press Enter to skip): ');
    }
    if (!name) {
      name = await askText('Admin display name: ');
    }
    password = await askHidden('Admin password (min 10 chars, upper+lower+number): ');
    const confirm = await askHidden('Confirm password: ');
    if (password !== confirm) {
      console.error('\n[Error] Passwords do not match. Aborting.');
      process.exit(1);
    }
  }

  // 3. Validate Inputs
  const parsedUsername = z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'Username must be at least 3 characters')
    .max(60, 'Username cannot exceed 60 characters')
    .regex(/^[a-z0-9_.-]+$/, 'Username can only contain alphanumeric characters, hyphens, underscores, or periods')
    .safeParse(username);

  if (!parsedUsername.success) {
    console.error('\n[Validation Error] Invalid username:');
    parsedUsername.error.issues.forEach((i) => console.error(`  - ${i.message}`));
    process.exit(1);
  }

  let parsedEmail = undefined;
  if (email && email.trim() !== '') {
    const emailRes = z.string().trim().toLowerCase().email('Invalid email address format').safeParse(email);
    if (!emailRes.success) {
      console.error('\n[Validation Error] Invalid email:');
      emailRes.error.issues.forEach((i) => console.error(`  - ${i.message}`));
      process.exit(1);
    }
    parsedEmail = emailRes.data;
  }

  const parsedName = z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name cannot exceed 100 characters')
    .safeParse(name || parsedUsername.data);

  if (!parsedName.success) {
    console.error('\n[Validation Error] Invalid name:');
    parsedName.error.issues.forEach((i) => console.error(`  - ${i.message}`));
    process.exit(1);
  }

  const pwRes = passwordSchema.safeParse(password);
  if (!pwRes.success) {
    console.error('\n[Validation Error] Password does not meet security requirements:');
    pwRes.error.issues.forEach((i) => console.error(`  - ${i.message}`));
    process.exit(1);
  }

  // 4. Connect to MongoDB (No mock/local fallback)
  console.log('\n[Connecting] Connecting to database...');
  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 15000,
    });
    console.log('[Connected] Database connection established.');
  } catch (connErr) {
    console.error('\n[Database Error] Failed to connect to MongoDB:', connErr.message);
    if (connErr.name === 'MongoServerSelectionError' || connErr.message.includes('buffering timed out')) {
      console.error('\nTroubleshooting MongoDB Atlas Network Access:');
      console.error('1. Your current IP address is likely not on the MongoDB Atlas IP Access List.');
      console.error('2. Go to: cloud.mongodb.com -> Security -> Network Access.');
      console.error('3. Add your current public IP, or temporarily allow 0.0.0.0/0.');
      console.error('4. Alternatively, use the GitHub Actions workflow in .github/workflows/admin-task.yml.\n');
    }
    process.exit(1);
  }

  // 5. Duplicate Detection
  const clashQuery = {
    $or: [
      { username: parsedUsername.data },
      ...(parsedEmail ? [{ email: parsedEmail }] : []),
    ],
  };

  const existingAccount = await User.findOne(clashQuery).select('_id username email role isActive');
  if (existingAccount) {
    console.error('\n[Conflict Error] An account with this username or email already exists.');
    console.error(`- Existing ID:       ${existingAccount._id}`);
    console.error(`- Existing Username: ${existingAccount.username || '(none)'}`);
    console.error(`- Existing Email:    ${existingAccount.email || '(none)'}`);
    console.error(`- Existing Role:     ${existingAccount.role}`);
    console.error('\nTo reset an existing administrator\'s password, use:');
    console.error('  npm run reset-admin-password\n');
    process.exit(1);
  }

  // 6. Create Administrator
  const passwordHash = await User.hashPassword(password);
  const newAdmin = await User.create({
    username: parsedUsername.data,
    ...(parsedEmail ? { email: parsedEmail } : {}),
    name: parsedName.data,
    role: 'admin',
    passwordHash,
    mustChangePassword: false,
    isActive: true,
    failedLoginCount: 0,
    tokenVersion: 0,
  });

  // 7. Audit Logging
  try {
    await AuditLog.create({
      actor: newAdmin._id,
      actorLabel: newAdmin.username || newAdmin.email,
      action: 'ADMIN_INITIALIZED_CLI',
      entityType: 'User',
      entityId: String(newAdmin._id),
      meta: {
        username: newAdmin.username,
        email: newAdmin.email,
        createdAt: new Date(),
        method: isInteractive ? 'interactive_cli' : 'env_cli',
      },
    });
  } catch (auditErr) {
    console.warn('[Warning] Could not record audit log:', auditErr.message);
  }

  console.log('\n===================================================');
  console.log('✔ Administrator Account Successfully Initialized!');
  console.log('===================================================');
  console.log(`- Username: ${newAdmin.username}`);
  if (newAdmin.email) console.log(`- Email:    ${newAdmin.email}`);
  console.log(`- Role:     ${newAdmin.role}`);
  console.log('\nYou can now sign in at the login page using:');
  console.log(`- Identifier: ${newAdmin.username} (or ${newAdmin.email || newAdmin.username})`);
  console.log('- Password:   [The password you specified]');
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
