'use client';

import { useEffect, useRef, type ReactNode } from 'react';

// Motion is welcome. With reduced motion the backdrop is a still picture and nothing below runs.
const MOTION_QUERY = '(prefers-reduced-motion: no-preference)';
// Only a real mouse (or pen) on a device that can hover, and only in the wide layout (from 64rem,
// as in hero-backdrop.css): the compact layout has no room to move, and touch devices have no mouse.
const MOUSE_QUERY = '(hover: hover) and (pointer: fine) and (min-width: 64rem)';
// Set on the root while the hero is off screen; hero-backdrop.css pauses every animation under it.
const PAUSED = 'data-hero-bd-paused';
// Time constant of the easing: each frame closes part of the gap to the pointer, never all of it.
const EASE_MS = 220;
// Closer than this to the target counts as arrived, and the loop stops.
const REST = 0.0005;

const clamp = (n: number) => Math.max(-1, Math.min(1, n));

// Root of the hero backdrop. It does two things, both only while motion is welcome:
//
// 1. It watches whether the hero (its parent section) is on screen and marks the root while it is
//    not, so the CSS animations of the backdrop stop running behind the rest of the page.
// 2. In the wide layout, with a mouse, it follows the pointer over the whole hero and writes the
//    eased position, from -1 to 1 on each axis, to --hero-bd-px and --hero-bd-py.
//    hero-backdrop.css turns those two numbers into small shifts and tilts.
//
// Nothing here is React state: the values live in the effect and go straight to the element, so
// moving the mouse never re-renders anything. With reduced motion there is no observer and no
// pointer listener, and on a touch device or in the compact layout no pointer listener; the
// variables then keep their CSS default of 0. The only thing always listening is the pair of media
// queries, so a change of the setting or of the window's width takes effect without a reload.
export function HeroParallax({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const hero = root?.parentElement;
    if (!root || !hero) return;

    const motion = window.matchMedia(MOTION_QUERY);
    const mouse = window.matchMedia(MOUSE_QUERY);
    let observer: IntersectionObserver | null = null;
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

    const follow = () => {
      if (listening) return;
      listening = true;
      hero.addEventListener('pointermove', onMove, { passive: true });
      hero.addEventListener('pointerleave', onLeave);
      hero.addEventListener('pointercancel', onLeave);
    };

    const unfollow = () => {
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

    const watch = () => {
      if (observer) return;
      observer = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        root.toggleAttribute(PAUSED, !visible);
        // Back on screen: carry on only if an ease was cut short.
        if (!visible) stop();
        else if (pointer || x !== targetX || y !== targetY) schedule();
      });
      observer.observe(hero);
    };

    const unwatch = () => {
      observer?.disconnect();
      observer = null;
      visible = false;
      root.removeAttribute(PAUSED);
    };

    const sync = () => {
      if (motion.matches) watch();
      else unwatch();
      if (motion.matches && mouse.matches) follow();
      else unfollow();
    };
    sync();
    motion.addEventListener('change', sync);
    mouse.addEventListener('change', sync);

    return () => {
      motion.removeEventListener('change', sync);
      mouse.removeEventListener('change', sync);
      unwatch();
      unfollow();
    };
  }, []);

  return (
    <div ref={rootRef} aria-hidden="true" className="hero-bd">
      {children}
    </div>
  );
}
