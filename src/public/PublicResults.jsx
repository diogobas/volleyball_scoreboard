import { useEffect, useState } from 'react';
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Chip, Container, Divider, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import SportsVolleyballRounded from '@mui/icons-material/SportsVolleyballRounded';
import { listPublicGroups, publicGroupSummary, publicMatchDetails } from '../remote/publicStats';
import { publicGroupHref } from './routes';

function playedTime(match, timeZone) {
  return new Intl.DateTimeFormat('en', { timeZone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(match.started_at ?? match.closed_at));
}
const resultText = match => match.sets_a === match.sets_b ? 'Draw' : `Winner: ${match.sets_a > match.sets_b ? match.team_a_name : match.team_b_name}`;

export default function PublicResults({ route }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    if (route.kind === 'missing') { setLoading(false); return; }
    const request = route.kind === 'groups' ? listPublicGroups() : route.kind === 'match'
      ? publicMatchDetails(route.groupId, route.matchId) : publicGroupSummary(route.groupId, route.season, route.page);
    request.then(result => { if (active) setData(result); }).catch(failure => {
      if (active) setError(failure.message || 'Public results could not be loaded. Check your connection and retry.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [route.kind, route.groupId, route.matchId, route.season, route.page, attempt]);

  const group = route.kind === 'groups' ? null : data?.group;
  return <Container component="main" maxWidth="lg" sx={{ py: { xs: 2, sm: 4 }, pb: 6 }}>
    <Stack component="header" direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 4 }}>
      <Stack component="a" href="#/groups" direction="row" spacing={1} sx={{ alignItems: 'center', color: 'text.primary', textDecoration: 'none' }}>
        <SportsVolleyballRounded color="primary" /><Typography variant="overline" sx={{ lineHeight: 1.3 }}>Volleyball<br />Public results</Typography>
      </Stack>
      <Button component="a" href="#/app" variant="outlined" size="small">Open scoreboard</Button>
    </Stack>
    {route.kind === 'missing' ? <><Typography component="h1" variant="h3">Page not found</Typography><Button component="a" href="#/groups">Browse groups</Button></> : <>
      {route.kind !== 'groups' && <Button component="a" href={route.kind === 'match' ? publicGroupHref(route.groupId, { season: route.season, page: route.page }) : '#/groups'} sx={{ mb: 2 }}>
        {route.kind === 'match' ? '← Back to season' : '← All groups'}
      </Button>}
      {route.kind === 'groups' && <><Typography component="h1" variant="h3" sx={{ mb: 1 }}>Results &amp; seasons</Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>Choose a group to see confirmed matches and player statistics. No sign-in required.</Typography></>}
      {group && <><Typography component={route.kind === 'match' ? 'p' : 'h1'} variant={route.kind === 'match' ? 'h5' : 'h3'} sx={{ overflowWrap: 'anywhere' }}>{group.name}</Typography>
        <Typography color="text.secondary" variant="body2" sx={{ mt: 1, mb: 3 }}>{group.time_zone} · Confirmed online results</Typography></>}
      {error && <Alert severity="warning" sx={{ mb: 2 }} action={<Button disabled={loading} onClick={() => setAttempt(value => value + 1)}>Retry</Button>}>
        {error}{data && ' Showing the last results received. Refresh when connected.'}
      </Alert>}
      {loading && <Typography role="status" sx={{ my: 2 }}>Loading confirmed results…</Typography>}
      {data && route.kind === 'groups' && <Stack spacing={2}>
        {data.length === 0 && <Alert severity="info">No groups have been created yet.</Alert>}
        {data.map(item => <Paper key={item.id} variant="outlined" sx={{ p: 3 }}>
          <Typography component="h2" variant="h5" sx={{ overflowWrap: 'anywhere' }}>{item.name}</Typography>
          <Typography color="text.secondary" variant="body2" sx={{ my: 1 }}>{item.time_zone}</Typography>
          <Button component="a" href={publicGroupHref(item.id)} aria-label={`View ${item.name}`}>View group →</Button>
        </Paper>)}
      </Stack>}
      {data && route.kind === 'group' && <GroupSeason data={data} route={route} loading={loading} refresh={() => setAttempt(value => value + 1)} />}
      {data && route.kind === 'match' && <MatchDetails data={data} loading={loading} refresh={() => setAttempt(value => value + 1)} />}
    </>}
    <Divider sx={{ mt: 5, mb: 2 }} />
    <Typography component="footer" variant="caption" color="text.secondary">Only matches confirmed on the server appear here. Pending games stay on the device until uploaded.</Typography>
  </Container>;
}

function GroupSeason({ data, route, loading, refresh }) {
  const pages = Math.max(1, Math.ceil(data.match_count / data.page_size));
  return <>
    <Stack direction="row" spacing={2} sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
      <TextField select label="Season" value={data.season} onChange={event => { window.location.hash = publicGroupHref(route.groupId, { season: Number(event.target.value) }).slice(1); }}
        slotProps={{ select: { native: true }, inputLabel: { shrink: true } }} size="small" sx={{ minWidth: 120 }}>
        {data.seasons.map(year => <option key={year} value={year}>{year}</option>)}
      </TextField>
      <Button disabled={loading} onClick={refresh}>Refresh results</Button>
    </Stack>
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: { xs: 1, sm: 2 }, mb: 4 }}>
      {[[data.match_count, 'Matches'], [data.participant_count, 'Players'], [data.point_count, 'Points played']].map(([value, label]) => <Paper key={label} variant="outlined" sx={{ p: { xs: 1.5, sm: 2.5 } }}>
        <Typography sx={{ font: '700 2.5rem/1 "Barlow Condensed", sans-serif', mb: 1 }}>{value}</Typography><Typography variant="body2" color="text.secondary">{label}</Typography>
      </Paper>)}
    </Box>
    <Typography component="h2" variant="h5" sx={{ mb: 2 }}>Player statistics · {data.season}</Typography>
    <TableContainer component={Paper} variant="outlined">
      <Table size="small" aria-label={`Player statistics for season ${data.season}`} sx={{ minWidth: 470 }}>
        <TableHead><TableRow><TableCell>Player</TableCell>{['Points', 'Matches', 'Wins', 'Days'].map(label => <TableCell key={label} align="right">{label}</TableCell>)}</TableRow></TableHead>
        <TableBody>{data.players.map(player => <TableRow key={player.id}>
          <TableCell component="th" scope="row" sx={{ overflowWrap: 'anywhere', maxWidth: 240 }}>{player.name}</TableCell>
          {[player.points, player.matches, player.wins, player.days].map((value, i) => <TableCell key={i} align="right">{value}</TableCell>)}
        </TableRow>)}</TableBody>
      </Table>
    </TableContainer>
    {data.players.length === 0 && <Typography sx={{ mt: 1 }}>No registered players yet.</Typography>}
    <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'block', sm: 'none' }, mt: 1 }}>Swipe the table sideways to see all columns.</Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>Days counts one attendance per date in the group time zone, using the match start date. Playing for both teams gives no individual win. Tied matches grant no victory.</Typography>
    {data.fallback_dates > 0 && <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Older matches using their closing date: {data.fallback_dates}.</Typography>}
    <Typography component="h2" variant="h5" sx={{ mt: 4, mb: 2 }}>Matches · {data.season}</Typography>
    {data.matches.length === 0 && <Alert severity="info" action={data.match_count ? <Button component="a" href={publicGroupHref(route.groupId, { season: data.season })}>First page</Button> : undefined}>{data.match_count ? 'No matches on this page.' : 'No confirmed matches in this season.'}</Alert>}
    <Stack spacing={2}>
      {data.matches.map(match => <Paper key={match.id} variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{playedTime(match, data.group.time_zone)}{!match.started_at && ' · Closing date'}</Typography>
        <Typography component="h3" variant="h6" sx={{ overflowWrap: 'anywhere' }}>{match.team_a_name} {match.sets_a} × {match.sets_b} {match.team_b_name}</Typography>
        <Typography variant="body2">{resultText(match)}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ my: 1 }}>Sets: {match.sets.map(set => `${set.score_a} × ${set.score_b}`).join(' · ')}</Typography>
        <Button component="a" href={publicGroupHref(route.groupId, { season: data.season, page: data.page, matchId: match.id })}>View match</Button>
      </Paper>)}
    </Stack>
    {(pages > 1 || data.page > 1) && <Stack component="nav" aria-label="Match pages" direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mt: 3, gap: 1 }}>
      <Button component="a" disabled={data.page <= 1} href={publicGroupHref(route.groupId, { season: data.season, page: Math.max(1, data.page - 1) })}>Previous</Button>
      <Typography variant="body2">Page {data.page} of {pages}</Typography>
      <Button component="a" disabled={data.page >= pages} href={publicGroupHref(route.groupId, { season: data.season, page: data.page + 1 })}>Next</Button>
    </Stack>}
  </>;
}

