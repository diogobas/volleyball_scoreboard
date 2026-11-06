import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Stack, Typography } from '@mui/material';
import { TEAM_IDS } from '../game/match';

export default function CloseMatchDialog({ state, saving, error, onClose, onConfirm }) {
  const sets = state.log.filter(entry => entry.type === 'set');
  const { A, B } = state.teams;
  const winner = A.setsWon === B.setsWon ? null : A.setsWon > B.setsWon ? A : B;
  return <Dialog open onClose={() => { if (!saving) onClose(); }} fullWidth maxWidth="sm"
    aria-labelledby="close-match-title" aria-describedby="close-match-description">
    <DialogTitle id="close-match-title">Close match?</DialogTitle>
    <DialogContent aria-busy={saving}>
      <DialogContentText id="close-match-description" sx={{ mb: 2 }}>
        Review the result before closing. This match will be saved on this device, awaiting upload.
        A new match will start with the same players and sides. You cannot undo this closure.
      </DialogContentText>
      <Typography variant="h6" sx={{ overflowWrap: 'anywhere' }}>{A.name} {A.setsWon} × {B.setsWon} {B.name}</Typography>
      <Typography sx={{ mb: 2 }}>{winner ? `Winner: ${winner.name}` : 'Result: Draw'}</Typography>
      <Typography component="h3" variant="subtitle2">Sets</Typography>
      {sets.map(set => <Typography key={set.setNumber} variant="body2" sx={{ overflowWrap: 'anywhere' }}>
        Set {set.setNumber} · {set.teamAName} {set.scoreA} × {set.scoreB} {set.teamBName}
      </Typography>)}
      <Typography component="h3" variant="subtitle2" sx={{ mt: 2 }}>Players · Match points</Typography>
      {TEAM_IDS.map(id => <Box key={id} sx={{ mt: 1.5 }}>
        <Typography variant="subtitle2">{state.teams[id].name}</Typography>
        {state.teams[id].players.map(player => <Stack key={player.id} direction="row" sx={{ justifyContent: 'space-between', gap: 2 }}>
          <Typography variant="body2" color={player.isError ? 'text.secondary' : 'text.primary'} sx={{ overflowWrap: 'anywhere' }}>{player.name}</Typography>
          <Typography variant="body2">{player.matchPoints}</Typography>
        </Stack>)}
      </Box>)}
      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
    </DialogContent>
    <DialogActions>
      <Button disabled={saving} onClick={onClose}>Cancel</Button>
      <Button variant="contained" disabled={saving} onClick={onConfirm}>{saving ? 'Saving match…' : 'Save and start new match'}</Button>
    </DialogActions>
  </Dialog>;
}
