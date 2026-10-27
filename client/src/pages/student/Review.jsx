import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, CircleSlash, Lightbulb, Lock, XCircle } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useFetch } from '../../lib/hooks.js';
import { fmtDateTime, num } from '../../lib/format.js';
import { Badge, Button, Card, ErrorState, PageHeader, PageLoader, cx } from '../../components/ui.jsx';
import { BackLink, GateNotice, scheduledFrom } from '../../components/studentBits.jsx';

const LETTERS = 'ABCDEF';

function Question({ q, n }) {
  const status = q.selectedOptionId === null ? 'skipped' : q.isCorrect ? 'correct' : 'wrong';
  const head = {
    correct: <Badge tone="green"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Correct</Badge>,
    wrong: <Badge tone="red"><XCircle className="h-3.5 w-3.5" aria-hidden /> Incorrect</Badge>,
    skipped: <Badge tone="slate"><CircleSlash className="h-3.5 w-3.5" aria-hidden /> Not answered</Badge>,
  }[status];

  return (
    <Card className="p-5 sm:p-6 transition hover:shadow-soft">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-900 text-xs font-extrabold text-white dark:bg-slate-700">
            {n}
          </span>
          {head}
        </div>
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
          {q.awarded !== null ? (
            <span className={cx('font-extrabold tabular-nums', q.awarded > 0 ? 'text-emerald-600 dark:text-emerald-400' : q.awarded < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400')}>
              {q.awarded > 0 ? '+' : ''}{num(q.awarded)}
            </span>
          ) : null}
          {q.awarded !== null ? ' / ' : ''}
          {q.marks} {q.marks === 1 ? 'mark' : 'marks'}
        </span>
      </div>
      <h3 className="whitespace-pre-wrap text-base font-bold leading-relaxed text-slate-900 dark:text-white">{q.text}</h3>

      <ul className="mt-4 space-y-2">
        {q.options.map((o, i) => {
          const isCorrect = o.id === q.correctOptionId;
          const isMine = o.id === q.selectedOptionId;
          return (
            <li
              key={o.id}
              className={cx(
                'flex items-start gap-3 rounded-xl border-2 p-3 text-sm transition',
                isCorrect
                  ? 'border-emerald-500 bg-emerald-50/80 dark:bg-emerald-950/40 dark:border-emerald-500'
                  : isMine
                  ? 'border-rose-400 bg-rose-50/80 dark:bg-rose-950/40 dark:border-rose-500'
                  : 'border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900/60'
              )}
            >
              <span
                className={cx(
                  'grid h-6 w-6 shrink-0 place-items-center rounded-md text-xs font-extrabold',
                  isCorrect
                    ? 'bg-emerald-500 text-white'
                    : isMine
                    ? 'bg-rose-500 text-white'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                )}
              >
                {LETTERS[i]}
              </span>
              <span className="flex-1 whitespace-pre-wrap pt-0.5 font-medium text-slate-800 dark:text-slate-200">{o.text}</span>
              <span className="shrink-0 pt-0.5 text-xs font-bold">
                {isCorrect && <span className="text-emerald-700 dark:text-emerald-300">✓ Correct answer</span>}
                {isMine && !isCorrect && <span className="text-rose-700 dark:text-rose-300">✕ Your answer</span>}
                {isMine && isCorrect && <span className="ml-2 text-emerald-700 dark:text-emerald-300">· Your answer</span>}
              </span>
            </li>
          );
        })}
      </ul>

      {q.explanation && (
        <div className="mt-4 flex gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-950 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900/50">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          <div>
            <p className="font-bold">Explanation &amp; Solution</p>
            <p className="mt-0.5 whitespace-pre-wrap text-xs sm:text-sm">{q.explanation}</p>
          </div>
        </div>
      )}
    </Card>
  );
}

export default function Review() {
  const { id } = useParams();
  const { data, error, loading, reload } = useFetch(() => api.get(`/student/competitions/${id}/review`), [id]);
  const [filter, setFilter] = useState('all');

  const counts = useMemo(() => {
    const qs = data?.questions || [];
    return {
      all: qs.length,
      correct: qs.filter((q) => q.isCorrect).length,
      wrong: qs.filter((q) => q.selectedOptionId && !q.isCorrect).length,
      skipped: qs.filter((q) => !q.selectedOptionId).length,
    };
  }, [data]);

  if (loading) return <PageLoader label="Loading your answer review..." />;
  if (error?.code === 'ANSWERS_NOT_RELEASED' || error?.code === 'RESULTS_NOT_RELEASED') {
    const at = scheduledFrom(error);
    return (
      <>
        <BackLink to={`/competitions/${id}`}>Competition</BackLink>
        <GateNotice icon={Lock} title="The answer key is sealed" action={<Link to="/"><Button variant="secondary">Back to dashboard</Button></Link>}>
          {at ? `Correct answers and explanations will be released on ${fmtDateTime(at)}.` : 'Correct answers and explanations appear once the organiser releases them.'}
        </GateNotice>
      </>
    );
  }
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const shown = data.questions.map((q, i) => ({ q, n: i + 1 })).filter(({ q }) => filter === 'all' || (filter === 'correct' && q.isCorrect) || (filter === 'wrong' && q.selectedOptionId && !q.isCorrect) || (filter === 'skipped' && !q.selectedOptionId));
  const chips = [
    ['all', 'All Questions'],
    ['correct', 'Correct Only'],
    ['wrong', 'Incorrect Only'],
    ['skipped', 'Unanswered Only']
  ];

  return (
    <div className="mx-auto max-w-3xl animate-fade-up">
      <PageHeader
        back={<BackLink to={`/competitions/${id}`}>{data.competition.title}</BackLink>}
        title="Answer review"
        subtitle={data.score !== null ? `You scored ${num(data.score)} of ${num(data.maxScore)}` : 'Your selections compared with the official answer key'}
      />

      {/* Segmented Filter Control */}
      <div className="mb-6 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Filter questions">
        {chips.map(([k, l]) => (
          <button
            key={k}
            role="tab"
            aria-selected={filter === k}
            onClick={() => setFilter(k)}
            className={cx(
              'whitespace-nowrap rounded-xl px-3.5 py-2 text-xs font-bold transition shadow-sm',
              filter === k
                ? 'bg-brand-600 text-white'
                : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-700'
            )}
          >
            {l} <span className="opacity-75 font-mono">({counts[k]})</span>
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {shown.map(({ q, n }) => (
          <Question key={q.id} q={q} n={n} />
        ))}
        {!shown.length && (
          <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
            No questions in this filter.
          </div>
        )}
      </div>
    </div>
  );
}
