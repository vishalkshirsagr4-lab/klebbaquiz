/**
 * Comprehensive security & authentication tests for administrator setup and login.
 * Tests run against an isolated in-memory test database and never touch production.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;
let server;
let base;
let mongoose;
let User;
let AuditLog;
let env;

const TEST_ADMIN = {
  username: 'superadmin',
  email: 'superadmin@quizmaster.test',
  name: 'Super Admin',
  password: 'Password123!',
};

async function postJson(path, body, headers = {}) {
  const res = await fetch(`${base}/api${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-requested-with': 'quizmaster',
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, text, headers: res.headers };
}

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  const testUri = mongod.getUri('quizmaster_admin_test');

  Object.assign(process.env, {
    NODE_ENV: 'test',
    MONGODB_URI: testUri,
    JWT_SECRET: crypto.randomBytes(48).toString('hex'),
    CLIENT_URL: 'http://localhost:5173,https://my-app.vercel.app',
    BCRYPT_ROUNDS: '10',
    MAX_LOGIN_ATTEMPTS: '5',
    LOCKOUT_MINUTES: '15',
  });

  mongoose = require('mongoose');
  await mongoose.connect(testUri);

  User = require('../src/models/User');
  AuditLog = require('../src/models/AuditLog');
  env = require('../src/config/env');

  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));

  server = require('../src/app').listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) await new Promise((r) => server.close(r));
  if (mongoose) await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

test('1. Admin creation: password hashing and complexity rules', async () => {
  // Test invalid passwords
  const { password: passwordSchema } = require('../src/validators');
  assert.equal(passwordSchema.safeParse('short').success, false, 'Should reject password under 10 chars');
  assert.equal(passwordSchema.safeParse('alllowercaseno1').success, false, 'Should reject password missing uppercase');
  assert.equal(passwordSchema.safeParse('ALLUPPERCASENO1').success, false, 'Should reject password missing lowercase');
  assert.equal(passwordSchema.safeParse('NoNumberInPassword').success, false, 'Should reject password missing number');
  assert.equal(passwordSchema.safeParse(TEST_ADMIN.password).success, true, 'Should accept valid password');

  // Create admin user
  const hash = await User.hashPassword(TEST_ADMIN.password);
  assert.notEqual(hash, TEST_ADMIN.password, 'Hash must not equal plaintext');
  assert.ok(hash.startsWith('$2'), 'Must be a valid bcrypt hash');

  const admin = await User.create({
    username: TEST_ADMIN.username,
    email: TEST_ADMIN.email,
    name: TEST_ADMIN.name,
    role: 'admin',
    passwordHash: hash,
    mustChangePassword: false,
    isActive: true,
  });

  assert.equal(admin.username, TEST_ADMIN.username);
  assert.equal(admin.role, 'admin');

  // Verify verifyPassword method
  const verified = await admin.verifyPassword(TEST_ADMIN.password);
  assert.equal(verified, true, 'verifyPassword should return true for correct password');
  const wrongVerified = await admin.verifyPassword('WrongPassword123!');
  assert.equal(wrongVerified, false, 'verifyPassword should return false for incorrect password');
});

test('2. Duplicate account prevention: refuses clashing username or email', async () => {
  // Clashing username
  await assert.rejects(
    async () => {
      await User.create({
        username: TEST_ADMIN.username, // duplicate
        email: 'different@quizmaster.test',
        name: 'Another User',
        role: 'admin',
        passwordHash: await User.hashPassword('DifferentPass1!'),
      });
    },
    /duplicate key/i,
    'MongoDB unique index should reject duplicate username'
  );

  // Clashing email
  await assert.rejects(
    async () => {
      await User.create({
        username: 'differentuser',
        email: TEST_ADMIN.email, // duplicate
        name: 'Another User',
        role: 'admin',
        passwordHash: await User.hashPassword('DifferentPass1!'),
      });
    },
    /duplicate key/i,
    'MongoDB unique index should reject duplicate email'
  );
});

test('3. Admin login: valid credentials via username and email', async () => {
  // Sign in by username
  const res1 = await postJson('/auth/login', {
    identifier: TEST_ADMIN.username,
    password: TEST_ADMIN.password,
  });
  assert.equal(res1.status, 200);
  assert.equal(res1.json.user.role, 'admin');
  assert.equal(res1.json.user.username, TEST_ADMIN.username);
  assert.ok(res1.json.token, 'Should return session token');

  // Sign in by email (case insensitive)
  const res2 = await postJson('/auth/login', {
    identifier: TEST_ADMIN.email.toUpperCase(),
    password: TEST_ADMIN.password,
  });
  assert.equal(res2.status, 200);
  assert.equal(res2.json.user.role, 'admin');
});

test('4. Admin login: invalid password returns 401 and tracks failed attempts', async () => {
  const adminBefore = await User.findOne({ username: TEST_ADMIN.username });
  const initialFailed = adminBefore.failedLoginCount;

  const res = await postJson('/auth/login', {
    identifier: TEST_ADMIN.username,
    password: 'IncorrectPassword999!',
  });

  assert.equal(res.status, 401);
  assert.equal(res.json.message, 'Incorrect ID or password');

  const adminAfter = await User.findOne({ username: TEST_ADMIN.username });
  assert.equal(adminAfter.failedLoginCount, initialFailed + 1);
});

test('5. Account lockout after maximum failed attempts', async () => {
  // Attempt failed logins until lockout triggers
  for (let i = 0; i < 5; i++) {
    await postJson('/auth/login', {
      identifier: TEST_ADMIN.username,
      password: 'IncorrectPassword999!',
    });
  }

  const admin = await User.findOne({ username: TEST_ADMIN.username });
  assert.ok(admin.lockUntil, 'Account should have lockUntil set');
  assert.ok(admin.lockUntil > new Date(), 'lockUntil should be in the future');

  // Attempt with correct password while locked should return 423
  const lockedRes = await postJson('/auth/login', {
    identifier: TEST_ADMIN.username,
    password: TEST_ADMIN.password,
  });
  assert.equal(lockedRes.status, 423);
  assert.equal(lockedRes.json.code, 'ACCOUNT_LOCKED');
});

test('6. Admin password recovery: reset password and account unlock', async () => {
  // Reset password and unlock account
  const newPassword = 'BrandNewPassword2026!';
  const newHash = await User.hashPassword(newPassword);

  const admin = await User.findOne({ username: TEST_ADMIN.username });
  admin.passwordHash = newHash;
  admin.failedLoginCount = 0;
  admin.lockUntil = undefined;
  admin.isActive = true;
  admin.tokenVersion += 1;
  await admin.save();

  // Record audit log
  await AuditLog.create({
    actor: admin._id,
    actorLabel: admin.username,
    action: 'ADMIN_PASSWORD_RESET_CLI',
    entityType: 'User',
    entityId: String(admin._id),
  });

  // Verify login with new password succeeds now that account is unlocked
  const loginRes = await postJson('/auth/login', {
    identifier: TEST_ADMIN.username,
    password: newPassword,
  });
  assert.equal(loginRes.status, 200);
  assert.equal(loginRes.json.user.username, TEST_ADMIN.username);

  // Old password should fail
  const oldLoginRes = await postJson('/auth/login', {
    identifier: TEST_ADMIN.username,
    password: TEST_ADMIN.password,
  });
  assert.equal(oldLoginRes.status, 401);
});

test('7. CSRF and Origin protection', async () => {
  // Missing X-Requested-With header
  const noHeader = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier: TEST_ADMIN.username, password: 'BrandNewPassword2026!' }),
  });
  assert.equal(noHeader.status, 403, 'Should reject without X-Requested-With');

  // Disallowed origin
  const badOrigin = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-requested-with': 'quizmaster',
      'origin': 'https://malicious-attacker.com',
    },
    body: JSON.stringify({ identifier: TEST_ADMIN.username, password: 'BrandNewPassword2026!' }),
  });
  assert.equal(badOrigin.status, 403, 'Should reject forbidden origin');

  // Allowed origin (Vercel)
  const vercelOrigin = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-requested-with': 'quizmaster',
      'origin': 'https://my-app.vercel.app',
    },
    body: JSON.stringify({ identifier: TEST_ADMIN.username, password: 'BrandNewPassword2026!' }),
  });
  assert.equal(vercelOrigin.status, 200, 'Should allow configured client origin');
});

test('8. Role Authorization: non-admin cannot access admin routes', async () => {
  // Create student
  await User.create({
    username: 'teststudent',
    participantId: 'QM-STU001',
    name: 'Student One',
    role: 'student',
    passwordHash: await User.hashPassword('StudentPass123!'),
    mustChangePassword: false,
    isActive: true,
  });

  const studentLogin = await postJson('/auth/login', {
    identifier: 'QM-STU001',
    password: 'StudentPass123!',
  });
  assert.equal(studentLogin.status, 200);

  const studentToken = studentLogin.json.token;

  // Try to access admin endpoints with student token
  for (const endpoint of ['/admin/stats', '/admin/users', '/admin/competitions', '/admin/audit-logs']) {
    const res = await fetch(`${base}/api${endpoint}`, {
      headers: {
        'x-requested-with': 'quizmaster',
        'authorization': `Bearer ${studentToken}`,
      },
    });
    assert.equal(res.status, 403, `Student must be forbidden from ${endpoint}`);
  }
});
