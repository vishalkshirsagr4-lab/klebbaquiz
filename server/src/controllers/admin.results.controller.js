const mongoose = require('mongoose');
const Competition = require('../models/Competition');
const Attempt = require('../models/Attempt');
const Announcement = require('../models/Announcement');
const Notification = require('../models/Notification');
const User = require('../models/User');
const Team = require('../models/Team');
const audit = require('../services/audit');
const { getPhase, eligibleUsers } = require('../services/competition');
const { finalizeExpired } = require('../services/attempts');
const { computeLeaderboard, computeTeamLeaderboard } = require('../services/leaderboard');
const { ApiError, asyncHandler, escapeRegex, toCSV } = require('../utils/helpers');

const compOr404 = async (id) => {
  const c = await Competition.findById(id);
  if (!c) throw new ApiError(404, 'Competition not found', 'NOT_FOUND');
  return c;
};

/* ----------------- 1. Competitions list with announcement info ----------------- */
exports.list = asyncHandler(async (_req, res) => {
  const comps = await Competition.find().sort({ startTime: -1 }).lean();
  const announcements = await Announcement.find({ competition: { $in: comps.map((c) => c._id) } }).lean();
  const annByComp = new Map(announcements.map((a) => [String(a.competition), a]));

  const attemptCounts = await Attempt.aggregate([
    {
      $group: {
        _id: { competition: '$competition', status: '$status' },
        count: { $sum: 1 },
      },
    },
  ]);

  const countsByComp = new Map();
  attemptCounts.forEach((ac) => {
    const cid = String(ac._id.competition);
    if (!countsByComp.has(cid)) countsByComp.set(cid, { submitted: 0, inProgress: 0, total: 0 });
    const cur = countsByComp.get(cid);
    if (Attempt.FINAL_STATUSES.includes(ac._id.status)) cur.submitted += ac.count;
    else if (ac._id.status === 'in_progress') cur.inProgress += ac.count;
    cur.total += ac.count;
  });

  const items = comps.map((c) => {
    const cid = String(c._id);
    const ann = annByComp.get(cid) || null;
    const counts = countsByComp.get(cid) || { submitted: 0, inProgress: 0, total: 0 };
    return {
      id: cid,
      title: c.title,
      status: c.status,
      phase: getPhase(c),
      startTime: c.startTime,
      endTime: c.endTime,
      durationMinutes: c.durationMinutes,
      totalMarks: c.totalMarks,
      questionCount: c.questionCount,
      resultsRelease: c.resultsRelease,
      submissionStats: counts,
      announcement: ann
        ? {
            id: String(ann._id),
            title: ann.title,
            category: ann.category,
            status: ann.status,
            publishedAt: ann.publishedAt,
            revision: ann.revision,
          }
        : null,
    };
  });

  res.json({ items });
});

