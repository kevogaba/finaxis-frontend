'use client';

import type { ReactNode } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { DescriptionList, type DescriptionItem } from '@/components/data-display/description-list';
import { SectionCard } from '@/components/data-display/section-card';
import { humanizeEnum } from '@/components/data-display/status-chip';
import { REVIEW_NOTE, SCOPE_OPTIONS } from '../invite-rules';
import type { InviteValues } from '../invite-schema';
import type { SelectOption } from '../user-rules';

/** An optional answer left empty: muted and regular weight, so a gap doesn't read as a value
 * (16's review). */
const NOT_SET = (
  <Typography component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>
    Not set
  </Typography>
);

const NONE = (
  <Typography component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>
    None
  </Typography>
);

function lines(values: readonly string[]): ReactNode {
  if (values.length === 0) return NONE;
  return (
    <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gap: 1 }}>
      {values.map((value, index) => (
        // A row can repeat only until Continue refuses it; the index keeps the keys unique.
        <li key={`${String(index)} ${value}`}>{value}</li>
      ))}
    </Box>
  );
}

const yesNo = (value: string) => (value === 'true' ? 'Yes' : 'No');

interface ReviewSection {
  /** The step's label, as the Stepper shows it. */
  title: string;
  /** The step's index, for its Edit button. */
  step: number;
  items: DescriptionItem[];
}

interface InviteReviewProps {
  values: InviteValues;
  roles: readonly SelectOption[];
  branches: readonly SelectOption[];
  /** A send in flight: Edit would move the wizard under it. */
  pending: boolean;
  onEdit: (step: number) => void;
}

/** The Review step: every answer by step, each with a way back to it (spec §10.5). */
export function InviteReview({ values, roles, branches, pending, onEdit }: InviteReviewProps) {
  const label = (options: readonly SelectOption[], id: string) =>
    options.find((option) => option.id === id)?.label ?? id;
  const scope = (scopeType: string) =>
    SCOPE_OPTIONS.find((option) => option.value === scopeType)?.label ?? scopeType;
  const sections: ReviewSection[] = [
    {
      title: 'Identity',
      step: 0,
      items: [
        { label: 'Full name', value: values.displayName },
        { label: 'Email', value: values.email },
        { label: 'Username', value: values.username },
        { label: 'Phone', value: values.phone || NOT_SET },
        { label: 'Membership type', value: humanizeEnum(values.membershipType) },
      ],
    },
    {
      title: 'Access',
      step: 1,
      items: [
        {
          label: 'Branch assignments',
          value: lines(
            values.branchAssignments.map(
              (row) => `${label(branches, row.branchId)} · ${humanizeEnum(row.assignmentType)}`,
            ),
          ),
        },
        {
          label: 'Roles',
          value: lines(
            values.roleAssignments.map((row) =>
              row.scopeType === 'BRANCH'
                ? `${label(roles, row.roleId)} · ${label(branches, row.branchId)}`
                : `${label(roles, row.roleId)} · ${scope(row.scopeType)}`,
            ),
          ),
        },
        {
          label: 'Primary branch',
          value: values.primaryBranchId ? label(branches, values.primaryBranchId) : NOT_SET,
        },
      ],
    },
    {
      title: 'Invitation',
      step: 2,
      items: [
        { label: 'Identity-provider invitation', value: yesNo(values.sendIdentityInvite) },
        { label: 'Application invitation', value: yesNo(values.sendApplicationInvite) },
      ],
    },
  ];

  return (
    <>
      {sections.map((section) => (
        <SectionCard
          key={section.title}
          title={section.title}
          headingLevel="h3"
          actions={
            <Button
              size="small"
              aria-label={`Edit ${section.title.toLowerCase()}`}
              disabled={pending}
              onClick={() => {
                onEdit(section.step);
              }}
            >
              Edit
            </Button>
          }
        >
          <DescriptionList columns={1} items={section.items} />
        </SectionCard>
      ))}
      <Alert severity="info" role="note">
        {REVIEW_NOTE}
      </Alert>
    </>
  );
}
