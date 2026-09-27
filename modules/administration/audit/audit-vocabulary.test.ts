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
});
