import type { Metadata } from 'next';
import Grid from '@mui/material/Grid';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardActions from '@mui/material/CardActions';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import GroupOutlined from '@mui/icons-material/GroupOutlined';
import AccountTreeOutlined from '@mui/icons-material/AccountTreeOutlined';
import SecurityOutlined from '@mui/icons-material/SecurityOutlined';
import MailOutlined from '@mui/icons-material/MailOutlined';
import ShieldOutlined from '@mui/icons-material/ShieldOutlined';
import TuneOutlined from '@mui/icons-material/TuneOutlined';
import NextLink from '@/components/navigation/next-link';
import { SectionHeading } from '@/components/shell/section-heading';
import { administrationModule } from '@/modules/administration/administration-module';

export const metadata: Metadata = { title: 'Overview' };

interface OverviewCardData {
  icon: typeof GroupOutlined;
  title: string;
  value: string;
  actionLabel: string;
  href: string;
}

const OVERVIEW_CARDS: readonly OverviewCardData[] = [
  {
    icon: GroupOutlined,
    title: 'Users',
    value: '128 active',
    actionLabel: 'Manage users',
    href: '/admin/users',
  },
  {
    icon: AccountTreeOutlined,
    title: 'Branches',
    value: '6 branches',
    actionLabel: 'Manage branches',
    href: '/admin/branches',
  },
  {
    icon: SecurityOutlined,
    title: 'Roles',
    value: '5 roles defined',
    actionLabel: 'Review roles',
    href: '/admin/roles',
  },
  {
    icon: MailOutlined,
    title: 'Pending invitations',
    value: '3 pending',
    actionLabel: 'View invitations',
    href: '/admin/users',
  },
  {
    icon: ShieldOutlined,
    title: 'Recent security events',
    value: 'No events in the last 7 days',
    actionLabel: 'Open audit logs',
    href: '/admin/audit',
  },
  {
    icon: TuneOutlined,
    title: 'Configuration status',
    value: 'Core settings configured',
    actionLabel: 'Open settings',
    href: '/admin/settings',
  },
];

export default function AdminOverviewPage() {
  return (
    <>
      <SectionHeading
        parentLabel={administrationModule.name}
        parentHref="/admin"
        label="Overview"
        description={administrationModule.description}
      />
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
        Showing sample data until live services are connected.
      </Typography>
      <Grid container spacing={3}>
        {OVERVIEW_CARDS.map((card) => (
          <Grid key={card.title} size={{ xs: 12, sm: 6, lg: 4 }}>
            <Card variant="outlined" sx={{ height: '100%' }}>
              <CardContent>
                <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 1.5 }}>
                  <card.icon color="action" />
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    {card.title}
                  </Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  {card.value}
                </Typography>
              </CardContent>
              <CardActions>
                <Button component={NextLink} href={card.href} size="small">
                  {card.actionLabel}
                </Button>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>
    </>
  );
}
