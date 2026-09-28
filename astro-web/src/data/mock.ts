// Sample data for Kestrel Labs, an example company. Replace with API data.
import type {
  Agent,
  AgentId,
  ChatMessage,
  DomainPreset,
  KnowledgeSource,
  RoleAccess,
  Source,
} from '../types/astro';

export const agents: Agent[] = [
  { id: 'mentor', name: 'Mentor', hint: 'Mentor explains the company, teams and terms' },
  { id: 'tech', name: 'Tech', hint: 'Tech searches code, architecture and engineering docs' },
  { id: 'finance', name: 'Finance', hint: 'Finance queries the metrics and reports you can access' },
  { id: 'hr', name: 'HR', hint: 'HR answers from policies and processes' },
  { id: 'exec', name: 'Executive', hint: 'Executive combines every agent into one brief' },
];

export const agentName = (id: AgentId) => agents.find((a) => a.id === id)?.name ?? id;

const kafkaSources: Source[] = [
  {
    n: 1,
    id: 'adr-014',
    title: 'ADR-014: Event bus for order events',
    kind: 'Architecture decision',
    where: 'Engineering docs',
    updated: 'Updated Mar 2024',
    excerpt:
      'Consumers must be able to re-read order events after a failure. RabbitMQ removes messages once they are acknowledged, so replay would need a separate store.',
    openLabel: 'Open document',
  },
  {
    n: 2,
    id: 'runbook-messaging',
    title: 'Messaging runbook',
    kind: 'Runbook',
    where: 'Platform team wiki',
    updated: 'Updated Aug 2026',
    excerpt:
      'Kafka carries order and payment events. RabbitMQ stays for email and push notification jobs, where replay is not needed.',
    openLabel: 'Open document',
  },
  {
    n: 3,
    id: 'gh-producer',
    title: 'order-service/src/events/producer.ts',
    kind: 'Code',
    where: 'GitHub, kestrel/order-service',
    updated: 'Last commit 3 days ago',
    excerpt:
      "Events are published with the customer ID as the partition key, so each customer's events stay in order.",
    openLabel: 'Open in GitHub',
  },
];

const kafkaAnswer = [
  "Kestrel moved order events to Kafka in 2024 because several teams need to re-read events after something fails, and RabbitMQ deletes a message once it's been handled.[1]",
  'The decision came down to three things:',
  '- **Replay.** Billing and analytics re-read recent order events after an outage instead of asking the order service to resend them.[1]',
  '- **Traffic spikes.** Sale days produced more events than the old queue setup handled comfortably.[2]',
  "- **Order per customer.** Events are keyed by customer ID, so one customer's events always arrive in sequence.[3]",
  "RabbitMQ didn't go away. It still runs email and notification jobs, where replay doesn't matter.[2]",
].join('\n');

export const sampleConversation: ChatMessage[] = [
  {
    id: 'm1',
    role: 'user',
    text: 'I joined the platform team this week. Why do we use Kafka instead of RabbitMQ for order events?',
  },
  {
    id: 'm2',
    role: 'assistant',
    agent: 'tech',
    status: 'done',
    text: kafkaAnswer,
    route: [
      { kind: 'supervisor', label: 'Supervisor' },
      { kind: 'agent', label: 'Tech agent' },
      { kind: 'retrieval', label: 'Architecture docs, 4 matches' },
      { kind: 'retrieval', label: 'GitHub, order-service' },
      { kind: 'access', label: 'Access check passed' },
    ],
    sources: kafkaSources,
  },
];

