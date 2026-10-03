import { ListToolbar, type ToolbarChip } from '@/components/data-display/list-toolbar';
import { AUDIT_ENTITY_TYPES, actionsForEntityType } from '../audit-vocabulary';
import { AuditActorPicker } from './audit-actor-picker';

interface AuditFiltersProps {
  entityType: string | undefined;
  resultLabel: string;
  actorChip: ToolbarChip | null;
  entityChip?: ToolbarChip | null;
  action?: string;
  /** Offers the Actor search (it reads `/tenant/users`, so it needs `user.view`). */
  actorSearch?: boolean;
  /** The applied actor filter: the search starts over, empty, each time it changes. */
  actorId?: string;
  /** The zone the table/drawer render times in — passed through so the From/To fields can show a
   * helper naming the browser's own zone when it differs (entry stays in local time). */
  timeZone: string;
}

export function AuditFilters({
  entityType,
  resultLabel,
  actorChip,
  entityChip,
  action,
  actorSearch = false,
  actorId,
  timeZone,
}: AuditFiltersProps) {
  const chips = [actorChip, entityChip ?? null].filter(
    (chip): chip is ToolbarChip => chip !== null,
  );
  return (
    <ListToolbar
      resultLabel={resultLabel}
      chips={chips}
      timeZone={timeZone}
      fields={[
        {
          kind: 'select',
          name: 'entityType',
          label: 'Entity type',
          allLabel: 'All entity types',
          options: AUDIT_ENTITY_TYPES,
          // A stale action from a different entity type would otherwise leave an out-of-range
          // Select value once the entity type narrows the Action list, and a record link's
          // entityId would be reinterpreted as an id of the new type.
          clears: ['action', 'entityId'],
        },
        {
          kind: 'select',
          name: 'action',
          label: 'Action',
          allLabel: 'All actions',
          options: actionsForEntityType(entityType, action),
        },
        { kind: 'datetime', name: 'occurredFrom', label: 'From' },
        // occurred_to is compared with a backend `le()` on sub-second timestamps, so the chosen
        // minute's last millisecond is stored, not its first (L06-M22).
        { kind: 'datetime', name: 'occurredTo', label: 'To', endOfMinute: true },
      ]}
    >
      {actorSearch && <AuditActorPicker key={actorId ?? 'none'} />}
    </ListToolbar>
  );
}
