import type { ElementType } from 'react';
import AdminPanelSettingsOutlined from '@mui/icons-material/AdminPanelSettingsOutlined';
import GroupsOutlined from '@mui/icons-material/GroupsOutlined';
import CalculateOutlined from '@mui/icons-material/CalculateOutlined';
import SavingsOutlined from '@mui/icons-material/SavingsOutlined';
import PaymentsOutlined from '@mui/icons-material/PaymentsOutlined';
import AccountBalanceOutlined from '@mui/icons-material/AccountBalanceOutlined';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import Diversity3Outlined from '@mui/icons-material/Diversity3Outlined';
import QueryStatsOutlined from '@mui/icons-material/QueryStatsOutlined';

export interface ApplicationModule {
  id: string;
  label: string;
  description: string;
  href?: string;
  icon: ElementType;
  enabled: boolean;
}

export const APPLICATION_MODULES: readonly ApplicationModule[] = [
  {
    id: 'administration',
    label: 'Administration',
    description: 'Users, branches, roles, settings, and audit logs.',
    href: '/admin',
    icon: AdminPanelSettingsOutlined,
    enabled: true,
  },
  {
    id: 'membership',
    label: 'Membership',
    description: 'Coming later.',
    icon: GroupsOutlined,
    enabled: false,
  },
  {
    id: 'accounting-finance',
    label: 'Accounting & Finance',
    description: 'Coming later.',
    icon: CalculateOutlined,
    enabled: false,
  },
  {
    id: 'savings-shares',
    label: 'Savings & Shares',
    description: 'Coming later.',
    icon: SavingsOutlined,
    enabled: false,
  },
  {
    id: 'loans-credit',
    label: 'Loans & Credit',
    description: 'Coming later.',
    icon: PaymentsOutlined,
    enabled: false,
  },
  {
    id: 'payments-treasury',
    label: 'Payments & Treasury',
    description: 'Coming later.',
    icon: AccountBalanceOutlined,
    enabled: false,
  },
  {
    id: 'procurement',
    label: 'Procurement',
    description: 'Coming later.',
    icon: Inventory2Outlined,
    enabled: false,
  },
  {
    id: 'assets',
    label: 'Assets',
    description: 'Coming later.',
    icon: Inventory2Outlined,
    enabled: false,
  },
  {
    id: 'hr-payroll',
    label: 'HR & Payroll',
    description: 'Coming later.',
    icon: Diversity3Outlined,
    enabled: false,
  },
  {
    id: 'reports-analytics',
    label: 'Reports & Analytics',
    description: 'Coming later.',
    icon: QueryStatsOutlined,
    enabled: false,
  },
] as const;
