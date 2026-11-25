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
  // Only the seeded administrators hold it (V39, #342): it lets them add to their own access.
  'user.assign_self',
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
  assignedAt = CREATED,
): FakeBranchAssignment {
  return { id, organisationId, userId, branchId, type, status: 'ACTIVE', assignedAt };
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
    // The platform's own marker row (OrganisationProvisioningService.DEFAULT_SETTINGS): stored for
    // every tenant, never listed.
    row('settings.operational', 'true', 'STRING'),
    // A key stored before a catalogue change, which the list still shows; long, for 375 px.
    row(
      'legacy.operational_profile',
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
  // HOME and OPERATE at Head Office only: one assigned branch, so selection pins it (BG-23).
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
 * A DISABLED role (which grants nothing) and TENANT_ADMIN a second time, through a BRANCH grant:
 * `/auth/me` lists each ACTIVE role once, so neither shows (BG-23). Spreads `greenfieldTenant()`
 * so collections later layers add still carry over.
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
  'branch.update',
  'branch.approve',
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

/** bg-adopt 09 seed IDs (lane rules §5). */
export const BRANCH_SCOPED_IDS = {
  role: 'a9000000-0000-4000-8000-000000000001',
  grant: 'a9000000-0000-4000-8000-000000000002',
  westlandsGrant: 'a9000000-0000-4000-8000-000000000003',
  viewerRole: 'a9000000-0000-4000-8000-000000000004',
  viewerGrant: 'a9000000-0000-4000-8000-000000000005',
} as const;

/** The codes `branches-branch-scoped` holds only at Head Office. */
const HEAD_OFFICE_ONLY = [
  'branch.view',
  'branch_assignment.view',
  'user.assign_branch',
  'user.revoke_branch',
  ...BRANCH_ADMIN_CODES,
];

/**
 * bg-adopt 09 (BG-03): `branches`, with Jane's branch codes on a BRANCH grant at Head Office
 * instead of her tenant role. The platform checks the target branch, so she reads and acts on Head
 * Office (with it selected, for a mutation's own gate) and is refused every other branch with 403.
 */
function branchesBranchScopedScenario(): RunState {
  const state = withoutPermission(branchesScenario(), ...HEAD_OFFICE_ONLY);
  return {
    ...state,
    roles: [
      ...state.roles,
      {
        ...role(BRANCH_SCOPED_IDS.role, IDS.greenfield, 'HEAD_OFFICE_ADMIN', 'Head office admin', [
          ...new Set(HEAD_OFFICE_ONLY),
        ]),
        systemRole: false,
      },
    ],
    roleAssignments: [
      ...state.roleAssignments,
      {
        ...tenantRoleAssignment(
          BRANCH_SCOPED_IDS.grant,
          IDS.greenfield,
          IDS.jane,
          BRANCH_SCOPED_IDS.role,
        ),
        scopeType: 'BRANCH',
        branchId: IDS.headOffice,
      },
    ],
  };
}

/**
 * BG-03: `branches-branch-scoped`, with the same role granted at Westlands too. A mutation's own gate
 * reads the selected context and the service the target, so with either branch selected Jane acts
 * on both, and at All branches on neither.
 */
function branchesTwoBranchScopedScenario(): RunState {
  const state = branchesBranchScopedScenario();
  return {
    ...state,
    roleAssignments: [
      ...state.roleAssignments,
      {
        ...tenantRoleAssignment(
          BRANCH_SCOPED_IDS.westlandsGrant,
          IDS.greenfield,
          IDS.jane,
          BRANCH_SCOPED_IDS.role,
        ),
        scopeType: 'BRANCH',
        branchId: IDS.westlands,
      },
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
  janeLoansOfficer: '09000000-0000-4000-8000-00000000000f',
  cashDesk: '09000000-0000-4000-8000-000000000010',
  tomCashDesk: '09000000-0000-4000-8000-000000000011',
} as const;

/** Real TENANT_ADMIN codes (contract §J), granted only in this scenario so `default` stays the
 * read-only gating scenario (e2e/roles.spec.ts "offers no mutations without the permissions"). */
const ROLE_ADMIN_CODES = [
  'role.create',
  'role.update',
  'role.activate',
  'role.deactivate',
  'role.archive',
  'role.assign_permission',
  'role.remove_permission',
  'user.assign_role',
  'user.revoke_role',
];

/**
 * Layer 09: a copy of `default` plus two staff members (Grace HOME at Westlands, Tom HOME at Head
 * Office), a second system role, and four custom roles (one DISABLED, one long-named), plus an
 * ARCHIVED one Tom once held (ADR 0035). Grace holds Teller at Westlands only and Tom holds it
 * institution-wide. Jane holds the long-named role, so she can revoke her own assignment and keep
 * her access through TENANT_ADMIN.
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
      // Archived roles leave the default list; their assignments were revoked first.
      custom(ids.cashDesk, 'CASH_DESK', 'Cash desk', ['branch.view'], '2026-06-01T08:00:00Z', {
        status: 'ARCHIVED',
      }),
    ],
    roleAssignments: [
      ...state.roleAssignments,
      {
        ...tenantRoleAssignment(ids.tomCashDesk, IDS.greenfield, ids.tom, ids.cashDesk),
        status: 'REVOKED',
      },
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

/** A checker's reason at the platform's bound (500 characters), in words around one unbroken
 * 70-character path: the 375 px cases prove a returned draft's Overview wraps it (Review Focus 5). */
export const LONG_RETURN_REASON = (
  'Attach the board resolution and the registration certificate ' +
  '(CS-2019-0042/registration-certificate/board-resolution-2026-09-01.pdf), and correct the ' +
  'registration number. '
)
  .repeat(4)
  .slice(0, 500);

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
 * Umoja, which a checker returned for changes with a 500-character reason (BG-01). Another operator
 * drafted Mwangaza and Jane submitted it, so she can't approve it; another operator drafted and
 * submitted Harambee, so she can. The three requests hold the first administrator they were
 * drafted with (BG-14). Pwani's bootstrap failed, and the long-named one was rejected.
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
        legalName: 'Umoja Teachers Co-operative Society Ltd',
        statusReason: LONG_RETURN_REASON,
        admin: {
          email: 'wanjiku@umoja.example',
          username: 'wanjiku.kamau',
          displayName: 'Wanjiku Kamau',
          phoneE164: '+254712000201',
          sendApplicationInvite: true,
        },
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
        legalName: 'Harambee Farmers Savings and Credit Co-operative Society Ltd',
        registrationNumber: 'CS/2018/0117',
        admin: {
          email: 'okello@harambee.example',
          username: 'james.okello',
          displayName: 'James Okello',
          phoneE164: '+256712000202',
          sendApplicationInvite: false,
        },
      }),
      organisation(ids.mwangaza, 'mwangaza-savings', 'Mwangaza Savings SACCO', {
        ...on('2026-09-03T08:00:00Z'),
        status: 'PENDING_APPROVAL',
        bootstrapStatus: 'PENDING_ACTIVATION',
        createdBy: ids.otherOperator,
        submittedBy: IDS.jane,
        admin: {
          email: 'achieng@mwangaza.example',
          username: 'achieng.odhiambo',
          displayName: 'Achieng Odhiambo',
          phoneE164: '+254712000203',
          sendApplicationInvite: false,
        },
      }),
      organisation(ids.pwani, 'pwani-fishermen', 'Pwani Fishermen SACCO', {
        ...on('2026-08-20T08:00:00Z'),
        bootstrapStatus: 'FAILED',
        // One of V24's closed set (InitialAdministratorBootstrapFailureCode), never free text.
        bootstrapFailureCode: 'IDENTITY_PROVIDER_FAILED',
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

/** bg-adopt 16 seed IDs (lane rules §5): `users-many-assignments`' outposts end …01–…11, Felix's
 * assignments there …51–…61. */
const MANY_ASSIGNMENTS_ID_PREFIX = 'a1600000-0000-4000-8000-0000000000';

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
 * ran and failed three times, so approving him again, or Retry, requeues it (BG-07, BG-11). Brian
 * has one (a 200). Esther is invited and awaits her first sign-in, so her invitation can be resent.
 * Ann's email sits inside Joann's, and Wanjiru's name is the 100-character maximum. The fake lists
 * newest first, so the directory reads Joann … Victor, then Jane.
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
      // BG-11: Victor's approval queued Daniel's identity, and all three attempts failed.
      member(ids.danielMembership, ids.daniel, 'STAFF', 'PENDING_APPROVAL', {
        invitedBy: ids.victor,
        dispatch: {
          status: 'FAILED',
          attempts: 3,
          lastError: 'IDENTITY_PROVIDER_FAILED:IdentityProvisioningException',
          updatedAt: '2026-11-24T06:14:00Z',
        },
      }),
      // Esther's identity was provisioned long ago, so her invitation can be resent (BG-11).
      member(ids.estherMembership, ids.esther, 'STAFF', 'ACTIVE', {
        primaryBranchId: IDS.headOffice,
        dispatch: {
          status: 'SUCCEEDED',
          attempts: 1,
          lastError: null,
          updatedAt: '2026-08-02T09:00:00Z',
        },
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
  achiengTenantRoleAssignment: '17000000-0000-4000-8000-0000000000d3',
  achiengBranchRoleAssignment: '17000000-0000-4000-8000-0000000000d4',
  achiengRevokedRoleAssignment: '17000000-0000-4000-8000-0000000000d5',
  esiTenantRoleAssignment: '17000000-0000-4000-8000-0000000000d6',
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
        email: 'nyokabi.wairimu.kamau.achieng.muthoni.njeri.chebet@acmeteacherssavings.example',
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
      // `audit.view` and `role_assignment.view` let Jane, as an Acme member, read what a platform
      // action wrote in Acme's records (BG-06) with the same bearer.
      role(ids.acmeAdminRole, IDS.acme, 'TENANT_ADMIN', 'Tenant admin', [
        'auth.select_organisation',
        'branch.view',
        'branch.create',
        'audit.view',
        'role_assignment.view',
      ]),
    ],
    roleAssignments: [
      ...state.roleAssignments,
      tenantRoleAssignment(ids.janeAcmeRoleAssignment, IDS.acme, IDS.jane, ids.acmeAdminRole),
      // Achieng holds two ACTIVE assignments (tenant and branch scope) and one already REVOKED, and
      // Esi one ACTIVE: deactivating Achieng revokes exactly her two (contract §G).
      tenantRoleAssignment(
        ids.achiengTenantRoleAssignment,
        IDS.acme,
        ids.achieng,
        ids.acmeAdminRole,
      ),
      {
        ...tenantRoleAssignment(
          ids.achiengBranchRoleAssignment,
          IDS.acme,
          ids.achieng,
          ids.acmeAdminRole,
        ),
        scopeType: 'BRANCH',
        branchId: ids.acmeMombasaRoad,
      },
      {
        ...tenantRoleAssignment(
          ids.achiengRevokedRoleAssignment,
          IDS.acme,
          ids.achieng,
          ids.acmeAdminRole,
        ),
        status: 'REVOKED',
      },
      tenantRoleAssignment(ids.esiTenantRoleAssignment, IDS.acme, ids.esi, ids.acmeAdminRole),
    ],
  };
}

/** bg-adopt 15 seed IDs (lane rules §5): institutions …0*, users …a*, memberships …b*, branches
 * …c*; roles …d* and assignments …e* are internal. */
export const CHECKER_SCENARIO_IDS = {
  bidii: '15000000-0000-4000-8000-0000000000f1',
  tumaini: '15000000-0000-4000-8000-0000000000f2',
  imara: '15000000-0000-4000-8000-0000000000f3',
  baraka: '15000000-0000-4000-8000-0000000000a7',
  amani: '15000000-0000-4000-8000-0000000000a8',
  barakaMembership: '15000000-0000-4000-8000-0000000000b7',
  amaniMembership: '15000000-0000-4000-8000-0000000000b9',
  wanjiru: '15000000-0000-4000-8000-0000000000a1',
  otieno: '15000000-0000-4000-8000-0000000000a2',
  halima: '15000000-0000-4000-8000-0000000000a3',
  mosi: '15000000-0000-4000-8000-0000000000a4',
  kariuki: '15000000-0000-4000-8000-0000000000a5',
  njoki: '15000000-0000-4000-8000-0000000000a6',
  otienoMembership: '15000000-0000-4000-8000-0000000000b2',
  halimaMembership: '15000000-0000-4000-8000-0000000000b3',
  bidiiHeadOffice: '15000000-0000-4000-8000-0000000000c1',
  bidiiKisumu: '15000000-0000-4000-8000-0000000000c2',
  bidiiNakuru: '15000000-0000-4000-8000-0000000000c3',
  bidiiEldoret: '15000000-0000-4000-8000-0000000000c4',
  tumainiHeadOffice: '15000000-0000-4000-8000-0000000000c5',
  tumainiThika: '15000000-0000-4000-8000-0000000000c6',
  tumainiMeru: '15000000-0000-4000-8000-0000000000c7',
  imaraHeadOffice: '15000000-0000-4000-8000-0000000000c8',
  imaraLamu: '15000000-0000-4000-8000-0000000000c9',
  imaraVoi: '15000000-0000-4000-8000-0000000000ca',
  imaraMalindi: '15000000-0000-4000-8000-0000000000cb',
  imaraLamuTown: '15000000-0000-4000-8000-0000000000cc',
} as const;

/** The platform checker's codes (ADR 0028), each with its view: granted only here. */
const PLATFORM_CHECKER_CODES = [
  'user.approve',
  'membership.view',
  'branch.create',
  'branch.approve',
];

/**
 * bg-adopt 15 (BG-02, BG-18): a copy of `platform-operator` plus two new institutions Jane isn't a
 * member of. Bidii has only its first administrator, Wanjiru (made by the system), active, and only
 * its head office (the system's) active, so both checker windows are open: Otieno waits for
 * approval with his role and branch (a 200), Halima waits invited by Jane (her Approve is disabled),
 * Amani waits with neither role nor branch (a 409 while the window is open),
 * Kisumu is Wanjiru's draft, Nakuru her pending branch, and Eldoret pending as Jane submitted it
 * (Activate disabled, Withdraw offered). Tumaini already has Mosi and Thika active, made by its first
 * administrator Kariuki, so both windows are closed, with Njoki and Meru still pending. Jane is
 * Imara's first administrator (made by the system, so its windows are open too), holding
 * `audit.view` there: the fake-API spec reads what the checker wrote in Imara's own log (BG-06).
 */
function platformCheckerScenario(): RunState {
  const state = platformOperator();
  const ids = CHECKER_SCENARIO_IDS;
  const seed = (tail: string) => `15000000-0000-4000-8000-0000000000${tail}`;
  const person = (id: string, username: string, displayName: string, status = 'ACTIVE') => ({
    id,
    username,
    email: `${username}@checker.example`,
    displayName,
    status,
    keycloakSubject: `e2e-${username}`,
  });
  const member = (
    id: string,
    organisationId: string,
    userId: string,
    overrides: Partial<FakeMembership> = {},
  ): FakeMembership => ({ ...membership(id, organisationId, userId), ...overrides });
  const office = (id: string, organisationId: string, code: string, name: string) =>
    branch(id, organisationId, code, name, code === 'HEAD_OFFICE' ? 'HEAD_OFFICE' : 'OPERATIONS');
  const by = (draftedBy: string, status: string, submittedBy?: string) => ({
    draftedBy,
    status,
    ...(submittedBy && { submittedBy }),
  });
  const pending = { status: 'PENDING_APPROVAL', type: 'STAFF' };
  return {
    ...state,
    organisations: [
      ...state.organisations,
      organisation(ids.bidii, 'bidii-traders', 'Bidii Traders SACCO'),
      organisation(ids.tumaini, 'tumaini-savings', 'Tumaini Savings SACCO'),
      organisation(ids.imara, 'imara-dairy', 'Imara Dairy SACCO'),
    ],
    users: [
      ...state.users,
      person(ids.wanjiru, 'wanjiru.njeri', 'Wanjiru Njeri'),
      person(ids.otieno, 'otieno.ouma', 'Otieno Ouma', 'INVITED'),
      person(ids.halima, 'halima.said', 'Halima Said', 'INVITED'),
      person(ids.kariuki, 'kariuki.mwangi', 'Kariuki Mwangi'),
      person(ids.mosi, 'mosi.kiprono', 'Mosi Kiprono'),
      person(ids.njoki, 'njoki.wambui', 'Njoki Wambui', 'INVITED'),
      person(ids.baraka, 'baraka.otieno', 'Baraka Otieno', 'INVITED'),
      person(ids.amani, 'amani.chege', 'Amani Chege', 'INVITED'),
    ],
    // Newest first is reverse seed order: Bidii lists Amani, Halima, Otieno, then Wanjiru.
    memberships: [
      ...state.memberships,
      member(seed('b1'), ids.bidii, ids.wanjiru),
      member(ids.otienoMembership, ids.bidii, ids.otieno, { ...pending, invitedBy: ids.wanjiru }),
      member(ids.halimaMembership, ids.bidii, ids.halima, { ...pending, invitedBy: IDS.jane }),
      member(seed('b4'), ids.tumaini, ids.kariuki),
      member(seed('b5'), ids.tumaini, ids.mosi, { type: 'STAFF', invitedBy: ids.kariuki }),
      member(seed('b6'), ids.tumaini, ids.njoki, { ...pending, invitedBy: ids.kariuki }),
      member(seed('b8'), ids.imara, IDS.jane),
      member(ids.barakaMembership, ids.imara, ids.baraka, { ...pending, invitedBy: ids.wanjiru }),
      member(ids.amaniMembership, ids.bidii, ids.amani, { ...pending, invitedBy: ids.wanjiru }),
    ],
    branches: [
      ...state.branches,
      office(ids.bidiiHeadOffice, ids.bidii, 'HEAD_OFFICE', 'Head Office'),
      {
        ...office(ids.bidiiKisumu, ids.bidii, 'KISUMU', 'Kisumu Branch'),
        ...by(ids.wanjiru, 'DRAFT'),
        createdAt: '2026-11-10T08:00:00Z',
      },
      {
        ...office(ids.bidiiNakuru, ids.bidii, 'NAKURU', 'Nakuru Branch'),
        ...by(ids.wanjiru, 'PENDING_APPROVAL', ids.wanjiru),
        createdAt: '2026-11-11T08:00:00Z',
      },
      {
        ...office(ids.bidiiEldoret, ids.bidii, 'ELDORET', 'Eldoret Branch'),
        ...by(ids.wanjiru, 'PENDING_APPROVAL', IDS.jane),
        createdAt: '2026-11-12T08:00:00Z',
      },
      office(ids.tumainiHeadOffice, ids.tumaini, 'HEAD_OFFICE', 'Head Office'),
      {
        ...office(ids.tumainiThika, ids.tumaini, 'THIKA', 'Thika Branch'),
        ...by(ids.kariuki, 'ACTIVE', ids.kariuki),
      },
      {
        ...office(ids.tumainiMeru, ids.tumaini, 'MERU', 'Meru Branch'),
        ...by(ids.kariuki, 'PENDING_APPROVAL', ids.kariuki),
      },
      office(ids.imaraHeadOffice, ids.imara, 'HEAD_OFFICE', 'Head Office'),
      {
        ...office(ids.imaraLamu, ids.imara, 'LAMU', 'Lamu Branch'),
        ...by(ids.wanjiru, 'PENDING_APPROVAL', ids.wanjiru),
      },
      { ...office(ids.imaraVoi, ids.imara, 'VOI', 'Voi Branch'), ...by(ids.wanjiru, 'DRAFT') },
      // A draft under Lamu's code, which `uq_branch_organisation_code` keeps a real tenant from
      // holding: seeded only so the fake-API spec pins submit's code recheck.
      {
        ...office(ids.imaraLamuTown, ids.imara, 'LAMU', 'Lamu Town Branch'),
        ...by(ids.wanjiru, 'DRAFT'),
      },
      {
        ...office(ids.imaraMalindi, ids.imara, 'MALINDI', 'Malindi Branch'),
        ...by(ids.wanjiru, 'PENDING_APPROVAL', ids.wanjiru),
      },
    ],
    // Otieno's approval needs an active role and an active branch (contract §F).
    branchAssignments: [
      ...state.branchAssignments,
      assignment(seed('e1'), ids.bidii, ids.wanjiru, ids.bidiiHeadOffice, 'HOME'),
      assignment(seed('e2'), ids.bidii, ids.otieno, ids.bidiiHeadOffice, 'HOME'),
      assignment(seed('e5'), ids.imara, ids.baraka, ids.imaraHeadOffice, 'HOME'),
    ],
    // The platform role only: no tenant role gains a code it doesn't hold in `platform-operator`.
    roles: [
      ...state.roles.map((candidate) =>
        candidate.id === IDS.platformAdminRole
          ? {
              ...candidate,
              permissions: [
                ...candidate.permissions,
                ...PLATFORM_CHECKER_CODES.filter((code) => !candidate.permissions.includes(code)),
              ],
            }
          : candidate,
      ),
      role(seed('d1'), ids.bidii, 'TENANT_ADMIN', 'Tenant admin', ['branch.view']),
      role(seed('d2'), ids.imara, 'TENANT_ADMIN', 'Tenant admin', [
        'auth.select_organisation',
        'audit.view',
      ]),
    ],
    roleAssignments: [
      ...state.roleAssignments,
      tenantRoleAssignment(seed('e3'), ids.bidii, ids.wanjiru, seed('d1')),
      tenantRoleAssignment(seed('e4'), ids.bidii, ids.otieno, seed('d1')),
      tenantRoleAssignment(seed('e6'), ids.imara, IDS.jane, seed('d2')),
      tenantRoleAssignment(seed('e7'), ids.imara, ids.baraka, seed('d2')),
    ],
  };
}

/** bg-adopt 18 seed IDs (lane rules §5): Kamau …01, his membership …02, his assignments …03–…04. */
export const REINVITED_SCENARIO_IDS = {
  kamau: 'a1800000-0000-4000-8000-000000000001',
  kamauMembership: 'a1800000-0000-4000-8000-000000000002',
} as const;

/**
 * BG-28: `users` plus Kamau Njoroge, a re-invited member whose account was never provisioned. His
 * first membership was revoked while his identity was still being set up, so his account stayed
 * PROVISIONING_IDP with no identity link; Victor invited him again, so the same membership awaits
 * approval with fresh access and no dispatch of this life (his invitation reads AWAITING_APPROVAL).
 * In a list he looks like Daniel, whose approval ran: only his membership's invitation tells them
 * apart.
 */
function usersReinvitedScenario(): RunState {
  const state = usersScenario();
  const ids = REINVITED_SCENARIO_IDS;
  return {
    ...state,
    users: [
      ...state.users,
      {
        id: ids.kamau,
        username: 'kamau.njoroge',
        email: 'kamau.njoroge@greenfield.example',
        displayName: 'Kamau Njoroge',
        status: 'PROVISIONING_IDP',
        keycloakSubject: 'e2e-kamau.njoroge',
        identityLinked: false,
      },
    ],
    memberships: [
      ...state.memberships,
      {
        ...membership(ids.kamauMembership, IDS.greenfield, ids.kamau),
        type: 'STAFF',
        status: 'PENDING_APPROVAL',
        primaryBranchId: IDS.westlands,
        invitedBy: USER_SCENARIO_IDS.victor,
      },
    ],
    branchAssignments: [
      ...state.branchAssignments,
      assignment(
        'a1800000-0000-4000-8000-000000000003',
        IDS.greenfield,
        ids.kamau,
        IDS.westlands,
        'HOME',
      ),
    ],
    roleAssignments: [
      ...state.roleAssignments,
      tenantRoleAssignment(
        'a1800000-0000-4000-8000-000000000004',
        IDS.greenfield,
        ids.kamau,
        USER_SCENARIO_IDS.teller,
      ),
    ],
  };
}

/** Layer 12 seed IDs (lane rules §5): users …a*, memberships …b*, branches …c*; role assignments
 * …d*, branch assignments …e* and audit events …f* are internal. Every tail holds a letter, so an
 * upper-cased id differs from the seed. */
export const APPROVAL_SCENARIO_IDS = {
  rose: '12000000-0000-4000-8000-0000000000a1',
  samuel: '12000000-0000-4000-8000-0000000000a2',
  tabitha: '12000000-0000-4000-8000-0000000000a3',
  zawadi: '12000000-0000-4000-8000-0000000000a4',
  usha: '12000000-0000-4000-8000-0000000000a5',
  roseMembership: '12000000-0000-4000-8000-0000000000b1',
  samuelMembership: '12000000-0000-4000-8000-0000000000b2',
  tabithaMembership: '12000000-0000-4000-8000-0000000000b3',
  zawadiMembership: '12000000-0000-4000-8000-0000000000b4',
  ushaMembership: '12000000-0000-4000-8000-0000000000b5',
  kericho: '12000000-0000-4000-8000-0000000000c1',
  naivasha: '12000000-0000-4000-8000-0000000000c2',
  lamu: '12000000-0000-4000-8000-0000000000c3',
  voi: '12000000-0000-4000-8000-0000000000c4',
} as const;

/** The overflow seeds (rule 13): 100 characters each (contract §D maxima), and one email that is a
 * single unbreakable 79-character token. */
export const APPROVAL_SCENARIO_TEXT = {
  longName:
    'Zawadi Wanjiru Kamau-Achieng Muthoni Njeri Chebet Jepkoech Nyambura Akinyi Atieno Wairimu Mwangi Ayo',
  longEmail: 'zawadi.wanjiru.kamau.achieng.muthoni.njeri.chebet@greenfieldteachersacc.example',
  longBranch:
    'Lamu Old Town Waterfront and Shela Village Customer Service Centres for the Fishers and Allied Staff',
} as const;

/**
 * Layer 12: a copy of `users` (Amina's approval is a 202, Brian's a 200, Jane invited Carol, and
 * Daniel's identity is still provisioning) plus five more pending members, all invited by Victor:
 * Rose holds no role and Samuel no branch (each approval is a 409, BG-07), Tabitha is an auditor
 * (branch-exempt, a 200), Zawadi carries the 100-character name and the unbreakable email (a 202),
 * and Usha's account is suspended (her approval is a 409). Three branches wait for activation
 * (Victor drafted Kericho and Lamu, Jane drafted Naivasha) and Voi is still a draft. Jane gains
 * `branch.approve`.
 */
function approvalsScenario(): RunState {
  const state = usersScenario();
  const ids = APPROVAL_SCENARIO_IDS;
  const victor = USER_SCENARIO_IDS.victor;
  const teller = USER_SCENARIO_IDS.teller;
  const seed = (tail: string) => `12000000-0000-4000-8000-0000000000${tail}`;
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
  const pending = (
    id: string,
    userId: string,
    type: string,
    primaryBranchId: string | null = null,
  ): FakeMembership => ({
    ...membership(id, IDS.greenfield, userId),
    type,
    status: 'PENDING_APPROVAL',
    primaryBranchId,
    invitedBy: victor,
  });
  const submitted = (
    id: string,
    code: string,
    name: string,
    draftedBy: string,
    createdAt: string,
    status = 'PENDING_APPROVAL',
  ): FakeBranch => ({
    ...branch(id, IDS.greenfield, code, name, 'OPERATIONS'),
    status,
    draftedBy,
    // A submitted branch names its submitter, as on the platform: here, its drafter.
    submittedBy: draftedBy,
    parentBranchId: IDS.headOffice,
    createdAt,
    updatedAt: createdAt,
  });
  const invite = (tail: string, userId: string, occurredAt: string) =>
    userAuditEvent(seed(tail), 'USER', userId, 'user.invite', victor, occurredAt);
  return {
    ...state,
    users: [
      ...state.users,
      person(ids.rose, 'rose.atieno', 'Rose Atieno', 'DRAFT', { identityLinked: false }),
      person(ids.samuel, 'samuel.kiptoo', 'Samuel Kiptoo', 'ACTIVE'),
      person(ids.tabitha, 'tabitha.wekesa', 'Tabitha Wekesa', 'ACTIVE'),
      person(ids.zawadi, 'zawadi.long', APPROVAL_SCENARIO_TEXT.longName, 'DRAFT', {
        identityLinked: false,
        email: APPROVAL_SCENARIO_TEXT.longEmail,
      }),
      person(ids.usha, 'usha.patel', 'Usha Patel', 'SUSPENDED'),
    ],
    // Newest first is reverse seed order: the queue reads Usha, Zawadi, Tabitha, Samuel, Rose, then
    // 10's Daniel, Carol, Brian and Amina.
    memberships: [
      ...state.memberships,
      pending(ids.roseMembership, ids.rose, 'STAFF', IDS.westlands),
      pending(ids.samuelMembership, ids.samuel, 'STAFF'),
      pending(ids.tabithaMembership, ids.tabitha, 'AUDITOR'),
      pending(ids.zawadiMembership, ids.zawadi, 'STAFF', IDS.westlands),
      pending(ids.ushaMembership, ids.usha, 'STAFF', IDS.headOffice),
    ],
    branches: [
      ...state.branches,
      submitted(ids.kericho, 'KERICHO', 'Kericho Branch', victor, '2026-09-10T08:00:00Z'),
      submitted(ids.naivasha, 'NAIVASHA', 'Naivasha Branch', IDS.jane, '2026-09-11T08:00:00Z'),
      submitted(
        ids.lamu,
        'LAMU',
        APPROVAL_SCENARIO_TEXT.longBranch,
        victor,
        '2026-09-12T08:00:00Z',
      ),
      submitted(ids.voi, 'VOI', 'Voi Branch', victor, '2026-09-13T08:00:00Z', 'DRAFT'),
    ],
    branchAssignments: [
      ...state.branchAssignments,
      assignment(seed('e1'), IDS.greenfield, ids.rose, IDS.westlands, 'HOME'),
      assignment(seed('e2'), IDS.greenfield, ids.zawadi, IDS.westlands, 'HOME'),
      assignment(seed('e3'), IDS.greenfield, ids.usha, IDS.headOffice, 'HOME'),
    ],
    roles: state.roles.map((candidate) =>
      candidate.id === IDS.tenantAdminRole
        ? { ...candidate, permissions: [...candidate.permissions, 'branch.approve'] }
        : candidate,
    ),
    roleAssignments: [
      ...state.roleAssignments,
      tenantRoleAssignment(seed('d1'), IDS.greenfield, ids.samuel, teller),
      tenantRoleAssignment(seed('d2'), IDS.greenfield, ids.tabitha, teller),
      tenantRoleAssignment(seed('d3'), IDS.greenfield, ids.zawadi, teller),
      tenantRoleAssignment(seed('d4'), IDS.greenfield, ids.usha, teller),
    ],
    auditEvents: [
      ...state.auditEvents,
      invite('f1', ids.rose, '2026-09-24T08:00:00Z'),
      invite('f2', ids.samuel, '2026-09-25T08:00:00Z'),
      invite('f3', ids.tabitha, '2026-09-26T08:00:00Z'),
      invite('f4', ids.zawadi, '2026-09-27T08:00:00Z'),
      invite('f5', ids.usha, '2026-09-28T08:00:00Z'),
      branchDraftEvent(seed('f6'), ids.kericho, victor, '2026-09-10T08:00:00Z'),
      branchDraftEvent(seed('f7'), ids.naivasha, IDS.jane, '2026-09-11T08:00:00Z'),
      branchDraftEvent(seed('f8'), ids.lamu, victor, '2026-09-12T08:00:00Z'),
      branchDraftEvent(seed('f9'), ids.voi, victor, '2026-09-13T08:00:00Z'),
    ],
  };
}

/** Layer 11 seed IDs (lane rules §5): users …a*, branches …b*, organisations …c*, memberships …d*. */
export const INVITE_SCENARIO_IDS = {
  rehema: '11000000-0000-4000-8000-0000000000a1',
  otieno: '11000000-0000-4000-8000-0000000000a2',
  kisumu: '11000000-0000-4000-8000-0000000000b1',
  pwaniTraders: '11000000-0000-4000-8000-0000000000c1',
  rehemaMembership: '11000000-0000-4000-8000-0000000000d1',
  otienoMembership: '11000000-0000-4000-8000-0000000000d2',
} as const;

/** bg-adopt 17 seed IDs (BG-11): `users-invite-dispatch-edges`' two members, …01–…04. */
export const DISPATCH_EDGE_IDS = {
  grace: 'a1700000-0000-4000-8000-000000000001',
  graceMembership: 'a1700000-0000-4000-8000-000000000002',
  kevin: 'a1700000-0000-4000-8000-000000000003',
  kevinMembership: 'a1700000-0000-4000-8000-000000000004',
} as const;

/** The seeds' words the invite e2e types and asserts. */
export const INVITE_SCENARIO_TEXT = {
  rehemaEmail: 'rehema.mwangi@pwani-traders.example',
  rehemaName: 'Rehema Mwangi',
  takenUsername: 'otieno.k',
} as const;

/**
 * Layer 11: a copy of `users` (a member in every onboarding state; ACTIVE roles and the DISABLED
 * Loans officer) plus `user.invite` on Jane's role, a PENDING_APPROVAL branch the wizard must not
 * offer, and two accounts in another institution: Rehema, whose email an invite reuses (her own
 * name stays), and Otieno, whose username is taken for any other email (a 409 the wizard can't
 * check, BG-07).
 */
function usersInviteScenario(): RunState {
  const state = usersScenario();
  const ids = INVITE_SCENARIO_IDS;
  const outsider = (id: string, username: string, displayName: string): FakeUser => ({
    id,
    username,
    email: `${username}@pwani-traders.example`,
    displayName,
    status: 'ACTIVE',
    keycloakSubject: `e2e-${username}`,
  });
  const staffAt = (id: string, userId: string): FakeMembership => ({
    ...membership(id, ids.pwaniTraders, userId),
    type: 'STAFF',
  });
  return {
    ...state,
    organisations: [
      ...state.organisations,
      organisation(ids.pwaniTraders, 'pwani-traders', 'Pwani Traders SACCO'),
    ],
    users: [
      ...state.users,
      outsider(ids.rehema, 'rehema.mwangi', INVITE_SCENARIO_TEXT.rehemaName),
      outsider(ids.otieno, INVITE_SCENARIO_TEXT.takenUsername, 'Otieno Kamau'),
    ],
    memberships: [
      ...state.memberships,
      staffAt(ids.rehemaMembership, ids.rehema),
      staffAt(ids.otienoMembership, ids.otieno),
    ],
    branches: [
      ...state.branches,
      {
        ...branch(ids.kisumu, IDS.greenfield, 'KISUMU', 'Kisumu Branch', 'OPERATIONS'),
        status: 'PENDING_APPROVAL',
      },
    ],
    roles: state.roles.map((candidate) =>
      candidate.id === IDS.tenantAdminRole
        ? { ...candidate, permissions: [...candidate.permissions, 'user.invite'] }
        : candidate,
    ),
  };
}

/** Layer 14 seed IDs (lane rules §5): users …a*, memberships …b*, branches …c*, the branch
 * reviewer role …d1 and its grant …e1, the audit event …f1. Every tail holds a letter, so an
 * upper-cased id differs from the seed. */
export const OVERVIEW_SCENARIO_IDS = {
  halima: '14000000-0000-4000-8000-0000000000a1',
  nyokabi: '14000000-0000-4000-8000-0000000000a2',
  baraka: '14000000-0000-4000-8000-0000000000a3',
  wanjiku: '14000000-0000-4000-8000-0000000000a4',
  peter: '14000000-0000-4000-8000-0000000000a5',
  halimaMembership: '14000000-0000-4000-8000-0000000000b1',
  nyokabiMembership: '14000000-0000-4000-8000-0000000000b2',
  barakaMembership: '14000000-0000-4000-8000-0000000000b3',
  wanjikuMembership: '14000000-0000-4000-8000-0000000000b4',
  peterMembership: '14000000-0000-4000-8000-0000000000b5',
  kakamega: '14000000-0000-4000-8000-0000000000c1',
  nyeri: '14000000-0000-4000-8000-0000000000c2',
  malindi: '14000000-0000-4000-8000-0000000000c3',
  branchReviewerRole: '14000000-0000-4000-8000-0000000000d1',
  branchReviewerGrant: '14000000-0000-4000-8000-0000000000e1',
  welcomeEvent: '14000000-0000-4000-8000-0000000000f1',
} as const;

/** The overflow seeds: a 100-character name (contract §D maximum), an unbreakable 78-character
 * email, and a 100-character branch name. */
export const OVERVIEW_SCENARIO_TEXT = {
  longName:
    'Nyokabi Wairimu Kamau-Achieng Muthoni Njeri Cheru Jepkoech Nyambura Akinyi Atieno Wanjiru Mwangi Ayo',
  longEmail: 'nyokabi.wairimu.kamau.achieng.muthoni.njeri.chebet@greenfieldsaccotell.example',
  longBranch:
    'Malindi, Watamu and Kilifi Creek Coastal Customer Service Centres for the Fishers and Allied Workers',
} as const;

/** `default` with both decision codes on Jane's role, and a system event newer than every seed, so
 * the activity card's first row reads "System". */
function overviewBase(): RunState {
  const state = greenfieldTenant();
  return {
    ...state,
    roles: state.roles.map((candidate) =>
      candidate.id === IDS.tenantAdminRole
        ? {
            ...candidate,
            permissions: [...candidate.permissions, 'user.approve', 'branch.approve'],
          }
        : candidate,
    ),
    auditEvents: [
      ...state.auditEvents,
      {
        id: OVERVIEW_SCENARIO_IDS.welcomeEvent,
        organisationId: IDS.greenfield,
        occurredAt: '2026-09-08T06:00:00Z',
        actorUserId: null,
        actorType: 'SYSTEM',
        branchId: null,
        entityType: 'USER',
        entityId: IDS.jane,
        action: 'user.welcome_email',
        outcome: 'SUCCESS',
        severity: 'INFO',
        reason: null,
        beforeJson: null,
        afterJson: null,
        metadataJson: '{}',
      },
    ],
  };
}

/** Layer 14, `overview-ready`: Peter is the second active member, so every readiness item is met
 * (two active branches and none pending, the date open) and nothing waits. */
function overviewReadyScenario(): RunState {
  const state = overviewBase();
  const ids = OVERVIEW_SCENARIO_IDS;
  return {
    ...state,
    users: [
      ...state.users,
      {
        id: ids.peter,
        username: 'peter.mwangi',
        email: 'peter.mwangi@greenfield.example',
        displayName: 'Peter Mwangi',
        status: 'ACTIVE',
        keycloakSubject: 'e2e-peter.mwangi',
      },
    ],
    memberships: [
      ...state.memberships,
      { ...membership(ids.peterMembership, IDS.greenfield, ids.peter), type: 'STAFF' },
    ],
  };
}

/**
 * Layer 14, `overview-attention`: every readiness item but the institution's needs attention. Four
 * memberships wait (newest first: Wanjiku, Baraka, whose identity is provisioning, Nyokabi, with the
 * long name and email, then Halima), three branches wait for activation (newest first: Malindi,
 * with the long name, Nyeri, then Kakamega past the five-row preview), Jane is the only active
 * member, and the business date is closed.
 */
function overviewAttentionScenario(): RunState {
  const state = overviewBase();
  const ids = OVERVIEW_SCENARIO_IDS;
  const person = (
    id: string,
    username: string,
    displayName: string,
    status: string,
    email = `${username}@greenfield.example`,
  ): FakeUser => ({ id, username, email, displayName, status, keycloakSubject: `e2e-${username}` });
  const pending = (id: string, userId: string): FakeMembership => ({
    ...membership(id, IDS.greenfield, userId),
    type: 'STAFF',
    status: 'PENDING_APPROVAL',
  });
  const submitted = (id: string, code: string, name: string, createdAt: string): FakeBranch => ({
    ...branch(id, IDS.greenfield, code, name, 'OPERATIONS'),
    status: 'PENDING_APPROVAL',
    parentBranchId: IDS.headOffice,
    createdAt,
    updatedAt: createdAt,
  });
  return {
    ...state,
    // The fake lists users newest first as reverse seed order.
    users: [
      ...state.users,
      person(ids.halima, 'halima.odhiambo', 'Halima Odhiambo', 'DRAFT'),
      person(
        ids.nyokabi,
        'nyokabi.long',
        OVERVIEW_SCENARIO_TEXT.longName,
        'DRAFT',
        OVERVIEW_SCENARIO_TEXT.longEmail,
      ),
      person(ids.baraka, 'baraka.otieno', 'Baraka Otieno', 'PROVISIONING_IDP'),
      person(ids.wanjiku, 'wanjiku.kariuki', 'Wanjiku Kariuki', 'DRAFT'),
    ],
    memberships: [
      ...state.memberships,
      pending(ids.halimaMembership, ids.halima),
      pending(ids.nyokabiMembership, ids.nyokabi),
      // Approval ran: his identity is being provisioned (BG-11).
      {
        ...pending(ids.barakaMembership, ids.baraka),
        dispatch: {
          status: 'PENDING',
          attempts: 0,
          lastError: null,
          updatedAt: '2026-09-15T08:00:00Z',
        },
      },
      pending(ids.wanjikuMembership, ids.wanjiku),
    ],
    branches: [
      ...state.branches,
      submitted(ids.kakamega, 'KAKAMEGA', 'Kakamega Branch', '2026-09-14T08:00:00Z'),
      submitted(ids.nyeri, 'NYERI', 'Nyeri Branch', '2026-09-15T08:00:00Z'),
      submitted(ids.malindi, 'MALINDI', OVERVIEW_SCENARIO_TEXT.longBranch, '2026-09-16T08:00:00Z'),
    ],
    businessDates: state.businessDates.map((row) => ({ ...row, status: 'CLOSED' as const })),
  };
}

/**
 * Layer 14, `overview-branch-scoped` (BG-33): the attention data, with Jane's branch codes on a
 * BRANCH grant at Head Office instead of her tenant role. With Head Office selected, `/auth/me`
 * lists `branch.view` and `branch.approve`. The branch list is target-aware (BG-03) and would answer
 * Head Office alone, so the Branches item reads nothing rather than pass that off as the
 * institution's count. A branch-scoped `branch.approve` activates no pending branch (#242), so the
 * approvals card and the bell read no branch requests.
 */
function overviewBranchScopedScenario(): RunState {
  const state = withoutPermission(overviewAttentionScenario(), 'branch.view', 'branch.approve');
  const ids = OVERVIEW_SCENARIO_IDS;
  return {
    ...state,
    roles: [
      ...state.roles,
      {
        ...role(ids.branchReviewerRole, IDS.greenfield, 'BRANCH_REVIEWER', 'Branch reviewer', [
          'branch.view',
          'branch.approve',
        ]),
        systemRole: false,
      },
    ],
    roleAssignments: [
      ...state.roleAssignments,
      {
        ...tenantRoleAssignment(
          ids.branchReviewerGrant,
          IDS.greenfield,
          IDS.jane,
          ids.branchReviewerRole,
        ),
        scopeType: 'BRANCH',
        branchId: IDS.headOffice,
      },
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
  // can prove it excludes a SUSPENDED branch without a branch-lifecycle route to reach that state
  // at runtime.
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
  // BG-03: `branch.view` held nowhere, so the target-aware branch list answers 403.
  'no-branch-view': () => withoutPermission(greenfieldTenant(), 'branch.view'),
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
  // BG-03: `roles`, with Jane's role_assignment.view only at Westlands: the assignment search lists
  // Westlands' BRANCH-scope rows alone, whichever branch is selected.
  'roles-branch-scoped-view': () => {
    const state = withoutPermission(rolesScenario(), 'role_assignment.view');
    state.roles.push({
      ...role(
        BRANCH_SCOPED_IDS.viewerRole,
        IDS.greenfield,
        'WESTLANDS_VIEWER',
        'Westlands viewer',
        ['role_assignment.view'],
      ),
      systemRole: false,
    });
    state.roleAssignments.push({
      ...tenantRoleAssignment(
        BRANCH_SCOPED_IDS.viewerGrant,
        IDS.greenfield,
        IDS.jane,
        BRANCH_SCOPED_IDS.viewerRole,
      ),
      scopeType: 'BRANCH',
      branchId: IDS.westlands,
    });
    return state;
  },
  // #342: Jane as an IAM_ADMIN-shaped member, the role codes without user.assign_self, who also
  // holds the DISABLED Loans officer: she can't add to her own access.
  'roles-self': () => {
    const state = withoutPermission(rolesScenario(), 'user.assign_self');
    state.roleAssignments.push(
      tenantRoleAssignment(
        ROLE_SCENARIO_IDS.janeLoansOfficer,
        IDS.greenfield,
        IDS.jane,
        ROLE_SCENARIO_IDS.loansOfficer,
      ),
    );
    return state;
  },
  // Layer 16 (platform tenants). `platform-tenants-no-amend` lacks tenant.update_draft, so the
  // detail withholds a draft's first administrator (BG-14).
  'platform-tenants': platformTenantsScenario,
  'platform-tenants-no-amend': () =>
    withoutPermission(platformTenantsScenario(), 'tenant.update_draft'),
  // Umoja as a draft with no bootstrap record (a SQL-seeded tenant): the platform keeps no first
  // administrator for it, and its amend discards one (BG-14).
  'platform-tenants-no-administrator': () => {
    const state = platformTenantsScenario();
    const umoja = state.organisations.find((tenant) => tenant.id === TENANT_SCENARIO_IDS.umoja);
    if (umoja) delete umoja.admin;
    return state;
  },
  // Layer 10 (users). `users-limited` lacks the membership read and audit; `users-read-only` lacks
  // every lifecycle and assignment code, for the gated-control cases.
  users: usersScenario,
  'users-limited': () => withoutPermission(usersScenario(), 'membership.view', 'audit.view'),
  'users-read-only': () => withoutPermission(usersScenario(), ...USER_ADMIN_CODES),
  // #342: the same, with Jane IAM_ADMIN-shaped (no user.assign_self) on her own record.
  'users-self': () => withoutPermission(usersScenario(), 'user.assign_self'),
  // BG-28: with Kamau, re-invited after a revoke while his account was still provisioning.
  'users-reinvited': usersReinvitedScenario,
  // A pagination fixture (BG-09): Felix also works at eleven outposts, each assignment newer than
  // his Westlands Home, so his twelve fill a page of 10 and spill onto a second, newest first.
  'users-many-assignments': () => {
    const state = usersScenario();
    const outposts = Array.from({ length: 11 }, (_, n) => {
      const number = String(n + 1).padStart(2, '0');
      return branch(
        `${MANY_ASSIGNMENTS_ID_PREFIX}${number}`,
        IDS.greenfield,
        `OUTPOST_${number}`,
        `Outpost ${number}`,
        'OPERATIONS',
      );
    });
    state.branches.push(...outposts);
    state.branchAssignments.push(
      ...outposts.map((outpost, n) =>
        assignment(
          `${MANY_ASSIGNMENTS_ID_PREFIX}${String(n + 51)}`,
          IDS.greenfield,
          USER_SCENARIO_IDS.felix,
          outpost.id,
          'OPERATE',
          `2026-10-${String(n + 1).padStart(2, '0')}T08:00:00Z`,
        ),
      ),
    );
    return state;
  },
  // Layer 17 (platform records). `platform-records-read-only` has the same data without the four
  // mutation codes and without tenant.approve (no badge) on the platform role, for the gated-control
  // cases. Only the platform role loses them: Jane keeps branch.create at Acme, so a refused
  // platform branch draft there proves the platform gate, not BG-18.
  'platform-records': platformRecordsScenario,
  // bg-adopt 15 (platform checker). `platform-checker-read-only` holds the platform's read codes
  // only, so neither tab offers a checker action or a window note.
  'platform-checker': platformCheckerScenario,
  'platform-checker-read-only': () => {
    const state = platformCheckerScenario();
    return {
      ...state,
      roles: state.roles.map((candidate) =>
        candidate.id === IDS.platformAdminRole
          ? {
              ...candidate,
              permissions: candidate.permissions.filter(
                (code) => !PLATFORM_CHECKER_CODES.includes(code),
              ),
            }
          : candidate,
      ),
    };
  },
  'platform-records-read-only': () => {
    const state = platformRecordsScenario();
    const stripped: readonly string[] = [...PLATFORM_RECORD_CODES, 'tenant.approve'];
    return {
      ...state,
      roles: state.roles.map((candidate) =>
        candidate.id === IDS.platformAdminRole
          ? {
              ...candidate,
              permissions: candidate.permissions.filter((code) => !stripped.includes(code)),
            }
          : candidate,
      ),
    };
  },
  // Layer 12 (approvals). `approvals-limited` has the same data without the audit read, the two
  // assignment reads and membership.revoke: the maker check is the platform's, requested access
  // can't be read, and Reject & revoke isn't offered.
  approvals: approvalsScenario,
  'approvals-limited': () =>
    withoutPermission(
      approvalsScenario(),
      'audit.view',
      'role_assignment.view',
      'branch_assignment.view',
      'membership.revoke',
    ),
  // The layer gate's visual pass: the same data under the long-names scenario's organisation name
  // (the header at its crowded widths, with the bell), and with nothing pending (both empty tabs).
  'approvals-long-org': () => {
    const state = approvalsScenario();
    return {
      ...state,
      organisations: state.organisations.map((candidate) => ({
        ...candidate,
        displayName:
          'Greenfield Teachers and Public Service Employees Savings and Credit Co-operative Society',
      })),
    };
  },
  // Entry 08 (BG-08, ADR 0032). `approvals-self-approval` stores both maker-checker switches as
  // `false`, so Jane may approve Carol, whom she invited, and activate Naivasha, which she drafted
  // (each audited HIGH). `approvals-no-settings` can't read a switch (decision Q4): Approve stays on
  // offer, and the platform refuses her by name.
  'approvals-self-approval': () => {
    const state = approvalsScenario();
    const off = (key: string): FakeTenantSetting => ({
      organisationId: IDS.greenfield,
      key,
      value: 'false',
      valueType: 'BOOLEAN',
      sensitive: false,
    });
    return {
      ...state,
      tenantSettings: [
        ...state.tenantSettings,
        off('require_maker_checker_for_user_invites'),
        off('require_maker_checker_for_branch_creation'),
      ],
    };
  },
  'approvals-no-settings': () => withoutPermission(approvalsScenario(), 'settings.view'),
  'approvals-empty': () => {
    const state = approvalsScenario();
    return {
      ...state,
      memberships: state.memberships.filter((row) => row.status !== 'PENDING_APPROVAL'),
      branches: state.branches.filter((row) => row.status !== 'PENDING_APPROVAL'),
    };
  },
  // Layer 11 (invite wizard). `users` plus user.invite, a pending branch and two accounts in
  // another institution; `users-invite-limited` is the same without user.assign_branch (an invite
  // with a branch is refused, and the wizard isn't offered). `users` itself has no user.invite.
  'users-invite': usersInviteScenario,
  'users-invite-limited': () => withoutPermission(usersInviteScenario(), 'user.assign_branch'),
  // BG-11's two dispatch edges, for the fake API's own spec. Grace is invited, with an ACTIVE
  // membership, but no provisioning dispatch was ever recorded for her (an identity linked before
  // the dispatch log, say), so a resend is not applicable. Kevin's dispatch has just SUCCEEDED
  // while his account and membership still wait on it, so a retry is a 409: nothing failed.
  'users-invite-dispatch-edges': () => {
    const state = usersInviteScenario();
    const ids = DISPATCH_EDGE_IDS;
    const person = (id: string, username: string, displayName: string, status: string) => ({
      id,
      username,
      email: `${username}@greenfield.example`,
      displayName,
      status,
      keycloakSubject: `e2e-${username}`,
    });
    state.users.push(person(ids.grace, 'grace.wairimu', 'Grace Wairimu', 'INVITED'), {
      ...person(ids.kevin, 'kevin.mwangi', 'Kevin Mwangi', 'PROVISIONING_IDP'),
      identityLinked: false,
    });
    state.memberships.push(
      { ...membership(ids.graceMembership, IDS.greenfield, ids.grace), type: 'STAFF' },
      {
        ...membership(ids.kevinMembership, IDS.greenfield, ids.kevin),
        type: 'STAFF',
        status: 'PENDING_APPROVAL',
        dispatch: {
          status: 'SUCCEEDED',
          attempts: 1,
          lastError: null,
          updatedAt: '2026-11-24T06:14:00Z',
        },
      },
    );
    return state;
  },
  // BG-22: the same with the invites' maker-checker switch off, so the platform's count includes
  // the invitations Jane sends herself and the bell reads one more after hers.
  'users-invite-self-approval': () => {
    const state = usersInviteScenario();
    const off: FakeTenantSetting = {
      organisationId: IDS.greenfield,
      key: 'require_maker_checker_for_user_invites',
      value: 'false',
      valueType: 'BOOLEAN',
      sensitive: false,
    };
    return { ...state, tenantSettings: [...state.tenantSettings, off] };
  },
  // Layer 14 (overview). `overview-limited` is the attention data without the business date, audit,
  // membership and settings reads and without user.approve: two cards are omitted, the approvals card
  // lists branches only, and three readiness items can't be checked.
  'overview-ready': overviewReadyScenario,
  'overview-attention': overviewAttentionScenario,
  'overview-limited': () =>
    withoutPermission(
      overviewAttentionScenario(),
      'business_date.view',
      'audit.view',
      'membership.view',
      'settings.view',
      'user.approve',
    ),
  'overview-branch-scoped': overviewBranchScopedScenario,
  'branches-branch-scoped': branchesBranchScopedScenario,
  'branches-two-branch-scoped': branchesTwoBranchScopedScenario,
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
