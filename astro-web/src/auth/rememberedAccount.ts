import type { Session } from '../api/auth';

/**
 * The last account used on this device, so the Login page can say "Speak as Aarav" instead of
 * asking for an email every time. Only public profile details are kept: never a password,
 * passphrase or token. Removed with "Not you?".
 */
export interface RememberedAccount {
  email: string;
  name: string;
  initials: string;
  voiceEnabled: boolean;
}

const KEY = 'astro-account';

export function readRemembered(): RememberedAccount | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as RememberedAccount;
    return typeof v.email === 'string' ? v : null;
  } catch {
    return null;
  }
}

export function remember(session: Session): void {
  const { email, name, initials, voiceEnabled } = session.user;
  try {
    localStorage.setItem(KEY, JSON.stringify({ email, name, initials, voiceEnabled }));
  } catch {
    // Storage blocked: the page just asks for the email next time.
  }
}

export function forgetRemembered(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing to do
  }
}
