import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor } from '@testing-library/react';
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
    // No pause between keystrokes: the picker's real 300 ms debounce must see "pet" as one burst,
    // however loaded the machine is (a default userEvent delay is a real timer per keystroke).
    const user = userEvent.setup({ delay: null });
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

  it('drops the selection once the typed text diverges from it, so Enter cannot submit a stale id', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(respond({ items: [PETER] }));
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { container } = renderWithProviders(
      <UserPicker name="userId" label="User" onChange={onChange} />,
    );
    const input = screen.getByRole('combobox', { name: 'User' });

    await user.type(input, 'pet');
    await user.click(await screen.findByRole('option', { name: /Peter Otieno/ }));
    expect(container.querySelector('input[name="userId"]')).toHaveValue(PETER.id);

    await user.type(input, 'x');

    expect(container.querySelector('input[name="userId"]')).toHaveValue('');
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('explains a failed search instead of showing an empty list', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(respond({ message: 'down' }, 502));
    const user = userEvent.setup();
    renderWithProviders(<UserPicker name="userId" label="User" />);

    await user.type(screen.getByRole('combobox', { name: 'User' }), 'pet');

    expect(await screen.findByText("Couldn't search users. Try again.")).toBeInTheDocument();
  });

  it('names the specific reason for a 403 (C4)', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(respond({ message: 'forbidden' }, 403));
    const user = userEvent.setup();
    renderWithProviders(<UserPicker name="userId" label="User" />);

    await user.type(screen.getByRole('combobox', { name: 'User' }), 'pet');

    expect(await screen.findByText("You can't search users in this context.")).toBeInTheDocument();
  });

  it('clears a stale failure as soon as a new search starts (C5)', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(respond({ message: 'down' }, 502))
      .mockImplementationOnce(respond({ items: [PETER] }));
    const user = userEvent.setup();
    renderWithProviders(<UserPicker name="userId" label="User" />);
    const combobox = screen.getByRole('combobox', { name: 'User' });

    await user.type(combobox, 'pet');
    expect(await screen.findByText("Couldn't search users. Try again.")).toBeInTheDocument();

    await user.type(combobox, 'er');
    // The stale failure must disappear the moment a new search starts, not only once the new
    // search resolves — otherwise a screen-reader user hears outdated text while it's in flight.
    await waitFor(() => {
      expect(screen.queryByText("Couldn't search users. Try again.")).not.toBeInTheDocument();
    });
    expect(await screen.findByRole('option', { name: /Peter Otieno/ })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('seeds the initial selection from defaultValue (C1)', () => {
    const { container } = renderWithProviders(
      <UserPicker name="userId" label="User" defaultValue={PETER} />,
    );

    expect(screen.getByRole('combobox', { name: 'User' })).toHaveValue(PETER.displayName);
    expect(container.querySelector('input[name="userId"]')).toHaveValue(PETER.id);
  });
});
