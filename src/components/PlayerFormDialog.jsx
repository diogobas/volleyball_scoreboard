import { playerPositions, playerSexes } from '../game/playerProfile';
import { useId, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Checkbox,
  FormControl,
  FormControlLabel,
  FormGroup,
  FormLabel,
  Stack,
  TextField,
} from '@mui/material';
import { createLocalId } from '../game/storage';
import { dayRpc } from '../remote/gameDays';

export default function PlayerFormDialog({ client, groupId, player, onClose, onSaved }) {
  const titleId = useId();
  const saving = useRef(false);
  const [draft, setDraft] = useState(
    () => player ?? { id: createLocalId(), name: '', category: 'sub' },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(event) {
    event.preventDefault();
    event.stopPropagation();
    if (saving.current || !draft.name.trim()) return;
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      const saved = await dayRpc(
        'save_group_player_profile',
        {
          p_group_id: groupId,
          p_player_id: draft.id,
          p_name: draft.name.trim(),
          p_category: draft.category ?? 'sub',
          p_sex: draft.sex || null,
          p_preferred_positions: draft.preferred_positions ?? [],
          p_expected_version: draft.version ?? null,
        },
        client,
      );
      onSaved(saved);
    } catch (failure) {
      setError(failure.message || 'The change could not be confirmed. Retry to confirm it.');
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      fullWidth
      maxWidth="xs"
      onClose={() => {
        if (!busy) onClose();
      }}
      aria-labelledby={titleId}
    >
      <Box component="form" onSubmit={save}>
        <DialogTitle id={titleId}>{draft.version ? 'Edit player' : 'Add player'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="warning">{error}</Alert>}
            <TextField
              autoFocus
              required
              label="Player name"
              value={draft.name}
              disabled={busy}
              onChange={(event) =>
                setDraft((previous) => ({ ...previous, name: event.target.value }))
              }
              slotProps={{ htmlInput: { maxLength: 60 } }}
            />
            <TextField
              select
              label="Player category"
              value={draft.category ?? 'sub'}
              disabled={busy}
              slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
              onChange={(event) =>
                setDraft((previous) => ({ ...previous, category: event.target.value }))
              }
            >
              <option value="fixed">Fixed</option>
              <option value="sub">Sub</option>
            </TextField>
            <TextField
              select
              label="Sex"
              value={draft.sex ?? ''}
              disabled={busy}
              slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
              onChange={(event) =>
                setDraft((previous) => ({ ...previous, sex: event.target.value || null }))
              }
            >
              <option value="">Not specified</option>
              {playerSexes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </TextField>
            <FormControl component="fieldset" disabled={busy}>
              <FormLabel component="legend">Preferred positions</FormLabel>
              <FormGroup>
                {playerPositions.map((position) => (
                  <FormControlLabel
                    key={position.id}
                    label={`${position.label} (${position.id})`}
                    control={
                      <Checkbox
                        checked={(draft.preferred_positions ?? []).includes(position.id)}
                        onChange={(_, checked) =>
                          setDraft((previous) => ({
                            ...previous,
                            preferred_positions: checked
                              ? [...(previous.preferred_positions ?? []), position.id]
                              : (previous.preferred_positions ?? []).filter(
                                  (code) => code !== position.id,
                                ),
                          }))
                        }
                      />
                    }
                  />
                ))}
              </FormGroup>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={busy || !draft.name.trim()}>
            Save player
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
