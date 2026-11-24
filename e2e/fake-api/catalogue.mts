type Kind = 'VIEW' | 'MUTATION' | 'CONTEXT';
type GrantScope = 'TENANT' | 'PLATFORM';

/**
 * The platform's 86 permission codes at `6a8ea28`, one per line: code, `kind`, `grant_scope`, risk,
 * module, the views `permission_view_requirement` pairs with a MUTATION (comma-separated, `-` for
 * none), then the name. Names, modules and risks come from V2, V5, V19, V32-V34 and V39; kinds,
 * scopes and pairs from V22 and those later files. V21 made `branch.activate` DEPRECATED, so 85
 * are ACTIVE. The fake keeps its own copy, so `e2e/fake-api-roles.spec.ts` can pin
 * `auth/permission-views.ts` against it.
 */
const CATALOGUE = `
tenant.create                  MUTATION PLATFORM HIGH     tenant     tenant.view               Create organisation
tenant.submit_for_approval     MUTATION PLATFORM HIGH     tenant     tenant.view               Submit organisation for approval
tenant.approve                 MUTATION PLATFORM CRITICAL tenant     tenant.view               Approve organisation
tenant.activate                MUTATION PLATFORM CRITICAL tenant     tenant.view               Activate organisation
tenant.suspend                 MUTATION PLATFORM CRITICAL tenant     tenant.view               Suspend organisation
tenant.deprovision             MUTATION PLATFORM CRITICAL tenant     tenant.view               Deprovision organisation
tenant.view                    VIEW     TENANT   MEDIUM   tenant     -                         View organisation
tenant.update_draft            MUTATION PLATFORM HIGH     tenant     tenant.view               Update organisation draft
tenant.reject                  MUTATION PLATFORM HIGH     tenant     tenant.view               Reject organisation draft
tenant.reactivate              MUTATION PLATFORM CRITICAL tenant     tenant.view               Reactivate organisation
tenant.bootstrap_retry         MUTATION PLATFORM HIGH     tenant     tenant.view               Retry administrator bootstrap
branch.create                  MUTATION TENANT   HIGH     branch     branch.view               Create branch
branch.approve                 MUTATION TENANT   HIGH     branch     branch.view               Approve branch
branch.activate                MUTATION TENANT   HIGH     branch     branch.view               Activate branch
branch.suspend                 MUTATION TENANT   HIGH     branch     branch.view               Suspend branch
branch.close                   MUTATION TENANT   HIGH     branch     branch.view               Close branch
branch.view                    VIEW     TENANT   LOW      branch     -                         View branch
branch.reactivate              MUTATION TENANT   HIGH     branch     branch.view               Reactivate branch
user.invite                    MUTATION TENANT   HIGH     iam        membership.view,user.view Invite user
user.approve                   MUTATION TENANT   HIGH     iam        membership.view           Approve user
user.activate                  MUTATION PLATFORM HIGH     iam        user.view                 Activate user
user.suspend                   MUTATION PLATFORM HIGH     iam        user.view                 Suspend user
user.deactivate                MUTATION PLATFORM HIGH     iam        user.view                 Deactivate user
user.assign_branch             MUTATION TENANT   HIGH     iam        branch_assignment.view    Assign user branch
user.assign_role               MUTATION TENANT   HIGH     iam        role_assignment.view      Assign user role
user.revoke_branch             MUTATION TENANT   HIGH     iam        branch_assignment.view    Revoke branch assignment
user.revoke_role               MUTATION TENANT   HIGH     iam        role_assignment.view      Revoke role assignment
user.view                      VIEW     TENANT   LOW      iam        -                         View users
role.create                    MUTATION TENANT   HIGH     iam        role.view                 Create role
role.update                    MUTATION TENANT   HIGH     iam        role.view                 Update role
role.activate                  MUTATION TENANT   HIGH     iam        role.view                 Activate role
role.deactivate                MUTATION TENANT   HIGH     iam        role.view                 Deactivate role
role.assign_permission         MUTATION TENANT   CRITICAL iam        role.view                 Assign permission to role
role.remove_permission         MUTATION TENANT   CRITICAL iam        role.view                 Remove role permission
role.view                      VIEW     TENANT   LOW      iam        -                         View roles
membership.view                VIEW     TENANT   LOW      iam        -                         View memberships
membership.suspend             MUTATION TENANT   HIGH     iam        membership.view           Suspend membership
membership.reactivate          MUTATION TENANT   HIGH     iam        membership.view           Reactivate membership
membership.revoke              MUTATION TENANT   HIGH     iam        membership.view           Revoke membership
iam.profile.read               VIEW     TENANT   LOW      iam        -                         View own profile
auth.select_organisation       CONTEXT  TENANT   LOW      iam        -                         Select organisation
auth.select_branch             CONTEXT  TENANT   LOW      iam        -                         Select branch
branch_assignment.view         VIEW     TENANT   LOW      iam        -                         View branch assignments
role_assignment.view           VIEW     TENANT   LOW      iam        -                         View role assignments
permission.view                VIEW     TENANT   LOW      iam        -                         View permissions
audit.view                     VIEW     TENANT   MEDIUM   audit      -                         View audit log
settings.view                  VIEW     TENANT   LOW      settings   -                         View settings
settings.update                MUTATION TENANT   HIGH     settings   settings.view             Update settings
tenant_setting.manage_platform CONTEXT  PLATFORM HIGH     settings   -                         Manage platform-only settings
business_date.view             VIEW     TENANT   LOW      settings   -                         View business date
business_date.advance          MUTATION TENANT   CRITICAL settings   business_date.view        Advance business date
business_date.reopen           MUTATION TENANT   CRITICAL settings   business_date.view        Reopen business date
cob.start                      MUTATION TENANT   HIGH     settings   business_date.view        Start close of business
cob.complete                   MUTATION TENANT   HIGH     settings   business_date.view        Complete close of business
branch.update                  MUTATION TENANT   HIGH     branch     branch.view               Update branch
user.update                    MUTATION PLATFORM HIGH     iam        user.view                 Update user profile
membership.update              MUTATION TENANT   HIGH     iam        membership.view           Update membership
role.archive                   MUTATION TENANT   HIGH     iam        role.view                 Archive role
audit.export                   MUTATION TENANT   HIGH     audit      audit.view                Export audit events
user.assign_self               MUTATION TENANT   HIGH     iam        user.view                 Assign access to oneself
gl_account.view                VIEW     TENANT   LOW      accounting -                         View chart of accounts
gl_account.create              MUTATION TENANT   MEDIUM   accounting gl_account.view           Create GL account
gl_account.update              MUTATION TENANT   MEDIUM   accounting gl_account.view           Update GL account
gl_account.submit              MUTATION TENANT   MEDIUM   accounting gl_account.view           Submit GL account for approval
gl_account.approve             MUTATION TENANT   HIGH     accounting gl_account.view           Approve GL account
gl_account.deactivate          MUTATION TENANT   HIGH     accounting gl_account.view           Deactivate GL account
fiscal_period.view             VIEW     TENANT   LOW      accounting -                         View fiscal periods
fiscal_period.open             MUTATION TENANT   HIGH     accounting fiscal_period.view        Open fiscal period
fiscal_period.close            MUTATION TENANT   CRITICAL accounting fiscal_period.view        Close fiscal period
fiscal_period.reopen           MUTATION TENANT   CRITICAL accounting fiscal_period.view        Reopen fiscal period
journal.view                   VIEW     TENANT   LOW      accounting -                         View journals
journal.create_manual          MUTATION TENANT   HIGH     accounting journal.view              Create manual journal
journal.submit                 MUTATION TENANT   MEDIUM   accounting journal.view              Submit journal for approval
journal.approve                MUTATION TENANT   CRITICAL accounting journal.view              Approve and post journal
journal.reverse                MUTATION TENANT   CRITICAL accounting journal.view              Reverse journal
journal.post_prior_period      MUTATION TENANT   CRITICAL accounting journal.view              Post into a prior period
posting_rule.view              VIEW     TENANT   LOW      accounting -                         View posting rules
posting_rule.create            MUTATION TENANT   HIGH     accounting posting_rule.view         Create posting rule
posting_rule.update            MUTATION TENANT   HIGH     accounting posting_rule.view         Create posting-rule version
posting_rule.submit            MUTATION TENANT   MEDIUM   accounting posting_rule.view         Submit posting rule for approval
posting_rule.approve           MUTATION TENANT   CRITICAL accounting posting_rule.view         Approve and activate posting rule
reconciliation.view            VIEW     TENANT   LOW      accounting -                         View reconciliations
reconciliation.run             MUTATION TENANT   MEDIUM   accounting reconciliation.view       Run reconciliation
reconciliation.resolve         MUTATION TENANT   CRITICAL accounting reconciliation.view       Resolve reconciliation
accounting_report.view         VIEW     TENANT   LOW      accounting -                         View accounting reports
accounting_report.export       MUTATION TENANT   MEDIUM   accounting accounting_report.view    Export accounting reports
`;

