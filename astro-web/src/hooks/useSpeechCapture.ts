import { useCallback, useEffect, useRef, useState } from 'react';

// Web Speech API, typed just enough for a one-shot capture.
interface Alternative {
  transcript: string;
}
interface Result {
  isFinal: boolean;
  length: number;
  [index: number]: Alternative;
}
interface ResultEvent {
  results: ArrayLike<Result>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  processLocally?: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: ResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
  onaudiostart: (() => void) | null;
}
interface RecognitionStatic {
  new (): Recognition;
  available?: (opts: { langs: string[]; processLocally: boolean }) => Promise<string>;
}

const Impl: RecognitionStatic | undefined =
  typeof window === 'undefined'
    ? undefined
    : ((window as unknown as { SpeechRecognition?: RecognitionStatic }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: RecognitionStatic }).webkitSpeechRecognition);

export const speechSupported = Boolean(Impl);

export type CaptureError = 'denied' | 'no-speech' | 'unsupported' | 'network' | 'failed';

export interface CaptureResult {
  /** Up to three alternatives, best first. Empty if nothing was heard. */
  alternatives: string[];
}

const LISTEN_LIMIT_MS = 9000;

/** Is on-device recognition available for this language? Checked once, never assumed. */
async function localAvailable(lang: string): Promise<boolean> {
  if (!Impl?.available || !('processLocally' in Impl.prototype)) return false;
  try {
    return (await Impl.available({ langs: [lang], processLocally: true })) === 'available';
  } catch {
    return false;
  }
}

/**
 * One-shot speech capture for the voice passphrase.
 *
 * Uses on-device recognition where the browser offers it, otherwise the browser's own speech
 * service. Interim text is never produced, so nothing of the phrase appears on screen while it
 * is spoken. Stops by itself after one phrase or LISTEN_LIMIT_MS.
 */
export function useSpeechCapture(lang = typeof navigator !== 'undefined' ? navigator.language || 'en-US' : 'en-US') {
  const recRef = useRef<Recognition | null>(null);
  const [listening, setListening] = useState(false);
  const [hearing, setHearing] = useState(false);
  const [onDevice, setOnDevice] = useState(false);

  useEffect(() => {
    let alive = true;
    void localAvailable(lang).then((ok) => alive && setOnDevice(ok));
    return () => {
      alive = false;
      recRef.current?.abort();
    };
  }, [lang]);

  const capture = useCallback((): Promise<CaptureResult> => {
    if (!Impl) return Promise.reject<CaptureResult>('unsupported' satisfies CaptureError);
    recRef.current?.abort();
    const rec = new Impl();
    recRef.current = rec;
    rec.lang = lang;
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 3;
    if (onDevice && 'processLocally' in rec) rec.processLocally = true;

    return new Promise<CaptureResult>((resolve, reject) => {
      let alternatives: string[] = [];
      let failure: CaptureError | null = null;
      const timer = window.setTimeout(() => rec.stop(), LISTEN_LIMIT_MS);

      rec.onaudiostart = () => setListening(true);
      rec.onspeechstart = () => setHearing(true);
      rec.onspeechend = () => setHearing(false);
      rec.onresult = (e) => {
        const last = e.results[e.results.length - 1];
        if (!last?.isFinal) return;
        alternatives = Array.from({ length: last.length }, (_, i) => last[i].transcript.trim()).filter(Boolean);
      };
      rec.onerror = (e) => {
        failure =
          e.error === 'not-allowed' || e.error === 'service-not-allowed'
            ? 'denied'
            : e.error === 'no-speech' || e.error === 'aborted'
              ? 'no-speech'
              : e.error === 'network'
                ? 'network'
                : 'failed';
      };
      rec.onend = () => {
        window.clearTimeout(timer);
        setListening(false);
        setHearing(false);
        if (recRef.current === rec) recRef.current = null;
        if (failure && failure !== 'no-speech') reject(failure);
        else resolve({ alternatives });
      };
      try {
        rec.start();
      } catch {
        window.clearTimeout(timer);
        reject('failed' satisfies CaptureError);
      }
    });
  }, [lang, onDevice]);

  const cancel = useCallback(() => recRef.current?.abort(), []);

  return { supported: speechSupported, onDevice, listening, hearing, capture, cancel };
}
