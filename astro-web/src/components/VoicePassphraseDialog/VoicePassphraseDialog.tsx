import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Lock, Mic, X } from 'lucide-react';
import { authApi } from '../../api/auth';
import { ApiError } from '../../api/http';
import { useAuth } from '../../auth/AuthProvider';
import { useMicLevel } from '../../hooks/useMicLevel';
import { useSpeechCapture } from '../../hooks/useSpeechCapture';
import { AuthField } from '../AuthField/AuthField';
import { BlackHoleOrb } from '../BlackHoleOrb/BlackHoleOrb';
import styles from './VoicePassphraseDialog.module.scss';

type Step = 'intro' | 'first' | 'second' | 'done' | 'remove';

const simplify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Set up, change or turn off voice sign-in. The password is asked for first, every time. */
export function VoicePassphraseDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { session, patchUser } = useAuth();
  const enabled = Boolean(session?.user.voiceEnabled);
  const speech = useSpeechCapture();
  const mic = useMicLevel();
  const [step, setStep] = useState<Step>('intro');
  const [password, setPassword] = useState('');
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setStep('intro');
      setPassword('');
      setFirst('');
      setSecond('');
      setError(null);
      d.showModal();
    } else if (!open && d.open) d.close();
  }, [open]);

  const record = async (which: 'first' | 'second') => {
    setError(null);
    setListening(true);
    void mic.start();
    try {
      const { alternatives } = await speech.capture();
      const heard = alternatives[0] ?? '';
      if (!heard) setError('Astro didn’t hear anything. Try again.');
      else if (which === 'first') setFirst(heard);
      else setSecond(heard);
    } catch {
      setError('The microphone isn’t available. Allow it from the address bar and try again.');
    } finally {
      mic.stop();
      setListening(false);
    }
  };

  const save = async () => {
    if (simplify(first) !== simplify(second)) {
      setError('The two recordings didn’t match. Say the same phrase both times.');
      setSecond('');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await authApi.setVoicePassphrase(password, first, second);
      patchUser({ voiceEnabled: true });
      setStep('done');
    } catch (err) {
      const e = err as ApiError;
      setError(e.message);
      if (e.code === 'invalid_credentials') setStep('intro');
      else {
        setFirst('');
        setSecond('');
        setStep('first');
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await authApi.removeVoicePassphrase(password);
      patchUser({ voiceEnabled: false });
      onClose();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  const orbMode = listening ? 'listening' : busy ? 'verifying' : step === 'done' ? 'success' : 'idle';

  return (
    <dialog ref={ref} className={styles.dialog} onClose={onClose} aria-labelledby="voice-title">
      <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
        <X size={18} />
      </button>
      <div className={styles.orb}>{open && <BlackHoleOrb mode={orbMode} levelSource={mic.sample} />}</div>
      <h2 id="voice-title" className={styles.title}>
        {step === 'done' ? 'Voice sign-in is on' : step === 'remove' ? 'Turn off voice sign-in' : 'Voice sign-in'}
      </h2>

      {!speech.supported && step !== 'remove' ? (
        <p className={styles.text}>
          This browser can’t turn speech into text. Try Chrome or Edge to set up voice sign-in.
        </p>
      ) : step === 'intro' ? (
        <form
          className={styles.body}
          onSubmit={(e) => {
            e.preventDefault();
            if (password) setStep('first');
          }}
        >
          <p className={styles.text}>
            Pick a phrase of at least three words that only you know, like a password you say out loud. It’s a
            passphrase, not voice recognition: anyone who hears it could repeat it, so choose it privately.
          </p>
          <AuthField
            label="Your current password"
            icon={Lock}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.actions}>
            {enabled && (
              <button type="button" className={styles.ghost} onClick={() => setStep('remove')}>
                Turn off
              </button>
            )}
            <button type="submit" className={styles.primary} disabled={!password}>
              {enabled ? 'Change phrase' : 'Continue'}
            </button>
          </div>
        </form>
      ) : step === 'first' || step === 'second' ? (
        <div className={styles.body}>
          <p className={styles.text}>
            {!first ? 'Say your phrase.' : !second ? 'Now say it once more, the same way.' : 'Both recordings are in.'}
          </p>
          {first && (
            <p className={styles.heard}>
              Heard: <q>{first}</q>
            </p>
          )}
          {second && (
            <p className={styles.heard}>
              Again: <q>{second}</q>
            </p>
          )}
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.actions}>
            {first && (
              <button
                type="button"
                className={styles.ghost}
                onClick={() => {
                  setFirst('');
                  setSecond('');
                  setError(null);
                }}
              >
                Start over
              </button>
            )}
            {!second ? (
              <button
                type="button"
                className={styles.primary}
                onClick={() => record(first ? 'second' : 'first')}
                disabled={listening}
              >
                <Mic size={16} aria-hidden="true" />
                {listening ? 'Listening…' : first ? 'Say it again' : 'Record phrase'}
              </button>
            ) : (
              <button type="button" className={styles.primary} onClick={save} disabled={busy}>
                {busy ? 'Saving…' : 'Save passphrase'}
              </button>
            )}
          </div>
        </div>
      ) : step === 'done' ? (
        <div className={styles.body}>
          <p className={styles.text}>
            Next time, open Astro and speak your phrase. We emailed you a note in case this wasn’t you. Changing your
            password turns voice sign-in off.
          </p>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      ) : (
        <form className={styles.body} onSubmit={remove}>
          <p className={styles.text}>You’ll sign in with your password only.</p>
          <AuthField
            label="Your current password"
            icon={Lock}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.actions}>
            <button type="button" className={styles.ghost} onClick={() => setStep('intro')}>
              Back
            </button>
            <button type="submit" className={styles.danger} disabled={!password || busy}>
              Turn off voice sign-in
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}
