import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import NextLink from '@/components/navigation/next-link';
import { getCurrentContextProfile } from '@/auth/context-service';
import { ErrorState } from '@/components/data-display/error-state';
import { load } from '@/lib/api/load';
import { PlatformPageShell } from '@/modules/platform-administration/components/platform-page-shell';
import { platformAdministrationModule } from '@/modules/platform-administration/platform-administration-module';
import { DEFAULT_TENANT_SORT } from '@/modules/platform-administration/tenants/tenant-query';
import { visibleTenantTotal } from '@/modules/platform-administration/tenants/tenant-rules';
import { listTenants } from '@/modules/platform-administration/tenants/tenant-service';

export const metadata: Metadata = { title: 'Platform Overview' };

function describeTenantDirectoryState(totalItems: number): string {
  if (totalItems === 0) {
    return 'No tenants are available in the live directory yet.';
  }

  return `${totalItems} tenant${totalItems === 1 ? ' is' : 's are'} available from the live directory.`;
}

export default async function PlatformOverviewPage() {
  const selectedContext = await getCurrentContextProfile();

  if (selectedContext.kind !== 'resolved') {
    redirect('/select-context');
  }

  if (selectedContext.context.module.id !== platformAdministrationModule.id) {
    redirect('/admin');
  }

  // Only the count is shown, so one row is enough (BG-15: no aggregate counts).
  const directory = await load(listTenants({ sort: DEFAULT_TENANT_SORT, page: 0, size: 1 }));

  return (
    <PlatformPageShell
      title="Platform overview"
      description="Confirm the active platform context and move into the live read-only workspaces."
    >
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
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
                  <Typography variant="body2">
                    {selectedContext.context.branch?.name ?? 'All branches'}
                  </Typography>
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

        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined" sx={{ height: '100%' }}>
            <CardContent>
              <Stack spacing={1.25}>
                <Typography variant="overline" color="text.secondary">
                  Tenant operations
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  Live tenant directory
                </Typography>
                {directory.ok ? (
                  <Typography color="text.secondary" variant="body2">
                    {describeTenantDirectoryState(
                      // BG-29: the total includes the reserved platform organisation.
                      visibleTenantTotal(directory.value.page.totalItems, false, false),
                    )}
                  </Typography>
                ) : (
                  <ErrorState problem={directory.problem} />
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
      </Grid>
    </PlatformPageShell>
  );
}
