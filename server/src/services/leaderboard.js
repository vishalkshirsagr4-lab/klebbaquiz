const mongoose = require('mongoose');
const Attempt = require('../models/Attempt');
const Team = require('../models/Team');

/**
 * Standard tie-breaking rank assignment:
 * If score and duration match, participants share the same rank and are marked with isTie: true.
 * Next non-tied rank skips by the number of tied participants.
 */
function assignRanksWithTies(items, getScore = (x) => x.score, getTime = (x) => x.timeTakenSeconds) {
  let prevRank = 1;
  const result = [];

  for (let i = 0; i < items.length; i++) {
    const curr = items[i];
    if (i > 0) {
      const prev = items[i - 1];
      if (getScore(prev) === getScore(curr) && getTime(prev) === getTime(curr)) {
        result.push({ ...curr, rank: prevRank, isTie: true });
        if (result[i - 1]) result[i - 1].isTie = true;
        continue;
      }
    }
    prevRank = i + 1;
    result.push({ ...curr, rank: prevRank, isTie: false });
  }

  return result;
}

/**
 * Best finalised attempt per participant, ranked by effective official score (desc),
 * time taken (asc), submission time (asc).
 * Incorporates audited score corrections if present.
 */
async function computeLeaderboard(competitionId) {
  const rows = await Attempt.aggregate([
    {
      $match: {
        competition: new mongoose.Types.ObjectId(String(competitionId)),
        status: { $in: Attempt.FINAL_STATUSES },
      },
    },
    {
      $addFields: {
        effectiveScore: {
          $ifNull: ['$scoreCorrection.correctedScore', '$score'],
        },
        isCorrected: {
          $cond: [{ $ifNull: ['$scoreCorrection.correctedScore', false] }, true, false],
        },
      },
    },
    { $sort: { effectiveScore: -1, timeTakenSeconds: 1, submittedAt: 1 } },
    {
      $group: {
        _id: '$user',
        attemptId: { $first: '$_id' },
        attemptNumber: { $first: '$attemptNumber' },
        score: { $first: '$effectiveScore' },
        rawScore: { $first: '$score' },
        isCorrected: { $first: '$isCorrected' },
        scoreCorrection: { $first: '$scoreCorrection' },
        maxScore: { $first: '$maxScore' },
        correctCount: { $first: '$correctCount' },
        wrongCount: { $first: '$wrongCount' },
        unansweredCount: { $first: '$unansweredCount' },
        timeTakenSeconds: { $first: '$timeTakenSeconds' },
        submittedAt: { $first: '$submittedAt' },
        status: { $first: '$status' },
        attempts: { $sum: 1 },
      },
    },
    { $sort: { score: -1, timeTakenSeconds: 1, submittedAt: 1 } },
    { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u' } },
    { $unwind: '$u' },
    {
      $project: {
        userId: '$_id',
        _id: 0,
        name: '$u.name',
        participantId: '$u.participantId',
        organization: '$u.organization',
        teamId: '$u.team',
        teamRole: '$u.teamRole',
        attemptId: 1,
        attemptNumber: 1,
        attempts: 1,
        score: 1,
        rawScore: 1,
        isCorrected: 1,
        scoreCorrection: 1,
        maxScore: 1,
        correctCount: 1,
        wrongCount: 1,
        unansweredCount: 1,
        timeTakenSeconds: 1,
        submittedAt: 1,
        status: 1,
      },
    },
  ]);

  return assignRanksWithTies(rows);
}

/**
 * Team-wise leaderboard for a competition:
 * Aggregates results of teams, evaluating official team score (highest individual or aggregate),
 * tie-breaking by duration, and details of all member submissions.
 */
async function computeTeamLeaderboard(competitionId) {
  const individuals = await computeLeaderboard(competitionId);
  const indByUserId = new Map(individuals.map((r) => [String(r.userId), r]));

  // Find teams explicitly linked to this competition or active teams
  const teams = await Team.find({
    $or: [{ competition: competitionId }, { isActive: true }],
  })
    .populate('leader', 'name participantId email organization')
    .populate('members', 'name participantId email organization')
    .lean();

  const teamRows = [];

  for (const t of teams) {
    const leaderId = t.leader ? String(t.leader._id) : null;
    const memberIds = (t.members || []).map((m) => String(m._id));
    const allRosterIds = [leaderId, ...memberIds].filter(Boolean);

    // Get individual results for all members of this team
    const memberResults = [];
    let bestScore = 0;
    let totalScore = 0;
    let bestTime = 9999999;
    let hasSubmission = false;
    let earliestSubmittedAt = null;

    for (const uid of allRosterIds) {
      const res = indByUserId.get(uid);
      const isLeader = uid === leaderId;
      const userDoc = isLeader ? t.leader : (t.members || []).find((m) => String(m._id) === uid);

      if (res) {
        hasSubmission = true;
        totalScore += res.score;
        if (res.score > bestScore || (res.score === bestScore && (res.timeTakenSeconds || 0) < bestTime)) {
          bestScore = res.score;
          bestTime = res.timeTakenSeconds || 0;
        }
        if (!earliestSubmittedAt || (res.submittedAt && new Date(res.submittedAt) < new Date(earliestSubmittedAt))) {
          earliestSubmittedAt = res.submittedAt;
        }

        memberResults.push({
          userId: uid,
          name: userDoc?.name || res.name,
          participantId: userDoc?.participantId || res.participantId,
          role: isLeader ? 'leader' : 'member',
          roleLabel: isLeader ? 'Team Leader' : 'Team Member',
          score: res.score,
          maxScore: res.maxScore,
          timeTakenSeconds: res.timeTakenSeconds,
          correctCount: res.correctCount,
          wrongCount: res.wrongCount,
          unansweredCount: res.unansweredCount,
          status: res.status,
          submittedAt: res.submittedAt,
          isCorrected: res.isCorrected,
          rank: res.rank,
        });
      } else {
        memberResults.push({
          userId: uid,
          name: userDoc?.name || 'Unknown',
          participantId: userDoc?.participantId || '-',
          role: isLeader ? 'leader' : 'member',
          roleLabel: isLeader ? 'Team Leader' : 'Team Member',
          score: null,
          maxScore: null,
          timeTakenSeconds: null,
          correctCount: 0,
          wrongCount: 0,
          unansweredCount: 0,
          status: 'not_submitted',
          submittedAt: null,
          isCorrected: false,
          rank: null,
        });
      }
    }

    // Only include teams linked to this competition OR teams that had at least one member participate
    if (String(t.competition) === String(competitionId) || hasSubmission) {
      teamRows.push({
        teamId: String(t._id),
        teamName: t.name,
        teamCode: t.code,
        leaderName: t.leader?.name || 'Unassigned',
        leaderParticipantId: t.leader?.participantId || '',
        organization: t.leader?.organization || '',
        membersCount: allRosterIds.length,
        submittedMembersCount: memberResults.filter((m) => m.status !== 'not_submitted').length,
        score: bestScore, // Official team score (best member score)
        totalScore, // Cumulative team points
        timeTakenSeconds: hasSubmission ? bestTime : null,
        submittedAt: earliestSubmittedAt,
        hasSubmission,
        members: memberResults,
      });
    }
  }

  // Sort teams by official score desc, time taken asc, submitted at asc
  teamRows.sort((a, b) => {
    if (!a.hasSubmission && b.hasSubmission) return 1;
    if (a.hasSubmission && !b.hasSubmission) return -1;
    if (b.score !== a.score) return b.score - a.score;
    if ((a.timeTakenSeconds || 0) !== (b.timeTakenSeconds || 0)) {
      return (a.timeTakenSeconds || 0) - (b.timeTakenSeconds || 0);
    }
    return new Date(a.submittedAt || 0) - new Date(b.submittedAt || 0);
  });

  return assignRanksWithTies(teamRows);
}

module.exports = { computeLeaderboard, computeTeamLeaderboard, assignRanksWithTies };
