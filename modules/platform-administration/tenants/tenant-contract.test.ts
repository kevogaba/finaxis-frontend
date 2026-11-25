import { describe, expect, it } from 'vitest';
import { tenantDetailSchema, tenantDraftResultSchema, tenantPageSchema } from './tenant-contract';

const ACME = '99999999-9999-4999-8999-999999999999';
const JANE = '55555555-5555-4555-8555-555555555555';
const OTHER = '16000000-0000-4000-8000-000000000007';
const PAGE = {
  number: 0,
  size: 10,
  total_items: 1,
  total_pages: 1,
  has_next: false,
  has_previous: false,
};
const DETAIL = {
  id: ACME,
  tenant_code: 'acme',
  display_name: 'Acme SACCO',
  legal_name: null,
  registration_number: null,
  country_code: 'KE',
  base_currency_code: 'KES',
  timezone: 'Africa/Nairobi',
  status: 'ACTIVE',
  status_reason: null,
  bootstrap_status: 'FAILED',
  bootstrap_failure_code: 'KEYCLOAK_UNAVAILABLE',
  created_at: '2026-07-01T08:00:00Z',
  updated_at: '2026-07-24T08:00:00Z',
  admin: null,
  requested_by: { id: OTHER, display_name: null },
  submitted_by: { id: JANE, display_name: 'Backend Jane Manager' },
};

describe('tenant contract', () => {
  it('maps a summary page to camelCase and ignores unknown fields', () => {
    expect(
      tenantPageSchema.parse({
        items: [
          {
            id: ACME,
            tenant_code: 'acme',
            display_name: 'Acme SACCO',
            country_code: 'KE',
            status: 'ACTIVE',
            created_at: '2026-07-01T08:00:00Z',
            legal_name: 'never read',
            requested_by: { id: JANE, display_name: 'Backend Jane Manager' },
            submitted_by: null,
          },
        ],
        page: PAGE,
      }),
    ).toEqual({
      items: [
        {
          id: ACME,
          tenantCode: 'acme',
          displayName: 'Acme SACCO',
          countryCode: 'KE',
          status: 'ACTIVE',
          createdAt: '2026-07-01T08:00:00Z',
          requestedBy: { id: JANE, displayName: 'Backend Jane Manager' },
          submittedBy: null,
        },
      ],
      page: {
        number: 0,
        size: 10,
        totalItems: 1,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false,
      },
    });
  });

  it('maps a detail and keeps a null bootstrap (the platform organisation, SQL-seeded tenants)', () => {
    expect(tenantDetailSchema.parse(DETAIL)).toEqual({
      id: ACME,
      tenantCode: 'acme',
      displayName: 'Acme SACCO',
      legalName: null,
      registrationNumber: null,
      countryCode: 'KE',
      baseCurrencyCode: 'KES',
      timezone: 'Africa/Nairobi',
      status: 'ACTIVE',
      statusReason: null,
      bootstrapStatus: 'FAILED',
      bootstrapFailureCode: 'KEYCLOAK_UNAVAILABLE',
      createdAt: '2026-07-01T08:00:00Z',
      updatedAt: '2026-07-24T08:00:00Z',
      admin: null,
      requestedBy: { id: OTHER, displayName: null },
      submittedBy: { id: JANE, displayName: 'Backend Jane Manager' },
    });
    expect(
      tenantDetailSchema.parse({ ...DETAIL, bootstrap_status: null, bootstrap_failure_code: null }),
    ).toMatchObject({ bootstrapStatus: null, bootstrapFailureCode: null });
  });

  // BG-14: a returned draft, as a holder of tenant.update_draft reads it.
  it('maps the legal identity, the status reason and the drafted first administrator', () => {
    expect(
      tenantDetailSchema.parse({
        ...DETAIL,
        status: 'DRAFT',
        legal_name: 'Acme Savings and Credit Co-operative Society Ltd',
        registration_number: 'CS/2019/0042',
        status_reason: 'Attach the registration certificate.',
        admin: {
          email: 'amina@acme.example',
          username: 'amina.otieno',
          display_name: 'Amina Otieno',
          phone_e164: null,
          send_application_invite: true,
        },
      }),
    ).toMatchObject({
      legalName: 'Acme Savings and Credit Co-operative Society Ltd',
      registrationNumber: 'CS/2019/0042',
      statusReason: 'Attach the registration certificate.',
      admin: {
        email: 'amina@acme.example',
        username: 'amina.otieno',
        displayName: 'Amina Otieno',
        phoneE164: null,
        sendApplicationInvite: true,
      },
    });
  });

  it('requires the BG-14 fields, which the platform always sends (drift → the error state)', () => {
    for (const key of ['legal_name', 'registration_number', 'status_reason', 'admin'] as const) {
      const { [key]: _dropped, ...missing } = DETAIL;
      expect(tenantDetailSchema.safeParse(missing).success, key).toBe(false);
    }
    expect(
      tenantDetailSchema.safeParse({
        ...DETAIL,
        admin: { email: 'amina@acme.example', username: 'amina.otieno', display_name: 'Amina' },
      }).success,
    ).toBe(false);
  });

  it('keeps null makers: never submitted, or a tenant caller (BG-08)', () => {
    expect(
      tenantDetailSchema.parse({ ...DETAIL, requested_by: null, submitted_by: null }),
    ).toMatchObject({ requestedBy: null, submittedBy: null });
    expect(tenantDetailSchema.safeParse({ ...DETAIL, requested_by: undefined }).success).toBe(
      false,
    );
  });

  it('rejects an unknown state, a missing field or a date-only instant (drift → the error state)', () => {
    expect(tenantDetailSchema.safeParse({ ...DETAIL, status: 'PAUSED' }).success).toBe(false);
    expect(tenantDetailSchema.safeParse({ ...DETAIL, bootstrap_status: 'RETRYING' }).success).toBe(
      false,
    );
    const { timezone: _timezone, ...missing } = DETAIL;
    expect(tenantDetailSchema.safeParse(missing).success).toBe(false);
    expect(tenantDetailSchema.safeParse({ ...DETAIL, created_at: '2026-07-01' }).success).toBe(
      false,
    );
  });

  it('reads only the new id from a draft result, whatever its status echo says', () => {
    expect(tenantDraftResultSchema.parse({ organisation_id: ACME, status: 'DRAFT' })).toEqual({
      tenantId: ACME,
    });
  });
});
