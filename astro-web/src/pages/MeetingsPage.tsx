import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarCheck, Info, Link as LinkIcon } from 'lucide-react';
import { fetchMeetings, parseMeetingLink, platformName, sendAstroToMeeting, setAstroInvited, updateMeetingSettings } from '../api/meetings';
import { AstroMark } from '../components/AstroMark';
import { Switch } from '../components/Switch/Switch';
import { useSession } from '../auth/AuthProvider';
import { meetingSettings as initialSettings, recentRecaps } from '../data/meetings';
import type { Meeting, MeetingSetting } from '../types/astro';
import styles from './MeetingsPage.module.scss';

function inviteNote(m: Meeting, companyName: string): string {
  if (m.status === 'live') {
    return m.guests
      ? `Astro joined at ${m.joinedAt}. Guests are here, so it only answers you privately.`
      : `Astro joined at ${m.joinedAt}. It can speak because everyone here is from ${companyName}.`;
  }
  if (!m.astroInvited) return m.hasBrief ? "Astro isn't invited. You still have the call brief." : "Astro isn't invited to this one.";
  if (m.guests) return `Guests from ${m.guestDomain} are invited, so Astro only takes notes and answers you privately.`;
  return 'Astro will join, take notes and answer when asked.';
}

function who(m: Meeting, companyName: string): string {
  if (!m.guests) return m.attendees === 2 ? '2 people' : `${m.attendees} people, all from ${companyName}`;
  return `${m.attendees - m.guests} from ${companyName}, ${m.guests} guests from ${m.guestDomain}`;
}

