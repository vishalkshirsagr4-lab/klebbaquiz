import { Link } from 'react-router-dom';
import { Users, Trophy, Activity, CheckCircle2, Plus, UserPlus, CalendarClock, Radio, ArrowRight, Shield } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useFetch } from '../../lib/hooks.js';
import { fmtDateTime, relativeFromNow } from '../../lib/format.js';
import { Button, Card, EmptyState, ErrorState, PageHeader, Skeleton, StatCard } from '../../components/ui.jsx';

const actionLabel = (a) => a.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

export default function Dashboard() {
  const { data, error, loading, reload } = useFetch(() => api.get('/admin/stats'), [], { interval: 30000 });

  return (
    <>
      <PageHeader
        title="Admin Dashboard"
        subtitle="Live telemetry and management of your quiz competitions and participants."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/admin/participants">
              <Button variant="secondary" icon={UserPlus}>Add participants</Button>
            </Link>
            <Link to="/admin/competitions/new">
              <Button icon={Plus}>New competition</Button>
            </Link>
          </div>
        }
      />

      {error && <ErrorState error={error} onRetry={reload} />}
      {loading && !data && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}
        </div>
      )}

      {data && (
        <div className="space-y-8 animate-fade-up">
          {/* Top 4 KPI Metrics */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Participants" value={data.participants.total} icon={Users} hint={`${data.participants.active} active accounts`} />
            <StatCard label="Live competitions" value={data.live.length} icon={Radio} tone="green" hint="open for submissions" />
            <StatCard label="In progress" value={data.attempts.inProgress} icon={Activity} tone="sky" hint="live exam sessions" />
            <StatCard label="Submitted today" value={data.attempts.submittedToday} icon={CheckCircle2} tone="amber" hint="completed attempts" />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Live & Upcoming Monitoring */}
            <Card className="p-5 lg:col-span-2">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
                  <Radio className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> Live competitions
                </h2>
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300">
                  {data.live.length} active
                </span>
              </div>

              {data.live.length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  No competition is currently open.
                </div>
              ) : (
                <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
                  {data.live.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 py-3.5">
                      <div className="min-w-0">
                        <p className="truncate font-bold text-slate-900 dark:text-white">{c.title}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Closes {relativeFromNow(c.endTime)} · {fmtDateTime(c.endTime)}
                        </p>
                      </div>
                      <Link to={`/admin/competitions/${c.id}`}>
                        <Button size="sm" variant="soft">Monitor Live</Button>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-8 flex items-center justify-between border-t border-slate-100 pt-6 dark:border-slate-800">
                <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
                  <CalendarClock className="h-4 w-4 text-sky-600 dark:text-sky-400" /> Upcoming tournaments
                </h2>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {data.upcoming.length} scheduled
                </span>
              </div>

              {data.upcoming.length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  No upcoming published competitions scheduled.
                </div>
              ) : (
                <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
                  {data.upcoming.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 py-3.5">
                      <div className="min-w-0">
                        <p className="truncate font-bold text-slate-900 dark:text-white">{c.title}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Starts {relativeFromNow(c.startTime)} · {fmtDateTime(c.startTime)}
                        </p>
                      </div>
                      <Link to={`/admin/competitions/${c.id}`}>
                        <Button size="sm" variant="secondary">Manage</Button>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* Status Breakdown & Security Activity */}
            <div className="space-y-6">
              <Card className="p-5">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">Competition inventory</h2>
                <dl className="mt-4 grid grid-cols-3 gap-2.5 text-center">
                  {[
                    ['Draft', data.competitions.draft],
                    ['Published', data.competitions.published],
                    ['Archived', data.competitions.archived],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                      <dd className="text-2xl font-extrabold text-slate-900 dark:text-white tabular-nums">{v}</dd>
                      <dt className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase">{k}</dt>
                    </div>
                  ))}
                </dl>
              </Card>

              <Card className="p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Shield className="h-4 w-4 text-brand-600" /> Recent audit activity
                  </h2>
                </div>
                {data.recentActivity.length === 0 ? (
                  <p className="mt-4 text-xs text-slate-500">No activity logged yet.</p>
                ) : (
                  <ul className="mt-4 space-y-3">
                    {data.recentActivity.slice(0, 5).map((l) => (
                      <li key={l.id} className="text-xs border-b border-slate-100 pb-2.5 last:border-0 dark:border-slate-800">
                        <p className="font-bold text-slate-800 dark:text-slate-200">{actionLabel(l.action)}</p>
                        <p className="text-slate-500 dark:text-slate-400">
                          {l.actorLabel || 'system'} · {relativeFromNow(l.createdAt)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
                <Link
                  to="/admin/audit"
                  className="mt-4 flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400"
                >
                  <span>View full audit security log</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Card>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
