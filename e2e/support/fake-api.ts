import { randomUUID } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';
import { IDS } from '../fake-api/scenarios.mts';

export const FAKE_API_URL = `http://127.0.0.1:${process.env.FAKE_API_PORT ?? '3199'}`;
export const api = (path: string) => `${FAKE_API_URL}/api/v1${path}`;

/** Headers for a fresh run: at one branch, or at institution level (`null`). */
export async function contextFor(
  request: APIRequestContext,
  scenario: string,
  branchId: string | null,
): Promise<Record<string, string>> {
  const bearer = { Authorization: `Bearer e2e.${scenario}.${randomUUID()}` };
  const organisation = await request.post(api('/auth/select-organisation'), {
    headers: bearer,
    data: { organisation_id: IDS.greenfield },
  });
  const { context_token: institution } = (await organisation.json()) as { context_token: string };
  if (branchId === null) return { ...bearer, 'X-Active-Organisation-Context': institution };
  const branch = await request.post(api('/auth/select-branch'), {
    headers: { ...bearer, 'X-Active-Organisation-Context': institution },
    data: { branch_id: branchId },
  });
  const { context_token: pinned } = (await branch.json()) as { context_token: string };
  return { ...bearer, 'X-Active-Organisation-Context': pinned };
}
