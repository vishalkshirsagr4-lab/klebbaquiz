import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Award,
  Trophy,
  Users2,
  Users,
  BarChart3,
  Download,
  Printer,
  Sparkles,
  RefreshCw,
  Send,
  EyeOff,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Pencil,
  AlertTriangle,
  History,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
} from 'lucide-react';
import { api, downloadFile, qs } from '../../lib/api.js';
import { useFetch } from '../../lib/hooks.js';
import { useToast } from '../../context/ToastContext.jsx';
import { fmtDateTime, fmtDuration, num } from '../../lib/format.js';
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmModal,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  PageHeader,
  PageLoader,
  Select,
  StatCard,
  TableWrap,
  Tabs,
  Textarea,
  Skeleton,
  cx,
} from '../../components/ui.jsx';

export default function AdminResults() {
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();

  const selectedCompId = searchParams.get('competitionId') || '';

  // 1. Fetch competitions list
  const {
    data: compsData,
    loading: compsLoading,
    error: compsError,
    reload: reloadComps,
  } = useFetch(() => api.get('/admin/results'));

  const competitions = compsData?.items || [];
  const activeCompId = selectedCompId || competitions[0]?.id || '';

  // 2. Fetch results preview for active competition
  const {
    data: previewData,
    loading: previewLoading,
    error: previewError,
    reload: reloadPreview,
  } = useFetch(
    () => (activeCompId ? api.get(`/admin/results/${activeCompId}/preview`) : Promise.resolve(null)),
    [activeCompId]
  );

  const [activeTab, setActiveTab] = useState('individuals');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTieOnly, setFilterTieOnly] = useState(false);
  const [expandedTeamId, setExpandedTeamId] = useState(null);

  // Modals state
  const [composerOpen, setComposerOpen] = useState(false);
  const [confirmPublishOpen, setConfirmPublishOpen] = useState(false);
  const [retractOpen, setRetractOpen] = useState(false);
  const [retractReason, setRetractReason] = useState('');
  const [correctionTarget, setCorrectionTarget] = useState(null);
  const [printSheetOpen, setPrintSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Composer Form
  const [composerForm, setComposerForm] = useState({
    title: '',
    message: '',
    category: 'final',
    visibility: 'all',
    highlights: [],
  });

  const comp = previewData?.competition;
  const ann = previewData?.announcement;
  const summary = previewData?.summary;
  const individuals = previewData?.individuals || [];
  const teams = previewData?.teams || [];
  const corrections = previewData?.corrections || [];

  function handleSelectComp(id) {
    setSearchParams(id ? { competitionId: id } : {});
  }

  // Open Announcement Composer with sensible pre-fills
  function openComposer() {
    const defaultTitle = ann?.title || (comp ? `${comp.title} — Official Final Results` : 'Official Competition Results');
    const defaultMsg = ann?.message || 'Congratulations to all participant teams and award winners on their stellar performance!';
    const defaultCategory = ann?.status === 'published' ? 'revised' : ann?.category || 'final';

    // Auto generate top 3 highlights if empty
    let autoHighlights = ann?.highlights && ann.highlights.length > 0 ? ann.highlights : [];
    if (autoHighlights.length === 0 && (teams.length > 0 || individuals.length > 0)) {
      if (teams.length > 0) {
        teams.slice(0, 3).forEach((t, i) => {
          autoHighlights.push({
            rank: i + 1,
            label: i === 0 ? '1st Place Champion' : i === 1 ? '1st Runner Up' : '2nd Runner Up',
            recipient: t.teamName,
            participantId: t.teamCode,
            score: t.score,
            note: `${t.membersCount} members · Best time ${fmtDuration(t.timeTakenSeconds)}`,
          });
        });
      } else {
        individuals.slice(0, 3).forEach((ind, i) => {
          autoHighlights.push({
            rank: i + 1,
            label: i === 0 ? '1st Place Winner' : i === 1 ? '2nd Place' : '3rd Place',
            recipient: ind.name,
            participantId: ind.participantId,
            score: ind.score,
            note: `Time: ${fmtDuration(ind.timeTakenSeconds)}`,
          });
        });
      }
    }

    setComposerForm({
      title: defaultTitle,
      message: defaultMsg,
      category: defaultCategory,
      visibility: ann?.visibility || 'all',
      highlights: autoHighlights,
    });
    setComposerOpen(true);
  }

  // Save announcement draft
  async function saveDraft() {
    if (!activeCompId) return;
    setBusy(true);
    try {
      await api.post(`/admin/results/${activeCompId}/draft`, composerForm);
      toast.success('Announcement draft saved');
      setComposerOpen(false);
      reloadPreview();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Publish official results
  async function publishOfficialResults() {
    if (!activeCompId) return;
    setBusy(true);
    try {
      await api.post(`/admin/results/${activeCompId}/publish`, composerForm);
      toast.success('Official results successfully published to participants!');
      setConfirmPublishOpen(false);
      setComposerOpen(false);
      reloadPreview();
      reloadComps();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Retract published results
  async function handleRetract() {
    if (!activeCompId || !retractReason.trim()) return;
    setBusy(true);
    try {
      await api.post(`/admin/results/${activeCompId}/retract`, { reason: retractReason });
      toast.success('Results retracted and hidden from students.');
      setRetractOpen(false);
      setRetractReason('');
      reloadPreview();
      reloadComps();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Audited score correction
  async function handleScoreCorrection(e) {
    e.preventDefault();
    if (!correctionTarget) return;
    const { attemptId, newScore, reason } = correctionTarget;
    setBusy(true);
    try {
      await api.post(`/admin/results/${activeCompId}/corrections`, {
        attemptId,
        correctedScore: Number(newScore),
        reason,
      });
      toast.success('Score updated and audit log entry created.');
      setCorrectionTarget(null);
      reloadPreview();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Recalculate scores
  async function handleRecalculate() {
    setBusy(true);
    try {
      const res = await api.post(`/admin/competitions/${activeCompId}/recalculate`);
      toast.success(`${res.regraded} attempts recalculated authoritatively.`);
      reloadPreview();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Export CSV
  async function exportCsv() {
    try {
      await downloadFile(`/admin/results/${activeCompId}/export.csv`, `official-results-${activeCompId}.csv`);
    } catch (err) {
      toast.error(err.message);
    }
  }

  // Filtered individuals
  const filteredIndividuals = useMemo(() => {
    return individuals.filter((r) => {
      const matchQ =
        !searchQuery ||
        r.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.participantId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.organization?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchTie = !filterTieOnly || r.isTie;
      return matchQ && matchTie;
    });
  }, [individuals, searchQuery, filterTieOnly]);

  // Filtered teams
  const filteredTeams = useMemo(() => {
    return teams.filter((t) => {
      const matchQ =
        !searchQuery ||
        t.teamName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.teamCode?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.leaderName?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchTie = !filterTieOnly || t.isTie;
      return matchQ && matchTie;
    });
  }, [teams, searchQuery, filterTieOnly]);

  if (compsLoading && !compsData) return <PageLoader label="Loading competitions..." />;
  if (compsError) return <ErrorState error={compsError} onRetry={reloadComps} />;

  return (
    <div className="space-y-6 animate-fade-in pb-16">
      <PageHeader
        title="Official Results & Announcements"
        subtitle="Review, audit, tie-break, and publish official results to teams and students."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" icon={RefreshCw} onClick={reloadPreview} title="Refresh results">
              Refresh
            </Button>
            {activeCompId && (
              <>
                <Button variant="secondary" icon={Download} onClick={exportCsv} title="Download CSV report">
                  Export CSV
                </Button>
                <Button variant="secondary" icon={Printer} onClick={() => setPrintSheetOpen(true)} title="Print result sheet">
                  Print Sheet
                </Button>
                <Button
                  variant="primary"
                  icon={Send}
                  onClick={openComposer}
                  className={ann?.status === 'published' ? '!bg-amber-600 hover:!bg-amber-700' : ''}
                >
                  {ann?.status === 'published' ? 'Revise Announcement' : 'Publish Results'}
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Competition Selector Ribbon */}
      <Card className="p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex-1 max-w-xl">
            <label htmlFor="comp-select" className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              Select Competition
            </label>
            <Select
              id="comp-select"
              value={activeCompId}
              onChange={(e) => handleSelectComp(e.target.value)}
              className="font-semibold text-slate-900 dark:text-white"
            >
              {competitions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} ({c.submissionStats.submitted} submitted · {c.status})
                </option>
              ))}
            </Select>
          </div>

          {ann && (
            <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/80 p-3 rounded-2xl border border-slate-200 dark:border-slate-700">
              <div>
                <p className="text-xs font-semibold text-slate-500">Announcement Status</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge
                    tone={
                      ann.status === 'published'
                        ? 'green'
                        : ann.status === 'retracted'
                        ? 'red'
                        : 'amber'
                    }
                  >
                    {ann.status === 'published'
                      ? `Official Published (${ann.category.toUpperCase()})`
                      : ann.status === 'retracted'
                      ? 'Retracted'
                      : 'Draft Preview'}
                  </Badge>
                  {ann.revision > 1 && (
                    <span className="text-xs font-bold text-slate-400">Rev #{ann.revision}</span>
                  )}
                </div>
              </div>

              {ann.status === 'published' && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={EyeOff}
                  onClick={() => setRetractOpen(true)}
                  className="text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                  title="Retract official results"
                >
                  Retract
                </Button>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Metrics Banner */}
      {previewLoading && !previewData ? (
        <Skeleton className="h-28" />
      ) : previewError ? (
        <ErrorState error={previewError} onRetry={reloadPreview} />
      ) : summary ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard
            label="Participants"
            value={`${summary.participants} / ${summary.eligible}`}
            hint={`${summary.absent} absent`}
            icon={Users}
          />
          <StatCard
            label="Average Score"
            value={num(summary.average)}
            hint={`of ${num(summary.maxScore)} max`}
            tone="sky"
            icon={BarChart3}
          />
          <StatCard
            label="Highest Score"
            value={num(summary.highest)}
            tone="green"
            icon={Trophy}
          />
          <StatCard
            label="Lowest Score"
            value={num(summary.lowest)}
            tone="amber"
            icon={BarChart3}
          />
          <StatCard
            label="Tied Ranks"
            value={summary.tieCount}
            hint={summary.tieCount > 0 ? 'Tie broken by time' : 'No ties'}
            tone={summary.tieCount > 0 ? 'amber' : 'slate'}
            icon={Sparkles}
          />
          <StatCard
            label="Audited Corrections"
            value={summary.correctedCount}
            hint="Original score kept"
            tone={summary.correctedCount > 0 ? 'purple' : 'slate'}
            icon={ShieldCheck}
          />
        </div>
      ) : null}

      {/* Published Announcement Callout Banner */}
      {ann?.status === 'published' && (
        <div className="rounded-2xl border-2 border-emerald-500/30 bg-gradient-to-r from-emerald-50/70 via-emerald-50/40 to-white p-5 dark:from-emerald-950/30 dark:via-slate-900 dark:to-slate-900">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
                  {ann.title}
                </h3>
                <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  {ann.category}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 max-w-3xl">
                {ann.message || 'Official results released.'}
              </p>
              <p className="mt-2 text-[11px] text-slate-400">
                Published on {fmtDateTime(ann.publishedAt)} by {ann.publishedBy?.name || 'Administrator'} · Revision #{ann.revision}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" icon={Printer} onClick={() => setPrintSheetOpen(true)}>
                Print Sheet
              </Button>
              <Button size="sm" variant="soft" icon={Pencil} onClick={openComposer}>
                Edit Announcement
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by participant name, ID, or team..."
              className="pl-9 text-sm"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={filterTieOnly}
              onChange={(e) => setFilterTieOnly(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            Show tied ranks only ({summary?.tieCount || 0})
          </label>

          <Button variant="ghost" size="sm" icon={RefreshCw} onClick={handleRecalculate}>
            Recalculate Scores
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        tabs={[
          { id: 'individuals', label: `Individual Rankings (${filteredIndividuals.length})`, icon: Users },
          { id: 'teams', label: `Team Rankings (${filteredTeams.length})`, icon: Users2 },
          { id: 'history', label: `Audit & Revisions (${corrections.length + (ann?.revisionHistory?.length || 0)})`, icon: History },
        ]}
        value={activeTab}
        onChange={setActiveTab}
      />

      {/* TAB 1: INDIVIDUAL RANKINGS */}
      {activeTab === 'individuals' && (
        <Card className="overflow-hidden">
          {filteredIndividuals.length === 0 ? (
            <EmptyState icon={Users} title="No participants found">
              No participant attempts match the current search or filters.
            </EmptyState>
          ) : (
            <TableWrap>
              <thead className="bg-slate-50 dark:bg-slate-800/80">
                <tr>
                  <th className="th w-16">Rank</th>
                  <th className="th">Participant</th>
                  <th className="th">Score / Total</th>
                  <th className="th hidden sm:table-cell">Accuracy</th>
                  <th className="th hidden md:table-cell">Duration</th>
                  <th className="th hidden lg:table-cell">Submitted At</th>
                  <th className="th hidden sm:table-cell">Breakdown</th>
                  <th className="th text-right">Audited Adjustment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredIndividuals.map((r) => {
                  const pct = r.maxScore ? Math.round((r.score / r.maxScore) * 10000) / 100 : 0;
                  return (
                    <tr key={r.userId} className={r.isTie ? 'bg-amber-50/20 dark:bg-amber-950/10' : ''}>
                      <td className="td font-extrabold text-slate-900 dark:text-white">
                        <div className="flex items-center gap-1.5">
                          <span>#{r.rank}</span>
                          {r.isTie && (
                            <span className="rounded bg-amber-100 px-1 py-0.2 text-[9px] font-extrabold text-amber-800 dark:bg-amber-950 dark:text-amber-300" title="Tied score and duration with another participant">
                              TIED
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="td">
                        <p className="font-bold text-slate-900 dark:text-white">{r.name}</p>
                        <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
                          <span>{r.participantId}</span>
                          {r.organization && <span className="font-sans text-slate-400">· {r.organization}</span>}
                        </div>
                      </td>
                      <td className="td font-extrabold text-slate-900 dark:text-white">
                        <span>{num(r.score)}</span>
                        <span className="text-xs text-slate-400 font-normal"> / {num(r.maxScore)}</span>
                        {r.isCorrected && (
                          <span className="ml-1.5 text-[10px] text-purple-600 font-bold" title={`Original calculated score: ${num(r.rawScore)}`}>
                            (Adjusted)
                          </span>
                        )}
                      </td>
                      <td className="td hidden sm:table-cell">
                        <span className={cx('font-bold', pct >= 75 ? 'text-emerald-600' : pct >= 50 ? 'text-brand-600' : 'text-amber-600')}>
                          {pct}%
                        </span>
                      </td>
                      <td className="td hidden md:table-cell font-mono text-xs">
                        <span className="flex items-center gap-1 text-slate-600 dark:text-slate-300">
                          <Clock className="h-3.5 w-3.5 text-slate-400" />
                          {fmtDuration(r.timeTakenSeconds)}
                        </span>
                      </td>
                      <td className="td hidden lg:table-cell text-xs text-slate-500">
                        {fmtDateTime(r.submittedAt)}
                      </td>
                      <td className="td hidden sm:table-cell text-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-600 font-semibold">{r.correctCount}C</span>
                          <span className="text-rose-600 font-semibold">{r.wrongCount}W</span>
                          <span className="text-slate-400">{r.unansweredCount}U</span>
                        </div>
                      </td>
                      <td className="td text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={Pencil}
                          onClick={() =>
                            setCorrectionTarget({
                              attemptId: r.attemptId,
                              name: r.name,
                              participantId: r.participantId,
                              currentScore: r.score,
                              maxScore: r.maxScore,
                              newScore: r.score,
                              reason: '',
                            })
                          }
                          title="Apply controlled audited score correction"
                        >
                          Correct
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>
          )}
        </Card>
      )}

      {/* TAB 2: TEAM RANKINGS */}
      {activeTab === 'teams' && (
        <Card className="overflow-hidden">
          {filteredTeams.length === 0 ? (
            <EmptyState icon={Users2} title="No team standings available">
              No teams found with submissions in this competition format.
            </EmptyState>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredTeams.map((t) => {
                const isExpanded = expandedTeamId === t.teamId;
                return (
                  <div key={t.teamId} className="transition hover:bg-slate-50/50 dark:hover:bg-slate-850/50">
                    <div
                      className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer"
                      onClick={() => setExpandedTeamId(isExpanded ? null : t.teamId)}
                    >
                      <div className="flex items-start sm:items-center gap-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 font-extrabold dark:bg-brand-950 dark:text-brand-300">
                          #{t.rank}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-extrabold text-slate-900 dark:text-white text-base">
                              {t.teamName}
                            </h4>
                            <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded dark:bg-slate-800">
                              {t.teamCode}
                            </span>
                            {t.isTie && (
                              <span className="rounded bg-amber-100 px-1 py-0.2 text-[9px] font-extrabold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                                TIED
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Team Leader: <strong className="text-slate-700 dark:text-slate-300">{t.leaderName}</strong> ({t.leaderParticipantId})
                            {t.organization && ` · ${t.organization}`}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between md:justify-end gap-6 border-t md:border-t-0 pt-3 md:pt-0">
                        <div className="text-left md:text-right">
                          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Official Score</p>
                          <p className="text-xl font-extrabold text-brand-600 dark:text-brand-400 tabular-nums">
                            {num(t.score)} Pts
                          </p>
                          <p className="text-[11px] text-slate-400">
                            Total Squad: {num(t.totalScore)}
                          </p>
                        </div>

                        <div className="text-left md:text-right hidden sm:block">
                          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Squad Turnout</p>
                          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                            {t.submittedMembersCount} / {t.membersCount} Completed
                          </p>
                          <p className="text-[11px] text-slate-400">
                            Best time: {fmtDuration(t.timeTakenSeconds)}
                          </p>
                        </div>

                        <div className="text-slate-400">
                          {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                        </div>
                      </div>
                    </div>

                    {/* Team Member Breakdown Drawer */}
                    {isExpanded && (
                      <div className="bg-slate-50/80 px-4 py-4 sm:px-6 dark:bg-slate-900/60 border-t border-slate-100 dark:border-slate-800">
                        <h5 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                          Squad Members Performance Breakdown
                        </h5>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {t.members.map((m) => (
                            <div
                              key={m.userId}
                              className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-900"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-sm text-slate-900 dark:text-white">
                                  {m.name}
                                </span>
                                <Badge tone={m.role === 'leader' ? 'amber' : 'gray'}>
                                  {m.roleLabel}
                                </Badge>
                              </div>
                              <p className="font-mono text-xs text-slate-500 mt-0.5">{m.participantId}</p>

                              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-xs dark:border-slate-800">
                                <div>
                                  <span className="text-slate-400">Score: </span>
                                  <span className="font-extrabold text-slate-800 dark:text-slate-200">
                                    {m.score !== null ? `${num(m.score)} / ${num(m.maxScore)}` : 'Not submitted'}
                                  </span>
                                </div>
                                {m.timeTakenSeconds !== null && (
                                  <div className="text-slate-500">
                                    {fmtDuration(m.timeTakenSeconds)}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* TAB 3: AUDIT & REVISIONS */}
      {activeTab === 'history' && (
        <div className="space-y-6">
          {/* Score Corrections Log */}
          <Card className="p-5">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-4">
              <ShieldCheck className="h-5 w-5 text-purple-600" />
              Audited Score Adjustments Log
            </h3>
            {corrections.length === 0 ? (
              <p className="text-sm text-slate-500">No score corrections have been applied for this competition.</p>
            ) : (
              <TableWrap>
                <thead className="bg-slate-50 dark:bg-slate-800">
                  <tr>
                    <th className="th">Participant</th>
                    <th className="th">Original Score</th>
                    <th className="th">Corrected Score</th>
                    <th className="th">Reason</th>
                    <th className="th">Adjusted By</th>
                    <th className="th">Date & Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {corrections.map((c, i) => (
                    <tr key={i}>
                      <td className="td font-bold">{c.user?.name} ({c.user?.participantId})</td>
                      <td className="td font-mono">{num(c.originalScore)}</td>
                      <td className="td font-mono font-bold text-purple-600">{num(c.correctedScore)}</td>
                      <td className="td text-sm">{c.reason}</td>
                      <td className="td text-xs text-slate-500">{c.correctedBy}</td>
                      <td className="td text-xs text-slate-400">{fmtDateTime(c.correctedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </Card>

          {/* Announcement Revision History */}
          <Card className="p-5">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-4">
              <History className="h-5 w-5 text-brand-600" />
              Announcement Publication History
            </h3>
            {(!ann?.revisionHistory || ann.revisionHistory.length === 0) ? (
              <p className="text-sm text-slate-500">No revisions published yet.</p>
            ) : (
              <div className="space-y-3">
                {ann.revisionHistory.map((rh, i) => (
                  <div key={i} className="rounded-xl border border-slate-200 p-3 bg-slate-50 dark:bg-slate-800/50 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-slate-900 dark:text-white">
                        Revision #{rh.revision}: {rh.title}
                      </span>
                      <Badge tone="purple">{rh.category.toUpperCase()}</Badge>
                    </div>
                    <p className="mt-1 text-slate-600 dark:text-slate-300">{rh.message}</p>
                    <p className="mt-2 text-slate-400">
                      Published on {fmtDateTime(rh.publishedAt)} · Note: {rh.note || 'Official revision'}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* 1. ANNOUNCEMENT COMPOSER MODAL */}
      <Modal
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        size="lg"
        title="Official Result Announcement Composer"
        footer={
          <>
            <Button variant="secondary" onClick={() => setComposerOpen(false)}>
              Cancel
            </Button>
            <Button variant="secondary" onClick={saveDraft} loading={busy}>
              Save as Draft
            </Button>
            <Button
              variant="primary"
              onClick={() => setConfirmPublishOpen(true)}
              icon={Send}
            >
              Review & Publish
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Announcement Title">
            <Input
              value={composerForm.title}
              onChange={(e) => setComposerForm({ ...composerForm, title: e.target.value })}
              placeholder="e.g. KLE BBA Cluster Mega Quiz — Final Official Results"
              required
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Result Category">
              <Select
                value={composerForm.category}
                onChange={(e) => setComposerForm({ ...composerForm, category: e.target.value })}
              >
                <option value="final">Final Official Results</option>
                <option value="preliminary">Preliminary Results</option>
                <option value="revised">Revised Official Results</option>
                <option value="cancelled">Announcement Cancelled</option>
              </Select>
            </Field>

            <Field label="Visibility Audience">
              <Select
                value={composerForm.visibility}
                onChange={(e) => setComposerForm({ ...composerForm, visibility: e.target.value })}
              >
                <option value="all">All Participants & Squads</option>
                <option value="participants_only">Assigned Participants Only</option>
                <option value="leaders_only">Team Leaders Only</option>
              </Select>
            </Field>
          </div>

          <Field label="Official Announcement Message">
            <Textarea
              rows={4}
              value={composerForm.message}
              onChange={(e) => setComposerForm({ ...composerForm, message: e.target.value })}
              placeholder="Provide event remarks, congratulatory notes, or schedule for prize distribution..."
            />
          </Field>

          {/* Winner Highlights */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Top Winner Highlights ({composerForm.highlights.length})
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setComposerForm({
                    ...composerForm,
                    highlights: [
                      ...composerForm.highlights,
                      {
                        rank: composerForm.highlights.length + 1,
                        label: 'Special Mention',
                        recipient: '',
                        score: 0,
                        note: '',
                      },
                    ],
                  })
                }
              >
                + Add Highlight
              </Button>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {composerForm.highlights.map((h, idx) => (
                <div key={idx} className="flex items-center gap-2 rounded-xl border border-slate-200 p-2 dark:border-slate-800">
                  <span className="font-extrabold text-xs text-brand-600 w-8">#{h.rank}</span>
                  <Input
                    value={h.label}
                    onChange={(e) => {
                      const next = [...composerForm.highlights];
                      next[idx].label = e.target.value;
                      setComposerForm({ ...composerForm, highlights: next });
                    }}
                    placeholder="Label (e.g. Winner)"
                    className="w-36 text-xs"
                  />
                  <Input
                    value={h.recipient}
                    onChange={(e) => {
                      const next = [...composerForm.highlights];
                      next[idx].recipient = e.target.value;
                      setComposerForm({ ...composerForm, highlights: next });
                    }}
                    placeholder="Recipient / Team name"
                    className="flex-1 text-xs"
                  />
                  <Input
                    type="number"
                    value={h.score}
                    onChange={(e) => {
                      const next = [...composerForm.highlights];
                      next[idx].score = Number(e.target.value);
                      setComposerForm({ ...composerForm, highlights: next });
                    }}
                    placeholder="Score"
                    className="w-20 text-xs font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setComposerForm({
                        ...composerForm,
                        highlights: composerForm.highlights.filter((_, j) => j !== idx),
                      });
                    }}
                    className="text-slate-400 hover:text-rose-600 px-1 text-xs"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      {/* 2. CONFIRM PUBLISH SUMMARY SCREEN */}
      <ConfirmModal
        open={confirmPublishOpen}
        onClose={() => setConfirmPublishOpen(false)}
        onConfirm={publishOfficialResults}
        loading={busy}
        tone="primary"
        title="Confirm Official Result Announcement"
        confirmLabel="Publish to Participants Now"
      >
        <div className="space-y-3 text-sm">
          <p className="text-slate-600 dark:text-slate-300">
            You are about to publish the official competition results for:
          </p>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
            <p className="font-bold text-slate-900 dark:text-white">{comp?.title}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Title: <strong className="text-slate-800 dark:text-slate-200">{composerForm.title}</strong>
            </p>
            <p className="text-xs text-slate-500">
              Category: <strong className="text-brand-600">{composerForm.category.toUpperCase()}</strong> · Audience: {composerForm.visibility}
            </p>
            <p className="text-xs text-slate-500">
              Total Result Records: <strong>{individuals.length} participants</strong> · <strong>{teams.length} squads</strong>
            </p>
          </div>
          <Alert tone="warning">
            Publishing results will immediately unlock student results, rankings, and certificates, and emit in-app notifications.
          </Alert>
        </div>
      </ConfirmModal>

      {/* 3. RETRACT CONFIRMATION MODAL */}
      <ConfirmModal
        open={retractOpen}
        onClose={() => setRetractOpen(false)}
        onConfirm={handleRetract}
        loading={busy}
        tone="danger"
        title="Retract Published Results?"
        confirmLabel="Retract Results"
      >
        <div className="space-y-3 text-sm">
          <p className="text-slate-600 dark:text-slate-300">
            Retracting will immediately seal and hide results from participants and leaders. This action is permanently recorded in the audit log.
          </p>
          <Field label="Mandatory Reason for Retraction" required>
            <Textarea
              rows={3}
              value={retractReason}
              onChange={(e) => setRetractReason(e.target.value)}
              placeholder="Explain why the results are being retracted (e.g. scoring dispute, question dispute resolution)..."
              required
            />
          </Field>
        </div>
      </ConfirmModal>

      {/* 4. AUDITED SCORE CORRECTION MODAL */}
      {correctionTarget && (
        <Modal
          open
          onClose={() => setCorrectionTarget(null)}
          size="md"
          title={`Audited Score Adjustment: ${correctionTarget.name}`}
          footer={
            <>
              <Button variant="secondary" onClick={() => setCorrectionTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" form="correction-form" loading={busy} variant="primary">
                Save Audited Correction
              </Button>
            </>
          }
        >
          <form id="correction-form" onSubmit={handleScoreCorrection} className="space-y-4">
            <Alert tone="warning">
              Scores cannot be modified without audit. The original calculated score is preserved, and the administrator ID, timestamp, and justification will be logged.
            </Alert>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase">Participant ID</span>
                <p className="font-mono text-sm font-bold">{correctionTarget.participantId}</p>
              </div>
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase">Current Score</span>
                <p className="font-mono text-sm font-bold">{correctionTarget.currentScore} / {correctionTarget.maxScore}</p>
              </div>
            </div>

            <Field label="Corrected Score (Official)">
              <Input
                type="number"
                step="0.25"
                min="0"
                max={correctionTarget.maxScore}
                value={correctionTarget.newScore}
                onChange={(e) => setCorrectionTarget({ ...correctionTarget, newScore: e.target.value })}
                required
              />
            </Field>

            <Field label="Justification / Audit Reason" required>
              <Textarea
                rows={3}
                value={correctionTarget.reason}
                onChange={(e) => setCorrectionTarget({ ...correctionTarget, reason: e.target.value })}
                placeholder="State the reason (e.g. technical error during question #3, re-evaluation awarded by committee)..."
                required
              />
            </Field>
          </form>
        </Modal>
      )}

      {/* 5. PRINT-FRIENDLY RESULT SHEET MODAL */}
      {printSheetOpen && (
        <Modal open onClose={() => setPrintSheetOpen(false)} size="xl" title="Print Official Result Sheet">
          <div className="space-y-4">
            <div className="flex justify-end gap-2 border-b pb-3 border-slate-200">
              <Button variant="primary" icon={Printer} onClick={() => window.print()}>
                Print Document
              </Button>
            </div>

            <div id="print-sheet" className="p-6 bg-white text-slate-900 border border-slate-200 rounded-xl">
              <div className="border-b-2 border-slate-900 pb-4 text-center">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-600">
                  K.L.E. Society's College of Business Administration
                </p>
                <h1 className="text-2xl font-black mt-1 uppercase tracking-tight">
                  KLE BBA Cluster Event QuizMaster
                </h1>
                <p className="text-sm font-bold text-slate-700 mt-1">
                  OFFICIAL COMPETITION RESULT SHEET
                </p>
                <div className="mt-3 flex justify-center gap-6 text-xs text-slate-600 font-mono">
                  <span>Competition: <strong>{comp?.title}</strong></span>
                  <span>Date: {fmtDateTime(comp?.endTime)}</span>
                  <span>Total Marks: {comp?.totalMarks}</span>
                </div>
              </div>

              {/* Highlights Summary */}
              {ann?.highlights && ann.highlights.length > 0 && (
                <div className="my-5 rounded-lg border border-slate-300 p-4 bg-slate-50">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                    Winner Highlights
                  </h3>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    {ann.highlights.slice(0, 3).map((h, i) => (
                      <div key={i} className="border-r last:border-r-0 border-slate-300 pr-2">
                        <p className="text-xs font-extrabold text-brand-700">{h.label}</p>
                        <p className="text-sm font-bold text-slate-900">{h.recipient}</p>
                        <p className="text-xs font-mono text-slate-600">{h.score} Pts</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Top Rankings Table */}
              <div className="mt-6">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                  Authoritative Final Standings
                </h3>
                <table className="min-w-full text-xs divide-y divide-slate-300 border border-slate-300">
                  <thead className="bg-slate-100 font-bold text-slate-800">
                    <tr>
                      <th className="p-2 text-left">Rank</th>
                      <th className="p-2 text-left">Participant ID</th>
                      <th className="p-2 text-left">Name</th>
                      <th className="p-2 text-left">Organization</th>
                      <th className="p-2 text-right">Score</th>
                      <th className="p-2 text-right">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {individuals.slice(0, 30).map((r) => (
                      <tr key={r.userId}>
                        <td className="p-2 font-bold">#{r.rank} {r.isTie && '(T)'}</td>
                        <td className="p-2 font-mono">{r.participantId}</td>
                        <td className="p-2 font-semibold">{r.name}</td>
                        <td className="p-2">{r.organization || '—'}</td>
                        <td className="p-2 text-right font-bold">{num(r.score)}</td>
                        <td className="p-2 text-right font-mono">{fmtDuration(r.timeTakenSeconds)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-10 flex justify-between border-t border-slate-300 pt-6 text-xs text-slate-600">
                <div>
                  <p className="font-bold">Faculty Coordinator</p>
                  <p className="mt-8">Signature &amp; Stamp</p>
                </div>
                <div className="text-right">
                  <p className="font-bold">QuizMaster Controller</p>
                  <p className="mt-8">Signature &amp; Stamp</p>
                </div>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
