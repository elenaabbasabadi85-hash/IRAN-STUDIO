'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';

export type DeviceErrorKind = 'denied' | 'notFound' | 'inUse' | 'insecure' | 'unsupported' | 'unknown';

export interface DeviceOption {
  deviceId: string;
  label: string;
}

function classifyError(error: unknown): DeviceErrorKind {
  const name = error instanceof DOMException || error instanceof Error ? error.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'denied';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'notFound';
    case 'NotReadableError':
    case 'AbortError':
      return 'inUse';
    default:
      return 'unknown';
  }
}

function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

// Owns the camera/microphone stream. Every track is stopped on stop() and on unmount.
export function useMediaDevices() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<DeviceErrorKind | null>(null);
  const [cameras, setCameras] = useState<DeviceOption[]>([]);
  const [microphones, setMicrophones] = useState<DeviceOption[]>([]);
  const [cameraId, setCameraId] = useState<string>('');
  const [micId, setMicId] = useState<string>('');
  const streamRef = useRef<MediaStream | null>(null);
  const requestRef = useRef(0);

  const start = useCallback(async (nextCameraId?: string, nextMicId?: string) => {
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setError('insecure');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('unsupported');
      return;
    }

    const request = ++requestRef.current;
    setStarting(true);
    setError(null);
    // Release the old devices first: some phones cannot open two cameras at once.
    stopStream(streamRef.current);
    streamRef.current = null;
    setStream(null);

    try {
      const next = await navigator.mediaDevices.getUserMedia({
        video: nextCameraId
          ? { deviceId: { exact: nextCameraId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: {
          ...(nextMicId ? { deviceId: { exact: nextMicId } } : {}),
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      if (request !== requestRef.current) {
        stopStream(next);
        return;
      }
      streamRef.current = next;
      setStream(next);

      // Device labels are only filled in after permission has been granted.
      const devices = await navigator.mediaDevices.enumerateDevices();
      const toOptions = (kind: MediaDeviceKind) =>
        devices
          .filter((device) => device.kind === kind && device.deviceId)
          .map((device) => ({ deviceId: device.deviceId, label: device.label }));
      setCameras(toOptions('videoinput'));
      setMicrophones(toOptions('audioinput'));
      setCameraId(next.getVideoTracks()[0]?.getSettings().deviceId ?? nextCameraId ?? '');
      setMicId(next.getAudioTracks()[0]?.getSettings().deviceId ?? nextMicId ?? '');
    } catch (err) {
      if (request === requestRef.current) setError(classifyError(err));
    } finally {
      if (request === requestRef.current) setStarting(false);
    }
  }, []);

  const stop = useCallback(() => {
    requestRef.current++;
    stopStream(streamRef.current);
    streamRef.current = null;
    setStream(null);
    setStarting(false);
  }, []);

  // Runs on unmount and also when Next.js hides the page with <Activity> after navigation,
  // which keeps state alive: reset it so a dead stream is not shown on return.
  useLayoutEffect(() => {
    const request = requestRef;
    return () => {
      request.current++;
      stopStream(streamRef.current);
      streamRef.current = null;
      setStream(null);
      setStarting(false);
    };
  }, []);

  return { stream, starting, error, cameras, microphones, cameraId, micId, start, stop };
}
