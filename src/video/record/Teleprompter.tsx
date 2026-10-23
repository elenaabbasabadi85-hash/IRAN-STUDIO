'use client';

import { useEffect, useRef, useState } from 'react';
import strings from './strings.fa.json';

const t = strings.prompter;

interface TeleprompterProps {
  text: string;
  onTextChange: (text: string) => void;
  playing: boolean;
  onPlayingChange: (playing: boolean) => void;
  // While recording, the text cannot be edited.
  locked: boolean;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export default function Teleprompter({ text, onTextChange, playing, onPlayingChange, locked }: TeleprompterProps) {
  const [speed, setSpeed] = useState(40); // pixels per second
  const [fontSize, setFontSize] = useState(32);
  const [mirror, setMirror] = useState(false);
  const [editing, setEditing] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const positionRef = useRef(0);

  const hasText = text.trim().length > 0;
  const showEditor = !locked && (editing || !hasText);

  useEffect(() => {
    if (!playing) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;
    // scrollTop is rounded by the browser, so keep the exact position separately.
    positionRef.current = scroller.scrollTop;
    let last = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const dt = (now - last) / 1000;
      last = now;
      positionRef.current += speed * dt;
      scroller.scrollTop = positionRef.current;
      if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1) {
        onPlayingChange(false);
        return;
      }
      frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, onPlayingChange]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat || isEditableTarget(event.target)) return;
      if (!hasText) return;
      event.preventDefault();
      onPlayingChange(!playing);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [playing, hasText, onPlayingChange]);

  const restart = () => {
    positionRef.current = 0;
    if (scrollerRef.current) scrollerRef.current.scrollTop = 0;
  };

  return (
    <section aria-label={t.title} className="flex flex-col gap-2 rounded-lg bg-[#041E42] p-3 text-[#F5F1EA]">
      {showEditor ? (
        <div className="flex flex-col gap-2">
          <textarea
            dir="rtl"
            value={text}
            onChange={(event) => onTextChange(event.target.value)}
            placeholder={t.pastePlaceholder}
            rows={6}
            className="w-full rounded border border-[#2B4C7E] bg-[#041E42] p-3 leading-8 text-[#F5F1EA] placeholder:text-[#8A8D91]"
          />
          {hasText && (
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="self-start rounded border border-[#F5F1EA] px-3 py-1 text-sm"
            >
              {t.done}
            </button>
          )}
        </div>
      ) : (
        <div className="relative">
          {/* Reading line: keep the eyes here, right under the camera lens. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-[25%] z-10 border-t-2 border-[#FF2D46]/70"
          />
          <div
            ref={scrollerRef}
            dir="rtl"
            className="h-[34vh] min-h-48 overflow-y-auto overscroll-contain"
            style={{ transform: mirror ? 'scaleX(-1)' : undefined }}
          >
            <p
              className="whitespace-pre-wrap px-2 pb-[34vh] pt-[8vh] text-center font-bold"
              style={{ fontSize, lineHeight: 1.7, fontFamily: 'Vazirmatn, Tahoma, sans-serif' }}
            >
              {hasText ? text : t.empty}
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <button
          type="button"
          disabled={!hasText || showEditor}
          onClick={() => onPlayingChange(!playing)}
          className="rounded border border-[#F5F1EA] px-3 py-1 disabled:opacity-40"
        >
          {playing ? t.pause : t.play}
        </button>
        <button
          type="button"
          disabled={!hasText || showEditor}
          onClick={restart}
          className="rounded border border-[#F5F1EA] px-3 py-1 disabled:opacity-40"
        >
          {t.restart}
        </button>
        <label className="flex items-center gap-2">
          {t.speed}
          <input
            type="range"
            min={10}
            max={150}
            step={5}
            value={speed}
            onChange={(event) => setSpeed(Number(event.target.value))}
          />
        </label>
        <label className="flex items-center gap-2">
          {t.fontSize}
          <input
            type="range"
            min={18}
            max={72}
            step={2}
            value={fontSize}
            onChange={(event) => setFontSize(Number(event.target.value))}
          />
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={mirror} onChange={(event) => setMirror(event.target.checked)} />
          {t.mirror}
        </label>
        {hasText && !showEditor && !locked && (
          <button
            type="button"
            onClick={() => {
              onPlayingChange(false);
              setEditing(true);
            }}
            className="rounded border border-[#F5F1EA] px-3 py-1"
          >
            {t.editText}
          </button>
        )}
        <span className="hidden text-[#8A8D91] sm:inline">{t.spaceHint}</span>
      </div>
    </section>
  );
}
