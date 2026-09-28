// Sample meeting data for Kestrel Labs. Replace with API data.
import type {
  ActionItem,
  MeetingAnswer,
  MeetingDecision,
  Meeting,
  MeetingLiveEvent,
  MeetingRecap,
  MeetingSetting,
  Participant,
  TranscriptLine,
} from '../types/astro';

export const meetings: Meeting[] = [
  { id: 'eng-weekly', title: 'Engineering meeting', platform: 'meet', day: 'Today, Thursday', start: '10:00', end: '10:45', status: 'live', attendees: 6, guests: 0, astroInvited: true, joinedAt: '10:01' },
  { id: 'neha-1on1', title: '1:1 with Neha', platform: 'meet', day: 'Today, Thursday', start: '14:00', end: '14:30', status: 'upcoming', attendees: 2, guests: 0, astroInvited: false },
  {
    id: 'meridian-qbr',
    title: 'Meridian Freight quarterly review',
    platform: 'meet',
    day: 'Today, Thursday',
    start: '16:30',
    end: '17:15',
    status: 'upcoming',
    attendees: 5,
    guests: 2,
    guestDomain: 'meridianfreight.com',
    astroInvited: true,
    hasBrief: true,
  },
  { id: 'hiring-sync', title: 'Hiring sync', platform: 'zoom', day: 'Tomorrow, Friday', start: '11:00', end: '11:30', status: 'upcoming', attendees: 4, guests: 0, astroInvited: true },
];

export const meetingSettings: MeetingSetting[] = [
  { id: 'notes', label: 'Take notes and a transcript', detail: 'Shared with everyone who was invited, after the call.', enabled: true },
  { id: 'answer', label: 'Answer when someone says “Astro”', detail: 'It stays quiet otherwise and never interrupts.', enabled: true },
  { id: 'speak', label: 'Speak answers out loud', detail: 'Only when everyone in the call is from Kestrel Labs. With guests, it answers you privately.', enabled: true },
  { id: 'decisions', label: 'Capture decisions and action items', detail: 'Only what people actually said, with the time they said it.', enabled: true },
  { id: 'followups', label: 'Draft follow-ups for you to approve', detail: 'Tickets and messages wait for your approval before anything is sent.', enabled: true },
];

export const recentRecaps = [
  { meetingId: 'eng-weekly', title: 'Engineering meeting', when: 'Today · 2 decisions, 4 action items' },
  { meetingId: 'design-review', title: 'Platform design review', when: 'Tuesday · 3 decisions, 5 action items' },
  { meetingId: 'meridian-onboarding', title: 'Meridian Freight onboarding', when: 'Sep 3 · 1 decision, 3 action items' },
];

export const participants: Participant[] = [
  { id: 'astro', name: 'Astro (Kestrel Labs)', initials: 'AI', isAstro: true },
  { id: 'sana', name: 'Sana Kulkarni', initials: 'SK' },
  { id: 'imran', name: 'Imran Sheikh', initials: 'IS' },
  { id: 'neha', name: 'Neha Rao', initials: 'NR', muted: true },
  { id: 'kavya', name: 'Kavya Menon', initials: 'KM', muted: true },
  { id: 'aarav', name: 'Aarav Mehta', initials: 'AM' },
];

const line = (id: string, speakerId: string, speaker: string, time: string, text: string): TranscriptLine => ({ id, speakerId, speaker, time, text });

const loadTestAnswer: MeetingAnswer = {
  id: 'ans-1',
  askedBy: 'Imran',
  time: '10:14',
  question: 'When did we last load-test the order service?',
  answer: 'The order service was last load-tested in May 2024, before the Kafka switch.',
  sources: ['Load test report, May 2024', 'ADR-014'],
};

const cronAnswer: MeetingAnswer = {
  id: 'ans-2',
  askedBy: 'Sana',
  time: '10:29',
  question: 'Who else knows how the billing cron jobs work?',
  answer: "Only Imran, as far as the records show. He's the one owner in the billing runbook, and nobody else has changed those jobs in GitHub this year.",
  sources: ['Billing runbook, Platform wiki', 'GitHub, kestrel/billing-jobs'],
};

const decisions: MeetingDecision[] = [
  { id: 'd1', text: 'Load-test the order service before the sale.', detail: 'Two engineers for three days.', by: 'Sana Kulkarni', time: '10:17' },
  { id: 'd2', text: 'Give the sandbox vendor until Monday.', detail: 'If access is still blocked, compare other vendors.', by: 'Sana Kulkarni', time: '10:25' },
];

