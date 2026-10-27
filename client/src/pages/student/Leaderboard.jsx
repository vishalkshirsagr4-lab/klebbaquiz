import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Crown, Lock, Search, Trophy, Download, Medal } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useFetch } from '../../lib/hooks.js';
import { downloadCsvText, fmtDateTime, fmtDuration, num } from '../../lib/format.js';
import { Badge, Button, Card, EmptyState, ErrorState, Input, PageHeader, PageLoader, cx } from '../../components/ui.jsx';
import { BackLink, GateNotice, scheduledFrom } from '../../components/studentBits.jsx';

const podiumStyle = [
  'from-amber-300 to-amber-500 text-amber-950 dark:from-amber-400 dark:to-amber-600', // 1st
  'from-slate-200 to-slate-400 text-slate-900 dark:from-slate-300 dark:to-slate-500', // 2nd
  'from-orange-300 to-orange-500 text-orange-950 dark:from-orange-400 dark:to-orange-600', // 3rd
];

function Podium({ top }) {
  // display order 2nd, 1st, 3rd
  const order = [top[1], top[0], top[2]].filter(Boolean);
  return (
    <div className="mb-8 grid grid-cols-3 items-end gap-2 sm:gap-4">
      {order.map((r) => {
        const i = r.rank - 1;
        return (
          <div
            key={r.rank}
            className={cx(
              'flex flex-col items-center rounded-2xl bg-gradient-to-b px-2 pb-4 pt-5 text-center shadow-soft transition',
              podiumStyle[i],
              i === 0 ? 'pb-8 pt-8 ring-2 ring-amber-400/50' : ''
            )}
          >
            {i === 0 && <Crown className="mb-1 h-6 w-6 text-amber-900" aria-hidden />}
            <span className="grid h-9 w-9 sm:h-10 sm:w-10 place-items-center rounded-full bg-white/70 text-base sm:text-lg font-extrabold shadow-sm">
              {r.rank}
            </span>
            <p className="mt-2 w-full truncate text-xs sm:text-base font-extrabold">{r.name}{r.isMe ? ' (You)' : ''}</p>
            <p className="text-lg font-extrabold sm:text-2xl tabular-nums">{num(r.score)}</p>
            <p className="text-[10px] sm:text-[11px] font-semibold opacity-90">{fmtDuration(r.timeTakenSeconds)}</p>
          </div>
        );
      })}
    </div>
  );
}

export default function Leaderboard() {
  const { id } = useParams();
  const { data, error, loading, reload } = useFetch(() => api.get(`/student/competitions/${id}/leaderboard`), [id]);
  const [q, setQ] = useState('');
  const items = data?.items || [];
  const me = items.find((r) => r.isMe);
  const filtered = useMemo(() => items.filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase())), [items, q]);

  const exportCsv = () => {
    if (!items.length) return;
    const rows = [
      ['Rank', 'Participant', 'Score', 'Max Score', 'Time Taken (s)', 'Time Formatted'],
      ...items.map((r) => [r.rank, r.name, r.score, r.maxScore, r.timeTakenSeconds, fmtDuration(r.timeTakenSeconds)]),
    ];
    downloadCsvText(rows, `leaderboard-${data?.competition?.title || id}.csv`);
  };

  if (loading) return <PageLoader label="Loading leaderboard..." />;
  if (error?.code === 'RESULTS_NOT_RELEASED' || error?.code === 'LEADERBOARD_OFF') {
    const off = error.code === 'LEADERBOARD_OFF';
    const at = scheduledFrom(error);
    return (
      <>
        <BackLink to={`/competitions/${id}`}>Competition</BackLink>
        <GateNotice icon={Lock} title={off ? 'Leaderboard is disabled' : 'Leaderboard not published yet'} action={<Link to="/"><Button variant="secondary">Back to dashboard</Button></Link>}>
          {off ? 'The organiser has chosen not to show a public ranking for this competition.' : at ? `Rankings will appear on ${fmtDateTime(at)}.` : 'Rankings appear when the organiser publishes the results.'}
        </GateNotice>
      </>
    );
  }
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div className="mx-auto max-w-3xl animate-fade-up">
      <PageHeader
        back={<BackLink to={`/competitions/${id}`}>{data.competition.title}</BackLink>}
        title="Leaderboard"
        subtitle={`${items.length} participant${items.length === 1 ? '' : 's'} · ranked by score, then fastest time`}
        actions={
          items.length > 0 && (
            <Button variant="secondary" size="sm" icon={Download} onClick={exportCsv}>
              Export CSV
            </Button>
          )
        }
      />

      {!items.length ? (
        <EmptyState icon={Trophy} title="No submissions yet">
          Rankings will appear here once participants have submitted their attempts.
        </EmptyState>
      ) : (
        <>
          {me && (
            <Card className="mb-6 flex items-center justify-between gap-4 bg-gradient-to-r from-brand-600 to-violet-600 p-5 text-white ring-0 shadow-lift">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-brand-100">Your Standing</p>
                <p className="text-3xl font-extrabold flex items-center gap-2">
                  <Medal className="h-6 w-6 text-amber-300" /> #{me.rank}
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-extrabold tabular-nums">
                  {num(me.score)} <span className="text-base font-semibold text-brand-100">/ {num(me.maxScore)}</span>
                </p>
                <p className="text-xs text-brand-100">{fmtDuration(me.timeTakenSeconds)}</p>
              </div>
            </Card>
          )}

          {items.length >= 3 && <Podium top={items.slice(0, 3)} />}

          <div className="relative mb-4">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by participant name..."
              className="pl-10"
              aria-label="Search leaderboard"
            />
          </div>

          <Card className="overflow-hidden">
            <ol className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((r) => (
                <li
                  key={r.rank}
                  className={cx(
                    'flex items-center gap-3 px-4 py-3.5 sm:gap-4 sm:px-5 transition',
                    r.isMe ? 'bg-brand-50/80 dark:bg-brand-950/40 font-semibold' : 'hover:bg-slate-50/50 dark:hover:bg-slate-800/40'
                  )}
                >
                  <span
                    className={cx(
                      'grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-extrabold tabular-nums',
                      r.rank === 1
                        ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 ring-1 ring-amber-300'
                        : r.rank === 2
                        ? 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
                        : r.rank === 3
                        ? 'bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-300'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-400'
                    )}
                  >
                    {r.rank}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <span>{r.name}</span>
                      {r.isMe && <Badge tone="brand">You</Badge>}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{fmtDuration(r.timeTakenSeconds)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-extrabold text-slate-900 dark:text-white tabular-nums">{num(r.score)}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {r.maxScore ? Math.round((r.score / r.maxScore) * 100) : 0}%
                    </p>
                  </div>
                </li>
              ))}
              {!filtered.length && <li className="px-5 py-10 text-center text-sm text-slate-500 dark:text-slate-400">No participants match "{q}".</li>}
            </ol>
          </Card>
        </>
      )}
    </div>
  );
}
