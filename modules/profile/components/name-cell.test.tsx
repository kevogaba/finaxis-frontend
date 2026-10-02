import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { NameCell } from './name-cell';

const renderCell = (current?: boolean) =>
  renderWithProviders(
    <table>
      <tbody>
        <tr>
          <NameCell name="Westlands Branch" code="WESTLANDS" current={current} />
        </tr>
      </tbody>
    </table>,
  );

describe('NameCell', () => {
  it('shows the name and its code, and the Current marker only when current', () => {
    const { unmount } = renderCell(true);
    const cell = screen.getByRole('cell');
    expect(cell).toHaveTextContent('Westlands Branch');
    expect(cell).toHaveTextContent('WESTLANDS');
    expect(cell).toHaveTextContent('Current');
    unmount();

    renderCell();
    expect(screen.getByRole('cell')).toHaveTextContent('WESTLANDS');
    expect(screen.getByRole('cell')).not.toHaveTextContent('Current');
  });
});
