import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Building2, Eye, EyeOff, KeyRound, Lock, Mail, Mic, MicOff, User } from 'lucide-react';
import { authApi, type Session } from '../api/auth';
import { ApiError } from '../api/http';
import { useAuth } from '../auth/AuthProvider';
import { forgetRemembered, readRemembered } from '../auth/rememberedAccount';
import { AstroMark } from '../components/AstroMark';
import { AuthField } from '../components/AuthField/AuthField';
import { BlackHoleOrb } from '../components/BlackHoleOrb/BlackHoleOrb';
import type { OrbMode } from '../components/BlackHoleOrb/orbRenderer';
import { PasswordStrength } from '../components/PasswordStrength/PasswordStrength';
import { useMicLevel } from '../hooks/useMicLevel';
import { useSpeechCapture, type CaptureError } from '../hooks/useSpeechCapture';
import { SITE, formatHours, localSiderealHours, siteTime } from '../lib/sky';
import styles from './AuthPage.module.scss';

type Mode = 'voice' | 'password' | 'signup' | 'forgot' | 'reset' | 'verify' | 'inbox';
type VoiceState = 'idle' | 'listening' | 'verifying' | 'success' | 'error';
type Inbox = { kind: 'verify' | 'reset'; email: string };

const SUCCESS_MS = 650;
const RESEND_COOLDOWN = 30;

const VOICE_STATUS: Record<VoiceState, string> = {
  idle: 'Astro is standing by',
  listening: 'Astro is listening',
  verifying: 'Verifying access phrase',
  success: 'Access phrase verified',
  error: 'Access phrase not recognized',
};

function captureMessage(err: CaptureError): string {
  switch (err) {
    case 'denied':
      return 'Microphone access is blocked. Allow it from the address bar, or use your password.';
    case 'network':
      return "Your browser's speech service can't be reached. Use your password instead.";
    case 'unsupported':
      return "Voice sign-in isn't available in this browser.";
    default:
      return 'Astro couldn’t hear that. Try again, or use your password.';
  }
}

function initialMode(param: string | null, token: string | null, voiceReady: boolean): Mode {
  if (param === 'reset' && token) return 'reset';
  if (param === 'verify' && token) return 'verify';
  if (param === 'signup') return 'signup';
  if (param === 'forgot') return 'forgot';
  return voiceReady ? 'voice' : 'password';
}

/** Live sidereal clock in the header. Isolated so its once-a-second update re-renders only itself. */
function SkyClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <span className={styles.clock}>
      {SITE.name} · IST {siteTime(now)} · LST {formatHours(localSiderealHours(now))}
    </span>
  );
}

