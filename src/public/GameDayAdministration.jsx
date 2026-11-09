import { useEffect, useState } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';
import MatchManager from '../components/MatchManager';
import GameDayList from '../components/GameDayList';
import PlayerRegistry from '../components/PlayerRegistry';
import SectionNavigation from '../components/SectionNavigation';
import { dayRpc } from '../remote/gameDays';

const emptyLineup = () => ({ A: { name: 'Team 1', players: Array(6).fill(null) }, B: { name: 'Team 2', players: Array(6).fill(null) } });
const todayIn = zone => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export default function GameDayAdministration({ client, group, view = 'days', onRegistryChanged }) {
  const [creating, setCreating] = useState(false);
  const [dayView, setDayView] = useState('inbox');
  const [editDate, setEditDate] = useState('');
  const [deleting, setDeleting] = useState(null); const [deleteReason, setDeleteReason] = useState('');
  const [players, setPlayers] = useState([]); const [days, setDays] = useState([]); const [context, setContext] = useState(null);
  const [lineup, setLineup] = useState(emptyLineup); const [date, setDate] = useState(() => todayIn(group.time_zone));
  const [registryLoading, setRegistryLoading] = useState(true);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [reason, setReason] = useState(''); const [code, setCode] = useState(''); const [message, setMessage] = useState('');
  const rpc = (name, args) => dayRpc(name, args, client);
  async function refresh(dayId = context?.day.id) {
    const [registry, list] = await Promise.all([rpc('get_group_registry', { p_group_id: group.id }), rpc('list_game_days', { p_group_id: group.id })]);
    setPlayers(registry.players); setDays(list);
    if (dayId) {
      const next = await rpc('get_game_day', { p_day_id: dayId }); setContext(next);
      setLineup(next.lineup ?? emptyLineup()); setEditDate(next.day.play_date);
    }
  }
  useEffect(() => { let active = true; Promise.all([rpc('get_group_registry', { p_group_id: group.id }), rpc('list_game_days', { p_group_id: group.id })]).then(([registry, list]) => { if (active) { setPlayers(registry.players); setDays(list); } }).catch(f => { if (active) setError(f.message); }).finally(() => { if (active) setRegistryLoading(false); }); return () => { active = false; }; }, [client, group.id]);
  async function run(action) {
    if (busy) return; setBusy(true); setError(''); setMessage('');
    try { await action(); } catch (failure) { setError(failure.message || 'Request failed. Refresh before trying again.'); }
    finally { setBusy(false); }
  }
  async function change(action) {
    await run(async () => {
      const result = await rpc('change_game_day', { p_day_id: context.day.id, p_expected_version: context.day.version, p_action: action, p_lineup: action === 'lineup' ? lineup : null, p_reason: reason });
      setCode(result.code ?? ''); setReason(''); await refresh(context.day.id);
      onRegistryChanged?.(); setMessage(action === 'close' ? 'Day closed.' : 'Changes saved.');
    });
  }
  function openDay(day, section) {
    setDayView(section); setReason(''); setCode('');
    void run(() => refresh(day.id));
  }
  function askDelete(day) { setError(''); setDeleting(day); setDeleteReason(''); }
  return <Box hidden={!['players', 'days'].includes(view)}><Stack spacing={2}>
    {view === 'days' && <Typography component="h3" variant="h5">Game days</Typography>}
    {error && <Alert severity="warning">{error}</Alert>}{message && <Alert severity="success">{message}</Alert>}
    {code && view === 'days' && dayView === 'publish' && <Alert severity="info"><Typography>Share this code with the scoreboard operator. Copy it now; it is shown only once.</Typography><TextField label="Game-day code" fullWidth value={code} slotProps={{ input: { readOnly: true }, htmlInput: { style: { fontFamily: 'monospace', letterSpacing: '0.12em', fontSize: '1.2rem' } } }} onFocus={event => event.target.select()} sx={{ mt: 1 }} /><Button onClick={() => { navigator.clipboard?.writeText(code).catch(() => setError('Select the code and copy it manually.')); }}>Copy code</Button></Alert>}
    <Box hidden={view !== 'players'}><PlayerRegistry client={client} groupId={group.id} group={group} players={players} loading={registryLoading}
      onChanged={async () => {
        const registry = await rpc('get_group_registry', { p_group_id: group.id });
        setPlayers(registry.players);
        if (context?.day.state !== 'closed') setLineup(previous => Object.fromEntries(['A', 'B'].map(team => [team, {
          ...previous[team], players: previous[team].players.map(person => {
            const current = registry.players.find(player => player.id === person?.id);
            return current ? { id: current.id, name: current.name } : null;
          }),
        }])));
        onRegistryChanged?.();
      }} /></Box>
    <Box hidden={view !== 'days'}><Stack spacing={2}>
    {context && <Button disabled={busy} onClick={() => run(() => refresh())}>Refresh game days</Button>}
    <Box hidden={Boolean(context) || creating}>
      <GameDayList days={days} busy={busy} loading={registryLoading}
        onCreate={() => { setCreating(true); setLineup(emptyLineup()); setError(''); setMessage(''); }}
        onRefresh={() => run(() => refresh(null))} onOpen={day => openDay(day, 'inbox')} onEdit={day => openDay(day, 'details')} onDelete={askDelete} />
    </Box>
    {context ? <>
      <Button disabled={busy} onClick={() => { setContext(null); setCreating(false); setLineup(emptyLineup()); setCode(''); }}>Back to game days</Button>
      <Button color="warning" sx={{ alignSelf: 'start' }} disabled={busy || context.receipts.some(receipt => receipt.decision === 'approved')} onClick={() => askDelete(context.day)}>Delete game day</Button>
      <Typography component="h4" variant="h6">{context.day.play_date} · {context.day.state} · Version {context.day.version}</Typography>
      <SectionNavigation value={dayView} onChange={setDayView} disabled={busy} label="Game day sections" sections={[
        { id: 'details', label: 'Details' },
        { id: 'inbox', label: 'Matches' },
        { id: 'lineup', label: 'Lineup' }, { id: 'publish', label: 'Code & status' }, { id: 'history', label: 'History' },
      ]} />
    </> : <>
      {creating && <><Button disabled={busy} onClick={() => setCreating(false)}>Cancel creation</Button>
      <Typography component="h4" variant="h6">Create game day</Typography>
      <TextField type="date" label="Date" value={date} disabled={busy} onChange={e => setDate(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} /></>}
    </>}
    {((!context && creating) || (context && dayView === 'lineup')) && <>
      <LineupEditor lineup={lineup} players={players} disabled={busy || context?.day.state === 'closed'} onChange={setLineup} />
      {!context && <Button variant="contained" disabled={busy} onClick={() => run(async () => {
        const result = await rpc('create_game_day', { p_group_id: group.id, p_date: date, p_lineup: lineup }); setCode(result.code); setCreating(false); setDayView('publish'); await refresh(result.day.id);
      })}>Create day &amp; code</Button>}
    </>}
    {context && <>
      <Box hidden={dayView !== 'details'}><Stack component="form" spacing={2} onSubmit={event => { event.preventDefault(); void run(async () => {
        await rpc('edit_game_day', { p_day_id: context.day.id, p_expected_version: context.day.version, p_date: editDate, p_reason: reason });
        await refresh(context.day.id); setReason(''); setMessage('Game day updated.');
      }); }}>
        <Typography component="h4" variant="h6">Edit game day</Typography>
        <TextField type="date" required label="Date" value={editDate} disabled={busy} onChange={event => setEditDate(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <Typography variant="body2" color="text.secondary">This is the scheduled date. Recorded match dates and season statistics stay unchanged. Use Lineup to edit teams and players; reopen a closed day before changing its lineup.</Typography>
        <TextField required label="Reason for date change" value={reason} disabled={busy} onChange={event => setReason(event.target.value)} slotProps={{ htmlInput: { maxLength: 500 } }} />
        <Button type="submit" variant="contained" disabled={busy || !editDate || !reason.trim() || editDate === context.day.play_date}>Save game day</Button>
      </Stack></Box>
      <Box hidden={!['lineup', 'publish'].includes(dayView)}><Stack spacing={2}>
      {dayView === 'publish' && <Alert severity="info">Synced matches are finalized automatically. Closing or reopening the day does not change results.</Alert>}
      <TextField label="Reason for day change" value={reason} disabled={busy} onChange={e => setReason(e.target.value)} slotProps={{ htmlInput: { maxLength: 500 } }} />
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
        {dayView === 'lineup' && context.day.state === 'open' && <Button disabled={busy || !reason.trim()} onClick={() => change('lineup')}>Save lineup version</Button>}
        {dayView === 'publish' && <><Button disabled={busy || !reason.trim() || context.day.lineup_version === 0} onClick={() => change('rotate_code')}>Generate new code</Button>
        <Button color="warning" disabled={busy || !reason.trim()} onClick={() => change('revoke_code')}>Revoke code</Button>
        <Button variant="contained" disabled={busy || !reason.trim()} onClick={() => change(context.day.state === 'open' ? 'close' : 'reopen')}>{context.day.state === 'open' ? 'Close day' : 'Reopen day'}</Button></>}
      </Stack>
      </Stack></Box>
      <Box hidden={dayView !== 'inbox'}><MatchManager client={client} group={group} dayId={context.day.id} initialDate={context.day.play_date} active={view === 'days' && dayView === 'inbox'}
        onChanged={() => { void run(async () => { await refresh(context.day.id); onRegistryChanged?.(); }); }} /></Box>
      <Box hidden={dayView !== 'history'}>
      <Typography component="h4" variant="h6">Private day history &amp; lineup versions</Typography>
        {context.lineups.map(l => <Typography key={l.version}>Lineup {l.version} · {new Date(l.created_at).toLocaleString()}: {['A','B'].map(t => `${l.lineup[t].name}: ${l.lineup[t].players.map(p => p.name).join(', ')}`).join(' / ')}</Typography>)}
        {context.history.map(h => <Box key={h.version} sx={{ mb: 2 }}><Typography>Version {h.version} · {h.author_id} · {new Date(h.created_at).toLocaleString()} · {h.reason}</Typography><Typography variant="body2">{h.previous_state.state} → {h.new_state.state} · {h.new_state.action}</Typography></Box>)}
      </Box>
    </>}
    </Stack></Box>
    <Dialog open={Boolean(deleting)} onClose={() => { if (!busy) setDeleting(null); }} aria-labelledby="delete-game-day-title" fullWidth maxWidth="xs">
      <DialogTitle id="delete-game-day-title">Delete game day {deleting?.play_date}?</DialogTitle>
      <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
        <Typography>This permanently deletes the day and its lineups. Days with finalized matches cannot be deleted. Its access code will stop working. Players remain registered.</Typography>
        {error && <Alert severity="warning">{error}</Alert>}
        <TextField required label="Reason for deleting day" value={deleteReason} disabled={busy} onChange={event => setDeleteReason(event.target.value)} slotProps={{ htmlInput: { maxLength: 500 } }} />
      </Stack></DialogContent>
      <DialogActions><Button disabled={busy} onClick={() => setDeleting(null)}>Cancel</Button>
        <Button color="warning" disabled={busy || !deleteReason.trim()} onClick={() => run(async () => {
          await rpc('delete_game_day', { p_group_id: group.id, p_day_id: deleting.id, p_expected_version: deleting.version, p_reason: deleteReason });
          setDeleting(null); setContext(null); setCode(''); setReason(''); setLineup(emptyLineup());
          await refresh(null); onRegistryChanged?.(); setMessage('Game day deleted.');
        })}>Delete day</Button></DialogActions>
    </Dialog>
  </Stack></Box>;
}

function LineupEditor({ lineup, players, disabled, onChange }) {
  const selectedIds = new Set(['A', 'B'].flatMap(team => lineup[team].players.map(player => player?.id).filter(Boolean)));
  return <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>{['A','B'].map(team => <Stack key={team} spacing={1}>
    <TextField label={`Team ${team} name`} value={lineup[team].name} disabled={disabled} onChange={e => onChange({ ...lineup, [team]: { ...lineup[team], name: e.target.value } })} slotProps={{ htmlInput: { maxLength: 16 } }} />
    {lineup[team].players.map((person, position) => <TextField key={position} select label={`Team ${team} · Player ${position+1}`} value={person?.id ?? ''} disabled={disabled} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }} onChange={e => {
      const selected = players.find(p => p.id === e.target.value);
      if (selected && selected.id !== person?.id && selectedIds.has(selected.id)) return;
      onChange({ ...lineup, [team]: { ...lineup[team], players: lineup[team].players.map((p, i) => i === position ? selected ? { id: selected.id, name: selected.name } : null : p) } });
    }}><option value="">Select player</option>{players.filter(p => p.id === person?.id || !selectedIds.has(p.id)).map(p => <option key={p.id} value={p.id}>{p.name}{p.category === 'fixed' ? ' · Fixed' : ' · Sub'}</option>)}</TextField>)}
  </Stack>)}</Box>;
}