/* ----------------- 2. Comprehensive results preview ----------------- */
exports.preview = asyncHandler(async (req, res) => {
  const comp = await compOr404(req.params.id);
  await finalizeExpired({ competition: comp._id });

  const [individuals, teams, eligible, allAttempts, announcement] = await Promise.all([
    computeLeaderboard(comp._id),
    computeTeamLeaderboard(comp._id),
    eligibleUsers(comp),
    Attempt.find({ competition: comp._id })
      .populate('user', 'name participantId email')
      .populate('scoreCorrection.correctedBy', 'name')
      .sort({ startedAt: -1 })
      .lean(),
    Announcement.findOne({ competition: comp._id }).populate('publishedBy', 'name').lean(),
  ]);

  // Analyze diagnostics
  const submittedAttempts = allAttempts.filter((a) => Attempt.FINAL_STATUSES.includes(a.status));
  const inProgressAttempts = allAttempts.filter((a) => a.status === 'in_progress');
  const correctedAttempts = allAttempts.filter((a) => a.scoreCorrection?.correctedScore !== undefined);

  // Identify duplicate submissions per user
  const userAttemptCounts = new Map();
  allAttempts.forEach((a) => {
    const uid = String(a.user?._id || a.user);
    userAttemptCounts.set(uid, (userAttemptCounts.get(uid) || 0) + 1);
  });
  const duplicateUsers = [...userAttemptCounts.entries()].filter(([, cnt]) => cnt > 1).length;

  const scores = individuals.map((r) => r.score);
  const tieCount = individuals.filter((r) => r.isTie).length;

  const summary = {
    eligible: eligible.length,
    participants: individuals.length,
    absent: Math.max(0, eligible.length - individuals.length),
    inProgress: inProgressAttempts.length,
    submittedAttempts: submittedAttempts.length,
    duplicates: duplicateUsers,
    correctedCount: correctedAttempts.length,
    tieCount,
    average: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : 0,
    highest: scores.length ? Math.max(...scores) : 0,
    lowest: scores.length ? Math.min(...scores) : 0,
    maxScore: comp.totalMarks,
  };

  res.json({
    competition: {
      id: String(comp._id),
      title: comp.title,
      status: comp.status,
      phase: getPhase(comp),
      totalMarks: comp.totalMarks,
      durationMinutes: comp.durationMinutes,
      startTime: comp.startTime,
      endTime: comp.endTime,
      resultsRelease: comp.resultsRelease,
    },
    announcement: announcement
      ? {
          id: String(announcement._id),
          title: announcement.title,
          message: announcement.message,
          category: announcement.category,
          status: announcement.status,
          visibility: announcement.visibility,
          highlights: announcement.highlights || [],
          publishedAt: announcement.publishedAt,
          publishedBy: announcement.publishedBy ? { name: announcement.publishedBy.name } : null,
          retractedAt: announcement.retractedAt,
          retractReason: announcement.retractReason,
          revision: announcement.revision || 1,
          revisionHistory: announcement.revisionHistory || [],
        }
      : null,
    summary,
    individuals,
    teams,
    corrections: correctedAttempts.map((a) => ({
      attemptId: String(a._id),
      user: a.user ? { name: a.user.name, participantId: a.user.participantId } : null,
      attemptNumber: a.attemptNumber,
      originalScore: a.scoreCorrection.originalScore,
      correctedScore: a.scoreCorrection.correctedScore,
      reason: a.scoreCorrection.reason,
      correctedBy: a.scoreCorrection.correctedBy?.name || 'Administrator',
      correctedAt: a.scoreCorrection.correctedAt,
    })),
  });
});

/* ----------------- 3. Save draft announcement ----------------- */
exports.saveDraft = asyncHandler(async (req, res) => {
  const comp = await compOr404(req.params.id);
  const { title, message, category, visibility, highlights } = req.body;

  let ann = await Announcement.findOne({ competition: comp._id });
  if (!ann) {
    ann = new Announcement({
      competition: comp._id,
      title: title || `${comp.title} - Official Results`,
      message: message || '',
      category: category || 'final',
      visibility: visibility || 'all',
      highlights: highlights || [],
      status: 'draft',
    });
  } else {
    ann.title = title !== undefined ? title : ann.title;
    ann.message = message !== undefined ? message : ann.message;
    ann.category = category || ann.category;
    ann.visibility = visibility || ann.visibility;
    if (highlights) ann.highlights = highlights;
  }

  await ann.save();
  res.json({ ok: true, announcement: ann.toJSON() });
});

