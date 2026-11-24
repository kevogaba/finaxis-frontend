/**
 * The platform's `permission_view_requirement` pairs (ADR 0030): each MUTATION code and the VIEW
 * codes a role or caller holding it must also hold, at the same scope. Transcribed from the
 * platform migrations V22, V32, V33, V34 and V39; the catalogue route that publishes them needs
 * `permission.view`, which most roles lack, so the gates read this copy instead.
 * `e2e/fake-api-roles.spec.ts` pins it against the fake API's catalogue, which mirrors the
 * platform's. A permission migration that adds a mutation adds its pair here. Client-safe, and
 * import-free so e2e specs can import it.
 */
export const PERMISSION_VIEWS: Readonly<Record<string, readonly string[]>> = {
  'tenant.create': ['tenant.view'],
  'tenant.update_draft': ['tenant.view'],
  'tenant.submit_for_approval': ['tenant.view'],
  'tenant.approve': ['tenant.view'],
  'tenant.reject': ['tenant.view'],
  'tenant.activate': ['tenant.view'],
  'tenant.suspend': ['tenant.view'],
  'tenant.reactivate': ['tenant.view'],
  'tenant.deprovision': ['tenant.view'],
  'tenant.bootstrap_retry': ['tenant.view'],
  'branch.create': ['branch.view'],
  'branch.update': ['branch.view'],
  'branch.approve': ['branch.view'],
  'branch.activate': ['branch.view'],
  'branch.suspend': ['branch.view'],
  'branch.reactivate': ['branch.view'],
  'branch.close': ['branch.view'],
  'user.invite': ['membership.view', 'user.view'],
  'user.approve': ['membership.view'],
  'user.activate': ['user.view'],
  'user.suspend': ['user.view'],
  'user.deactivate': ['user.view'],
  'user.update': ['user.view'],
  'user.assign_self': ['user.view'],
  'user.assign_branch': ['branch_assignment.view'],
  'user.revoke_branch': ['branch_assignment.view'],
  'user.assign_role': ['role_assignment.view'],
  'user.revoke_role': ['role_assignment.view'],
  'membership.suspend': ['membership.view'],
  'membership.reactivate': ['membership.view'],
  'membership.revoke': ['membership.view'],
  'membership.update': ['membership.view'],
  'role.create': ['role.view'],
  'role.update': ['role.view'],
  'role.activate': ['role.view'],
  'role.deactivate': ['role.view'],
  'role.archive': ['role.view'],
  'role.assign_permission': ['role.view'],
  'role.remove_permission': ['role.view'],
  'audit.export': ['audit.view'],
  'settings.update': ['settings.view'],
  'business_date.advance': ['business_date.view'],
  'business_date.reopen': ['business_date.view'],
  'cob.start': ['business_date.view'],
  'cob.complete': ['business_date.view'],
  'gl_account.create': ['gl_account.view'],
  'gl_account.update': ['gl_account.view'],
  'gl_account.submit': ['gl_account.view'],
  'gl_account.approve': ['gl_account.view'],
  'gl_account.deactivate': ['gl_account.view'],
  'fiscal_period.open': ['fiscal_period.view'],
  'fiscal_period.close': ['fiscal_period.view'],
  'fiscal_period.reopen': ['fiscal_period.view'],
  'journal.create_manual': ['journal.view'],
  'journal.submit': ['journal.view'],
  'journal.approve': ['journal.view'],
  'journal.reverse': ['journal.view'],
  'journal.post_prior_period': ['journal.view'],
  'posting_rule.create': ['posting_rule.view'],
  'posting_rule.update': ['posting_rule.view'],
  'posting_rule.submit': ['posting_rule.view'],
  'posting_rule.approve': ['posting_rule.view'],
  'reconciliation.run': ['reconciliation.view'],
  'reconciliation.resolve': ['reconciliation.view'],
  'accounting_report.export': ['accounting_report.view'],
};

/** The views `code` needs; none for a view, a context code or an unknown code. */
export function requiredViews(code: string): readonly string[] {
  return PERMISSION_VIEWS[code] ?? [];
}

/** `codes` in order, then each one's views not already listed: what a gate on them must hold. */
export function withViews(codes: readonly string[]): string[] {
  return [...new Set([...codes, ...codes.flatMap(requiredViews)])];
}
