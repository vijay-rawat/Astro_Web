import { agentConfigs } from '../data/agentConfigs';
import type { AgentConfig, AgentId, Guardrail } from '../types/astro';
import { API_URL, USE_MOCKS } from './client';

export async function fetchAgentConfigs(companyId: string): Promise<AgentConfig[]> {
  if (USE_MOCKS) return agentConfigs;
  const res = await fetch(`${API_URL}/companies/${companyId}/agents`, { credentials: 'include' });
  if (!res.ok) throw new Error(`Loading agents failed with ${res.status}`);
  return res.json();
}

export async function updateAgentConfig(
  companyId: string,
  agentId: AgentId,
  patch: { paused?: boolean; guardrails?: Pick<Guardrail, 'id' | 'enabled'>[] },
): Promise<void> {
  if (USE_MOCKS) return;
  const res = await fetch(`${API_URL}/companies/${companyId}/agents/${agentId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Saving the agent failed with ${res.status}`);
}
