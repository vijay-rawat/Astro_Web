import type { AgentId } from '../types/astro';

// Keyword router used in mock mode and on the Agents page's "Try the supervisor".
// The real supervisor (LangGraph) classifies with a model; keep this list roughly
// in sync with each agent's topics so the demo behaves the same way.
const rules: { agent: AgentId; keywords: string[] }[] = [
  { agent: 'exec', keywords: ['focus', 'strategy', 'priorit', 'roadmap', 'next quarter', 'board', 'should we', 'okr', 'trade-off'] },
  { agent: 'finance', keywords: ['revenue', 'cost', 'budget', 'margin', 'churn', 'invoice', 'profit', 'quarter', 'sales', 'spend', 'pricing', 'runway'] },
  { agent: 'hr', keywords: ['leave', 'salary', 'policy', 'holiday', 'hiring', 'benefit', 'payroll', 'vacation', 'insurance'] },
  {
    agent: 'tech',
    keywords: ['code', 'api', 'deploy', 'kafka', 'database', 'bug', 'incident', 'architecture', 'repo', 'service', 'webhook', 'staging', 'github', 'cron'],
  },
];

export interface RouteResult {
  agent: AgentId;
  /** The keyword that matched, if any. */
  keyword?: string;
  /** Set when the matching agent is paused and Mentor answers instead. */
  redirectedFrom?: AgentId;
}

export function routeQuestion(text: string, paused: Partial<Record<AgentId, boolean>> = {}): RouteResult {
  const m = text.toLowerCase();
  for (const rule of rules) {
    const keyword = rule.keywords.find((k) => m.includes(k));
    if (!keyword) continue;
    if (paused[rule.agent]) return { agent: 'mentor', keyword, redirectedFrom: rule.agent };
    return { agent: rule.agent, keyword };
  }
  return { agent: 'mentor' };
}
