import { useEffect, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';
import { deleteFinalMatch, listGroupMatches } from '../remote/matchAdministration';
import { publicMatchDetails } from '../remote/publicStats';
import HistoricalMatchDialog from './HistoricalMatchDialog';
import MatchAdministration from '../public/MatchAdministration';
import { MatchCard, MatchDetails } from './GroupResults';
import ListPagination from './ListPagination';

export default function MatchManager({ client, group, dayId = null, initialDate, active = true, season = null, onSeasonChange, onChanged, refreshKey }) {
  const [query, setQuery] = useState(''); const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(5);
  const [selectedSeason, setSelectedSeason] = useState(season);
  const [data, setData] = useState(null); const [matchId, setMatchId] = useState(null); const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [historical, setHistorical] = useState(null);
  const [editing, setEditing] = useState(false); const [deleting, setDeleting] = useState(null); const [reason, setReason] = useState('');
  const [attempt, setAttempt] = useState(0); const [message, setMessage] = useState('');
  const refresh = () => setAttempt(value => value + 1);
  useEffect(() => { setSelectedSeason(season); setPage(1); }, [season]);
  useEffect(() => {
    if (!active) return;
    let current = true; setLoading(true); setError('');
    const request = matchId ? publicMatchDetails(group.id, matchId, client) : listGroupMatches(group.id, { season: dayId ? null : selectedSeason, dayId, query, page, pageSize }, client);
    request.then(result => { if (current) { if (matchId) setDetail(result); else setData(result); } })
      .catch(failure => { if (current) setError(failure.message); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [client, group.id, dayId, active, selectedSeason, query, page, pageSize, matchId, attempt, refreshKey]);
  function open(match, edit = false) { setDetail(null); setMatchId(match.id); if (edit && match.entry_mode === 'summary') setHistorical({ id: match.id }); else setEditing(edit); setMessage(''); }
  function askDelete(match) { setDeleting(match); setReason(''); setError(''); }
  async function remove() {
    if (busy) return; setBusy(true); setError('');
    try {
      await deleteFinalMatch(group.id, deleting, reason, client);
      setDeleting(null); setMatchId(null); setDetail(null); setMessage('Match deleted. Results and statistics updated.'); refresh(); onChanged?.();
    } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }
  return <Stack spacing={2}>
    {error && !deleting && <Alert severity="warning" action={<Button onClick={refresh} disabled={loading}>Retry</Button>}>{error}</Alert>}
    {message && <Alert severity="success">{message}</Alert>}
    {matchId ? <>
      <Button sx={{ alignSelf: 'start' }} onClick={() => { setMatchId(null); setDetail(null); }}>← Back to matches</Button>
      {detail?.id === matchId && <><MatchDetails data={detail} loading={loading} refresh={refresh} />
        <Stack direction="row" spacing={1}><Button variant="outlined" onClick={() => detail.entry_mode === 'summary' ? setHistorical({ id: detail.id }) : setEditing(true)}>Edit match</Button><Button color="warning" onClick={() => askDelete(detail)}>Delete match</Button></Stack>
      </>}
    </> : <>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}><Typography component="h2" variant="h5">Finalized matches</Typography><Button variant="contained" onClick={() => setHistorical({ id: null })}>Register historical match</Button></Stack>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField size="small" label="Search matches" placeholder="Date, team or player name" value={query} sx={{ flex: 1 }} slotProps={{ htmlInput: { maxLength: 120 } }}
          onChange={event => { setQuery(event.target.value); setPage(1); }} />
        {!dayId && <TextField select size="small" label="Season" value={selectedSeason ?? ''} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }} sx={{ minWidth: 130 }}
          onChange={event => { const next = event.target.value ? Number(event.target.value) : null; setSelectedSeason(next); setPage(1); onSeasonChange?.(next); }}>
          <option value="">All seasons</option>{[...new Set([...(data?.seasons ?? []), ...(selectedSeason ? [selectedSeason] : [])])].map(year => <option key={year} value={year}>{year}</option>)}
        </TextField>}
        <Button disabled={loading} onClick={refresh}>Refresh matches</Button>
      </Stack>
      {data && <>
        <ListPagination label="Matches" total={data.total} page={data.page} pageSize={pageSize} count={data.matches.length} disabled={loading}
          onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1); }} />
        {!data.matches.length && <Typography>{query ? 'No matches found for this search.' : 'No finalized matches yet. Saved and synced matches appear here automatically.'}</Typography>}
        {data.matches.map(match => <MatchCard key={match.id} match={match} timeZone={group.time_zone} groupId={group.id} client={client} actions={<Stack direction="row" sx={{ flexWrap: 'wrap' }}>
          <Button onClick={() => open(match)}>View match</Button><Button onClick={() => open(match, true)}>Edit match</Button><Button color="warning" onClick={() => askDelete(match)}>Delete match</Button>
        </Stack>} />)}
      </>}
    </>}
    {loading && <Typography role="status">Loading matches…</Typography>}
    {active && historical && <HistoricalMatchDialog client={client} group={group} matchId={historical.id} initialDate={initialDate} dateLocked={Boolean(dayId && !historical.id)} onClose={() => setHistorical(null)} onSaved={saved => {
      if (!historical.id) { setQuery(''); setPage(1); }
      if (!dayId && saved.played_on) { const year = Number(saved.played_on.slice(0, 4)); setSelectedSeason(year); onSeasonChange?.(year); }
      setHistorical(null); setMatchId(saved.id); setDetail(null); refresh(); onChanged?.(); setMessage('Historical match saved. Statistics updated.');
    }} />}
    {active && editing && matchId && <MatchAdministration groupId={group.id} matchId={matchId} onClose={() => setEditing(false)} onSaved={() => { refresh(); onChanged?.(); }} />}
    <Dialog open={Boolean(active && deleting)} fullWidth maxWidth="xs" onClose={() => { if (!busy) setDeleting(null); }} aria-labelledby="delete-final-match-title">
      <DialogTitle id="delete-final-match-title">Delete this match?</DialogTitle>
      <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
        <Typography>{deleting?.team_a_name} {deleting?.sets_a} × {deleting?.sets_b} {deleting?.team_b_name}</Typography>
        <Typography>The match will be removed from results and player statistics. Other matches, the game day and registered players are kept.</Typography>
        {error && <Alert severity="warning">{error}</Alert>}
        <TextField required label="Reason for deleting match" value={reason} disabled={busy} onChange={event => setReason(event.target.value)} slotProps={{ htmlInput: { maxLength: 500 } }} />
      </Stack></DialogContent>
      <DialogActions><Button disabled={busy} onClick={() => setDeleting(null)}>Keep match</Button><Button color="warning" disabled={busy || !reason.trim()} onClick={remove}>Delete match</Button></DialogActions>
    </Dialog>
  </Stack>;
}
