'use client';

import { useState } from 'react';
import { StepRail, stepName, type StepId } from '@/components/ui/StepRail';
import type { StepStatus } from '@/core/types';
import fa from '@/i18n/fa.json';
import { format } from '@/i18n/format';

// Every status appears at least once.
const statuses: Partial<Record<StepId, StepStatus>> = {
  idea: 'approved',
  script: 'approved',
  writer: 'approved',
  editor: 'ready',
  record: 'working',
};

export function StepRailDemo() {
  const [current, setCurrent] = useState<StepId>('record');

  return (
    <div className="flex flex-col gap-4">
      <StepRail statuses={statuses} current={current} onSelect={setCurrent} />
      <p role="status" className="text-caption text-muted">
        {format(fa.showcase.stepRail.selected, { name: stepName(current) })}
      </p>
    </div>
  );
}
