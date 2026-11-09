import SeasonFilters from './SeasonFilters';
import { currentPeriod } from '../game/seasonPeriods';
import { useEffect, useState } from 'react';
import { Alert, Button, Stack, TextField, Typography } from '@mui/material';
import { listGroupMatches } from '../remote/matchAdministration';
import { publicMatchDetails } from '../remote/publicStats';
import HistoricalMatchDialog from './HistoricalMatchDialog';
import MatchAdministration from '../public/MatchAdministration';
import { MatchCard, MatchDetails } from './GroupResults';
import ListPagination from './ListPagination';

export default function MatchManager({ client, group, dayId = null, initialDate, active = true, season = null, onSeasonChange, period = currentPeriod(), onPeriodChange, onChanged, refreshKey }) {
  const [query, setQuery] = useState(''); const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(5);
  const [selectedPeriod, setSelectedPeriod] = useState(period);
  const [selectedSeason, setSelectedSeason] = useState(season);
  const [data, setData] = useState(null); const [matchId, setMatchId] = useState(null); const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const [historical, setHistorical] = useState(null);
  const [editing, setEditing] = useState(false);
  const [attempt, setAttempt] = useState(0); const [message, setMessage] = useState('');
  const refresh = () => setAttempt(value => value + 1);
  useEffect(() => { setSelectedPeriod(period); setPage(1); }, [period]);
  useEffect(() => { setSelectedSeason(season); setPage(1); }, [season]);
  useEffect(() => {
    if (!active) return;
    let current = true; setLoading(true); setError('');
    const request = matchId ? publicMatchDetails(group.id, matchId, client) : listGroupMatches(group.id, { season: dayId ? null : selectedSeason, dayId, query, page, pageSize, period: dayId ? 'all' : selectedPeriod }, client);
    request.then(result => { if (current) { if (matchId) setDetail(result); else setData(result); } })
      .catch(failure => { if (current) setError(failure.message); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [client, group.id, dayId, active, selectedSeason, selectedPeriod, query, page, pageSize, matchId, attempt, refreshKey]);
  function open(match, edit = false) { setDetail(null); setMatchId(match.id); if (edit && !dayId && match.entry_mode === 'summary') setHistorical({ id: match.id }); else setEditing(edit && !dayId); setMessage(''); }
  return <Stack spacing={2}>
    {error && <Alert severity="warning" action={<Button onClick={refresh} disabled={loading}>Retry</Button>}>{error}</Alert>}
    {message && <Alert severity="success">{message}</Alert>}
    {matchId ? <>
      <Button sx={{ alignSelf: 'start' }} onClick={() => { setMatchId(null); setDetail(null); }}>← Back to matches</Button>
      {detail?.id === matchId && <><MatchDetails data={detail} loading={loading} refresh={refresh} />
        {!dayId && <Stack direction="row" spacing={1}><Button variant="outlined" onClick={() => detail.entry_mode === 'summary' ? setHistorical({ id: detail.id }) : setEditing(true)}>Edit match</Button></Stack>}
      </>}
    </> : <>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}><Typography component="h2" variant="h5">Finalized matches</Typography><Button variant="contained" onClick={() => setHistorical({ id: null })}>Register historical match</Button></Stack>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField size="small" label="Search matches" placeholder="Date, team or player name" value={query} sx={{ flex: 1 }} slotProps={{ htmlInput: { maxLength: 120 } }}
          onChange={event => { setQuery(event.target.value); setPage(1); }} />
        {!dayId && <SeasonFilters years={data?.seasons ?? []} year={selectedSeason} period={selectedPeriod} allYears
          onYearChange={next => { setSelectedSeason(next); setPage(1); onSeasonChange?.(next); }}
          onPeriodChange={next => { setSelectedPeriod(next); setPage(1); onPeriodChange?.(next); }} />}
        <Button disabled={loading} onClick={refresh}>Refresh matches</Button>
      </Stack>
      {data && <>
        <ListPagination label="Matches" total={data.total} page={data.page} pageSize={pageSize} count={data.matches.length} disabled={loading}
          onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1); }} />
        {!data.matches.length && <Typography>{query ? 'No matches found for this search.' : 'No finalized matches yet. Saved and synced matches appear here automatically.'}</Typography>}
        {data.matches.map(match => <MatchCard key={match.id} match={match} timeZone={group.time_zone} groupId={group.id} client={client} actions={<Stack direction="row" sx={{ flexWrap: 'wrap' }}>
          <Button onClick={() => open(match)}>View match</Button>{!dayId && <Button onClick={() => open(match, true)}>Edit match</Button>}
        </Stack>} />)}
      </>}
    </>}
    {loading && <Typography role="status">Loading matches…</Typography>}
    {active && historical && <HistoricalMatchDialog client={client} group={group} matchId={historical.id} initialDate={initialDate} dateLocked={Boolean(dayId && !historical.id)} onClose={() => setHistorical(null)} onSaved={saved => {
      if (!historical.id) { setQuery(''); setPage(1); }
      if (!dayId && saved.played_on) { const year = Number(saved.played_on.slice(0, 4)); setSelectedSeason(year); onSeasonChange?.(year); }
      setHistorical(null); setMatchId(saved.id); setDetail(null); refresh(); onChanged?.(); setMessage('Historical match saved. Statistics updated.');
    }} />}
    {active && !dayId && editing && matchId && <MatchAdministration groupId={group.id} matchId={matchId} onClose={() => setEditing(false)} onSaved={() => { refresh(); onChanged?.(); }} />}
  </Stack>;
}
