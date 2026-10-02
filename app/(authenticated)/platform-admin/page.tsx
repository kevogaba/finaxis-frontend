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
    return 'No SACCO institutions have been created yet.';
  }

  return `${totalItems} SACCO institution${totalItems === 1 ? ' is' : 's are'} in the directory.`;
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
      description="Confirm the active platform context and open the SACCO institutions workspace."
    >
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined" sx={{ height: '100%' }}>
            <CardContent>
              <Stack spacing={1}>
                <Typography variant="overline" sx={{ color: 'text.secondary' }}>
                  Active platform context
                </Typography>
                <Typography component="h2" variant="h6" sx={{ fontWeight: 700 }}>
                  {selectedContext.context.organization.name}
                </Typography>
                <Stack direction="row" spacing={1}>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    Branch:
                  </Typography>
                  <Typography variant="body2">
                    {selectedContext.context.branch?.name ?? 'All branches'}
                  </Typography>
                </Stack>
                <Stack direction="row" spacing={1}>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
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
                <Typography variant="overline" sx={{ color: 'text.secondary' }}>
                  Institution operations
                </Typography>
                <Typography component="h2" variant="h6" sx={{ fontWeight: 700 }}>
                  SACCO institutions
                </Typography>
                {directory.ok ? (
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
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
                Open SACCO institutions
              </Button>
            </CardActions>
          </Card>
        </Grid>
      </Grid>
    </PlatformPageShell>
  );
}
