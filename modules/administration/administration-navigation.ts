import AccountTreeOutlined from '@mui/icons-material/AccountTreeOutlined';
import EventOutlined from '@mui/icons-material/EventOutlined';
import FactCheckOutlined from '@mui/icons-material/FactCheckOutlined';
import GroupOutlined from '@mui/icons-material/GroupOutlined';
import HomeOutlined from '@mui/icons-material/HomeOutlined';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';
import VerifiedUserOutlined from '@mui/icons-material/VerifiedUserOutlined';
import type { WorkspaceNavigationItem } from '@/components/shell/workspace-navigation';

/**
 * Tenant Administration navigation, in spec §8's order: Overview, Approval queue, Users & access,
 * Branches, Roles & permissions, Settings, Business date, Audit trail. Each stack layer inserts its
 * page at its place when it ships, with `requiresAny` set to the page's read permission.
 */
export const administrationNavigationItems: readonly WorkspaceNavigationItem[] = [
  { href: '/admin', label: 'Overview', icon: HomeOutlined },
  // Spec §8: either decision opens the queue; each tab needs its own codes (layer 12, Ruling 2).
  {
    href: '/admin/approvals',
    label: 'Approval queue',
    icon: FactCheckOutlined,
    requiresAny: ['user.approve', 'branch.activate'],
  },
  {
    href: '/admin/users',
    label: 'Users & access',
    icon: GroupOutlined,
    requiresAny: ['user.view'],
  },
  {
    href: '/admin/branches',
    label: 'Branches',
    icon: AccountTreeOutlined,
    requiresAny: ['branch.view'],
  },
  {
    href: '/admin/roles',
    label: 'Roles & permissions',
    icon: VerifiedUserOutlined,
    requiresAny: ['role.view'],
  },
  {
    href: '/admin/settings',
    label: 'Settings',
    icon: SettingsOutlined,
    requiresAny: ['settings.view'],
  },
  {
    href: '/admin/business-date',
    label: 'Business date',
    icon: EventOutlined,
    requiresAny: ['business_date.view'],
  },
  {
    href: '/admin/audit',
    label: 'Audit trail',
    icon: Inventory2Outlined,
    requiresAny: ['audit.view'],
  },
];
