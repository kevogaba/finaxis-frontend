'use client';

import { ListToolbar, type ToolbarChip } from '@/components/data-display/list-toolbar';
import { AUDIT_ENTITY_TYPES, actionsForEntityType } from '../audit-vocabulary';

interface AuditFiltersProps {
  entityType: string | undefined;
  resultLabel: string;
  actorChip: ToolbarChip | null;
  action?: string;
}

export function AuditFilters({ entityType, resultLabel, actorChip, action }: AuditFiltersProps) {
  return (
    <ListToolbar
      resultLabel={resultLabel}
      chips={actorChip ? [actorChip] : []}
      fields={[
        {
          kind: 'select',
          name: 'entityType',
          label: 'Entity type',
          allLabel: 'All entity types',
          options: AUDIT_ENTITY_TYPES,
          // A stale action from a different entity type would otherwise leave an out-of-range
          // Select value once the entity type narrows the Action list.
          clears: ['action'],
        },
        {
          kind: 'select',
          name: 'action',
          label: 'Action',
          allLabel: 'All actions',
          options: actionsForEntityType(entityType, action),
        },
        { kind: 'datetime', name: 'occurredFrom', label: 'From' },
        { kind: 'datetime', name: 'occurredTo', label: 'To' },
      ]}
    />
  );
}
