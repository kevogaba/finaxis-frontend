import { describe, expect, it } from 'vitest';
import { can, canAll, canAny } from './permissions';

const holder = { permissions: ['user.view', 'role.view'] };

describe('permission helpers', () => {
  it('checks a single code', () => {
    expect(can(holder, 'user.view')).toBe(true);
    expect(can(holder, 'user.invite')).toBe(false);
  });

  it('requires every code for canAll and any code for canAny', () => {
    expect(canAll(holder, ['user.view', 'role.view'])).toBe(true);
    expect(canAll(holder, ['user.view', 'user.invite'])).toBe(false);
    expect(canAny(holder, ['user.invite', 'role.view'])).toBe(true);
    expect(canAny(holder, ['user.invite'])).toBe(false);
  });

  it('treats an empty requirement list as satisfied for canAll and unsatisfied for canAny', () => {
    expect(canAll(holder, [])).toBe(true);
    expect(canAny(holder, [])).toBe(false);
  });
});