export function MeetingsPage() {
  const { company } = useSession();
  const [list, setList] = useState<Meeting[]>([]);
  const [settings, setSettings] = useState<MeetingSetting[]>(initialSettings);
  const [link, setLink] = useState('');
  const [joinState, setJoinState] = useState<{ kind: 'idle' | 'error' | 'joining' | 'joined'; text?: string }>({ kind: 'idle' });
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    fetchMeetings(company.id).then(setList).catch(() => setList([]));
  }, []);

  const onSend = async (e: FormEvent) => {
    e.preventDefault();
    const platform = parseMeetingLink(link);
    if (!link.trim()) return setJoinState({ kind: 'error', text: 'Paste a meeting link first.' });
    if (!platform) return setJoinState({ kind: 'error', text: "That doesn't look like a Google Meet, Zoom or Teams link." });
    setJoinState({ kind: 'joining', text: `Astro is joining your ${platformName[platform]} call…` });
    try {
      await sendAstroToMeeting(company.id, link.trim());
      setJoinState({ kind: 'joined', text: `Astro is in the waiting room. Admit “Astro (${company.name})” and it will introduce itself.` });
      setLink('');
    } catch {
      setJoinState({ kind: 'error', text: "Astro couldn't join. Check the link, or that the meeting allows guests." });
    }
  };

  const toggleInvite = (m: Meeting, next: boolean) => {
    setList((ms) => ms.map((x) => (x.id === m.id ? { ...x, astroInvited: next } : x)));
    setAstroInvited(company.id, m.id, next).catch(() => {
      setList((ms) => ms.map((x) => (x.id === m.id ? { ...x, astroInvited: !next } : x)));
      setSaveError("Couldn't update that invite. Try again.");
    });
  };

  const toggleSetting = (id: MeetingSetting['id'], next: boolean) => {
    const updated = settings.map((s) => (s.id === id ? { ...s, enabled: next } : s));
    setSettings(updated);
    updateMeetingSettings(company.id, updated)
      .then(() => setSaveError(null))
      .catch(() => setSaveError("Couldn't save that setting. Try again."));
  };

  const days = Array.from(new Set(list.map((m) => m.day)));

  return (
    <div className={styles.page}>
      <div className={styles.main}>
        <header className={styles.header}>
          <div>
            <h1>Meetings</h1>
            <p>Astro joins your calls, takes notes and answers when someone asks it something.</p>
          </div>
          <span className={styles.connected}>
            <CalendarCheck size={15} aria-hidden="true" />
            Google Calendar connected
          </span>
        </header>

        <div className={styles.body}>
          <form className={styles.joinCard} onSubmit={onSend} aria-labelledby="join-h">
            <h2 id="join-h">Send Astro to a meeting now</h2>
            <div className={styles.joinRow}>
              <label className={styles.field}>
                <LinkIcon size={18} aria-hidden="true" />
                <span className="visually-hidden">Meeting link</span>
                <input
                  value={link}
                  onChange={(e) => {
                    setLink(e.target.value);
                    if (joinState.kind === 'error') setJoinState({ kind: 'idle' });
                  }}
                  placeholder="Paste a Google Meet, Zoom or Teams link"
                  autoComplete="off"
                />
              </label>
              <button type="submit" className={styles.primary} disabled={joinState.kind === 'joining'}>
                Send Astro
              </button>
            </div>
            <p className={`${styles.hint} ${joinState.kind === 'error' ? styles.error : ''}`} aria-live="polite">
              {joinState.kind === 'joining' && <span className={styles.pulse} aria-hidden="true" />}
              {joinState.text ?? `Astro joins as a participant named “Astro (${company.name})” and says hello, so everyone knows it's there.`}
            </p>
          </form>

          {days.map((day) => (
            <section key={day} className={styles.day} aria-label={day}>
              <h2 className={styles.dayTitle}>{day}</h2>
              <ul className={styles.list}>
                {list
                  .filter((m) => m.day === day)
                  .map((m) => (
                    <li key={m.id} className={`${styles.row} ${m.status === 'live' ? styles.liveRow : ''}`}>
                      <div className={styles.time}>
                        <span>{m.start}</span>
                        <span className={styles.caption}>to {m.end}</span>
                      </div>
                      <div className={styles.info}>
                        <div className={styles.titleRow}>
                          <h3>{m.title}</h3>
                          {m.status === 'live' && (
                            <span className={styles.liveChip}>
                              <span className={styles.liveDot} aria-hidden="true" />
                              Live
                            </span>
                          )}
                        </div>
                        <span className={styles.caption}>
                          {platformName[m.platform]} · {who(m, company.name)}
                        </span>
                        <span className={styles.note}>
                          <AstroMark size={16} />
                          {inviteNote(m, company.name)}
                        </span>
                      </div>
                      {m.status === 'live' ? (
                        <Link to={`/meetings/${m.id}/live`} className={styles.primaryLink}>
                          Open live view
                          <ArrowRight size={16} aria-hidden="true" />
                        </Link>
                      ) : (
                        <div className={styles.rowActions}>
                          {m.hasBrief && (
                            <Link to="/briefs" className={styles.secondary}>
                              Call brief
                            </Link>
                          )}
                          <span className={styles.switchLabel} aria-hidden="true">
                            Astro joins
                          </span>
                          <Switch checked={m.astroInvited} onChange={(next) => toggleInvite(m, next)} label={`Astro joins ${m.title}`} />
                        </div>
                      )}
                    </li>
                  ))}
              </ul>
            </section>
          ))}
          {saveError && (
            <p className={styles.error} role="alert">
              {saveError}
            </p>
          )}
        </div>
      </div>

      <aside className={styles.aside} aria-label="How Astro behaves in calls">
        <div>
          <h2>In calls, Astro can</h2>
          <p className={styles.caption}>Applies to every meeting you send it to.</p>
        </div>
        <ul className={styles.settings}>
          {settings.map((s) => (
            <li key={s.id}>
              <span>
                <span className={styles.settingLabel}>{s.label}</span>
                <span className={styles.caption}>{s.detail}</span>
              </span>
              <Switch checked={s.enabled} onChange={(next) => toggleSetting(s.id, next)} label={s.label} />
            </li>
          ))}
        </ul>
        <p className={styles.infoBox}>
          <Info size={16} aria-hidden="true" />
          <span>
            Astro introduces itself when it joins and shows up as “Astro ({company.name})”. Anyone in the call can say “Astro, leave the call” and it
            will.
          </span>
        </p>
        <div>
          <h3 className={styles.asideTitle}>Recent recaps</h3>
          <ul className={styles.recaps}>
            {recentRecaps.map((r) => (
              <li key={r.meetingId}>
                <Link to={`/meetings/${r.meetingId}/recap`}>{r.title}</Link>
                <span className={styles.caption}>{r.when}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
