import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Check, Clock, Plus, RefreshCw, Shield, type LucideIcon } from 'lucide-react';
import { fetchSources, updateRoleAccess } from '../api/client';
import { useSession } from '../auth/AuthProvider';
import { accessLog, dataDomains, roleAccess as initialAccess } from '../data/mock';
import type { DataDomain, KnowledgeSource, RoleAccess, SourceStatus } from '../types/astro';
import styles from './KnowledgePage.module.scss';

const statusIcon: Record<SourceStatus, LucideIcon> = {
  indexed: Check,
  syncing: RefreshCw,
  queued: Clock,
  attention: AlertTriangle,
};

export function KnowledgePage() {
  const { company } = useSession();
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [rules, setRules] = useState<RoleAccess[]>(initialAccess);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    fetchSources(company.id).then(setSources).catch(() => setSources([]));
  }, []);

  const toggle = (role: string, domain: DataDomain) => {
    const next = rules.map((r) => (r.role === role ? { ...r, access: { ...r.access, [domain]: !r.access[domain] } } : r));
    setRules(next);
    updateRoleAccess(company.id, next)
      .then(() => setSaveError(null))
      .catch(() => setSaveError("Couldn't save that change. Check your connection and try again."));
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Knowledge and access</h1>
          <p>Everything Astro can search for {company.name}, and who can see it.</p>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.secondary}>
            <RefreshCw size={16} aria-hidden="true" />
            Sync all
          </button>
          <Link to="/setup" className={styles.dark}>
            <Plus size={16} aria-hidden="true" />
            Add source
          </Link>
        </div>
      </header>

      <div className={styles.body}>
        <section className={styles.card} aria-label="Sources">
          <div className={styles.cardHead}>
            <h2>Sources</h2>
            <span className={styles.caption}>{sources.length} connected</span>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Source</th>
                  <th scope="col">Who can search it</th>
                  <th scope="col">Status</th>
                  <th scope="col">Last synced</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => {
                  const Icon = statusIcon[s.status];
                  return (
                    <tr key={s.id}>
                      <td>
                        <span className={styles.sourceName}>{s.name}</span>
                        <span className={styles.caption}>{s.detail}</span>
                      </td>
                      <td>{s.access}</td>
                      <td>
                        <span className={`${styles.status} ${styles[s.status]}`}>
                          <Icon size={13} strokeWidth={2.4} aria-hidden="true" />
                          {s.statusLabel}
                        </span>
                      </td>
                      <td className={styles.muted}>{s.lastSynced}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <div className={styles.side}>
          <section className={styles.card} aria-label="Access rules">
            <div className={styles.cardHeadStack}>
              <h2>Who can see what</h2>
              <span className={styles.caption}>Astro checks these rules before any agent searches.</span>
            </div>
            <div className={styles.matrix}>
              <div className={`${styles.matrixRow} ${styles.matrixHead}`}>
                <span>Role</span>
                {dataDomains.map((d) => (
                  <span key={d.id}>{d.label}</span>
                ))}
              </div>
              {rules.map((r) => (
                <div key={r.role} className={styles.matrixRow}>
                  <span className={styles.role}>{r.role}</span>
                  {dataDomains.map((d) => (
                    <label key={d.id} className={styles.cell}>
                      <input
                        type="checkbox"
                        checked={r.access[d.id]}
                        onChange={() => toggle(r.role, d.id)}
                        aria-label={`${r.role} can search ${d.label.toLowerCase()}`}
                      />
                    </label>
                  ))}
                </div>
              ))}
            </div>
            {saveError && (
              <p className={styles.error} role="alert">
                {saveError}
              </p>
            )}
            <p className={styles.note}>
              <Shield size={16} aria-hidden="true" />
              <span>{company.name} data is kept separate from every other company on Astro.</span>
            </p>
          </section>

          <section className={styles.card} aria-label="Recent access checks">
            <div className={styles.cardHead}>
              <h2>Recent access checks</h2>
            </div>
            <ul className={styles.log}>
              {accessLog.map((entry) => (
                <li key={entry.id}>
                  <span className={entry.result === 'Allowed' ? styles.allowed : styles.blocked}>{entry.result}</span>
                  <span className={styles.logText}>{entry.text}</span>
                  <span className={styles.caption}>{entry.time}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