function MatchDetails({ data, loading, refresh }) {
  return <>
    <Typography component="h1" variant="h4" sx={{ overflowWrap: 'anywhere' }}>{data.team_a_name} {data.sets_a} × {data.sets_b} {data.team_b_name}</Typography>
    <Stack direction="row" sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1, mt: 2, mb: 2 }}>
      <Chip label={resultText(data)} /><Button disabled={loading} onClick={refresh}>Refresh match</Button>
    </Stack>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>{playedTime(data, data.group.time_zone)}{!data.started_at && ' · Closing date (start time unavailable)'}</Typography>
    <Typography component="h2" variant="h5" sx={{ mb: 2 }}>Sets &amp; players</Typography>
    {data.sets.map(set => <Accordion key={set.number} defaultExpanded={set.number === 1} disableGutters sx={{ mb: 1, border: '1px solid', borderColor: 'divider', '&:before': { display: 'none' } }}>
      <AccordionSummary expandIcon={<ExpandMoreRounded />} aria-controls={`set-${set.number}-details`} id={`set-${set.number}-title`}>
        <Typography sx={{ overflowWrap: 'anywhere' }}>Set {set.number} · {set.team_a_name} {set.score_a} × {set.score_b} {set.team_b_name}</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 3 }}>
          {['A', 'B'].map(team => <Box key={team}>
            <Typography component="h3" variant="subtitle1" sx={{ mb: 1 }}>{team === 'A' ? set.team_a_name : set.team_b_name} · Points</Typography>
            <Box component="dl" sx={{ m: 0 }}>
              {set.players.filter(player => player.team === team).map(player => <Stack key={player.id} direction="row" sx={{ justifyContent: 'space-between', gap: 2, py: .5 }}>
                <Typography component="dt" variant="body2" sx={{ overflowWrap: 'anywhere' }}>{player.name}</Typography><Typography component="dd" variant="body2" sx={{ m: 0 }}>{player.points}</Typography>
              </Stack>)}
              <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 2, mt: 1 }}>
                <Typography component="dt" variant="body2" color="text.secondary">Opponent’s error</Typography><Typography component="dd" variant="body2" sx={{ m: 0 }}>{team === 'A' ? set.errors_a : set.errors_b}</Typography>
              </Stack>
            </Box>
          </Box>)}
        </Box>
      </AccordionDetails>
    </Accordion>)}
    <Typography variant="caption" color="text.secondary">Names and lineups are those recorded for each set. Player points exclude opponent errors.</Typography>
  </>;
}
