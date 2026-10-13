import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ZodType } from 'zod';
import { BackendApiError } from '@/auth/backend-api';
import { userPageSchema } from './user-contract';

const { apiGet } = vi.hoisted(() => ({
  apiGet: vi.fn<(path: string, schema: ZodType) => Promise<unknown>>(),
}));
vi.mock('@/lib/api/tenant-api', () => ({
  apiGet: (path: string, schema: ZodType) => apiGet(path, schema),
}));

const { findMemberByEmail, findMemberByUsername } = await import('./invite-service');

const ANN = '10000000-0000-4000-8000-00000000000a';
const JOANN = '10000000-0000-4000-8000-00000000000b';

const userWire = (
  id: string,
  email: string,
  membershipStatus = 'ACTIVE',
  username = email.split('@')[0],
) => ({
  id,
  username,
  email,
  display_name: 'Someone',
  user_status: 'ACTIVE',
  membership_status: membershipStatus,
});

/** One backend page, run through the schema the service handed `apiGet` (so a wire drift fails). */
const page = (items: readonly unknown[], hasNext: boolean) => (_path: string, schema: ZodType) =>
  Promise.resolve(
    schema.parse({
      items,
      page: {
        number: 0,
        size: 100,
        total_items: items.length,
        total_pages: 1,
        has_next: hasNext,
        has_previous: false,
      },
    }),
  );

describe('findMemberByEmail', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('searches the user directory by the trimmed email, 100 at a time, with its schema', async () => {
    apiGet.mockImplementationOnce(page([], false));
    expect(await findMemberByEmail(' ann.mwangi@greenfield.example ')).toBeNull();
    expect(apiGet).toHaveBeenCalledTimes(1);
    expect(apiGet).toHaveBeenCalledWith(
      '/api/v1/tenant/users?q=ann.mwangi%40greenfield.example&page=0&size=100',
      userPageSchema,
    );
  });

  it('matches the email exactly, without letter case, never the first hit', async () => {
    // q=ann.mwangi@… also matches joann.mwangi@… (a substring), and Joann comes first.
    apiGet.mockImplementationOnce(
      page(
        [
          userWire(JOANN, 'joann.mwangi@greenfield.example'),
          userWire(ANN, 'Ann.Mwangi@Greenfield.example', 'REVOKED'),
        ],
        false,
      ),
    );
    expect(await findMemberByEmail('ann.mwangi@greenfield.example')).toMatchObject({
      id: ANN,
      membershipStatus: 'REVOKED',
    });
  });

  it('pages on while there are more matches, and stops at the first exact one', async () => {
    apiGet
      .mockImplementationOnce(page([userWire(JOANN, 'joann.mwangi@greenfield.example')], true))
      .mockImplementationOnce(page([userWire(ANN, 'ann.mwangi@greenfield.example')], true));
    expect(await findMemberByEmail('ann.mwangi@greenfield.example')).toMatchObject({ id: ANN });
    expect(apiGet).toHaveBeenCalledTimes(2);
    expect(apiGet.mock.calls[1]?.[0]).toContain('page=1');
  });

  it('gives up after 5 pages of 100 (the ceiling) without a match', async () => {
    apiGet.mockImplementation(page([userWire(JOANN, 'joann.mwangi@greenfield.example')], true));
    expect(await findMemberByEmail('ann.mwangi@greenfield.example')).toBeNull();
    expect(apiGet).toHaveBeenCalledTimes(5);
  });

  it('reads nothing for a blank email', async () => {
    expect(await findMemberByEmail('   ')).toBeNull();
    expect(apiGet).not.toHaveBeenCalled();
  });

  it('rejects with the read’s own error, so the caller decides what it means (L1)', async () => {
    const lost = new BackendApiError(401);
    apiGet.mockRejectedValueOnce(lost);
    await expect(findMemberByEmail('ann.mwangi@greenfield.example')).rejects.toBe(lost);
  });
});

describe('findMemberByUsername (Ruling 15)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('searches by the trimmed username and matches it exactly, without letter case', async () => {
    // q=esther also matches esther.njoki (a substring), and she comes first.
    apiGet.mockImplementationOnce(
      page(
        [
          userWire(JOANN, 'esther.njoki@greenfield.example'),
          userWire(ANN, 'e.wanjiru@greenfield.example', 'SUSPENDED', 'Esther'),
        ],
        false,
      ),
    );
    expect(await findMemberByUsername(' esther ')).toMatchObject({ id: ANN });
    expect(apiGet).toHaveBeenCalledWith(
      '/api/v1/tenant/users?q=esther&page=0&size=100',
      userPageSchema,
    );
  });

  it('answers null without an exact match, and reads nothing for a blank username', async () => {
    apiGet.mockImplementationOnce(
      page([userWire(JOANN, 'esther.njoki@greenfield.example')], false),
    );
    expect(await findMemberByUsername('esther')).toBeNull();
    expect(await findMemberByUsername('   ')).toBeNull();
    expect(apiGet).toHaveBeenCalledTimes(1);
  });

  it('rejects with the read’s own error (L1)', async () => {
    const refused = new BackendApiError(403);
    apiGet.mockRejectedValueOnce(refused);
    await expect(findMemberByUsername('esther')).rejects.toBe(refused);
  });
});
