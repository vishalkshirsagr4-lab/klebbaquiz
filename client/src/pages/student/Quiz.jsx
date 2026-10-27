import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Cloud, CloudOff, Eraser, Flag, Grid3x3,
  Loader2, Send, Timer, Maximize2, Minimize2, Type, HelpCircle, Keyboard
} from 'lucide-react';
import { api } from '../../lib/api.js';
import { useFetch, useNow } from '../../lib/hooks.js';
import { clock } from '../../lib/format.js';
import { Alert, Button, ErrorState, Modal, PageLoader, ProgressBar, ThemeToggle, cx } from '../../components/ui.jsx';

const LETTERS = 'ABCDEF';

export default function Quiz() {
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useFetch(() => api.get(`/student/attempts/${attemptId}`), [attemptId]);

  useEffect(() => {
    if (data?.closed) navigate(`/competitions/${data.competitionId}/submitted?attempt=${attemptId}`, { replace: true });
  }, [data, attemptId, navigate]);

  if (loading) return <PageLoader label="Loading your quiz..." />;
  if (error)
    return (
      <div className="mx-auto max-w-lg p-6 pt-16">
        <ErrorState error={error} onRetry={reload} title="Could not load the quiz" />
      </div>
    );
  if (!data || data.closed) return <PageLoader label="Finishing up..." />;
  return <QuizRunner key={attemptId} payload={data} />;
}

/* ----------------------------------------------------------------------------------------- */

