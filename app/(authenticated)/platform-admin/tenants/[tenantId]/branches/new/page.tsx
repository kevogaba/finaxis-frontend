import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import { getCurrentContextProfile } from '@/auth/context-service';
import { canAll } from '@/auth/permissions';
import { ErrorState } from '@/components/data-display/error-state';
import { ForbiddenState } from '@/components/data-display/forbidden-state';
import NextLink from '@/components/navigation/next-link';
import { PageHeader } from '@/components/shell/page-header';
import { load } from '@/lib/api/load';
import { isTimeZone } from '@/modules/administration/branches/branch-rules';
import { InstitutionBranchDraftForm } from '@/modules/platform-administration/branches/components/institution-branch-draft-form';
import { institutionBranchesHref } from '@/modules/platform-administration/branches/institution-branch-query';
import {
  BRANCH_CREATE_CODES,
  BRANCH_CREATE_INACTIVE,
  branchCreateDescription,
  branchCreateWarning,
  parentsNote,
} from '@/modules/platform-administration/branches/institution-branch-rules';
import { getInstitutionBranchIndex } from '@/modules/platform-administration/branches/institution-branch-service';
import { parseInstitutionId } from '@/modules/platform-administration/tenants/institution-id';
import { getTenant } from '@/modules/platform-administration/tenants/tenant-service';

export const metadata: Metadata = { title: 'Create branch draft' };

const EYEBROW = 'Platform administration · Branches';

interface NewInstitutionBranchPageProps {
  params: Promise<{ tenantId: string }>;
}

/** Spec §11.2's create draft, with BG-18's warning (Ruling 8). Outside `(record)`: no hero. */
export default async function NewInstitutionBranchPage({ params }: NewInstitutionBranchPageProps) {
  const tenantId = parseInstitutionId((await params).tenantId);
  if (!tenantId) notFound();

  const [tenant, selected] = await Promise.all([
    load(getTenant(tenantId)),
    getCurrentContextProfile(),
  ]);
  const header = (description?: string) => (
    <PageHeader eyebrow={EYEBROW} title="Create branch draft" description={description} />
  );
  if (!tenant.ok) {
    if (tenant.problem.code === 'resource_not_found') notFound();
    return (
      <>
        {header()}
        <Paper>
          {tenant.problem.code === 'forbidden' ? (
            <ForbiddenState />
          ) : (
            <ErrorState problem={tenant.problem} />
          )}
        </Paper>
      </>
    );
  }

  const record = tenant.value;
  const resolved = selected.kind === 'resolved' ? selected : null;
  const branchesHref = institutionBranchesHref(tenantId);
  const back = (
    <Button component={NextLink} href={branchesHref} variant="outlined">
      Back to branches
    </Button>
  );
  if (!canAll({ permissions: resolved?.profile.permissions ?? [] }, BRANCH_CREATE_CODES)) {
    return (
      <>
        {header()}
        <Paper>
          <ForbiddenState action={back} />
        </Paper>
      </>
    );
  }
  if (record.status !== 'ACTIVE') {
    return (
      <>
        {header()}
        <Paper>
          <ForbiddenState
            title={BRANCH_CREATE_INACTIVE.title}
            description={BRANCH_CREATE_INACTIVE.description}
            action={back}
          />
        </Paper>
      </>
    );
  }

  // Parents: a bounded index (≤ 500, Ruling 8). A failed read says so in the picker (rule 9).
  const index = await load(getInstitutionBranchIndex(tenantId));
  const parents = index.ok
    ? [...index.value.names].map(([id, branch]) => ({
        id,
        label: `${branch.name} (${branch.code})`,
      }))
    : [];

  return (
    <>
      {header(branchCreateDescription(record.displayName))}
      <Paper>
        <Alert severity="warning" role="note" sx={{ m: 4.5, mb: 0 }}>
          {branchCreateWarning(record.displayName)}
        </Alert>
        <InstitutionBranchDraftForm
          tenantId={tenantId}
          parents={parents}
          parentsNote={parentsNote(
            index.ok ? { ok: true, truncated: index.value.truncated } : { ok: false },
          )}
          // Java ZoneIds Intl can't format (e.g. `UTC+3`) would fail the form's own check.
          defaultTimeZone={isTimeZone(record.timezone) ? record.timezone : 'UTC'}
          contextOrganisationId={resolved?.context.organization.id}
        />
      </Paper>
    </>
  );
}
