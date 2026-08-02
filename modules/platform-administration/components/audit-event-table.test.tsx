import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import type { ApiPage, AuditEvent } from '../platform-administration.types';
import { AuditEventTable } from './audit-event-table';

const page = (items: readonly AuditEvent[], totalItems = items.length): ApiPage<AuditEvent> => ({
  items,
  page: {
    number: 0,
    size: 25,
    totalItems,
    totalPages: totalItems > 0 ? 1 : 0,
    hasNext: false,
    hasPrevious: false,
  },
});

describe('AuditEventTable', () => {
  it('renders audit event metadata', () => {
    renderWithProviders(
      <AuditEventTable
        pathname="/platform-admin/audit"
        auditEventsPage={page([
          {
            id: 'event-1',
            organisationId: 'org-1',
            occurredAt: '2026-07-01T08:00:00Z',
            actorUserId: 'user-1',
            actorType: 'HUMAN',
            eventType: 'TENANT_UPDATED',
            entityType: 'TENANT',
            entityId: 'tenant-1',
            action: 'UPDATE',
            outcome: 'SUCCESS',
            severity: 'INFO',
          },
          {
            id: 'event-2',
            organisationId: 'org-1',
            occurredAt: '2026-07-02T09:00:00Z',
            actorUserId: null,
            actorType: 'SYSTEM',
            eventType: 'LOGIN_FAILED',
            entityType: 'SESSION',
            entityId: null,
            action: 'LOGIN',
            outcome: 'FAILED',
            severity: 'WARNING',
          },
        ])}
      />,
    );

    expect(screen.getByText('TENANT (tenant-1)')).toBeInTheDocument();
    expect(screen.getByText('user-1')).toBeInTheDocument();
    expect(screen.getByText('SESSION')).toBeInTheDocument();
    expect(screen.getByText('SYSTEM')).toBeInTheDocument();
    expect(screen.getByText('SUCCESS')).toBeInTheDocument();
    expect(screen.getByText('FAILED')).toBeInTheDocument();
  });

  it('renders an empty state when no audit events are available', () => {
    renderWithProviders(
      <AuditEventTable pathname="/platform-admin/audit" auditEventsPage={page([])} />,
    );

    expect(
      screen.getByText('No audit events are available in the live directory yet.'),
    ).toBeInTheDocument();
  });
});
