import type { Session } from './api/auth';

/**
 * The sample session used when VITE_AUTH=mock (no backend). With VITE_AUTH=api (the default) the
 * real user and company come from GET /api/me.
 */
export const mockSession: Session = {
  user: {
    id: 'u_aarav',
    name: 'Aarav Mehta',
    email: 'aarav@kestrel.io',
    initials: 'AM',
    roles: ['admin', 'member'],
    roleLabel: 'Engineer, Platform team',
    canManage: true,
    voiceEnabled: false,
  },
  company: {
    id: 'kestrel-labs',
    name: 'Kestrel Labs',
    initials: 'KL',
    preset: 'technology',
    presetLabel: 'Technology',
  },
};
