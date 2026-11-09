import { useId, useRef, useState } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField } from '@mui/material';
import { createLocalId } from '../game/storage';
import { dayRpc } from '../remote/gameDays';

export default function PlayerFormDialog({ client, groupId, player, onClose, onSaved }) {
  const titleId = useId(); const saving = useRef(false);
  const [draft, setDraft] = useState(() => player ?? { id: createLocalId(), name: '', category: 'sub' });
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function save(event) {
    event.preventDefault(); event.stopPropagation();
    if (saving.current || !draft.name.trim()) return;
    saving.current = true; setBusy(true); setError('');
    try {
      const saved = await dayRpc('save_group_player', { p_group_id: groupId, p_player_id: draft.id, p_name: draft.name.trim(), p_category: draft.category ?? 'sub', p_expected_version: draft.version ?? null }, client);
      onSaved(saved);
    } catch (failure) { setError(failure.message || 'The change could not be confirmed. Retry to confirm it.'); }
    finally { saving.current = false; setBusy(false); }
  }
  return <Dialog open fullWidth maxWidth="xs" onClose={() => { if (!busy) onClose(); }} aria-labelledby={titleId}>
    <Box component="form" onSubmit={save}>
      <DialogTitle id={titleId}>{draft.version ? 'Edit player' : 'Add player'}</DialogTitle>
      <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
        {error && <Alert severity="warning">{error}</Alert>}
        <TextField autoFocus required label="Player name" value={draft.name} disabled={busy} onChange={event => setDraft(previous => ({ ...previous, name: event.target.value }))} slotProps={{ htmlInput: { maxLength: 60 } }} />
        <TextField select label="Player category" value={draft.category ?? 'sub'} disabled={busy} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }} onChange={event => setDraft(previous => ({ ...previous, category: event.target.value }))}>
          <option value="fixed">Fixed</option><option value="sub">Sub</option>
        </TextField>
      </Stack></DialogContent>
      <DialogActions><Button disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" variant="contained" disabled={busy || !draft.name.trim()}>Save player</Button></DialogActions>
    </Box>
  </Dialog>;
}
