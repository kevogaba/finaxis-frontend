import type {
  FakeAuditEvent,
  FakeBranch,
  FakeBranchAssignment,
  FakeBusinessDateEvent,
  FakeMembership,
  FakeOrganisation,
  FakeRole,
  FakeRoleAssignment,
  FakeTenantSetting,
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
  'business_date.advance',
  'business_date.reopen',
  'cob.start',
  'cob.complete',
  'settings.update',
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

function seedAuditEvents(): FakeAuditEvent[] {
  const catalogue: [string, string, string | null, string][] = [
    ['USER', 'user.invite', IDS.jane, 'SUCCESS'],
    ['BRANCH', 'branch.create_draft', IDS.westlands, 'SUCCESS'],
    ['ROLE', 'role.update', IDS.tenantAdminRole, 'SUCCESS'],
    ['BUSINESS_DATE', 'cob.start', null, 'SUCCESS'],
    ['MEMBERSHIP', 'membership.revoke', IDS.greenfieldMembership, 'FAILURE'],
  ];
  return Array.from({ length: 30 }, (_, index) => {
    const [entityType = 'USER', action = 'user.invite', entityId = null, outcome = 'SUCCESS'] =
      catalogue[index % catalogue.length] ?? [];
    const minute = String(59 - index).padStart(2, '0');
    return {
      id: `e0000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      organisationId: IDS.greenfield,
      occurredAt: `2026-09-07T07:${minute}:00Z`,
      actorUserId: index % 6 === 5 ? null : IDS.jane,
      actorType: index % 6 === 5 ? 'SYSTEM' : 'USER',
      branchId: index % 2 === 0 ? IDS.headOffice : null,
      entityType,
      entityId,
      action,
      outcome,
      severity: 'INFO',
      reason: index === 0 ? 'New teller joining the Westlands team' : null,
      beforeJson: index === 2 ? '{"role_name":"Tenant admin"}' : null,
      afterJson:
        index === 0
          ? '{"status":"DRAFT"}'
          : index === 2
            ? '{"role_name":"Tenant administrator"}'
            : null,
      metadataJson: '{}',
    };
  });
}

function seedBusinessDateHistory(): FakeBusinessDateEvent[] {
  const base = { organisationId: IDS.greenfield, actorUserId: IDS.jane, reason: null };
  return [
    {
      ...base,
      eventType: 'ADVANCED',
      fromStatus: 'OPEN',
      toStatus: 'OPEN',
      fromDate: '04-09-2026',
      toDate: '07-09-2026',
      occurredAt: '2026-09-07T05:00:00Z',
      reason: 'Weekend',
    },
    {
      ...base,
      eventType: 'REOPENED',
      fromStatus: 'CLOSED',
      toStatus: 'OPEN',
      fromDate: '04-09-2026',
      toDate: '04-09-2026',
      occurredAt: '2026-09-07T04:58:00Z',
    },
    {
      ...base,
      eventType: 'COB_COMPLETED',
      fromStatus: 'CLOSING',
      toStatus: 'CLOSED',
      fromDate: '04-09-2026',
      toDate: '04-09-2026',
      occurredAt: '2026-09-04T18:30:00Z',
    },
    {
      ...base,
      eventType: 'COB_STARTED',
      fromStatus: 'OPEN',
      toStatus: 'CLOSING',
      fromDate: '04-09-2026',
      toDate: '04-09-2026',
      occurredAt: '2026-09-04T18:00:00Z',
      reason: 'End of day',
    },
  ];
}

/** A fresh array per seed (fake-api.spec pins unshared fixtures). No IDs: rows are keyed by `key`. */
function seedTenantSettings(organisationId: string): FakeTenantSetting[] {
  const row = (key: string, value: string, valueType: string): FakeTenantSetting => ({
    organisationId,
    key,
    value,
    valueType,
    sensitive: false,
  });
  return [
    row('default_timezone', 'Africa/Nairobi', 'TIMEZONE'),
    row('base_currency', 'KES', 'CURRENCY'),
    // Stored keys outside the catalogue, as on dev (contract §H); one long value for 375 px.
    row('business-date.timezone', 'Africa/Nairobi', 'STRING'),
    row(
      'settings.operational',
      '{"cash_limit_per_teller":"250000","end_of_day_cutoff":"17:30","statement_numbering":"GF-{branch}-{yyyy}-{seq}"}',
      'STRING',
    ),
  ];
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
    auditEvents: seedAuditEvents(),
    businessDates: [{ organisationId: IDS.greenfield, date: '07-09-2026', status: 'OPEN' }],
    businessDateHistory: seedBusinessDateHistory(),
    idempotency: new Map(),
    lockTimeoutsRemaining: 0,
    tenantSettings: seedTenantSettings(IDS.greenfield),
    baseCurrencyFrozen: false,
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
    auditEvents: [],
    businessDates: [],
    businessDateHistory: [],
    idempotency: new Map(),
    lockTimeoutsRemaining: 0,
    tenantSettings: [],
    baseCurrencyFrozen: false,
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

/** Strips permission `codes` from every role — reusable across gating scenarios. */
function withoutPermission(state: RunState, ...codes: string[]): RunState {
  return {
    ...state,
    roles: state.roles.map((candidate) => ({
      ...candidate,
      permissions: candidate.permissions.filter((permission) => !codes.includes(permission)),
    })),
  };
}

// Layer 15 (profile) seed IDs — 15000000-… per the lane rules; never reused.
const PROFILE_IDS = {
  legacyRole: '15000000-0000-4000-8000-000000000001',
  legacyGrant: '15000000-0000-4000-8000-000000000002',
  branchAdminGrant: '15000000-0000-4000-8000-000000000003',
} as const;

/**
 * Contract §C: `/auth/me` lists roles per ACTIVE assignment at any scope — so a DISABLED role
 * (which grants nothing) and TENANT_ADMIN a second time, through a BRANCH grant. Spreads
 * `greenfieldTenant()` so collections later layers add still carry over.
 */
function profileRoles(): RunState {
  const state = greenfieldTenant();
  return {
    ...state,
    roles: [
      ...state.roles,
      {
        ...role(PROFILE_IDS.legacyRole, IDS.greenfield, 'LEGACY_TELLER', 'Legacy teller', [
          'user.suspend',
        ]),
        systemRole: false,
        status: 'DISABLED',
      },
    ],
    roleAssignments: [
      ...state.roleAssignments,
      tenantRoleAssignment(
        PROFILE_IDS.legacyGrant,
        IDS.greenfield,
        IDS.jane,
        PROFILE_IDS.legacyRole,
      ),
      {
        ...tenantRoleAssignment(
          PROFILE_IDS.branchAdminGrant,
          IDS.greenfield,
          IDS.jane,
          IDS.tenantAdminRole,
        ),
        scopeType: 'BRANCH',
        branchId: IDS.headOffice,
      },
    ],
  };
}

/** Layer 08 seed IDs (lane rules §5). */
export const BRANCH_SCENARIO_IDS = {
  mary: '08000000-0000-4000-8000-000000000001',
  peter: '08000000-0000-4000-8000-000000000002',
  maryMembership: '08000000-0000-4000-8000-000000000003',
  peterMembership: '08000000-0000-4000-8000-000000000004',
  karen: '08000000-0000-4000-8000-000000000005',
  thikaRoad: '08000000-0000-4000-8000-000000000006',
  kisumu: '08000000-0000-4000-8000-000000000007',
  oldTown: '08000000-0000-4000-8000-000000000008',
  maryAtWestlands: '08000000-0000-4000-8000-000000000009',
  peterAtWestlands: '08000000-0000-4000-8000-00000000000a',
  peterAtHeadOffice: '08000000-0000-4000-8000-00000000000b',
  thikaRoadDraftEvent: '08000000-0000-4000-8000-00000000000c',
  karenDraftEvent: '08000000-0000-4000-8000-00000000000d',
} as const;

/** Real TENANT_ADMIN codes (contract §J), granted only in this scenario so `default` stays the
 * read-only gating scenario (e2e/branches.spec.ts "offers no mutations without the permissions"). */
const BRANCH_ADMIN_CODES = [
  'branch.create',
  'branch.activate',
  'branch.suspend',
  'branch.reactivate',
  'branch.close',
  'user.assign_branch',
  'user.revoke_branch',
];

function branchDraftEvent(
  id: string,
  branchId: string,
  actorUserId: string,
  occurredAt: string,
): FakeAuditEvent {
  return {
    id,
    organisationId: IDS.greenfield,
    occurredAt,
    actorUserId,
    actorType: 'USER',
    branchId: null,
    entityType: 'BRANCH',
    entityId: branchId,
    action: 'branch.create_draft',
    outcome: 'SUCCESS',
    severity: 'INFO',
    reason: null,
    beforeJson: null,
    afterJson: '{"status":"DRAFT"}',
    metadataJson: '{}',
  };
}

/**
 * Layer 08: a copy of `default` plus two staff members, one branch per lifecycle state, and
 * Westlands assignments — Mary's HOME is her only one (the last-assignment 409), Peter also holds
 * Head Office. Thika Road was drafted by Mary (so Jane may activate it); Karen by Jane.
 */
function branchesScenario(): RunState {
  const state = greenfieldTenant();
  const ids = BRANCH_SCENARIO_IDS;
  const person = (id: string, username: string, displayName: string): FakeUser => ({
    id,
    username,
    email: `${username}@greenfield.example`,
    displayName,
    status: 'ACTIVE',
    keycloakSubject: `e2e-${username}`,
  });
  const staff = (id: string, userId: string): FakeMembership => ({
    ...membership(id, IDS.greenfield, userId),
    type: 'STAFF',
  });
  const extra = (
    id: string,
    code: string,
    name: string,
    overrides: Partial<FakeBranch>,
  ): FakeBranch => ({
    ...branch(id, IDS.greenfield, code, name, 'OPERATIONS'),
    ...overrides,
  });
  return {
    ...state,
    users: [
      ...state.users,
      person(ids.mary, 'mary.wanjiku', 'Mary Wanjiku'),
      person(ids.peter, 'peter.otieno', 'Peter Otieno'),
    ],
    memberships: [
      ...state.memberships,
      staff(ids.maryMembership, ids.mary),
      staff(ids.peterMembership, ids.peter),
    ],
    branches: [
      ...state.branches,
      extra(ids.karen, 'KAREN', 'Karen Branch', {
        status: 'DRAFT',
        draftedBy: IDS.jane,
        createdAt: '2026-09-01T08:00:00Z',
      }),
      extra(ids.thikaRoad, 'THIKA_ROAD', 'Thika Road Branch', {
        status: 'PENDING_APPROVAL',
        draftedBy: ids.mary,
        parentBranchId: IDS.headOffice,
        createdAt: '2026-09-02T08:00:00Z',
      }),
      extra(ids.kisumu, 'KISUMU', 'Kisumu Branch', {
        status: 'SUSPENDED',
        statusReason: 'Cash audit in progress',
        createdAt: '2026-08-01T08:00:00Z',
      }),
      // A long name: the 375 px a11y cases prove it never scrolls the page (index item 4).
      extra(
        ids.oldTown,
        'OLD_TOWN',
        'Old Town Branch — Moi Avenue, Tom Mboya Street and River Road Customer Service Centre',
        {
          status: 'CLOSED',
          statusReason: 'Merged into Westlands',
          createdAt: '2026-07-15T08:00:00Z',
        },
      ),
    ],
    branchAssignments: [
      ...state.branchAssignments,
      assignment(ids.maryAtWestlands, IDS.greenfield, ids.mary, IDS.westlands, 'HOME'),
      assignment(ids.peterAtWestlands, IDS.greenfield, ids.peter, IDS.westlands, 'OPERATE'),
      assignment(ids.peterAtHeadOffice, IDS.greenfield, ids.peter, IDS.headOffice, 'HOME'),
    ],
    roles: state.roles.map((candidate) => ({
      ...candidate,
      permissions: [...candidate.permissions, ...BRANCH_ADMIN_CODES],
    })),
    auditEvents: [
      ...state.auditEvents,
      branchDraftEvent(ids.thikaRoadDraftEvent, ids.thikaRoad, ids.mary, '2026-09-02T08:00:00Z'),
      branchDraftEvent(ids.karenDraftEvent, ids.karen, IDS.jane, '2026-09-01T08:00:00Z'),
    ],
  };
}

/** Layer 09 seed IDs (lane rules §5). The fake permission catalogue (routes/roles.mts) numbers
 * its own ids from …0100 in the same prefix. */
export const ROLE_SCENARIO_IDS = {
  grace: '09000000-0000-4000-8000-000000000001',
  graceMembership: '09000000-0000-4000-8000-000000000002',
  graceAtWestlands: '09000000-0000-4000-8000-000000000003',
  tom: '09000000-0000-4000-8000-000000000004',
  tomMembership: '09000000-0000-4000-8000-000000000005',
  tomAtHeadOffice: '09000000-0000-4000-8000-000000000006',
  teller: '09000000-0000-4000-8000-000000000007',
  opsSupervisor: '09000000-0000-4000-8000-000000000008',
  loansOfficer: '09000000-0000-4000-8000-000000000009',
  branchManager: '09000000-0000-4000-8000-00000000000a',
  compliance: '09000000-0000-4000-8000-00000000000b',
  graceTellerAtWestlands: '09000000-0000-4000-8000-00000000000c',
  tomTeller: '09000000-0000-4000-8000-00000000000d',
  janeCompliance: '09000000-0000-4000-8000-00000000000e',
} as const;

/** Real TENANT_ADMIN codes (contract §J), granted only in this scenario so `default` stays the
 * read-only gating scenario (e2e/roles.spec.ts "offers no mutations without the permissions"). */
const ROLE_ADMIN_CODES = [
  'role.create',
  'role.update',
  'role.activate',
  'role.deactivate',
  'role.assign_permission',
  'role.remove_permission',
  'user.assign_role',
  'user.revoke_role',
];

/**
 * Layer 09: a copy of `default` plus two staff members (Grace HOME at Westlands, Tom HOME at Head
 * Office), a second system role, and four custom roles (one DISABLED, one long-named). Grace holds
 * Teller at Westlands only and Tom holds it institution-wide. Jane holds the long-named role, so
 * she can revoke her own assignment and keep her access through TENANT_ADMIN.
 */
function rolesScenario(): RunState {
  const state = greenfieldTenant();
  const ids = ROLE_SCENARIO_IDS;
  const person = (id: string, username: string, displayName: string): FakeUser => ({
    id,
    username,
    email: `${username}@greenfield.example`,
    displayName,
    status: 'ACTIVE',
    keycloakSubject: `e2e-${username}`,
  });
  const staff = (id: string, userId: string): FakeMembership => ({
    ...membership(id, IDS.greenfield, userId),
    type: 'STAFF',
  });
  const custom = (
    id: string,
    code: string,
    name: string,
    permissions: string[],
    createdAt: string,
    overrides: Partial<FakeRole> = {},
  ): FakeRole => ({
    ...role(id, IDS.greenfield, code, name, permissions),
    systemRole: false,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  });
  return {
    ...state,
    users: [
      ...state.users,
      person(ids.grace, 'grace.achieng', 'Grace Achieng'),
      person(ids.tom, 'tom.kiprop', 'Tom Kiprop'),
    ],
    memberships: [
      ...state.memberships,
      staff(ids.graceMembership, ids.grace),
      staff(ids.tomMembership, ids.tom),
    ],
    branchAssignments: [
      ...state.branchAssignments,
      assignment(ids.graceAtWestlands, IDS.greenfield, ids.grace, IDS.westlands, 'HOME'),
      assignment(ids.tomAtHeadOffice, IDS.greenfield, ids.tom, IDS.headOffice, 'HOME'),
    ],
    roles: [
      ...state.roles.map((candidate) => ({
        ...candidate,
        permissions: [...candidate.permissions, ...ROLE_ADMIN_CODES],
      })),
      {
        ...role(ids.branchManager, IDS.greenfield, 'BRANCH_MANAGER', 'Branch manager', [
          'branch.view',
          'branch.suspend',
          'user.assign_branch',
          'business_date.view',
        ]),
        createdAt: '2026-07-01T08:05:00Z',
      },
      custom(
        ids.loansOfficer,
        'LOANS_OFFICER',
        'Loans officer',
        ['user.view'],
        '2026-07-20T08:00:00Z',
        {
          status: 'DISABLED',
          description: 'Retired with the old loans desk.',
        },
      ),
      custom(
        ids.teller,
        'TELLER',
        'Teller',
        ['business_date.view', 'branch.view'],
        '2026-08-01T08:00:00Z',
        {
          description: 'Front-desk cash and member service.',
        },
      ),
      custom(
        ids.opsSupervisor,
        'OPS_SUPERVISOR',
        'Operations supervisor',
        ['business_date.view', 'cob.start', 'business_date.advance'],
        '2026-08-10T08:00:00Z',
      ),
      // A long name: the 375 px a11y cases prove it never scrolls the page (index item 4).
      custom(
        ids.compliance,
        'COMPLIANCE',
        'Compliance, risk and internal audit reviewer for member savings and credit operations',
        ['audit.view'],
        '2026-08-20T08:00:00Z',
      ),
    ],
    roleAssignments: [
      ...state.roleAssignments,
      {
        ...tenantRoleAssignment(ids.graceTellerAtWestlands, IDS.greenfield, ids.grace, ids.teller),
        scopeType: 'BRANCH',
        branchId: IDS.westlands,
      },
      tenantRoleAssignment(ids.tomTeller, IDS.greenfield, ids.tom, ids.teller),
      tenantRoleAssignment(ids.janeCompliance, IDS.greenfield, IDS.jane, ids.compliance),
    ],
  };
}

/** Layer 16 seed IDs (lane rules §5). `otherOperator` is only a maker id: no user row needs it. */
export const TENANT_SCENARIO_IDS = {
  umoja: '16000000-0000-4000-8000-000000000001',
  harambee: '16000000-0000-4000-8000-000000000002',
  mwangaza: '16000000-0000-4000-8000-000000000003',
  pwani: '16000000-0000-4000-8000-000000000004',
  kilimo: '16000000-0000-4000-8000-000000000005',
  nairobiMetro: '16000000-0000-4000-8000-000000000006',
  otherOperator: '16000000-0000-4000-8000-000000000007',
} as const;

/** Real platform codes (PLATFORM_SUPER_ADMIN holds all 80, contract §J), granted only here, so that
 * `platform-operator` stays the read-only gating scenario (e2e/platform-tenants.spec.ts). */
const PLATFORM_TENANT_CODES = [
  'tenant.create',
  'tenant.update_draft',
  'tenant.submit_for_approval',
  'tenant.approve',
  'tenant.reject',
  'tenant.suspend',
  'tenant.reactivate',
  'tenant.deprovision',
  'tenant.bootstrap_retry',
];

/**
 * Layer 16: a copy of `platform-operator` plus one institution per lifecycle state. Jane drafted
 * Umoja. Another operator drafted Mwangaza and Jane submitted it, so she can't approve it; another
 * operator drafted and submitted Harambee, so she can. Pwani's bootstrap failed, and the long-named
 * one was rejected.
 */
function platformTenantsScenario(): RunState {
  const state = platformOperator();
  const ids = TENANT_SCENARIO_IDS;
  const on = (date: string) => ({ createdAt: date, updatedAt: date });
  return {
    ...state,
    organisations: [
      ...state.organisations,
      organisation(ids.umoja, 'umoja-teachers', 'Umoja Teachers SACCO', {
        ...on('2026-09-05T08:00:00Z'),
        status: 'DRAFT',
        bootstrapStatus: 'DRAFT',
        createdBy: IDS.jane,
      }),
      organisation(ids.harambee, 'harambee-farmers', 'Harambee Farmers SACCO', {
        ...on('2026-09-04T08:00:00Z'),
        status: 'PENDING_APPROVAL',
        bootstrapStatus: 'PENDING_ACTIVATION',
        countryCode: 'UG',
        baseCurrencyCode: 'UGX',
        timezone: 'Africa/Kampala',
        createdBy: ids.otherOperator,
        submittedBy: ids.otherOperator,
      }),
      organisation(ids.mwangaza, 'mwangaza-savings', 'Mwangaza Savings SACCO', {
        ...on('2026-09-03T08:00:00Z'),
        status: 'PENDING_APPROVAL',
        bootstrapStatus: 'PENDING_ACTIVATION',
        createdBy: ids.otherOperator,
        submittedBy: IDS.jane,
      }),
      organisation(ids.pwani, 'pwani-fishermen', 'Pwani Fishermen SACCO', {
        ...on('2026-08-20T08:00:00Z'),
        bootstrapStatus: 'FAILED',
        bootstrapFailureCode: 'KEYCLOAK_UNAVAILABLE',
      }),
      organisation(ids.kilimo, 'kilimo-bora', 'Kilimo Bora SACCO', {
        ...on('2026-08-10T08:00:00Z'),
        status: 'SUSPENDED',
      }),
      // A 100-character name, the backend's maximum: the 375 px a11y cases prove it never scrolls
      // the page (index item 4).
      organisation(
        ids.nairobiMetro,
        'nairobi-metro-teachers',
        'Nairobi Metropolitan Public Service Teachers and Allied Workers Savings and Credit Co-op Society Ltd',
        {
          ...on('2026-08-01T08:00:00Z'),
          status: 'REJECTED',
          bootstrapStatus: 'DRAFT',
          countryCode: 'TZ',
          baseCurrencyCode: 'TZS',
          timezone: 'Africa/Dar_es_Salaam',
        },
      ),
    ],
    roles: state.roles.map((candidate) => ({
      ...candidate,
      permissions: [...candidate.permissions, ...PLATFORM_TENANT_CODES],
    })),
  };
}

/** Layer 10 seed IDs (lane rules §5). Assignments use …0002nn, role assignments …0003nn, audit
 * events …0004nn. */
export const USER_SCENARIO_IDS = {
  victor: '10000000-0000-4000-8000-000000000001',
  victorMembership: '10000000-0000-4000-8000-000000000002',
  amina: '10000000-0000-4000-8000-000000000003',
  aminaMembership: '10000000-0000-4000-8000-000000000004',
  brian: '10000000-0000-4000-8000-000000000005',
  brianMembership: '10000000-0000-4000-8000-000000000006',
  carol: '10000000-0000-4000-8000-000000000007',
  carolMembership: '10000000-0000-4000-8000-000000000008',
  daniel: '10000000-0000-4000-8000-000000000009',
  danielMembership: '10000000-0000-4000-8000-00000000000a',
  esther: '10000000-0000-4000-8000-00000000000b',
  estherMembership: '10000000-0000-4000-8000-00000000000c',
  felix: '10000000-0000-4000-8000-00000000000d',
  felixMembership: '10000000-0000-4000-8000-00000000000e',
  gladys: '10000000-0000-4000-8000-00000000000f',
  gladysMembership: '10000000-0000-4000-8000-000000000010',
  hassan: '10000000-0000-4000-8000-000000000011',
  hassanMembership: '10000000-0000-4000-8000-000000000012',
  wanjiru: '10000000-0000-4000-8000-000000000013',
  wanjiruMembership: '10000000-0000-4000-8000-000000000014',
  ann: '10000000-0000-4000-8000-000000000015',
  annMembership: '10000000-0000-4000-8000-000000000016',
  joann: '10000000-0000-4000-8000-000000000017',
  joannMembership: '10000000-0000-4000-8000-000000000018',
  teller: '10000000-0000-4000-8000-000000000019',
  supervisor: '10000000-0000-4000-8000-00000000001a',
  loansOfficer: '10000000-0000-4000-8000-00000000001b',
  aminaTeller: '10000000-0000-4000-8000-000000000301',
  felixBranchTeller: '10000000-0000-4000-8000-000000000307',
} as const;

/** Real TENANT_ADMIN codes (contract §J), granted only in `users`, so `default` stays the read-only
 * gating scenario for the users record. */
const USER_ADMIN_CODES = [
  'user.approve',
  'membership.suspend',
  'membership.reactivate',
  'membership.revoke',
  'user.assign_role',
  'user.revoke_role',
  'user.assign_branch',
  'user.revoke_branch',
];

/** 100 characters: the backend's display-name maximum (contract §D). */
const LONG_USER_NAME =
  'Wanjiru Njeri Kamau-Otieno Achieng Muthoni Wambui Chebet Jepkoech Nyambura Akinyi Atieno Wairimu Ayo';

function userAuditEvent(
  id: string,
  entityType: string,
  entityId: string,
  action: string,
  actorUserId: string,
  occurredAt: string,
): FakeAuditEvent {
  return {
    id,
    organisationId: IDS.greenfield,
    occurredAt,
    actorUserId,
    actorType: 'USER',
    branchId: null,
    entityType,
    entityId,
    action,
    outcome: 'SUCCESS',
    severity: 'INFO',
    reason: null,
    beforeJson: null,
    afterJson: null,
    metadataJson: '{}',
  };
}

/**
 * Layer 10: a copy of `default` plus twelve people, one per onboarding state. Victor is the other
 * administrator and the inviter of Amina, Brian, Daniel and Felix; Jane invited Carol, so Jane's
 * approval of her is a 403 (maker-checker, BG-08). Amina, Carol and Daniel have no identity link,
 * so an approval queues identity provisioning (a 202) unless it is refused first: Daniel's already
 * ran, so approving him again is a 500 (BG-07, BG-11). Brian has one (a 200). Ann's email sits
 * inside Joann's, and Wanjiru's name is the 100-character maximum. The fake lists newest first, so
 * the directory reads Joann … Victor, then Jane.
 */
function usersScenario(): RunState {
  const state = greenfieldTenant();
  const ids = USER_SCENARIO_IDS;
  const person = (
    id: string,
    username: string,
    displayName: string,
    status: string,
    overrides: Partial<FakeUser> = {},
  ): FakeUser => ({
    id,
    username,
    email: `${username}@greenfield.example`,
    displayName,
    status,
    keycloakSubject: `e2e-${username}`,
    ...overrides,
  });
  const member = (
    id: string,
    userId: string,
    type: string,
    status: string,
    overrides: Partial<FakeMembership> = {},
  ): FakeMembership => ({
    ...membership(id, IDS.greenfield, userId),
    type,
    status,
    ...overrides,
  });
  const homeAt = (
    n: number,
    userId: string,
    branchId: string,
    status = 'ACTIVE',
  ): FakeBranchAssignment => ({
    ...assignment(
      `10000000-0000-4000-8000-${String(200 + n).padStart(12, '0')}`,
      IDS.greenfield,
      userId,
      branchId,
      'HOME',
    ),
    status,
  });
  const grant = (
    n: number,
    userId: string,
    roleId: string,
    overrides: Partial<FakeRoleAssignment> = {},
  ): FakeRoleAssignment => ({
    ...tenantRoleAssignment(
      `10000000-0000-4000-8000-${String(300 + n).padStart(12, '0')}`,
      IDS.greenfield,
      userId,
      roleId,
    ),
    ...overrides,
  });
  const custom = (
    id: string,
    code: string,
    name: string,
    permissions: string[],
    createdAt: string,
    overrides: Partial<FakeRole> = {},
  ): FakeRole => ({
    ...role(id, IDS.greenfield, code, name, permissions),
    systemRole: false,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  });
  const event = (
    n: number,
    entityType: string,
    entityId: string,
    action: string,
    actorUserId: string,
    occurredAt: string,
  ) =>
    userAuditEvent(
      `10000000-0000-4000-8000-${String(400 + n).padStart(12, '0')}`,
      entityType,
      entityId,
      action,
      actorUserId,
      occurredAt,
    );
  return {
    ...state,
    users: [
      ...state.users,
      person(ids.victor, 'victor.otieno', 'Victor Otieno', 'ACTIVE'),
      person(ids.amina, 'amina.odhiambo', 'Amina Odhiambo', 'DRAFT', { identityLinked: false }),
      person(ids.brian, 'brian.kiprono', 'Brian Kiprono', 'ACTIVE'),
      person(ids.carol, 'carol.wambui', 'Carol Wambui', 'DRAFT', { identityLinked: false }),
      person(ids.daniel, 'daniel.mutua', 'Daniel Mutua', 'PROVISIONING_IDP', {
        identityLinked: false,
      }),
      person(ids.esther, 'esther.njoki', 'Esther Njoki', 'INVITED'),
      person(ids.felix, 'felix.omondi', 'Felix Omondi', 'ACTIVE'),
      person(ids.gladys, 'gladys.chebet', 'Gladys Chebet', 'ACTIVE'),
      person(ids.hassan, 'hassan.ali', 'Hassan Ali', 'ACTIVE'),
      // A long name and a long, nested email for the 375 px a11y cases (index item 4).
      person(ids.wanjiru, 'wanjiru.long', LONG_USER_NAME, 'ACTIVE', {
        email:
          'wanjiru.njeri.kamau-otieno.achieng.muthoni@greenfield-teachers-and-public-service-sacco.example',
      }),
      // `ann.mwangi@…` is a substring of `joann.mwangi@…` (Review Focus 1).
      person(ids.ann, 'ann.mwangi', 'Ann Mwangi', 'ACTIVE'),
      person(ids.joann, 'joann.mwangi', 'Joann Mwangi', 'ACTIVE'),
    ],
    memberships: [
      ...state.memberships,
      member(ids.victorMembership, ids.victor, 'ADMIN', 'ACTIVE', {
        primaryBranchId: IDS.headOffice,
      }),
      member(ids.aminaMembership, ids.amina, 'STAFF', 'PENDING_APPROVAL', {
        invitedBy: ids.victor,
        primaryBranchId: IDS.westlands,
      }),
      member(ids.brianMembership, ids.brian, 'STAFF', 'PENDING_APPROVAL', {
        invitedBy: ids.victor,
      }),
      member(ids.carolMembership, ids.carol, 'STAFF', 'PENDING_APPROVAL', {
        invitedBy: IDS.jane,
      }),
      member(ids.danielMembership, ids.daniel, 'STAFF', 'PENDING_APPROVAL', {
        invitedBy: ids.victor,
      }),
      member(ids.estherMembership, ids.esther, 'STAFF', 'ACTIVE', {
        primaryBranchId: IDS.headOffice,
      }),
      member(ids.felixMembership, ids.felix, 'STAFF', 'ACTIVE', {
        primaryBranchId: IDS.westlands,
      }),
      member(ids.gladysMembership, ids.gladys, 'STAFF', 'SUSPENDED'),
      member(ids.hassanMembership, ids.hassan, 'STAFF', 'REVOKED'),
      member(ids.wanjiruMembership, ids.wanjiru, 'AUDITOR', 'ACTIVE'),
      member(ids.annMembership, ids.ann, 'ADMIN', 'ACTIVE'),
      member(ids.joannMembership, ids.joann, 'STAFF', 'ACTIVE'),
    ],
    branchAssignments: [
      ...state.branchAssignments,
      homeAt(1, ids.victor, IDS.headOffice),
      homeAt(2, ids.amina, IDS.westlands),
      homeAt(3, ids.brian, IDS.headOffice),
      homeAt(4, ids.carol, IDS.westlands),
      homeAt(5, ids.daniel, IDS.westlands),
      homeAt(6, ids.esther, IDS.headOffice),
      // Felix's only assignment: revoking it is the last-assignment 409.
      homeAt(7, ids.felix, IDS.westlands),
      homeAt(8, ids.gladys, IDS.headOffice),
      homeAt(9, ids.hassan, IDS.headOffice, 'REVOKED'),
      homeAt(10, ids.joann, IDS.headOffice),
    ],
    roles: [
      ...state.roles.map((candidate) => ({
        ...candidate,
        permissions: [...candidate.permissions, ...USER_ADMIN_CODES],
      })),
      custom(
        ids.teller,
        'TELLER',
        'Teller',
        ['business_date.view', 'branch.view'],
        '2026-08-01T08:00:00Z',
      ),
      custom(
        ids.supervisor,
        'SUPERVISOR',
        'Branch supervisor',
        ['business_date.view'],
        '2026-08-05T08:00:00Z',
      ),
      custom(
        ids.loansOfficer,
        'LOANS_OFFICER',
        'Loans officer',
        ['user.view'],
        '2026-07-20T08:00:00Z',
        { status: 'DISABLED' },
      ),
    ],
    roleAssignments: [
      ...state.roleAssignments,
      grant(1, ids.amina, ids.teller),
      grant(2, ids.brian, ids.teller),
      grant(3, ids.carol, ids.teller),
      grant(4, ids.daniel, ids.teller),
      grant(5, ids.esther, ids.teller),
      grant(6, ids.felix, ids.teller),
      grant(7, ids.felix, ids.teller, { scopeType: 'BRANCH', branchId: IDS.westlands }),
      grant(8, ids.felix, ids.loansOfficer),
      grant(9, ids.gladys, ids.teller),
      grant(10, ids.hassan, ids.teller, { status: 'REVOKED' }),
    ],
    auditEvents: [
      ...state.auditEvents,
      event(1, 'USER', ids.amina, 'user.invite', ids.victor, '2026-09-20T08:00:00Z'),
      event(2, 'USER', ids.brian, 'user.invite', ids.victor, '2026-09-21T08:00:00Z'),
      event(3, 'USER', ids.carol, 'user.invite', IDS.jane, '2026-09-22T08:00:00Z'),
      event(4, 'USER', ids.daniel, 'user.invite', ids.victor, '2026-09-23T08:00:00Z'),
      // Felix's history, one event in each of the four audit views.
      event(5, 'USER', ids.felix, 'user.invite', ids.victor, '2026-08-01T08:00:00Z'),
      event(
        6,
        'MEMBERSHIP',
        ids.felixMembership,
        'membership.activate',
        IDS.jane,
        '2026-08-02T08:00:00Z',
      ),
      event(
        7,
        'USER_ACCOUNT',
        ids.felix,
        'user.first_login_activation',
        ids.felix,
        '2026-08-03T08:00:00Z',
      ),
    ],
  };
}

/** Layer 17 seed IDs (lane rules §5): users …a*, branches …b*, memberships …c*, roles …d*. */
export const RECORD_SCENARIO_IDS = {
  peter: '17000000-0000-4000-8000-0000000000a1',
  sara: '17000000-0000-4000-8000-0000000000a2',
  achieng: '17000000-0000-4000-8000-0000000000a3',
  baraka: '17000000-0000-4000-8000-0000000000a4',
  chebet: '17000000-0000-4000-8000-0000000000a5',
  daudi: '17000000-0000-4000-8000-0000000000a6',
  esi: '17000000-0000-4000-8000-0000000000a7',
  faraji: '17000000-0000-4000-8000-0000000000a8',
  nyokabi: '17000000-0000-4000-8000-0000000000a9',
  acmeHeadOffice: '17000000-0000-4000-8000-0000000000b1',
  acmeMombasaRoad: '17000000-0000-4000-8000-0000000000b2',
  acmeNakuru: '17000000-0000-4000-8000-0000000000b3',
  acmeKisumu: '17000000-0000-4000-8000-0000000000b4',
  acmeLikoni: '17000000-0000-4000-8000-0000000000b5',
  pwaniHeadOffice: '17000000-0000-4000-8000-0000000000b6',
  acmeAdminRole: '17000000-0000-4000-8000-0000000000d1',
  janeAcmeRoleAssignment: '17000000-0000-4000-8000-0000000000d2',
} as const;

/** Real platform codes (PLATFORM_SUPER_ADMIN holds all 80, contract §J), granted only in
 * `platform-records`, so that `platform-operator` and `platform-tenants` don't change. */
const PLATFORM_RECORD_CODES = ['branch.create', 'user.suspend', 'user.activate', 'user.deactivate'];

/** 100 characters: the backend's display-name and branch-name maxima (contract §D). */
const LONG_ACCOUNT_NAME =
  'Nyokabi Wairimu Kamau-Achieng Muthoni Njeri Chebet Jepkoech Nyambura Akinyi Atieno Wanjiku Mwangi Ay';
const LONG_BRANCH_NAME =
  'Likoni Ferry Crossing and Mombasa Old Town Customer Service Centre for the Teachers and Allied Staff';

/**
 * Layer 17: a copy of `platform-tenants` (an institution in every lifecycle state, and
 * `tenant.approve`) plus Acme's branches and users, Pwani's head office, two more platform
 * members, and Jane as an active ADMIN of Acme only, with `branch.create` there: a platform branch
 * draft succeeds at Acme and is refused at Pwani (BG-18). Esi belongs to Acme and Pwani, so an
 * account change shows in both.
 */
function platformRecordsScenario(): RunState {
  const state = platformTenantsScenario();
  const ids = RECORD_SCENARIO_IDS;
  const person = (
    id: string,
    username: string,
    displayName: string,
    status: string,
    domain: string,
    overrides: Partial<FakeUser> = {},
  ): FakeUser => ({
    id,
    username,
    email: `${username}@${domain}`,
    displayName,
    status,
    keycloakSubject: `e2e-${username}`,
    ...overrides,
  });
  const member = (
    n: number,
    organisationId: string,
    userId: string,
    type: string,
    status = 'ACTIVE',
  ): FakeMembership => ({
    ...membership(`17000000-0000-4000-8000-0000000000c${n.toString(16)}`, organisationId, userId),
    type,
    status,
  });
  const at = (date: string, overrides: Partial<FakeBranch> = {}) => ({
    createdAt: date,
    updatedAt: date,
    ...overrides,
  });
  return {
    ...state,
    users: [
      ...state.users,
      person(ids.peter, 'peter.kamau', 'Peter Kamau', 'ACTIVE', 'finaxis.example'),
      person(ids.sara, 'sara.wanjiku', 'Sara Wanjiku', 'SUSPENDED', 'finaxis.example'),
      person(ids.achieng, 'achieng.odera', 'Achieng Odera', 'ACTIVE', 'acme.example'),
      person(ids.baraka, 'baraka.mwita', 'Baraka Mwita', 'SUSPENDED', 'acme.example'),
      person(ids.chebet, 'chebet.kiprop', 'Chebet Kiprop', 'INVITED', 'acme.example'),
      person(ids.daudi, 'daudi.hamisi', 'Daudi Hamisi', 'DRAFT', 'acme.example'),
      person(ids.esi, 'esi.mensah', 'Esi Mensah', 'ACTIVE', 'acme.example'),
      person(ids.faraji, 'faraji.juma', 'Faraji Juma', 'DEACTIVATED', 'acme.example'),
      person(ids.nyokabi, 'nyokabi.wairimu', LONG_ACCOUNT_NAME, 'ACTIVE', 'acme.example', {
        email: 'nyokabi.wairimu.kamau-achieng.muthoni.njeri.chebet@acme-teachers-savings.example',
      }),
    ],
    // Newest first is reverse seed order: Acme lists Nyokabi … Achieng, then Jane; the platform
    // lists Sara, Peter, then Jane.
    memberships: [
      ...state.memberships,
      member(1, IDS.platformOrganisation, ids.peter, 'ADMIN'),
      member(2, IDS.platformOrganisation, ids.sara, 'ADMIN'),
      member(3, IDS.acme, IDS.jane, 'ADMIN'),
      member(4, IDS.acme, ids.achieng, 'STAFF'),
      member(5, IDS.acme, ids.baraka, 'STAFF'),
      member(6, IDS.acme, ids.chebet, 'STAFF'),
      member(7, IDS.acme, ids.daudi, 'STAFF', 'PENDING_APPROVAL'),
      member(8, IDS.acme, ids.esi, 'STAFF'),
      member(9, TENANT_SCENARIO_IDS.pwani, ids.esi, 'STAFF'),
      member(10, IDS.acme, ids.faraji, 'STAFF'),
      member(11, IDS.acme, ids.nyokabi, 'STAFF'),
    ],
    branches: [
      ...state.branches,
      { ...branch(ids.acmeHeadOffice, IDS.acme, 'HEAD_OFFICE', 'Head Office', 'HEAD_OFFICE') },
      {
        ...branch(ids.acmeMombasaRoad, IDS.acme, 'MOMBASA_RD', 'Mombasa Road Branch', 'OPERATIONS'),
        ...at('2026-07-10T08:00:00Z', { parentBranchId: ids.acmeHeadOffice }),
      },
      {
        ...branch(ids.acmeNakuru, IDS.acme, 'NAKURU', 'Nakuru Branch', 'OPERATIONS'),
        createdAt: '2026-07-20T08:00:00Z',
        updatedAt: '2026-08-01T09:30:00Z',
        status: 'SUSPENDED',
        statusReason: 'Premises under renovation',
      },
      {
        ...branch(ids.acmeKisumu, IDS.acme, 'KISUMU', 'Kisumu Branch', 'OPERATIONS'),
        ...at('2026-08-15T08:00:00Z', { status: 'DRAFT' }),
      },
      {
        ...branch(ids.acmeLikoni, IDS.acme, 'LIKONI', LONG_BRANCH_NAME, 'OPERATIONS'),
        ...at('2026-08-20T08:00:00Z', { parentBranchId: ids.acmeMombasaRoad }),
      },
      {
        ...branch(
          ids.pwaniHeadOffice,
          TENANT_SCENARIO_IDS.pwani,
          'HEAD_OFFICE',
          'Head Office',
          'HEAD_OFFICE',
        ),
        ...at('2026-08-20T08:00:00Z'),
      },
    ],
    roles: [
      ...state.roles.map((candidate) =>
        candidate.id === IDS.platformAdminRole
          ? { ...candidate, permissions: [...candidate.permissions, ...PLATFORM_RECORD_CODES] }
          : candidate,
      ),
      role(ids.acmeAdminRole, IDS.acme, 'TENANT_ADMIN', 'Tenant admin', [
        'auth.select_organisation',
        'branch.view',
        'branch.create',
      ]),
    ],
    roleAssignments: [
      ...state.roleAssignments,
      tenantRoleAssignment(ids.janeAcmeRoleAssignment, IDS.acme, IDS.jane, ids.acmeAdminRole),
    ],
  };
}

// `satisfies` (not a `: Record<...>` annotation) keeps the literal key set so `ScenarioName` below
// is the real union, not `string` — the annotation would still check each builder the same way.
const BUILDERS = {
  default: greenfieldTenant,
  'empty-organisations': () => ({ ...greenfieldTenant(), memberships: [] }),
  'selection-forbidden': () => ({ ...greenfieldTenant(), forbidOrganisationSelection: true }),
  // The actor's roles lack auth.select_organisation: discovery hides the organisation (after
  // paging) and selecting it is forbidden (contract §E.1).
  'selection-unpermitted': () => {
    const state = greenfieldTenant();
    return {
      ...state,
      roles: state.roles.map((role) => ({
        ...role,
        permissions: role.permissions.filter((code) => code !== 'auth.select_organisation'),
      })),
    };
  },
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
  'no-audit-permission': () => withoutPermission(greenfieldTenant(), 'audit.view'),
  'business-date-read-only': () =>
    withoutPermission(
      greenfieldTenant(),
      'business_date.advance',
      'business_date.reopen',
      'cob.start',
      'cob.complete',
    ),
  'business-date-busy': () => ({ ...greenfieldTenant(), lockTimeoutsRemaining: 1 }),
  'business-date-no-history': () => ({ ...greenfieldTenant(), businessDateHistory: [] }),
  // Layer 15 (profile).
  'profile-roles': profileRoles,
  // The real PLATFORM_SUPER_ADMIN holds audit.view (contract §J), yet the tenant audit API rejects
  // the platform context — proves Activity is gated on the workspace, not only the permission.
  'platform-audit-viewer': () => {
    const state = platformOperator();
    return {
      ...state,
      roles: state.roles.map((candidate) => ({
        ...candidate,
        permissions: [...candidate.permissions, 'audit.view'],
      })),
    };
  },
  branches: branchesScenario,
  'settings-read-only': () => withoutPermission(greenfieldTenant(), 'settings.update'),
  'settings-currency-frozen': () => ({ ...greenfieldTenant(), baseCurrencyFrozen: true }),
  'no-settings-permission': () =>
    withoutPermission(greenfieldTenant(), 'settings.view', 'settings.update'),
  // Layer 09 (roles). `roles-limited` is the same data without the update, activate,
  // assignment-view and audit permissions, for the gated-control cases.
  roles: rolesScenario,
  'roles-limited': () =>
    withoutPermission(
      rolesScenario(),
      'role.update',
      'role.activate',
      'role_assignment.view',
      'audit.view',
    ),
  // Layer 16 (platform tenants).
  'platform-tenants': platformTenantsScenario,
  // Layer 10 (users). `users-limited` lacks the membership read and audit; `users-read-only` lacks
  // every lifecycle and assignment code, for the gated-control cases.
  users: usersScenario,
  'users-limited': () => withoutPermission(usersScenario(), 'membership.view', 'audit.view'),
  'users-read-only': () => withoutPermission(usersScenario(), ...USER_ADMIN_CODES),
  // 500 ACTIVE filler rows appended after the seeds (the fake pages in insertion order): Felix's row
  // is on page 0 and page 4 still has more, so the scan is truncated (Ruling 8's partial marker).
  'users-many-assignments': () => {
    const state = usersScenario();
    const filler = '10000000-0000-4000-8000-000000000099'; // no user row needed
    state.branchAssignments.push(
      ...Array.from({ length: 500 }, (_, n) =>
        assignment(
          `10000000-0000-4000-8000-${String(100000 + n).padStart(12, '0')}`,
          IDS.greenfield,
          filler,
          IDS.headOffice,
          'OPERATE',
        ),
      ),
    );
    return state;
  },
  // Layer 17 (platform records). `platform-records-read-only` has the same data without the four
  // mutation codes and without tenant.approve (no badge), for the gated-control cases.
  'platform-records': platformRecordsScenario,
  'platform-records-read-only': () =>
    withoutPermission(platformRecordsScenario(), ...PLATFORM_RECORD_CODES, 'tenant.approve'),
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
