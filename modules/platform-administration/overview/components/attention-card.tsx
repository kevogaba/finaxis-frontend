import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import { EmptyState } from '@/components/data-display/empty-state';
import { SectionCard } from '@/components/data-display/section-card';
import { StatusChip } from '@/components/data-display/status-chip';
import { TruncatedText } from '@/components/data-display/truncated-text';
import NextLink from '@/components/navigation/next-link';
import { formatInstant } from '@/lib/format';
import { countryLabel } from '../../tenants/tenant-rules';
import { ATTENTION_DESCRIPTION, type AttentionView } from '../overview-rules';

/** Spec §11.4's Needs attention: a bounded preview (≤ 5 per status) linking to the directory. */
export function AttentionCard({ view }: { view: AttentionView }) {
  return (
    <SectionCard title="Needs attention" description={ATTENTION_DESCRIPTION}>
      {view.failures.map((failure) => (
        <Alert key={failure} severity="error" sx={{ mx: 4, mt: 3 }}>
          {failure}
        </Alert>
      ))}
      {view.rows.length > 0 ? (
        // Keyboard-scrollable at 375 px, where the 640 px table overflows (07's history-table rule,
        // as in 10's branch assignments table). Not "Needs attention": this card's section is the
        // region of that name, and two landmarks with one name fail axe's landmark-unique.
        <TableContainer tabIndex={0} role="region" aria-label="Needs attention table">
          <Table aria-label="Institutions needing attention" sx={{ minWidth: 640 }}>
            <TableHead>
              <TableRow>
                <TableCell>Institution</TableCell>
                <TableCell>Lifecycle</TableCell>
                <TableCell>Country</TableCell>
                <TableCell>Created (UTC)</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {view.rows.map((tenant) => (
                <TableRow key={tenant.id}>
                  <TableCell>
                    <Link
                      component={NextLink}
                      href={`/platform-admin/tenants/${tenant.id.toLowerCase()}`}
                      variant="body2"
                      noWrap
                      title={tenant.displayName}
                      sx={{ display: 'block', maxWidth: 'min(320px, 60vw)', fontWeight: 700 }}
                    >
                      {tenant.displayName}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <StatusChip value={tenant.status} />
                  </TableCell>
                  <TableCell>
                    <TruncatedText value={countryLabel(tenant.countryCode)} maxWidth={200} />
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    {formatInstant(tenant.createdAt, 'UTC').date}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        view.empty && <EmptyState title={view.empty.title} description={view.empty.description} />
      )}
      {view.more.length > 0 && (
        <Box
          component="ul"
          sx={{ listStyle: 'none', m: 0, px: 4, py: 3, display: 'flex', flexWrap: 'wrap', gap: 3 }}
        >
          {view.more.map((more) => (
            <li key={more.href}>
              <Link component={NextLink} href={more.href} variant="body2" sx={{ fontWeight: 600 }}>
                {more.label}
              </Link>
            </li>
          ))}
        </Box>
      )}
    </SectionCard>
  );
}
