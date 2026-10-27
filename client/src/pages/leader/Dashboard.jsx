import { Link } from 'react-router-dom';
import {
  Crown,
  Users2,
  Trophy,
  Timer,
  ShieldAlert,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Calendar,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useFetch } from '../../lib/hooks.js';
import { api } from '../../lib/api.js';
import { fmtDateTime, fmtDuration } from '../../lib/format.js';
import {
  Alert,
  Badge,
  Button,
  Card,
  CopyButton,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
} from '../../components/ui.jsx';

export default function LeaderDashboard() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useFetch(() => api.get('/leader/team'));
  const { data: resultsData } = useFetch(() => api.get('/leader/team/results').catch(() => null));

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-1/3" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error.message} onRetry={reload} />;
  }

  const team = data?.team;

  if (!team) {
    return (
      <EmptyState
        icon={Users2}
        title="No Team Assigned Yet"
        description="Your account is not currently assigned as leader to an active team. Please reach out to the KLE BBA Event organizers."
        action={
          <Link to="/">
            <Button>Go to Individual Competitions</Button>
          </Link>
        }
      />
    );
  }

  const comp = team.competition;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Page Header */}
      <PageHeader
        title={`Team Console: ${team.name}`}
        subtitle="Manage your squad and access cluster event competitions."
        actions={
          <div className="flex items-center gap-2">
            <Link to="/">
              <Button variant="secondary" icon={ArrowRight}>
                Student Quizzes View
              </Button>
            </Link>
          </div>
        }
      />

      {/* Hero Overview Card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-900 via-brand-800 to-indigo-950 p-6 sm:p-8 text-white shadow-xl">
        <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-brand-500/20 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold backdrop-blur-sm">
              <Crown className="h-3.5 w-3.5 text-amber-400" />
              <span>Team Leader: {user.name}</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
              {team.name}
            </h2>
            <div className="flex flex-wrap items-center gap-3 text-sm text-brand-200">
              <span>Team Code:</span>
              <span className="font-mono font-bold bg-white/20 px-2.5 py-0.5 rounded-lg text-white">
                {team.code}
              </span>
              <CopyButton text={team.code} className="!text-white hover:!bg-white/20" />
              <span>·</span>
              <span>{team.roster?.length || 0} / {team.maxMembers} Members</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            {comp && (
              <Link to={`/competitions/${comp.id}`}>
                <Button size="lg" className="w-full sm:w-auto bg-white !text-brand-900 hover:bg-brand-50 font-bold shadow-lg">
                  Enter Competition Lobby
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Official Team Results & Announcement (When Released) */}
      {resultsData?.teamResult && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-500" />
              Official Team Results &amp; Standings
            </h3>
            {resultsData.announcement && (
              <Badge tone="purple">
                {resultsData.announcement.category?.toUpperCase()} RESULTS
              </Badge>
            )}
          </div>

          <div className="overflow-hidden rounded-2xl border-2 border-amber-400/40 bg-gradient-to-br from-amber-50/80 via-white to-amber-50/30 p-6 shadow-sm dark:border-amber-800 dark:from-slate-900 dark:via-slate-900 dark:to-amber-950/30">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-amber-500 text-white font-black text-2xl shadow-md">
                  #{resultsData.teamResult.rank}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-2xl font-black text-slate-900 dark:text-white">
                      {resultsData.teamResult.teamName}
                    </h4>
                    {resultsData.teamResult.isTie && (
                      <span className="rounded bg-amber-200 px-2 py-0.5 text-xs font-black text-amber-900 dark:bg-amber-900 dark:text-amber-200">
                        TIED RANK
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-amber-900/80 dark:text-amber-300/80">
                    Team Code: <span className="font-mono font-bold">{resultsData.teamResult.teamCode}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-6 border-t md:border-t-0 pt-4 md:pt-0">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Official Team Score</p>
                  <p className="text-3xl font-black text-brand-600 dark:text-brand-400 tabular-nums">
                    {resultsData.teamResult.score} <span className="text-sm font-semibold text-slate-400">Pts</span>
                  </p>
                </div>
                <div className="border-l border-slate-200 dark:border-slate-800 pl-6">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Squad Cumulative</p>
                  <p className="text-xl font-bold text-slate-700 dark:text-slate-200 tabular-nums">
                    {resultsData.teamResult.totalScore} <span className="text-xs font-normal text-slate-400">Pts</span>
                  </p>
                </div>
              </div>
            </div>

            {resultsData.announcement && (
              <div className="mt-5 rounded-xl border border-amber-200/80 bg-white/80 p-4 dark:border-amber-900/40 dark:bg-slate-850">
                <p className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                  {resultsData.announcement.title}
                </p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  {resultsData.announcement.message}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Assigned Competition Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            Assigned Event Competition
          </h3>
        </div>

        {comp ? (
          <Card className="p-6 border-l-4 border-l-brand-600 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="text-xl font-bold text-slate-900 dark:text-white">{comp.title}</h4>
                  <Badge
                    tone={
                      comp.phase === 'open'
                        ? 'green'
                        : comp.phase === 'upcoming'
                        ? 'amber'
                        : 'gray'
                    }
                  >
                    {comp.phase === 'open'
                      ? 'Live Now'
                      : comp.phase === 'upcoming'
                      ? 'Upcoming'
                      : 'Closed'}
                  </Badge>
                </div>
                {comp.description && (
                  <p className="text-sm text-slate-600 dark:text-slate-300 max-w-2xl">
                    {comp.description}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Link to={`/competitions/${comp.id}`}>
                  <Button
                    variant={comp.phase === 'open' ? 'primary' : 'secondary'}
                    icon={ArrowRight}
                  >
                    {comp.phase === 'open' ? 'Start Attempt' : 'View Details'}
                  </Button>
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs">
              <div>
                <span className="text-slate-400 font-semibold uppercase">Schedule</span>
                <p className="font-medium text-slate-800 dark:text-slate-200 mt-0.5">
                  {fmtDateTime(comp.startTime)}
                </p>
              </div>
              <div>
                <span className="text-slate-400 font-semibold uppercase">Duration</span>
                <p className="font-medium text-slate-800 dark:text-slate-200 mt-0.5">
                  {fmtDuration(comp.durationMinutes)}
                </p>
              </div>
              <div>
                <span className="text-slate-400 font-semibold uppercase">Total Marks</span>
                <p className="font-medium text-slate-800 dark:text-slate-200 mt-0.5">
                  {comp.totalMarks} Marks ({comp.questionCount} Questions)
                </p>
              </div>
              <div>
                <span className="text-slate-400 font-semibold uppercase">Action</span>
                <p className="font-medium text-brand-600 dark:text-brand-400 mt-0.5">
                  <Link to={`/competitions/${comp.id}/leaderboard`} className="hover:underline">
                    Live Leaderboard &rarr;
                  </Link>
                </p>
              </div>
            </div>
          </Card>
        ) : (
          <Card className="p-6 text-center text-slate-500">
            No specific competition has been bound to your team yet. Your team members can still participate in open public quizzes.
          </Card>
        )}
      </div>

      {/* Team Roster Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Users2 className="h-5 w-5 text-brand-600 dark:text-brand-400" />
              Team Roster ({team.roster?.length || 0} Members)
            </h3>
            <p className="text-xs text-slate-500">
              Only authorized administrators can reset member passwords or alter team memberships.
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-left font-semibold text-slate-700 dark:text-slate-300">
                <tr>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Participant Name</th>
                  <th className="py-3 px-4">Participant ID</th>
                  <th className="py-3 px-4">Class / Department</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Last Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(team.roster || []).map((m) => (
                  <tr
                    key={m.id}
                    className={
                      m.role === 'leader'
                        ? 'bg-amber-50/30 dark:bg-amber-950/20'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }
                  >
                    <td className="py-3 px-4 font-semibold">
                      <span className="inline-flex items-center gap-1.5">
                        {m.role === 'leader' ? (
                          <Crown className="h-4 w-4 text-amber-500" />
                        ) : (
                          <span className="h-2 w-2 rounded-full bg-slate-400" />
                        )}
                        <span className={m.role === 'leader' ? 'text-amber-700 dark:text-amber-400 font-bold' : 'text-slate-600 dark:text-slate-400'}>
                          {m.roleLabel}
                        </span>
                      </span>
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">
                      {m.name} {m.id === user.id && <span className="text-xs text-brand-600 font-normal">(You)</span>}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-700 dark:text-slate-300">
                      {m.participantId} <CopyButton text={m.participantId} />
                    </td>
                    <td className="py-3 px-4 text-slate-500 dark:text-slate-400">
                      {m.organization || '—'}
                    </td>
                    <td className="py-3 px-4">
                      <Badge tone={m.isActive ? 'green' : 'gray'}>
                        {m.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-500">
                      {m.lastLoginAt ? fmtDateTime(m.lastLoginAt) : 'Never signed in'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Competition Rules & Tips Card */}
      <Card className="p-6 bg-slate-50 dark:bg-slate-800/40 space-y-4">
        <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <HelpCircle className="h-5 w-5 text-brand-600 dark:text-brand-400" />
          Competition Guidelines for Team Leaders
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-slate-600 dark:text-slate-300">
          <div className="rounded-xl bg-white dark:bg-slate-900 p-4 border border-slate-200 dark:border-slate-800 space-y-1">
            <p className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Server-timed Quizzes
            </p>
            <p className="text-xs text-slate-500">
              The quiz timer runs strictly on the server. If your browser closes or connection drops, re-enter immediately to resume.
            </p>
          </div>
          <div className="rounded-xl bg-white dark:bg-slate-900 p-4 border border-slate-200 dark:border-slate-800 space-y-1">
            <p className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Independent Scoring
            </p>
            <p className="text-xs text-slate-500">
              Each member uses their own secure login ID. Your team rankings and scores are updated dynamically.
            </p>
          </div>
          <div className="rounded-xl bg-white dark:bg-slate-900 p-4 border border-slate-200 dark:border-slate-800 space-y-1">
            <p className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Password Security
            </p>
            <p className="text-xs text-slate-500">
              If any member forgets their password or has login issues, contact the admin to receive a single-use temporary password.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
