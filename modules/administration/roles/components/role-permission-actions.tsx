'use client';

import { useEffect, useRef, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import FormLabel from '@mui/material/FormLabel';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import AddModeratorOutlined from '@mui/icons-material/AddModeratorOutlined';
import { AssignmentDrawer } from '@/components/data-display/assignment-drawer';
import { ConfirmDialog } from '@/components/data-display/confirm-dialog';
import { focusRecordTitle } from '@/components/data-display/focus-record-title';
import { humanizeEnum } from '@/components/data-display/status-chip';
import { useToast } from '@/components/providers/toast-provider';
import { grantPermissions, removePermission } from '../role-actions';
import {
  PERMISSION_RISK_LEVELS,
  type Permission,
  type PermissionRiskLevel,
} from '../role-contract';
import { MAX_GRANTS_PER_SUBMIT, groupByModule } from '../role-rules';

const riskColor = (risk: PermissionRiskLevel) =>
  risk === 'CRITICAL' || risk === 'HIGH' ? 'error' : 'text.secondary';

interface PermissionChecklistProps {
  /** Grantable entries: the ACTIVE catalogue codes the role doesn't hold yet. */
  permissions: readonly Permission[];
  /** The catalogue read stopped at its ceiling (Ruling 6). */
  truncated: boolean;
  error?: string;
}

/**
 * The grant drawer's body (spec §10.4): search and a risk filter over the catalogue, grouped by
 * module, with one hidden comma-joined `permissionCodes` field (Ruling 5). The option list is
 * captured once per opening, so a partial-failure `refresh()` never drops a checked row before
 * the retry (Ruling 6).
 */
export function PermissionChecklist({ permissions, truncated, error }: PermissionChecklistProps) {
  const [options] = useState(permissions);
  const [search, setSearch] = useState('');
  const [risk, setRisk] = useState<PermissionRiskLevel | ''>('');
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const needle = search.trim().toLowerCase();
  const groups = groupByModule(
    options.filter(
      (permission) =>
        (risk === '' || permission.risk === risk) &&
        (needle === '' ||
          permission.code.includes(needle) ||
          permission.name.toLowerCase().includes(needle)),
    ),
  );
  const full = selected.size >= MAX_GRANTS_PER_SUBMIT;
  const toggle = (code: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(code)) next.add(code);
      return next;
    });
  };

  return (
    <Box sx={{ display: 'grid', gap: 3 }}>
      <input type="hidden" name="permissionCodes" value={[...selected].join(',')} />
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
        <TextField
          type="search"
          label="Search permissions"
          value={search}
          sx={{ flex: '1 1 200px' }}
          slotProps={{ htmlInput: { maxLength: 100 } }}
          onChange={(event) => {
            setSearch(event.target.value);
          }}
          onKeyDown={(event) => {
            // The list filters as you type, so Enter must never submit the drawer. Escape in a
            // non-empty box only clears it: the drawer, and its selection, stay open.
            if (event.key === 'Enter') event.preventDefault();
            if (event.key === 'Escape' && search !== '') {
              event.stopPropagation();
              setSearch('');
            }
          }}
        />
        <TextField
          select
          label="Risk"
          value={risk}
          sx={{ minWidth: 150 }}
          slotProps={{ select: { displayEmpty: true } }}
          onChange={(event) => {
            setRisk(PERMISSION_RISK_LEVELS.find((level) => level === event.target.value) ?? '');
          }}
        >
          <MenuItem value="">All risks</MenuItem>
          {PERMISSION_RISK_LEVELS.map((level) => (
            <MenuItem key={level} value={level}>
              {humanizeEnum(level)}
            </MenuItem>
          ))}
        </TextField>
      </Box>
      <Typography variant="caption" color="text.secondary" role="status">
        {selected.size} selected
        {full ? ` — up to ${MAX_GRANTS_PER_SUBMIT} at a time` : ''}
      </Typography>
      {error && (
        <Typography variant="body2" color="error">
          {error}
        </Typography>
      )}
      {truncated && (
        <Alert severity="info">Only the first 100 catalogue permissions are listed.</Alert>
      )}
      {groups.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {options.length === 0
            ? 'Every catalogue permission is already granted.'
            : 'No permissions match these filters.'}
        </Typography>
      ) : (
        groups.map((group) => (
          <FormControl key={group.module} component="fieldset" variant="standard">
            <FormLabel component="legend">{group.label}</FormLabel>
            <FormGroup>
              {group.permissions.map((permission) => {
                const checked = selected.has(permission.code);
                return (
                  <FormControlLabel
                    key={permission.code}
                    control={
                      <Checkbox
                        checked={checked}
                        disabled={!checked && full}
                        onChange={() => {
                          toggle(permission.code);
                        }}
                      />
                    }
                    label={
                      // The spaces keep the accessible name readable: "View roles role.view Low".
                      <Box
                        component="span"
                        sx={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          alignItems: 'baseline',
                          columnGap: 1.5,
                        }}
                      >
                        <span>{permission.name}</span>{' '}
                        <Typography
                          component="span"
                          variant="caption"
                          sx={{ fontFamily: 'monospace' }}
                        >
                          {permission.code}
                        </Typography>{' '}
                        <Typography
                          component="span"
                          variant="caption"
                          color={riskColor(permission.risk)}
                        >
                          {humanizeEnum(permission.risk)}
                        </Typography>
                      </Box>
                    }
                  />
                );
              })}
            </FormGroup>
          </FormControl>
        ))
      )}
    </Box>
  );
}

