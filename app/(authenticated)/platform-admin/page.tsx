import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import NextLink from '@/components/navigation/next-link';
import { getSelectedContextProfile } from '@/auth/context-service';
import { PlatformPageShell } from '@/modules/platform-administration/components/platform-page-shell';
import { platformAdministrationService } from '@/modules/platform-administration/platform-administration-service';
import { parseTenantListQuery } from '@/modules/platform-administration/platform-administration-queries';
import { platformAdministrationModule } from '@/modules/platform-administration/platform-administration-module';
import type { TenantListQuery } from '@/modules/platform-administration/platform-administration.types';

export const metadata: Metadata = { title: 'Platform Overview' };

interface PlatformOverviewPageProps {
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

function describeTenantDirectoryState(query: TenantListQuery, totalItems: number): string {
  if (totalItems === 0) {
    return 'No tenants are available in the live directory yet.';
  }

  if (query.q || query.status || query.country) {
    return `${totalItems} tenant${totalItems === 1 ? ' is' : 's are'} visible for the current live filters.`;
  }

  return `${totalItems} tenant${totalItems === 1 ? ' is' : 's are'} available from the live directory.`;
}

export default async function PlatformOverviewPage({ searchParams }: PlatformOverviewPageProps) {
  const requestHeaders = await headers();
  const query = parseTenantListQuery(toUrlSearchParams(await searchParams));
  const selectedContext = await getSelectedContextProfile(requestHeaders);

  if (selectedContext.kind !== 'resolved') {
    redirect('/select-context');
  }

  if (selectedContext.context.module.id !== platformAdministrationModule.id) {
    redirect('/admin');
  }

  const tenantDirectoryResult = await platformAdministrationService
    .listTenants(requestHeaders, query)
    .then((data) => ({ data, kind: 'success' as const }))
    .catch((error: unknown) => ({
      error:
        error instanceof Error ? error.message : 'The backend did not return a usable response.',
      kind: 'error' as const,
    }));

  return (
    <PlatformPageShell
      title="Platform overview"
      description="Confirm the active platform context and move into the live read-only workspaces."
    >
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card variant="outlined" sx={{ height: '100%' }}>
            <CardContent>
              <Stack spacing={1}>
                <Typography variant="overline" color="text.secondary">
                  Active platform context
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  {selectedContext.context.organization.name}
                </Typography>
                <Stack direction="row" spacing={1}>
                  <Typography color="text.secondary" variant="body2">
                    Branch:
                  </Typography>
                  <Typography variant="body2">{selectedContext.context.branch.name}</Typography>
                </Stack>
                <Stack direction="row" spacing={1}>
                  <Typography color="text.secondary" variant="body2">
                    Module:
                  </Typography>
                  <Typography variant="body2">{selectedContext.context.module.name}</Typography>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Card variant="outlined" sx={{ height: '100%' }}>
            <CardContent>
              <Stack spacing={1.25}>
                <Typography variant="overline" color="text.secondary">
                  Tenant operations
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  Live tenant directory
                </Typography>
                {tenantDirectoryResult.kind === 'success' ? (
                  <Typography color="text.secondary" variant="body2">
                    {describeTenantDirectoryState(
                      query,
                      tenantDirectoryResult.data.page.totalItems,
                    )}
                  </Typography>
                ) : (
                  <Alert severity="warning" sx={{ alignItems: 'flex-start' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      Live tenant data is temporarily unavailable.
                    </Typography>
                    <Typography variant="body2">{tenantDirectoryResult.error}</Typography>
                  </Alert>
                )}
              </Stack>
            </CardContent>
            <CardActions>
              <Button component={NextLink} href="/platform-admin/tenants" size="small">
                Open tenant directory
              </Button>
            </CardActions>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Card variant="outlined" sx={{ height: '100%' }}>
            <CardContent>
              <Stack spacing={1}>
                <Typography variant="overline" color="text.secondary">
                  Audit visibility
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  Audit event review
                </Typography>
                <Typography color="text.secondary" variant="body2">
                  Review live audit events through the dedicated directory without enabling write
                  actions in this stage.
                </Typography>
              </Stack>
            </CardContent>
            <CardActions>
              <Button component={NextLink} href="/platform-admin/audit" size="small">
                Open audit event directory
              </Button>
            </CardActions>
          </Card>
        </Grid>
      </Grid>
    </PlatformPageShell>
  );
}
