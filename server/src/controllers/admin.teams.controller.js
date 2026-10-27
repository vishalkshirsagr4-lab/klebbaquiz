const Team = require('../models/Team');
const User = require('../models/User');
const Competition = require('../models/Competition');
const audit = require('../services/audit');
const { ApiError, asyncHandler, escapeRegex, generateParticipantId, generateTempPassword, toCSV } = require('../utils/helpers');

async function getUniqueTeamCode(customCode) {
  if (customCode) {
    const existing = await Team.findOne({ code: customCode.toUpperCase() });
    if (existing) {
      throw new ApiError(409, `Team code "${customCode}" is already in use`, 'CODE_EXISTS');
    }
    return customCode.toUpperCase();
  }

  // Generate KLE26-T###
  for (let i = 1; i <= 999; i++) {
    const candidate = `KLE26-T${String(i).padStart(3, '0')}`;
    // eslint-disable-next-line no-await-in-loop
    const exists = await Team.exists({ code: candidate });
    if (!exists) return candidate;
  }
  return `KLE26-T${Date.now().toString(36).toUpperCase()}`;
}

async function getUniqueParticipantId(prefix = 'QM-') {
  for (let i = 0; i < 10; i++) {
    const id = generateParticipantId();
    // eslint-disable-next-line no-await-in-loop
    if (!(await User.exists({ participantId: id }))) return id;
  }
  return `${prefix}${Date.now().toString(36).toUpperCase()}`;
}

/**
 * Creates or associates a member with the team.
 * If user exists by ID, links them.
 * If new, creates user with temporary password and returns credentials.
 */
async function resolveMemberAccount({ userId, name, email, organization }, teamId, teamRole, createdBy) {
  if (userId) {
    const existingUser = await User.findById(userId);
    if (!existingUser) throw new ApiError(404, `User ${userId} not found`);
    
    existingUser.team = teamId;
    existingUser.teamRole = teamRole;
    if (teamRole === 'leader' && existingUser.role !== 'admin') {
      existingUser.role = 'leader';
    } else if (teamRole === 'member' && existingUser.role !== 'admin' && existingUser.role !== 'leader') {
      existingUser.role = 'member';
    }
    await existingUser.save();
    return { user: existingUser, temporaryPassword: null };
  }

  // Create new user
  if (email) {
    const emailExists = await User.exists({ email: email.toLowerCase() });
    if (emailExists) {
      throw new ApiError(409, `A user with email ${email} already exists`, 'EMAIL_TAKEN');
    }
  }

  const temporaryPassword = generateTempPassword();
  const participantId = await getUniqueParticipantId();
  const role = teamRole === 'leader' ? 'leader' : 'member';

  const user = await User.create({
    name,
    ...(email ? { email: email.toLowerCase() } : {}),
    ...(organization ? { organization } : {}),
    role,
    team: teamId,
    teamRole,
    participantId,
    passwordHash: await User.hashPassword(temporaryPassword),
    mustChangePassword: true,
    createdBy: createdBy?._id,
  });

  return { user, temporaryPassword };
}

/**
 * List teams with search, status filter, and competition filter
 */
exports.list = asyncHandler(async (req, res) => {
  const { q, status = 'all', page = 1, limit = 20 } = req.query;
  const competitionId = req.query.competitionId || req.query.competition;
  const filter = {};

  if (status === 'active') filter.isActive = true;
  else if (status === 'inactive') filter.isActive = false;

  if (competitionId && mongoose.isValidObjectId(competitionId)) {
    filter.competition = competitionId;
  }

  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ name: rx }, { code: rx }, { notes: rx }];
  }

  const skip = (page - 1) * limit;
  const [teams, total] = await Promise.all([
    Team.find(filter)
      .populate('leader', 'name participantId email organization isActive lastLoginAt')
      .populate('members', 'name participantId email organization isActive lastLoginAt teamRole')
      .populate('competition', 'title status startTime endTime')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Team.countDocuments(filter),
  ]);

  const formatted = teams.map((t) => ({
    id: String(t._id),
    name: t.name,
    code: t.code,
    leader: t.leader
      ? {
          id: String(t.leader._id),
          ...t.leader,
        }
      : null,
    members: (t.members || []).map((m) => ({
      id: String(m._id),
      ...m,
    })),
    memberCount: (t.members?.length || 0) + (t.leader ? 1 : 0),
    competition: t.competition
      ? {
          id: String(t.competition._id),
          ...t.competition,
        }
      : null,
    maxMembers: t.maxMembers,
    notes: t.notes,
    isActive: t.isActive,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  }));

  res.json({
    teams: formatted,
    items: formatted,
    total,
    page: Number(page),
    pages: Math.ceil(total / limit) || 1,
  });
});

