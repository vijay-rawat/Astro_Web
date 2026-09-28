import { useCallback, useEffect, useState } from 'react';

export type ThemePref = 'system' | 'light' | 'dark';

// Keep in sync with the inline script in index.html, which applies the saved
// theme before the first paint so there is no flash.
const STORAGE_KEY = 'astro-theme';
const CHANGE_EVENT = 'astro-theme-change';

function readPref(): ThemePref {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  } catch {
    // Storage blocked (private window, previews): fall back to the system theme.
  }
  return 'system';
}

let fadeTimer: ReturnType<typeof setTimeout> | undefined;

function applyPref(pref: ThemePref) {
  const root = document.documentElement;
  // Cross-fade colors only while switching, so everyday hovers stay instant.
  root.classList.add('theme-fade');
  clearTimeout(fadeTimer);
  fadeTimer = setTimeout(() => root.classList.remove('theme-fade'), 450);
  if (pref === 'system') delete root.dataset.theme;
  else root.dataset.theme = pref;
}

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

/** The user's theme choice and the theme actually showing. */
export function useTheme() {
  const [pref, setPrefState] = useState<ThemePref>(readPref);
  const [systemDark, setSystemDark] = useState(() => darkQuery().matches);

  useEffect(() => {
    const mq = darkQuery();
    const onSystem = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    // Keeps every mounted switch in sync when any one of them changes the theme.
    const onPref = (e: Event) => setPrefState((e as CustomEvent<ThemePref>).detail);
    mq.addEventListener('change', onSystem);
    window.addEventListener(CHANGE_EVENT, onPref);
    return () => {
      mq.removeEventListener('change', onSystem);
      window.removeEventListener(CHANGE_EVENT, onPref);
    };
  }, []);

  const setPref = useCallback((next: ThemePref) => {
    applyPref(next);
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: next }));
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not persisted; the choice still applies for this visit.
    }
  }, []);

  const resolved: 'light' | 'dark' = pref === 'system' ? (systemDark ? 'dark' : 'light') : pref;
  return { pref, resolved, setPref };
}