export default function AuthPage() {
  const { status, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const speech = useSpeechCapture();
  const mic = useMicLevel();
  const from = (location.state as { from?: { pathname: string; search?: string } } | null)?.from;
  const target = from ? `${from.pathname}${from.search ?? ''}` : '/';

  const [account, setAccount] = useState(readRemembered);
  const [token] = useState(() => params.get('token'));
  const [mode, setMode] = useState<Mode>(() =>
    initialMode(params.get('mode'), params.get('token'), Boolean(account?.voiceEnabled) && speech.supported),
  );
  const [email, setEmail] = useState(account?.email ?? '');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [voice, setVoice] = useState<VoiceState>('idle');
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const firstField = useRef<HTMLInputElement>(null);
  const verifyStarted = useRef(false);

  // Keep one-time tokens out of the address bar and history once read.
  useEffect(() => {
    if (params.has('token') || params.has('mode')) setParams({}, { replace: true });
  }, [params, setParams]);

  // Warm up the app shell while the person signs in, so the hand-off is instant.
  useEffect(() => {
    const warm = () => {
      void import('../components/AppShell/AppShell');
      void import('./AskPage');
    };
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    if (idle) idle(warm);
    else window.setTimeout(warm, 800);
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

  const go = useCallback((next: Mode) => {
    setMode(next);
    setError(null);
    setFields({});
    setVoiceNote(null);
    setVoice('idle');
  }, []);

  useEffect(() => {
    if (mode !== 'voice' && mode !== 'verify' && mode !== 'inbox') firstField.current?.focus();
  }, [mode]);

  const finish = useCallback(
    (session: Session) => {
      setFinishing(true);
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.setTimeout(
        () => {
          signIn(session);
          navigate(target, { replace: true });
        },
        reduced ? 0 : SUCCESS_MS,
      );
    },
    [navigate, signIn, target],
  );

  const fail = useCallback((err: unknown, fallback = 'Something went wrong. Try again.') => {
    if (err instanceof ApiError) {
      setFields(err.fields);
      setError(
        err.code === 'rate_limited' && err.retryAfter
          ? `Too many attempts. Try again in ${Math.ceil(err.retryAfter / 60)} min.`
          : err.message,
      );
    } else setError(fallback);
  }, []);

  // ------------------------------------------------------------------ voice
  const listen = useCallback(async () => {
    if (voice === 'listening') {
      speech.cancel();
      return;
    }
    if (!email) {
      setVoiceNote('Enter your work email first, then speak.');
      firstField.current?.focus();
      return;
    }
    setVoiceNote(null);
    setVoice('listening');
    void mic.start();
    let alternatives: string[] = [];
    try {
      alternatives = (await speech.capture()).alternatives;
    } catch (err) {
      mic.stop();
      setVoice('error');
      setVoiceNote(captureMessage(err as CaptureError));
      return;
    }
    mic.stop();
    if (alternatives.length === 0) {
      setVoice('idle');
      setVoiceNote('Astro didn’t hear anything. Tap the orb and say your phrase.');
      return;
    }
    setVoice('verifying');
    try {
      const session = await authApi.voiceLogin(email, alternatives, false);
      setVoice('success');
      finish(session);
    } catch (err) {
      setVoice('error');
      if (err instanceof ApiError && err.code === 'rate_limited') {
        setVoiceNote('Too many attempts for now. Sign in with your password.');
      } else if (err instanceof ApiError && err.code === 'voice_not_recognized') {
        setVoiceNote('Try again, or use your password.');
      } else {
        setVoiceNote(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
      }
    }
  }, [email, finish, mic, speech, voice]);

  // ------------------------------------------------------------------ forms
  const submitPassword = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      finish(await authApi.login(email.trim(), password, rememberMe));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'email_unverified') {
        setInbox({ kind: 'verify', email: email.trim() });
        go('inbox');
      } else fail(err);
      setBusy(false);
    }
  };

  const submitSignup = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await authApi.signup(name.trim(), email.trim(), password, company.trim() || undefined);
      setInbox({ kind: 'verify', email: email.trim() });
      setCooldown(RESEND_COOLDOWN);
      go('inbox');
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const submitForgot = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await authApi.forgotPassword(email.trim());
      setInbox({ kind: 'reset', email: email.trim() });
      setCooldown(RESEND_COOLDOWN);
      go('inbox');
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const submitReset = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setError(null);
    setFields({});
    try {
      finish(await authApi.resetPassword(token, password));
    } catch (err) {
      fail(err);
      setBusy(false);
    }
  };

  const resend = async () => {
    if (!inbox || cooldown > 0) return;
    setCooldown(RESEND_COOLDOWN);
    try {
      if (inbox.kind === 'verify') await authApi.resendVerification(inbox.email);
      else await authApi.forgotPassword(inbox.email);
    } catch (err) {
      fail(err);
    }
  };

  // Verification links sign you in directly. The ref guard stops StrictMode's double effect from
  // spending the one-time token twice.
  useEffect(() => {
    if (mode !== 'verify' || !token || verifyStarted.current) return;
    verifyStarted.current = true;
    authApi.verifyEmail(token).then(finish, (err) => fail(err, 'This link has expired or was already used.'));
  }, [fail, finish, mode, token]);

  const notYou = () => {
    forgetRemembered();
    setAccount(null);
    setEmail('');
    go('password');
  };

  const orbMode: OrbMode = useMemo(() => {
    if (finishing) return 'success';
    if (mode === 'voice') return voice;
    if (mode === 'verify') return error ? 'error' : 'verifying';
    if (busy) return 'verifying';
    return 'dim';
  }, [busy, error, finishing, mode, voice]);

  if (status === 'signedIn' && !finishing) return <Navigate to={target} replace />;

  const compact = mode !== 'voice' && mode !== 'verify';
  const statusLine =
    mode === 'voice'
      ? VOICE_STATUS[voice]
      : finishing
        ? 'Access granted'
        : {
            password: 'Secure sign-in',
            signup: 'New workspace',
            forgot: 'Account recovery',
            reset: 'Choose a new password',
            verify: error ? 'Link not valid' : 'Confirming your email',
            inbox: 'Transmission sent',
          }[mode];

  const passwordToggle = (
    <button
      type="button"
      className={styles.eye}
      onClick={() => setShowPassword((v) => !v)}
      aria-label={showPassword ? 'Hide password' : 'Show password'}
    >
      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
    </button>
  );

  return (
    <div className={styles.page} data-finishing={finishing || undefined}>
      <div className={styles.space} aria-hidden="true" />

      <header className={styles.top}>
        <div className={styles.brand}>
          <AstroMark size={26} tone="dark" />
          <span>ASTRO</span>
        </div>
        <div className={styles.telemetry}>
          <SkyClock />
          <span className={styles.secure}>
            <Lock size={11} aria-hidden="true" /> Encrypted channel
          </span>
        </div>
      </header>

      <main className={styles.stage} data-compact={compact || undefined}>
        <div className={styles.orbSlot}>
          <div className={styles.orbInner}>
            <BlackHoleOrb mode={orbMode} levelSource={mic.sample} />
            {mode === 'voice' && (
              <button
                type="button"
                className={styles.orbButton}
                onClick={listen}
                disabled={voice === 'verifying' || finishing || !speech.supported}
                aria-label={voice === 'listening' ? 'Stop listening' : 'Speak your access phrase'}
              />
            )}
          </div>
        </div>

        <p className={styles.status} role="status" aria-live="polite" data-tone={orbMode}>
          <span className={styles.dot} aria-hidden="true" />
          {statusLine}
        </p>

        {mode === 'voice' && (
          <section className={styles.voicePanel} aria-label="Voice sign-in">
            <h1 className={styles.title}>Speak your access phrase</h1>
            {account && account.email === email ? (
              <div className={styles.account}>
                <span className={styles.avatar}>{account.initials}</span>
                <span className={styles.accountText}>
                  <b>{account.name}</b>
                  <span>{account.email}</span>
                </span>
                <button type="button" className={styles.linkBtn} onClick={notYou}>
                  Not you?
                </button>
              </div>
            ) : (
              <div className={styles.voiceEmail}>
                <AuthField
                  ref={firstField}
                  label="Work email"
                  icon={Mail}
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            )}

            {speech.supported ? (
              <button
                type="button"
                className={styles.mic}
                data-state={voice}
                onClick={listen}
                disabled={voice === 'verifying' || finishing}
              >
                {voice === 'listening' ? <MicOff size={18} aria-hidden="true" /> : <Mic size={18} aria-hidden="true" />}
                {voice === 'listening' ? 'Listening… tap to stop' : voice === 'error' ? 'Try again' : 'Speak now'}
              </button>
            ) : (
              <p className={styles.note}>{captureMessage('unsupported')}</p>
            )}
            {voiceNote && <p className={styles.note}>{voiceNote}</p>}
            <button type="button" className={styles.switch} onClick={() => go('password')}>
              <KeyRound size={15} aria-hidden="true" /> Use password instead
            </button>
            <p className={styles.fine}>
              {speech.onDevice
                ? 'Speech is turned into text on this device. '
                : 'Your browser’s speech service turns speech into text. '}
              Astro checks your phrase like a password; it isn’t shown or stored.
            </p>
          </section>
        )}

        {compact && (
          <section className={styles.card} aria-label="Account">
            {(mode === 'password' || mode === 'signup') && (
              <div className={styles.tabs} role="tablist" data-active={mode}>
                <span className={styles.tabThumb} aria-hidden="true" />
                <button role="tab" type="button" aria-selected={mode === 'password'} onClick={() => go('password')}>
                  Sign in
                </button>
                <button role="tab" type="button" aria-selected={mode === 'signup'} onClick={() => go('signup')}>
                  Create account
                </button>
              </div>
            )}

            {mode === 'password' && (
              <form onSubmit={submitPassword} className={styles.form} noValidate>
                <div className={styles.heading}>
                  <h1>Welcome back</h1>
                  <p>Sign in to your Astro workspace.</p>
                </div>
                <AuthField
                  ref={firstField}
                  label="Work email"
                  icon={Mail}
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  error={fields.email}
                />
                <AuthField
                  label="Password"
                  icon={Lock}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  error={fields.password}
                  trailing={passwordToggle}
                />
                <div className={styles.row}>
                  <label className={styles.check}>
                    <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
                    <span aria-hidden="true" />
                    Remember me
                  </label>
                  <button type="button" className={styles.linkBtn} onClick={() => go('forgot')}>
                    Forgot password?
                  </button>
                </div>
                {error && <p className={styles.error}>{error}</p>}
                <SubmitButton busy={busy || finishing} label="Sign in" busyLabel="Establishing session" />
                {speech.supported && (
                  <button type="button" className={styles.switch} onClick={() => go('voice')}>
                    <Mic size={15} aria-hidden="true" /> Sign in with your voice
                  </button>
                )}
              </form>
            )}

            {mode === 'signup' && (
              <form onSubmit={submitSignup} className={styles.form} noValidate>
                <div className={styles.heading}>
                  <h1>Launch your workspace</h1>
                  <p>Answers from your company’s own knowledge, with sources.</p>
                </div>
                <AuthField
                  ref={firstField}
                  label="Your name"
                  icon={User}
                  autoComplete="name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  error={fields.name}
                />
                <AuthField
                  label="Work email"
                  icon={Mail}
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  error={fields.email}
                />
                <AuthField
                  label="Password"
                  icon={Lock}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  error={fields.password}
                  trailing={passwordToggle}
                />
                <PasswordStrength password={password} />
                <AuthField
                  label="Company (optional)"
                  icon={Building2}
                  autoComplete="organization"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  error={fields.companyName}
                  hint="If your company already uses Astro, you’ll join it after confirming your email."
                />
                {error && !Object.keys(fields).length && <p className={styles.error}>{error}</p>}
                <SubmitButton busy={busy} label="Create account" busyLabel="Creating account" />
              </form>
            )}

            {mode === 'forgot' && (
              <form onSubmit={submitForgot} className={styles.form} noValidate>
                <button type="button" className={styles.back} onClick={() => go('password')}>
                  <ArrowLeft size={15} aria-hidden="true" /> Back to sign in
                </button>
                <div className={styles.heading}>
                  <h1>Reset your password</h1>
                  <p>We’ll email you a link that works once and expires in 30 minutes.</p>
                </div>
                <AuthField
                  ref={firstField}
                  label="Work email"
                  icon={Mail}
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  error={fields.email}
                />
                {error && <p className={styles.error}>{error}</p>}
                <SubmitButton busy={busy} label="Send reset link" busyLabel="Sending" />
              </form>
            )}

            {mode === 'reset' && (
              <form onSubmit={submitReset} className={styles.form} noValidate>
                <div className={styles.heading}>
                  <h1>Choose a new password</h1>
                  <p>This signs out every other device. Voice sign-in turns off until you set it up again.</p>
                </div>
                <AuthField
                  ref={firstField}
                  label="New password"
                  icon={Lock}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  error={fields.password}
                  trailing={passwordToggle}
                />
                <PasswordStrength password={password} />
                {error && !fields.password && <p className={styles.error}>{error}</p>}
                <SubmitButton busy={busy || finishing} label="Set new password" busyLabel="Saving" />
                {error && !fields.password && (
                  <button type="button" className={styles.switch} onClick={() => go('forgot')}>
                    Send a new link
                  </button>
                )}
              </form>
            )}

            {mode === 'inbox' && inbox && (
              <div className={styles.form}>
                <div className={styles.transmit} aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <Mail size={22} />
                </div>
                <div className={styles.heading}>
                  <h1>{inbox.kind === 'verify' ? 'Confirm your email' : 'Check your inbox'}</h1>
                  <p>
                    If <b>{inbox.email}</b> {inbox.kind === 'verify' ? 'is new to Astro' : 'has an Astro account'}, a
                    link is on its way.{' '}
                    {inbox.kind === 'verify' ? 'It expires in 48 hours.' : 'It expires in 30 minutes.'}
                  </p>
                </div>
                {error && <p className={styles.error}>{error}</p>}
                <button type="button" className={styles.secondary} onClick={resend} disabled={cooldown > 0}>
                  {cooldown > 0 ? `Send again in ${cooldown}s` : 'Send the link again'}
                </button>
                {import.meta.env.DEV && (
                  <a className={styles.dev} href="/api/dev/outbox" target="_blank" rel="noreferrer">
                    Development: open the local mailbox
                  </a>
                )}
                <button type="button" className={styles.back} onClick={() => go('password')}>
                  <ArrowLeft size={15} aria-hidden="true" /> Back to sign in
                </button>
              </div>
            )}
          </section>
        )}

        {mode === 'verify' && error && (
          <section className={styles.voicePanel}>
            <p className={styles.note}>{error}</p>
            <button type="button" className={styles.switch} onClick={() => go('password')}>
              <ArrowLeft size={15} aria-hidden="true" /> Back to sign in
            </button>
          </section>
        )}
      </main>

      <footer className={styles.foot}>Voice passphrase, not voice biometrics · Sessions are HTTP-only</footer>
    </div>
  );
}

function SubmitButton({ busy, label, busyLabel }: { busy: boolean; label: string; busyLabel: string }) {
  return (
    <button type="submit" className={styles.primary} disabled={busy} aria-busy={busy}>
      {busy ? (
        <>
          <span className={styles.spinner} aria-hidden="true" />
          {busyLabel}
        </>
      ) : (
        label
      )}
    </button>
  );
}
