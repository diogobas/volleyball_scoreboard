import { useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';
import { redeemDayCode } from '../remote/gameDays';

export default function DayCodeDialog({ onClose, onConfirm }) {
  const [code, setCode] = useState(''); const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function load(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { setPreview(await redeemDayCode(code)); } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <Dialog open fullWidth maxWidth="sm" onClose={() => { if (!busy) onClose(); }} aria-labelledby="day-code-title">
    <DialogTitle id="day-code-title">Game-day code</DialogTitle>
    <DialogContent><Stack spacing={2} component="form" onSubmit={load} sx={{ pt: 1 }}>
      <Typography>Ask the group administrator for the code. Connecting requires internet; playing and saving work offline.</Typography>
      <TextField label="Code" required value={code} disabled={busy} onChange={event => { setCode(event.target.value); setPreview(null); }} autoComplete="off" />
      <Button type="submit" disabled={busy || !code.trim()}>Check code</Button>
      {error && <Alert severity="warning">{error}</Alert>}
      {preview && <><Typography variant="h6">{preview.group_name} · {preview.play_date}</Typography>
        {['A','B'].map(team => <Typography key={team}>{preview.lineup[team].name}: {preview.lineup[team].players.map(p => p.name).join(', ')}</Typography>)}
        <Typography variant="caption">Lineup version {preview.lineup_version}</Typography></>}
    </Stack></DialogContent>
    <DialogActions><Button disabled={busy} onClick={onClose}>Cancel</Button><Button variant="contained" disabled={busy || !preview} onClick={() => onConfirm(preview)}>Use this day</Button></DialogActions>
  </Dialog>;
}
