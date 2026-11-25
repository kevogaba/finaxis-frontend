import { describe, expect, it } from 'vitest';
import {
  actionLabel,
  actionsForEntityType,
  AUDIT_ACTIONS,
  entityTypeLabel,
} from './audit-vocabulary';

describe('audit vocabulary', () => {
  it('labels known actions and falls back readably for unknown ones', () => {
    expect(actionLabel('user.invite')).toBe('Invited user');
    expect(actionLabel('branch.create_draft')).toBe('Drafted branch');
    expect(actionLabel('gl_account.approve')).toBe('Gl account: approve');
  });

  it('narrows actions to an entity type', () => {
    const roleActions = actionsForEntityType('ROLE').map((action) => action.value);
    expect(roleActions).toContain('role.assign_permission');
    expect(roleActions).not.toContain('user.invite');
    expect(actionsForEntityType(undefined).length).toBeGreaterThan(roleActions.length);
  });

  // BG-01: a withdrawal writes `branch.withdraw` beside the FSM's `branch.return_for_changes`.
  it('names the branch return, withdrawal and discard', () => {
    expect(actionLabel('branch.return_for_changes')).toBe('Returned branch for changes');
    expect(actionLabel('branch.withdraw')).toBe('Withdrew branch');
    expect(actionLabel('branch.discard')).toBe('Discarded branch draft');
    expect(actionsForEntityType('BRANCH').map((action) => action.value)).toEqual(
      expect.arrayContaining(['branch.return_for_changes', 'branch.withdraw', 'branch.discard']),
    );
  });

  it('names a branch edit (BG-13)', () => {
    expect(actionLabel('branch.update')).toBe('Edited branch');
    expect(actionsForEntityType('BRANCH').map((action) => action.value)).toContain('branch.update');
  });

  it('labels entity types', () => {
    expect(entityTypeLabel('USER_ROLE_ASSIGNMENT')).toBe('Role assignment');
    expect(entityTypeLabel('GL_ACCOUNT')).toBe('Gl account');
  });

  it('covers the deprovisioning and deactivation revocation actions', () => {
    const byValue = new Map(AUDIT_ACTIONS.map((action) => [action.value, action]));
    expect(byValue.get('organisation.deprovision_assignment_revoked')).toMatchObject({
      entityType: 'ORGANISATION',
    });
    expect(byValue.get('user.deactivation_assignment_revoked')).toMatchObject({
      entityType: 'USER_ROLE_ASSIGNMENT',
    });
  });

  it('has no duplicate action values (they key MenuItem options in the Action select)', () => {
    const values = AUDIT_ACTIONS.map((action) => action.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it('appends a selected action the narrowed list lacks, without duplicating a listed one', () => {
    expect(actionsForEntityType('MEMBERSHIP', 'membership.suspend')).toContainEqual({
      value: 'membership.suspend',
      label: 'Suspended membership',
    });
    expect(actionsForEntityType(undefined, 'user_account.invite')).toContainEqual({
      value: 'user_account.invite',
      label: 'User account: invite',
    });
    expect(actionsForEntityType('ROLE', 'role.create')).toHaveLength(
      actionsForEntityType('ROLE').length,
    );
  });
});