/* ----------------- 4. Publish official results ----------------- */
exports.publish = asyncHandler(async (req, res) => {
  const comp = await compOr404(req.params.id);
  const { title, message, category, visibility, highlights } = req.body;
  const now = new Date();

  let ann = await Announcement.findOne({ competition: comp._id });
  const isRepublish = ann && ann.status === 'published';

  if (!ann) {
    ann = new Announcement({
      competition: comp._id,
      title: title || `${comp.title} - Official Results`,
      message: message || '',
      category: category || 'final',
      visibility: visibility || 'all',
      highlights: highlights || [],
      status: 'published',
      publishedAt: now,
      publishedBy: req.user._id,
      revision: 1,
    });
  } else {
    // If republishing an already published announcement, record revision
    if (isRepublish) {
      ann.revisionHistory.push({
        revision: ann.revision,
        title: ann.title,
        category: ann.category,
        message: ann.message,
        publishedAt: ann.publishedAt || now,
        publishedBy: ann.publishedBy,
        note: req.body.revisionNote || 'Revised results published',
      });
      ann.revision += 1;
      ann.category = category || 'revised';
    } else {
      ann.category = category || ann.category;
    }

    ann.title = title || ann.title;
    ann.message = message !== undefined ? message : ann.message;
    ann.visibility = visibility || ann.visibility;
    if (highlights) ann.highlights = highlights;
    ann.status = 'published';
    ann.publishedAt = now;
    ann.publishedBy = req.user._id;
    ann.retractedAt = null;
    ann.retractReason = '';
  }

  await ann.save();

  // Authoritatively update Competition results release
  comp.resultsRelease.published = true;
  comp.resultsRelease.publishedAt = now;
  await comp.save();

  // Idempotent In-App Notification Generation
  // Gather recipient user IDs based on visibility
  let recipients = [];
  if (ann.visibility === 'leaders_only') {
    const teams = await Team.find({
      $or: [{ competition: comp._id }, { isActive: true }],
    }).select('leader');
    recipients = teams.map((t) => t.leader).filter(Boolean);
  } else {
    recipients = await eligibleUsers(comp);
  }

  // Create notifications idempotently
  const notifOperations = recipients.map((u) => ({
    updateOne: {
      filter: {
        user: u._id || u,
        announcement: ann._id,
        version: ann.revision,
      },
      update: {
        $setOnInsert: {
          user: u._id || u,
          competition: comp._id,
          announcement: ann._id,
          version: ann.revision,
          type: 'result_announcement',
          title: `Results Announced: ${ann.title}`,
          message: ann.message ? ann.message.slice(0, 200) : `Official results for ${comp.title} are now published.`,
          link: `/competitions/${comp._id}/result`,
          category: ann.category,
          read: false,
          createdAt: now,
        },
      },
      upsert: true,
    },
  }));

  if (notifOperations.length > 0) {
    await Notification.bulkWrite(notifOperations);
  }

  await audit(req, isRepublish ? 'RESULTS_REVISED' : 'RESULTS_PUBLISHED', {
    entityType: 'Competition',
    entityId: comp._id,
    meta: {
      announcementId: String(ann._id),
      revision: ann.revision,
      category: ann.category,
      recipientsCount: recipients.length,
    },
  });

  res.json({
    ok: true,
    published: true,
    announcement: ann.toJSON(),
  });
});

/* ----------------- 5. Retract announcement ----------------- */
exports.retract = asyncHandler(async (req, res) => {
  const comp = await compOr404(req.params.id);
  const { reason } = req.body;
  if (!reason || !reason.trim()) {
    throw new ApiError(400, 'A reason is required to retract published results', 'REASON_REQUIRED');
  }

  const ann = await Announcement.findOne({ competition: comp._id });
  if (!ann || ann.status !== 'published') {
    throw new ApiError(400, 'There are no published results to retract for this competition', 'NOT_PUBLISHED');
  }

  const now = new Date();
  ann.status = 'retracted';
  ann.retractedAt = now;
  ann.retractedBy = req.user._id;
  ann.retractReason = reason.trim();
  await ann.save();

  // Hide results on competition
  comp.resultsRelease.published = false;
  await comp.save();

  await audit(req, 'RESULTS_RETRACTED', {
    entityType: 'Competition',
    entityId: comp._id,
    meta: { announcementId: String(ann._id), reason: reason.trim() },
  });

  res.json({ ok: true, retracted: true });
});

