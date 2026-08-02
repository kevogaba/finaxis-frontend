import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen } from '@/test/test-utils';

const { listAuditEvents } = vi.hoisted(() => ({
  listAuditEvents: vi.fn(),
}));

const requestHeaders = new Headers({ cookie: 'finaxis.context=platform-context' });

vi.mock('next/headers', () => ({ headers: vi.fn(() => requestHeaders) }));
vi.mock('@/modules/platform-administration/platform-administration-service', () => ({
  platformAdministrationService: {
    listAuditEvents: (...args: unknown[]) => listAuditEvents(...args) as unknown,
  },
}));

const { default: AuditEventsPage } = await import('./page');

describe('AuditEventsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listAuditEvents.mockResolvedValue({
      items: [
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
      ],
      page: {
        number: 0,
        size: 25,
        totalItems: 1,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false,
      },
    });
  });

  it('renders audit events from the live directory', async () => {
    const ui = await AuditEventsPage({ searchParams: Promise.resolve({}) });
    renderWithProviders(ui);

    expect(listAuditEvents).toHaveBeenCalledWith(requestHeaders, {
      entityType: undefined,
      entityId: undefined,
      actorId: undefined,
      action: undefined,
      occurredFrom: undefined,
      occurredTo: undefined,
      page: 0,
      size: 25,
    });
    expect(screen.getByRole('heading', { level: 1, name: 'Audit events' })).toBeInTheDocument();
    expect(screen.getByText('TENANT (tenant-1)')).toBeInTheDocument();
  });

  it('renders a backend error state instead of a broken table', async () => {
    listAuditEvents.mockRejectedValueOnce(new Error('Audit service timed out.'));

    const ui = await AuditEventsPage({ searchParams: Promise.resolve({}) });
    renderWithProviders(ui);

    expect(
      screen.getByText(/audit event directory is temporarily unavailable/i),
    ).toBeInTheDocument();
    expect(screen.getByText('Audit service timed out.')).toBeInTheDocument();
  });

  it('renders a validation error instead of crashing on an out-of-range page size', async () => {
    const ui = await AuditEventsPage({ searchParams: Promise.resolve({ size: '101' }) });
    renderWithProviders(ui);

    expect(screen.getByText(/these search parameters aren.t valid/i)).toBeInTheDocument();
    expect(listAuditEvents).not.toHaveBeenCalled();
  });
});
