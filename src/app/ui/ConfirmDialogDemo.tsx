'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import fa from '@/i18n/fa.json';

const t = fa.showcase.confirmDialog;

export function ConfirmDialogDemo() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');

  function confirm() {
    setBusy(true);
    window.setTimeout(() => {
      setBusy(false);
      setOpen(false);
      setResult(t.confirmed);
    }, 1200);
  }

  return (
    <div className="flex flex-col items-start gap-4">
      <Button
        onClick={() => {
          setResult('');
          setOpen(true);
        }}
      >
        {t.open}
      </Button>
      <p role="status" className="text-caption text-muted">
        {result}
      </p>
      <ConfirmDialog
        open={open}
        title={t.dialogTitle}
        confirmLabel={t.confirm}
        cancelLabel={t.cancel}
        busy={busy}
        onConfirm={confirm}
        onCancel={() => {
          setOpen(false);
          setResult(t.cancelled);
        }}
      >
        {t.dialogText}
      </ConfirmDialog>
    </div>
  );
}
