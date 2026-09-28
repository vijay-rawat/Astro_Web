import { api } from './http';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  initials: string;
  roles: string[];
  roleLabel: string;
  canManage: boolean;
  voiceEnabled: boolean;
}

export interface SessionCompany {
  id: string;
  name: string;
  initials: string;
  preset: string;
  presetLabel: string;
}

/** GET /api/me */
export interface Session {
  user: SessionUser;
  company: SessionCompany;
}

export interface DeviceSession {
  id: string;
  current: boolean;
  method: 'password' | 'voice' | 'link';
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  ip: string | null;
  userAgent: string | null;
}

// Sign-in calls handle their own 401s, so they don't broadcast "signed out".
const quiet = { signalSignedOut: false } as const;

export const authApi = {
  me: () => api<Session>('/me', quiet),
  login: (email: string, password: string, remember: boolean) =>
    api<Session>('/auth/login', { method: 'POST', json: { email, password, remember }, ...quiet }),
  voiceLogin: (email: string, transcripts: string[], remember: boolean) =>
    api<Session>('/auth/voice-login', { method: 'POST', json: { email, transcripts, remember }, ...quiet }),
  signup: (name: string, email: string, password: string, companyName?: string) =>
    api<{ status: string }>('/auth/signup', {
      method: 'POST',
      json: { name, email, password, companyName: companyName || null },
      ...quiet,
    }),
  verifyEmail: (token: string) => api<Session>('/auth/verify-email', { method: 'POST', json: { token }, ...quiet }),
  resendVerification: (email: string) =>
    api<{ status: string }>('/auth/resend-verification', { method: 'POST', json: { email }, ...quiet }),
  forgotPassword: (email: string) =>
    api<{ status: string }>('/auth/forgot-password', { method: 'POST', json: { email }, ...quiet }),
  resetPassword: (token: string, password: string) =>
    api<Session>('/auth/reset-password', { method: 'POST', json: { token, password }, ...quiet }),
  logout: () => api<void>('/auth/logout', { method: 'POST', ...quiet }),
  logoutAll: () => api<void>('/auth/logout-all', { method: 'POST', ...quiet }),
  sessions: () => api<DeviceSession[]>('/auth/sessions'),
  setVoicePassphrase: (password: string, phrase: string, confirm: string) =>
    api<void>('/auth/voice-passphrase', { method: 'PUT', json: { password, phrase, confirm } }),
  removeVoicePassphrase: (password: string) =>
    api<void>('/auth/voice-passphrase', { method: 'DELETE', json: { password } }),
};
