import DashboardOutlined from '@mui/icons-material/DashboardOutlined';
import GroupOutlined from '@mui/icons-material/GroupOutlined';
import AccountTreeOutlined from '@mui/icons-material/AccountTreeOutlined';
import SecurityOutlined from '@mui/icons-material/SecurityOutlined';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';
import FactCheckOutlined from '@mui/icons-material/FactCheckOutlined';
import type { WorkspaceNavigationItem } from '@/components/shell/workspace-navigation';

export const administrationNavigationItems: readonly WorkspaceNavigationItem[] = [
  { href: '/admin', label: 'Overview', icon: DashboardOutlined },
  { href: '/admin/users', label: 'Users', icon: GroupOutlined },
  { href: '/admin/branches', label: 'Branches', icon: AccountTreeOutlined },
  { href: '/admin/roles', label: 'Roles & Permissions', icon: SecurityOutlined },
  { href: '/admin/settings', label: 'Settings', icon: SettingsOutlined },
  { href: '/admin/audit', label: 'Audit Logs', icon: FactCheckOutlined },
] as const;
