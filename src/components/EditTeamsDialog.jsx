import { useState } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';
import { TEAM_IDS } from '../game/match';

export default function EditTeamsDialog({ teams, onClose, onSave }) {
  const [draft, setDraft] = useState(() => structuredClone(teams));
  const update = (id, name, index) => setDraft(previous => ({ ...previous, [id]: {
    ...previous[id], ...(index === undefined ? { name } : {
      players: previous[id].players.map((p, i) => i === index ? { ...p, name } : p),
    }),
  } }));
  return <Dialog open onClose={onClose} aria-labelledby="edit-title">
    <DialogTitle id="edit-title">Edit teams and players</DialogTitle>
    <DialogContent dividers>
      <Box className="edit-grid">
        {TEAM_IDS.map((id, index) => <Stack key={id} spacing={2}>
          <Typography variant="overline">Team {index + 1}</Typography>
          <TextField label="Team name" value={draft[id].name} onChange={e => update(id, e.target.value)}
            slotProps={{ htmlInput: { maxLength: 16 } }} fullWidth />
          {draft[id].players.filter(p => !p.isError).map((player, i) =>
            <TextField key={player.id} size="small" label={`Player ${i + 1}`} value={player.name}
              onChange={e => update(id, e.target.value, i)} slotProps={{ htmlInput: { maxLength: 20 } }} fullWidth />)}
        </Stack>)}
      </Box>
    </DialogContent>
    <DialogActions><Button onClick={onClose}>Cancel</Button><Button variant="contained" onClick={() => onSave(draft)}>Save</Button></DialogActions>
  </Dialog>;
}