/**
 * Get single team details
 */
exports.get = asyncHandler(async (req, res) => {
  const team = await Team.findById(req.params.id)
    .populate('leader', 'name participantId email organization isActive mustChangePassword lastLoginAt')
    .populate('members', 'name participantId email organization isActive mustChangePassword lastLoginAt teamRole')
    .populate('competition', 'title status startTime endTime durationMinutes');

  if (!team) throw new ApiError(404, 'Team not found', 'TEAM_NOT_FOUND');

  res.json({ team });
});

/**
 * Create a team with leader and optional members.
 * Supports auto-generating accounts with temporary passwords.
 */
exports.create = asyncHandler(async (req, res) => {
  const { name, code, competition, maxMembers = 4, notes = '', isActive = true, leader, members = [] } = req.body;

  const existingName = await Team.findOne({ name: { $regex: new RegExp(`^${escapeRegex(name)}$`, 'i') } });
  if (existingName) {
    throw new ApiError(409, `A team named "${name}" already exists`, 'TEAM_NAME_EXISTS');
  }

  const teamCode = await getUniqueTeamCode(code);

  // Validate maxMembers limit
  const totalIncoming = 1 + (members?.length || 0);
  if (totalIncoming > maxMembers) {
    throw new ApiError(400, `Team cannot have more than ${maxMembers} members (you specified ${totalIncoming})`);
  }

  // Create temporary placeholder ID for team
  const teamDoc = new Team({
    name: name.trim(),
    code: teamCode,
    maxMembers,
    notes,
    isActive,
    competition: competition || undefined,
    createdBy: req.user._id,
  });

  const generatedCredentials = [];

  // Resolve leader
  const leaderRes = await resolveMemberAccount(leader, teamDoc._id, 'leader', req.user);
  teamDoc.leader = leaderRes.user._id;
  if (leaderRes.temporaryPassword) {
    generatedCredentials.push({
      userId: String(leaderRes.user._id),
      name: leaderRes.user.name,
      participantId: leaderRes.user.participantId,
      email: leaderRes.user.email,
      role: 'Team Leader',
      temporaryPassword: leaderRes.temporaryPassword,
    });
  }

  // Resolve members
  const memberIds = [];
  for (const m of members) {
    // eslint-disable-next-line no-await-in-loop
    const mRes = await resolveMemberAccount(m, teamDoc._id, 'member', req.user);
    memberIds.push(mRes.user._id);
    if (mRes.temporaryPassword) {
      generatedCredentials.push({
        userId: String(mRes.user._id),
        name: mRes.user.name,
        participantId: mRes.user.participantId,
        email: mRes.user.email,
        role: 'Team Member',
        temporaryPassword: mRes.temporaryPassword,
      });
    }
  }
  teamDoc.members = memberIds;

  await teamDoc.save();

  // If competition is set and visibility is assigned, ensure users are assigned to competition
  if (competition) {
    const allUserIds = [teamDoc.leader, ...teamDoc.members];
    await Competition.updateOne(
      { _id: competition },
      { $addToSet: { assignedParticipants: { $each: allUserIds } } }
    );
  }

  await audit(req, 'TEAM_CREATED', {
    targetId: teamDoc._id,
    targetType: 'Team',
    meta: { name: teamDoc.name, code: teamDoc.code, memberCount: totalIncoming },
  });

  const populated = await Team.findById(teamDoc._id)
    .populate('leader', 'name participantId email organization')
    .populate('members', 'name participantId email organization')
    .populate('competition', 'title status');

  res.status(201).json({
    team: populated,
    generatedCredentials,
  });
});

/**
 * Update team metadata
 */
