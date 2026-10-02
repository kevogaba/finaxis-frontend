import { describe, expect, it } from 'vitest';
import { canViewActivity, groupPermissions, workspaceHome } from './profile-rules';

describe('profile rules', () => {
  it('groups permission codes by prefix, sorted and de-duplicated, with readable labels', () => {
    expect(
      groupPermissions([
        'user.view',
        'iam.profile.read',
        'cob.start',
        'business_date.view',
        'business_date.advance',
        'audit.view',
        'user.view',
        'legacy',
      ]),
    ).toEqual([
      { prefix: 'audit', label: 'Audit', codes: ['audit.view'] },
      {
        prefix: 'business_date',
        label: 'Business date',
        codes: ['business_date.advance', 'business_date.view'],
      },
      { prefix: 'cob', label: 'Close of business', codes: ['cob.start'] },
      { prefix: 'iam', label: 'IAM', codes: ['iam.profile.read'] },
      { prefix: 'legacy', label: 'Legacy', codes: ['legacy'] },
      { prefix: 'user', label: 'User', codes: ['user.view'] },
    ]);
    expect(groupPermissions([])).toEqual([]);
  });

  it('offers Activity only with audit.view in a tenant context (the platform context has no audit, BG-06)', () => {
    expect(canViewActivity({ permissions: ['audit.view'] }, 'administration')).toBe(true);
    expect(canViewActivity({ permissions: ['user.view'] }, 'administration')).toBe(false);
    expect(canViewActivity({ permissions: ['audit.view'] }, 'platform-administration')).toBe(false);
  });

  it('sends each workspace back to its own overview', () => {
    expect(workspaceHome('administration')).toBe('/admin');
    expect(workspaceHome('platform-administration')).toBe('/platform-admin');
  });
});
