import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Avatar from '@mui/material/Avatar';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import ExpandMoreOutlined from '@mui/icons-material/ExpandMoreOutlined';
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import { SectionHeading } from '@/components/shell/section-heading';
import { initialsOf } from '@/components/shell/initials';
import type { FinaxisUser } from '@/auth/auth.types';

interface ProfileViewProps {
  user: FinaxisUser;
  signedInAt: Date;
}

export function ProfileView({ user, signedInAt }: ProfileViewProps) {
  return (
    <>
      <SectionHeading
        parentLabel="Finaxis"
        parentHref="/admin"
        label="Profile"
        description="Your signed-in identity and workspace assignments."
      />
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
            <Avatar
              src={user.image}
              sx={{ width: 80, height: 80, mx: 'auto', mb: 2, fontSize: 28 }}
            >
              {!user.image && initialsOf(user.name)}
            </Avatar>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {user.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {user.email}
            </Typography>
            {user.username && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: 'block', mt: 0.5 }}
              >
                @{user.username}
              </Typography>
            )}
            <Stack direction="row" spacing={1} sx={{ justifyContent: 'center', mt: 2 }}>
              <Chip
                icon={<CheckCircleOutlined />}
                label="Signed in"
                color="success"
                size="small"
                variant="outlined"
              />
              <Chip label="Keycloak" size="small" variant="outlined" />
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
              Last authenticated {signedInAt.toLocaleString()}
            </Typography>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 8 }}>
          <Stack spacing={3}>
            <Paper variant="outlined" sx={{ p: 3 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5 }}>
                Organization
              </Typography>
              {user.organization ? (
                <Typography variant="body2">{user.organization.name}</Typography>
              ) : (
                <Alert severity="info" variant="outlined">
                  No organization assigned
                </Alert>
              )}
            </Paper>

            <Paper variant="outlined" sx={{ p: 3 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5 }}>
                Branches
              </Typography>
              {user.branches.length > 0 ? (
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                  {user.branches.map((branch) => (
                    <Chip key={branch.id} label={branch.name} />
                  ))}
                </Stack>
              ) : (
                <Alert severity="info" variant="outlined">
                  No branches assigned
                </Alert>
              )}
            </Paper>

            <Paper variant="outlined" sx={{ p: 3 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5 }}>
                Roles
              </Typography>
              {user.roles.length > 0 ? (
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                  {user.roles.map((role) => (
                    <Chip key={role} label={role} />
                  ))}
                </Stack>
              ) : (
                <Alert severity="info" variant="outlined">
                  No application roles assigned
                </Alert>
              )}
            </Paper>

            <Accordion variant="outlined">
              <AccordionSummary expandIcon={<ExpandMoreOutlined />}>
                <Typography variant="subtitle2">Technical details</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Stack spacing={0.5}>
                  <Typography variant="body2" color="text.secondary">
                    User ID: {user.id}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Identity provider: Keycloak
                  </Typography>
                </Stack>
              </AccordionDetails>
            </Accordion>
          </Stack>
        </Grid>
      </Grid>
    </>
  );
}
