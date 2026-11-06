import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Stack, Typography } from '@mui/material';
import { listStoredMatches } from '../game/storage';
import MatchSummary from './MatchSummary';
import EditTeamsDialog from './EditTeamsDialog';
import SeasonStatistics from './SeasonStatistics';
import { isPendingSyncRunning, syncPendingMatches } from '../remote/matchSync';
import { readMatchUploadStates } from '../remote/matchUploadState';

const closedDate = value => new Date(value).toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' });

export default function MatchHistory({ database, refreshVersion = 0 }) {
  const [matches, setMatches] = useState(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState(null);
  const [associating, setAssociating] = useState(null);
  const [states, setStates] = useState({});
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState('');
  const [summary, setSummary] = useState(null);
  const [syncError, setSyncError] = useState('');
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const busy = syncing || isPendingSyncRunning(database);
  const uploading = matches?.some(match => states[match.id]?.state === 'sending') ?? false;

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    if (!busy && !uploading) return;
    const timer = setInterval(() => setAttempt(value => value + 1), 1500);
    return () => clearInterval(timer);
  }, [busy, uploading]);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    Promise.all([listStoredMatches(database), readMatchUploadStates(database)]).then(([result, statuses]) => {
      if (!cancelled) {
        setMatches(result); setStates(statuses);
        setSelected(current => current && !result.some(match => match.id === current.id) ? null : current);
      }
    }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [database, attempt, refreshVersion]);

  async function sync() {
    if (busyRef.current || busy || uploading) return;
    busyRef.current = true;
    setSyncing(true); setSummary(null); setSyncError(''); setProgress('Preparing pending matches…');
    try {
      const result = await syncPendingMatches(database, event => {
        if (!mounted.current) return;
        setProgress(`Uploading match ${event.index} of ${event.total}…`);
        setAttempt(value => value + 1);
      });
      if (mounted.current) setSummary(result);
    } catch (failure) {
      if (mounted.current) setSyncError(failure.message || 'Pending matches could not be read. Local data has been kept.');
    } finally {
      busyRef.current = false;
      if (mounted.current) { setSyncing(false); setProgress(''); setAttempt(value => value + 1); }
    }
  }

  function statusLabel(match) {
    const state = states[match.id]?.state;
    return state === 'sending' ? 'Uploading' : state === 'failed' ? 'Upload failed' : state === 'interrupted' ? 'Upload interrupted'
      : match.syncStatus === 'pending' ? 'Awaiting upload' : 'Status unavailable';
  }

  return <Box sx={{ p: 2 }}>
    <Typography component="h2" variant="h5">Saved matches</Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
      Newly closed matches in online groups upload automatically when connected. Use Sync pending matches to send earlier pending games. Each local copy is removed only after server confirmation.
    </Typography>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }}>
      <Button variant="contained" disabled={busy || uploading || !matches?.some(match => match.syncStatus === 'pending')} onClick={sync}>
        {busy ? 'Syncing pending matches…' : 'Sync pending matches'}
      </Button>
      <Button onClick={() => setAttempt(value => value + 1)}>Refresh saved matches</Button>
    </Stack>
    {(busy || uploading) && <Typography role="status" sx={{ mb: 2 }}>{progress || 'An upload is in progress. You can keep playing; local copies stay until confirmed.'}</Typography>}
    {summary && <Alert severity={summary.failed || summary.busy ? 'warning' : 'success'} sx={{ mb: 2 }}>
      {summary.confirmed} confirmed online · {summary.failed} failed · {summary.busy} already uploading · {summary.skipped} no longer local.
      {summary.failed > 0 && ' Check the errors below and press Sync pending matches to retry.'}
    </Alert>}
    {syncError && <Alert severity="warning" sx={{ mb: 2 }}>{syncError}</Alert>}
    {error ? <Alert severity="error" action={<Button color="inherit" onClick={() => setAttempt(value => value + 1)}>Retry</Button>}>
      Saved matches could not be loaded. Your data has been kept on this device.
    </Alert> : matches === null ? <Typography role="status">Loading saved matches…</Typography> : <>
      <SeasonStatistics database={database} matches={matches} />
      <Typography role="status" sx={{ mb: 2 }}>
        {matches.length} saved · {matches.filter(match => match.syncStatus === 'pending').length} awaiting upload
      </Typography>
      {matches.length === 0 && <Typography color="text.secondary">No saved matches yet. Use Close match after finishing your sets.</Typography>}
      <Stack component="ul" aria-label="Saved matches" spacing={2} sx={{ listStyle: 'none', p: 0, m: 0 }}>
        {matches.map(match => <Paper component="li" key={match.id} variant="outlined" sx={{ p: 2, overflowWrap: 'anywhere' }}>
          <Chip size="small" label={statusLabel(match)} sx={{ mb: 1 }} />
          {states[match.id]?.error && <Alert severity="warning" sx={{ mb: 1 }}>{states[match.id].error}</Alert>}
          {states[match.id]?.attemptedAt && <Typography variant="caption" sx={{ display: 'block', mb: 1 }}>Last attempt: {closedDate(states[match.id].attemptedAt)}</Typography>}
          {match.unavailable ? <Alert severity="warning">This match could not be read. Its data is still on this device.</Alert> : <>
            <Typography component="h3" variant="subtitle1">
              {match.state.teams.A.name} {match.state.teams.A.setsWon} × {match.state.teams.B.setsWon} {match.state.teams.B.name}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Closed <time dateTime={match.closedAt}>{closedDate(match.closedAt)}</time>
            </Typography>
            <Button size="small" variant="outlined" onClick={() => setSelected(match)}>View details</Button>
            {!match.state.groupId && <Button size="small" disabled={busy || uploading} onClick={() => setAssociating(match)}>Associate players</Button>}
            {match.state.groupId && <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>Players associated with a group</Typography>}
          </>}
        </Paper>)}
      </Stack>
    </>}
    {selected && <Dialog open fullWidth maxWidth="sm" onClose={() => setSelected(null)} aria-labelledby="saved-match-title">
      <DialogTitle id="saved-match-title">Saved match</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Closed {closedDate(selected.closedAt)} · {statusLabel(selected)}</Typography>
        <MatchSummary state={selected.state} />
      </DialogContent>
      <DialogActions><Button onClick={() => setSelected(null)}>Done</Button></DialogActions>
    </Dialog>}
    {associating && <EditTeamsDialog state={associating.state} database={database} archiveId={associating.id}
      onClose={() => setAssociating(null)} onSave={() => { setAssociating(null); setAttempt(value => value + 1); }} />}
  </Box>;
}
