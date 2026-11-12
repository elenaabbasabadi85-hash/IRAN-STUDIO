'use client';

import { useEffect, useRef, type ReactNode } from 'react';

// Only a real mouse (or pen) on a device that can hover, and only if motion is welcome.
const ENABLE_QUERY = '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)';
// Time constant of the easing: each frame closes part of the gap to the pointer, never all of it.
const EASE_MS = 220;
// Closer than this to the target counts as arrived, and the loop stops.
const REST = 0.0005;

const clamp = (n: number) => Math.max(-1, Math.min(1, n));

// Root of the hero backdrop. It follows the mouse over the whole hero (its parent section) and
// writes the eased position, from -1 to 1 on each axis, to --hero-bd-px and --hero-bd-py.
// hero-backdrop.css turns those two numbers into small shifts and tilts. Nothing here is React
// state: the values live in the effect and go straight to the element's style, so moving the
// mouse never re-renders anything. Without a mouse, or with reduced motion, no listener is
// attached and the variables keep their CSS default of 0.
export function HeroParallax({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const hero = root?.parentElement;
    if (!root || !hero) return;

    const query = window.matchMedia(ENABLE_QUERY);
    let pointer: { x: number; y: number } | null = null;
    let targetX = 0;
    let targetY = 0;
    let x = 0;
    let y = 0;
    let frame = 0;
    let last = 0;
    let listening = false;
    let visible = false;

    const write = () => {
      root.style.setProperty('--hero-bd-px', x.toFixed(4));
      root.style.setProperty('--hero-bd-py', y.toFixed(4));
    };

    const stop = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
    };

    const tick = (now: number) => {
      frame = 0;
      if (pointer) {
        const rect = hero.getBoundingClientRect();
        targetX = clamp(((pointer.x - rect.left) / rect.width) * 2 - 1);
        targetY = clamp(((pointer.y - rect.top) / rect.height) * 2 - 1);
      }
      // Ease by elapsed time, so the feel is the same at 60 and 144 frames a second.
      const dt = last ? Math.min(Math.max(now - last, 0), 100) : 16;
      last = now;
      const k = 1 - Math.exp(-dt / EASE_MS);
      x += (targetX - x) * k;
      y += (targetY - y) * k;

      if (Math.abs(targetX - x) < REST && Math.abs(targetY - y) < REST) {
        x = targetX;
        y = targetY;
        write();
        last = 0;
        return;
      }
      write();
      schedule();
    };

    // The loop runs only while there is something to ease and the hero is on screen.
    function schedule() {
      if (!frame && listening && visible) frame = requestAnimationFrame(tick);
    }

    const onMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      pointer = { x: event.clientX, y: event.clientY };
      schedule();
    };

    // The mouse left the hero: ease back to rest.
    const onLeave = () => {
      pointer = null;
      targetX = 0;
      targetY = 0;
      schedule();
    };

    const enable = () => {
      if (listening) return;
      listening = true;
      hero.addEventListener('pointermove', onMove, { passive: true });
      hero.addEventListener('pointerleave', onLeave);
      hero.addEventListener('pointercancel', onLeave);
    };

    const disable = () => {
      if (listening) {
        hero.removeEventListener('pointermove', onMove);
        hero.removeEventListener('pointerleave', onLeave);
        hero.removeEventListener('pointercancel', onLeave);
      }
      listening = false;
      stop();
      pointer = null;
      targetX = targetY = x = y = 0;
      root.style.removeProperty('--hero-bd-px');
      root.style.removeProperty('--hero-bd-py');
    };

    const sync = () => (query.matches ? enable() : disable());
    sync();
    query.addEventListener('change', sync);

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      // Back on screen: carry on only if an ease was cut short.
      if (!visible) stop();
      else if (pointer || x !== targetX || y !== targetY) schedule();
    });
    observer.observe(hero);

    return () => {
      query.removeEventListener('change', sync);
      observer.disconnect();
      disable();
    };
  }, []);

  return (
    <div ref={rootRef} aria-hidden="true" className="hero-bd">
      {children}
    </div>
  );
}
