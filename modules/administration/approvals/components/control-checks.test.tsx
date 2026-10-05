import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { CHECK_STATES, VERIFIED_ON_APPROVAL, type ControlCheck } from '../approval-checks';
import { ControlChecks } from './control-checks';

describe('ControlChecks', () => {
  it('names every check’s state in a word, then why', () => {
    const checks: ControlCheck[] = [
      {
        id: 'maker',
        label: 'Invited by someone else',
        state: 'passed',
        detail: 'Invited by Victor Kamau.',
      },
      {
        id: 'role',
        label: 'Has an active role',
        state: 'failed',
        detail: 'They hold no active role.',
      },
      {
        id: 'branch',
        label: 'Has an active branch assignment',
        state: 'platform',
        detail: `${VERIFIED_ON_APPROVAL} Your role can't view branch assignments.`,
      },
      { id: 'institution', label: 'Institution is active', state: 'not-required', detail: 'n/a' },
    ];
    renderWithProviders(<ControlChecks checks={checks} />);

    for (const check of checks) {
      const value = screen.getByText(check.label, { selector: 'dt' }).nextElementSibling;
      if (!(value instanceof HTMLElement)) throw new Error(`"${check.label}" has no value cell`);
      expect(within(value).getByText(CHECK_STATES[check.state].label)).toBeInTheDocument();
      expect(value).toHaveTextContent(check.detail);
    }
  });
});
