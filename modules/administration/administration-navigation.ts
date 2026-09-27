import HomeOutlined from '@mui/icons-material/HomeOutlined';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import type { WorkspaceNavigationItem } from '@/components/shell/workspace-navigation';

/**
 * Tenant Administration navigation. Each stack layer appends its page here when it ships
 * (Approval queue, Users & access, Branches, Roles & permissions, Settings, Business date,
 * Audit trail — spec §8), with `requiresAny` set to the page's read permission.
 */
export const administrationNavigationItems: readonly WorkspaceNavigationItem[] = [
  { href: '/admin', label: 'Overview', icon: HomeOutlined },
  {
    href: '/admin/audit',
    label: 'Audit trail',
    icon: Inventory2Outlined,
    requiresAny: ['audit.view'],
  },
];
