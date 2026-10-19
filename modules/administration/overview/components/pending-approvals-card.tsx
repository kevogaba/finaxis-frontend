import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import { SectionCard } from '@/components/data-display/section-card';
import NextLink from '@/components/navigation/next-link';
import { load } from '@/lib/api/load';
import { NOTHING_WAITING } from '@/modules/administration/approvals/approval-notifications';
import { APPROVALS_HREF } from '@/modules/administration/approvals/approval-rules';
import {
  countUserApprovals,
  listBranchActivations,
  listUserApprovals,
} from '@/modules/administration/approvals/approval-service';
import { DEFAULT_BRANCH_SORT } from '@/modules/administration/branches/branch-query';
import {
  APPROVAL_PREVIEW_SIZE,
  APPROVALS_DESCRIPTION,
  APPROVALS_LINK,
  CARD_TITLES,
  pendingApprovalsView,
  REQUESTS_LABEL,
  REVIEW,
  userPreviewSize,
  type PendingApprovalsView,
} from '../overview-rules';

/** Spec §10.8's Pending approvals: each count with its tab, up to five requests with Review, and
 * the identities still provisioning noted apart. A failed read says so, with its reference. */
export function PendingApprovalsCard({ view }: { view: PendingApprovalsView }) {
  return (
    <SectionCard
      title={CARD_TITLES.approvals}
      description={APPROVALS_DESCRIPTION}
      actions={
        <Link component={NextLink} href={APPROVALS_HREF} variant="body2" sx={{ fontWeight: 600 }}>
          {APPROVALS_LINK}
        </Link>
      }
    >
      {view.failures.map((failure) => (
        <Alert key={failure} severity="error" sx={{ mx: 4, mt: 3, overflowWrap: 'anywhere' }}>
          {failure}
        </Alert>
      ))}
      {view.summary.length > 0 && (
        <Box component="ul" role="list" sx={{ listStyle: 'none', m: 0, px: 4, pt: 3 }}>
          {view.summary.map((entry) => (
            <Box
              component="li"
              key={entry.id}
              sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 2, rowGap: 0.5, py: 0.5 }}
            >
              <Typography component="span" variant="body2">
                {entry.text}
              </Typography>
              <Link component={NextLink} href={entry.href} variant="body2" sx={{ fontWeight: 600 }}>
                {entry.linkLabel}
              </Link>
            </Box>
          ))}
        </Box>
      )}
      {view.rows.length > 0 && (
        <Box
          component="ul"
          role="list"
          aria-label={REQUESTS_LABEL}
          sx={{ listStyle: 'none', m: 0, mt: 3, p: 0 }}
        >
          {view.rows.map((row) => (
            <Box
              component="li"
              key={`${row.kind}-${row.id}`}
              sx={{
                px: 4,
                py: 2.5,
                borderTop: 1,
                borderColor: 'divider',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 3,
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body1" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>
                  {row.name}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ color: 'text.secondary', overflowWrap: 'anywhere' }}
                >
                  {row.detail}
                </Typography>
              </Box>
              <Link
                component={NextLink}
                href={row.href}
                aria-label={row.reviewLabel}
                variant="body2"
                sx={{ fontWeight: 700, flexShrink: 0 }}
              >
                {REVIEW}
              </Link>
            </Box>
          ))}
        </Box>
      )}
      {view.empty && (
        <Typography
          sx={{ px: 4, pt: 3.5, pb: view.provisioning ? 0 : 3.5, color: 'text.secondary' }}
        >
          {NOTHING_WAITING}
        </Typography>
      )}
      {view.provisioning && (
        <Alert severity="info" role="note" sx={{ mx: 4, my: 3 }}>
          {view.provisioning}
        </Alert>
      )}
    </SectionCard>
  );
}

/** BG-11: an approved identity can wait on provisioning for good, and the endpoint can't leave it
 * out, so the users preview follows the bell's counts (shared per request, `cache()`) and is wide
 * enough to skip each one: one bounded read of at most 100 (`userPreviewSize`). After a failed
 * count the preview isn't read; the card says the users couldn't be loaded. */
async function readUserPreview() {
  const counts = await load(countUserApprovals());
  if (!counts.ok) return { counts, page: counts };
  const page = await load(
    listUserApprovals({ page: 0, size: userPreviewSize(counts.value.provisioning) }),
  );
  return { counts, page };
}

/** The users preview after its count, the five-row branch preview beside it; each read only with
 * its kind's codes and settled by `load()`: a lost session or a stale context redirects. */
export async function PendingApprovalsSection({
  users,
  branches,
  branchSelected,
}: {
  users: boolean;
  branches: boolean;
  branchSelected: boolean;
}) {
  const [userReads, branchPage] = await Promise.all([
    users ? readUserPreview() : null,
    branches
      ? load(
          listBranchActivations({
            sort: DEFAULT_BRANCH_SORT,
            page: 0,
            size: APPROVAL_PREVIEW_SIZE,
          }),
        )
      : null,
  ]);
  return (
    <PendingApprovalsCard
      view={pendingApprovalsView({
        users: userReads?.page ?? null,
        userCounts: userReads?.counts ?? null,
        branches: branchPage,
        branchSelected,
      })}
    />
  );
}
