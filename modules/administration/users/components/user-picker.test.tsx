import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { UserPicker } from './user-picker';

const PETER = {
  id: '08000000-0000-4000-8000-000000000002',
  displayName: 'Peter Otieno',
  email: 'peter.otieno@greenfield.example',
  username: 'peter.otieno',
  membershipStatus: 'ACTIVE',
};

// A fresh Response per call: a body can be read only once.
const respond =
  (body: unknown, status = 200) =>
  () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

describe('UserPicker', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('searches once per pause in typing and submits the chosen user id', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(respond({ items: [PETER] }));
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { container } = renderWithProviders(
      <UserPicker name="userId" label="User" onChange={onChange} />,
    );

    await user.type(screen.getByRole('combobox', { name: 'User' }), 'pet');
    await user.click(await screen.findByRole('option', { name: /Peter Otieno/ }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/tenant/users?q=pet');
    expect(onChange).toHaveBeenCalledWith(PETER);
    expect(container.querySelector('input[name="userId"]')).toHaveValue(PETER.id);
  });

  it('explains a failed search instead of showing an empty list', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(respond({ message: 'down' }, 502));
    const user = userEvent.setup();
    renderWithProviders(<UserPicker name="userId" label="User" />);

    await user.type(screen.getByRole('combobox', { name: 'User' }), 'pet');

    expect(await screen.findByText("Couldn't search users. Try again.")).toBeInTheDocument();
  });
});