function QuizRunner({ payload }) {
  const { attempt, competition, questions } = payload;
  const navigate = useNavigate();

  /* ----- server-synced clock ----- */
  const [offset, setOffset] = useState(() => new Date(payload.serverTime).getTime() - Date.now());
  const now = useNow(1000, offset);
  const deadlineMs = new Date(attempt.deadline).getTime();
  const remaining = Math.max(0, (deadlineMs - now) / 1000);

  /* ----- fullscreen mode ----- */
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement));
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {}
  };

  /* ----- text size scaling ----- */
  const [textSize, setTextSize] = useState('base'); // 'sm' | 'base' | 'lg'
  const toggleTextSize = () => {
    setTextSize((prev) => (prev === 'sm' ? 'base' : prev === 'base' ? 'lg' : 'sm'));
  };

  /* ----- palette filter ----- */
  const [paletteFilter, setPaletteFilter] = useState('all'); // 'all' | 'answered' | 'unanswered' | 'flagged'

  /* ----- keyboard helper modal ----- */
  const [helpOpen, setHelpOpen] = useState(false);

  /* ----- answers, navigation, flags ----- */
  const [answers, setAnswers] = useState(payload.answers || {});
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const [idx, setIdx] = useState(0);
  const flagKey = `qm_flags_${attempt.id}`;
  const [flags, setFlags] = useState(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(flagKey) || '[]'));
    } catch {
      return new Set();
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(flagKey, JSON.stringify([...flags]));
    } catch {}
  }, [flags, flagKey]);

  /* ----- autosave queue ----- */
  const pending = useRef(new Map());
  const [saveState, setSaveState] = useState('saved'); // saved | saving | error
  const flushTimer = useRef(null);
  const retryTimer = useRef(null);
  const flushing = useRef(false);
  const finished = useRef(false);
  const flushRef = useRef(() => {});

  const goDone = useCallback(() => {
    finished.current = true;
    navigate(`/competitions/${competition.id}/submitted?attempt=${attempt.id}`, { replace: true });
  }, [navigate, competition.id, attempt.id]);

  flushRef.current = async () => {
    if (flushing.current || finished.current) return;
    flushing.current = true;
    let errored = false;
    setSaveState('saving');
    try {
      while (pending.current.size && !finished.current) {
        const [questionId, optionId] = pending.current.entries().next().value;
        const res = await api.put(`/student/attempts/${attempt.id}/answer`, { questionId, optionId });
        if (pending.current.get(questionId) === optionId) pending.current.delete(questionId);
        if (res.serverTime) setOffset(new Date(res.serverTime).getTime() - Date.now());
      }
      setSaveState('saved');
    } catch (err) {
      if (err.code === 'ATTEMPT_CLOSED') {
        goDone();
      } else {
        errored = true;
        setSaveState('error');
        clearTimeout(retryTimer.current);
        retryTimer.current = setTimeout(() => flushRef.current(), 4000);
      }
    } finally {
      flushing.current = false;
      if (!errored && pending.current.size && !finished.current) setTimeout(() => flushRef.current(), 50);
    }
  };

  const choose = useCallback((questionId, optionId) => {
    setAnswers((a) => {
      const next = { ...a };
      if (optionId === null) delete next[questionId];
      else next[questionId] = optionId;
      return next;
    });
    pending.current.set(questionId, optionId);
    setSaveState('saving');
    clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(() => flushRef.current(), 250);
  }, []);

  useEffect(() => {
    const online = () => flushRef.current();
    window.addEventListener('online', online);
    return () => {
      window.removeEventListener('online', online);
      clearTimeout(flushTimer.current);
      clearTimeout(retryTimer.current);
    };
  }, []);

  /* ----- submit ----- */
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const paletteOpenRef = useRef(false);
  paletteOpenRef.current = paletteOpen;
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [timeUp, setTimeUp] = useState(false);

  const submit = useCallback(async () => {
    if (finished.current) return;
    setSubmitting(true);
    setSubmitError('');
    clearTimeout(flushTimer.current);
    clearTimeout(retryTimer.current);
    const list = Object.entries(answersRef.current).map(([questionId, optionId]) => ({ questionId, optionId }));
    for (const [questionId, optionId] of pending.current) if (optionId === null) list.push({ questionId, optionId: null });
    try {
      await api.post(`/student/attempts/${attempt.id}/submit`, { answers: list });
      try {
        localStorage.removeItem(flagKey);
      } catch {}
      goDone();
    } catch (err) {
      if (err.code === 'ATTEMPT_CLOSED') return goDone();
      setSubmitError(err.message);
      setSubmitting(false);
    }
    return undefined;
  }, [attempt.id, flagKey, goDone]);

  const timeUpFired = useRef(false);
  useEffect(() => {
    if (remaining <= 0 && !timeUpFired.current) {
      timeUpFired.current = true;
      setTimeUp(true);
      setConfirmOpen(false);
      submit();
    }
  }, [remaining, submit]);

  useEffect(() => {
    if (!timeUp || !submitError) return undefined;
    const t = setTimeout(submit, 3000);
    return () => clearTimeout(t);
  }, [timeUp, submitError, submit]);

  useEffect(() => {
    const warn = (e) => {
      if (finished.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  /* ----- derived ----- */
  const total = questions.length;
  const q = questions[idx];
  const answeredCount = Object.keys(answers).length;
  const unanswered = total - answeredCount;
  const flaggedCount = [...flags].filter((id) => questions.some((x) => x.id === id)).length;

  const go = useCallback((i) => setIdx(Math.max(0, Math.min(total - 1, i))), [total]);
  const toggleFlag = useCallback(() => {
    setFlags((f) => {
      const n = new Set(f);
      if (n.has(q.id)) n.delete(q.id);
      else n.add(q.id);
      return n;
    });
  }, [q.id]);

  /* ----- keyboard navigation ----- */
  useEffect(() => {
    const onKey = (e) => {
      if (confirmOpen || paletteOpenRef.current || helpOpen || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (e.key === 'ArrowRight') go(idx + 1);
      else if (e.key === 'ArrowLeft') go(idx - 1);
      else if (e.key === 'f' || e.key === 'F') toggleFlag();
      else if (e.key === 'c' || e.key === 'C') choose(q.id, null);
      else if (/^[1-6]$/.test(e.key) && q.options[Number(e.key) - 1]) choose(q.id, q.options[Number(e.key) - 1].id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [idx, q, go, choose, toggleFlag, confirmOpen, helpOpen]);

  const urgent = remaining <= 60;
  const warning = remaining <= 300;

  const palette = (
    <div className="space-y-3">
      {/* Filter tabs */}
      <div className="flex items-center gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
        {[
          ['all', `All (${total})`],
          ['answered', `Done (${answeredCount})`],
          ['unanswered', `Left (${unanswered})`],
          ['flagged', `Flagged (${flaggedCount})`],
        ].map(([filterKey, label]) => (
          <button
            key={filterKey}
            type="button"
            onClick={() => setPaletteFilter(filterKey)}
            className={cx(
              'rounded-lg px-2.5 py-1 text-xs font-semibold whitespace-nowrap transition',
              paletteFilter === filterKey
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <Palette
        questions={questions}
        answers={answers}
        flags={flags}
        current={idx}
        filter={paletteFilter}
        onPick={(i) => {
          go(i);
          setPaletteOpen(false);
        }}
      />
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 pb-28 dark:bg-slate-950 lg:pb-12 transition-colors">
      {/* ------------- header ------------- */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <h1 className="truncate text-sm font-extrabold text-slate-900 dark:text-white sm:text-base">{competition.title}</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Question {idx + 1} of {total} · {answeredCount} answered
            </p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <SaveIndicator state={saveState} onRetry={() => flushRef.current()} />

            {/* Quick accessibility / tool toggles */}
            <div className="hidden items-center gap-1 sm:flex">
              <button
                type="button"
                onClick={toggleTextSize}
                title={`Text size: ${textSize.toUpperCase()} (Click to change)`}
                className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white/80 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                <Type className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={toggleFullscreen}
                title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Focus Mode'}
                className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white/80 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={() => setHelpOpen(true)}
                title="Keyboard shortcuts"
                className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white/80 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                <Keyboard className="h-4 w-4" />
              </button>
              <ThemeToggle />
            </div>

            {/* Timer pill */}
            <div
              className={cx(
                'flex items-center gap-2 rounded-xl px-3 py-2 text-base font-extrabold tabular-nums ring-1 ring-inset sm:text-lg',
                urgent
                  ? 'animate-pulse bg-rose-50 text-rose-700 ring-rose-300 dark:bg-rose-950/80 dark:text-rose-300 dark:ring-rose-700'
                  : warning
                  ? 'bg-amber-50 text-amber-800 ring-amber-300 dark:bg-amber-950/80 dark:text-amber-300 dark:ring-amber-700'
                  : 'bg-slate-900 text-white ring-slate-900 dark:bg-slate-800 dark:ring-slate-700'
              )}
              role="timer"
              aria-label={`Time remaining ${clock(remaining)}`}
            >
              <Timer className="h-4 w-4" aria-hidden />
              {clock(remaining)}
            </div>

            <Button className="hidden sm:inline-flex" icon={Send} onClick={() => setConfirmOpen(true)}>
              Submit
            </Button>
          </div>
        </div>
        <ProgressBar value={answeredCount} max={total} tone="green" label="Questions answered" />
      </header>

      <main className="mx-auto mt-6 grid max-w-6xl gap-6 px-4 sm:px-6 lg:grid-cols-[1fr_320px]">
        {/* ------------- Question Card ------------- */}
        <section className="card p-5 sm:p-8" aria-labelledby="q-heading">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
            <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700 dark:bg-brand-950/80 dark:text-brand-300">
              Question {idx + 1} of {total}
            </span>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {q.marks} {q.marks === 1 ? 'mark' : 'marks'}
              {competition.negativeMarking?.enabled ? ` · wrong answer -${Math.round(competition.negativeMarking.fraction * 100)}%` : ''}
            </span>
          </div>

          <h2
            id="q-heading"
            className={cx(
              'whitespace-pre-wrap font-bold leading-relaxed text-slate-900 dark:text-white',
              textSize === 'sm' ? 'text-base sm:text-lg' : textSize === 'lg' ? 'text-xl sm:text-2xl' : 'text-lg sm:text-xl'
            )}
          >
            {q.text}
          </h2>

          <div role="radiogroup" aria-labelledby="q-heading" className="mt-6 space-y-3">
            {q.options.map((o, i) => {
              const selected = answers[q.id] === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => choose(q.id, o.id)}
                  className={cx(
                    'group flex min-h-[52px] w-full items-start gap-4 rounded-2xl border-2 p-4 text-left transition active:scale-[0.99]',
                    selected
                      ? 'border-brand-600 bg-brand-50/90 shadow-sm dark:border-brand-500 dark:bg-brand-950/60'
                      : 'border-slate-200 bg-white hover:border-brand-300 hover:bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:bg-slate-800/60'
                  )}
                >
                  <span
                    className={cx(
                      'grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm font-extrabold transition',
                      selected
                        ? 'bg-brand-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 group-hover:bg-brand-100 dark:bg-slate-800 dark:text-slate-300 dark:group-hover:bg-slate-700'
                    )}
                  >
                    {LETTERS[i]}
                  </span>
                  <span
                    className={cx(
                      'whitespace-pre-wrap pt-1 font-medium',
                      textSize === 'sm' ? 'text-sm' : textSize === 'lg' ? 'text-base' : 'text-[15px]',
                      selected ? 'text-brand-950 dark:text-brand-100 font-semibold' : 'text-slate-800 dark:text-slate-200'
                    )}
                  >
                    {o.text}
                  </span>
                  {selected && <CheckCircle2 className="ml-auto mt-1 h-5 w-5 shrink-0 text-brand-600 dark:text-brand-400" aria-hidden />}
                </button>
              );
            })}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5 dark:border-slate-800">
            <div className="flex gap-2">
              <Button variant={flags.has(q.id) ? 'soft' : 'secondary'} size="sm" icon={Flag} onClick={toggleFlag} aria-pressed={flags.has(q.id)}>
                {flags.has(q.id) ? 'Flagged' : 'Flag for review'}
              </Button>
              <Button variant="ghost" size="sm" icon={Eraser} disabled={!answers[q.id]} onClick={() => choose(q.id, null)}>
                Clear choice
              </Button>
            </div>
            <p className="hidden text-xs text-slate-400 dark:text-slate-500 md:block">
              Keys: [1-{q.options.length}] Select · [← →] Navigate · [F] Flag · [C] Clear
            </p>
          </div>

          {/* Desktop Next/Prev */}
          <div className="mt-6 hidden items-center justify-between lg:flex">
            <Button variant="secondary" icon={ChevronLeft} disabled={idx === 0} onClick={() => go(idx - 1)}>
              Previous
            </Button>
            {idx < total - 1 ? (
              <Button onClick={() => go(idx + 1)}>
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button variant="success" icon={Send} onClick={() => setConfirmOpen(true)}>
                Finish &amp; submit
              </Button>
            )}
          </div>
        </section>

        {/* ------------- Desktop question navigator ------------- */}
        <aside className="hidden lg:block">
          <div className="card sticky top-28 p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">Question navigator</h2>
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                {answeredCount}/{total} done
              </span>
            </div>
            {palette}
            <Legend />
            <Button className="mt-5 w-full" icon={Send} onClick={() => setConfirmOpen(true)}>
              Submit quiz
            </Button>
          </div>
        </aside>
      </main>

      {/* ------------- Mobile / Tablet fixed bottom bar ------------- */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 lg:hidden" aria-label="Question navigation">
        <div className="mx-auto flex max-w-xl items-center gap-2">
          <Button variant="secondary" disabled={idx === 0} onClick={() => go(idx - 1)} aria-label="Previous question">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Button variant="secondary" className="flex-1" icon={Grid3x3} onClick={() => setPaletteOpen(true)}>
            {answeredCount}/{total}
          </Button>
          {idx < total - 1 ? (
            <Button className="flex-1" onClick={() => go(idx + 1)}>
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button variant="success" className="flex-1" icon={Send} onClick={() => setConfirmOpen(true)}>
              Submit
            </Button>
          )}
        </div>
      </nav>

      {/* Mobile Palette Modal */}
      <Modal open={paletteOpen} onClose={() => setPaletteOpen(false)} title="Question navigator" size="sm">
        {palette}
        <Legend />
        <Button className="mt-5 w-full" icon={Send} onClick={() => { setPaletteOpen(false); setConfirmOpen(true); }}>
          Submit quiz
        </Button>
      </Modal>

      {/* Keyboard Shortcuts Modal */}
      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title="Keyboard shortcuts" size="sm">
        <div className="space-y-3 text-sm">
          {[
            ['1, 2, 3, 4', 'Select option A, B, C, D directly'],
            ['Arrow Right (→)', 'Next question'],
            ['Arrow Left (←)', 'Previous question'],
            ['F key', 'Toggle Flag for review'],
            ['C key', 'Clear answer for current question'],
            ['Escape', 'Close open dialogs'],
          ].map(([k, desc]) => (
            <div key={k} className="flex items-center justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
              <span className="font-mono text-xs font-bold rounded-lg bg-slate-100 px-2 py-1 text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                {k}
              </span>
              <span className="text-slate-600 dark:text-slate-400 text-xs">{desc}</span>
            </div>
          ))}
        </div>
      </Modal>

      {/* Submit Confirmation Modal */}
      <Modal
        open={confirmOpen && !timeUp}
        onClose={() => !submitting && setConfirmOpen(false)}
        title="Submit your answers?"
        size="sm"
        footer={
          <>
            <Button variant="secondary" disabled={submitting} onClick={() => setConfirmOpen(false)}>
              Keep working
            </Button>
            <Button variant="success" icon={Send} loading={submitting} onClick={submit}>
              Submit now
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            ['Answered', answeredCount, 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'],
            ['Unanswered', unanswered, unanswered ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300' : 'bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400'],
            ['Flagged', flaggedCount, flaggedCount ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300' : 'bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400'],
          ].map(([l, n, tone]) => (
            <div key={l} className={cx('rounded-xl py-3', tone)}>
              <p className="text-2xl font-extrabold tabular-nums">{n}</p>
              <p className="text-xs font-semibold">{l}</p>
            </div>
          ))}
        </div>
        {unanswered > 0 && (
          <Alert tone="warning" className="mt-4">
            You still have {unanswered} unanswered question{unanswered > 1 ? 's' : ''}. They will score zero.
          </Alert>
        )}
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
          Once submitted, your attempt is final and cannot be modified.
        </p>
        {submitError && <Alert tone="error" className="mt-4" title="Could not submit">{submitError}</Alert>}
      </Modal>

      {/* Time Up Overlay */}
      {timeUp && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/80 p-6 backdrop-blur" role="alertdialog" aria-live="assertive" aria-label="Time is up">
          <div className="card max-w-sm p-8 text-center dark:bg-slate-900">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
              {submitError ? <AlertTriangle className="h-7 w-7" /> : <Loader2 className="h-7 w-7 animate-spin" />}
            </div>
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">Time is up</h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              {submitError ? 'Connection problem - retrying to submit your saved answers...' : 'Submitting your answers. Please do not close this page.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function SaveIndicator({ state, onRetry }) {
  if (state === 'error')
    return (
      <button onClick={onRetry} className="flex items-center gap-1.5 rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/80 dark:text-rose-300 dark:ring-rose-800" title="Your latest answers are kept on this page and will be re-sent. Click to retry now.">
        <CloudOff className="h-3.5 w-3.5" aria-hidden /> <span className="hidden sm:inline">Offline - retrying</span>
      </button>
    );
  return (
    <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400" role="status">
      {state === 'saving' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Cloud className="h-3.5 w-3.5 text-emerald-500" aria-hidden />}
      <span className="hidden sm:inline">{state === 'saving' ? 'Saving...' : 'Saved to server'}</span>
    </span>
  );
}

function Palette({ questions, answers, flags, current, filter = 'all', onPick }) {
  const visibleQuestions = questions.map((q, i) => ({ q, i })).filter(({ q }) => {
    if (filter === 'answered') return Boolean(answers[q.id]);
    if (filter === 'unanswered') return !answers[q.id];
    if (filter === 'flagged') return flags.has(q.id);
    return true;
  });

  if (visibleQuestions.length === 0) {
    return (
      <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
        No questions in this filter.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-5 gap-2 sm:grid-cols-6 lg:grid-cols-5" role="list">
      {visibleQuestions.map(({ q, i }) => {
        const answered = Boolean(answers[q.id]);
        const flagged = flags.has(q.id);
        return (
          <button
            key={q.id}
            role="listitem"
            onClick={() => onPick(i)}
            aria-label={`Question ${i + 1}${answered ? ', answered' : ', not answered'}${flagged ? ', flagged' : ''}`}
            aria-current={i === current ? 'true' : undefined}
            className={cx(
              'relative grid h-10 place-items-center rounded-xl text-sm font-bold transition active:scale-95',
              answered
                ? 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700',
              i === current && 'ring-2 ring-brand-600 ring-offset-2 dark:ring-brand-400 dark:ring-offset-slate-900'
            )}
          >
            {i + 1}
            {flagged && <Flag className="absolute -right-1 -top-1 h-3.5 w-3.5 fill-amber-400 text-amber-600" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}

function Legend() {
  return (
    <ul className="mt-4 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs text-slate-500 dark:text-slate-400">
      <li className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-emerald-500" /> Answered</li>
      <li className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-slate-200 dark:bg-slate-700" /> Not answered</li>
      <li className="flex items-center gap-2"><Flag className="h-3 w-3 fill-amber-400 text-amber-600" /> Flagged</li>
      <li className="flex items-center gap-2"><span className="h-3 w-3 rounded ring-2 ring-brand-600 dark:ring-brand-400" /> Current</li>
    </ul>
  );
}
