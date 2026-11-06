import { useEffect, useState } from 'react';
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Stack, Typography } from '@mui/material';
import { listStoredMatches } from '../game/storage';
import MatchSummary from './MatchSummary';
import EditTeamsDialog from './EditTeamsDialog';
import SeasonStatistics from './SeasonStatistics';

const closedDate = value => new Date(value).toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' });

export default function MatchHistory({ database }) {
  const [matches, setMatches] = useState(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState(null);
  const [associating, setAssociating] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    setMatches(null);
    listStoredMatches(database).then(result => {
      if (!cancelled) setMatches(result);
    }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [database, attempt]);

  return <Box sx={{ p: 2 }}>
    <Typography component="h2" variant="h5">Saved matches</Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
      Matches are stored on this device only. Remote upload is not available yet.
    </Typography>
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
          <Chip size="small" label={match.syncStatus === 'pending' ? 'Awaiting upload' : 'Status unavailable'} sx={{ mb: 1 }} />
          {match.unavailable ? <Alert severity="warning">This match could not be read. Its data is still on this device.</Alert> : <>
            <Typography component="h3" variant="subtitle1">
              {match.state.teams.A.name} {match.state.teams.A.setsWon} × {match.state.teams.B.setsWon} {match.state.teams.B.name}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Closed <time dateTime={match.closedAt}>{closedDate(match.closedAt)}</time>
            </Typography>
            <Button size="small" variant="outlined" onClick={() => setSelected(match)}>View details</Button>
            {!match.state.groupId && <Button size="small" onClick={() => setAssociating(match)}>Associate players</Button>}
            {match.state.groupId && <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>Players associated with a group</Typography>}
          </>}
        </Paper>)}
      </Stack>
    </>}
    {selected && <Dialog open fullWidth maxWidth="sm" onClose={() => setSelected(null)} aria-labelledby="saved-match-title">
      <DialogTitle id="saved-match-title">Saved match</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Closed {closedDate(selected.closedAt)} · {selected.syncStatus === 'pending' ? 'Awaiting upload' : 'Status unavailable'}</Typography>
        <MatchSummary state={selected.state} />
      </DialogContent>
      <DialogActions><Button onClick={() => setSelected(null)}>Done</Button></DialogActions>
    </Dialog>}
    {associating && <EditTeamsDialog state={associating.state} database={database} archiveId={associating.id}
      onClose={() => setAssociating(null)} onSave={() => { setAssociating(null); setAttempt(value => value + 1); }} />}
  </Box>;
}
