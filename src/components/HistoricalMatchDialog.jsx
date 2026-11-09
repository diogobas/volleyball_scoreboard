import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Stack, TextField, Typography } from '@mui/material';
import { dayRpc } from '../remote/gameDays';
import { createLocalId } from '../game/storage';
import PlayerSelect from './PlayerSelect';
import PlayerFormDialog from './PlayerFormDialog';
import { competitiveTeam, historicalPlayerKey, updateHistoricalPlayer } from '../game/historicalPlayers';
import { historicalErrors, matchResult } from '../game/matchResult';

const emptyPlayer = team => ({ team, player_id: null, name: '', points: '' });
export default function HistoricalMatchDialog({ client, group, matchId, initialDate, dateLocked = false, onClose, onSaved }) {
  const revision = useRef(null);
  const [addingPlayerAt, setAddingPlayerAt] = useState(null);
  const [players, setPlayers] = useState([]); const [version, setVersion] = useState(null);
  const [draft, setDraft] = useState(() => ({ format_version: 3, id: matchId ?? createLocalId(), group_id: group.id, played_on: initialDate ?? '', rules: 'recreational', team_a_name: 'Team 1', team_b_name: 'Team 2',
    ended_as_draw: false, player_totals_recorded: false, sets: [{ score_a: '', score_b: '', early_finish: false }], players: ['A', 'B'].flatMap(team => Array.from({ length: 6 }, () => emptyPlayer(team))), errors_a: 0, errors_b: 0 }));
  const [reason, setReason] = useState(matchId ? '' : 'Historical match');
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [showErrors, setShowErrors] = useState(false);
  const issues = historicalErrors(draft); const result = matchResult(draft.sets, { endedAsDraw: draft.ended_as_draw === true, rules: draft.rules });
  const canDraw = !matchResult(draft.sets.slice(0, -1)).winner;
  const change = patch => setDraft(previous => { const next = { ...previous, ...patch }; if (matchResult(next.sets.slice(0, -1)).winner) next.ended_as_draw = false; return next; });
  useEffect(() => {
    let active = true;
    Promise.all([dayRpc('get_group_registry', { p_group_id: group.id }, client), matchId ? dayRpc('get_historical_match', { p_group_id: group.id, p_match_id: matchId }, client) : null])
      .then(([registry, existing]) => { if (active) { setPlayers(registry.players); if (existing) { setDraft({ ...existing.payload, player_totals_recorded: existing.payload.player_totals_recorded ?? true, players: existing.payload.players.length ? existing.payload.players : ['A', 'B'].flatMap(team => Array.from({ length: 6 }, () => emptyPlayer(team))), errors_a: existing.payload.errors_a ?? 0, errors_b: existing.payload.errors_b ?? 0 }); setVersion(existing.version); } } })
      .catch(failure => { if (active) setError(failure.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [client, group.id, matchId]);
  async function save(event) {
    event.preventDefault(); setShowErrors(true); if (issues.length || busy || !reason.trim()) return;
    setBusy(true); setError('');
    const signature = JSON.stringify({ draft, version, reason });
    if (revision.current?.signature !== signature) revision.current = { signature, id: createLocalId() };
    try {
      const saved = await dayRpc('save_historical_match', { p_group_id: group.id, p_match: draft.player_totals_recorded ? draft : { ...draft, players: [], errors_a: null, errors_b: null }, p_expected_version: version, p_reason: reason, p_revision_id: revision.current.id }, client);
      onSaved({ ...saved, played_on: draft.played_on });
    } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }
  const number = value => value === '' ? '' : Number(value);
  return <><Dialog open fullWidth maxWidth="md" onClose={() => { if (!busy) onClose(); }} aria-labelledby="historical-match-title">
    <Box component="form" onSubmit={save} sx={{ display: 'contents' }}>
      <DialogTitle id="historical-match-title">{matchId ? 'Edit historical match' : 'Register historical match'}</DialogTitle>
      <DialogContent dividers><Stack spacing={3}>
        {loading && <Typography role="status">Loading players…</Typography>}
        {error && <Alert severity="warning">{error}</Alert>}
        <Alert severity="info">Enter the set scores. Player totals for the whole match are optional. Sets played after a team wins three sets are training.</Alert>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField required type="date" label="Match date" value={draft.played_on} disabled={busy || loading || dateLocked} onChange={event => change({ played_on: event.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField select label="Match format" value={draft.rules} disabled={busy || loading} onChange={event => change({ rules: event.target.value, ...(event.target.value === 'official' ? { sets: draft.sets.map(set => ({ ...set, early_finish: false })) } : {}) })} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }} sx={{ minWidth: 250 }}>
            <option value="recreational">Recreational · all sets to 25</option><option value="official">Official · fifth set to 15</option>
          </TextField>
        </Stack>
        <Typography variant="body2" color="text.secondary">Official sets require a two-point lead. For an abbreviated recreational set, select Ended early. If the match could not be completed, select Finish as draw. An interrupted final set can keep its recorded score when marked Ended early. Later training sets do not change the match winner.</Typography>
        <Stack spacing={1}>
          {result.sets.map((set, index) => <Stack key={index} direction="row" sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
            <Typography sx={{ minWidth: 90 }}>Set {index + 1}{set.interrupted ? ' · Interrupted' : set.training ? ' · Training' : ''}</Typography>
            {['score_a', 'score_b'].map((key, team) => <TextField key={key} type="number" size="small" label={`Set ${index + 1} · Team ${team + 1}`} value={set[key]} disabled={busy || loading} sx={{ width: 130 }}
              slotProps={{ htmlInput: { min: 0, max: 10000, step: 1 } }} onChange={event => change({ sets: draft.sets.map((item, i) => i === index ? { ...item, [key]: number(event.target.value) } : item) })} />)}
            {(draft.rules === 'recreational' || (draft.ended_as_draw && index === draft.sets.length - 1)) && !set.training && <FormControlLabel label="Ended early" control={<Checkbox checked={set.early_finish} disabled={busy || loading} onChange={event => change({ sets: draft.sets.map((item, i) => i === index ? { ...item, early_finish: event.target.checked } : item) })} />} />}
            <Button color="warning" disabled={busy || loading || draft.sets.length === 1} onClick={() => change({ sets: draft.sets.filter((_, i) => i !== index) })}>Remove set {index + 1}</Button>
          </Stack>)}
          <Button sx={{ alignSelf: 'start' }} disabled={busy || loading || draft.sets.length >= 100} onClick={() => change({ sets: [...draft.sets, { score_a: '', score_b: '', early_finish: false }] })}>Add set</Button>
          {canDraw && <FormControlLabel label="Finish as draw" control={<Checkbox checked={draft.ended_as_draw === true} disabled={busy || loading} onChange={event => change({ ended_as_draw: event.target.checked })} />} />}
          <Alert severity={result.winner ? 'success' : 'info'}>{result.winner ? `Winner: ${draft[result.winner === 'A' ? 'team_a_name' : 'team_b_name']} · ${result.setsA} × ${result.setsB}. ${result.trainingSets} training sets.` : draft.ended_as_draw ? `Draw · ${result.setsA} × ${result.setsB}. Scores and points are preserved; no individual wins are awarded.` : `Unfinished match · ${result.setsA} × ${result.setsB}. A team needs three set wins.`}</Alert>
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          {['team_a_name', 'team_b_name'].map((key, index) => <TextField key={key} label={`Team ${index + 1} name`} value={draft[key]} disabled={busy || loading} slotProps={{ htmlInput: { maxLength: 16 } }} onChange={event => change({ [key]: event.target.value })} />)}
        </Stack>
        <FormControlLabel label="Include player totals (optional)" control={<Checkbox checked={draft.player_totals_recorded} disabled={busy || loading} onChange={event => change({ player_totals_recorded: event.target.checked })} />} />
        {draft.player_totals_recorded && <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 3 }}>
          {['A', 'B'].map((team, teamIndex) => <Stack key={team} spacing={1.5}>
            {draft.players.map((player, index) => player.team === team && <Stack key={index} spacing={1}><Stack direction="row" spacing={1}>
              <PlayerSelect label={`Team ${teamIndex + 1} · Player ${draft.players.slice(0, index).filter(p => p.team === team).length + 1}`} player={{ id: player.player_id, name: player.name }} players={players} disabled={busy || loading} sx={{ flex: 1, minWidth: 0 }}
                excludedIds={draft.players.filter((p, i) => i !== index && p.team === team).map(p => p.player_id)}
                onAddPlayer={() => setAddingPlayerAt(index)} onChange={selected => change({ players: updateHistoricalPlayer(draft.players, index, { name: selected?.name ?? '', player_id: selected?.id ?? null }) })} />
              <TextField label={`Points · ${player.name || `Player ${index + 1}`}`} type="number" value={player.points} disabled={busy || loading} sx={{ width: 100 }} slotProps={{ htmlInput: { min: 0, max: 100000, step: 1 } }} onChange={event => change({ players: draft.players.map((p, i) => i === index ? { ...p, points: number(event.target.value) } : p) })} />
              {draft.players.filter(p => p.team === team).length > 6 && <Button size="small" color="warning" disabled={busy} aria-label={`Remove ${player.name || 'player'}`} onClick={() => change({ players: draft.players.filter((_, i) => i !== index) })}>×</Button>}
            </Stack>
              {player.name && draft.players.some((other, i) => i !== index && historicalPlayerKey(other) === historicalPlayerKey(player)) && <TextField select size="small" label={`Match team · ${player.name} · Team ${teamIndex + 1} points`} value={competitiveTeam(player) ?? ''} disabled={busy || loading}
                helperText="Team played for before the match was decided. Training does not change wins."
                slotProps={{ select: { native: true }, inputLabel: { shrink: true } }} onChange={event => change({ players: updateHistoricalPlayer(draft.players, index, { result_team: event.target.value || null }) })}>
                <option value="">Both teams / unknown</option><option value="A">{draft.team_a_name}</option><option value="B">{draft.team_b_name}</option>
              </TextField>}
            </Stack>)}
            <Button disabled={busy || loading || draft.players.length >= 200} onClick={() => change({ players: [...draft.players, emptyPlayer(team)] })}>Add player · Team {teamIndex + 1}</Button>
            <TextField label={`Opponent errors · Team ${teamIndex + 1}`} type="number" value={draft[team === 'A' ? 'errors_a' : 'errors_b']} disabled={busy || loading} slotProps={{ htmlInput: { min: 0, step: 1 } }} onChange={event => change({ [team === 'A' ? 'errors_a' : 'errors_b']: number(event.target.value) })} />
            <Typography variant="body2" color="text.secondary">Team total: {draft.players.filter(p => p.team === team).reduce((sum, p) => sum + Number(p.points), Number(draft[team === 'A' ? 'errors_a' : 'errors_b']))} / {draft.sets.reduce((sum, s) => sum + Number(s[team === 'A' ? 'score_a' : 'score_b']), 0)}</Typography>
          </Stack>)}
        </Box>}
        <TextField required label="Reason for historical record" value={reason} disabled={busy || loading} onChange={event => setReason(event.target.value)} slotProps={{ htmlInput: { maxLength: 500 } }} />
        {showErrors && issues.length > 0 && <Alert severity="warning">{issues.map(issue => <Typography key={issue} variant="body2">{issue}</Typography>)}</Alert>}
      </Stack></DialogContent>
      <DialogActions><Button disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" variant="contained" disabled={busy || loading}>{busy ? 'Saving…' : 'Save historical match'}</Button></DialogActions>
    </Box>
  </Dialog>
    {addingPlayerAt !== null && <PlayerFormDialog client={client} groupId={group.id} onClose={() => setAddingPlayerAt(null)} onSaved={saved => {
      setPlayers(previous => [...previous.filter(p => p.id !== saved.id), saved]);
      setDraft(previous => ({ ...previous, players: updateHistoricalPlayer(previous.players, addingPlayerAt, { name: saved.name, player_id: saved.id }) }));
      setAddingPlayerAt(null);
    }} />}
  </>;
}
