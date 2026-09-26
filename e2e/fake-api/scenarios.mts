import type {
  FakeBranch,
  FakeBranchAssignment,
  FakeMembership,
  FakeOrganisation,
  FakeRole,
  FakeRoleAssignment,
  FakeUser,
  RunState,
} from './state.mts';

export const IDS = {
  platformOrganisation: '00000000-0000-0000-0000-000000000000',
  greenfield: '11111111-1111-4111-8111-111111111111',
  headOffice: '22222222-2222-4222-8222-222222222222',
  greenfieldMembership: '33333333-3333-4333-8333-333333333333',
  westlands: '44444444-4444-4444-8444-444444444444',
  jane: '55555555-5555-4555-8555-555555555555',
  tenantAdminRole: '66666666-6666-4666-8666-666666666666',
  platformOperations: '77777777-7777-4777-8777-777777777777',
  platformMembership: '88888888-8888-4888-8888-888888888888',
  acme: '99999999-9999-4999-8999-999999999999',
  platformAdminRole: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
} as const;

const CREATED = '2026-07-01T08:00:00Z';
const UPDATED = '2026-07-24T08:00:00Z';

export const TENANT_ADMIN_PERMISSIONS = [
  'iam.profile.read',
  'auth.select_organisation',
  'auth.select_branch',
  'tenant.view',
  'user.view',
  'membership.view',
  'branch.view',
  'branch_assignment.view',
  'role.view',
  'role_assignment.view',
  'permission.view',
  'audit.view',
  'settings.view',
  'business_date.view',
];

export const PLATFORM_ADMIN_PERMISSIONS = [
  'iam.profile.read',
  'auth.select_organisation',
  'auth.select_branch',
  'tenant.view',
  'branch.view',
  'user.view',
];

const jane: FakeUser = {
  id: IDS.jane,
  username: 'jane.manager',
  email: 'backend.jane@greenfield.example',
  displayName: 'Backend Jane Manager',
  status: 'ACTIVE',
  keycloakSubject: 'e2e-keycloak-subject',
};

function organisation(
  id: string,
  code: string,
  displayName: string,
  overrides: Partial<FakeOrganisation> = {},
): FakeOrganisation {
  return {
    id,
    code,
    displayName,
    countryCode: 'KE',
    baseCurrencyCode: 'KES',
    timezone: 'Africa/Nairobi',
    status: 'ACTIVE',
    bootstrapStatus: 'COMPLETED',
    bootstrapFailureCode: null,
    createdAt: CREATED,
    updatedAt: UPDATED,
    ...overrides,
  };
}

function branch(
  id: string,
  organisationId: string,
  code: string,
  name: string,
  type: string,
): FakeBranch {
  return {
    id,
    organisationId,
    code,
    name,
    type,
    status: 'ACTIVE',
    timezone: 'Africa/Nairobi',
    parentBranchId: null,
    statusReason: null,
    createdAt: CREATED,
    updatedAt: UPDATED,
  };
}

function membership(id: string, organisationId: string, userId: string): FakeMembership {
  return {
    id,
    organisationId,
    userId,
    status: 'ACTIVE',
    type: 'ADMIN',
    primaryBranchId: null,
    createdAt: CREATED,
    updatedAt: UPDATED,
  };
}

function assignment(
  id: string,
  organisationId: string,
  userId: string,
  branchId: string,
  type: string,
): FakeBranchAssignment {
  return { id, organisationId, userId, branchId, type, status: 'ACTIVE' };
}

function role(
  id: string,
  organisationId: string,
  code: string,
  name: string,
  permissions: string[],
): FakeRole {
  return {
    id,
    organisationId,
    code,
    name,
    description: null,
    systemRole: true,
    status: 'ACTIVE',
    // Copy: callers pass shared module-level arrays (e.g. TENANT_ADMIN_PERMISSIONS) and later
    // layers mutate a role's permissions in place — every seed must own its own array.
    permissions: [...permissions],
    createdAt: CREATED,
    updatedAt: UPDATED,
  };
}

function tenantRoleAssignment(
  id: string,
  organisationId: string,
  userId: string,
  roleId: string,
): FakeRoleAssignment {
  return {
    id,
    organisationId,
    userId,
    roleId,
    scopeType: 'TENANT',
    branchId: null,
    status: 'ACTIVE',
  };
}

function greenfieldTenant(): RunState {
  return {
    actorUserId: IDS.jane,
    forbidOrganisationSelection: false,
    organisations: [organisation(IDS.greenfield, 'greenfield', 'Greenfield SACCO')],
    // Copy: `jane` is a shared module-level fixture; later layers mutate a user in place, so
    // every seed must own its own object.
    users: [{ ...jane }],
    memberships: [membership(IDS.greenfieldMembership, IDS.greenfield, IDS.jane)],
    branches: [
      branch(IDS.headOffice, IDS.greenfield, 'HEAD_OFFICE', 'Head Office', 'HEAD_OFFICE'),
      branch(IDS.westlands, IDS.greenfield, 'WESTLANDS', 'Westlands Branch', 'OPERATIONS'),
    ],
    branchAssignments: [
      assignment(
        'b0000000-0000-4000-8000-000000000001',
        IDS.greenfield,
        IDS.jane,
        IDS.headOffice,
        'HOME',
      ),
      assignment(
        'b0000000-0000-4000-8000-000000000002',
        IDS.greenfield,
        IDS.jane,
        IDS.westlands,
        'OPERATE',
      ),
    ],
    roles: [
      role(
        IDS.tenantAdminRole,
        IDS.greenfield,
        'TENANT_ADMIN',
        'Tenant admin',
        TENANT_ADMIN_PERMISSIONS,
      ),
    ],
    roleAssignments: [
      tenantRoleAssignment(
        'c0000000-0000-4000-8000-000000000001',
        IDS.greenfield,
        IDS.jane,
        IDS.tenantAdminRole,
      ),
    ],
  };
}

