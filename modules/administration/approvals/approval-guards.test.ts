import { describe, expect, it, vi } from 'vitest';
import { BackendApiError } from '@/auth/backend-api';
import { APPROVAL_CHANGED_CODE } from './approval-copy';

vi.mock('@/auth/context-service', () => ({ getCurrentContextProfile: vi.fn() }));
vi.mock('./approval-service', () => ({ getMakerEvent: vi.fn() }));

const { isSessionLost, postFromEndState } = await import('./approval-guards');

describe('isSessionLost', () => {
  it.each([
    ['a 401', new BackendApiError(401), true],
    ['a stale context', new BackendApiError(403, { code: 'invalid_active_tenant_context' }), true],
    ['a 403 from the permission check', new BackendApiError(403, { code: 'forbidden' }), false],
    ['a 500', new BackendApiError(500, { requestId: 'req-x' }), false],
    ['a plain Error', new Error('network down'), false],
  ])('recognises %s', (_case, error, lost) => {
    expect(isSessionLost(error)).toBe(lost);
  });
});

describe('postFromEndState', () => {
  it('passes the value through, from an end state or not', async () => {
    await expect(postFromEndState(true, () => Promise.resolve('echo'))).resolves.toBe('echo');
    await expect(postFromEndState(false, () => Promise.resolve('echo'))).resolves.toBe('echo');
  });

  it('rethrows every error unchanged when the state is not an end state', async () => {
    const error = new BackendApiError(500, { requestId: 'req-x' });
    await expect(postFromEndState(false, () => Promise.reject(error))).rejects.toBe(error);
  });

  it.each([
    ['a 500', new BackendApiError(500, { requestId: 'req-x' })],
    ['a 409', new BackendApiError(409, { code: 'conflict', requestId: 'req-y' })],
  ])('reads %s from an end state as the approval having changed', async (_case, error) => {
    await expect(postFromEndState(true, () => Promise.reject(error))).rejects.toMatchObject({
      status: 409,
      code: APPROVAL_CHANGED_CODE,
    });
  });

  it.each([
    ['a 403', new BackendApiError(403, { code: 'forbidden' })],
    [
      'a 403 with another code',
      new BackendApiError(403, { code: 'Active tenant context is required for this route.' }),
    ],
    ['a 401', new BackendApiError(401)],
    ['a stale context', new BackendApiError(403, { code: 'invalid_active_tenant_context' })],
    ['a plain Error', new Error('network down')],
  ])('rethrows %s from an end state unchanged', async (_case, error) => {
    await expect(postFromEndState(true, () => Promise.reject(error))).rejects.toBe(error);
  });
});
