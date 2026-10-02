import DomainOutlined from '@mui/icons-material/DomainOutlined';
import HomeOutlined from '@mui/icons-material/HomeOutlined';
import type { WorkspaceNavigationItem } from '@/components/shell/workspace-navigation';

export const platformAdministrationNavigationItems: readonly WorkspaceNavigationItem[] = [
  { href: '/platform-admin', label: 'Overview', icon: HomeOutlined },
  {
    href: '/platform-admin/tenants',
    label: 'SACCO institutions',
    icon: DomainOutlined,
    requiresAny: ['tenant.view'],
  },
];
