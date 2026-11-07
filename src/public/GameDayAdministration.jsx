import { useEffect, useRef, useState } from 'react';
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import { dayRpc } from '../remote/gameDays';
import { createLocalId } from '../game/storage';
import { recordedParticipants, reconcileSubmission } from './reconciliation';
import { correctionErrors } from './corrections';
import { SetEditor, SnapshotComparison } from './MatchAdministration';

const emptyLineup = () => ({ A: { name: 'Team 1', players: Array(6).fill(null) }, B: { name: 'Team 2', players: Array(6).fill(null) } });
const todayIn = zone => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export default function GameDayAdministration({ client, group }) {
  const [players, setPlayers] = useState([]); const [days, setDays] = useState([]); const [context, setContext] = useState(null);
  const [lineup, setLineup] = useState(emptyLineup); const [date, setDate] = useState(() => todayIn(group.time_zone));
  const [name, setName] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [reason, setReason] = useState(''); const [code, setCode] = useState(''); const [message, setMessage] = useState('');
  const rpc = (name, args) => dayRpc(name, args, client);
  async function refresh(dayId = context?.day.id) {
    const [registry, list] = await Promise.all([rpc('get_group_registry', { p_group_id: group.id }), rpc('list_game_days', { p_group_id: group.id })]);
    setPlayers(registry.players); setDays(list);
    if (dayId) {
      const next = await rpc('get_game_day', { p_day_id: dayId }); setContext(next);
      setLineup(next.lineup ?? emptyLineup());
    }
  }
  useEffect(() => { let active = true; Promise.all([rpc('get_group_registry', { p_group_id: group.id }), rpc('list_game_days', { p_group_id: group.id })]).then(([registry, list]) => { if (active) { setPlayers(registry.players); setDays(list); } }).catch(f => { if (active) setError(f.message); }); return () => { active = false; }; }, [client, group.id]);
  async function run(action) {
    if (busy) return; setBusy(true); setError(''); setMessage('');
    try { await action(); } catch (failure) { setError(failure.message || 'Request failed. Refresh before trying again.'); }
    finally { setBusy(false); }
  }
  async function change(action) {
    await run(async () => {
      const result = await rpc('change_game_day', { p_day_id: context.day.id, p_expected_version: context.day.version, p_action: action, p_lineup: action === 'lineup' ? lineup : null, p_reason: reason });
      setCode(result.code ?? ''); setReason(''); await refresh(context.day.id);
      setMessage(action === 'close' ? 'Day closed. Results published together.' : 'Change saved. Public results change only when the day is closed.');
    });
  }
  return <Stack spacing={2} sx={{ pt: 3 }}>
    <Typography component="h3" variant="h5">Players &amp; game days</Typography>
    {error && <Alert severity="warning">{error}</Alert>}{message && <Alert severity="success">{message}</Alert>}
    {code && <Alert severity="info"><Typography>Copy this code now and share it only with the scoreboard operator. It is not stored in readable form on the server.</Typography><TextField label="Game-day code" fullWidth value={code} slotProps={{ input: { readOnly: true } }} onFocus={event => event.target.select()} sx={{ mt: 1 }} /><Button onClick={() => { navigator.clipboard?.writeText(code).catch(() => setError('Select the code and copy it manually.')); }}>Copy code</Button></Alert>}
    <Accordion><AccordionSummary><Typography>Registered players ({players.length})</Typography></AccordionSummary><AccordionDetails><Stack spacing={2}>
      <Typography>{players.map(p => p.name).join(', ') || 'No registered players yet.'}</Typography>
      <Stack component="form" onSubmit={event => { event.preventDefault(); const id = createLocalId(); void run(async () => {
        const result = await rpc('sync_group_player', { p_group_id: group.id, p_player_id: id, p_name: name });
        if (result.status !== 'saved') throw new Error('A similar name exists. Use that player or enter a distinct full name.');
        setName(''); await refresh();
      }); }} spacing={1}>
        <TextField required label="New player name" value={name} disabled={busy} onChange={e => setName(e.target.value)} slotProps={{ htmlInput: { maxLength: 60 } }} />
        <Button type="submit" disabled={busy || !name.trim()}>Register player</Button>
      </Stack>
    </Stack></AccordionDetails></Accordion>
    <Button disabled={busy} onClick={() => run(() => refresh())}>Refresh game days</Button>
    {context ? <>
      <Button disabled={busy} onClick={() => { setContext(null); setLineup(emptyLineup()); setCode(''); }}>Back to game days</Button>
      <Typography component="h4" variant="h6">{context.day.play_date} · {context.day.state} · Version {context.day.version}</Typography>
      <Alert severity="info">Review all received matches before closing. Reopening keeps the previous public results visible until you close the day again. Late uploads remain private.</Alert>
    </> : <>
      {days.map(day => <Paper key={day.id} variant="outlined" sx={{ p: 2 }}><Typography>{day.play_date} · {day.state} · {day.pending} pending</Typography><Button disabled={busy} onClick={() => run(() => refresh(day.id))}>Open day</Button></Paper>)}
      <Typography component="h4" variant="h6">Create game day</Typography>
      <TextField type="date" label={`Date · ${group.time_zone}`} value={date} disabled={busy} onChange={e => setDate(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
    </>}
    {(!context || context.day.state === 'open') && <>
      <LineupEditor lineup={lineup} players={players} disabled={busy} onChange={setLineup} />
      {!context && <Button variant="contained" disabled={busy} onClick={() => run(async () => {
        const result = await rpc('create_game_day', { p_group_id: group.id, p_date: date, p_lineup: lineup }); setCode(result.code); await refresh(result.day.id);
      })}>Create day &amp; code</Button>}
    </>}
    {context && <>
      <TextField label="Reason for day change" value={reason} disabled={busy} onChange={e => setReason(e.target.value)} slotProps={{ htmlInput: { maxLength: 500 } }} />
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
        {context.day.state === 'open' && <Button disabled={busy || !reason.trim()} onClick={() => change('lineup')}>Save lineup version</Button>}
        <Button disabled={busy || !reason.trim() || context.day.lineup_version === 0} onClick={() => change('rotate_code')}>Generate new code</Button>
        <Button color="warning" disabled={busy || !reason.trim()} onClick={() => change('revoke_code')}>Revoke code</Button>
        <Button variant="contained" disabled={busy || !reason.trim() || (context.day.state === 'open' && (!context.receipts.length || context.receipts.some(r => r.decision === 'pending')))} onClick={() => change(context.day.state === 'open' ? 'close' : 'reopen')}>{context.day.state === 'open' ? 'Close day & publish' : 'Reopen day'}</Button>
      </Stack>
      <Typography component="h4" variant="h6">Private inbox ({context.receipts.length})</Typography>
      {context.receipts.map(receipt => <ReceiptEditor key={`${receipt.id}-${receipt.version}`} receipt={receipt} players={players} disabled={busy || context.day.state !== 'open'} onReview={(decision, draft, note, reviewId) => run(async () => {
        await rpc('review_day_match', { p_match_id: receipt.id, p_expected_version: receipt.version, p_decision: decision, p_draft: draft, p_reason: note, p_review_id: reviewId }); await refresh(context.day.id); setMessage('Review saved privately. Close the day to publish.');
      })} />)}
      <Accordion><AccordionSummary><Typography>Private day history &amp; lineup versions</Typography></AccordionSummary><AccordionDetails>
        {context.lineups.map(l => <Typography key={l.version}>Lineup {l.version} · {new Date(l.created_at).toLocaleString()}: {['A','B'].map(t => `${l.lineup[t].name}: ${l.lineup[t].players.map(p => p.name).join(', ')}`).join(' / ')}</Typography>)}
        {context.history.map(h => <Box key={h.version} sx={{ mb: 2 }}><Typography>Version {h.version} · {h.author_id} · {new Date(h.created_at).toLocaleString()} · {h.reason}</Typography><Typography variant="body2">{h.previous_state.state} → {h.new_state.state} · {h.new_state.action}</Typography></Box>)}
      </AccordionDetails></Accordion>
    </>}
  </Stack>;
}

function LineupEditor({ lineup, players, disabled, onChange }) {
  return <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>{['A','B'].map(team => <Stack key={team} spacing={1}>
    <TextField label={`Team ${team} name`} value={lineup[team].name} disabled={disabled} onChange={e => onChange({ ...lineup, [team]: { ...lineup[team], name: e.target.value } })} slotProps={{ htmlInput: { maxLength: 16 } }} />
    {lineup[team].players.map((person, position) => <TextField key={position} select label={`Team ${team} · Player ${position+1}`} value={person?.id ?? ''} disabled={disabled} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }} onChange={e => {
      const selected = players.find(p => p.id === e.target.value); onChange({ ...lineup, [team]: { ...lineup[team], players: lineup[team].players.map((p, i) => i === position ? selected ? { id: selected.id, name: selected.name } : null : p) } });
    }}><option value="">Select player</option>{players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</TextField>)}
  </Stack>)}</Box>;
}

function ReceiptEditor({ receipt, players, disabled, onReview }) {
  const reviewAttempt = useRef(null);
  const source = receipt.submission; const participants = recordedParticipants(source);
  const [mapping, setMapping] = useState(() => Object.fromEntries(participants.map(p => [p.key, players.some(known => known.id === p.hint_id && known.name === p.name) ? p.hint_id : ''])));
  const [mappingDirty, setMappingDirty] = useState(false);
  const [draft, setDraft] = useState(receipt.draft); const [note, setNote] = useState(''); const [error, setError] = useState(''); const [review, setReview] = useState(false);
  const change = action => { try { setDraft(previous => action(previous)); setReview(false); setError(''); } catch (failure) { setError(failure.message); } };
  const saveReview = decision => {
    const body = { decision, draft: decision === 'approved' ? draft : null, note };
    const signature = JSON.stringify(body);
    if (reviewAttempt.current?.signature !== signature) reviewAttempt.current = { signature, id: createLocalId() };
    return onReview(decision, body.draft, note, reviewAttempt.current.id);
  };
  const errors = draft ? correctionErrors(draft, players) : [];
  return <Accordion disableGutters><AccordionSummary><Typography>{source.team_a_name} × {source.team_b_name} · {new Date(source.closed_at).toLocaleString()} · {receipt.decision}</Typography></AccordionSummary><AccordionDetails><Stack spacing={2}>
    <Typography variant="caption">Receipt {receipt.id} · Version {receipt.version} · Original submission is preserved.</Typography>
    <Box component="fieldset" disabled={disabled} sx={{ m: 0, p: 0, border: 0, minWidth: 0 }}>
      {participants.length > 0 && <><Typography>Associate each recorded name. Matching names are suggestions only. Known identities from downloaded lineups are preselected; confirm them before approval.</Typography>
        {participants.map(p => <TextField key={p.key} select fullWidth label={`Team ${p.team} · ${p.slot} · Sets ${p.sets.join(', ')}`} value={mapping[p.key] ?? ''} helperText={`Recorded: ${p.name}${players.some(known => known.name.toLowerCase() === p.name.toLowerCase()) ? ' · Similar registered name available' : ''}`} sx={{ my: 1 }} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }} onChange={e => { setMapping({ ...mapping, [p.key]: e.target.value }); setMappingDirty(true); setReview(false); }}>
          <option value="">Select identity</option>{players.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
        </TextField>)}
        <Button onClick={() => { try { setDraft(reconcileSubmission(source, mapping, players)); setMappingDirty(false); setReview(false); setError(''); } catch (failure) { setError(failure.message); } }}>Build draft from associations (replaces draft edits)</Button>
      </>}
      {mappingDirty && <Alert severity="info">Build the draft to apply the changed associations before approving.</Alert>}
      {draft && <><Typography sx={{ my: 2 }}>Review participants and points. Substitutes appear as additional participants in the set.</Typography>{draft.sets.map((set, index) => <SetEditor key={`${index}-${draft.sets.length}`} set={set} index={index} payload={draft} players={players} change={change} />)}</>}
      <TextField fullWidth multiline label="Reason for review" value={note} onChange={e => setNote(e.target.value)} slotProps={{ htmlInput: { maxLength: 500 } }} sx={{ my: 2 }} />
      {error && <Alert severity="warning">{error}</Alert>}{errors.length > 0 && <Alert severity="warning">{errors.join(' ')}</Alert>}
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}><Button disabled={mappingDirty || !draft || errors.length > 0 || !note.trim()} onClick={() => setReview(true)}>Review approval</Button>
        <Button color="warning" disabled={!note.trim()} onClick={() => saveReview('excluded')}>Disregard match</Button>
        <Button disabled={!note.trim()} onClick={() => saveReview('pending')}>Mark pending</Button></Stack>
      {review && draft && <><SnapshotComparison before={receipt.draft ?? draft} after={draft} /><Button variant="contained" onClick={() => saveReview('approved')}>Confirm private approval</Button></>}
    </Box>
    <Accordion><AccordionSummary><Typography>Original &amp; private review history</Typography></AccordionSummary><AccordionDetails>
      <Box component="pre" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 420, overflow: 'auto', fontSize: 12 }}>{JSON.stringify({ original: source, history: receipt.audit }, null, 2)}</Box>
    </AccordionDetails></Accordion>
  </Stack></AccordionDetails></Accordion>;
}
