import { useState } from 'react';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  CheckSquare,
  Clock,
  GitPullRequest,
  Info,
  Plus,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react';
import { engineeringBrief, revenueBrief, scheduledBriefs, type BriefIcon } from '../data/mock';
import styles from './BriefsPage.module.scss';

const icons: Record<BriefIcon, LucideIcon> = {
  decide: CheckSquare,
  risk: Info,
  incident: AlertTriangle,
  blocked: Ban,
  review: GitPullRequest,
  shipped: CheckCircle2,
};

type Tab = 'eng' | 'rev';

export function BriefsPage() {
  const [tab, setTab] = useState<Tab>('eng');

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <header className={styles.header}>
          <div>
            <h1>Briefs</h1>
            <p>Astro prepares these from your connected tools. Check the evidence before you act on them.</p>
          </div>
          <div role="group" aria-label="Brief" className={styles.tabs}>
            <button type="button" aria-pressed={tab === 'eng'} onClick={() => setTab('eng')}>
              Engineering meeting
            </button>
            <button type="button" aria-pressed={tab === 'rev'} onClick={() => setTab('rev')}>
              Revenue review
            </button>
          </div>
        </header>

        <div className={styles.scroll}>{tab === 'eng' ? <EngineeringBrief /> : <RevenueBrief />}</div>
      </main>

      <aside className={styles.rail} aria-label="Scheduled briefs">
        <h2>Scheduled</h2>
        <ul className={styles.schedule}>
          {scheduledBriefs.map((b) => (
            <li key={b.id}>
              <Clock size={17} aria-hidden="true" />
              <span>
                <span className={styles.scheduleName}>{b.name}</span>
                <span className={styles.caption}>{b.when}</span>
              </span>
            </li>
          ))}
        </ul>
        <button type="button" className={styles.primary}>
          <Plus size={16} aria-hidden="true" />
          New brief
        </button>
        <div className={styles.oneOff}>
          <h3>Or ask for a one-off</h3>
          {['Prepare my 1:1 with Neha', "Summarize this week's incidents", 'What should we focus on next quarter?'].map((q) => (
            <button key={q} type="button">
              {q}
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
}

function EngineeringBrief() {
  return (
    <div className={styles.stack}>
      <div className={styles.briefHead}>
        <div>
          <h2>{engineeringBrief.title}</h2>
          <p className={styles.caption}>{engineeringBrief.prepared}</p>
        </div>
        <div className={styles.headActions}>
          <button type="button" className={styles.secondary}>
            <RefreshCw size={16} aria-hidden="true" />
            Regenerate
          </button>
          <button type="button" className={styles.dark}>
            Share brief
          </button>
        </div>
      </div>

      <div className={styles.grid}>
        {engineeringBrief.sections.map((section) => {
          const Icon = icons[section.icon];
          return (
            <section key={section.id} className={`${styles.section} ${styles[section.tone]}`}>
              <h3>
                <Icon size={17} aria-hidden="true" />
                {section.title}
                <span className={styles.count}>{section.items.length}</span>
              </h3>
              <ul>
                {section.items.map((item) => (
                  <li key={item.title}>
                    <span className={styles.itemTitle}>{item.title}</span>
                    <span className={styles.itemMeta}>{item.meta}</span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function RevenueBrief() {
  const max = 60;
  const chartH = 180;
  const top = 20;
  const y = (v: number) => top + chartH - (v / max) * chartH;
  const groupW = 120;
  const summary = revenueBrief.products.map((p) => `${p.name} went from ${p.q1} to ${p.q2}`).join(', ');

  return (
    <div className={styles.stack}>
      <div className={styles.briefHead}>
        <div>
          <h2>{revenueBrief.title}</h2>
          <p className={styles.caption}>{revenueBrief.subtitle}</p>
        </div>
        <button type="button" className={styles.secondary}>
          View queries
        </button>
      </div>

      <div className={styles.revRow}>
        <section className={`${styles.section} ${styles.chartCard}`}>
          <div className={styles.chartHead}>
            <h3>Revenue by product, {revenueBrief.unit}</h3>
            <div className={styles.legend}>
              <span>
                <i className={styles.q1} aria-hidden="true" />
                Q1
              </span>
              <span>
                <i className={styles.q2} aria-hidden="true" />
                Q2
              </span>
            </div>
          </div>
          <svg viewBox="0 0 420 236" className={styles.chart} role="img" aria-label={`${revenueBrief.unit}: ${summary}`}>
            {[0, 20, 40, 60].map((v) => (
              <g key={v}>
                <line x1="40" x2="410" y1={y(v)} y2={y(v)} className={v === 0 ? styles.axis : styles.gridLine} />
                <text x="32" y={y(v) + 4} textAnchor="end" className={styles.tick}>
                  {v}
                </text>
              </g>
            ))}
            {revenueBrief.products.map((p, i) => {
              const cx = 110 + i * groupW;
              return (
                <g key={p.name}>
                  <rect x={cx - 40} y={y(p.q1)} width="36" height={top + chartH - y(p.q1)} rx="3" className={styles.barQ1} />
                  <rect x={cx + 4} y={y(p.q2)} width="36" height={top + chartH - y(p.q2)} rx="3" className={styles.barQ2} />
                  <text x={cx - 22} y={y(p.q1) - 6} textAnchor="middle" className={styles.value}>
                    {p.q1}
                  </text>
                  <text x={cx + 22} y={y(p.q2) - 6} textAnchor="middle" className={styles.valueStrong}>
                    {p.q2}
                  </text>
                  <text x={cx} y="222" textAnchor="middle" className={styles.label}>
                    {p.name}
                  </text>
                </g>
              );
            })}
          </svg>
        </section>

        <section className={styles.section}>
          <h3>What drove it, largest first</h3>
          <ol className={styles.drivers}>
            {revenueBrief.drivers.map((d) => (
              <li key={d.lead}>
                <span className={styles.lead}>{d.lead}</span> {d.rest}
                <span className={styles.evidence}>{d.source}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section className={styles.section}>
        <h3>Worth looking into</h3>
        <ul className={styles.bullets}>
          {revenueBrief.followUps.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
        <p className={styles.note}>Astro supports this decision, it doesn't make it. Every figure above links to the query that produced it.</p>
      </section>
    </div>
  );
}
