import { randomUUID } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';
import { IDS, type ScenarioName } from '../fake-api/scenarios.mts';

export const FAKE_API_URL = `http://127.0.0.1:${process.env.FAKE_API_PORT ?? '3199'}`;
export const api = (path: string) => `${FAKE_API_URL}/api/v1${path}`;

/** Headers for a fresh run of `scenario`: at one branch, or at institution level (`null`).
 * `organisationId` defaults to Greenfield; pass `IDS.platformOrganisation` for the platform
 * context. A misspelled scenario name is a type error here, not an empty answer from the fake
 * later. */
export async function contextFor(
  request: APIRequestContext,
  scenario: ScenarioName,
  branchId: string | null,
  organisationId: string = IDS.greenfield,
): Promise<Record<string, string>> {
  const bearer = { Authorization: `Bearer e2e.${scenario}.${randomUUID()}` };
  const organisation = await request.post(api('/auth/select-organisation'), {
    headers: bearer,
    data: { organisation_id: organisationId },
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
