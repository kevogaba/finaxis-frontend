/** Unsigned stand-in for the backend's signed context token (contract §A "Context"). */
export interface ContextClaims {
  userId: string;
  organisationId: string;
  membershipId: string;
  branchId: string | null;
}

const PREFIX = 'fake-ctx.';

export function encodeContext(claims: ContextClaims): string {
  return `${PREFIX}${Buffer.from(JSON.stringify(claims)).toString('base64url')}`;
}

export function decodeContext(token: string | undefined): ContextClaims | null {
  if (!token?.startsWith(PREFIX)) {
    return null;
  }
  try {
    const value = JSON.parse(
      Buffer.from(token.slice(PREFIX.length), 'base64url').toString('utf8'),
    ) as unknown;
    if (
      typeof value === 'object' &&
      value !== null &&
      'userId' in value &&
      typeof value.userId === 'string' &&
      'organisationId' in value &&
      typeof value.organisationId === 'string' &&
      'membershipId' in value &&
      typeof value.membershipId === 'string' &&
      'branchId' in value &&
      (typeof value.branchId === 'string' || value.branchId === null)
    ) {
      return {
        userId: value.userId,
        organisationId: value.organisationId,
        membershipId: value.membershipId,
        branchId: value.branchId,
      };
    }
    return null;
  } catch {
    return null;
  }
}
