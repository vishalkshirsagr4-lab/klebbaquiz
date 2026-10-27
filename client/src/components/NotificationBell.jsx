import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Megaphone, Trophy, X } from 'lucide-react';
import { api } from '../lib/api.js';
import { useFetch } from '../lib/hooks.js';
import { fmtDateTime } from '../lib/format.js';
import { Badge, cx } from './ui.jsx';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const navigate = useNavigate();

  const { data, reload } = useFetch(() => api.get('/notifications'), [], { interval: 25000 });
  const items = data?.items || [];
  const unreadCount = data?.unreadCount || 0;

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  async function handleNotificationClick(notif) {
    if (!notif.read) {
      try {
        await api.patch(`/notifications/${notif.id}/read`);
        reload();
      } catch {}
    }
    setOpen(false);
    if (notif.link) {
      navigate(notif.link);
    }
  }

  async function handleMarkAllRead(e) {
    e.stopPropagation();
    try {
      await api.post('/notifications/read-all');
      reload();
    } catch {}
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="relative rounded-xl border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
        aria-label="View notifications"
        title="Announcements & Alerts"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-extrabold text-white animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl backdrop-blur-md dark:border-slate-800 dark:bg-slate-900 z-50 animate-scale-in">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2 px-1 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-brand-600 dark:text-brand-400" />
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">Announcements</h4>
              {unreadCount > 0 && (
                <span className="rounded bg-rose-100 px-1.5 py-0.2 text-[10px] font-bold text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                  {unreadCount} new
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-slate-800"
                  title="Mark all as read"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  <span>Mark all read</span>
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mt-2 max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {items.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                <Trophy className="mx-auto mb-2 h-6 w-6 text-slate-300 dark:text-slate-600" />
                No announcements at this time.
              </div>
            ) : (
              items.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => handleNotificationClick(notif)}
                  className={cx(
                    'cursor-pointer rounded-xl p-2.5 transition',
                    notif.read
                      ? 'hover:bg-slate-50 dark:hover:bg-slate-800/40 opacity-75'
                      : 'bg-brand-50/50 hover:bg-brand-50 dark:bg-brand-950/20 dark:hover:bg-brand-950/40'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className={cx('text-xs font-bold', notif.read ? 'text-slate-800 dark:text-slate-200' : 'text-brand-900 dark:text-brand-200')}>
                      {notif.title}
                    </p>
                    <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-brand-600 dark:text-brand-400">
                      {notif.category}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-600 dark:text-slate-400">
                    {notif.message}
                  </p>
                  <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
                    <span>{fmtDateTime(notif.createdAt)}</span>
                    {!notif.read && <span className="h-1.5 w-1.5 rounded-full bg-brand-600" />}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
