import { useCallback, useEffect, useRef, useState } from 'react';

// Minimal Web Speech API types (not in TypeScript's DOM lib everywhere).
interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResult {
  isFinal: boolean;
  0: RecognitionAlternative;
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: RecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
}
type RecognitionCtor = new () => Recognition;

const RecognitionImpl: RecognitionCtor | undefined =
  typeof window === 'undefined'
    ? undefined
    : ((window as unknown as { SpeechRecognition?: RecognitionCtor }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: RecognitionCtor }).webkitSpeechRecognition);

interface Options {
  onFinal: (transcript: string) => void;
  lang?: string;
}

/**
 * Browser speech in and out. Recognition pauses while Astro is talking so it
 * doesn't transcribe itself. Swap for a streaming STT/TTS service later.
 */
export function useVoice({ onFinal, lang = 'en-IN' }: Options) {
  const supported = Boolean(RecognitionImpl);
  const recRef = useRef<Recognition | null>(null);
  const wantListening = useRef(false);
  const speakingRef = useRef(false);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);

  const safeStart = (rec: Recognition) => {
    try {
      rec.start();
      setListening(true);
    } catch {
      // start() throws if it is already running; that's fine.
    }
  };

  const getRecognition = useCallback(() => {
    if (!RecognitionImpl) return null;
    if (recRef.current) return recRef.current;
    const rec = new RecognitionImpl();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = lang;
    rec.onresult = (event) => {
      let pending = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;
        if (result.isFinal) {
          const clean = text.trim();
          if (clean) onFinalRef.current(clean);
        } else {
          pending += text;
        }
      }
      setInterim(pending);
    };
    rec.onend = () => {
      setListening(false);
      if (wantListening.current && !speakingRef.current) safeStart(rec);
    };
    rec.onerror = (event) => {
      if (event.error === 'not-allowed') {
        wantListening.current = false;
        setError('Microphone access was blocked. Allow it in your browser settings, or type instead.');
      }
    };
    recRef.current = rec;
    return rec;
  }, [lang]);

  const start = useCallback(() => {
    wantListening.current = true;
    setError(null);
    const rec = getRecognition();
    if (rec && !speakingRef.current) safeStart(rec);
  }, [getRecognition]);

  const stop = useCallback(() => {
    wantListening.current = false;
    recRef.current?.stop();
    setListening(false);
    setInterim('');
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!text || !('speechSynthesis' in window)) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      speakingRef.current = true;
      setSpeaking(true);
      recRef.current?.stop();
      const resume = () => {
        speakingRef.current = false;
        setSpeaking(false);
        if (wantListening.current && recRef.current) safeStart(recRef.current);
      };
      utterance.onend = resume;
      utterance.onerror = resume;
      window.speechSynthesis.speak(utterance);
    },
    [lang],
  );

  const silence = useCallback(() => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);

  useEffect(
    () => () => {
      wantListening.current = false;
      recRef.current?.abort();
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    },
    [],
  );

  return { supported, listening, speaking, interim, error, start, stop, speak, silence };
}