export interface CatalogueEntry {
  id: string;
  code: string;
  name: string;
  module: string;
  risk: string;
  status: 'ACTIVE' | 'DEPRECATED';
  kind: Kind;
  grantScope: GrantScope;
  /** Sorted, like the platform's `required_view_permissions`; empty for a VIEW or CONTEXT. */
  requiredViews: readonly string[];
}

// Layer 09 seed ids (lane rules §5), numbered from …0100 so they never meet the scenario counter.
export const PERMISSIONS: readonly CatalogueEntry[] = CATALOGUE.trim()
  .split('\n')
  .map((line, index) => {
    const [code = '', kind, grantScope, risk = '', module = '', views = '-', ...name] =
      line.split(/\s+/);
    return {
      id: `09000000-0000-4000-8000-${(0x100 + index).toString(16).padStart(12, '0')}`,
      code,
      name: name.join(' '),
      module,
      risk,
      status: code === 'branch.activate' ? 'DEPRECATED' : 'ACTIVE',
      kind: kind as Kind,
      grantScope: grantScope as GrantScope,
      requiredViews: views === '-' ? [] : views.split(',').sort(),
    };
  });

const BY_CODE = new Map(PERMISSIONS.map((entry) => [entry.code, entry]));

export function catalogueEntry(code: string): CatalogueEntry | undefined {
  return BY_CODE.get(code);
}

/** The views `permission_view_requirement` pairs with `code`; none for an unknown code. */
export function viewsRequiredBy(code: string): readonly string[] {
  return BY_CODE.get(code)?.requiredViews ?? [];
}

/** Runtime honours only ACTIVE codes (V21): a DEPRECATED grant confers nothing. A code outside the
 * catalogue (a spec's synthetic one) counts as ACTIVE. */
export function isActivePermission(code: string): boolean {
  return (BY_CODE.get(code)?.status ?? 'ACTIVE') === 'ACTIVE';
}
