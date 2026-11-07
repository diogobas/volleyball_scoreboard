import { useEffect, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Stack, Typography } from '@mui/material';
import { listStoredMatches } from '../game/storage';
import { bindSavedMatch } from '../game/gameDay';
import { uploadReceivedMatch } from '../remote/gameDays';
import { readMatchUploadStates } from '../remote/matchUploadState';
import MatchSummary from './MatchSummary';
import DayCodeDialog from './DayCodeDialog';

export default function SavedMatchesDialog({ database, onChanged, onClose }) {
  const [matches, setMatches] = useState([]); const [states, setStates] = useState({}); const [attempt, setAttempt] = useState(0);
  const [binding, setBinding] = useState(null); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(''); const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    Promise.all([listStoredMatches(database), readMatchUploadStates(database)]).then(([items, uploads]) => { if (active) { setMatches(items); setStates(uploads); } }).catch(failure => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [database, attempt]);
  async function run(action) {
    if (busy) return; setBusy(true); setError(''); setMessage('');
    try { await action(); } catch (failure) { setError(failure.message || 'Sync failed. Your local match was kept.'); }
    finally { setBusy(false); setAttempt(n => n+1); onChanged(); }
  }
  return <Dialog open fullWidth maxWidth="sm" onClose={() => { if (!busy) onClose(); }} aria-labelledby="saved-matches-title">
    <DialogTitle id="saved-matches-title">Saved matches · {matches.length} pending</DialogTitle>
    <DialogContent dividers><Stack spacing={2}>
      <Typography>Sync sends a match for administrator review. Its local copy is removed only after the server confirms receipt.</Typography>
      {error && <Alert severity="warning">{error}</Alert>}{message && <Alert severity="success">{message}</Alert>}
      <Button disabled={busy} onClick={() => setAttempt(n => n+1)}>Refresh</Button>
      {!matches.length && <Typography>No saved matches awaiting sync.</Typography>}
      {matches.map(match => <Paper key={match.id} variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2">{match.closedAt ? new Date(match.closedAt).toLocaleString() : match.id}</Typography>
        {match.unavailable ? <Alert severity="warning">This saved match could not be read. Its original data has been kept.</Alert> : <>
          <MatchSummary state={match.state} />
          <Typography variant="body2" sx={{ mt: 1 }}>{(match.dayContext ?? match.state.dayContext)?.play_date ?? 'No day linked yet'}</Typography>
          {states[match.id] && <Typography variant="body2" color="text.secondary">{states[match.id].state}: {states[match.id].error}</Typography>}
          <Button disabled={busy} onClick={() => setBinding(match.id)}>{match.dayContext || match.state.dayContext ? 'Update code' : 'Link game day'}</Button>
          <Button variant="outlined" disabled={busy || !(match.dayContext ?? match.state.dayContext)} onClick={() => run(async () => {
            await uploadReceivedMatch(database, match.id); setMessage('Received for administrator review. Local copy removed.');
          })}>Sync</Button>
        </>}
      </Paper>)}
    </Stack></DialogContent>
    <DialogActions><Button disabled={busy} onClick={onClose}>Done</Button></DialogActions>
    {binding && <DayCodeDialog onClose={() => setBinding(null)} onConfirm={context => { const id = binding; setBinding(null); void run(() => bindSavedMatch(database, id, context)); }} />}
  </Dialog>;
}
