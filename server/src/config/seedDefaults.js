const User = require('../models/User');
const Competition = require('../models/Competition');
const Question = require('../models/Question');
const { refreshStats } = require('../services/competition');
const env = require('./env');

async function seedDefaults() {
  // In production, do not automatically seed default test passwords unless permitted
  if (env.isProd && process.env.ALLOW_SEED !== 'true') {
    return;
  }
  try {
    // 1. Ensure administrator account exists
    let admin = await User.findOne({ role: 'admin' });
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || 'AdminPassword123!';
    if (!admin) {
      const adminHash = await User.hashPassword(adminPassword);
      admin = await User.create({
        username: adminUsername,
        email: process.env.ADMIN_EMAIL || 'admin@klebba.edu',
        name: 'Administrator',
        role: 'admin',
        passwordHash: adminHash,
        mustChangePassword: false,
        isActive: true,
        failedLoginCount: 0,
      });
      console.log(`[seed] Administrator initialized (${admin.username})`);
    }

    // 2. Remove demo student if present
    await User.deleteMany({
      $or: [{ username: 'student' }, { participantId: 'QM-DEMO1' }],
    });

    // 3. Remove old sample competition if present
    const oldSample = await Competition.findOne({ title: 'Sample General Knowledge Challenge' });
    if (oldSample) {
      await Question.deleteMany({ competition: oldSample._id });
      await Competition.deleteOne({ _id: oldSample._id });
    }

    // 4. Ensure "AI MIND MASTERS – FIRST ROUND" competition exists with 60 questions
    const title = 'AI MIND MASTERS – FIRST ROUND';
    let comp = await Competition.findOne({ title });

    if (!comp) {
      let questionsData = [];
      try {
        const fileData = require('../../data/ai-mind-masters-questions.json');
        questionsData = fileData.questions || [];
      } catch {
        try {
          const fileData = require('../../../server/data/ai-mind-masters-questions.json');
          questionsData = fileData.questions || [];
        } catch {}
      }

      if (questionsData.length > 0) {
        const now = Date.now();
        comp = await Competition.create({
          title,
          description: 'KLE Society’s College of BBA, Mahalingpur | AI Mind Masters Competition Round 1',
          instructions:
            'Total Questions: 60 | Maximum Marks: 60 | Marks per Question: 1 | Time Allowed: 30 Minutes.\n' +
            'Each question has four options with exactly one correct answer. No negative marking. Your answers are autosaved in real time.',
          startTime: new Date(now - 2 * 60 * 60 * 1000), // Live now
          endTime: new Date(now + 60 * 24 * 60 * 60 * 1000), // Open for participants
          durationMinutes: 30,
          negativeMarking: { enabled: false, fraction: 0 },
          shuffleQuestions: true,
          shuffleOptions: true,
          maxAttempts: 1,
          visibility: 'all',
          showLeaderboard: true,
          status: 'published',
          createdBy: admin._id,
        });

        for (const [i, qData] of questionsData.entries()) {
          const q = new Question({
            competition: comp._id,
            order: i,
            text: qData.text,
            options: qData.options.map((text) => ({ text })),
            explanation: qData.explanation || '',
            marks: qData.marks || 1,
          });
          q.correctOption = q.options[qData.correctIndex]._id;
          await q.save();
        }

        await refreshStats(comp._id);
        console.log(`[seed] Competition "${comp.title}" initialized with ${questionsData.length} questions.`);
      }
    }
  } catch (err) {
    console.warn('[seed] Could not seed default data:', err.message);
  }
}

module.exports = seedDefaults;
