'use client';

import { useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import { Button } from './Button';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** What will happen, shown under the title. */
  children: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  /** While the action runs: the confirm button shows it is working, and Esc and cancel do nothing. */
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

// A modal question in the brand's style, in place of the browser's confirm(). It uses the native
// <dialog>, so focus stays inside, Esc closes it and the page behind cannot be used meanwhile.
// It has no red: the page's one primary button stays the only red action.
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel,
  busy = false,
  error,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const textId = useId();

  // Next keeps a page hidden after navigating away (Activity) and runs this cleanup then. A modal
  // dialog left open there would keep the next page inert.
  useLayoutEffect(() => {
    const element = dialog.current;
    return () => element?.close();
  }, []);

  // A layout effect, so a closing dialog never paints a frame with the caller's cleared texts.
  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      element.showModal();
      // Start on cancel, the safe choice.
      element.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    } else if (!open && element.open) {
      element.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      aria-describedby={textId}
      onCancel={(event) => {
        // Esc: the dialog closes only through the open prop, and never while the action runs.
        event.preventDefault();
        if (!busy) onCancel();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md bg-navy p-6 text-cream ring-2 ring-cream ring-inset backdrop:bg-navy/80 sm:p-8"
    >
      <div className="flex flex-col gap-4">
        <h2 id={titleId} className="text-h3">
          {title}
        </h2>
        <div id={textId} className="text-muted">
          {children}
        </div>
        {error && <p role="alert">{error}</p>}
        <div className="mt-2 flex flex-wrap gap-3">
          <Button variant="secondary" onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={busy} data-autofocus>
            {cancelLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
