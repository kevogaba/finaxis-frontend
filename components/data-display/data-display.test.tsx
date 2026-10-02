import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { DescriptionList } from './description-list';
import { EmptyState } from './empty-state';
import { ErrorState } from './error-state';
import { SectionCard } from './section-card';
import { TruncatedText } from './truncated-text';

describe('data display', () => {
  it('renders a description list as term/definition pairs', () => {
    renderWithProviders(<DescriptionList items={[{ label: 'Branch code', value: 'WST-002' }]} />);
    expect(screen.getByRole('term')).toHaveTextContent('Branch code');
    expect(screen.getByRole('definition')).toHaveTextContent('WST-002');
  });

  it('renders empty and error states, including the support reference', () => {
    renderWithProviders(
      <>
        <EmptyState title="No audit events" description="Try other filters." />
        <ErrorState
          problem={{
            title: 'Access denied',
            message: 'No permission.',
            code: 'forbidden',
            requestId: 'req-1',
          }}
        />
      </>,
    );
    expect(screen.getByText('No audit events')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Access denied');
    expect(screen.getByRole('alert')).toHaveTextContent('req-1');
  });

  it('truncates long text with an ellipsis, keeping the full value in the title', () => {
    renderWithProviders(<TruncatedText value="A very long branch name indeed" maxWidth={120} />);
    const node = screen.getByText('A very long branch name indeed');
    expect(node).toHaveAttribute('title', 'A very long branch name indeed');
  });

  it('renders a section card as a landmark named by its heading', () => {
    renderWithProviders(
      <SectionCard title="Personal information" description="Identity details">
        <p>Body</p>
      </SectionCard>,
    );
    expect(screen.getByRole('region', { name: 'Personal information' })).toHaveTextContent('Body');
    expect(
      screen.getByRole('heading', { level: 2, name: 'Personal information' }),
    ).toBeInTheDocument();
  });
});
