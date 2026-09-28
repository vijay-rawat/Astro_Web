import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, MessageSquare, Mic, MicOff, PhoneOff } from 'lucide-react';
import { AstroMark } from '../components/AstroMark';
import { OrbitOrb, type OrbState } from '../components/OrbitOrb/OrbitOrb';
import { useSession } from '../auth/AuthProvider';
import { callBrief } from '../data/mock';
import { useAstroChat } from '../hooks/useAstroChat';
import { useVoice } from '../hooks/useVoice';
import { stripCitations } from '../lib/formatAnswer';
import styles from './CallPage.module.scss';

export function CallPage() {
  const { company } = useSession();
  const navigate = useNavigate();
  const { messages, isStreaming, send } = useAstroChat(company.id);
  const [muted, setMuted] = useState(false);
  const [typed, setTyped] = useState('');
  const [seconds, setSeconds] = useState(0);
  const spokenRef = useRef<string | null>(null);

  const voice = useVoice({ onFinal: (text) => send(text, 'auto') });
  const { start, stop, speak, silence } = voice;

  // Microphone follows the mute toggle.
  useEffect(() => {
    if (!voice.supported) return;
    if (muted) stop();
    else start();
  }, [muted, voice.supported, start, stop]);

  // Speak each finished answer once.
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last?.role === 'assistant' && last.status === 'done' && spokenRef.current !== last.id) {
      spokenRef.current = last.id;
      speak(stripCitations(last.text));
    }
  }, [messages, speak]);

  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  const orbState: OrbState = muted
    ? 'muted'
    : voice.speaking
      ? 'speaking'
      : isStreaming
        ? 'thinking'
        : voice.listening
          ? 'listening'
          : 'idle';

  const status = voice.error
    ? voice.error
    : !voice.supported
      ? 'Voice needs Chrome or Edge. You can type below instead.'
      : muted
        ? 'Your microphone is off. Astro can still answer out loud.'
        : voice.speaking
          ? 'Astro is speaking'
          : isStreaming
            ? 'Astro is checking your company knowledge'
            : voice.listening
              ? 'Astro is listening'
              : 'Starting the microphone';

  const caption = voice.interim
    ? voice.interim
    : lastAssistant?.text
      ? stripCitations(lastAssistant.text)
      : 'Try asking for a 30-second summary of a customer account.';

  const endCall = () => {
    stop();
    silence();
    navigate('/');
  };

  const submitTyped = () => {
    if (!typed.trim()) return;
    send(typed, 'auto');
    setTyped('');
  };

  const clock = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <Link to="/" className={styles.back}>
          <ChevronLeft size={18} aria-hidden="true" />
          Back to chat
        </Link>
        <div className={styles.live}>
          <AstroMark size={24} tone="dark" />
          <span className={styles.liveTitle}>Live with Astro</span>
          <span className={styles.muted}>{clock}</span>
        </div>
        <span className={styles.muted}>{company.name}</span>
      </header>

      <div className={styles.body}>
        <section className={styles.stage} aria-label="Call">
          <OrbitOrb state={orbState} />

          <div className={styles.captionWrap}>
            <p className={styles.status}>
              <span className={styles.dot} aria-hidden="true" />
              {status}
            </p>
            <p className={styles.caption} aria-live="polite">
              {caption}
            </p>
          </div>

          <div className={styles.controls}>
            <div className={styles.control}>
              <button
                type="button"
                className={muted ? `${styles.round} ${styles.roundOn}` : styles.round}
                aria-pressed={muted}
                aria-label={muted ? 'Unmute' : 'Mute'}
                onClick={() => setMuted((m) => !m)}
              >
                {muted ? <MicOff size={22} aria-hidden="true" /> : <Mic size={22} aria-hidden="true" />}
              </button>
              <span aria-hidden="true">{muted ? 'Unmute' : 'Mute'}</span>
            </div>
            <div className={styles.control}>
              <Link to="/" className={styles.round} aria-label="Switch to text chat">
                <MessageSquare size={22} aria-hidden="true" />
              </Link>
              <span aria-hidden="true">Switch to text</span>
            </div>
            <div className={styles.control}>
              <button type="button" className={`${styles.round} ${styles.end}`} aria-label="End call" onClick={endCall}>
                <PhoneOff size={22} aria-hidden="true" />
              </button>
              <span aria-hidden="true">End call</span>
            </div>
          </div>

          <form
            className={styles.typeBox}
            onSubmit={(e) => {
              e.preventDefault();
              submitTyped();
            }}
          >
            <label htmlFor="call-type" className="visually-hidden">
              Type a question
            </label>
            <input id="call-type" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Or type a question" />
            <button type="submit" disabled={!typed.trim() || isStreaming}>
              Ask
            </button>
          </form>
        </section>

        <aside className={styles.brief} aria-label="Call brief">
          <div>
            <h2>Call brief</h2>
            <p className={styles.muted}>
              {callBrief.title}, {callBrief.when.toLowerCase()}
            </p>
          </div>

          <div className={styles.briefBlock}>
            <h3>Account</h3>
            <p>{callBrief.account}</p>
          </div>
          <div className={styles.briefBlock}>
            <h3>Open issues</h3>
            <ul>
              {callBrief.openIssues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
          <div className={styles.caution}>
            <h3>Before you promise anything</h3>
            <p>{callBrief.caution}</p>
          </div>

          <div className={styles.briefBlock}>
            <h3 className={styles.muted}>Built from</h3>
            <div className={styles.chips}>
              {callBrief.builtFrom.map((s) => (
                <span key={s}>{s}</span>
              ))}
            </div>
          </div>

          <div className={styles.divider} />

          <div className={styles.transcript}>
            <h3 className={styles.muted}>Transcript</h3>
            {messages.length === 0 && <p className={styles.muted}>What you and Astro say shows up here.</p>}
            {messages.map((m) => (
              <div key={m.id} className={styles.turn}>
                <span className={m.role === 'assistant' ? styles.astro : styles.you}>{m.role === 'assistant' ? 'Astro' : 'You'}</span>
                <p>{m.role === 'assistant' ? stripCitations(m.text) || '…' : m.text}</p>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