interface GrantPermissionsButtonProps {
  roleId: string;
  roleName: string;
  /** ACTIVE catalogue codes the role doesn't hold (Ruling 6). */
  available: readonly Permission[];
  truncated: boolean;
  /** I2: forwarded to the drawer as a hidden field. */
  contextOrganisationId?: string;
}

export function GrantPermissionsButton({
  roleId,
  roleName,
  available,
  truncated,
  contextOrganisationId,
}: GrantPermissionsButtonProps) {
  const notify = useToast();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="contained"
        startIcon={<AddModeratorOutlined />}
        onClick={() => {
          setOpen(true);
        }}
      >
        Grant permissions
      </Button>
      <AssignmentDrawer
        open={open}
        title="Grant permissions"
        description={`Permissions granted to ${roleName} take effect immediately for everyone holding it.`}
        submitLabel="Grant permissions"
        action={grantPermissions}
        contextOrganisationId={contextOrganisationId}
        onClose={() => {
          setOpen(false);
        }}
        onSuccess={() => {
          setOpen(false);
          notify('Permissions granted');
        }}
      >
        {(fieldErrors) => (
          <>
            <input type="hidden" name="roleId" value={roleId} />
            <PermissionChecklist
              permissions={available}
              truncated={truncated}
              error={fieldErrors.permissionCodes}
            />
          </>
        )}
      </AssignmentDrawer>
    </>
  );
}

interface RemovePermissionButtonProps {
  roleId: string;
  grantId: string;
  /** The catalogue name, or the code when the catalogue isn't readable. */
  label: string;
  /** CRITICAL, or unknown (treated as critical, Ruling 7). */
  critical: boolean;
  /** I2: forwarded to `ConfirmDialog` as a hidden field. */
  contextOrganisationId?: string;
}

export function RemovePermissionButton({
  roleId,
  grantId,
  label,
  critical,
  contextOrganisationId,
}: RemovePermissionButtonProps) {
  const notify = useToast();
  const [open, setOpen] = useState(false);
  // I3: a successful removal drops this row — and this button — so focus falls back to the
  // record title from the unmount cleanup (08's RevokeAssignmentButton pattern).
  const succeededRef = useRef(false);
  useEffect(() => {
    const successRef = succeededRef;
    return () => {
      if (successRef.current) focusRecordTitle();
    };
  }, []);

  return (
    <>
      <Button
        size="small"
        variant="outlined"
        color="error"
        aria-label={`Remove ${label}`}
        onClick={() => {
          setOpen(true);
        }}
      >
        Remove
      </Button>
      <ConfirmDialog
        open={open}
        tone={critical ? 'error' : 'primary'}
        title={`Remove ${label}?`}
        description={
          critical
            ? `${label} is a critical permission. Everyone holding this role loses it immediately.`
            : `Everyone holding this role loses ${label} immediately.`
        }
        confirmLabel="Remove"
        action={removePermission}
        contextOrganisationId={contextOrganisationId}
        onClose={() => {
          setOpen(false);
        }}
        onSuccess={() => {
          succeededRef.current = true;
          setOpen(false);
          notify('Permission removed');
        }}
      >
        <input type="hidden" name="roleId" value={roleId} />
        <input type="hidden" name="grantId" value={grantId} />
      </ConfirmDialog>
    </>
  );
}