exports.update = asyncHandler(async (req, res) => {
  const { name, code, competition, maxMembers, notes, isActive } = req.body;
  const team = await Team.findById(req.params.id);
  if (!team) throw new ApiError(404, 'Team not found');

  if (name && name !== team.name) {
    const existing = await Team.findOne({
      _id: { $ne: team._id },
      name: { $regex: new RegExp(`^${escapeRegex(name)}$`, 'i') },
    });
    if (existing) throw new ApiError(409, `Team name "${name}" is already taken`);
    team.name = name.trim();
  }

  if (code && code.toUpperCase() !== team.code) {
    const existing = await Team.findOne({ _id: { $ne: team._id }, code: code.toUpperCase() });
    if (existing) throw new ApiError(409, `Team code "${code}" is already taken`);
    team.code = code.toUpperCase();
  }

  if (maxMembers !== undefined) {
    const currentTotal = 1 + (team.members?.length || 0);
    if (maxMembers < currentTotal) {
      throw new ApiError(400, `Cannot set maximum members to ${maxMembers} because team already has ${currentTotal} members`);
    }
    team.maxMembers = maxMembers;
  }

  if (notes !== undefined) team.notes = notes;
  if (isActive !== undefined) team.isActive = isActive;

  if (competition !== undefined) {
    const prevComp = team.competition;
    team.competition = competition || null;
    if (competition && String(competition) !== String(prevComp)) {
      const allUserIds = [team.leader, ...(team.members || [])].filter(Boolean);
      await Competition.updateOne(
        { _id: competition },
        { $addToSet: { assignedParticipants: { $each: allUserIds } } }
      );
    }
  }

  await team.save();
  await audit(req, 'TEAM_UPDATED', { targetId: team._id, targetType: 'Team', meta: { name: team.name } });

  const updated = await Team.findById(team._id)
    .populate('leader', 'name participantId email organization')
    .populate('members', 'name participantId email organization')
    .populate('competition', 'title status');

  res.json({ team: updated });
});

/**
 * Add members to an existing team
 */
exports.addMembers = asyncHandler(async (req, res) => {
  const { members } = req.body;
  const team = await Team.findById(req.params.id);
  if (!team) throw new ApiError(404, 'Team not found');

  const currentCount = 1 + (team.members?.length || 0);
  if (currentCount + members.length > team.maxMembers) {
    throw new ApiError(400, `Adding ${members.length} members would exceed the team limit of ${team.maxMembers}`);
  }

  const generatedCredentials = [];
  const addedIds = [];

  for (const m of members) {
    // eslint-disable-next-line no-await-in-loop
    const mRes = await resolveMemberAccount(m, team._id, 'member', req.user);
    addedIds.push(mRes.user._id);
    if (mRes.temporaryPassword) {
      generatedCredentials.push({
        userId: String(mRes.user._id),
        name: mRes.user.name,
        participantId: mRes.user.participantId,
        email: mRes.user.email,
        role: 'Team Member',
        temporaryPassword: mRes.temporaryPassword,
      });
    }
  }

  team.members.push(...addedIds);
  await team.save();

  if (team.competition) {
    await Competition.updateOne(
      { _id: team.competition },
      { $addToSet: { assignedParticipants: { $each: addedIds } } }
    );
  }

  await audit(req, 'TEAM_MEMBERS_ADDED', {
    targetId: team._id,
    targetType: 'Team',
    meta: { addedCount: addedIds.length },
  });

  const updated = await Team.findById(team._id)
    .populate('leader', 'name participantId email organization')
    .populate('members', 'name participantId email organization')
    .populate('competition', 'title status');

  res.json({ team: updated, generatedCredentials });
});

/**
 * Remove a member from the team
 */
exports.removeMember = asyncHandler(async (req, res) => {
  const { id: teamId, memberId } = req.params;
  const team = await Team.findById(teamId);
  if (!team) throw new ApiError(404, 'Team not found');

  if (String(team.leader) === String(memberId)) {
    throw new ApiError(400, 'Cannot remove the team leader. Change the team leader first.');
  }

  team.members = team.members.filter((m) => String(m) !== String(memberId));
  await team.save();

  // Reset user's team fields
  await User.updateOne(
    { _id: memberId },
    { $unset: { team: 1 }, $set: { teamRole: 'individual', role: 'student' } }
  );

  await audit(req, 'TEAM_MEMBER_REMOVED', {
    targetId: team._id,
    targetType: 'Team',
    meta: { memberId },
  });

  res.json({ ok: true });
});

/**
 * Change the team leader
 */
