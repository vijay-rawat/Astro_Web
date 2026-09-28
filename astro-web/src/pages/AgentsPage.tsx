import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Lock, Pause, Users, Wrench } from 'lucide-react';
import { fetchAgentConfigs, updateAgentConfig } from '../api/agents';
import { Switch } from '../components/Switch/Switch';
import { useSession } from '../auth/AuthProvider';
import { agentName } from '../data/mock';
import { agentIcons } from '../lib/agentIcons';
import { routeQuestion, type RouteResult } from '../lib/router';
import type { AgentConfig, AgentId, ToolPermission } from '../types/astro';
import styles from './AgentsPage.module.scss';

const permissionLabel: Record<ToolPermission, string> = { read: 'Read-only', approval: 'Needs approval', draft: 'Drafts for you' };

function explain(r: RouteResult): string {
  if (r.redirectedFrom) return `${agentName(r.redirectedFrom)} is paused, so Mentor answers from general company docs.`;
  if (r.keyword) {
    const name = agentName(r.agent);
    return `It mentions “${r.keyword}”, which ${name} owns. ${name} answers with sources, and pulls in other agents if it needs them.`;
  }
  return 'No specialist owns this, so Mentor answers and hands off if another agent knows more.';
}

export function AgentsPage() {
  const { company } = useSession();
  const [configs, setConfigs] = useState<AgentConfig[]>([]);
  const [selected, setSelected] = useState<AgentId>('tech');
  const [question, setQuestion] = useState('How do I get access to the staging database?');
  const [route, setRoute] = useState<RouteResult>(() => routeQuestion('How do I get access to the staging database?'));
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    fetchAgentConfigs(company.id).then(setConfigs).catch(() => setConfigs([]));
  }, []);

  const paused = useMemo(() => Object.fromEntries(configs.map((c) => [c.id, c.paused])) as Partial<Record<AgentId, boolean>>, [configs]);
  const current = configs.find((c) => c.id === selected);
  const answering = configs.filter((c) => !c.paused).length;

  const save = (id: AgentId, patch: Partial<AgentConfig>, rollback: AgentConfig[]) => {
    const next = configs.map((c) => (c.id === id ? { ...c, ...patch } : c));
    setConfigs(next);
    const saved = next.find((c) => c.id === id)!;
    updateAgentConfig(company.id, id, { paused: saved.paused, guardrails: saved.guardrails.map(({ id: gid, enabled }) => ({ id: gid, enabled })) })
      .then(() => setSaveError(null))
      .catch(() => {
        setConfigs(rollback);
        setSaveError("Couldn't save that change. Try again.");
      });
  };

  const onRoute = (e: FormEvent) => {
    e.preventDefault();
    if (question.trim()) setRoute(routeQuestion(question, paused));
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Agents</h1>
          <p>Every question goes to the one agent that owns it. An agent only sees what the person asking could already open.</p>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.chip}>{company.presetLabel} preset</span>
          <Link to="/setup" className={styles.secondary}>
            Change in setup
          </Link>
        </div>
      </header>

      <div className={styles.body}>
        <div className={styles.left}>
          <form className={styles.card} onSubmit={onRoute} aria-labelledby="route-h">
            <div>
              <h2 id="route-h">Try the supervisor</h2>
              <p className={styles.caption}>Type a question to see which agent would answer it.</p>
            </div>
            <div className={styles.routeRow}>
              <label className={styles.field}>
                <span className="visually-hidden">Question to route</span>
                <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask anything…" autoComplete="off" />
              </label>
              <button type="submit" className={styles.primary}>
                Route
              </button>
            </div>
            <div className={styles.result} aria-live="polite">
              <div className={styles.trace}>
                <span className={styles.traceFrom}>
                  <span className={styles.ring} aria-hidden="true" />
                  Supervisor
                </span>
                <svg width="44" height="10" viewBox="0 0 44 10" aria-hidden="true">
                  <path d="M1 5h38" className={styles.dash} />
                  <path d="M37 1l5 4-5 4" className={styles.arrow} />
                </svg>
                <span className={styles.traceTo}>
                  <span className={styles.moon} aria-hidden="true" />
                  {agentName(route.agent)} agent
                </span>
              </div>
              <p>{explain(route)}</p>
              <button type="button" className={styles.smallBtn} onClick={() => setSelected(route.agent)}>
                Open {agentName(route.agent)}
              </button>
            </div>
          </form>

          <section aria-labelledby="list-h" className={styles.listWrap}>
            <div className={styles.listHead}>
              <h2 id="list-h">Agents in this workspace</h2>
              <span className={styles.caption}>{answering === configs.length ? `All ${configs.length} answering` : `${answering} of ${configs.length} answering`}</span>
            </div>
            <ul className={styles.list}>
              {configs.map((c) => {
                const Icon = agentIcons[c.id];
                const on = c.id === selected;
                return (
                  <li key={c.id}>
                    <button type="button" aria-pressed={on} className={`${styles.agentBtn} ${on ? styles.agentOn : ''}`} onClick={() => setSelected(c.id)}>
                      <span className={styles.tile} aria-hidden="true">
                        <Icon size={18} />
                      </span>
                      <span className={styles.agentText}>
                        <span className={styles.agentName}>{agentName(c.id)}</span>
                        <span className={styles.caption}>{c.short}</span>
                      </span>
                      <span className={`${styles.status} ${c.paused ? styles.paused : ''}`}>
                        <span className={styles.statusDot} aria-hidden="true" />
                        {c.paused ? 'Paused' : 'Ready'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        {current && <AgentDetail config={current} onChange={(patch) => save(current.id, patch, configs)} />}
      </div>
      {saveError && (
        <p className={styles.toast} role="alert">
          {saveError}
        </p>
      )}
    </div>
  );
}

function AgentDetail({ config, onChange }: { config: AgentConfig; onChange: (patch: Partial<AgentConfig>) => void }) {
  const Icon = agentIcons[config.id];
  const name = agentName(config.id);

  return (
    <section className={styles.detail} aria-labelledby="detail-h">
      <div className={styles.detailHead}>
        <span className={styles.bigTile} aria-hidden="true">
          <Icon size={24} />
        </span>
        <div className={styles.detailText}>
          <h2 id="detail-h">{name} agent</h2>
          <p>{config.summary}</p>
        </div>
        {config.fallback ? (
          <span className={styles.fallback}>Fallback agent</span>
        ) : (
          <span className={styles.pauseSwitch}>
            <span aria-hidden="true">{config.paused ? 'Paused' : 'Answering'}</span>
            <Switch checked={!config.paused} onChange={(on) => onChange({ paused: !on })} label={`${name} agent answers questions`} />
          </span>
        )}
      </div>

      {config.paused && (
        <p className={styles.pausedNote}>
          <Pause size={16} aria-hidden="true" />
          Paused. The supervisor sends {name} questions to Mentor, which answers from general company docs and says what it can't see.
        </p>
      )}

      <div className={styles.grid}>
        <div>
          <h3>Answers questions about</h3>
          <ul className={styles.chips}>
            {config.topics.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3>Who can ask</h3>
          <ul className={styles.chips}>
            {config.roles.map((r) => (
              <li key={r} className={styles.roleChip}>
                <Users size={14} aria-hidden="true" />
                {r}
              </li>
            ))}
          </ul>
          <p className={styles.note}>{config.rolesNote}</p>
        </div>
        <div>
          <h3>Reads from</h3>
          <ul className={styles.rows}>
            {config.sources.map((s) => (
              <li key={s.name}>
                <FileText size={16} aria-hidden="true" />
                <span className={styles.rowName}>{s.name}</span>
                <span className={styles.caption}>{s.where}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3>Can do</h3>
          <ul className={styles.rows}>
            {config.tools.map((t) => (
              <li key={t.name}>
                <Wrench size={16} aria-hidden="true" />
                <span className={styles.rowName}>{t.name}</span>
                <span className={`${styles.badge} ${styles[t.permission]}`}>{permissionLabel[t.permission]}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div>
        <h3>Guardrails</h3>
        <ul className={styles.guards}>
          <li>
            <span className={styles.guardText}>
              <span className={styles.rowName}>Cite a source for every answer</span>
              <span className={styles.caption}>When nothing backs an answer up, the agent says it doesn't know and suggests who might.</span>
            </span>
            <span className={styles.locked}>
              <Lock size={14} aria-hidden="true" />
              Always on
            </span>
          </li>
          {config.guardrails.map((g) => (
            <li key={g.id}>
              <span className={styles.guardText}>
                <span className={styles.rowName}>{g.label}</span>
                <span className={styles.caption}>{g.detail}</span>
              </span>
              <Switch
                checked={g.enabled}
                onChange={(enabled) => onChange({ guardrails: config.guardrails.map((x) => (x.id === g.id ? { ...x, enabled } : x)) })}
                label={g.label}
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
