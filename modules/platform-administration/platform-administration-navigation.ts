import AccountTreeOutlined from '@mui/icons-material/AccountTreeOutlined';
import DashboardOutlined from '@mui/icons-material/DashboardOutlined';
import type { WorkspaceNavigationItem } from '@/components/shell/workspace-navigation';

export const platformAdministrationNavigationItems: readonly WorkspaceNavigationItem[] = [
  { href: '/platform-admin', label: 'Overview', icon: DashboardOutlined },
  { href: '/platform-admin/tenants', label: 'Tenants', icon: AccountTreeOutlined },
] as const;
