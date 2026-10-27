const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;
let server;
let base;
let mongoose;
let User;
let Competition;
let Team;
let Attempt;
let Announcement;
let Notification;
let AuditLog;

let adminToken = '';
let student1Token = '';
let student2Token = '';
let leaderToken = '';

let adminUser;
let student1User;
let student2User;
let student3User;
let leaderUser;
let compDoc;
let teamDoc;
let attempt1;
let attempt2;
let attempt3;

async function req(method, path, body, token = '', headers = {}) {
  const opts = {
    method,
    headers: {
      'content-type': 'application/json',
      'x-requested-with': 'quizmaster',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${base}/api${path}`, opts);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, text, headers: res.headers };
}

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  const testUri = mongod.getUri('quizmaster_results_test');

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
  Competition = require('../src/models/Competition');
  Team = require('../src/models/Team');
  Attempt = require('../src/models/Attempt');
  Announcement = require('../src/models/Announcement');
  Notification = require('../src/models/Notification');
  AuditLog = require('../src/models/AuditLog');

  const app = require('../src/app');
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      base = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  // Seed Users
  const pwdHash = await User.hashPassword('Password123!');

  adminUser = await User.create({
    name: 'Admin User',
    username: 'admin',
    email: 'admin@test.com',
    role: 'admin',
    passwordHash: pwdHash,
  });

  leaderUser = await User.create({
    name: 'Leader One',
    participantId: 'KLE-L01',
    email: 'leader@test.com',
    role: 'leader',
    teamRole: 'leader',
    passwordHash: pwdHash,
  });

  student1User = await User.create({
    name: 'Student Alpha',
    participantId: 'KLE-S01',
    email: 's1@test.com',
    role: 'student',
    teamRole: 'member',
    passwordHash: pwdHash,
  });

  student2User = await User.create({
    name: 'Student Beta',
    participantId: 'KLE-S02',
    email: 's2@test.com',
    role: 'student',
    teamRole: 'member',
    passwordHash: pwdHash,
  });

  student3User = await User.create({
    name: 'Student Gamma',
    participantId: 'KLE-S03',
    email: 's3@test.com',
    role: 'student',
    teamRole: 'individual',
    passwordHash: pwdHash,
  });

  // Seed Competition (Closed quiz)
  const now = new Date();
  compDoc = await Competition.create({
    title: 'KLE BBA Cluster Mega Quiz',
    description: 'Official Championship Quiz',
    status: 'published',
    startTime: new Date(now.getTime() - 3600000 * 5),
    endTime: new Date(now.getTime() - 3600000), // Closed
    durationMinutes: 30,
    totalMarks: 50,
    questionCount: 10,
    visibility: 'all',
    resultsRelease: { published: false },
    answerRelease: { published: false },
  });

  // Seed Team
  teamDoc = await Team.create({
    name: 'KLE Titans',
    code: 'TITAN26',
    leader: leaderUser._id,
    members: [student1User._id, student2User._id],
    competition: compDoc._id,
  });

  await User.updateMany({ _id: { $in: [leaderUser._id, student1User._id, student2User._id] } }, { team: teamDoc._id });

  // Seed Attempts:
  // Alpha: Score 40, time 300s
  // Beta: Score 40, time 300s (Exact Tie with Alpha!)
  // Leader: Score 45, time 400s
  // Gamma: Score 30, time 200s
  attempt1 = await Attempt.create({
    competition: compDoc._id,
    user: student1User._id,
    attemptNumber: 1,
    status: 'submitted',
    startedAt: new Date(now.getTime() - 7200000),
    submittedAt: new Date(now.getTime() - 6900000),
    deadline: new Date(now.getTime() - 5400000),
    timeTakenSeconds: 300,
    score: 40,
    maxScore: 50,
    correctCount: 8,
    wrongCount: 2,
    unansweredCount: 0,
    questionOrder: [],
  });

  attempt2 = await Attempt.create({
    competition: compDoc._id,
    user: student2User._id,
    attemptNumber: 1,
    status: 'submitted',
    startedAt: new Date(now.getTime() - 7200000),
    submittedAt: new Date(now.getTime() - 6900000),
    deadline: new Date(now.getTime() - 5400000),
    timeTakenSeconds: 300,
    score: 40,
    maxScore: 50,
    correctCount: 8,
    wrongCount: 2,
    unansweredCount: 0,
    questionOrder: [],
  });

  attempt3 = await Attempt.create({
    competition: compDoc._id,
    user: leaderUser._id,
    attemptNumber: 1,
    status: 'submitted',
    startedAt: new Date(now.getTime() - 7200000),
    submittedAt: new Date(now.getTime() - 6800000),
    deadline: new Date(now.getTime() - 5400000),
    timeTakenSeconds: 400,
    score: 45,
    maxScore: 50,
    correctCount: 9,
    wrongCount: 1,
    unansweredCount: 0,
    questionOrder: [],
  });

  // Login users to acquire session tokens
  const admRes = await req('POST', '/auth/login', { identifier: 'admin', password: 'Password123!' });
  adminToken = admRes.json.token;

  const lRes = await req('POST', '/auth/login', { identifier: 'KLE-L01', password: 'Password123!' });
  leaderToken = lRes.json.token;

  const s1Res = await req('POST', '/auth/login', { identifier: 'KLE-S01', password: 'Password123!' });
  student1Token = s1Res.json.token;

  const s2Res = await req('POST', '/auth/login', { identifier: 'KLE-S02', password: 'Password123!' });
  student2Token = s2Res.json.token;
});

test.after(async () => {
  if (server) await new Promise((r) => server.close(r));
  if (mongoose) await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

test('1. Access guard: student cannot view unpublished results', async () => {
  const res = await req('GET', `/student/competitions/${compDoc._id}/result`, undefined, student1Token);
  assert.equal(res.status, 403);
  assert.equal(res.json.code, 'RESULTS_NOT_RELEASED');
});

test('2. Access guard: team leader cannot view unpublished team results', async () => {
  const res = await req('GET', '/leader/team/results', undefined, leaderToken);
  assert.equal(res.status, 403);
  assert.equal(res.json.code, 'RESULTS_NOT_RELEASED');
});

test('3. Admin preview: computes individual rankings and tie-breaking properly', async () => {
  const res = await req('GET', `/admin/results/${compDoc._id}/preview`, undefined, adminToken);
  assert.equal(res.status, 200);
  assert.ok(res.json.summary);
  assert.equal(res.json.summary.participants, 3);

  const ind = res.json.individuals;
  // Rank 1: Leader One (score: 45)
  assert.equal(ind[0].name, 'Leader One');
  assert.equal(ind[0].rank, 1);
  assert.equal(ind[0].isTie, false);

  // Rank 2: Student Alpha & Beta have same score (40) and duration (300) -> shared rank 2, isTie true!
  assert.equal(ind[1].score, 40);
  assert.equal(ind[2].score, 40);
  assert.equal(ind[1].rank, 2);
  assert.equal(ind[2].rank, 2);
  assert.equal(ind[1].isTie, true);
  assert.equal(ind[2].isTie, true);
});

test('4. Admin preview: computes team standings with member details', async () => {
  const res = await req('GET', `/admin/results/${compDoc._id}/preview`, undefined, adminToken);
  assert.equal(res.status, 200);
  const teams = res.json.teams;
  assert.ok(teams.length >= 1);
  const titan = teams.find((t) => t.teamCode === 'TITAN26');
  assert.ok(titan);
  assert.equal(titan.teamName, 'KLE Titans');
  assert.equal(titan.score, 45); // Best score
  assert.equal(titan.membersCount, 3);
  assert.equal(titan.submittedMembersCount, 3);
  assert.equal(titan.rank, 1);
});

test('5. Audited score correction: updates official score and logs audit entry', async () => {
  // Correct attempt1 (Student Alpha) from 40 to 48 with reason
  const res = await req(
    'POST',
    `/admin/results/${compDoc._id}/corrections`,
    {
      attemptId: String(attempt1._id),
      correctedScore: 48,
      reason: 'Bonus awarded for question 4 challenge',
    },
    adminToken
  );

  assert.equal(res.status, 200);
  assert.equal(res.json.originalScore, 40);
  assert.equal(res.json.correctedScore, 48);

  // Verify AuditLog record
  const log = await AuditLog.findOne({ action: 'SCORE_MANUALLY_CORRECTED', entityId: String(attempt1._id) });
  assert.ok(log);
  assert.equal(log.meta.originalScore, 40);
  assert.equal(log.meta.correctedScore, 48);
  assert.equal(log.meta.reason, 'Bonus awarded for question 4 challenge');

  // Preview again: Alpha should now be Rank 1 (score 48), Leader Rank 2 (score 45), Beta Rank 3 (score 40)
  const prevRes = await req('GET', `/admin/results/${compDoc._id}/preview`, undefined, adminToken);
  const ind = prevRes.json.individuals;
  assert.equal(ind[0].name, 'Student Alpha');
  assert.equal(ind[0].score, 48);
  assert.equal(ind[0].rank, 1);
  assert.equal(ind[0].isCorrected, true);
});

test('6. Save draft announcement: keeps status as draft without releasing results', async () => {
  const res = await req(
    'POST',
    `/admin/results/${compDoc._id}/draft`,
    {
      title: 'KLE BBA Cluster Mega Quiz - Draft Results',
      message: 'Draft verification in progress by faculty.',
      category: 'preliminary',
      visibility: 'all',
    },
    adminToken
  );
  assert.equal(res.status, 200);
  assert.equal(res.json.announcement.status, 'draft');

  // Verify student still cannot access
  const stRes = await req('GET', `/student/competitions/${compDoc._id}/result`, undefined, student1Token);
  assert.equal(stRes.status, 403);
});

test('7. Publish official results: enables student access, creates announcement and notifications', async () => {
  const res = await req(
    'POST',
    `/admin/results/${compDoc._id}/publish`,
    {
      title: 'KLE BBA Mega Quiz — Final Official Results',
      message: 'Hearty congratulations to all participants and winning teams!',
      category: 'final',
      visibility: 'all',
      highlights: [
        { rank: 1, label: 'Champion', recipient: 'Student Alpha', score: 48 },
        { rank: 2, label: '1st Runner Up', recipient: 'Leader One', score: 45 },
      ],
    },
    adminToken
  );

  assert.equal(res.status, 200);
  assert.equal(res.json.published, true);
  assert.equal(res.json.announcement.status, 'published');
  assert.equal(res.json.announcement.revision, 1);

  // Student 1 can now view result with announcement and corrected score
  const stRes = await req('GET', `/student/competitions/${compDoc._id}/result`, undefined, student1Token);
  assert.equal(stRes.status, 200);
  assert.equal(stRes.json.result.score, 48);
  assert.equal(stRes.json.result.rank, 1);
  assert.ok(stRes.json.announcement);
  assert.equal(stRes.json.announcement.title, 'KLE BBA Mega Quiz — Final Official Results');
  assert.equal(stRes.json.announcement.category, 'final');

  // Check in-app notifications generated for participants
  const notifRes = await req('GET', '/notifications', undefined, student1Token);
  assert.equal(notifRes.status, 200);
  assert.ok(notifRes.json.items.length >= 1);
  assert.equal(notifRes.json.items[0].category, 'final');
  assert.equal(notifRes.json.items[0].read, false);
});

test('8. Team Leader results: leader accesses team standing without credentials leakage', async () => {
  const res = await req('GET', '/leader/team/results', undefined, leaderToken);
  assert.equal(res.status, 200);
  assert.ok(res.json.teamResult);
  assert.equal(res.json.teamResult.teamName, 'KLE Titans');
  assert.equal(res.json.teamResult.rank, 1);
  assert.ok(res.json.teamResult.members.length >= 3);
  // Ensure no password hashes or passwords in output
  assert.equal(JSON.stringify(res.json).includes('passwordHash'), false);
});

test('9. Idempotent publish & revised results: publishing again archives revision and increments version', async () => {
  const republishRes = await req(
    'POST',
    `/admin/results/${compDoc._id}/publish`,
    {
      title: 'KLE BBA Mega Quiz — Revised Official Results',
      message: 'Updated after committee review.',
      category: 'revised',
      revisionNote: 'Updated scores following faculty review',
    },
    adminToken
  );

  assert.equal(republishRes.status, 200);
  assert.equal(republishRes.json.announcement.revision, 2);
  assert.equal(republishRes.json.announcement.category, 'revised');
  assert.equal(republishRes.json.announcement.revisionHistory.length, 1);

  // Notification count check: should NOT duplicate unread notifications for same version
  const notifCount = await Notification.countDocuments({ user: student1User._id, version: 1 });
  assert.equal(notifCount, 1);
});

test('10. Retract results: requires reason, hides results again, blocks student access', async () => {
  // Missing reason gives 400
  const badRes = await req('POST', `/admin/results/${compDoc._id}/retract`, { reason: '' }, adminToken);
  assert.equal(badRes.status, 400);

  // Valid retraction
  const retRes = await req('POST', `/admin/results/${compDoc._id}/retract`, { reason: 'Pending dispute resolution' }, adminToken);
  assert.equal(retRes.status, 200);
  assert.equal(retRes.json.retracted, true);

  // Student access is immediately blocked again
  const stRes = await req('GET', `/student/competitions/${compDoc._id}/result`, undefined, student1Token);
  assert.equal(stRes.status, 403);
  assert.equal(stRes.json.code, 'RESULTS_NOT_RELEASED');

  // Verify audit log
  const log = await AuditLog.findOne({ action: 'RESULTS_RETRACTED', entityId: String(compDoc._id) });
  assert.ok(log);
  assert.equal(log.meta.reason, 'Pending dispute resolution');
});

test('11. Notifications API: user can mark single and all notifications as read', async () => {
  const notifs = await Notification.find({ user: student1User._id });
  assert.ok(notifs.length > 0);
  const targetId = String(notifs[0]._id);

  // Mark read
  const markRes = await req('PATCH', `/notifications/${targetId}/read`, undefined, student1Token);
  assert.equal(markRes.status, 200);
  const updated = await Notification.findById(targetId);
  assert.equal(updated.read, true);

  // Mark all read
  const markAllRes = await req('POST', '/notifications/read-all', undefined, student1Token);
  assert.equal(markAllRes.status, 200);
  const unread = await Notification.countDocuments({ user: student1User._id, read: false });
  assert.equal(unread, 0);
});

test('12. CSV Export: returns authoritative CSV text with rankings and announcement metadata', async () => {
  const res = await req('GET', `/admin/results/${compDoc._id}/export.csv`, undefined, adminToken);
  assert.equal(res.status, 200);
  assert.ok(res.text.includes('KLE BBA CLUSTER EVENT QUIZMASTER'));
  assert.ok(res.text.includes('INDIVIDUAL RANKINGS'));
  assert.ok(res.text.includes('TEAM RANKINGS'));
  assert.ok(res.text.includes('TITAN26'));
  assert.ok(res.text.includes('KLE Titans'));
});
