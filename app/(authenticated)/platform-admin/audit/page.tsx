import { headers } from 'next/headers';
import type { Metadata } from 'next';
import Alert from '@mui/material/Alert';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import NextLink from '@/components/navigation/next-link';
import { AuditEventTable } from '@/modules/platform-administration/components/audit-event-table';
import { PlatformPageShell } from '@/modules/platform-administration/components/platform-page-shell';
import { safeParseAuditListQuery } from '@/modules/platform-administration/platform-administration-queries';
import { platformAdministrationService } from '@/modules/platform-administration/platform-administration-service';

export const metadata: Metadata = { title: 'Audit Events' };

interface AuditEventsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function toUrlSearchParams(params: Record<string, string | string[] | undefined>): URLSearchParams {
  const result = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((entry) => {
        result.append(key, entry);
      });
      return;
    }

    if (value !== undefined) {
      result.set(key, value);
    }
  });

  return result;
}

export default async function AuditEventsPage({ searchParams }: AuditEventsPageProps) {
  const requestHeaders = await headers();
  const query = safeParseAuditListQuery(toUrlSearchParams(await searchParams));

  if (!query) {
    return (
      <PlatformPageShell
        title="Audit events"
        description="Review live audit events through the dedicated directory without enabling write actions in this stage."
        breadcrumbs={[{ href: '/platform-admin', label: 'Overview' }, { label: 'Audit events' }]}
      >
        <Alert severity="error">
          <Stack spacing={0.5}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              These search parameters aren&apos;t valid.
            </Typography>
            <Typography variant="body2">
              Check the page number and page size in the URL, or{' '}
              <Link component={NextLink} href="/platform-admin/audit">
                reset the audit event directory
              </Link>
              .
            </Typography>
          </Stack>
        </Alert>
      </PlatformPageShell>
    );
  }

  const auditEventsResult = await platformAdministrationService
    .listAuditEvents(requestHeaders, query)
    .then((auditEventsPage) => ({ kind: 'success' as const, auditEventsPage }))
    .catch((error: unknown) => ({
      error:
        error instanceof Error ? error.message : 'The backend did not return a usable response.',
      kind: 'error' as const,
    }));

  return (
    <PlatformPageShell
      title="Audit events"
      description="Review live audit events through the dedicated directory without enabling write actions in this stage."
      breadcrumbs={[{ href: '/platform-admin', label: 'Overview' }, { label: 'Audit events' }]}
    >
      {auditEventsResult.kind === 'error' ? (
        <Alert severity="error">
          <Stack spacing={0.5}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Audit event directory is temporarily unavailable.
            </Typography>
            <Typography variant="body2">{auditEventsResult.error}</Typography>
          </Stack>
        </Alert>
      ) : (
        <AuditEventTable
          auditEventsPage={auditEventsResult.auditEventsPage}
          pathname="/platform-admin/audit"
        />
      )}
    </PlatformPageShell>
  );
}
