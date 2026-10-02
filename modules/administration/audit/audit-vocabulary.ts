import { humanizeEnum } from '@/components/data-display/status-chip';

// parseAuditQuery drops any entityType outside this set.
export const AUDIT_ENTITY_TYPES = [
  { value: 'USER', label: 'User' },
  { value: 'USER_ACCOUNT', label: 'User account' },
  { value: 'MEMBERSHIP', label: 'Membership' },
  { value: 'USER_ROLE_ASSIGNMENT', label: 'Role assignment' },
  { value: 'USER_BRANCH_ASSIGNMENT', label: 'Branch assignment' },
  { value: 'ROLE', label: 'Role' },
  { value: 'BRANCH', label: 'Branch' },
  { value: 'ORGANISATION', label: 'Organisation' },
  { value: 'ORGANISATION_SETTING', label: 'Setting' },
  { value: 'BUSINESS_DATE', label: 'Business date' },
] as const;

export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number]['value'];

/**
 * Contract §G's explicit actions plus the common state-machine transitions, grouped by the
 * entity type each is recorded on. Unlisted actions still render through `actionLabel`'s fallback.
 */
export const AUDIT_ACTIONS = [
  { value: 'user.invite', label: 'Invited user', entityType: 'USER' },
  { value: 'user.approve', label: 'Approved user', entityType: 'USER' },
  { value: 'user.keycloak_provisioning', label: 'Provisioned identity', entityType: 'USER' },
  { value: 'user.application_invite', label: 'Sent application invite', entityType: 'USER' },
  { value: 'user.welcome_email', label: 'Sent welcome email', entityType: 'USER' },
  { value: 'membership.suspend', label: 'Suspended membership', entityType: 'USER' },
  { value: 'membership.reactivate', label: 'Reactivated membership', entityType: 'USER' },
  {
    value: 'user.first_login_activation',
    label: 'Activated on first sign-in',
    entityType: 'USER_ACCOUNT',
  },
  { value: 'membership.revoke', label: 'Revoked membership', entityType: 'MEMBERSHIP' },
  { value: 'membership.activate', label: 'Activated membership', entityType: 'MEMBERSHIP' },
  { value: 'user.assign_role', label: 'Assigned role', entityType: 'USER_ROLE_ASSIGNMENT' },
  { value: 'user.revoke_role', label: 'Revoked role', entityType: 'USER_ROLE_ASSIGNMENT' },
  {
    value: 'user.deactivation_assignment_revoked',
    label: 'Revoked role on deactivation',
    entityType: 'USER_ROLE_ASSIGNMENT',
  },
  { value: 'role.create', label: 'Created role', entityType: 'ROLE' },
  { value: 'role.update', label: 'Updated role', entityType: 'ROLE' },
  { value: 'role.activate', label: 'Activated role', entityType: 'ROLE' },
  { value: 'role.deactivate', label: 'Deactivated role', entityType: 'ROLE' },
  { value: 'role.assign_permission', label: 'Granted permission', entityType: 'ROLE' },
  { value: 'role.remove_permission', label: 'Removed permission', entityType: 'ROLE' },
  { value: 'branch.create_draft', label: 'Drafted branch', entityType: 'BRANCH' },
  { value: 'branch.submit', label: 'Submitted branch', entityType: 'BRANCH' },
  { value: 'branch.activate', label: 'Activated branch', entityType: 'BRANCH' },
  { value: 'branch.suspend', label: 'Suspended branch', entityType: 'BRANCH' },
  { value: 'branch.reactivate', label: 'Reactivated branch', entityType: 'BRANCH' },
  { value: 'branch.close', label: 'Closed branch', entityType: 'BRANCH' },
  { value: 'branch.assign_user', label: 'Assigned user to branch', entityType: 'BRANCH' },
  { value: 'branch.revoke_user', label: 'Removed user from branch', entityType: 'BRANCH' },
  { value: 'organisation.create_draft', label: 'Drafted organisation', entityType: 'ORGANISATION' },
  {
    value: 'organisation.amend_draft',
    label: 'Amended organisation draft',
    entityType: 'ORGANISATION',
  },
  { value: 'organisation.submit', label: 'Submitted organisation', entityType: 'ORGANISATION' },
  { value: 'organisation.activate', label: 'Activated organisation', entityType: 'ORGANISATION' },
  { value: 'organisation.suspend', label: 'Suspended organisation', entityType: 'ORGANISATION' },
  {
    value: 'organisation.reactivate',
    label: 'Reactivated organisation',
    entityType: 'ORGANISATION',
  },
  {
    value: 'organisation.deprovision_assignment_revoked',
    label: 'Revoked assignments on deprovisioning',
    entityType: 'ORGANISATION',
  },
  { value: 'tenant.bootstrap_retry', label: 'Retried bootstrap', entityType: 'ORGANISATION' },
  { value: 'settings.update', label: 'Changed setting', entityType: 'ORGANISATION_SETTING' },
  { value: 'business_date.advance', label: 'Advanced business date', entityType: 'BUSINESS_DATE' },
  { value: 'cob.start', label: 'Started close of business', entityType: 'BUSINESS_DATE' },
  { value: 'cob.complete', label: 'Completed close of business', entityType: 'BUSINESS_DATE' },
  { value: 'business_date.reopen', label: 'Reopened business date', entityType: 'BUSINESS_DATE' },
] as const;

const LABELS = new Map<string, string>(AUDIT_ACTIONS.map((action) => [action.value, action.label]));

export function actionLabel(action: string): string {
  const known = LABELS.get(action);
  if (known) return known;
  const [subject = action, verb = ''] = action.split('.');
  return verb ? `${humanizeEnum(subject)}: ${verb.replace(/_/g, ' ')}` : humanizeEnum(subject);
}

/**
 * Action options for the Action select, narrowed to `entityType`. `selected` is the parsed
 * `AuditQuery.action` (never the raw URL value; parseAuditQuery owns validation). It is appended
 * when the narrowed list lacks it (an unlisted §G transition, or `membership.suspend`/`reactivate`
 * recorded under MEMBERSHIP), so the Select names an applied filter instead of rendering blank.
 */
export function actionsForEntityType(
  entityType?: string,
  selected?: string,
): readonly { value: string; label: string }[] {
  const actions = entityType
    ? AUDIT_ACTIONS.filter((action) => action.entityType === entityType)
    : AUDIT_ACTIONS;
  return selected && !actions.some((action) => action.value === selected)
    ? [...actions, { value: selected, label: actionLabel(selected) }]
    : actions;
}

export function entityTypeLabel(entityType: string): string {
  return (
    AUDIT_ENTITY_TYPES.find((type) => type.value === entityType)?.label ?? humanizeEnum(entityType)
  );
}