/** Canned answers used by the mock stream in src/api/client.ts. */
export const mockAnswers: Record<AgentId, { text: string; retrieval: string[]; sources: Source[] }> = {
  tech: { text: kafkaAnswer, retrieval: ['Architecture docs, 4 matches', 'GitHub, order-service'], sources: kafkaSources },
  mentor: {
    text: [
      'Kestrel Labs builds order and analytics software for logistics companies.[1]',
      'Most new engineers start in one of three teams:',
      '- **Platform** runs the order service, events and billing.[2]',
      '- **Insights** builds the analytics product customers see.[2]',
      '- **Integrations** owns webhooks and partner APIs.[2]',
      'Your onboarding buddy is listed in the team page, and the product handbook is the best first read.[1]',
    ].join('\n'),
    retrieval: ['Product handbook, 3 matches', 'Team directory'],
    sources: [
      { n: 1, id: 'handbook', title: 'Product handbook', kind: 'Handbook', where: 'Company docs', updated: 'Updated Sep 2026', excerpt: 'Kestrel Labs makes order management and analytics tools for mid-size logistics companies.', openLabel: 'Open document' },
      { n: 2, id: 'teams', title: 'Engineering teams', kind: 'Team page', where: 'Company wiki', updated: 'Updated Jul 2026', excerpt: 'Platform, Insights and Integrations each have an on-call rotation and a weekly demo.', openLabel: 'Open page' },
    ],
  },
  finance: {
    text: [
      'Revenue fell 8% from Q1 to Q2, mostly because Analytics dropped from ₹34 crore to ₹28 crore.[1]',
      'The main drivers, largest first:',
      '- **Two enterprise downgrades** in May moved customers to the basic Analytics plan.[1]',
      '- **Higher churn.** Three enterprise accounts left in Q2, compared with one in Q1.[2]',
      '- **North region slowed** while other regions held steady.[3]',
      "These are the figures I can see with your access. I can't tell you whether to change pricing, but I can compare plans if that helps.",
    ].join('\n'),
    retrieval: ['Finance warehouse, subscriptions', 'CRM, closed accounts', 'Q2 board report'],
    sources: [
      { n: 1, id: 'fw-subs', title: 'subscriptions (finance warehouse)', kind: 'Database query', where: 'PostgreSQL, read-only', updated: 'Queried just now', excerpt: 'Analytics revenue by plan, Q1 and Q2. Two accounts changed from enterprise to basic on 14 and 22 May.', openLabel: 'View query' },
      { n: 2, id: 'crm-closed', title: 'Closed accounts, Q1 and Q2', kind: 'CRM report', where: 'CRM', updated: 'Synced 1 hour ago', excerpt: 'Enterprise accounts lost: 1 in Q1, 3 in Q2.', openLabel: 'Open report' },
      { n: 3, id: 'board-q2', title: 'Q2 board report', kind: 'Report', where: 'Leadership files', updated: 'Updated Jul 2026', excerpt: 'North region bookings were below plan. Other regions were within 2% of plan.', openLabel: 'Open page 6' },
    ],
  },
  hr: {
    text: [
      'Full-time employees get 24 days of paid leave a year, plus public holidays.[1]',
      '- Request leave in the HR portal at least two weeks ahead for anything over three days.[1]',
      '- Unused leave carries over up to 10 days into the next year.[2]',
      "I can't see anyone's personal leave balance. The HR portal shows yours.",
    ].join('\n'),
    retrieval: ['HR policies, 2 matches'],
    sources: [
      { n: 1, id: 'leave-policy', title: 'Leave policy', kind: 'Policy', where: 'HR policies', updated: 'Updated Jan 2026', excerpt: 'Employees receive 24 days of paid leave per calendar year in addition to public holidays.', openLabel: 'Open policy' },
      { n: 2, id: 'carry-over', title: 'Leave carry-over rules', kind: 'Policy', where: 'HR policies', updated: 'Updated Jan 2026', excerpt: 'Up to 10 unused days may be carried into the following year.', openLabel: 'Open policy' },
    ],
  },
  exec: {
    text: [
      'Here is what the Tech and Finance agents found, for you to weigh:',
      '- **Analytics retention** is the biggest revenue risk. Both Q2 downgrades mention the same missing reporting feature.[1]',
      "- **Sale-day readiness.** The order service hasn't been load-tested since the Kafka change.[2]",
      '- **Payments work is blocked** on sandbox access, which delays the billing roadmap.[2]',
      'Astro supports this decision, it does not make it. Each point links to its evidence.',
    ].join('\n'),
    retrieval: ['Finance agent', 'Tech agent', 'Jira, 2 projects'],
    sources: [
      { n: 1, id: 'exit-notes', title: 'Downgrade exit notes', kind: 'CRM notes', where: 'CRM', updated: 'May 2026', excerpt: 'Both customers asked for scheduled reports by region before they would stay on enterprise.', openLabel: 'Open notes' },
      { n: 2, id: 'eng-brief', title: 'Engineering meeting brief', kind: 'Brief', where: 'Astro briefs', updated: 'Today, 8:05 AM', excerpt: 'Risks: no load test since the Kafka change. Blocked: payments sandbox access.', openLabel: 'Open brief' },
    ],
  },
};

export const callBrief = {
  title: 'Meridian Freight client call',
  when: 'Starts at 4:30 PM',
  account: 'On the Enterprise plan since 2023. Main contact is Dana Ruiz, Head of Operations.',
  openIssues: ['Webhook deliveries were delayed twice this month.', 'Ticket SUP-1182 is still open. The fix ships Friday.'],
  caution: 'The contract caps custom work at 20 hours a quarter, and 14 are used. Anything larger needs a change order.',
  builtFrom: ['CRM account', 'Support tickets', 'Master service agreement'],
};

export type BriefTone = 'attention' | 'neutral' | 'good';
export type BriefIcon = 'decide' | 'risk' | 'incident' | 'blocked' | 'review' | 'shipped';

