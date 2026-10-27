import { useState } from 'react';
import { NavLink, Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, Trophy, ScrollText, LogOut, Menu, X, KeyRound, GraduationCap, Home, Eye
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { Logo, ThemeToggle, cx } from './ui.jsx';

const adminNav = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/competitions', label: 'Competitions', icon: Trophy },
  { to: '/admin/participants', label: 'Participants', icon: Users },
  { to: '/admin/audit', label: 'Audit log', icon: ScrollText },
];

function UserChip({ user }) {
  const initials = user.name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-700 dark:bg-brand-950 dark:text-brand-300">
        {initials}
      </span>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{user.name}</p>
        <p className="truncate text-xs text-slate-500 dark:text-slate-400">{user.participantId || user.username || user.email}</p>
      </div>
    </div>
  );
}

export function AdminLayout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const nav = (
    <nav className="flex flex-1 flex-col gap-1 px-3" aria-label="Admin">
      {adminNav.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.end}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            cx(
              'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition',
              isActive
                ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/80 dark:text-brand-300'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
            )
          }
        >
          <n.icon className="h-5 w-5" aria-hidden />
          {n.label}
        </NavLink>
      ))}
      <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
        <Link
          to="/"
          className="flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          <Eye className="h-4 w-4" /> Switch to Student View
        </Link>
      </div>
    </nav>
  );

  const footer = (
    <div className="space-y-3 border-t border-slate-100 p-4 dark:border-slate-800">
      <div className="flex items-center justify-between gap-2">
        <UserChip user={user} />
        <ThemeToggle />
      </div>
      <div className="flex gap-2">
        <Link to="/change-password" className="btn btn-secondary btn-sm flex-1" onClick={() => setOpen(false)}>
          <KeyRound className="h-4 w-4" /> Password
        </Link>
        <button
          className="btn btn-secondary btn-sm flex-1"
          onClick={async () => {
            await logout();
            navigate('/login');
          }}
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:pl-64">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:flex">
        <div className="p-5">
          <Logo />
          <p className="mt-1 pl-11 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Admin console</p>
        </div>
        {nav}
        {footer}
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 lg:hidden">
        <Logo />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            onClick={() => setOpen(true)}
            className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-slate-950/60 backdrop-blur-sm" onClick={() => setOpen(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 flex w-72 animate-slide-in flex-col bg-white shadow-2xl dark:bg-slate-900">
            <div className="flex items-center justify-between p-5">
              <Logo />
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {nav}
            {footer}
          </aside>
        </div>
      )}

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        <Outlet />
      </main>
    </div>
  );
}

export function StudentLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="min-h-screen pb-16 sm:pb-0">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link to="/" aria-label="QuizMaster home" className="hover:opacity-90 transition">
            <Logo />
          </Link>
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="hidden sm:block">
              <UserChip user={user} />
            </div>
            <ThemeToggle />
            <Link to="/change-password" className="btn btn-ghost btn-sm" title="Change password">
              <KeyRound className="h-4 w-4" />
              <span className="hidden md:inline">Password</span>
            </Link>
            {user.role === 'admin' && (
              <Link to="/admin" className="btn btn-soft btn-sm" title="Back to Admin Console">
                <LayoutDashboard className="h-4 w-4" />
                <span className="hidden md:inline">Admin</span>
              </Link>
            )}
            <button
              className="btn btn-secondary btn-sm"
              onClick={async () => {
                await logout();
                navigate('/login');
              }}
              title="Sign out"
            >
              <LogOut className="h-4 w-4" /> <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <Outlet />
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-10 text-center text-xs text-slate-400 dark:text-slate-500 sm:px-6">
        <GraduationCap className="mx-auto mb-1 h-4 w-4" aria-hidden /> QuizMaster Online Competitions · Server-timed &amp; Secure
      </footer>

      {/* Mobile Bottom Navigation Bar for Student */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-slate-200 bg-white/95 px-2 py-2 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 sm:hidden"
        aria-label="Mobile Navigation"
      >
        <Link
          to="/"
          className={cx(
            'flex flex-col items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition',
            location.pathname === '/' ? 'text-brand-600 dark:text-brand-400' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
          )}
        >
          <Home className="h-5 w-5" />
          <span>Home</span>
        </Link>
        <Link
          to="/change-password"
          className={cx(
            'flex flex-col items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition',
            location.pathname === '/change-password' ? 'text-brand-600 dark:text-brand-400' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
          )}
        >
          <KeyRound className="h-5 w-5" />
          <span>Password</span>
        </Link>
        {user.role === 'admin' ? (
          <Link
            to="/admin"
            className="flex flex-col items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] font-semibold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          >
            <LayoutDashboard className="h-5 w-5" />
            <span>Admin</span>
          </Link>
        ) : (
          <div className="flex flex-col items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] font-semibold text-slate-500">
            <span className="truncate max-w-[80px] font-mono text-[10px]">{user.participantId}</span>
            <span className="text-emerald-600 font-bold">Active</span>
          </div>
        )}
        <button
          onClick={async () => {
            await logout();
            navigate('/login');
          }}
          className="flex flex-col items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] font-semibold text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400"
        >
          <LogOut className="h-5 w-5" />
          <span>Exit</span>
        </button>
      </nav>
    </div>
  );
}
