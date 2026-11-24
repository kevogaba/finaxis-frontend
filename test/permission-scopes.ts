/** `/auth/me`'s `permission_scopes` for `codes` (BG-33): each held tenant-wide, unless `branchOnly`
 * names it, then only at one branch. */
export function permissionScopes(codes: readonly string[], branchOnly: readonly string[] = []) {
  return codes.map((code) =>
    branchOnly.includes(code)
      ? { code, scope: 'BRANCH' as const, branch_ids: ['b-1'] }
      : { code, scope: 'TENANT' as const },
  );
}
