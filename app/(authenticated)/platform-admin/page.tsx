import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import AdminPanelSettingsOutlined from '@mui/icons-material/AdminPanelSettingsOutlined';
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import EditNoteOutlined from '@mui/icons-material/EditNoteOutlined';
import HourglassEmptyOutlined from '@mui/icons-material/HourglassEmptyOutlined';
import PauseCircleOutlined from '@mui/icons-material/PauseCircleOutlined';
import { getCurrentContextProfile } from '@/auth/context-service';
import { can } from '@/auth/permissions';
import { ForbiddenState } from '@/components/data-display/forbidden-state';
import { KpiTile } from '@/components/data-display/kpi-tile';
import type { StatusTone } from '@/components/data-display/status-chip';
import { PageHeader } from '@/components/shell/page-header';
import { isPlatformOrganisation } from '@/config/application-context';
import { load, type Loaded } from '@/lib/api/load';
import { AttentionCard } from '@/modules/platform-administration/overview/components/attention-card';
import {
  activeInstitutionCount,
  ATTENTION_PREVIEW_SIZE,
  attentionView,
  KPI,
  OVERVIEW_DESCRIPTION,
} from '@/modules/platform-administration/overview/overview-rules';
import {
  countPlatformOperators,
  countTenantsInStatus,
  listTenantsInStatus,
} from '@/modules/platform-administration/overview/overview-service';

export const metadata: Metadata = { title: 'Platform overview' };

/** A tile's value: a failed read is `null` with its reference, never 0 (rule 9). */
function tileValue<T>(read: Loaded<T>, count: (value: T) => number) {
  return read.ok
    ? { value: count(read.value), reference: null }
    : { value: null, reference: read.problem.requestId };
}

/** Spec §11.4: five counts and the requests waiting for someone. The layout keeps every other
 * context out. */
export default async function PlatformOverviewPage() {
  const selected = await getCurrentContextProfile();
  const holder = { permissions: selected.kind === 'resolved' ? selected.profile.permissions : [] };
  const tenants = can(holder, 'tenant.view');
  const users = can(holder, 'user.view');
  const header = (
    <PageHeader
      eyebrow="Platform administration"
      title="Platform overview"
      description={OVERVIEW_DESCRIPTION}
    />
  );
  if (!tenants && !users) {
    return (
      <>
        {header}
        <Paper>
          <ForbiddenState />
        </Paper>
      </>
    );
  }

  // Five reads in parallel (BG-15: `size=1` counts; the previews' totals are their tiles' counts).
  const [active, pending, drafts, suspended, operators] = await Promise.all([
    tenants ? load(countTenantsInStatus('ACTIVE')) : null,
    tenants ? load(listTenantsInStatus('PENDING_APPROVAL', ATTENTION_PREVIEW_SIZE)) : null,
    tenants ? load(listTenantsInStatus('DRAFT', ATTENTION_PREVIEW_SIZE)) : null,
    tenants ? load(countTenantsInStatus('SUSPENDED')) : null,
    users ? load(countPlatformOperators()) : null,
  ]);

  const tile = (
    key: keyof typeof KPI,
    read: { value: number | null; reference: string | null },
    tone: StatusTone,
    icon: ReactNode,
  ) => (
    <KpiTile
      key={key}
      id={`kpi-${key}`}
      label={KPI[key].label}
      value={read.value}
      reference={read.reference}
      caption={KPI[key].caption}
      icon={icon}
      tone={tone}
      link={{ href: KPI[key].href, label: KPI[key].link }}
    />
  );
  const total = (page: { page: { totalItems: number } }) => page.page.totalItems;

  return (
    <>
      {header}
      <Box
        sx={{
          display: 'grid',
          gap: 3,
          gridTemplateColumns: {
            xs: 'minmax(0, 1fr)',
            sm: 'repeat(2, minmax(0, 1fr))',
            lg: 'repeat(5, minmax(0, 1fr))',
          },
          mb: 4,
        }}
      >
        {active &&
          tile(
            'active',
            tileValue(active, activeInstitutionCount),
            'success',
            <CheckCircleOutlined />,
          )}
        {pending &&
          tile('pending', tileValue(pending, total), 'warning', <HourglassEmptyOutlined />)}
        {drafts && tile('drafts', tileValue(drafts, total), 'info', <EditNoteOutlined />)}
        {suspended &&
          tile(
            'suspended',
            tileValue(suspended, (count) => count),
            'error',
            <PauseCircleOutlined />,
          )}
        {operators &&
          tile(
            'operators',
            tileValue(operators, (count) => count),
            'default',
            <AdminPanelSettingsOutlined />,
          )}
      </Box>
      {pending && drafts && (
        <AttentionCard view={attentionView(pending, drafts, isPlatformOrganisation)} />
      )}
    </>
  );
}
