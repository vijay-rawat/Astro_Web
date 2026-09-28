import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Check, FileText, Share2 } from 'lucide-react';
import { approveAction, fetchRecap, platformName, postFollowUp } from '../api/meetings';
import { AstroMark } from '../components/AstroMark';
import type { MeetingRecap } from '../types/astro';
import styles from './MeetRecapPage.module.scss';

export function MeetRecapPage() {
  const { meetingId = '' } = useParams();
  const [recap, setRecap] = useState<MeetingRecap | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [posted, setPosted] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setRecap(null);
    setLoadError(false);
    fetchRecap(meetingId).then(setRecap).catch(() => setLoadError(true));
  }, [meetingId]);

  if (loadError) {
    return (
      <div className={styles.page}>
        <div className={styles.empty}>
          <h1>This recap isn't available</h1>
          <p>It may still be writing, or you weren't invited to the meeting.</p>
          <Link to="/meetings">Back to meetings</Link>
        </div>
      </div>
    );
  }
  if (!recap) return <div className={styles.page} aria-busy="true" />;

  const approve = async (id: string) => {
    setBusy((b) => ({ ...b, [id]: true }));
    try {
      await approveAction(recap.meetingId, id);
      setRecap((r) => r && { ...r, actionItems: r.actionItems.map((a) => (a.id === id ? { ...a, status: 'approved' } : a)) });
      setActionError(null);
    } catch {
      setActionError("Couldn't send that to Jira. Try again.");
    } finally {
      setBusy((b) => ({ ...b, [id]: false }));
    }
  };

  const pending = recap.actionItems.filter((a) => a.status === 'pending');
  const approveAll = () => pending.forEach((a) => approve(a.id));

  const post = async () => {
    try {
      await postFollowUp(recap.meetingId, recap.followUp.channel, recap.followUp.lines.join('\n'));
      setPosted(true);
    } catch {
      setActionError("Couldn't post to Slack. Try again.");
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <nav aria-label="Breadcrumb" className={styles.crumbs}>
            <Link to="/meetings">Meetings</Link>
            <span aria-hidden="true">/</span>
            <span>Recap</span>
          </nav>
          <h1>{recap.title} recap</h1>
          <p>
            {recap.when} · {platformName[recap.platform]} · {recap.attendees.length + 1} attendees · Written by Astro from the transcript
          </p>
        </div>
        <div className={styles.actions}>
          <Link to={`/meetings/${recap.meetingId}/live`} className={styles.secondary}>
            <FileText size={16} aria-hidden="true" />
            Open transcript
          </Link>
          <button type="button" className={styles.dark}>
            <Share2 size={16} aria-hidden="true" />
            Share recap
          </button>
        </div>
      </header>

      <div className={styles.body}>
        <div className={styles.mainCol}>
          <section className={styles.card} aria-labelledby="sum-h">
            <h2 id="sum-h">Summary</h2>
            <p className={styles.summary}>{recap.summary}</p>
          </section>

          <div className={styles.twoCol}>
            <section className={styles.card} aria-labelledby="dec-h">
              <h2 id="dec-h">Decisions</h2>
              <ul className={styles.stack}>
                {recap.decisions.map((d) => (
                  <li key={d.id} className={styles.decision}>
                    <strong>{d.text}</strong>
                    {d.detail && <span>{d.detail}</span>}
                    <span className={styles.caption}>
                      {d.by}, {d.time}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
            <section className={styles.card} aria-labelledby="ans-h">
              <h2 id="ans-h">Astro answered in the call</h2>
              <ul className={styles.stack}>
                {recap.answers.map((a) => (
                  <li key={a.id} className={styles.decision}>
                    <span className={styles.caption}>
                      {a.askedBy} asked at {a.time}
                    </span>
                    <span>{a.answer}</span>
                    <span className={styles.sourceLine}>{a.sources.join(' · ')}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section className={styles.card} aria-labelledby="act-h">
            <div className={styles.cardHead}>
              <div>
                <h2 id="act-h">Action items</h2>
                <p className={styles.caption}>Nothing goes to Jira until you approve it.</p>
              </div>
              <button type="button" className={styles.secondaryBtn} onClick={approveAll} disabled={!pending.length}>
                {pending.length ? 'Approve all' : 'All approved'}
              </button>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Task</th>
                    <th scope="col">Owner</th>
                    <th scope="col">Due</th>
                    <th scope="col">Goes to</th>
                    <th scope="col">
                      <span className="visually-hidden">Approve</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recap.actionItems.map((a) => (
                    <tr key={a.id}>
                      <td className={styles.task}>{a.task}</td>
                      <td>{a.owner}</td>
                      <td>{a.due}</td>
                      <td className={styles.caption}>{a.destination}</td>
                      <td className={styles.approveCell}>
                        {a.status === 'approved' ? (
                          <span className={styles.done}>
                            <Check size={15} aria-hidden="true" />
                            {a.doneLabel}
                          </span>
                        ) : (
                          <button type="button" className={styles.approve} onClick={() => approve(a.id)} disabled={busy[a.id]} aria-label={`${a.actionLabel}: ${a.task}`}>
                            {busy[a.id] ? 'Sending…' : a.actionLabel}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {actionError && (
              <p className={styles.error} role="alert">
                {actionError}
              </p>
            )}
          </section>

          <section className={styles.card} aria-labelledby="fu-h">
            <h2 id="fu-h">Follow-up for {recap.followUp.channel}</h2>
            <div className={styles.message}>
              <strong>{recap.title}, Thursday</strong>
              {recap.followUp.lines.map((l) => (
                <p key={l}>{l}</p>
              ))}
            </div>
            <div className={styles.row}>
              {posted ? (
                <span className={styles.done}>
                  <Check size={15} aria-hidden="true" />
                  Posted to {recap.followUp.channel} in Slack
                </span>
              ) : (
                <>
                  <button type="button" className={styles.primary} onClick={post}>
                    Post to Slack
                  </button>
                  <button type="button" className={styles.secondaryBtn}>
                    Edit
                  </button>
                </>
              )}
            </div>
          </section>
        </div>

        <aside className={styles.aside} aria-label="About this meeting">
          <section>
            <h2>Attendees</h2>
            <ul className={styles.people}>
              {recap.attendees.map((p) => (
                <li key={p.name}>
                  <span className={styles.avatar}>{p.initials}</span>
                  <span>
                    <span className={styles.personName}>{p.name}</span>
                    <span className={styles.caption}>{p.role}</span>
                  </span>
                </li>
              ))}
              <li>
                <span className={`${styles.avatar} ${styles.astroAvatar}`}>
                  <AstroMark size={22} />
                </span>
                <span>
                  <span className={styles.personName}>Astro</span>
                  <span className={styles.caption}>Took notes, answered {recap.answers.length} questions</span>
                </span>
              </li>
            </ul>
          </section>
          <section className={styles.next}>
            <h2>What happens next</h2>
            <p>Open action items show up in next Thursday's engineering brief, so nothing gets lost.</p>
            <Link to="/briefs">Go to Briefs</Link>
          </section>
          <p className={styles.caption}>{recap.retention}</p>
        </aside>
      </div>
    </div>
  );
}
