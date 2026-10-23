'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { pickRecorderMimeType } from './mime';

export type RecorderPhase = 'idle' | 'countdown' | 'recording' | 'paused' | 'stopped';

export interface Recording {
  blob: Blob;
  url: string;
  durationSec: number;
}

const COUNTDOWN_SECONDS = 3;

export function useRecorder(stream: MediaStream | null) {
  const [phase, setPhase] = useState<RecorderPhase>('idle');
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [failed, setFailed] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const countdownTimerRef = useRef<number | null>(null);
  const tickTimerRef = useRef<number | null>(null);
  // Recorded time = time banked before the last pause + time since the last resume.
  const bankedMsRef = useRef(0);
  const segmentStartRef = useRef<number | null>(null);
  const urlRef = useRef<string | null>(null);

  const currentElapsed = () =>
    bankedMsRef.current + (segmentStartRef.current === null ? 0 : performance.now() - segmentStartRef.current);

  const clearTimers = () => {
    if (countdownTimerRef.current !== null) window.clearInterval(countdownTimerRef.current);
    if (tickTimerRef.current !== null) window.clearInterval(tickTimerRef.current);
    countdownTimerRef.current = null;
    tickTimerRef.current = null;
  };

  const startTicking = useCallback(() => {
    if (tickTimerRef.current !== null) window.clearInterval(tickTimerRef.current);
    tickTimerRef.current = window.setInterval(
      () =>
        setElapsedMs(
          bankedMsRef.current +
            (segmentStartRef.current === null ? 0 : performance.now() - segmentStartRef.current),
        ),
      250,
    );
  }, []);

  const revokeUrl = () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
  };

  const beginRecording = useCallback(() => {
    if (!stream) {
      setPhase('idle');
      return;
    }
    const mimeType = pickRecorderMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: 2_500_000,
        audioBitsPerSecond: 128_000,
      });
    } catch {
      setFailed(true);
      setPhase('idle');
      return;
    }

    chunksRef.current = [];
    bankedMsRef.current = 0;
    segmentStartRef.current = performance.now();

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onerror = () => {
      setFailed(true);
    };
    recorder.onstop = () => {
      clearTimers();
      const durationMs = currentElapsed();
      bankedMsRef.current = durationMs;
      segmentStartRef.current = null;
      const type = recorder.mimeType || mimeType || 'video/webm';
      const blob = new Blob(chunksRef.current, { type });
      chunksRef.current = [];
      recorderRef.current = null;
      if (blob.size === 0) {
        setFailed(true);
        setPhase('idle');
        return;
      }
      revokeUrl();
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      setElapsedMs(durationMs);
      setRecording({ blob, url, durationSec: durationMs / 1000 });
      setPhase('stopped');
    };

    recorderRef.current = recorder;
    // A timeslice delivers data every second, so a long take is not one huge final chunk.
    recorder.start(1000);
    setElapsedMs(0);
    setPhase('recording');
    startTicking();
  }, [stream, startTicking]);

  const start = useCallback(() => {
    if (!stream) return;
    setFailed(false);
    revokeUrl();
    setRecording(null);
    setCountdown(COUNTDOWN_SECONDS);
    setPhase('countdown');
    let remaining = COUNTDOWN_SECONDS;
    clearTimers();
    countdownTimerRef.current = window.setInterval(() => {
      remaining -= 1;
      if (remaining > 0) {
        setCountdown(remaining);
        return;
      }
      if (countdownTimerRef.current !== null) window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
      beginRecording();
    }, 1000);
  }, [stream, beginRecording]);

  const cancelCountdown = useCallback(() => {
    clearTimers();
    setPhase('idle');
  }, []);

  const pause = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== 'recording') return;
    recorder.pause();
    bankedMsRef.current = currentElapsed();
    segmentStartRef.current = null;
    if (tickTimerRef.current !== null) window.clearInterval(tickTimerRef.current);
    tickTimerRef.current = null;
    setElapsedMs(bankedMsRef.current);
    setPhase('paused');
  }, []);

  const resume = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== 'paused') return;
    recorder.resume();
    segmentStartRef.current = performance.now();
    startTicking();
    setPhase('recording');
  }, [startTicking]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    recorder.stop();
  }, []);

  const reset = useCallback(() => {
    clearTimers();
    revokeUrl();
    setRecording(null);
    setElapsedMs(0);
    setFailed(false);
    setPhase('idle');
  }, []);

  // If the camera goes away mid-take (device unplugged, permission revoked), finish the take.
  useEffect(() => {
    if (stream) return;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  }, [stream]);

  // Leaving the page discards an unsaved take. Layout cleanup also runs when Next.js hides the
  // page with <Activity>, so state is reset too, not only the recorder.
  useLayoutEffect(() => {
    return () => {
      clearTimers();
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        recorder.onstop = null;
        recorder.stop();
      }
      recorderRef.current = null;
      revokeUrl();
      setRecording(null);
      setElapsedMs(0);
      setPhase('idle');
    };
  }, []);

  return { phase, countdown, elapsedMs, recording, failed, start, cancelCountdown, pause, resume, stop, reset };
}
