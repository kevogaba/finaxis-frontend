import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import Paper from '@mui/material/Paper';
import DomainOutlined from '@mui/icons-material/DomainOutlined';
import { getCurrentContextProfile } from '@/auth/context-service';
import { can } from '@/auth/permissions';
import { ErrorState } from '@/components/data-display/error-state';
import { ForbiddenState } from '@/components/data-display/forbidden-state';
import { RecordHero } from '@/components/data-display/record-hero';
import { RecordTabs } from '@/components/data-display/record-tabs';
import { StatusChip } from '@/components/data-display/status-chip';
import { PageHeader } from '@/components/shell/page-header';
import { load } from '@/lib/api/load';
import { TenantLifecycleActions } from '@/modules/platform-administration/tenants/components/tenant-lifecycle-actions';
import { isInstitutionId } from '@/modules/platform-administration/tenants/institution-id';
import {
  availableTenantActions,
  countryName,
} from '@/modules/platform-administration/tenants/tenant-rules';
import { getTenant } from '@/modules/platform-administration/tenants/tenant-service';

export const metadata: Metadata = { title: 'Institution record' };

const EYEBROW = 'Platform administration · Institution record';

interface TenantRecordLayoutProps {
  children: ReactNode;
  params: Promise<{ tenantId: string }>;
}

/** Record shell (spec §9, §11.2): the hero reads the tenant once (cached); each tab reads its own. */
export default async function TenantRecordLayout({ children, params }: TenantRecordLayoutProps) {
  const { tenantId } = await params;
  // BG-29: the reserved platform organisation is no institution, so nothing can target it here.
  if (!isInstitutionId(tenantId)) notFound();

  const [tenant, selected] = await Promise.all([
    load(getTenant(tenantId)),
    getCurrentContextProfile(),
  ]);
  if (!tenant.ok) {
    if (tenant.problem.code === 'resource_not_found') notFound();
    return (
      <>
        <PageHeader eyebrow={EYEBROW} title="Institution record" />
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
  const holder = { permissions: resolved?.profile.permissions ?? [] };
  const actions = availableTenantActions(record.status, holder);
  const base = `/platform-admin/tenants/${tenantId}`;

  return (
    <>
      <RecordHero
        back={{ href: '/platform-admin/tenants', label: 'Back to institutions' }}
        avatar={{ kind: 'icon', icon: <DomainOutlined /> }}
        eyebrow={EYEBROW}
        title={record.displayName}
        subtitle={`${record.tenantCode} · ${countryName(record.countryCode)}`}
        status={<StatusChip value={record.status} />}
        actions={
          // Undefined, not an empty component: RecordHero renders its actions box whenever the
          // prop is truthy (08).
          actions.length > 0 ? (
            <TenantLifecycleActions
              tenantId={tenantId}
              tenantName={record.displayName}
              tenantCode={record.tenantCode}
              actions={actions}
              contextOrganisationId={resolved?.context.organization.id}
            />
          ) : undefined
        }
      />
      <RecordTabs
        label={`${record.displayName} sections`}
        tabs={[
          { href: base, label: 'Overview' },
          { href: `${base}/provisioning`, label: 'Provisioning' },
          // Each tab reads its own list, which needs its view code (contract §E.2).
          ...(can(holder, 'branch.view') ? [{ href: `${base}/branches`, label: 'Branches' }] : []),
          ...(can(holder, 'user.view') ? [{ href: `${base}/users`, label: 'Users' }] : []),
        ]}
      />
      {children}
    </>
  );
}
