const User = require('../models/User');
const Competition = require('../models/Competition');
const Question = require('../models/Question');
const { refreshStats } = require('../services/competition');

async function seedDefaults() {
  try {
    // 1. Ensure admin account exists
    let admin = await User.findOne({ role: 'admin' });
    if (!admin) {
      const adminHash = await User.hashPassword('AdminPassword123!');
      admin = await User.create({
        username: 'admin',
        email: 'admin@quizmaster.com',
        name: 'QuizMaster Administrator',
        role: 'admin',
        passwordHash: adminHash,
        mustChangePassword: false,
        isActive: true,
        failedLoginCount: 0,
      });
      console.log('[seed] Default admin created (admin / AdminPassword123!)');
    }

    // 2. Ensure student account exists
    let student = await User.findOne({ username: 'student' });
    if (!student) {
      const studentHash = await User.hashPassword('Student12345!');
      student = await User.create({
        username: 'student',
        participantId: 'QM-DEMO1',
        name: 'Demo Student (Alex)',
        role: 'student',
        organization: 'Tech Academy',
        passwordHash: studentHash,
        mustChangePassword: false,
        isActive: true,
        failedLoginCount: 0,
      });
      console.log('[seed] Default student created (student / Student12345!)');
    }

    // 3. Ensure a sample competition exists if none exist
    const count = await Competition.countDocuments();
    if (count === 0) {
      let sampleData;
      try {
        sampleData = require('../../data/sample-quiz.json');
      } catch {
        try {
          sampleData = require('../../../server/data/sample-quiz.json');
        } catch {}
      }

      if (sampleData && sampleData.competition && sampleData.questions) {
        const now = Date.now();
        const comp = await Competition.create({
          ...sampleData.competition,
          startTime: new Date(now - 60 * 60 * 1000), // Started 1 hour ago (Live)
          endTime: new Date(now + 24 * 60 * 60 * 1000), // Ends in 24 hours
          status: 'published',
          assignedParticipants: [student._id],
          createdBy: admin._id,
        });

        for (const [i, d] of sampleData.questions.entries()) {
          const q = new Question({
            competition: comp._id,
            order: i,
            text: d.text,
            options: d.options.map((text) => ({ text })),
            explanation: d.explanation,
            marks: d.marks,
          });
          q.correctOption = q.options[d.correctIndex]._id;
          await q.save();
        }
        await refreshStats(comp._id);
        console.log(`[seed] Created live sample competition "${comp.title}" with ${sampleData.questions.length} questions`);
      }
    }
  } catch (err) {
    console.warn('[seed] Could not seed default data:', err.message);
  }
}

module.exports = seedDefaults;
