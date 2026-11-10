import { useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Alert } from '@mui/material';
import DayCodeDialog from './DayCodeDialog';
import { applyDayLineup } from '../game/gameDay';
import { TEAM_IDS } from '../game/match';

export default function EditTeamsDialog({ state, teamOrder, onClose, onSave }) {
  const [draft, setDraft] = useState(() => structuredClone(state.teams));
  const [loadingDay, setLoadingDay] = useState(false);
  const [imported, setImported] = useState(false);
  const [dayContext, setDayContext] = useState(state.dayContext);
  const [error, setError] = useState('');
  const update = (id, name, index) =>
    setDraft((previous) => ({
      ...previous,
      [id]: {
        ...previous[id],
        ...(index === undefined
          ? { name }
          : {
              players: previous[id].players.map((p, i) => (i === index ? { ...p, name } : p)),
            }),
      },
    }));
  return (
    <Dialog open onClose={onClose} aria-labelledby="edit-title">
      <DialogTitle id="edit-title">Edit teams and players</DialogTitle>
      <DialogContent dividers>
        <Button
          size="small"
          onClick={() => setLoadingDay(true)}
          disabled={state.log.some((entry) => entry.type === 'point')}
        >
          Load lineup
        </Button>
        {state.log.some((entry) => entry.type === 'point') && (
          <Typography variant="caption" display="block">
            Save or reset this match before loading another lineup.
          </Typography>
        )}
        {dayContext && (
          <Typography variant="body2" sx={{ mb: 2 }}>
            {dayContext.group_name} · {dayContext.play_date}
          </Typography>
        )}
        {error && <Alert severity="warning">{error}</Alert>}
        <Box className="edit-grid">
          {teamOrder.map((id) => (
            <Stack key={id} spacing={2}>
              <Typography variant="overline">Team {TEAM_IDS.indexOf(id) + 1}</Typography>
              <TextField
                label="Team name"
                value={draft[id].name}
                onChange={(e) => update(id, e.target.value)}
                slotProps={{ htmlInput: { maxLength: 16 } }}
                fullWidth
              />
              {draft[id].players
                .filter((p) => !p.isError)
                .map((player, i) => (
                  <TextField
                    key={player.id}
                    size="small"
                    label={`Player ${i + 1}`}
                    value={player.name}
                    onChange={(e) => update(id, e.target.value, i)}
                    slotProps={{ htmlInput: { maxLength: 60 } }}
                    fullWidth
                  />
                ))}
            </Stack>
          ))}
        </Box>
        {loadingDay && (
          <DayCodeDialog
            onClose={() => setLoadingDay(false)}
            onConfirm={(context) => {
              try {
                const loaded = applyDayLineup(state, context);
                setDraft(loaded.teams);
                setDayContext(context);
                setImported(true);
                setLoadingDay(false);
              } catch (failure) {
                setError(failure.message);
              }
            }}
          />
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => onSave({ ...draft }, dayContext, imported)}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
