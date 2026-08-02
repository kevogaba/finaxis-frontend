import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import NextLink from '@/components/navigation/next-link';
import type { ApiPage, TenantListQuery, TenantSummary } from '../platform-administration.types';
import { PlatformPagination } from './platform-pagination';
import { PlatformStatusChip } from './platform-status-chip';

interface TenantTableProps {
  pathname: string;
  query: TenantListQuery;
  tenantsPage: ApiPage<TenantSummary>;
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

function toSearchParamsRecord(query: TenantListQuery): Record<string, string | undefined> {
  return {
    country: query.country,
    createdFrom: query.createdFrom,
    createdTo: query.createdTo,
    q: query.q,
    size: query.size !== undefined ? String(query.size) : undefined,
    sortBy: query.sortBy,
    sortDir: query.sortDir,
    status: query.status,
  };
}

function hasTenantFilters(query: TenantListQuery): boolean {
  return Boolean(query.q ?? query.status ?? query.country);
}

export function TenantTable({ pathname, query, tenantsPage }: TenantTableProps) {
  const searchParams = toSearchParamsRecord(query);
  const emptyMessage = hasTenantFilters(query)
    ? 'No tenants matched the current filters.'
    : 'No tenants are available in the live directory yet.';

  return (
    <Stack spacing={3}>
      <Paper
        variant="outlined"
        component="form"
        action={pathname}
        method="get"
        sx={{ p: { xs: 2, md: 3 } }}
      >
        <Stack spacing={2}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Filter tenants
            </Typography>
            <Typography color="text.secondary" variant="body2">
              Search the live tenant directory without leaving the read-only platform workspace.
            </Typography>
          </Box>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField
              fullWidth
              label="Search tenants"
              name="q"
              defaultValue={query.q ?? ''}
              placeholder="Tenant name or code"
            />
            <TextField fullWidth label="Status" name="status" defaultValue={query.status ?? ''} />
            <TextField
              fullWidth
              label="Country"
              name="country"
              defaultValue={query.country ?? ''}
            />
          </Stack>
          <input type="hidden" name="size" value={String(query.size ?? 25)} />
          {query.createdFrom ? (
            <input type="hidden" name="createdFrom" value={query.createdFrom} />
          ) : null}
          {query.createdTo ? (
            <input type="hidden" name="createdTo" value={query.createdTo} />
          ) : null}
          {query.sortBy ? <input type="hidden" name="sortBy" value={query.sortBy} /> : null}
          {query.sortDir ? <input type="hidden" name="sortDir" value={query.sortDir} /> : null}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <Button type="submit" variant="contained">
              Apply filters
            </Button>
            <Button component={NextLink} href={pathname} variant="text">
              Clear filters
            </Button>
          </Stack>
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
        <Stack spacing={2} sx={{ p: { xs: 2, md: 3 } }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Tenant directory
            </Typography>
            <Typography color="text.secondary" variant="body2">
              {tenantsPage.page.totalItems > 0
                ? `${tenantsPage.page.totalItems} tenants reported by the current API page metadata.`
                : 'Live tenant results will appear here when records are available.'}
            </Typography>
          </Box>

          {tenantsPage.items.length === 0 ? (
            <Alert
              severity="info"
              action={
                hasTenantFilters(query) ? (
                  <Button component={NextLink} href={pathname} color="inherit" size="small">
                    Clear filters
                  </Button>
                ) : undefined
              }
            >
              {emptyMessage}
            </Alert>
          ) : (
            <>
              <TableContainer>
                <Table size="small" aria-label="Tenant directory results">
                  <TableHead>
                    <TableRow>
                      <TableCell>Tenant</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Country</TableCell>
                      <TableCell>Currency</TableCell>
                      <TableCell>Timezone</TableCell>
                      <TableCell>Updated</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {tenantsPage.items.map((tenant) => (
                      <TableRow key={tenant.id} hover>
                        <TableCell>
                          <Stack spacing={0.5}>
                            <Link
                              component={NextLink}
                              href={`/platform-admin/tenants/${tenant.id}`}
                              underline="hover"
                              sx={{ fontWeight: 600, width: 'fit-content' }}
                            >
                              {tenant.displayName}
                            </Link>
                            <Typography color="text.secondary" variant="body2">
                              {tenant.tenantCode}
                            </Typography>
                          </Stack>
                        </TableCell>
                        <TableCell>
                          <Stack spacing={0.75}>
                            <PlatformStatusChip status={tenant.status} />
                            {tenant.bootstrapStatus ? (
                              <Typography color="text.secondary" variant="body2">
                                Bootstrap: {tenant.bootstrapStatus.replaceAll('_', ' ')}
                              </Typography>
                            ) : null}
                          </Stack>
                        </TableCell>
                        <TableCell>{tenant.countryCode}</TableCell>
                        <TableCell>{tenant.baseCurrencyCode ?? '—'}</TableCell>
                        <TableCell>{tenant.timezone ?? '—'}</TableCell>
                        <TableCell>{formatDate(tenant.updatedAt ?? tenant.createdAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <PlatformPagination
                pathname={pathname}
                page={tenantsPage.page}
                searchParams={searchParams}
              />
            </>
          )}
        </Stack>
      </Paper>
    </Stack>
  );
}
