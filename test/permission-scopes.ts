/** `/auth/me`'s `permission_scopes` for `codes` (BG-33): each held tenant-wide, unless `branchOnly`
 * names it, then only at `branchIds` (one branch by default). */
export function permissionScopes(
  codes: readonly string[],
  branchOnly: readonly string[] = [],
  branchIds: readonly string[] = ['b-1'],
) {
  return codes.map((code) =>
    branchOnly.includes(code)
      ? { code, scope: 'BRANCH' as const, branch_ids: [...branchIds] }
      : { code, scope: 'TENANT' as const },
  );
}
