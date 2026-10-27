import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ShieldCheck, Timer, Trophy, Lock, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { Alert, Button, Field, Input, Logo, ThemeToggle } from '../components/ui.jsx';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (user) {
    if (user.mustChangePassword) return <Navigate to="/change-password" replace />;
    return <Navigate to={location.state?.from || (user.role === 'admin' ? '/admin' : '/')} replace />;
  }

  async function submit(e) {
    if (e) e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const u = await login(identifier.trim(), password);
      navigate(u.mustChangePassword ? '/change-password' : u.role === 'admin' ? '/admin' : '/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Brand Hero Column (Desktop) */}
      <section className="relative hidden overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-violet-800 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-violet-400/20 blur-3xl" />
        <div className="relative flex items-center justify-between">
          <Logo light />
          <ThemeToggle className="!bg-white/10 !border-white/20 !text-white hover:!bg-white/20" />
        </div>
        <div className="relative max-w-lg">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold tracking-wide backdrop-blur-sm">
            <Sparkles className="h-3.5 w-3.5 text-amber-300" /> Secure Competition Engine
          </div>
          <h1 className="mt-4 text-4xl font-extrabold leading-tight !text-white xl:text-5xl">
            Fair, secure quiz competitions.
          </h1>
          <p className="mt-4 text-lg text-brand-100">
            Every deadline is enforced on the server. Every score is calculated securely. Correct answers stay sealed until the organiser releases them.
          </p>
          <ul className="mt-10 space-y-5">
            {[
              [Timer, 'Server-timed attempts', 'Resume safely after a disconnect - the clock never lies.'],
              [ShieldCheck, 'Sealed answer keys', 'Correct answers never reach the browser before official release.'],
              [Trophy, 'Live leaderboards & instant analytics', 'Ranked by score, then speed, once results are published.'],
            ].map(([Icon, t, d]) => (
              <li key={t} className="flex gap-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/15 ring-1 ring-white/20">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <p className="font-bold text-white">{t}</p>
                  <p className="text-sm text-brand-100">{d}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-brand-200">Accounts are issued by your institution or tournament organiser.</p>
      </section>

      {/* Login Form Column */}
      <section className="flex flex-col justify-between px-5 py-8 sm:px-10 sm:py-12">
        <div className="flex items-center justify-between lg:hidden mb-6">
          <Logo />
          <ThemeToggle />
        </div>

        <div className="mx-auto w-full max-w-md animate-fade-up my-auto">
          <h2 className="text-2xl font-extrabold sm:text-3xl text-slate-900 dark:text-white">Welcome back</h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Sign in with the credentials issued by your organiser.</p>

          <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
            {error && <Alert tone="error">{error}</Alert>}
            <Field label="Participant ID, username or email">
              <Input
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="QM-7K3X9P"
                required
                autoFocus
              />
            </Field>
            <Field label="Password">
              <div className="relative">
                <Input
                  type={show ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  className="pr-11"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute inset-y-0 right-0 grid w-11 place-items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  aria-label={show ? 'Hide password' : 'Show password'}
                >
                  {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </Field>
            <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!identifier || !password}>
              Sign in
            </Button>
          </form>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
            <Lock className="h-3.5 w-3.5" aria-hidden /> Protected with encrypted sessions &amp; CSRF guard.
          </p>
        </div>

        <div className="mt-6 text-center text-xs text-slate-400 dark:text-slate-500">
          QuizMaster Competition System
        </div>
      </section>
    </div>
  );
}
