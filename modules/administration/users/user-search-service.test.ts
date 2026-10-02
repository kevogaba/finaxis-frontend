import { describe, expect, it, vi } from 'vitest';
import type { ZodType } from 'zod';

const WIRE = {
  items: [
    {
      id: '08000000-0000-4000-8000-000000000002',
      username: 'peter.otieno',
      email: 'peter.otieno@greenfield.example',
      display_name: 'Peter Otieno',
      user_status: 'ACTIVE',
      membership_status: 'ACTIVE',
    },
  ],
  page: {
    number: 0,
    size: 10,
    total_items: 1,
    total_pages: 1,
    has_next: false,
    has_previous: false,
  },
};

const apiGet = vi.fn((_path: string, schema: ZodType) => Promise.resolve(schema.parse(WIRE)));
vi.mock('@/lib/api/tenant-api', () => ({
  apiGet: (...args: Parameters<typeof apiGet>) => apiGet(...args),
}));

const { searchTenantUsers } = await import('./user-search-service');

describe('searchTenantUsers', () => {
  it('asks for the first 10 matches and maps them to camelCase options', async () => {
    expect(await searchTenantUsers('pet')).toEqual([
      {
        id: '08000000-0000-4000-8000-000000000002',
        displayName: 'Peter Otieno',
        email: 'peter.otieno@greenfield.example',
        username: 'peter.otieno',
        membershipStatus: 'ACTIVE',
      },
    ]);
    expect(apiGet).toHaveBeenLastCalledWith(
      '/api/v1/tenant/users?q=pet&size=10',
      expect.anything(),
    );
  });

  it('drops an empty query instead of sending q=', async () => {
    await searchTenantUsers('');
    expect(apiGet).toHaveBeenLastCalledWith('/api/v1/tenant/users?size=10', expect.anything());
  });
});
