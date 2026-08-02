import { headers } from 'next/headers';
import type { Metadata } from 'next';
import { ZodError } from 'zod';
import Alert from '@mui/material/Alert';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { PlatformPageShell } from '@/modules/platform-administration/components/platform-page-shell';
import { PlatformStatusChip } from '@/modules/platform-administration/components/platform-status-chip';
import { platformAdministrationService } from '@/modules/platform-administration/platform-administration-service';
import type { TenantDetail } from '@/modules/platform-administration/platform-administration.types';

export const metadata: Metadata = { title: 'Tenant Detail' };

interface TenantDetailPageProps {
  params: Promise<{ tenantId: string }>;
}

type TenantDetailResult =
  | { kind: 'success'; tenant: TenantDetail }
  | { kind: 'not-found' }
  | { kind: 'error'; error: string };

function isNotFoundError(error: unknown): boolean {
  if (error instanceof ZodError) {
    return true;
  }

  const status =
    typeof error === 'object' && error !== null && 'status' in error ? error.status : undefined;
  return status === 404;
}

function formatDate(value: string | undefined): string {
  if (!value) return 'Not yet updated';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date);
}

function detailFields(tenant: TenantDetail): readonly { label: string; value: string }[] {
  return [
    { label: 'Tenant code', value: tenant.tenantCode },
    { label: 'Country', value: tenant.countryCode },
    { label: 'Base currency', value: tenant.baseCurrencyCode ?? 'Not set' },
    { label: 'Timezone', value: tenant.timezone ?? 'Not set' },
    { label: 'Bootstrap status', value: tenant.bootstrapStatus ?? 'Not set' },
    { label: 'Bootstrap failure code', value: tenant.bootstrapFailureCode ?? 'None' },
    { label: 'Created', value: formatDate(tenant.createdAt) },
    { label: 'Updated', value: formatDate(tenant.updatedAt) },
  ];
}

export default async function TenantDetailPage({ params }: TenantDetailPageProps) {
  const { tenantId } = await params;
  const requestHeaders = await headers();

  const result: TenantDetailResult = await platformAdministrationService
    .getTenant(requestHeaders, tenantId)
    .then((tenant) => ({ kind: 'success' as const, tenant }))
    .catch((error: unknown) => {
      if (isNotFoundError(error)) {
        return { kind: 'not-found' as const };
      }

      return {
        kind: 'error' as const,
        error:
          error instanceof Error ? error.message : 'The backend did not return a usable response.',
      };
    });

  const title = result.kind === 'success' ? result.tenant.displayName : 'Tenant detail';

  return (
    <PlatformPageShell
      title={title}
      description="Inspect a single tenant's identity, lifecycle, and locale metadata through the live read-only platform API."
      breadcrumbs={[
        { href: '/platform-admin', label: 'Overview' },
        { href: '/platform-admin/tenants', label: 'Tenant directory' },
        { label: title },
      ]}
    >
      {result.kind === 'not-found' ? (
        <Alert severity="warning">This tenant could not be found in the live directory.</Alert>
      ) : result.kind === 'error' ? (
        <Alert severity="error">
          <Stack spacing={0.5}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Tenant detail is temporarily unavailable.
            </Typography>
            <Typography variant="body2">{result.error}</Typography>
          </Stack>
        </Alert>
      ) : (
        <Card variant="outlined">
          <CardContent>
            <Stack spacing={2.5}>
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  {result.tenant.displayName}
                </Typography>
                <PlatformStatusChip status={result.tenant.status} />
              </Stack>
              <Grid container spacing={2}>
                {detailFields(result.tenant).map((field) => (
                  <Grid key={field.label} size={{ xs: 12, sm: 6, md: 4 }}>
                    <Typography variant="overline" color="text.secondary">
                      {field.label}
                    </Typography>
                    <Typography variant="body2">{field.value}</Typography>
                  </Grid>
                ))}
              </Grid>
            </Stack>
          </CardContent>
        </Card>
      )}
    </PlatformPageShell>
  );
}
