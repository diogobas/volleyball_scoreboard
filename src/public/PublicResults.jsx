import { useEffect, useState } from 'react';
import { Alert, Box, Button, Chip, Container, Divider, Pagination, PaginationItem, Paper, Stack, Tab, Tabs, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';
import SportsVolleyballRounded from '@mui/icons-material/SportsVolleyballRounded';
import { listPublicGroups, publicGroupSummary, publicMatchDetails } from '../remote/publicStats';
import StatisticsView from '../components/StatisticsView';
import { publicMatchStatistics } from './matchStatistics';
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
      ? publicMatchDetails(route.groupId, route.matchId) : publicGroupSummary(route.groupId, route.season, route.page, undefined, route.pageSize);
    request.then(result => { if (active) setData(result); }).catch(failure => {
      if (active) setError(failure.message || 'Public results could not be loaded. Check your connection and retry.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [route.kind, route.groupId, route.matchId, route.season, route.page, route.pageSize, attempt]);

  const group = route.kind === 'groups' ? null : data?.group;
  return <Container component="main" maxWidth="lg" sx={{ py: { xs: 2, sm: 4 }, pb: 6 }}>
    <Stack component="header" direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 4 }}>
      <Stack component="a" href="#/groups" direction="row" spacing={1} sx={{ alignItems: 'center', color: 'text.primary', textDecoration: 'none' }}>
        <SportsVolleyballRounded color="primary" /><Typography variant="overline" sx={{ lineHeight: 1.3 }}>Volleyball<br />Public results</Typography>
      </Stack>
      <Button component="a" href="#/admin" variant="outlined" size="small">Administration</Button>
    </Stack>
    {route.kind === 'missing' ? <><Typography component="h1" variant="h3">Page not found</Typography><Button component="a" href="#/groups">Browse groups</Button></> : <>
      {route.kind !== 'groups' && <Button component="a" href={route.kind === 'match' ? publicGroupHref(route.groupId, { season: route.season, page: route.page, pageSize: route.pageSize, view: 'matches' }) : '#/groups'} sx={{ mb: 2 }}>
        {route.kind === 'match' ? '← Back to matches' : '← All groups'}
      </Button>}
      {route.kind === 'groups' && <><Typography component="h1" variant="h3" sx={{ mb: 1 }}>Results &amp; seasons</Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>Choose a group to see published matches and player statistics. No sign-in required.</Typography></>}
      {group && <><Typography component={route.kind === 'match' ? 'p' : 'h1'} variant={route.kind === 'match' ? 'h5' : 'h3'} sx={{ overflowWrap: 'anywhere' }}>{group.name}</Typography>
        <Typography color="text.secondary" variant="body2" sx={{ mt: 1, mb: 3 }}>{group.time_zone} · Published results</Typography></>}
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
    <Typography component="footer" variant="caption" color="text.secondary">Only published results appear here. Received matches remain private until an administrator closes their game day.</Typography>
  </Container>;
}

function GroupSeason({ data, route, loading, refresh }) {
  const pages = Math.max(1, Math.ceil(data.match_count / data.page_size));
  const view = route.view ?? 'overview';
  return <>
    <Stack direction="row" spacing={2} sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
      <TextField select label="Season" value={data.season} onChange={event => { window.location.hash = publicGroupHref(route.groupId, { season: Number(event.target.value), view, pageSize: route.pageSize }).slice(1); }}
        slotProps={{ select: { native: true }, inputLabel: { shrink: true } }} size="small" sx={{ minWidth: 120 }}>
        {data.seasons.map(year => <option key={year} value={year}>{year}</option>)}
      </TextField>
      <Button disabled={loading} onClick={refresh}>Refresh results</Button>
    </Stack>
    <Box component="nav" aria-label="Group navigation" sx={{ mb: 3 }}>
      <Tabs value={view} variant="fullWidth" aria-label="Group sections">
        {['overview', 'players', 'matches'].map(section => <Tab key={section} component="a" value={section}
          id={`group-tab-${section}`} aria-controls={`group-section-${section}`}
          label={section === 'overview' ? 'Overview' : section === 'players' ? 'Players' : 'Matches'}
          href={publicGroupHref(route.groupId, { season: route.season, page: route.page, pageSize: route.pageSize, view: section })} />)}
      </Tabs>
    </Box>
    <Box role="tabpanel" id={`group-section-${view}`} aria-labelledby={`group-tab-${view}`}>
      {view === 'overview' && <>
        <Typography component="h2" variant="h5" sx={{ mb: 2 }}>Season overview · {data.season}</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: { xs: 1, sm: 2 }, mb: 4 }}>
          {[[data.match_count, 'Matches', 'matches'], [data.participant_count, 'Players', 'players'], [data.point_count, 'Points played', null]].map(([value, label, section]) => <Paper key={label} variant="outlined"
            component={section ? 'a' : 'div'} href={section ? publicGroupHref(route.groupId, { season: route.season, page: route.page, pageSize: route.pageSize, view: section }) : undefined}
            aria-label={section ? `View ${label.toLowerCase()}` : undefined}
            sx={{ p: { xs: 1.5, sm: 2.5 }, display: 'block', color: 'inherit', textDecoration: 'none', ...(section && {
              '&:hover': { borderColor: 'primary.main' }, '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
            }) }}>
            <Typography sx={{ font: '700 2.5rem/1 "Barlow Condensed", sans-serif', mb: 1 }}>{value}</Typography><Typography variant="body2" color="text.secondary">{label}</Typography>
          </Paper>)}
        </Box>
        <Typography variant="body2" color="text.secondary">Choose Players for individual statistics or Matches to browse published results.</Typography>
      </>}
      {view === 'players' && <>
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
      </>}
      {view === 'matches' && <>
        <Typography component="h2" variant="h5" sx={{ mb: 2 }}>Matches · {data.season}</Typography>
        {data.matches.length === 0 && <Alert severity="info" action={data.match_count ? <Button component="a" href={publicGroupHref(route.groupId, { season: data.season, pageSize: data.page_size, view: 'matches' })}>First page</Button> : undefined}>{data.match_count ? 'No matches on this page.' : 'No confirmed matches in this season.'}</Alert>}
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2, mb: 2 }}>
          <Typography variant="body2" color="text.secondary">{data.matches.length ? (data.page - 1) * data.page_size + 1 : 0}–{data.matches.length ? (data.page - 1) * data.page_size + data.matches.length : 0} of {data.match_count} matches</Typography>
          <TextField select label="Matches per page" value={data.page_size} size="small" sx={{ minWidth: 155 }}
            slotProps={{ select: { native: true }, inputLabel: { shrink: true } }} onChange={event => {
              window.location.hash = publicGroupHref(route.groupId, { season: data.season, view: 'matches', pageSize: Number(event.target.value) }).slice(1);
            }}>
            {[5,10,25].map(size => <option key={size} value={size}>{size}</option>)}
          </TextField>
        </Stack>
        <Stack spacing={2}>
          {data.matches.map(match => <Paper key={match.id} variant="outlined" sx={{ p: { xs: 2, sm: 3 }, display: 'grid',
            gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(0, 1fr) minmax(0, 1.4fr)' }, alignItems: 'center', gap: { xs: 2, sm: 3 } }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{playedTime(match, data.group.time_zone)}{!match.started_at && ' · Closing date'}</Typography>
              <Typography component="h3" variant="h6" sx={{ overflowWrap: 'anywhere' }}>{match.team_a_name} {match.sets_a} × {match.sets_b} {match.team_b_name}</Typography>
              <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{resultText(match)}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ my: 1 }}>Sets: {match.sets.map(set => `${set.score_a} × ${set.score_b}`).join(' · ')}</Typography>
              <Button component="a" href={publicGroupHref(route.groupId, { season: data.season, page: data.page, pageSize: data.page_size, matchId: match.id })}>View match</Button>
            </Box>
            <MatchTopScorers groupId={route.groupId} match={match} />
          </Paper>)}
        </Stack>
        <Stack component="nav" aria-label="Match pages" sx={{ alignItems: 'center', mt: 3, gap: 1 }}>
          <Pagination count={pages} page={data.page} size="small" siblingCount={0} boundaryCount={1}
            renderItem={item => <PaginationItem {...item} component="a" href={publicGroupHref(route.groupId, {
              season: data.season, page: Math.max(1, item.page ?? 1), pageSize: data.page_size, view: 'matches',
            })} />} />
          <Typography variant="body2" color="text.secondary">Page {data.page} of {pages}</Typography>
        </Stack>
      </>}
    </Box>
  </>;
}

