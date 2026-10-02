import AccountTreeOutlined from '@mui/icons-material/AccountTreeOutlined';
import EventOutlined from '@mui/icons-material/EventOutlined';
import HomeOutlined from '@mui/icons-material/HomeOutlined';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';
import type { WorkspaceNavigationItem } from '@/components/shell/workspace-navigation';

/**
 * Tenant Administration navigation. Each stack layer appends its page here when it ships
 * (Approval queue, Users & access, Branches, Roles & permissions, Settings, Business date,
 * Audit trail — spec §8), with `requiresAny` set to the page's read permission.
 */
export const administrationNavigationItems: readonly WorkspaceNavigationItem[] = [
  { href: '/admin', label: 'Overview', icon: HomeOutlined },
  {
    href: '/admin/branches',
    label: 'Branches',
    icon: AccountTreeOutlined,
    requiresAny: ['branch.view'],
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
