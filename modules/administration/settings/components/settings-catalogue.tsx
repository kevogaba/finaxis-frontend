import { useId, type ReactNode } from 'react';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ExpandMoreOutlined from '@mui/icons-material/ExpandMoreOutlined';
import type { PermissionHolder } from '@/auth/permissions';
import { SectionCard } from '@/components/data-display/section-card';
import { TruncatedText } from '@/components/data-display/truncated-text';
import type { TenantSetting } from '../settings-contract';
import {
  groupSettings,
  isEditableKey,
  settingActions,
  settingNote,
  settingValueLabel,
} from '../settings-rules';
import { SettingActions, SettingSwitch } from './setting-actions';

interface SettingsCatalogueProps {
  settings: readonly TenantSetting[];
  /** More than one page came back (see settings-service). */
  truncated: boolean;
  holder: PermissionHolder;
  /** I2: the organisation the page rendered for, passed through to every row's actions. */
  contextOrganisationId?: string;
}

interface SettingRowProps {
  label: string;
  note?: string | null;
  value: ReactNode;
  actions?: ReactNode;
}

/**
 * One setting (prototype `.settings-list` row). It is a group named by its label, so every row's
 * "Edit" and "Reset to default" stay distinguishable. `useId`, not the key: a stored key can hold
 * whitespace, which would split `aria-labelledby` into IDREFs that don't exist. `tabIndex={-1}`
 * (I3): programmatically focusable, never in the tab order, so a successful Reset on a row without
 * Edit has somewhere to land focus instead of <body>.
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
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {note}
          </Typography>
        )}
      </Box>
      {value}
      {actions && <Box sx={{ justifySelf: { md: 'end' } }}>{actions}</Box>}
    </Box>
  );
}

function CatalogueRow({
  setting,
  holder,
  contextOrganisationId,
}: { setting: TenantSetting } & Pick<SettingsCatalogueProps, 'holder' | 'contextOrganisationId'>) {
  const label = setting.label ?? setting.key;
  const allowed = settingActions(setting, holder);
  const value =
    setting.valueType === 'BOOLEAN' ? (
      <SettingSwitch
        settingKey={setting.key}
        label={label}
        checked={setting.value === 'true'}
        edit={allowed.edit}
        blocked={allowed.blocked}
        contextOrganisationId={contextOrganisationId}
      />
    ) : (
      <TruncatedText value={settingValueLabel(setting)} maxWidth="100%" variant="body1" />
    );
  let actions: ReactNode = null;
  if (setting.key === 'base_currency') {
    actions = <Chip size="small" label="Read-only" />;
  } else if (allowed.edit && isEditableKey(setting.key)) {
    actions = (
      <SettingActions
        settingKey={setting.key}
        label={label}
        value={setting.value}
        reset={allowed.reset}
        contextOrganisationId={contextOrganisationId}
      />
    );
  }
  return <SettingRow label={label} note={settingNote(setting)} value={value} actions={actions} />;
}

export function SettingsCatalogue({
  settings,
  truncated,
  holder,
  contextOrganisationId,
}: SettingsCatalogueProps) {
  const others = settings.filter((setting) => setting.group === null);

  return (
    <Stack spacing={5}>
      {groupSettings(settings).map(({ group, settings: entries }) => (
        <SectionCard key={group} title={group}>
          {entries.map((setting) => (
            <CatalogueRow
              key={setting.key}
              setting={setting}
              holder={holder}
              contextOrganisationId={contextOrganisationId}
            />
          ))}
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
            <Typography variant="body2" sx={{ color: 'text.secondary', px: 4.5, pb: 2 }}>
              Stored keys outside the catalogue, shown read-only.
            </Typography>
            {others.map((setting) => (
              <SettingRow
                key={setting.key}
                label={setting.key}
                value={
                  <TruncatedText
                    value={settingValueLabel(setting)}
                    maxWidth="100%"
                    variant="body1"
                  />
                }
              />
            ))}
          </AccordionDetails>
        </Accordion>
      )}
      {truncated && (
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          Showing the first 100 settings.
        </Typography>
      )}
    </Stack>
  );
}