exports.changeLeader = asyncHandler(async (req, res) => {
  const { id: teamId } = req.params;
  const team = await Team.findById(teamId);
  if (!team) throw new ApiError(404, 'Team not found');

  const oldLeaderId = team.leader;
  let newLeaderId;
  let generatedCredentials = null;

  if (req.body.userId) {
    newLeaderId = req.body.userId;
    const newLeader = await User.findById(newLeaderId);
    if (!newLeader) throw new ApiError(404, 'User not found');
    newLeader.team = team._id;
    newLeader.teamRole = 'leader';
    if (newLeader.role !== 'admin') newLeader.role = 'leader';
    await newLeader.save();
  } else {
    // Create new leader
    const lRes = await resolveMemberAccount(req.body, team._id, 'leader', req.user);
    newLeaderId = lRes.user._id;
    if (lRes.temporaryPassword) {
      generatedCredentials = {
        userId: String(lRes.user._id),
        name: lRes.user.name,
        participantId: lRes.user.participantId,
        email: lRes.user.email,
        role: 'Team Leader',
        temporaryPassword: lRes.temporaryPassword,
      };
    }
  }

  // Update old leader
  if (oldLeaderId && String(oldLeaderId) !== String(newLeaderId)) {
    await User.updateOne(
      { _id: oldLeaderId },
      { $set: { teamRole: 'member', role: 'member' } }
    );
    // Add old leader to members if not already there
    if (!team.members.map(String).includes(String(oldLeaderId))) {
      team.members.push(oldLeaderId);
    }
  }

  // Remove new leader from members array if present
  team.members = team.members.filter((m) => String(m) !== String(newLeaderId));
  team.leader = newLeaderId;
  await team.save();

  if (team.competition) {
    await Competition.updateOne(
      { _id: team.competition },
      { $addToSet: { assignedParticipants: newLeaderId } }
    );
  }

  await audit(req, 'TEAM_LEADER_CHANGED', {
    targetId: team._id,
    targetType: 'Team',
    meta: { oldLeaderId, newLeaderId },
  });

  const updated = await Team.findById(team._id)
    .populate('leader', 'name participantId email organization')
    .populate('members', 'name participantId email organization');

  res.json({ team: updated, generatedCredentials });
});

/**
 * Reset member or leader temporary password
 */
exports.resetMemberPassword = asyncHandler(async (req, res) => {
  const { id: teamId, memberId } = req.params;
  const team = await Team.findById(teamId);
  if (!team) throw new ApiError(404, 'Team not found');

  const isLeader = String(team.leader) === String(memberId);
  const isMember = team.members.some((m) => String(m) === String(memberId));
  if (!isLeader && !isMember) {
    throw new ApiError(400, 'User is not part of this team');
  }

  const user = await User.findById(memberId);
  if (!user) throw new ApiError(404, 'User not found');

  const temporaryPassword = generateTempPassword();
  user.passwordHash = await User.hashPassword(temporaryPassword);
  user.mustChangePassword = true;
  user.failedLoginCount = 0;
  user.lockUntil = undefined;
  user.tokenVersion += 1; // invalidate existing tokens
  await user.save();

  await audit(req, 'TEAM_MEMBER_PASSWORD_RESET', {
    targetId: user._id,
    targetType: 'User',
    meta: { teamId, participantId: user.participantId },
  });

  res.json({
    userId: String(user._id),
    name: user.name,
    participantId: user.participantId,
    email: user.email,
    temporaryPassword,
  });
});

/**
 * Delete a team
 */
exports.remove = asyncHandler(async (req, res) => {
  const team = await Team.findById(req.params.id);
  if (!team) throw new ApiError(404, 'Team not found');

  // Disassociate members and leader
  const allUserIds = [team.leader, ...(team.members || [])].filter(Boolean);
  await User.updateMany(
    { _id: { $in: allUserIds } },
    { $unset: { team: 1 }, $set: { teamRole: 'individual', role: 'student' } }
  );

  await Team.deleteOne({ _id: team._id });
  await audit(req, 'TEAM_DELETED', {
    targetId: team._id,
    targetType: 'Team',
    meta: { name: team.name, code: team.code },
  });

  res.json({ ok: true });
});

/**
 * Export teams CSV
 */
exports.exportCsv = asyncHandler(async (_req, res) => {
  const teams = await Team.find({})
    .populate('leader', 'name participantId email organization')
    .populate('members', 'name participantId email organization')
    .populate('competition', 'title')
    .sort({ name: 1 })
    .lean();

  const rows = [
    ['Team Name', 'Team Code', 'Status', 'Competition', 'Role in Team', 'Member Name', 'Participant ID', 'Email', 'Organization'],
  ];

  teams.forEach((t) => {
    const status = t.isActive ? 'Active' : 'Inactive';
    const compTitle = t.competition?.title || 'None';

    if (t.leader) {
      rows.push([
        t.name,
        t.code,
        status,
        compTitle,
        'Leader',
        t.leader.name,
        t.leader.participantId || '',
        t.leader.email || '',
        t.leader.organization || '',
      ]);
    }

    (t.members || []).forEach((m) => {
      rows.push([
        t.name,
        t.code,
        status,
        compTitle,
        'Member',
        m.name,
        m.participantId || '',
        m.email || '',
        m.organization || '',
      ]);
    });
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="kle26-teams-roster.csv"');
  res.send(toCSV(rows));
});
