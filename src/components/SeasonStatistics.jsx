import { useEffect, useState } from 'react';
import { Alert, Box, Button, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { listPlayers, loadSelectedGroup } from '../game/registry';
import { registryCache } from '../game/registryCache';
import { availableSeasons, groupDate, seasonStatistics } from '../game/seasons';

export default function SeasonStatistics({ database, matches }) {
  const [registry, setRegistry] = useState(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [season, setSeason] = useState(null);
  const [groupId, setGroupId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    async function load() {
      try {
        const group = await loadSelectedGroup(database, groupId);
        const cache = await registryCache(database);
        const players = await listPlayers(database, group.id);
        if (!cancelled) {
          setRegistry({ group, players, groups: cache.groups.filter(item => !item.linkedTo) });
          setSeason(previous => previous ?? groupDate(new Date().toISOString(), group.timeZone).slice(0, 4));
        }
      } catch { if (!cancelled) setError(true); }
    }
    load();
    return () => { cancelled = true; };
  }, [database, matches, attempt, groupId]);

  if (error) return <Alert severity="error" sx={{ my: 2 }} action={<Button onClick={() => setAttempt(value => value + 1)}>Retry</Button>}>
    Season statistics could not be loaded. Saved matches have been kept.
  </Alert>;
  if (!registry || !season) return <Typography role="status">Loading season statistics…</Typography>;
  const { group, players } = registry;
  const years = availableSeasons(matches, group);
  const totals = seasonStatistics(matches, group, players, season);
  return <Box component="section" aria-labelledby="season-title" sx={{ mb: 3 }}>
    <Typography component="h2" variant="h5" id="season-title">Season statistics</Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{group.name} · {group.timeZone} · Closed matches on this device</Typography>
    <TextField select label="Statistics group" value={group.id} onChange={event => { setSeason(null); setGroupId(event.target.value); }} size="small"
      slotProps={{ select: { native: true }, inputLabel: { shrink: true } }} fullWidth sx={{ mb: 2 }}>
      {registry.groups.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
    </TextField>
    <TextField select label="Season" value={season} onChange={event => setSeason(event.target.value)} size="small"
      slotProps={{ select: { native: true }, inputLabel: { shrink: true } }} sx={{ minWidth: 120, mb: 2 }}>
      {years.map(year => <option key={year} value={year}>{year}</option>)}
    </TextField>
    <Typography role="status" variant="body2" sx={{ mb: 1 }}>Closed matches in {season}: {totals.includedMatches}</Typography>
    <TableContainer component={Paper} variant="outlined">
      <Table size="small" aria-label={`Player statistics for season ${season}`} sx={{ minWidth: 420 }}>
        <TableHead><TableRow><TableCell>Player</TableCell><TableCell align="right">Points</TableCell><TableCell align="right">Matches</TableCell><TableCell align="right">Wins</TableCell><TableCell align="right">Days</TableCell></TableRow></TableHead>
        <TableBody>{totals.rows.map(row => <TableRow key={row.personId}>
          <TableCell component="th" scope="row" sx={{ overflowWrap: 'anywhere', minWidth: 100, maxWidth: 220 }}>{row.name}</TableCell>
          <TableCell align="right">{row.points}</TableCell><TableCell align="right">{row.matches}</TableCell>
          <TableCell align="right">{row.wins}</TableCell><TableCell align="right">{row.days}</TableCell>
        </TableRow>)}</TableBody>
      </Table>
    </TableContainer>
    <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'block', sm: 'none' }, mt: 1 }}>Swipe the table sideways to see all columns.</Typography>
    {totals.rows.length === 0 && <Typography variant="body2" sx={{ mt: 1 }}>No registered players yet. Register and associate players using Teams &amp; players.</Typography>}
    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Days counts one attendance per date, even with several matches. Playing for both teams gives no individual win.</Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Season and attendance use the match start date in the group time zone.</Typography>
    {totals.fallbackDates > 0 && <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Older matches using the closing date: {totals.fallbackDates}. No start time was recorded.</Typography>}
    {totals.unassociatedMatches > 0 && <Alert severity="info" sx={{ mt: 2 }}>Saved matches without player association: {totals.unassociatedMatches}. They are excluded. Use Associate players below to include them.</Alert>}
    {totals.unavailableMatches > 0 && <Alert severity="warning" sx={{ mt: 2 }}>Unreadable matches excluded: {totals.unavailableMatches}. Their data remains on this device.</Alert>}
  </Box>;
}
