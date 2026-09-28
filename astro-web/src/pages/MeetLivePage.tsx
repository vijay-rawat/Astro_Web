import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileText, Lock, MicOff, Send } from 'lucide-react';
import { askPrivately, removeAstro, setLiveOptions } from '../api/meetings';
import { AstroMark } from '../components/AstroMark';
import { Switch } from '../components/Switch/Switch';
import { agendaLeft, liveSnapshot, participants, privateStarter } from '../data/meetings';
import { useElapsed, useMeetingLive } from '../hooks/useMeetingLive';
import type { PrivateExchange } from '../types/astro';
import styles from './MeetLivePage.module.scss';

type Tab = 'notes' | 'transcript' | 'private';

const tabs: { id: Tab; label: string }[] = [
  { id: 'notes', label: 'Live notes' },
  { id: 'transcript', label: 'Transcript' },
  { id: 'private', label: 'Ask privately' },
];

export function MeetLivePage() {
  const { meetingId = liveSnapshot.meetingId } = useParams();
  const navigate = useNavigate();
  const live = useMeetingLive(meetingId);
  const elapsed = useElapsed(liveSnapshot.elapsedSeconds);

  const [tab, setTab] = useState<Tab>('notes');
  const [speak, setSpeak] = useState(true);
  const [notes, setNotes] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const [priv, setPriv] = useState<PrivateExchange[]>([privateStarter]);
  const [draft, setDraft] = useState('');
  const transcriptEnd = useRef<HTMLLIElement>(null);

  const latest = live.answers[live.answers.length - 1];
  const astroSpeaking = live.speakingId === 'astro';

  useEffect(() => {
    if (tab === 'transcript') transcriptEnd.current?.scrollIntoView({ block: 'end' });
  }, [live.transcript.length, tab]);

  const changeOption = (key: 'speak' | 'notes', next: boolean) => {
    (key === 'speak' ? setSpeak : setNotes)(next);
    setLiveOptions(meetingId, { [key]: next }).catch(() => (key === 'speak' ? setSpeak : setNotes)(!next));
  };

  const leave = async () => {
    setLeaving(true);
    try {
      await removeAstro(meetingId);
      navigate(`/meetings/${meetingId}/recap`);
    } catch {
      setLeaving(false);
    }
  };

  const ask = async (e: FormEvent) => {
    e.preventDefault();
    const question = draft.trim();
    if (!question) return;
    const id = `p${Date.now()}`;
    setDraft('');
    setPriv((p) => [...p, { id, question, answer: '', status: 'pending' }]);
    try {
      const res = await askPrivately(meetingId, question);
      setPriv((p) => p.map((x) => (x.id === id ? { ...x, ...res, status: 'done' } : x)));
    } catch {
      setPriv((p) => p.map((x) => (x.id === id ? { ...x, answer: "Astro couldn't answer that. Try again.", status: 'error' } : x)));
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <Link to="/meetings" className={styles.back}>
          <ArrowLeft size={18} aria-hidden="true" />
          Back to meetings
        </Link>
        <div className={styles.titleWrap}>
          <h1>Engineering meeting</h1>
          <span className={styles.muted}>Google Meet</span>
          <span className={styles.liveChip}>
            <span className={styles.liveDot} aria-hidden="true" />
            Live · <span className={styles.timer}>{elapsed}</span>
          </span>
        </div>
        <button type="button" className={styles.leave} onClick={leave} disabled={leaving}>
          {leaving ? 'Writing recap…' : 'Remove Astro and write recap'}
        </button>
      </header>

      <div className={styles.body}>
        <section className={styles.stage} aria-label="Call">
          <ul className={styles.tiles}>
            {participants.map((p) => {
              const speaking = live.speakingId === p.id;
              return (
                <li key={p.id} className={`${styles.tile} ${p.isAstro ? styles.astroTile : ''} ${speaking ? styles.speaking : ''}`}>
                  {p.isAstro ? (
                    <span className={styles.astroAvatar}>
                      <AstroMark size={44} />
                    </span>
                  ) : (
                    <span className={styles.avatar}>{p.initials}</span>
                  )}
                  <span className={styles.tileName}>
                    {p.name}
                    {p.isAstro && <span className={styles.aiTag}>{astroSpeaking ? 'Speaking' : 'AI'}</span>}
                    {p.muted && (
                      <>
                        <MicOff size={14} aria-hidden="true" />
                        <span className="visually-hidden">, muted</span>
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>

          {latest && (
            <div className={styles.captionCard} aria-live="polite">
              <p className={styles.asked}>
                <strong>{latest.askedBy}</strong> asked at {latest.time}: “{latest.question}”
              </p>
              <p className={styles.voiceStatus}>
                {astroSpeaking ? (
                  <span className={styles.wave} aria-hidden="true">
                    <i />
                    <i />
                    <i />
                    <i />
                  </span>
                ) : null}
                {astroSpeaking ? 'Astro is answering out loud' : speak ? 'Astro answered out loud' : 'Astro answered in the meeting chat'}
              </p>
              <p className={styles.caption}>“{latest.answer}”</p>
              <ul className={styles.sources}>
                {latest.sources.map((s) => (
                  <li key={s}>
                    <FileText size={14} aria-hidden="true" />
                    {s}
                  </li>
                ))}
              </ul>
              <p className={styles.mutedSmall}>Posted in the meeting chat with links</p>
            </div>
          )}

          <div className={styles.controls}>
            <p className={styles.mutedSmall}>Say “Astro” and a question. It stays quiet otherwise.</p>
            <div className={styles.toggles}>
              <span className={styles.toggle}>
                Astro speaks out loud
                <Switch tone="night" checked={speak} onChange={(n) => changeOption('speak', n)} label="Astro speaks out loud" />
              </span>
              <span className={styles.toggle}>
                Take notes
                <Switch tone="night" checked={notes} onChange={(n) => changeOption('notes', n)} label="Take notes" />
              </span>
            </div>
          </div>
        </section>

        <aside className={styles.panel} aria-label="Astro's notes">
          <div className={styles.tabs} role="tablist" aria-label="Astro's notes">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls={`panel-${t.id}`}
                className={tab === t.id ? styles.tabOn : styles.tab}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className={styles.panelBody} role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
            {tab === 'notes' && (
              <>
                <p className={styles.mutedSmall}>{notes ? 'Taking notes. Only what people said, with the time.' : 'Notes are paused.'}</p>
                <NotesGroup title="Decisions" count={live.decisions.length}>
                  {live.decisions.map((d) => (
                    <li key={d.id} className={styles.noteCard}>
                      <span>{d.text}</span>
                      <span className={styles.mutedSmall}>
                        {d.by.split(' ')[0]}, {d.time}
                      </span>
                    </li>
                  ))}
                </NotesGroup>
                <NotesGroup title="Action items" count={live.actions.length}>
                  {live.actions.map((a) => (
                    <li key={a.id} className={styles.noteCard}>
                      <span>
                        <strong>{a.owner.split(' ')[0]}</strong> {a.task.charAt(0).toLowerCase() + a.task.slice(1)}
                      </span>
                      <span className={styles.mutedSmall}>Due {a.due.toLowerCase()}</span>
                    </li>
                  ))}
                </NotesGroup>
                <NotesGroup title="Astro answered" count={live.answers.length}>
                  {live.answers.map((a) => (
                    <li key={a.id} className={styles.noteCard}>
                      <span className={styles.mutedSmall}>
                        {a.askedBy}, {a.time}
                      </span>
                      <span>{a.answer}</span>
                      <span className={styles.mutedSmall}>{a.sources.join(' · ')}</span>
                    </li>
                  ))}
                </NotesGroup>
                <div className={styles.agenda}>
                  <h3>Still on the agenda</h3>
                  <p>{agendaLeft}</p>
                  <Link to="/briefs">Open the brief</Link>
                </div>
              </>
            )}

            {tab === 'transcript' && (
              <ol className={styles.transcript}>
                {live.transcript.map((l, i) => (
                  <li key={l.id} ref={i === live.transcript.length - 1 ? transcriptEnd : undefined}>
                    <span className={styles.lineHead}>
                      <span className={l.speakerId === 'astro' ? styles.astroName : styles.speakerName}>{l.speaker}</span>
                      <span className={styles.mutedSmall}>{l.time}</span>
                    </span>
                    <span>{l.text}</span>
                  </li>
                ))}
              </ol>
            )}

            {tab === 'private' && (
              <div className={styles.private}>
                <p className={styles.privateNote}>
                  <Lock size={15} aria-hidden="true" />
                  Only you see this. Astro won't say it out loud or post it in the meeting chat.
                </p>
                <ul className={styles.thread} aria-live="polite">
                  {priv.map((p) => (
                    <li key={p.id}>
                      <p className={styles.question}>{p.question}</p>
                      <div className={styles.answer}>
                        <span className={styles.mutedSmall}>Astro, only to you</span>
                        <p>{p.status === 'pending' ? 'Looking that up…' : p.answer}</p>
                        {p.source && <span className={styles.mutedSmall}>{p.source}</span>}
                      </div>
                    </li>
                  ))}
                </ul>
                <form className={styles.askForm} onSubmit={ask}>
                  <label className="visually-hidden" htmlFor="ask-private">
                    Ask Astro privately
                  </label>
                  <input id="ask-private" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask Astro privately" autoComplete="off" />
                  <button type="submit" aria-label="Send privately" disabled={!draft.trim()}>
                    <Send size={16} aria-hidden="true" />
                  </button>
                </form>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function NotesGroup({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section className={styles.group}>
      <h3>
        {title}
        <span className={styles.count}>{count}</span>
      </h3>
      <ul>{children}</ul>
    </section>
  );
}
