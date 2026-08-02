import { describe, expect, it } from 'vitest';
import {
  mapAuditDetail,
  mapAuditPage,
  mapBranch,
  mapBranchPage,
  mapTenantDetail,
  mapTenantPage,
  mapTenantUser,
  mapTenantUserPage,
} from './platform-administration-mappers';

describe('platform administration response mappers', () => {
  it('maps snake_case page metadata and tenant fields to camelCase DTOs', () => {
    expect(
      mapTenantPage({
        items: [
          {
            id: 'tenant-id',
            tenant_code: 'acme',
            display_name: 'Acme',
            country_code: 'KE',
            status: 'ACTIVE',
            bootstrap_status: null,
          },
        ],
        page: {
          number: 0,
          size: 25,
          total_items: 1,
          total_pages: 1,
          has_next: false,
          has_previous: false,
        },
      }),
    ).toEqual({
      items: [
        {
          id: 'tenant-id',
          tenantCode: 'acme',
          displayName: 'Acme',
          countryCode: 'KE',
          baseCurrencyCode: undefined,
          timezone: undefined,
          status: 'ACTIVE',
          bootstrapStatus: null,
          createdAt: undefined,
          updatedAt: undefined,
        },
      ],
      page: {
        number: 0,
        size: 25,
        totalItems: 1,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false,
      },
    });
  });

  it('maps audit detail sensitive fields without changing their string contents', () => {
    expect(
      mapAuditDetail({
        id: 'event-id',
        organisation_id: 'org-id',
        occurred_at: '2026-07-26T00:00:00Z',
        actor_user_id: null,
        actor_type: 'SYSTEM',
        event_type: 'TENANT_UPDATED',
        entity_type: 'TENANT',
        entity_id: null,
        action: 'UPDATE',
        outcome: 'SUCCESS',
        severity: 'INFO',
        actor_external_subject: null,
        branch_id: null,
        ip_address: null,
        user_agent: null,
        correlation_id: 'correlation',
        request_id: 'request',
        before_json: '{"status":"DRAFT"}',
        after_json: '{"status":"ACTIVE"}',
        metadata_json: '{}',
        reason: null,
      }),
    ).toMatchObject({
      organisationId: 'org-id',
      correlationId: 'correlation',
      beforeJson: '{"status":"DRAFT"}',
      afterJson: '{"status":"ACTIVE"}',
    });
  });

  it('covers each resource mapper used by the read service', () => {
    const user = {
      id: 'user-id',
      username: 'user',
      email: 'user@example.test',
      display_name: 'User',
      user_status: 'ACTIVE',
      membership_status: 'ACTIVE',
    };
    const branch = {
      id: 'branch-id',
      organisation_id: 'org-id',
      branch_code: 'HQ',
      branch_name: 'Head Office',
      branch_type: 'HEAD_OFFICE',
      parent_branch_id: null,
      status: 'ACTIVE',
      timezone: 'Africa/Nairobi',
      address: {},
      opened_on: null,
      closed_on: null,
      status_reason: null,
      created_at: '2026-07-26T00:00:00Z',
      updated_at: '2026-07-26T00:00:00Z',
    };
    const audit = {
      id: 'event-id',
      organisation_id: 'org-id',
      occurred_at: '2026-07-26T00:00:00Z',
      actor_user_id: null,
      actor_type: 'SYSTEM',
      event_type: 'READ',
      entity_type: 'TENANT',
      entity_id: null,
      action: 'READ',
      outcome: 'SUCCESS',
      severity: 'INFO',
    };

    expect(
      mapTenantDetail({
        id: 'tenant-id',
        tenant_code: 'acme',
        display_name: 'Acme',
        country_code: 'KE',
        status: 'ACTIVE',
        bootstrap_failure_code: null,
      }).bootstrapFailureCode,
    ).toBeNull();
    expect(mapTenantUser(user).displayName).toBe('User');
    expect(
      mapTenantUserPage({
        items: [user],
        page: {
          number: 0,
          size: 25,
          total_items: 1,
          total_pages: 1,
          has_next: false,
          has_previous: false,
        },
      }).items,
    ).toHaveLength(1);
    expect(mapBranch(branch).branchName).toBe('Head Office');
    expect(
      mapBranchPage({
        items: [branch],
        page: {
          number: 0,
          size: 25,
          total_items: 1,
          total_pages: 1,
          has_next: false,
          has_previous: false,
        },
      }).items,
    ).toHaveLength(1);
    expect(
      mapAuditPage({
        items: [audit],
        page: {
          number: 0,
          size: 25,
          total_items: 1,
          total_pages: 1,
          has_next: false,
          has_previous: false,
        },
      }).items,
    ).toHaveLength(1);
  });
});
