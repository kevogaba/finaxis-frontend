import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { RolePermissionsTable, type RolePermissionRow } from './role-permissions-table';

// The table renders RemovePermissionButton, which imports the Server Actions; nothing submits here.
vi.mock('../role-actions', () => ({ grantPermissions: vi.fn(), removePermission: vi.fn() }));

const ROLE = '09000000-0000-4000-8000-000000000008';
const GRANT = '09000000-0000-4000-8000-0000000000f1';
const NAME = 'Start close of business';

const grant = (risk: RolePermissionRow['risk']): RolePermissionRow => ({
  grantId: GRANT,
  code: 'cob.start',
  // Without a readable catalogue the row has only its code.
  name: risk ? NAME : null,
  module: risk ? 'settings' : null,
  risk,
  grantedAt: '12 Aug 2026 · 09:30',
});

describe('RolePermissionsTable', () => {
  // Ruling 7: a CRITICAL grant, or one of unknown risk (the catalogue is unreadable), confirms as
  // an alert dialog with the critical warning; every other grant as a plain dialog.
  it.each([
    {
      title: 'a critical grant',
      risk: 'CRITICAL',
      dialog: 'alertdialog',
      copy: 'is a critical permission',
    },
    {
      title: 'a grant of unknown risk',
      risk: null,
      dialog: 'alertdialog',
      copy: 'is a critical permission',
    },
    { title: 'a low-risk grant', risk: 'LOW', dialog: 'dialog', copy: `loses ${NAME} immediately` },
  ] as const)('confirms $title as a $dialog', async ({ risk, dialog, copy }) => {
    const user = userEvent.setup();
    renderWithProviders(
      <RolePermissionsTable
        rows={[grant(risk)]}
        roleId={ROLE}
        canRemove
        timeZone="Africa/Nairobi"
      />,
    );

    const label = risk ? NAME : 'cob.start';
    await user.click(screen.getByRole('button', { name: `Remove ${label}` }));
    expect(screen.getByRole(dialog, { name: `Remove ${label}?` })).toHaveTextContent(copy);
  });

  it('has no Remove button or Actions column without removal rights', () => {
    renderWithProviders(
      <RolePermissionsTable
        rows={[grant('LOW')]}
        roleId={ROLE}
        canRemove={false}
        timeZone="Africa/Nairobi"
      />,
    );

    expect(screen.getByRole('table', { name: 'Granted permissions' })).toHaveTextContent(NAME);
    expect(screen.queryByRole('button', { name: /^Remove/ })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).toBeNull();
  });
});
