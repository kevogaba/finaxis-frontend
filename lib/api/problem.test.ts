import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { BackendApiError } from '@/auth/backend-api';
import { describeProblem } from './problem';

describe('describeProblem', () => {
  it.each([
    [403, 'Access denied'],
    [404, 'Not found'],
    [409, 'This changed'],
    [422, 'Check the details'],
    [429, 'Too many requests'],
    [500, 'Something went wrong'],
    [502, 'Something went wrong'],
  ])('maps HTTP %i to a safe title', (status, title) => {
    // 500/502 with no requestId now log a generated support reference (below) — quiet it here so
    // this table stays about title mapping only.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(describeProblem(new BackendApiError(status)).title).toBe(title);
    consoleError.mockRestore();
  });

  it('keeps the backend request id as a support reference', () => {
    const view = describeProblem(
      new BackendApiError(500, { requestId: 'req-9', code: 'internal_error' }),
    );
    expect(view).toMatchObject({ requestId: 'req-9', code: 'internal_error' });
  });

  it('mints and logs a support reference for a 5xx with no backend request id', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const view = describeProblem(new BackendApiError(502));

    expect(view).toMatchObject({ title: 'Something went wrong', requestId: expect.any(String) });
    expect(view.requestId).not.toBeNull();
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining(String(view.requestId)));
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('502'));

    consoleError.mockRestore();
  });

  it('does not mint a reference for a 4xx with no backend request id', () => {
    expect(describeProblem(new BackendApiError(404)).requestId).toBeNull();
  });

  it('explains a response that no longer matches the contract (schema drift) with a support reference, logging only paths and codes', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const result = z
      .object({ id: z.string(), secret: z.string() })
      .safeParse({ id: 42, secret: 'super-secret-token' });
    if (result.success) throw new Error('expected a parse failure');

    expect(describeProblem(result.error)).toMatchObject({
      title: 'Something went wrong',
      message: expect.stringMatching(/couldn.t read/i),
      requestId: expect.any(String),
    });
    expect(consoleError).toHaveBeenCalled();
    // Pins the "never the values" half of the rule: the logged payload names the failing path and
    // zod issue code only. `id`'s bad value (42) and the sibling `secret` never appear in it.
    const logged = consoleError.mock.calls[0]?.[1];
    expect(JSON.stringify(logged)).not.toContain('super-secret-token');
    expect(JSON.stringify(logged)).not.toContain('42');
    expect(logged).toEqual([{ path: ['id'], code: expect.any(String) }]);

    consoleError.mockRestore();
  });

  describe('code-specific problems', () => {
    it.each([
      ['lifecycle.business_date_lock_timeout', 'Busy — try again'],
      ['IDEMPOTENCY_KEY_REUSED', 'Already submitted'],
      ['IDEMPOTENCY_REQUEST_IN_PROGRESS', 'Still processing'],
    ])('gives %s its own message', (code, title) => {
      expect(describeProblem(new BackendApiError(409, { code })).title).toBe(title);
    });

    // The platform's named refusals (BG-08 item 3, BG-30, BG-35): each explained by its code,
    // never by the backend's detail, and the request id kept as the support reference.
    it.each([
      [
        403,
        'lifecycle.approver_is_membership_maker',
        'Someone else must approve',
        'You invited this person, so someone else must approve them.',
      ],
      [
        403,
        'lifecycle.approver_is_membership_beneficiary',
        'Someone else must decide',
        "You can't approve your own membership.",
      ],
      [
        403,
        'lifecycle.approver_is_branch_maker',
        'Someone else must decide',
        'You drafted or submitted this branch, so someone else must activate it.',
      ],
      [
        403,
        'lifecycle.approver_is_branch_modifier',
        'Someone else must decide',
        'You edited this branch, so someone else must activate it.',
      ],
      [
        403,
        'lifecycle.approver_is_tenant_maker',
        'Someone else must decide',
        'You requested or submitted this institution, so another platform administrator must decide it.',
      ],
      [
        403,
        'lifecycle.approver_is_tenant_modifier',
        'Someone else must decide',
        'You amended this draft, so another platform administrator must decide it.',
      ],
      [
        403,
        'lifecycle.approver_is_initial_administrator',
        'Someone else must decide',
        "You're named as this institution's first administrator, so you can't approve it.",
      ],
      [
        409,
        'lifecycle.platform_checker_closed',
        'Someone else must decide',
        'This institution now has its own approvers. The platform can no longer approve here.',
      ],
      [
        403,
        'lifecycle.self_membership_change',
        'Not allowed on your own access',
        "You can't suspend or revoke your own membership.",
      ],
      [
        403,
        'lifecycle.self_account_change',
        'Not allowed on your own access',
        "You can't suspend or deactivate your own account.",
      ],
      [
        403,
        'platform_context_required',
        'Wrong workspace',
        'This page belongs to the platform workspace. Switch workspace to open it.',
      ],
      [
        403,
        'tenant_context_required',
        'Wrong workspace',
        'This page belongs to an institution workspace. Switch workspace to open it.',
      ],
      // BG-11: Resend invitation's two refusals.
      [
        409,
        'lifecycle.invitation_resend_too_soon',
        'Too soon to resend',
        'Their account was set up, or an invitation sent, moments ago. Try again in a few minutes.',
      ],
      [
        409,
        'lifecycle.invitation_resend_not_applicable',
        'Nothing to resend',
        "There's no invitation to resend for this person. Refresh to see where they stand.",
      ],
    ])('explains %i %s by its code', (status, code, title, message) => {
      expect(describeProblem(new BackendApiError(status, { code, requestId: 'req-5' }))).toEqual({
        title,
        message,
        code,
        requestId: 'req-5',
      });
    });
  });

  it('never exposes an arbitrary error message, and still mints a support reference and logs it', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const view = describeProblem(new Error('secret stack detail'));

    expect(view.message).not.toContain('secret');
    expect(view.requestId).toEqual(expect.any(String));
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining(String(view.requestId)),
      expect.anything(),
    );

    consoleError.mockRestore();
  });
});
