import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, CircleSlash, Clock, ListChecks, Lock, Medal, Trophy, XCircle, Printer, Download, Award, Share2 } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useFetch } from '../../lib/hooks.js';
import { fmtDateTime, fmtDuration, num } from '../../lib/format.js';
import { Button, Card, ErrorState, Modal, PageLoader } from '../../components/ui.jsx';
import { BackLink, GateNotice, ScoreRing, scheduledFrom } from '../../components/studentBits.jsx';

function verdict(p) {
  if (p >= 90) return ['Outstanding Performance!', 'text-emerald-600 dark:text-emerald-400'];
  if (p >= 75) return ['Great Work!', 'text-emerald-600 dark:text-emerald-400'];
  if (p >= 50) return ['Good Effort!', 'text-brand-600 dark:text-brand-400'];
  return ['Keep Practising!', 'text-amber-600 dark:text-amber-400'];
}

export default function Result() {
  const { id } = useParams();
  const { data, error, loading, reload } = useFetch(() => api.get(`/student/competitions/${id}/result`), [id]);
  const [certOpen, setCertOpen] = useState(false);

  if (loading) return <PageLoader label="Loading your result..." />;
  if (error?.code === 'RESULTS_NOT_RELEASED') {
    const at = scheduledFrom(error);
    return (
      <>
        <BackLink to={`/competitions/${id}`}>Competition</BackLink>
        <GateNotice icon={Lock} title="Results are not published yet" action={<Link to="/"><Button variant="secondary">Back to dashboard</Button></Link>}>
          {at ? `They are scheduled to be released on ${fmtDateTime(at)}.` : 'The organiser will release them after the competition closes. Check back later.'}
        </GateNotice>
      </>
    );
  }
  if (error?.code === 'NO_ATTEMPT') {
    return (
      <>
        <BackLink to="/">Dashboard</BackLink>
        <GateNotice icon={CircleSlash} title="No submission found" action={<Link to="/"><Button variant="secondary">Back to dashboard</Button></Link>}>
          You did not submit an attempt for this competition, so there is no score to show.
        </GateNotice>
      </>
    );
  }
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const { competition: c, result: r, announcement: ann, myTeam } = data;
  const [label, tone] = verdict(r.percentage);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="mx-auto max-w-3xl animate-fade-up space-y-6">
      <BackLink to={`/competitions/${id}`}>{c.title}</BackLink>

      {/* Official Announcement Card */}
      {ann && (
        <div className="overflow-hidden rounded-2xl border-2 border-brand-500/30 bg-gradient-to-br from-brand-50/80 via-white to-violet-50/50 p-6 shadow-sm dark:border-brand-900 dark:from-slate-900 dark:via-slate-900 dark:to-brand-950/40">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="rounded bg-brand-100 px-2.5 py-0.5 text-xs font-extrabold uppercase tracking-wider text-brand-800 dark:bg-brand-950 dark:text-brand-300">
              {ann.category} Official Results
            </span>
            {ann.publishedAt && (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Released {fmtDateTime(ann.publishedAt)}
              </span>
            )}
          </div>
          <h2 className="mt-2 text-xl font-black text-slate-900 dark:text-white">
            {ann.title}
          </h2>
          {ann.message && (
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {ann.message}
            </p>
          )}

          {/* Winner Highlights if available */}
          {ann.highlights && ann.highlights.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                Championship Top Highlights
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {ann.highlights.slice(0, 3).map((h, i) => (
                  <div key={i} className="rounded-xl border border-slate-200/80 bg-white/70 p-2.5 text-xs dark:border-slate-800 dark:bg-slate-850">
                    <span className="font-bold text-brand-600 dark:text-brand-400">#{h.rank} {h.label}</span>
                    <p className="font-extrabold text-slate-900 dark:text-white truncate mt-0.5">{h.recipient}</p>
                    <p className="font-mono text-slate-500">{h.score} Pts</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Team Standing Banner if applicable */}
      {myTeam && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900/50 dark:bg-amber-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300 font-extrabold text-sm">
              #{myTeam.rank}
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                Squad Standing: {myTeam.teamName} ({myTeam.teamCode})
              </p>
              <p className="text-sm font-extrabold text-slate-900 dark:text-white">
                Team Official Score: {num(myTeam.score)} Pts {myTeam.isTie && '(Tied)'}
              </p>
            </div>
          </div>
          <p className="text-xs text-amber-900/70 dark:text-amber-300/70 sm:text-right">
            Total Squad Points: {num(myTeam.totalScore)} · {myTeam.membersCount} Members
          </p>
        </div>
      )}

      <Card className="overflow-hidden">
        {/* Hero Score Showcase */}
        <div className="grid items-center gap-8 bg-gradient-to-br from-brand-50 via-white to-violet-50 p-6 dark:from-slate-900 dark:via-slate-900 dark:to-brand-950/40 sm:grid-cols-[auto_1fr] sm:p-10">
          <div className="mx-auto">
            <ScoreRing percent={r.percentage}>
              <p className="text-4xl font-extrabold text-slate-900 dark:text-white tabular-nums">{num(r.score)}</p>
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">of {num(r.maxScore)}</p>
            </ScoreRing>
          </div>
          <div className="text-center sm:text-left">
            <p className={`text-sm font-bold uppercase tracking-wider ${tone}`}>{label}</p>
            <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl text-slate-900 dark:text-white">{r.percentage}% score</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {c.title}
              {r.attemptNumber > 1 ? ` · attempt #${r.attemptNumber}` : ''}
              {r.isCorrected && <span className="ml-2 font-bold text-purple-600">(Audited Adjusted)</span>}
            </p>
            {r.rank && (
              <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-amber-100 px-4 py-2 text-sm font-extrabold text-amber-900 dark:bg-amber-950/80 dark:text-amber-200">
                <Medal className="h-4 w-4" aria-hidden /> Rank #{r.rank} {r.isTie && '(Tied)'} of {r.totalParticipants}
              </p>
            )}
          </div>
        </div>

        {/* Breakdown Metric Grid */}
        <dl className="grid grid-cols-2 gap-px bg-slate-100 dark:bg-slate-800 sm:grid-cols-4">
          {[
            [CheckCircle2, 'Correct', r.correct, 'text-emerald-600 dark:text-emerald-400'],
            [XCircle, 'Wrong', r.wrong, 'text-rose-600 dark:text-rose-400'],
            [CircleSlash, 'Unanswered', r.unanswered, 'text-slate-500 dark:text-slate-400'],
            [Clock, 'Time taken', fmtDuration(r.timeTakenSeconds), 'text-brand-600 dark:text-brand-400'],
          ].map(([Icon, l, v, cls]) => (
            <div key={l} className="bg-white p-5 text-center dark:bg-slate-900">
              <Icon className={`mx-auto h-5 w-5 ${cls}`} aria-hidden />
              <dd className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-white tabular-nums">{v}</dd>
              <dt className="text-xs font-semibold text-slate-500 dark:text-slate-400">{l}</dt>
            </div>
          ))}
        </dl>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2.5 p-6 sm:flex-row sm:justify-center">
          {c.answersReleased ? (
            <Link to={`/competitions/${id}/review`} className="flex-1 sm:flex-none">
              <Button icon={ListChecks} className="w-full sm:w-auto">Review my answers</Button>
            </Link>
          ) : (
            <p className="flex items-center justify-center gap-2 rounded-xl bg-slate-50 px-4 py-2.5 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <Lock className="h-4 w-4" aria-hidden /> Answer key not released yet
            </p>
          )}
          {c.showLeaderboard && (
            <Link to={`/competitions/${id}/leaderboard`} className="flex-1 sm:flex-none">
              <Button variant="secondary" icon={Trophy} className="w-full sm:w-auto">View leaderboard</Button>
            </Link>
          )}
          <Button variant="secondary" icon={Award} onClick={() => setCertOpen(true)} className="flex-1 sm:flex-none">
            Score certificate
          </Button>
        </div>
      </Card>
      <p className="mt-4 text-center text-xs text-slate-400 dark:text-slate-500">Submitted {fmtDateTime(r.submittedAt)}</p>

      {/* Printable / Downloadable Certificate Modal */}
      <Modal open={certOpen} onClose={() => setCertOpen(false)} title="Certificate of Completion" size="md">
        <div id="print-certificate" className="rounded-2xl border-2 border-brand-200 bg-gradient-to-b from-brand-50/50 via-white to-brand-50/30 p-8 text-center dark:border-brand-900 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-violet-600 text-white shadow-lift">
            <Award className="h-8 w-8" />
          </div>
          <p className="text-xs font-bold uppercase tracking-widest text-brand-600 dark:text-brand-400">Certificate of Completion</p>
          <h2 className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-white">{c.title}</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">QuizMaster Online Examination Authority</p>

          <div className="my-6 grid grid-cols-3 gap-3 border-y border-slate-200 py-4 text-center dark:border-slate-800">
            <div>
              <p className="text-2xl font-extrabold text-slate-900 dark:text-white tabular-nums">{num(r.score)}</p>
              <p className="text-[11px] font-semibold text-slate-500">Score ({num(r.maxScore)} max)</p>
            </div>
            <div>
              <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">{r.percentage}%</p>
              <p className="text-[11px] font-semibold text-slate-500">Accuracy</p>
            </div>
            <div>
              <p className="text-2xl font-extrabold text-brand-600 dark:text-brand-400 tabular-nums">{r.rank ? `#${r.rank}` : '-'}</p>
              <p className="text-[11px] font-semibold text-slate-500">Global Rank</p>
            </div>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Completed on {fmtDateTime(r.submittedAt)} · Duration: {fmtDuration(r.timeTakenSeconds)}
          </p>

          <div className="mt-6 flex justify-center gap-2">
            <Button variant="primary" icon={Printer} onClick={handlePrint}>
              Print Certificate
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