function MatchTopScorers({ groupId, match }) {
  const [players, setPlayers] = useState(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setPlayers(null); setFailed(false);
    publicMatchDetails(groupId, match.id).then(data => {
      if (active) setPlayers(publicMatchStatistics(data).topPlayers);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [groupId, match, attempt]);

  return <Box sx={{ minWidth: 0 }}>
    <Typography component="h4" variant="subtitle2" sx={{ mb: 1 }}>Top scorers</Typography>
    {failed ? <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
      <Typography variant="body2" color="text.secondary">Scorers could not be loaded.</Typography>
      <Button size="small" onClick={() => setAttempt(value => value + 1)}>Retry scorers</Button>
    </Stack> : players === null ? <Typography variant="body2" color="text.secondary" role="status">Loading scorers…</Typography>
      : players.length === 0 ? <Typography variant="body2" color="text.secondary">No player points recorded.</Typography>
        : <Box component="ol" aria-label={`Top scorers for ${match.team_a_name} vs ${match.team_b_name}`}
          sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 1, listStyle: 'none', p: 0, m: 0 }}>
          {players.map(player => <Box component="li" key={player.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.25,
            bgcolor: 'action.hover', borderRadius: 1, minWidth: 0 }}>
            <Typography variant="body2" color="text.secondary">{players.findIndex(item => item.points === player.points) + 1}.</Typography>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{player.name}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{player.teamName}</Typography>
            </Box>
            <Typography variant="body2" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{player.points} {player.points === 1 ? 'pt' : 'pts'}</Typography>
          </Box>)}
        </Box>}
  </Box>;
}

function MatchDetails({ data, loading, refresh }) {
  const statistics = publicMatchStatistics(data);
  return <>
    <Typography component="h1" variant="h4" sx={{ overflowWrap: 'anywhere' }}>{data.team_a_name} {data.sets_a} × {data.sets_b} {data.team_b_name}</Typography>
    <Stack direction="row" sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1, mt: 2, mb: 2 }}>
      <Chip label={resultText(data)} /><Button disabled={loading} onClick={refresh}>Refresh match</Button>
    </Stack>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>{playedTime(data, data.group.time_zone)}{!data.started_at && ' · Closing date (start time unavailable)'}</Typography>
    <StatisticsView {...statistics} />
    <Typography variant="caption" color="text.secondary">Names and lineups are those recorded for each set. Player points exclude opponent errors.</Typography>
  </>;
}
