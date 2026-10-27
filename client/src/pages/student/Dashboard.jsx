import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarClock, CheckCircle2, Clock, FileQuestion, Medal, PlayCircle, Radio, Trophy, Search,
  HelpCircle, ShieldCheck, Zap
} from 'lucide-react';
import { api } from '../../lib/api.js';
import { useFetch } from '../../lib/hooks.js';
import { fmtDateTime } from '../../lib/format.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, PhaseBadge, Skeleton, Input, cx } from '../../components/ui.jsx';
import { Countdown, useServerOffset } from '../../components/studentBits.jsx';

function cta(c) {
  if (c.phase === 'open') {
    if (c.activeAttemptId) return { label: 'Resume attempt', icon: PlayCircle, variant: 'primary' };
    if (c.canStart) return { label: 'Enter lobby', icon: PlayCircle, variant: 'primary' };
    return { label: 'View status', variant: 'secondary' };
  }
  if (c.phase === 'upcoming') return { label: 'View details', variant: 'secondary' };
  if (c.resultsReleased && c.hasSubmitted) return { label: 'View results', icon: Medal, variant: 'soft' };
  return { label: 'View details', variant: 'secondary' };
}

function CompetitionCard({ c, offset, onTick }) {
  const action = cta(c);
  const target = `/competitions/${c.id}${c.phase === 'closed' && c.resultsReleased && c.hasSubmitted ? '/result' : ''}`;

  return (
    <Card className="flex flex-col p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift">
      <div className="mb-3 flex items-start justify-between gap-3">
        <PhaseBadge phase={c.phase} />
        {c.hasSubmitted && (
          <Badge tone="green">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Submitted
          </Badge>
        )}
        {c.activeAttemptId && <Badge tone="amber">In progress</Badge>}
      </div>

      <h3 className="text-lg font-extrabold leading-snug text-slate-900 dark:text-white">{c.title}</h3>
      {c.description && <p className="mt-1.5 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{c.description}</p>}

      {/* Clean metric strip */}
      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        {[
          [c.durationMinutes, 'minutes'],
          [c.questionCount, 'questions'],
          [c.totalMarks, 'marks'],
        ].map(([v, l]) => (
          <div key={l} className="rounded-xl bg-slate-50 py-2.5 dark:bg-slate-800/80">
            <dd className="text-base font-extrabold text-slate-900 dark:text-white tabular-nums">{v}</dd>
            <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{l}</dt>
          </div>
        ))}
      </dl>

      <div className="mt-4 space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
        <p className="flex items-center gap-1.5">
          <CalendarClock className="h-3.5 w-3.5 text-slate-400 shrink-0" aria-hidden />
          <span>Opens {fmtDateTime(c.startTime)}</span>
        </p>
        <p className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" aria-hidden />
          <span>Closes {fmtDateTime(c.endTime)}</span>
        </p>
      </div>

      {c.phase === 'upcoming' && (
        <div className="mt-4 rounded-xl bg-sky-50 px-3.5 py-2 text-xs font-semibold text-sky-800 dark:bg-sky-950/60 dark:text-sky-300">
          Starts in <Countdown target={c.startTime} offset={offset} onDone={onTick} />
        </div>
      )}
      {c.phase === 'open' && (
        <div className="mt-4 rounded-xl bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 flex items-center justify-between">
          <span>Closes in</span>
          <span className="font-extrabold tabular-nums">
            <Countdown target={c.endTime} offset={offset} onDone={onTick} />
          </span>
        </div>
      )}

      <div className="mt-5 flex-1" />
      <div className="flex gap-2 pt-2">
        <Link to={target} className="flex-1">
          <Button variant={action.variant} icon={action.icon} className="w-full">
            {action.label}
          </Button>
        </Link>
      </div>
    </Card>
  );
}

export default function StudentDashboard() {
  const { user } = useAuth();
  const { data, error, loading, reload, refresh } = useFetch(() => api.get('/student/competitions'), [], { interval: 45000 });
  const offset = useServerOffset(data?.serverTime);
  const items = data?.items || [];

  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('all'); // 'all' | 'open' | 'upcoming' | 'closed'

  const live = useMemo(() => items.filter((c) => c.phase === 'open'), [items]);
  const upcoming = useMemo(() => items.filter((c) => c.phase === 'upcoming').sort((a, b) => new Date(a.startTime) - new Date(b.startTime)), [items]);
  const closed = useMemo(() => items.filter((c) => c.phase === 'closed'), [items]);

  const filtered = useMemo(() => {
    return items.filter((c) => {
      const matchTab = tab === 'all' || c.phase === tab;
      const matchSearch = !search.trim() || c.title.toLowerCase().includes(search.toLowerCase()) || (c.description && c.description.toLowerCase().includes(search.toLowerCase()));
      return matchTab && matchSearch;
    });
  }, [items, tab, search]);

  const firstName = user.name.split(' ')[0];

  return (
    <>
      <PageHeader
        title={`Hello, ${firstName}`}
        subtitle="Your assigned competitions and tournament schedule. All deadlines are calculated in server time."
      />

      {loading && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-72" />
          ))}
        </div>
      )}
      {error && <ErrorState error={error} onRetry={reload} />}

      {data && !items.length && (
        <EmptyState icon={FileQuestion} title="No competitions assigned yet">
          When your institution or tournament organiser registers you for a competition, it will appear here.
        </EmptyState>
      )}

      {data && items.length > 0 && (
        <div className="space-y-6">
          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            {[
              [Radio, 'Live now', live.length, 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-400'],
              [CalendarClock, 'Upcoming', upcoming.length, 'text-sky-600 bg-sky-50 dark:bg-sky-950/60 dark:text-sky-400'],
              [Trophy, 'Completed', closed.length, 'text-brand-600 bg-brand-50 dark:bg-brand-950/60 dark:text-brand-400'],
            ].map(([Icon, label, n, tone]) => (
              <Card key={label} className="flex items-center gap-3 p-4">
                <span className={`hidden rounded-xl p-2.5 sm:block ${tone}`}>
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <p className="text-2xl font-extrabold text-slate-900 dark:text-white tabular-nums">{n}</p>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</p>
                </div>
              </Card>
            ))}
          </div>

          {/* Search & Filter Controls */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* Filter Tabs */}
            <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
              {[
                ['all', `All (${items.length})`],
                ['open', `Live (${live.length})`],
                ['upcoming', `Upcoming (${upcoming.length})`],
                ['closed', `Closed (${closed.length})`],
              ].map(([tKey, label]) => (
                <button
                  key={tKey}
                  type="button"
                  onClick={() => setTab(tKey)}
                  className={cx(
                    'rounded-lg px-3 py-1.5 text-xs font-semibold transition',
                    tab === tKey
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative sm:w-72">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search competitions..."
                className="pl-10"
                aria-label="Search competitions"
              />
            </div>
          </div>

          {/* Competitions Grid */}
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-12 text-center text-slate-500 dark:border-slate-800 dark:text-slate-400">
              No competitions found matching your search or filter.
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((c) => (
                <CompetitionCard key={c.id} c={c} offset={offset} onTick={refresh} />
              ))}
            </div>
          )}

          {/* Rules & Integrity Info Banner */}
          <Card className="flex flex-col gap-4 border border-brand-100 bg-brand-50/40 p-5 dark:border-brand-900/40 dark:bg-brand-950/20 sm:flex-row sm:items-center">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-900/60 dark:text-brand-300">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div className="flex-1 text-xs text-slate-600 dark:text-slate-300 space-y-1">
              <p className="font-bold text-slate-900 dark:text-white">Fair Play &amp; Examination Integrity</p>
              <p>
                The server manages all attempt countdowns. If your internet connection drops, answers are saved locally and synchronized automatically once reconnected.
              </p>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