export interface BriefSection {
  id: string;
  title: string;
  tone: BriefTone;
  icon: BriefIcon;
  items: { title: string; meta: string }[];
}

export const engineeringBrief = {
  title: 'Engineering meeting, Thursday 10:00',
  prepared: "Prepared at 8:05 AM from GitHub, Jira, incident reports and last week's notes",
  sections: [
    {
      id: 'decide', title: 'Needs your decision', tone: 'attention', icon: 'decide',
      items: [
        { title: 'Pick a new payments sandbox vendor, or escalate with the current one', meta: 'Blocking payments work for two sprints' },
        { title: "Approve a load test before next month's sale", meta: 'Needs two engineers for three days' },
      ],
    },
    {
      id: 'risks', title: 'Risks', tone: 'neutral', icon: 'risk',
      items: [
        { title: "Order service hasn't been load-tested since the Kafka change", meta: 'Architecture docs and last test report, May 2024' },
        { title: 'Only one person knows the billing cron jobs', meta: 'Runbook last edited in 2025' },
      ],
    },
    {
      id: 'incidents', title: 'Production issues', tone: 'neutral', icon: 'incident',
      items: [{ title: 'Delayed webhooks for two enterprise accounts', meta: 'INC-219, mitigated. Root-cause fix in PR #491' }],
    },
    {
      id: 'blocked', title: 'Blocked', tone: 'neutral', icon: 'blocked',
      items: [
        { title: 'Payments sandbox access', meta: 'Waiting on vendor since Tuesday, Jira PAY-88' },
        { title: 'Mobile release 3.4', meta: 'Needs design sign-off, Jira MOB-120' },
      ],
    },
    {
      id: 'review', title: 'Waiting on review', tone: 'neutral', icon: 'review',
      items: [
        { title: '#491 Webhook queue partitioning', meta: 'Open 2 days, needs a platform reviewer' },
        { title: '#488 Rate limiter for the public API', meta: 'Open 4 days' },
        { title: '#485 Remove legacy auth tokens', meta: 'Open 6 days, touches billing' },
      ],
    },
    {
      id: 'shipped', title: 'Shipped since last meeting', tone: 'good', icon: 'shipped',
      items: [
        { title: 'Webhook retries with backoff', meta: 'PR #482, merged Tuesday' },
        { title: 'Invoice PDF redesign', meta: 'PR #476, merged Monday' },
        { title: 'Search moved to pgvector', meta: 'Jira PLAT-311, done' },
      ],
    },
  ] satisfies BriefSection[],
};

export const revenueBrief = {
  title: 'Revenue fell 8% last quarter',
  subtitle: 'The Finance agent compared Q2 with Q1 using the finance warehouse and the Q2 board report',
  unit: '₹ crore',
  products: [
    { name: 'Orders API', q1: 50, q2: 49 },
    { name: 'Analytics', q1: 34, q2: 28 },
    { name: 'Support add-on', q1: 16, q2: 15 },
  ],
  drivers: [
    { lead: 'Analytics fell ₹6 crore.', rest: 'Two enterprise customers moved to the basic plan in May.', source: 'Finance warehouse, subscriptions table' },
    { lead: 'Enterprise churn rose.', rest: 'Three accounts left in Q2, compared with one in Q1.', source: 'CRM, closed accounts' },
    { lead: 'North region slowed', rest: 'while other regions held steady.', source: 'Q2 board report, page 6' },
  ],
  followUps: [
    'Both downgrades mention the same missing reporting feature in their exit notes.',
    "Check whether the North slowdown is seasonal by comparing with last year's Q2.",
  ],
};

export const scheduledBriefs = [
  { id: 'eng', name: 'Engineering meeting', when: 'Thursdays at 8:00 AM' },
  { id: 'rev', name: 'Revenue pulse', when: 'Mondays at 8:00 AM' },
  { id: 'hire', name: 'New-hire guide', when: 'When someone joins a team' },
];

export const knowledgeSources: KnowledgeSource[] = [
  { id: 's1', name: 'Product handbook', detail: 'Files, 38 documents', access: 'Everyone', status: 'indexed', statusLabel: 'Indexed', lastSynced: '2 hours ago' },
  { id: 's2', name: 'kestrel/order-service', detail: 'GitHub repository', access: 'Engineering', status: 'syncing', statusLabel: 'Syncing', lastSynced: 'Now' },
  { id: 's3', name: 'Architecture decisions', detail: 'Files, 20 documents', access: 'Engineering', status: 'syncing', statusLabel: 'Indexing 12 of 20', lastSynced: 'Now' },
  { id: 's4', name: 'Finance warehouse', detail: 'PostgreSQL, read-only, 12 tables', access: 'Finance, Leadership', status: 'indexed', statusLabel: 'Connected', lastSynced: '15 minutes ago' },
  { id: 's5', name: 'HR policies', detail: 'Files, 24 documents', access: 'Everyone', status: 'indexed', statusLabel: 'Indexed', lastSynced: 'Yesterday' },
  { id: 's6', name: 'Employee records', detail: 'HR system, salary fields excluded', access: 'People team', status: 'indexed', statusLabel: 'Indexed', lastSynced: 'Yesterday' },
  { id: 's7', name: 'kestrel.io', detail: 'Website, 64 pages', access: 'Everyone', status: 'queued', statusLabel: 'Queued', lastSynced: 'Not yet' },
  { id: 's8', name: 'Quarterly reports', detail: "Files, 2 of 8 couldn't be read", access: 'Leadership', status: 'attention', statusLabel: 'Needs attention', lastSynced: '3 days ago' },
];

