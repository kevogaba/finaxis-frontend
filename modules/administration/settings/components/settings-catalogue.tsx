import { useId, type ReactNode } from 'react';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ExpandMoreOutlined from '@mui/icons-material/ExpandMoreOutlined';
import { SectionCard } from '@/components/data-display/section-card';
import { TruncatedText } from '@/components/data-display/truncated-text';
import type { TenantSetting } from '../settings-contract';
import {
  SETTING_GROUPS,
  isEditableKey,
  otherSettings,
  settingActions,
  settingValueLabel,
} from '../settings-rules';
import { SettingActions } from './setting-actions';

interface SettingsCatalogueProps {
  settings: readonly TenantSetting[];
  /** More than one page came back (see settings-service). */
  truncated: boolean;
  canUpdate: boolean;
  /** Why Edit is disabled (BG-04), or null when editing ships. */
  editBlocked: string | null;
  /** I2: the organisation the page rendered for, passed through to every row's actions. */
  contextOrganisationId?: string;
}

interface SettingRowProps {
  label: string;
  note?: string;
  value: string;
  actions?: ReactNode;
}

/**
 * One setting (prototype `.settings-list` row). It is a group named by its label, so every row's
 * "Edit" and "Reset to default" stay distinguishable. `useId`, not the key: a stored key can hold
 * whitespace, which would split `aria-labelledby` into IDREFs that don't exist. `tabIndex={-1}`
 * (I3): programmatically focusable, never in the tab order, so a successful Reset that leaves
 * Edit disabled has somewhere to land focus instead of <body>.
 */
function SettingRow({ label, note, value, actions }: SettingRowProps) {
  const labelId = useId();
  return (
    <Box
      role="group"
      aria-labelledby={labelId}
      tabIndex={-1}
      sx={{
        minHeight: 78,
        px: 4.5,
        py: 3,
        display: 'grid',
        gridTemplateColumns: {
          xs: 'minmax(0, 1fr)',
          md: 'minmax(0, 1.2fr) minmax(0, 1fr) auto',
        },
        alignItems: 'center',
        gap: { xs: 1.5, md: 4 },
        borderBottom: 1,
        borderColor: 'divider',
        '&:last-child': { borderBottom: 0 },
        // The I3 fallback focus target sits flush inside SectionCard's overflow:hidden Paper, so
        // the house ring is inset (the same -2 as workspace-navigation.tsx).
        '&:focus-visible': { outline: 2, outlineColor: 'focus', outlineOffset: -2 },
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography id={labelId} sx={{ fontWeight: 700 }}>
          {label}
        </Typography>
        {note && (
          <Typography variant="body2" color="text.secondary">
            {note}
          </Typography>
        )}
      </Box>
      <TruncatedText value={value} maxWidth="100%" variant="body1" />
      {actions && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, justifySelf: { md: 'end' } }}>
          {actions}
        </Box>
      )}
    </Box>
  );
}

export function SettingsCatalogue({
  settings,
  truncated,
  canUpdate,
  editBlocked,
  contextOrganisationId,
}: SettingsCatalogueProps) {
  const byKey = new Map(settings.map((setting) => [setting.key, setting]));
  const others = otherSettings(settings);

  return (
    <Stack spacing={5}>
      {SETTING_GROUPS.map((group) => (
        <SectionCard key={group.title} title={group.title} description={group.description}>
          {canUpdate && editBlocked && group.entries.some((entry) => isEditableKey(entry.key)) && (
            // The disabled Edit buttons can't take focus, so a tooltip alone would hide the reason
            // from keyboard and screen-reader users. role="note": a static notice, not an alert
            // announced on every page load (and not confused with the toast's alert).
            <Alert severity="info" role="note" sx={{ mx: 4.5, mt: 3, mb: 1 }}>
              {editBlocked}
            </Alert>
          )}
          {group.entries.map((entry) => {
            const setting = byKey.get(entry.key);
            const allowed = settingActions(setting, canUpdate);
            return (
              <SettingRow
                key={entry.key}
                label={entry.label}
                note={entry.note}
                value={entry.effective ?? settingValueLabel(entry.kind, setting)}
                actions={
                  allowed && (
                    <SettingActions
                      {...allowed}
                      label={entry.label}
                      editBlocked={editBlocked}
                      contextOrganisationId={contextOrganisationId}
                    />
                  )
                }
              />
            );
          })}
        </SectionCard>
      ))}
      {others.length > 0 && (
        // h2 like the SectionCards around it (heading order); MUI's default heading is h3.
        <Accordion disableGutters slotProps={{ heading: { component: 'h2' } }}>
          <AccordionSummary expandIcon={<ExpandMoreOutlined />} sx={{ px: 4.5 }}>
            <Typography component="span" variant="h5">
              Other stored settings ({others.length})
            </Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ p: 0 }}>
            <Typography variant="body2" color="text.secondary" sx={{ px: 4.5, pb: 2 }}>
              Stored keys outside the catalogue, shown read-only.
            </Typography>
            {others.map((setting) => (
              <SettingRow
                key={setting.key}
                label={setting.key}
                value={settingValueLabel(null, setting)}
              />
            ))}
          </AccordionDetails>
        </Accordion>
      )}
      {truncated && (
        <Typography variant="caption" color="text.secondary">
          Showing the first 100 settings.
        </Typography>
      )}
    </Stack>
  );
}
