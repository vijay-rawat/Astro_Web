import { useCallback, useEffect, useRef } from 'react';

/**
 * Loudness of the microphone, 0 to 1, for the orb's glow. Nothing is recorded or sent anywhere:
 * an AnalyserNode is read on demand by the orb's own animation frame (`sample`), so there is no
 * extra render loop and no React state per frame.
 */
export function useMicLevel() {
  const stream = useRef<MediaStream | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const buffer = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const smoothed = useRef(0);

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void ctx.current?.close().catch(() => undefined);
    ctx.current = null;
    analyser.current = null;
    smoothed.current = 0;
  }, []);

  const start = useCallback(async () => {
    if (analyser.current || !navigator.mediaDevices?.getUserMedia) return;
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      const audio = new AudioContext();
      const node = audio.createAnalyser();
      node.fftSize = 256;
      node.smoothingTimeConstant = 0.6;
      audio.createMediaStreamSource(media).connect(node);
      stream.current = media;
      ctx.current = audio;
      analyser.current = node;
      buffer.current = new Uint8Array(new ArrayBuffer(node.fftSize));
    } catch {
      // No level meter (permission or device); the orb falls back to its own pulse.
    }
  }, []);

  const sample = useCallback((): number => {
    const node = analyser.current;
    const buf = buffer.current;
    if (!node || !buf) return 0;
    node.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.min(1, Math.sqrt(sum / buf.length) * 4);
    smoothed.current += (rms - smoothed.current) * 0.25;
    return smoothed.current;
  }, []);

  useEffect(() => stop, [stop]);

  return { start, stop, sample };
}
