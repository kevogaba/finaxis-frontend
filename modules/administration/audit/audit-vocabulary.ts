// Task 4 appends actions and label helpers; this task only needs the entity list for query
// validation (parseAuditQuery drops any entityType outside this set).
export const AUDIT_ENTITY_TYPES = [
  { value: 'USER', label: 'User' },
  { value: 'USER_ACCOUNT', label: 'User account' },
  { value: 'MEMBERSHIP', label: 'Membership' },
  { value: 'USER_ROLE_ASSIGNMENT', label: 'Role assignment' },
  { value: 'USER_BRANCH_ASSIGNMENT', label: 'Branch assignment' },
  { value: 'ROLE', label: 'Role' },
  { value: 'BRANCH', label: 'Branch' },
  { value: 'ORGANISATION', label: 'Organisation' },
  { value: 'ORGANISATION_SETTING', label: 'Setting' },
  { value: 'BUSINESS_DATE', label: 'Business date' },
] as const;
