import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trophy, Clock, ListChecks, CalendarDays, Users, Search } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useFetch } from '../../lib/hooks.js';
import { fmtDateTime } from '../../lib/format.js';
import { Button, Card, EmptyState, ErrorState, Input, PageHeader, PhaseBadge, Skeleton, StatusBadge, Tabs } from '../../components/ui.jsx';

const filters = [
  { id: 'all', label: 'All' },
  { id: 'published', label: 'Published' },
  { id: 'draft', label: 'Drafts' },
  { id: 'archived', label: 'Archived' },
];

export default function Competitions() {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const { data, error, loading, reload } = useFetch(() => api.get('/admin/competitions'), []);

  const items = useMemo(() => {
    return (data?.items || []).filter((c) => {
      const matchFilter = filter === 'all' || c.status === filter;
      const matchSearch = !search.trim() || c.title.toLowerCase().includes(search.toLowerCase());
      return matchFilter && matchSearch;
    });
  }, [data, filter, search]);

  return (
    <>
      <PageHeader
        title="Competitions"
        subtitle="Create, schedule and manage your quiz competitions."
        actions={
          <Link to="/admin/competitions/new">
            <Button icon={Plus}>New competition</Button>
          </Link>
        }
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Tabs tabs={filters} value={filter} onChange={setFilter} />
        <div className="relative sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search competitions..."
            className="pl-9"
            aria-label="Search competitions"
          />
        </div>
      </div>

      <div className="mt-6">
        {error && <ErrorState error={error} onRetry={reload} />}
        {loading && !data && (
          <div className="grid gap-4 md:grid-cols-2">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-44" />)}
          </div>
        )}
        {data && items.length === 0 && (
          <EmptyState
            icon={Trophy}
            title="No competitions here"
            action={
              <Link to="/admin/competitions/new">
                <Button icon={Plus}>Create competition</Button>
              </Link>
            }
          >
            {filter === 'all' ? 'Create your first competition to get started.' : 'Nothing matches this filter or search query.'}
          </EmptyState>
        )}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((c) => (
            <Link key={c.id} to={`/admin/competitions/${c.id}`} className="group">
              <Card className="h-full p-5 transition group-hover:-translate-y-0.5 group-hover:shadow-lift">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={c.status} />
                  {c.status === 'published' && <PhaseBadge phase={c.phase} />}
                </div>
                <h2 className="mt-3 line-clamp-2 text-lg font-bold group-hover:text-brand-600 dark:group-hover:text-brand-400 text-slate-900 dark:text-white">
                  {c.title}
                </h2>
                <dl className="mt-4 space-y-2 text-sm text-slate-600 dark:text-slate-400">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-slate-400 shrink-0" aria-hidden />
                    <dt className="sr-only">Window</dt>
                    <dd className="truncate text-xs">{fmtDateTime(c.startTime)} - {fmtDateTime(c.endTime)}</dd>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-slate-400 shrink-0" aria-hidden />
                    <dt className="sr-only">Duration</dt>
                    <dd className="text-xs">{c.durationMinutes} min · {c.questionCount} questions · {c.totalMarks} marks</dd>
                  </div>
                  <div className="flex items-center gap-2">
                    <ListChecks className="h-4 w-4 text-slate-400 shrink-0" aria-hidden />
                    <dt className="sr-only">Attempts</dt>
                    <dd className="text-xs">{c.stats?.submitted || 0} submitted, {c.stats?.inProgress || 0} in progress</dd>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-slate-400 shrink-0" aria-hidden />
                    <dt className="sr-only">Audience</dt>
                    <dd className="text-xs">{c.visibility === 'all' ? 'All participants' : `${c.assignedCount} assigned`}</dd>
                  </div>
                </dl>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
