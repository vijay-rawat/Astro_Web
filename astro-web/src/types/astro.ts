export type AgentId = 'mentor' | 'tech' | 'finance' | 'hr' | 'exec';

/** 'auto' lets the supervisor pick the agent. */
export type RouteMode = AgentId | 'auto';

export interface Agent {
  id: AgentId;
  name: string;
  hint: string;
}

/** A retrieved passage Astro used to answer. `n` matches the [n] marker in the answer text. */
export interface Source {
  n: number;
  id: string;
  title: string;
  kind: string;
  where: string;
  updated: string;
  excerpt: string;
  openLabel: string;
  url?: string;
}

export type RouteStepKind = 'supervisor' | 'agent' | 'retrieval' | 'access';

export interface RouteStep {
  kind: RouteStepKind;
  label: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  /** Plain text. Assistant text may contain [n] citation markers, "- " list lines and **bold**. */
  text: string;
  agent?: AgentId;
  route?: RouteStep[];
  sources?: Source[];
  status?: 'streaming' | 'done' | 'error';
  error?: string;
}

/** Server-sent events from POST /chat/stream. One JSON object per `data:` line. */
export type StreamEvent =
  | { type: 'route'; step: RouteStep }
  | { type: 'agent'; agent: AgentId }
  | { type: 'token'; text: string }
  | { type: 'sources'; sources: Source[] }
  | { type: 'done' }
  | { type: 'error'; message: string };

export type SourceStatus = 'indexed' | 'syncing' | 'queued' | 'attention';

export interface KnowledgeSource {
  id: string;
  name: string;
  detail: string;
  access: string;
  status: SourceStatus;
  statusLabel: string;
  lastSynced: string;
}

export type DataDomain = 'company' | 'engineering' | 'finance' | 'hr';

export interface RoleAccess {
  role: string;
  access: Record<DataDomain, boolean>;
}

export type CompanyDomain = 'tech' | 'finance' | 'health' | 'retail';

export interface DomainPreset {
  id: CompanyDomain;
  title: string;
  description: string;
  agents: string[];
  sources: string[];
  questions: string[];
}

// ---------------------------------------------------------------------------
// Meetings: Astro joins Google Meet / Zoom / Teams calls as a participant.

export type MeetingPlatform = 'meet' | 'zoom' | 'teams';
export type MeetingStatus = 'live' | 'upcoming' | 'ended';

export interface Meeting {
  id: string;
  title: string;
  platform: MeetingPlatform;
  day: string;
  start: string;
  end: string;
  status: MeetingStatus;
  attendees: number;
  /** People from outside the company. With guests, Astro never speaks out loud. */
  guests: number;
  guestDomain?: string;
  astroInvited: boolean;
  joinedAt?: string;
  hasBrief?: boolean;
}

export type MeetingSettingId = 'notes' | 'answer' | 'speak' | 'decisions' | 'followups';

export interface MeetingSetting {
  id: MeetingSettingId;
  label: string;
  detail: string;
  enabled: boolean;
}

export interface Participant {
  id: string;
  name: string;
  initials: string;
  muted?: boolean;
  isAstro?: boolean;
}

export interface TranscriptLine {
  id: string;
  speakerId: string;
  speaker: string;
  time: string;
  text: string;
}

export interface MeetingDecision {
  id: string;
  text: string;
  detail?: string;
  by: string;
  time: string;
}

export type ActionStatus = 'pending' | 'approved';

export interface ActionItem {
  id: string;
  task: string;
  owner: string;
  due: string;
  /** Where the approved item goes, e.g. "New Jira ticket, PLAT". */
  destination: string;
  actionLabel: string;
  doneLabel: string;
  status: ActionStatus;
}

export interface MeetingAnswer {
  id: string;
  askedBy: string;
  time: string;
  question: string;
  answer: string;
  sources: string[];
}

export interface PrivateExchange {
  id: string;
  question: string;
  answer: string;
  source?: string;
  status: 'pending' | 'done' | 'error';
}

export interface Attendee {
  name: string;
  initials: string;
  role: string;
}

export interface MeetingRecap {
  meetingId: string;
  title: string;
  when: string;
  platform: MeetingPlatform;
  attendees: Attendee[];
  summary: string;
  decisions: MeetingDecision[];
  answers: MeetingAnswer[];
  actionItems: ActionItem[];
  followUp: { channel: string; lines: string[] };
  retention: string;
}

/** Events from GET /meetings/:id/live (SSE). One JSON object per `data:` line. */
export type MeetingLiveEvent =
  | { type: 'transcript'; line: TranscriptLine }
  | { type: 'speaking'; participantId: string | null }
  | { type: 'answer'; answer: MeetingAnswer }
  | { type: 'decision'; decision: MeetingDecision }
  | { type: 'action'; item: ActionItem }
  | { type: 'ended' };

// ---------------------------------------------------------------------------
// Agent configuration (admin)

export type ToolPermission = 'read' | 'approval' | 'draft';

export interface Guardrail {
  id: string;
  label: string;
  detail: string;
  enabled: boolean;
}

export interface AgentConfig {
  id: AgentId;
  short: string;
  summary: string;
  topics: string[];
  roles: string[];
  rolesNote: string;
  sources: { name: string; where: string }[];
  tools: { name: string; permission: ToolPermission }[];
  guardrails: Guardrail[];
  /** The fallback agent answers when nothing else matches, so it can't be paused. */
  fallback?: boolean;
  paused: boolean;
}
