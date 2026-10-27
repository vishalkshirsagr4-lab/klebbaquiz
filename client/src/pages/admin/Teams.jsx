import { useState, useId } from 'react';
import {
  Plus,
  Search,
  Users2,
  Pencil,
  KeyRound,
  Trash2,
  Download,
  AlertTriangle,
  UserCheck,
  UserPlus,
  Crown,
  Printer,
  Copy,
  Check,
  ExternalLink,
  ChevronRight,
  Shield,
  X,
} from 'lucide-react';
import { api, qs, downloadFile } from '../../lib/api.js';
import { useFetch } from '../../lib/hooks.js';
import { useToast } from '../../context/ToastContext.jsx';
import { downloadCsvText, fmtDateTime } from '../../lib/format.js';
import {
  Alert,
  Badge,
  Button,
  ConfirmModal,
  CopyButton,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  PageHeader,
  Pagination,
  Select,
  Skeleton,
  Textarea,
  TableWrap,
  useDebounced,
} from '../../components/ui.jsx';

/**
 * Print & Copy friendly Team Credentials Sheet
 */
function TeamCredentialsModal({ credentials, teamInfo, onClose }) {
  const [copiedAll, setCopiedAll] = useState(false);
  if (!credentials || credentials.length === 0) return null;

  const copyAllFormatted = async () => {
    const text = [
      `=========================================`,
      `KLE BBA CLUSTER EVENT QUIZMASTER`,
      `TEAM CREDENTIAL SHEET`,
      `Team Name: ${teamInfo?.name || 'Assigned Team'}`,
      `Team Code: ${teamInfo?.code || ''}`,
      `=========================================`,
      ``,
      ...credentials.map(
        (c) =>
          `[${c.role.toUpperCase()}]\nName: ${c.name}\nLogin ID: ${c.participantId}\nTemp Password: ${c.temporaryPassword}\nLogin Portal: ${window.location.origin}/login\n`
      ),
      `* Note: Temporary passwords must be changed upon first login.`,
      `* Please distribute credentials privately.`,
    ].join('\n');

    try {
      await navigator.clipboard.writeText(text);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    } catch {
      // fallback
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Team Credentials (Single-View Notice)"
      size="lg"
      footer={
        <div className="flex flex-wrap items-center justify-between w-full gap-2">
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" icon={Printer} onClick={handlePrint}>
              Print Sheet
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={copiedAll ? Check : Copy}
              onClick={copyAllFormatted}
            >
              {copiedAll ? 'Copied All!' : 'Copy Formatted Text'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={Download}
              onClick={() =>
                downloadCsvText(
                  [
                    ['Role', 'Name', 'Login ID', 'Temporary Password', 'Team Name', 'Team Code'],
                    ...credentials.map((r) => [
                      r.role,
                      r.name,
                      r.participantId,
                      r.temporaryPassword,
                      teamInfo?.name || '',
                      teamInfo?.code || '',
                    ]),
                  ],
                  `kle26-credentials-${teamInfo?.code || 'team'}.csv`
                )
              }
            >
              CSV
            </Button>
          </div>
          <Button onClick={onClose}>I have securely stored these</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Alert tone="warning" title="Important: Displayed Only Once">
          For cryptographic security, temporary passwords are encrypted with bcrypt and cannot be retrieved again from the database. Copy or print these credentials now before closing this modal.
        </Alert>

        {teamInfo && (
          <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-4 border border-slate-200 dark:border-slate-700/60 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Team Details</p>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">{teamInfo.name}</h3>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-500">Team Code</span>
              <p className="font-mono text-base font-extrabold text-brand-600 dark:text-brand-400">
                {teamInfo.code}
              </p>
            </div>
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800 text-sm">
            <thead className="bg-slate-100 dark:bg-slate-800/80 text-left font-semibold text-slate-700 dark:text-slate-300">
              <tr>
                <th className="py-2.5 px-3">Role</th>
                <th className="py-2.5 px-3">Participant Name</th>
                <th className="py-2.5 px-3">Login ID</th>
                <th className="py-2.5 px-3">Temporary Password</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {credentials.map((r) => (
                <tr key={r.participantId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">
                    <span className="inline-flex items-center gap-1.5">
                      {r.role.includes('Leader') ? (
                        <Crown className="h-4 w-4 text-amber-500" />
                      ) : (
                        <Shield className="h-4 w-4 text-slate-400" />
                      )}
                      {r.role}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-medium text-slate-800 dark:text-slate-200">{r.name}</td>
                  <td className="py-2.5 px-3 font-mono font-semibold text-brand-600 dark:text-brand-400">
                    {r.participantId} <CopyButton text={r.participantId} />
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="font-mono bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-slate-900 dark:text-white font-bold select-all">
                      {r.temporaryPassword}
                    </span>
                    <CopyButton text={r.temporaryPassword} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
          First-time login URL:{' '}
          <span className="font-mono text-slate-700 dark:text-slate-300">{window.location.origin}/login</span>
        </p>
      </div>
    </Modal>
  );
}

/**
 * Single Member Password Reset Modal
 */
function SinglePasswordResetModal({ creds, onClose }) {
  if (!creds) return null;
  return (
    <Modal
      open
      onClose={onClose}
      title="Password Reset Notice"
      size="sm"
      footer={<Button onClick={onClose}>Done</Button>}
    >
      <Alert tone="warning" title="New Temporary Password">
        The user's password has been reset. They will be forced to change it upon their next sign in.
      </Alert>
      <div className="mt-4 space-y-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-4 border border-slate-200 dark:border-slate-700">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
          User: <span className="font-bold">{creds.name}</span>
        </p>
        <p className="text-xs text-slate-500">
          Login ID:{' '}
          <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{creds.participantId}</span>{' '}
          <CopyButton text={creds.participantId} />
        </p>
        <div className="pt-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Temporary Password</p>
          <div className="mt-1 flex items-center justify-between rounded-xl bg-white dark:bg-slate-900 p-2.5 border border-slate-200 dark:border-slate-700">
            <span className="font-mono text-lg font-extrabold text-brand-600 dark:text-brand-400 select-all">
              {creds.temporaryPassword}
            </span>
            <CopyButton text={creds.temporaryPassword} />
          </div>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Create or Edit Team Modal
 */
function TeamFormModal({ team, competitions, students, onClose, onSaved }) {
  const toast = useToast();
  const isEditing = Boolean(team);

  const [name, setName] = useState(team?.name || '');
  const [code, setCode] = useState(team?.code || '');
  const [competition, setCompetition] = useState(team?.competition?.id || team?.competition || '');
  const [maxMembers, setMaxMembers] = useState(team?.maxMembers || 4);
  const [notes, setNotes] = useState(team?.notes || '');
  const [isActive, setIsActive] = useState(team ? team.isActive : true);

  // Leader state for create
  const [leaderMode, setLeaderMode] = useState('new'); // 'new' | 'existing'
  const [leaderExistingId, setLeaderExistingId] = useState('');
  const [leaderNew, setLeaderNew] = useState({ name: '', studentId: '', email: '', organization: '' });

  // Members list for create
  const [memberRows, setMemberRows] = useState([
    { id: '1', mode: 'new', existingId: '', name: '', studentId: '', email: '', organization: '' },
  ]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const addMemberRow = () => {
    if (1 + memberRows.length >= Number(maxMembers)) {
      toast.error(`Team is configured for maximum ${maxMembers} members (including leader)`);
      return;
    }
    setMemberRows((rows) => [
      ...rows,
      { id: String(Date.now()), mode: 'new', existingId: '', name: '', studentId: '', email: '', organization: '' },
    ]);
  };

  const removeMemberRow = (idx) => {
    setMemberRows((rows) => rows.filter((_, i) => i !== idx));
  };

  const updateMemberRow = (idx, field, val) => {
    setMemberRows((rows) => {
      const copy = [...rows];
      copy[idx] = { ...copy[idx], [field]: val };
      return copy;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Team name is required');
      return;
    }

    setBusy(true);
    try {
      if (isEditing) {
        await api.patch(`/admin/teams/${team.id}`, {
          name: name.trim(),
          code: code.trim() || undefined,
          competition: competition || null,
          maxMembers: Number(maxMembers),
          notes: notes.trim(),
          isActive,
        });
        toast.success('Team updated successfully');
        onSaved();
      } else {
        // Validation for creation
        let leaderPayload;
        if (leaderMode === 'existing') {
          if (!leaderExistingId) throw new Error('Please select an existing student for Team Leader');
          leaderPayload = { userId: leaderExistingId };
        } else {
          if (!leaderNew.name.trim()) throw new Error('Please enter the Team Leader full name');
          leaderPayload = {
            name: leaderNew.name.trim(),
            studentId: leaderNew.studentId.trim() || undefined,
            email: leaderNew.email.trim() || undefined,
            organization: leaderNew.organization.trim() || undefined,
          };
        }

        const validMembers = [];
        for (let i = 0; i < memberRows.length; i++) {
          const row = memberRows[i];
          if (row.mode === 'existing') {
            if (row.existingId) {
              validMembers.push({ userId: row.existingId });
            }
          } else if (row.name.trim()) {
            validMembers.push({
              name: row.name.trim(),
              studentId: row.studentId.trim() || undefined,
              email: row.email.trim() || undefined,
              organization: row.organization.trim() || undefined,
            });
          }
        }

        const payload = {
          name: name.trim(),
          code: code.trim() || undefined,
          competition: competition || undefined,
          maxMembers: Number(maxMembers),
          notes: notes.trim() || undefined,
          leader: leaderPayload,
          members: validMembers,
        };

        const res = await api.post('/admin/teams', payload);
        toast.success(`Team "${res.team.name}" created successfully!`);
        onSaved({ team: res.team, credentials: res.generatedCredentials });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={isEditing ? `Edit Team: ${team.name}` : 'Create New Team (KLE26)'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={busy}>
            {isEditing ? 'Save Changes' : 'Create Team & Generate Credentials'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && <Alert tone="error">{error}</Alert>}

        {/* Team Basic Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Team Name *" hint="e.g. Athena Titans, Nexus Warriors">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter unique team name"
              required
              autoFocus
            />
          </Field>
          <Field
            label="Team Code"
            hint="Leave blank to auto-generate (e.g. KLE26-T001)"
          >
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. KLE26-T001 (auto)"
            />
          </Field>
          <Field label="Assign Competition (Optional)">
            <Select value={competition} onChange={(e) => setCompetition(e.target.value)}>
              <option value="">-- No Competition Assigned --</option>
              {competitions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} ({c.status})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Maximum Team Members" hint="Permitted team size (1-20)">
            <Input
              type="number"
              min="1"
              max="20"
              value={maxMembers}
              onChange={(e) => setMaxMembers(e.target.value)}
            />
          </Field>
        </div>

        {isEditing && (
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isActiveCheck"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <label htmlFor="isActiveCheck" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Team is Active (inactive teams cannot log in or participate)
            </label>
          </div>
        )}

        <Field label="Notes / Institution Details">
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="College name, department, or internal notes"
          />
        </Field>

        {/* Team Leader Section (Only in creation) */}
        {!isEditing && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Crown className="h-5 w-5 text-amber-500" />
                <h3 className="font-bold text-slate-900 dark:text-white">Designate Team Leader *</h3>
              </div>
              <div className="flex rounded-lg bg-white p-0.5 shadow-sm border border-slate-200 dark:border-slate-700 dark:bg-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => setLeaderMode('new')}
                  className={`px-2.5 py-1 rounded font-semibold transition ${
                    leaderMode === 'new'
                      ? 'bg-amber-500 text-white'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Create New Account
                </button>
                <button
                  type="button"
                  onClick={() => setLeaderMode('existing')}
                  className={`px-2.5 py-1 rounded font-semibold transition ${
                    leaderMode === 'existing'
                      ? 'bg-amber-500 text-white'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Select Existing
                </button>
              </div>
            </div>

            {leaderMode === 'new' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <Field label="Leader Full Name *">
                  <Input
                    value={leaderNew.name}
                    onChange={(e) => setLeaderNew({ ...leaderNew, name: e.target.value })}
                    placeholder="e.g. John Doe"
                    required
                  />
                </Field>
                <Field label="Roll / Identifier">
                  <Input
                    value={leaderNew.studentId}
                    onChange={(e) => setLeaderNew({ ...leaderNew, studentId: e.target.value })}
                    placeholder="e.g. BBA2024-042"
                  />
                </Field>
                <Field label="Email (Optional)">
                  <Input
                    type="email"
                    value={leaderNew.email}
                    onChange={(e) => setLeaderNew({ ...leaderNew, email: e.target.value })}
                    placeholder="leader@example.com"
                  />
                </Field>
                <Field label="Class / Department">
                  <Input
                    value={leaderNew.organization}
                    onChange={(e) => setLeaderNew({ ...leaderNew, organization: e.target.value })}
                    placeholder="e.g. BBA Final Year"
                  />
                </Field>
              </div>
            ) : (
              <Field label="Select Registered Student">
                <Select
                  value={leaderExistingId}
                  onChange={(e) => setLeaderExistingId(e.target.value)}
                >
                  <option value="">-- Choose student --</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.participantId || s.username}) {s.team ? '[Already in team]' : ''}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
        )}

        {/* Members Roster Section (Only in creation) */}
        {!isEditing && (
          <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white">Team Members</h3>
                <p className="text-xs text-slate-500">
                  Total team members: {1 + memberRows.length} / {maxMembers} permitted
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                icon={Plus}
                onClick={addMemberRow}
                disabled={1 + memberRows.length >= Number(maxMembers)}
              >
                Add Member
              </Button>
            </div>

            {memberRows.map((row, idx) => (
              <div
                key={row.id}
                className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-900/50 space-y-2 relative"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-slate-500 uppercase">
                    Member #{idx + 1}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        updateMemberRow(idx, 'mode', row.mode === 'new' ? 'existing' : 'new')
                      }
                      className="text-xs font-semibold text-brand-600 hover:underline"
                    >
                      {row.mode === 'new' ? 'Switch to Existing Student' : 'Switch to New Account'}
                    </button>
                    {memberRows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeMemberRow(idx)}
                        className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-rose-600 dark:hover:bg-slate-800"
                        title="Remove member row"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                {row.mode === 'new' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <Input
                      value={row.name}
                      onChange={(e) => updateMemberRow(idx, 'name', e.target.value)}
                      placeholder="Member Full Name"
                    />
                    <Input
                      value={row.studentId}
                      onChange={(e) => updateMemberRow(idx, 'studentId', e.target.value)}
                      placeholder="Student Roll / ID (optional)"
                    />
                    <Input
                      type="email"
                      value={row.email}
                      onChange={(e) => updateMemberRow(idx, 'email', e.target.value)}
                      placeholder="Email (optional)"
                    />
                    <Input
                      value={row.organization}
                      onChange={(e) => updateMemberRow(idx, 'organization', e.target.value)}
                      placeholder="Class / Dept (optional)"
                    />
                  </div>
                ) : (
                  <Select
                    value={row.existingId}
                    onChange={(e) => updateMemberRow(idx, 'existingId', e.target.value)}
                  >
                    <option value="">-- Choose student --</option>
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.participantId || s.username})
                      </option>
                    ))}
                  </Select>
                )}
              </div>
            ))}
          </div>
        )}
      </form>
    </Modal>
  );
}

/**
 * Manage Team Roster Modal (View/Add/Remove/Reset Password)
 */
function TeamRosterModal({ team, students, onClose, onRefresh, onShowResetPassword, onShowNewCredentials }) {
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberRoll, setNewMemberRoll] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [busy, setBusy] = useState(false);

  // Change leader
  const [changingLeader, setChangingLeader] = useState(false);
  const [newLeaderId, setNewLeaderId] = useState('');

  const currentCount = 1 + (team.members?.length || 0);

  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!newMemberName.trim()) {
      toast.error('Please enter member name');
      return;
    }
    setBusy(true);
    try {
      const res = await api.post(`/admin/teams/${team.id}/members`, {
        members: [
          {
            name: newMemberName.trim(),
            studentId: newMemberRoll.trim() || undefined,
            email: newMemberEmail.trim() || undefined,
          },
        ],
      });
      toast.success('Member added successfully!');
      setAdding(false);
      setNewMemberName('');
      setNewMemberRoll('');
      setNewMemberEmail('');
      onRefresh();
      if (res.generatedCredentials?.length) {
        onShowNewCredentials(res.generatedCredentials);
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveMember = async (memberId, memberName) => {
    if (!confirm(`Are you sure you want to remove ${memberName} from this team?`)) return;
    try {
      await api.del(`/admin/teams/${team.id}/members/${memberId}`);
      toast.success(`${memberName} removed from team`);
      onRefresh();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleResetPassword = async (memberId) => {
    try {
      const res = await api.post(`/admin/teams/${team.id}/members/${memberId}/reset-password`);
      onShowResetPassword(res);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleChangeLeader = async () => {
    if (!newLeaderId) return;
    try {
      await api.post(`/admin/teams/${team.id}/leader`, { userId: newLeaderId });
      toast.success('Team leader updated successfully');
      setChangingLeader(false);
      onRefresh();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Roster Management: ${team.name}`}
      size="lg"
      footer={<Button onClick={onClose}>Done</Button>}
    >
      <div className="space-y-6">
        {/* Header Summary */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-4 border border-slate-200 dark:border-slate-700/60">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Team Code</p>
            <p className="font-mono text-xl font-extrabold text-brand-600 dark:text-brand-400">
              {team.code} <CopyButton text={team.code} />
            </p>
          </div>
          <div>
            <span className="text-xs text-slate-500">Roster Capacity</span>
            <p className="font-semibold text-slate-900 dark:text-white">
              {currentCount} / {team.maxMembers} Members
            </p>
          </div>
          <div>
            <span className="text-xs text-slate-500">Assigned Competition</span>
            <p className="font-semibold text-slate-900 dark:text-white">
              {team.competition?.title || 'None assigned'}
            </p>
          </div>
        </div>

        {/* Change Leader Option */}
        {changingLeader ? (
          <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800 space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
              Select New Leader from Team Members
            </h4>
            <div className="flex gap-2">
              <Select value={newLeaderId} onChange={(e) => setNewLeaderId(e.target.value)} className="flex-1">
                <option value="">-- Select Member --</option>
                {(team.members || []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.participantId})
                  </option>
                ))}
              </Select>
              <Button size="sm" onClick={handleChangeLeader} disabled={!newLeaderId}>
                Confirm
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setChangingLeader(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {/* Roster Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-800 text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/70 text-left font-semibold text-slate-700 dark:text-slate-300">
              <tr>
                <th className="py-2.5 px-3">Role</th>
                <th className="py-2.5 px-3">Participant Name</th>
                <th className="py-2.5 px-3">Login ID</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {/* Leader Row */}
              {team.leader && (
                <tr className="bg-amber-50/30 dark:bg-amber-950/10">
                  <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">
                    <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-bold">
                      <Crown className="h-4 w-4" /> Leader
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white">
                    {team.leader.name}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-brand-600 dark:text-brand-400 font-semibold">
                    {team.leader.participantId} <CopyButton text={team.leader.participantId} />
                  </td>
                  <td className="py-2.5 px-3">
                    <Badge tone={team.leader.isActive ? 'green' : 'gray'}>
                      {team.leader.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        size="xs"
                        variant="secondary"
                        icon={KeyRound}
                        onClick={() => handleResetPassword(team.leader.id)}
                        title="Reset temporary password"
                      >
                        Reset PW
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => setChangingLeader(true)}
                        title="Change team leader"
                      >
                        Change
                      </Button>
                    </div>
                  </td>
                </tr>
              )}

              {/* Members Rows */}
              {(team.members || []).map((m) => (
                <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1.5">
                      <Shield className="h-4 w-4 text-slate-400" /> Member
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-medium text-slate-800 dark:text-slate-200">{m.name}</td>
                  <td className="py-2.5 px-3 font-mono text-slate-700 dark:text-slate-300">
                    {m.participantId} <CopyButton text={m.participantId} />
                  </td>
                  <td className="py-2.5 px-3">
                    <Badge tone={m.isActive ? 'green' : 'gray'}>
                      {m.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        size="xs"
                        variant="secondary"
                        icon={KeyRound}
                        onClick={() => handleResetPassword(m.id)}
                        title="Reset temporary password"
                      >
                        Reset PW
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        className="text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                        onClick={() => handleRemoveMember(m.id, m.name)}
                        title="Remove member from team"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Add Member Form within limits */}
        {currentCount < team.maxMembers ? (
          <div>
            {!adding ? (
              <Button
                variant="secondary"
                size="sm"
                icon={UserPlus}
                onClick={() => setAdding(true)}
              >
                Add Member to Team ({team.maxMembers - currentCount} slots available)
              </Button>
            ) : (
              <form onSubmit={handleAddMember} className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3 bg-slate-50 dark:bg-slate-900/60">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">Add New Team Member</h4>
                  <button
                    type="button"
                    onClick={() => setAdding(false)}
                    className="text-xs text-slate-400 hover:text-slate-600"
                  >
                    Cancel
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <Input
                    value={newMemberName}
                    onChange={(e) => setNewMemberName(e.target.value)}
                    placeholder="Full Name *"
                    required
                  />
                  <Input
                    value={newMemberRoll}
                    onChange={(e) => setNewMemberRoll(e.target.value)}
                    placeholder="Roll / ID (optional)"
                  />
                  <Input
                    type="email"
                    value={newMemberEmail}
                    onChange={(e) => setNewMemberEmail(e.target.value)}
                    placeholder="Email (optional)"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button type="button" variant="secondary" size="sm" onClick={() => setAdding(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" loading={busy}>
                    Generate Login &amp; Add
                  </Button>
                </div>
              </form>
            )}
          </div>
        ) : (
          <p className="text-xs text-slate-400 italic">
            This team has reached its maximum configured member limit of {team.maxMembers}. Edit the team to increase the capacity.
          </p>
        )}
      </div>
    </Modal>
  );
}

/**
 * Main Admin Teams Management Page
 */
export default function AdminTeams() {
  const toast = useToast();
  const [q, setQ] = useState('');
  const debouncedQ = useDebounced(q);
  const [status, setStatus] = useState('');
  const [compFilter, setCompFilter] = useState('');
  const [page, setPage] = useState(1);

  // Modals state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editTeam, setEditTeam] = useState(null);
  const [rosterTeam, setRosterTeam] = useState(null);
  const [credentialsModal, setCredentialsModal] = useState(null); // { team, list }
  const [singleReset, setSingleReset] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Fetch teams query
  const queryUrl = `/admin/teams${qs({
    page,
    limit: 20,
    status: status || undefined,
    competition: compFilter || undefined,
    q: debouncedQ || undefined,
  })}`;

  const { data, loading, error, reload } = useFetch(queryUrl);

  // Fetch competitions for assignment dropdown
  const { data: compData } = useFetch('/admin/competitions');
  const competitions = compData?.competitions || [];

  // Fetch students for existing select
  const { data: userData } = useFetch('/admin/users?limit=200');
  const students = userData?.items || [];

  const handleDeleteTeam = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await api.del(`/admin/teams/${deleteTarget.id}`);
      toast.success(`Team "${deleteTarget.name}" deleted successfully`);
      setDeleteTarget(null);
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleExportCsv = async () => {
    try {
      await downloadFile('/admin/teams/export.csv', 'kle26-teams-roster.csv');
      toast.success('Roster CSV downloaded');
    } catch (err) {
      toast.error('Failed to export CSV: ' + err.message);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Teams Management (KLE26)"
        subtitle="Create, configure, and monitor competition teams and member credentials."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" icon={Download} onClick={handleExportCsv}>
              Export Roster CSV
            </Button>
            <Button icon={Plus} onClick={() => setCreateModalOpen(true)}>
              Create Team
            </Button>
          </div>
        }
      />

      {/* Filter / Search Bar */}
      <div className="card p-4 space-y-3 sm:space-y-0 sm:flex sm:items-center sm:gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Search teams by name, code, leader, or member..."
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="w-36"
          >
            <option value="">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </Select>
          <Select
            value={compFilter}
            onChange={(e) => {
              setCompFilter(e.target.value);
              setPage(1);
            }}
            className="w-48"
          >
            <option value="">All Competitions</option>
            {competitions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* Teams List Table */}
      {loading ? (
        <div className="card p-6 space-y-3">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : error ? (
        <ErrorState message={error.message} onRetry={reload} />
      ) : !data?.items?.length ? (
        <EmptyState
          icon={Users2}
          title="No teams registered yet"
          description="Create your first team for the KLE BBA Cluster Event to generate leader and member credentials."
          action={
            <Button icon={Plus} onClick={() => setCreateModalOpen(true)}>
              Create Team
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          <TableWrap>
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-left font-semibold text-slate-700 dark:text-slate-300">
              <tr>
                <th className="py-3 px-4">Team</th>
                <th className="py-3 px-4">Team Leader</th>
                <th className="py-3 px-4">Members</th>
                <th className="py-3 px-4">Assigned Competition</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.items.map((t) => {
                const count = 1 + (t.members?.length || 0);
                return (
                  <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3.5 px-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 dark:text-white">
                            {t.name}
                          </span>
                          <span className="font-mono text-xs font-bold bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-brand-600 dark:text-brand-400">
                            {t.code}
                          </span>
                        </div>
                        {t.notes && (
                          <p className="text-xs text-slate-400 truncate max-w-xs mt-0.5">{t.notes}</p>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      {t.leader ? (
                        <div>
                          <p className="font-semibold text-slate-800 dark:text-slate-200 text-sm flex items-center gap-1">
                            <Crown className="h-3.5 w-3.5 text-amber-500" />
                            {t.leader.name}
                          </p>
                          <p className="font-mono text-xs text-slate-500">{t.leader.participantId}</p>
                        </div>
                      ) : (
                        <span className="text-xs text-rose-500 font-semibold">No Leader Assigned</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-slate-700 dark:text-slate-300 text-sm">
                          {count} / {t.maxMembers}
                        </span>
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => setRosterTeam(t)}
                          className="text-xs text-brand-600 dark:text-brand-400 hover:underline"
                        >
                          View Roster
                        </Button>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      {t.competition ? (
                        <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                          {t.competition.title}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">None</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <Badge tone={t.isActive ? 'green' : 'gray'}>
                        {t.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="xs"
                          variant="secondary"
                          icon={Users2}
                          onClick={() => setRosterTeam(t)}
                          title="Manage team roster"
                        >
                          Roster
                        </Button>
                        <Button
                          size="xs"
                          variant="secondary"
                          icon={Pencil}
                          onClick={() => setEditTeam(t)}
                          title="Edit team settings"
                        >
                          Edit
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          className="text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                          onClick={() => setDeleteTarget(t)}
                          title="Delete team"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>

          <Pagination
            page={data.page}
            pages={data.pages}
            onChange={(p) => setPage(p)}
          />
        </div>
      )}

      {/* Create Team Modal */}
      {createModalOpen && (
        <TeamFormModal
          competitions={competitions}
          students={students}
          onClose={() => setCreateModalOpen(false)}
          onSaved={(res) => {
            setCreateModalOpen(false);
            reload();
            if (res?.credentials?.length) {
              setCredentialsModal({ team: res.team, list: res.credentials });
            }
          }}
        />
      )}

      {/* Edit Team Modal */}
      {editTeam && (
        <TeamFormModal
          team={editTeam}
          competitions={competitions}
          students={students}
          onClose={() => setEditTeam(null)}
          onSaved={() => {
            setEditTeam(null);
            reload();
          }}
        />
      )}

      {/* Manage Roster Modal */}
      {rosterTeam && (
        <TeamRosterModal
          team={rosterTeam}
          students={students}
          onClose={() => setRosterTeam(null)}
          onRefresh={async () => {
            const fresh = await api.get(`/admin/teams/${rosterTeam.id}`);
            setRosterTeam(fresh.team);
            reload();
          }}
          onShowResetPassword={(creds) => setSingleReset(creds)}
          onShowNewCredentials={(creds) =>
            setCredentialsModal({ team: rosterTeam, list: creds })
          }
        />
      )}

      {/* Single Reset Password Modal */}
      {singleReset && (
        <SinglePasswordResetModal creds={singleReset} onClose={() => setSingleReset(null)} />
      )}

      {/* Multi-Credentials View Modal */}
      {credentialsModal && (
        <TeamCredentialsModal
          credentials={credentialsModal.list}
          teamInfo={credentialsModal.team}
          onClose={() => setCredentialsModal(null)}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <ConfirmModal
          open
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDeleteTeam}
          title={`Delete Team: ${deleteTarget.name}?`}
          loading={deleteBusy}
          confirmLabel="Delete Team"
        >
          Are you sure you want to delete this team? Leader and members will be disassociated from this team. Their existing attempt records will be kept.
        </ConfirmModal>
      )}
    </div>
  );
}
