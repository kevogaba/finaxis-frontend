import { headers } from 'next/headers';
import type { Metadata } from 'next';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { PlatformPageShell } from '@/modules/platform-administration/components/platform-page-shell';
import { TenantTable } from '@/modules/platform-administration/components/tenant-table';
import { parseTenantListQuery } from '@/modules/platform-administration/platform-administration-queries';
import { platformAdministrationService } from '@/modules/platform-administration/platform-administration-service';

export const metadata: Metadata = { title: 'Tenant Directory' };

interface TenantDirectoryPageProps {
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

export default async function TenantDirectoryPage({ searchParams }: TenantDirectoryPageProps) {
  const requestHeaders = await headers();
  const query = parseTenantListQuery(toUrlSearchParams(await searchParams));

  const tenantDirectoryResult = await platformAdministrationService
    .listTenants(requestHeaders, query)
    .then((tenantsPage) => ({ kind: 'success' as const, tenantsPage }))
    .catch((error: unknown) => ({
      error:
        error instanceof Error ? error.message : 'The backend did not return a usable response.',
      kind: 'error' as const,
    }));

  return (
    <PlatformPageShell
      title="Tenant directory"
      description="Inspect tenant identity, lifecycle state, and locale metadata through the live read-only platform API."
      breadcrumbs={[{ href: '/platform-admin', label: 'Overview' }, { label: 'Tenant directory' }]}
    >
      {tenantDirectoryResult.kind === 'error' ? (
        <Alert severity="error">
          <Stack spacing={0.5}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Tenant directory is temporarily unavailable.
            </Typography>
            <Typography variant="body2">{tenantDirectoryResult.error}</Typography>
          </Stack>
        </Alert>
      ) : (
        <TenantTable
          pathname="/platform-admin/tenants"
          query={query}
          tenantsPage={tenantDirectoryResult.tenantsPage}
        />
      )}
    </PlatformPageShell>
  );
}
