import { Code, Compass, Target, TrendingUp, Users, type LucideIcon } from 'lucide-react';
import type { AgentId } from '../types/astro';

export const agentIcons: Record<AgentId, LucideIcon> = {
  mentor: Compass,
  tech: Code,
  finance: TrendingUp,
  hr: Users,
  exec: Target,
};