const actions: ActionItem[] = [
  { id: 'a1', task: 'Book a load-test environment and plan the test', owner: 'Imran Sheikh', due: 'Mon, Sep 28', destination: 'New Jira ticket, PLAT', actionLabel: 'Create ticket', doneLabel: 'Created PLAT-342', status: 'pending' },
  { id: 'a2', task: 'Escalate sandbox access with the vendor', owner: 'Neha Rao', due: 'Today', destination: 'Comment on PAY-88', actionLabel: 'Add comment', doneLabel: 'Added to PAY-88', status: 'pending' },
  { id: 'a3', task: 'Pair someone on the billing cron jobs', owner: 'Imran Sheikh', due: 'This sprint', destination: 'New Jira ticket, PLAT', actionLabel: 'Create ticket', doneLabel: 'Created PLAT-343', status: 'pending' },
  { id: 'a4', task: 'Get design sign-off for mobile 3.4', owner: 'Kavya Menon', due: 'Fri, Sep 25', destination: 'Comment on MOB-120', actionLabel: 'Add comment', doneLabel: 'Added to MOB-120', status: 'pending' },
];

/** What the live view shows when you open it partway through the call. */
export const liveSnapshot = {
  meetingId: 'eng-weekly',
  elapsedSeconds: 31 * 60 + 48,
  transcript: [
    line('t1', 'imran', 'Imran Sheikh', '10:14', 'Astro, when did we last load-test the order service?'),
    line('t2', 'astro', 'Astro', '10:14', "In May 2024, before the switch to Kafka. There hasn't been one since."),
    line('t3', 'sana', 'Sana Kulkarni', '10:17', 'Then we run one before the sale. Imran, can you spare two people for three days?'),
    line('t4', 'imran', 'Imran Sheikh', '10:18', "Yes. I'll book the environment by Monday."),
    line('t5', 'neha', 'Neha Rao', '10:24', "Payments sandbox is still blocked. I'll escalate with the vendor today."),
    line('t6', 'sana', 'Sana Kulkarni', '10:25', "If it's still blocked on Monday, we look at other vendors."),
  ],
  answers: [loadTestAnswer],
  decisions,
  actions: [actions[0], actions[1]],
};

/** Mock mode replays these after the snapshot, one every `delayMs`. */
export const liveScript: { delayMs: number; event: MeetingLiveEvent }[] = [
  { delayMs: 2500, event: { type: 'speaking', participantId: 'sana' } },
  { delayMs: 1200, event: { type: 'transcript', line: line('t7', 'sana', 'Sana Kulkarni', '10:29', 'Astro, who else knows how the billing cron jobs work?') } },
  { delayMs: 1500, event: { type: 'speaking', participantId: 'astro' } },
  { delayMs: 1800, event: { type: 'transcript', line: line('t8', 'astro', 'Astro', '10:30', cronAnswer.answer) } },
  { delayMs: 200, event: { type: 'answer', answer: cronAnswer } },
  { delayMs: 2600, event: { type: 'speaking', participantId: 'sana' } },
  { delayMs: 1200, event: { type: 'transcript', line: line('t9', 'sana', 'Sana Kulkarni', '10:31', 'Imran, pair someone with you on those this sprint.') } },
  { delayMs: 400, event: { type: 'action', item: actions[2] } },
  { delayMs: 1500, event: { type: 'speaking', participantId: null } },
];

export const privateStarter = {
  id: 'p1',
  question: 'Before I commit a date: what does the vendor contract say about sandbox support?',
  answer: "It promises a reply within two business days for sandbox issues. It doesn't promise uptime. Tuesday's request reaches two business days today.",
  source: 'Vendor contract, section 7.2',
  status: 'done' as const,
};

export const agendaLeft = 'From this morning’s brief: mobile release 3.4 and three pull requests waiting on review.';

export const engineeringRecap: MeetingRecap = {
  meetingId: 'eng-weekly',
  title: 'Engineering meeting',
  when: 'Today, 10:00 to 10:42',
  platform: 'meet',
  attendees: [
    { name: 'Sana Kulkarni', initials: 'SK', role: 'CTO' },
    { name: 'Imran Sheikh', initials: 'IS', role: 'Platform lead' },
    { name: 'Neha Rao', initials: 'NR', role: 'Payments lead' },
    { name: 'Kavya Menon', initials: 'KM', role: 'Mobile lead' },
    { name: 'Aarav Mehta', initials: 'AM', role: 'Engineer, Platform team' },
  ],
  summary:
    "The team agreed to load-test the order service before next month's sale, and to give the payments sandbox vendor until Monday before comparing others. Imran is still the only person who knows the billing cron jobs, so he'll pair someone on them this sprint. Mobile 3.4 is waiting on design sign-off, which Kavya expects by Friday.",
  decisions,
  answers: [loadTestAnswer, cronAnswer],
  actionItems: actions,
  followUp: {
    channel: '#eng-leads',
    lines: [
      'Decided: load-test the order service before the sale. The sandbox vendor has until Monday.',
      'Imran: book the load-test environment by Monday, and pair someone on the billing cron jobs this sprint.',
      'Neha: escalate sandbox access today. Kavya: design sign-off for mobile 3.4 by Friday.',
    ],
  },
  retention: "Only attendees can open this recap and the transcript. Both are kept for 90 days, per Kestrel Labs' retention setting.",
};
