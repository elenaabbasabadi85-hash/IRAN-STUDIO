import type { ReactNode } from 'react';
import type { RoleId, StepStatus } from '@/core/types';
import fa from '@/i18n/fa.json';
import { StatusBadge } from './Badge';
import { Surface } from './Surface';

interface RoleCardProps {
  role: RoleId;
  status: StepStatus;
  /** Optional actions under the description, for example a Button. */
  children?: ReactNode;
  className?: string;
}

// One studio role on a denim card. The status badge brings its own navy, so the REC dot of
// "working" stays on navy as the brand requires.
export function RoleCard({ role, status, children, className = '' }: RoleCardProps) {
  const { title, description } = fa.roles[role];

  return (
    <Surface as="article" className={`flex flex-col gap-3 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <h3>{title}</h3>
        <StatusBadge status={status} className="mt-1" />
      </div>
      <p className="text-muted">{description}</p>
      {children}
    </Surface>
  );
}
