const Team = require('../models/Team');
const Competition = require('../models/Competition');
const User = require('../models/User');
const Attempt = require('../models/Attempt');
const Announcement = require('../models/Announcement');
const { computeTeamLeaderboard } = require('../services/leaderboard');
const { getPhase, isReleased, releaseState, allowedAttempts, graceMs } = require('../services/competition');
const { ApiError, asyncHandler } = require('../utils/helpers');

/**
 * Get Team details and roster for the logged-in team leader
 * Passwords and password hashes are strictly NOT returned.
 */
exports.getTeam = asyncHandler(async (req, res) => {
  // Find team where user is leader or member (fallback)
  let team = await Team.findOne({ leader: req.user._id })
    .populate('competition', 'title description instructions startTime endTime durationMinutes totalMarks questionCount status')
    .populate('members', 'name participantId email organization isActive lastLoginAt teamRole')
    .populate('leader', 'name participantId email organization isActive lastLoginAt teamRole');

  if (!team && req.user.team) {
    team = await Team.findById(req.user.team)
      .populate('competition', 'title description instructions startTime endTime durationMinutes totalMarks questionCount status')
      .populate('members', 'name participantId email organization isActive lastLoginAt teamRole')
      .populate('leader', 'name participantId email organization isActive lastLoginAt teamRole');
  }

  if (!team) {
    return res.json({ team: null });
  }

  // Format roster (leader first, then members)
  const roster = [];
  if (team.leader) {
    roster.push({
      id: String(team.leader._id),
      name: team.leader.name,
      participantId: team.leader.participantId,
      email: team.leader.email,
      organization: team.leader.organization,
      role: 'leader',
      roleLabel: 'Team Leader',
      isActive: team.leader.isActive,
      lastLoginAt: team.leader.lastLoginAt,
    });
  }

  (team.members || []).forEach((m) => {
    roster.push({
      id: String(m._id),
      name: m.name,
      participantId: m.participantId,
      email: m.email,
      organization: m.organization,
      role: 'member',
      roleLabel: 'Team Member',
      isActive: m.isActive,
      lastLoginAt: m.lastLoginAt,
    });
  });

  let competitionInfo = null;
  if (team.competition) {
    const comp = team.competition;
    const phase = getPhase(comp);
    competitionInfo = {
      id: String(comp._id),
      title: comp.title,
      description: comp.description,
      instructions: comp.instructions,
      startTime: comp.startTime,
      endTime: comp.endTime,
      durationMinutes: comp.durationMinutes,
      totalMarks: comp.totalMarks,
      questionCount: comp.questionCount,
      phase,
    };
  }

  res.json({
    team: {
      id: String(team._id),
      name: team.name,
      code: team.code,
      isActive: team.isActive,
      maxMembers: team.maxMembers,
      notes: team.notes,
      createdAt: team.createdAt,
      competition: competitionInfo,
      roster,
    },
  });
});

/**
 * Get Team attempts summary for the competition
 */
exports.getTeamAttempts = asyncHandler(async (req, res) => {
  const team = await Team.findOne({ leader: req.user._id });
  if (!team) throw new ApiError(404, 'Team not found');

  const rosterIds = [team.leader, ...(team.members || [])].filter(Boolean);
  const attempts = await Attempt.find({
    user: { $in: rosterIds },
    competition: team.competition,
  })
    .populate('user', 'name participantId teamRole')
    .sort({ startedAt: -1 })
    .lean();

  res.json({
    attempts: attempts.map((a) => ({
      id: String(a._id),
      user: {
        id: String(a.user?._id),
        name: a.user?.name,
        participantId: a.user?.participantId,
        teamRole: a.user?.teamRole || 'member',
      },
      status: a.status,
      startedAt: a.startedAt,
      submittedAt: a.submittedAt,
      timeTakenSeconds: a.timeTakenSeconds,
      score: a.status === 'in_progress' ? null : a.score,
      maxScore: a.maxScore,
    })),
  });
});

/**
 * Get Official Team Results once competition results are released
 */
exports.getTeamResults = asyncHandler(async (req, res) => {
  const team = await Team.findOne({ leader: req.user._id });
  if (!team) throw new ApiError(404, 'Team not found');
  if (!team.competition) throw new ApiError(404, 'No competition assigned to this team');

  const comp = await Competition.findById(team.competition);
  if (!comp) throw new ApiError(404, 'Competition not found');

  const release = comp.resultsRelease || {};
  if (!release.published) {
    throw new ApiError(403, 'Official results for this competition have not been published yet.', 'RESULTS_NOT_RELEASED');
  }

  const [ann, teamBoard] = await Promise.all([
    Announcement.findOne({ competition: comp._id, status: 'published' }).lean(),
    computeTeamLeaderboard(comp._id),
  ]);

  const myTeamRank = teamBoard.find((t) => String(t.teamId) === String(team._id));

  res.json({
    competition: {
      id: String(comp._id),
      title: comp.title,
      totalMarks: comp.totalMarks,
    },
    announcement: ann
      ? {
          title: ann.title,
          message: ann.message,
          category: ann.category,
          publishedAt: ann.publishedAt,
          revision: ann.revision,
          highlights: ann.highlights || [],
        }
      : null,
    teamResult: myTeamRank || null,
  });
});