export const dataDomains = [
  { id: 'company', label: 'Company docs' },
  { id: 'engineering', label: 'Engineering' },
  { id: 'finance', label: 'Finance data' },
  { id: 'hr', label: 'HR records' },
] as const;

export const roleAccess: RoleAccess[] = [
  { role: 'Everyone', access: { company: true, engineering: false, finance: false, hr: false } },
  { role: 'Engineering', access: { company: true, engineering: true, finance: false, hr: false } },
  { role: 'Finance', access: { company: true, engineering: false, finance: true, hr: false } },
  { role: 'People team', access: { company: true, engineering: false, finance: false, hr: true } },
  { role: 'Leadership', access: { company: true, engineering: true, finance: true, hr: false } },
];

export const accessLog = [
  { id: 'a1', result: 'Blocked', text: 'An engineer asked the Finance agent for salary bands', time: '10:42' },
  { id: 'a2', result: 'Allowed', text: 'Finance agent queried the finance warehouse, read-only', time: '10:15' },
  { id: 'a3', result: 'Flagged', text: 'A web page told Astro to ignore its rules. Astro ignored it and flagged the page.', time: '9:58' },
] as const;

export const domainPresets: DomainPreset[] = [
  {
    id: 'tech',
    title: 'Technology and software',
    description: 'Products, code, architecture and how engineering works',
    agents: ['Mentor', 'Tech', 'HR', 'Executive'],
    sources: ['Product docs', 'GitHub repositories', 'Architecture decisions', 'API specs', 'Incident reports'],
    questions: ['What does our product do, in plain words?', 'Why did we choose Kafka for order events?', 'What broke in production last week?'],
  },
  {
    id: 'finance',
    title: 'Finance and banking',
    description: 'Financial products, reports, regulation and risk',
    agents: ['Mentor', 'Finance', 'Risk and compliance', 'Executive'],
    sources: ['Financial reports', 'Ledger database', 'Product terms', 'Regulatory circulars', 'Investment research'],
    questions: ['Why did revenue drop last quarter?', 'Which products carry the most credit risk?', 'What does the latest circular change for us?'],
  },
  {
    id: 'health',
    title: 'Healthcare',
    description: 'Care protocols, operations, staff and compliance',
    agents: ['Mentor', 'Operations', 'Compliance', 'Executive'],
    sources: ['Clinical SOPs', 'Scheduling database', 'Staff policies', 'Compliance audits'],
    questions: ['What is the discharge process on ward 3?', 'Which audits are due this month?', 'How do I request leave?'],
  },
  {
    id: 'retail',
    title: 'Retail and e-commerce',
    description: 'Catalog, orders, suppliers and customers',
    agents: ['Mentor', 'Sales', 'Finance', 'Executive'],
    sources: ['Product catalog', 'Orders database', 'Support tickets', 'Supplier contracts'],
    questions: ['Which products get returned most?', 'Why did cart abandonment rise this month?', 'Which supplier contracts renew soon?'],
  },
];

export type ConnectorId = 'files' | 'web' | 'github' | 'pg' | 'api' | 'slack' | 'jira' | 'drive' | 'notion';

export const connectors: { id: ConnectorId; name: string; description: string; later?: boolean }[] = [
  { id: 'files', name: 'Files', description: 'PDF, DOCX and TXT' },
  { id: 'web', name: 'Website', description: 'Site and help center' },
  { id: 'github', name: 'GitHub', description: 'Repos and pull requests' },
  { id: 'pg', name: 'PostgreSQL', description: 'Read-only access' },
  { id: 'api', name: 'REST API', description: 'Internal endpoints' },
  { id: 'slack', name: 'Slack', description: 'Channels and threads', later: true },
  { id: 'jira', name: 'Jira', description: 'Issues and sprints', later: true },
  { id: 'drive', name: 'Google Drive', description: 'Docs and sheets', later: true },
  { id: 'notion', name: 'Notion', description: 'Pages and wikis', later: true },
];