function platformOperator(): RunState {
  return {
    actorUserId: IDS.jane,
    forbidOrganisationSelection: false,
    organisations: [
      organisation(IDS.platformOrganisation, 'PLATFORM', 'Platform', {
        countryCode: 'ZZ',
        baseCurrencyCode: 'XXX',
        timezone: 'UTC',
        bootstrapStatus: null,
      }),
      organisation(IDS.acme, 'acme', 'Acme SACCO'),
    ],
    users: [{ ...jane }],
    memberships: [membership(IDS.platformMembership, IDS.platformOrganisation, IDS.jane)],
    branches: [
      branch(
        IDS.platformOperations,
        IDS.platformOrganisation,
        'PLATFORM_OPS',
        'Platform Operations',
        'HEAD_OFFICE',
      ),
    ],
    branchAssignments: [
      assignment(
        'b0000000-0000-4000-8000-000000000003',
        IDS.platformOrganisation,
        IDS.jane,
        IDS.platformOperations,
        'HOME',
      ),
    ],
    roles: [
      role(
        IDS.platformAdminRole,
        IDS.platformOrganisation,
        'PLATFORM_SUPER_ADMIN',
        'Platform super admin',
        PLATFORM_ADMIN_PERMISSIONS,
      ),
    ],
    roleAssignments: [
      tenantRoleAssignment(
        'c0000000-0000-4000-8000-000000000002',
        IDS.platformOrganisation,
        IDS.jane,
        IDS.platformAdminRole,
      ),
    ],
  };
}

function longNames(): RunState {
  const state = greenfieldTenant();
  const longUser = {
    ...jane,
    displayName:
      'Wanjiru Njeri Kamau-Otieno Achieng Muthoni Wambui Chebet Jepkosgei Nyambura Akinyi Atieno',
    email: 'wanjiru.njeri.kamau-otieno.achieng.muthoni.wambui@greenfield-teachers-sacco.example',
  };
  return {
    ...state,
    users: [longUser],
    organisations: state.organisations.map((organisation) => ({
      ...organisation,
      displayName:
        'Greenfield Teachers and Public Service Employees Savings and Credit Co-operative Society',
    })),
  };
}

function multiOrg(): RunState {
  const tenant = greenfieldTenant();
  const platform = platformOperator();
  return {
    ...tenant,
    organisations: [...tenant.organisations, ...platform.organisations],
    memberships: [...tenant.memberships, ...platform.memberships],
    branches: [...tenant.branches, ...platform.branches],
    branchAssignments: [...tenant.branchAssignments, ...platform.branchAssignments],
    roles: [...tenant.roles, ...platform.roles],
    roleAssignments: [...tenant.roleAssignments, ...platform.roleAssignments],
  };
}

function duplicateAssignments(): RunState {
  const state = greenfieldTenant();
  // HOME and OPERATE at Head Office only: the backend lists the branch twice and doesn't
  // auto-select (it only auto-selects when exactly one row comes back).
  return {
    ...state,
    branchAssignments: [
      assignment(
        'b0000000-0000-4000-8000-000000000011',
        IDS.greenfield,
        IDS.jane,
        IDS.headOffice,
        'HOME',
      ),
      assignment(
        'b0000000-0000-4000-8000-000000000012',
        IDS.greenfield,
        IDS.jane,
        IDS.headOffice,
        'OPERATE',
      ),
    ],
  };
}

function noBranches(): RunState {
  const state = greenfieldTenant();
  return {
    ...state,
    memberships: state.memberships.map((membership) => ({ ...membership, type: 'AUDITOR' })),
    branchAssignments: [],
  };
}

// `satisfies` (not a `: Record<...>` annotation) keeps the literal key set so `ScenarioName` below
// is the real union, not `string` — the annotation would still check each builder the same way.
const BUILDERS = {
  default: greenfieldTenant,
  'empty-organisations': () => ({ ...greenfieldTenant(), memberships: [] }),
  'selection-forbidden': () => ({ ...greenfieldTenant(), forbidOrganisationSelection: true }),
  'platform-operator': platformOperator,
  'long-names': longNames,
  'multi-org': multiOrg,
  'duplicate-assignments': duplicateAssignments,
  'no-branches': noBranches,
  // Keeps westlands' branch assignment ACTIVE while the branch itself is SUSPENDED, so a route
  // can prove it lists a SUSPENDED branch (or correctly excludes one) without a branch-lifecycle
  // route to reach that state at runtime.
  'suspended-branch': () => {
    const state = greenfieldTenant();
    return {
      ...state,
      branches: state.branches.map((candidate) =>
        candidate.id === IDS.westlands ? { ...candidate, status: 'SUSPENDED' } : candidate,
      ),
    };
  },
} satisfies Record<string, () => RunState>;

/** Single source of truth for scenario names — `e2e/support/auth.ts` imports this as a type. */
export type ScenarioName = keyof typeof BUILDERS;

export const SCENARIOS: readonly string[] = Object.keys(BUILDERS);

export function seedScenario(name: string): RunState {
  // `BUILDERS` keeps its literal key type (via `satisfies` above) so `ScenarioName` is precise;
  // indexing it by an arbitrary runtime `string` needs the wider, explicitly-indexed view below
  // (`noUncheckedIndexedAccess` still leaves `build` as `(() => RunState) | undefined`).
  const byName: Readonly<Record<string, () => RunState>> = BUILDERS;
  const build = byName[name];
  if (!build) {
    throw new Error(`Unknown fake API scenario "${name}".`);
  }
  return build();
}
