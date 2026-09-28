import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Check,
  Code,
  Database,
  File,
  Folder,
  GitBranch,
  Globe,
  Hash,
  HeartPulse,
  Landmark,
  ListChecks,
  ShoppingBag,
  Terminal,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import { useSession } from '../auth/AuthProvider';
import { connectors, domainPresets, type ConnectorId } from '../data/mock';
import type { CompanyDomain } from '../types/astro';
import styles from './SetupPage.module.scss';

const domainIcons: Record<CompanyDomain, LucideIcon> = {
  tech: Code,
  finance: Landmark,
  health: HeartPulse,
  retail: ShoppingBag,
};

const connectorIcons: Record<ConnectorId, LucideIcon> = {
  files: Upload,
  web: Globe,
  github: GitBranch,
  pg: Database,
  api: Terminal,
  slack: Hash,
  jira: ListChecks,
  drive: Folder,
  notion: File,
};

const steps = ['Company', 'Domain', 'Connect knowledge', 'Roles and access', 'Go live'];
const indexing = [
  { name: 'Product handbook', label: '38 of 38 files', pct: 100, done: true },
  { name: 'Architecture decisions', label: '12 of 20 files', pct: 60 },
  { name: 'kestrel/order-service', label: 'Reading commits', pct: 25 },
  { name: 'kestrel.io', label: '64 pages queued', pct: 0 },
];

export function SetupPage() {
  const { company } = useSession();
  const [step, setStep] = useState(2);
  const [domain, setDomain] = useState<CompanyDomain>('tech');
  const [connected, setConnected] = useState<Partial<Record<ConnectorId, boolean>>>({ files: true, web: true, github: true });
  const preset = domainPresets.find((d) => d.id === domain) ?? domainPresets[0];
  const connectedCount = Object.values(connected).filter(Boolean).length;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Set up Astro for {company.name}</h1>
          <p>Astro only learns from what you connect. You can change any of this later.</p>
        </div>
        <ol className={styles.steps} aria-label="Setup steps">
          {steps.map((label, i) => {
            const n = i + 1;
            const done = n < step;
            const current = n === step;
            const clickable = n === 2 || n === 3;
            return (
              <li key={label}>
                {i > 0 && <span className={styles.stepLine} aria-hidden="true" />}
                <button
                  type="button"
                  className={`${styles.step} ${current ? styles.stepCurrent : ''} ${n > step ? styles.stepUpcoming : ''}`}
                  aria-current={current ? 'step' : undefined}
                  disabled={!clickable}
                  onClick={() => setStep(n)}
                >
                  <span className={`${styles.dot} ${done ? styles.dotDone : ''} ${current ? styles.dotCurrent : ''}`}>
                    {done ? <Check size={14} strokeWidth={2.6} aria-hidden="true" /> : n}
                  </span>
                  {label}
                </button>
              </li>
            );
          })}
        </ol>
      </header>

      <div className={styles.body}>
        {step === 2 ? (
          <div className={styles.split}>
            <div className={styles.primary}>
              <div className={styles.intro}>
                <h2>What does {company.name} do?</h2>
                <p>Astro uses this to choose its starting agents and the sources worth connecting first.</p>
              </div>
              <div role="group" aria-label="Company domain" className={styles.domains}>
                {domainPresets.map((d) => {
                  const Icon = domainIcons[d.id];
                  return (
                    <button key={d.id} type="button" className={styles.domain} aria-pressed={d.id === domain} onClick={() => setDomain(d.id)}>
                      <Icon size={22} aria-hidden="true" />
                      <span className={styles.domainTitle}>{d.title}</span>
                      <span className={styles.domainDesc}>{d.description}</span>
                    </button>
                  );
                })}
              </div>
              <button type="button" className={styles.textLink}>
                Something else? Describe it in your own words
              </button>
            </div>

            <aside className={styles.panel} aria-label="What Astro will start with">
              <div>
                <h3 className={styles.panelTitle}>Astro will start with</h3>
                <p className={styles.caption}>For {preset.title.toLowerCase()}</p>
              </div>
              <div className={styles.group}>
                <h4>Agents</h4>
                <ul className={styles.chips}>
                  {preset.agents.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
              <div className={styles.group}>
                <h4>Connect these first</h4>
                <ul className={styles.sourceList}>
                  {preset.sources.map((s) => (
                    <li key={s}>
                      <span aria-hidden="true" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
              <div className={styles.group}>
                <h4>Your team could ask</h4>
                <ul className={styles.questions}>
                  {preset.questions.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              </div>
            </aside>
          </div>
        ) : (
          <div className={styles.split}>
            <div className={styles.primary}>
              <div className={styles.intro}>
                <h2>Connect your knowledge</h2>
                <p>Start with a few sources. Astro reads them for {company.name} only.</p>
              </div>
              <div className={styles.connectors}>
                {connectors.map((c) => {
                  const Icon = connectorIcons[c.id];
                  const on = !c.later && Boolean(connected[c.id]);
                  return (
                    <div key={c.id} className={`${styles.connector} ${c.later ? styles.later : ''}`}>
                      <div className={styles.connectorHead}>
                        <span className={styles.connectorIcon}>
                          <Icon size={18} aria-hidden="true" />
                        </span>
                        <span>
                          <span className={styles.connectorName}>{c.name}</span>
                          <span className={styles.caption}>{c.description}</span>
                        </span>
                      </div>
                      <button
                        type="button"
                        className={`${styles.connectBtn} ${on ? styles.connectOn : ''}`}
                        disabled={c.later}
                        aria-pressed={c.later ? undefined : on}
                        onClick={() => setConnected((prev) => ({ ...prev, [c.id]: !prev[c.id] }))}
                      >
                        {c.later ? 'Coming later' : on ? 'Connected' : 'Connect'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <aside className={styles.panel} aria-label="Indexing progress">
              <div>
                <h3 className={styles.panelTitle}>Reading your sources</h3>
                <p className={styles.caption}>{connectedCount} sources connected</p>
              </div>
              {indexing.map((item) => (
                <div key={item.name} className={styles.progress}>
                  <div className={styles.progressHead}>
                    <span>{item.name}</span>
                    <span className={item.done ? styles.okText : styles.caption}>{item.label}</span>
                  </div>
                  <div
                    className={styles.track}
                    role="progressbar"
                    aria-label={item.name}
                    aria-valuenow={item.pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div className={item.done ? `${styles.fill} ${styles.fillDone}` : styles.fill} style={{ width: `${item.pct}%` }} />
                  </div>
                </div>
              ))}
              <p className={styles.note}>
                Each file is split into passages and stored with {company.name} as its owner, so no other company's Astro can ever search it.
              </p>
            </aside>
          </div>
        )}
      </div>

      <footer className={styles.footer}>
        {step === 2 ? (
          <>
            <span className={styles.caption}>Step 2 of 5</span>
            <button type="button" className={styles.cta} onClick={() => setStep(3)}>
              Continue to connect knowledge
            </button>
          </>
        ) : (
          <>
            <button type="button" className={styles.back} onClick={() => setStep(2)}>
              Back
            </button>
            <Link to="/knowledge" className={styles.cta}>
              Continue to roles and access
            </Link>
          </>
        )}
      </footer>
    </div>
  );
}