/* ----------------- 6. Audited score correction ----------------- */
exports.correctScore = asyncHandler(async (req, res) => {
  const comp = await compOr404(req.params.id);
  const { attemptId, correctedScore, reason } = req.body;

  if (correctedScore === undefined || correctedScore === null || isNaN(Number(correctedScore))) {
    throw new ApiError(400, 'A valid numeric corrected score is required', 'INVALID_SCORE');
  }
  if (!reason || !reason.trim()) {
    throw new ApiError(400, 'A reason is required for any manual score correction', 'REASON_REQUIRED');
  }

  const attempt = await Attempt.findOne({ _id: attemptId, competition: comp._id });
  if (!attempt) throw new ApiError(404, 'Attempt not found', 'NOT_FOUND');
  if (attempt.status === 'in_progress') {
    throw new ApiError(400, 'Cannot correct score on an in-progress attempt', 'IN_PROGRESS');
  }

  const numCorrected = Number(correctedScore);
  if (numCorrected < 0 || numCorrected > comp.totalMarks) {
    throw new ApiError(400, `Score must be between 0 and maximum possible (${comp.totalMarks})`, 'OUT_OF_RANGE');
  }

  const orig = attempt.scoreCorrection?.originalScore !== undefined ? attempt.scoreCorrection.originalScore : attempt.score;
  const now = new Date();

  attempt.scoreCorrection = {
    originalScore: orig,
    correctedScore: numCorrected,
    reason: reason.trim(),
    correctedBy: req.user._id,
    correctedAt: now,
  };

  await attempt.save();

  await audit(req, 'SCORE_MANUALLY_CORRECTED', {
    entityType: 'Attempt',
    entityId: attempt._id,
    meta: {
      competition: String(comp._id),
      user: String(attempt.user),
      originalScore: orig,
      correctedScore: numCorrected,
      reason: reason.trim(),
    },
  });

  res.json({
    ok: true,
    attemptId: String(attempt._id),
    originalScore: orig,
    correctedScore: numCorrected,
    reason: reason.trim(),
    correctedAt: now,
  });
});

/* ----------------- 7. Export authoritative CSV ----------------- */
exports.exportCsv = asyncHandler(async (req, res) => {
  const comp = await compOr404(req.params.id);
  await finalizeExpired({ competition: comp._id });

  const [individuals, teams, ann] = await Promise.all([
    computeLeaderboard(comp._id),
    computeTeamLeaderboard(comp._id),
    Announcement.findOne({ competition: comp._id }).lean(),
  ]);

  const rows = [];
  rows.push(['KLE BBA CLUSTER EVENT QUIZMASTER - OFFICIAL COMPETITION RESULTS']);
  rows.push(['Competition', comp.title]);
  rows.push(['Status', ann?.status === 'published' ? `OFFICIAL PUBLISHED (${ann.category.toUpperCase()})` : 'PREVIEW / DRAFT']);
  rows.push(['Announcement Title', ann?.title || 'N/A']);
  rows.push(['Published At', ann?.publishedAt ? ann.publishedAt.toISOString() : 'Unpublished']);
  rows.push(['Total Marks', comp.totalMarks]);
  rows.push([]);

  // Individual Rankings Table
  rows.push(['--- INDIVIDUAL RANKINGS ---']);
  rows.push([
    'Rank',
    'Tie?',
    'Participant ID',
    'Name',
    'Organization',
    'Score',
    'Max Score',
    'Percentage',
    'Time Taken (s)',
    'Correct',
    'Wrong',
    'Unanswered',
    'Attempt #',
    'Status',
    'Score Corrected?',
  ]);

  individuals.forEach((r) => {
    const pct = r.maxScore ? Math.round((r.score / r.maxScore) * 10000) / 100 : 0;
    rows.push([
      r.rank,
      r.isTie ? 'YES' : 'NO',
      r.participantId,
      r.name,
      r.organization || '',
      r.score,
      r.maxScore,
      `${pct}%`,
      r.timeTakenSeconds ?? '-',
      r.correctCount,
      r.wrongCount,
      r.unansweredCount,
      r.attemptNumber,
      r.status,
      r.isCorrected ? `YES (${r.scoreCorrection?.reason || ''})` : 'NO',
    ]);
  });

  rows.push([]);
  rows.push(['--- TEAM RANKINGS ---']);
  rows.push([
    'Team Rank',
    'Tie?',
    'Team Name',
    'Team Code',
    'Leader Name',
    'Leader ID',
    'Official Score',
    'Total Team Points',
    'Members Count',
    'Submitted Members',
    'Best Time (s)',
  ]);

  teams.forEach((t) => {
    rows.push([
      t.hasSubmission ? t.rank : '-',
      t.isTie ? 'YES' : 'NO',
      t.teamName,
      t.teamCode,
      t.leaderName,
      t.leaderParticipantId,
      t.score,
      t.totalScore,
      t.membersCount,
      t.submittedMembersCount,
      t.timeTakenSeconds ?? '-',
    ]);
  });

  await audit(req, 'RESULTS_EXPORTED', {
    entityType: 'Competition',
    entityId: comp._id,
    meta: { individualCount: individuals.length, teamCount: teams.length },
  });

  const slug = comp.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'results';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="official-results-${slug}-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(toCSV(rows));
});
