import { useEffect, useState } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';
import { TEAM_IDS } from '../game/match';
import { listPlayers, loadDevelopmentGroup, registerPlayer, saveMatchPlayers } from '../game/registry';

export default function EditTeamsDialog({ state, database, teamOrder = TEAM_IDS, archiveId = null, onClose, onSave }) {
  const [draft, setDraft] = useState(() => structuredClone(state.teams));
  const [group, setGroup] = useState(null);
  const [players, setPlayers] = useState([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [existing, setExisting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [target, setTarget] = useState({ team: 'A', index: 0 });
  const locked = Boolean(state.groupId && state.log.length);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await loadDevelopmentGroup(database);
        const registered = await listPlayers(database, result.id);
        if (!cancelled) { setGroup(result); setPlayers(registered); setError(''); }
      } catch { if (!cancelled) setError('The player list could not be loaded. Retry to keep working.'); }
    }
    load();
    return () => { cancelled = true; };
  }, [database, attempt]);

  function choose(team, index, personId) {
    setDraft(previous => ({ ...previous, [team]: { ...previous[team],
      players: previous[team].players.map((player, i) => i === index ? { ...player, personId } : player),
    } }));
  }

  async function createPlayer() {
    if (!group || busy) return;
    setBusy(true); setError(''); setExisting(null);
    try {
      const player = await registerPlayer(database, group.id, name);
      setPlayers(previous => [...previous, player].sort((a, b) => a.name.localeCompare(b.name, 'pt')));
      setName('');
    } catch (failure) {
      setError(failure.message);
      setExisting(failure.existingPlayer ?? null);
      if (failure.existingPlayer) setPlayers(previous => previous.some(player => player.id === failure.existingPlayer.id)
        ? previous : [...previous, failure.existingPlayer].sort((a, b) => a.name.localeCompare(b.name, 'pt')));
    }
    finally { setBusy(false); }
  }

  async function save() {
    if (!group || busy) return;
    setBusy(true); setError(''); setExisting(null);
    try { onSave(await saveMatchPlayers(database, state, group.id, draft, archiveId)); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  return <Dialog open fullWidth maxWidth="md" onClose={() => { if (!busy) onClose(); }} aria-labelledby="edit-title">
    <DialogTitle id="edit-title">{archiveId ? 'Associate saved match' : 'Teams and registered players'}</DialogTitle>
    <DialogContent dividers>
      <Alert severity="info" sx={{ mb: 2 }}>Development group · Local only. Online groups and administrator access will be added later.</Alert>
      {!group && !error && <Typography role="status">Loading registered players…</Typography>}
      {error && <Alert severity="warning" sx={{ mb: 2 }} action={!group ? <Button onClick={() => setAttempt(value => value + 1)}>Retry</Button> : undefined}>{error}</Alert>}
      {group && <>
      {!state.groupId && <Typography sx={{ mb: 2 }}>Select who occupied each position. All recorded points in a position will be linked to the person you select. Review all 12 positions before saving. Existing points and historical names will be kept.</Typography>}
      {archiveId !== null && <Typography sx={{ mb: 2 }}>This association cannot be changed in this version. Scores and original names will remain unchanged.</Typography>}
      {locked && <Typography sx={{ mb: 2 }}>Players are fixed until this match is closed. You can still edit team names.</Typography>}
      <Typography component="h3" variant="subtitle1">Registered players ({players.length})</Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ my: 2 }}>
        <TextField label="New player name" value={name} onChange={event => { setName(event.target.value); setExisting(null); }}
          slotProps={{ htmlInput: { maxLength: 60 } }} disabled={busy} fullWidth />
        <Button variant="outlined" disabled={busy || !name.trim()} onClick={createPlayer}>Register player</Button>
      </Stack>
      {existing && <Button disabled={busy || locked} onClick={() => { choose(target.team, target.index, existing.id); setExisting(null); setError(''); }}>
        Use {existing.name} for Team {TEAM_IDS.indexOf(target.team) + 1} · Player {target.index + 1}
      </Button>}
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Registered names are saved immediately on this device, even if you cancel the roster changes.</Typography>
      <Box className="edit-grid">
        {teamOrder.map(id => <Stack key={id} spacing={2}>
          <Typography variant="overline">Team {TEAM_IDS.indexOf(id) + 1}</Typography>
          <TextField label={`Team ${TEAM_IDS.indexOf(id) + 1} name`} value={draft[id].name} disabled={busy || archiveId !== null}
            onChange={event => setDraft(previous => ({ ...previous, [id]: { ...previous[id], name: event.target.value } }))}
            slotProps={{ htmlInput: { maxLength: 16 } }} fullWidth />
          {draft[id].players.filter(p => !p.isError).map((player, i) =>
            <TextField key={player.id} select label={`Team ${TEAM_IDS.indexOf(id) + 1} · Player ${i + 1}`}
              helperText={!state.groupId ? `Previously: ${state.teams[id].players[i].name}` : undefined}
              value={player.personId ?? ''} disabled={busy || locked}
              onFocus={() => setTarget({ team: id, index: i })}
              onChange={event => choose(id, i, event.target.value)}
              slotProps={{ select: { native: true } }} fullWidth>
              <option value="">{`Select player (previously ${state.teams[id].players[i].name})`}</option>
              {players.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
            </TextField>)}
        </Stack>)}
      </Box>
      </>}
    </DialogContent>
    <DialogActions><Button disabled={busy} onClick={onClose}>Cancel</Button>
      <Button variant="contained" disabled={!group || busy} onClick={save}>{busy ? 'Saving…' : archiveId ? 'Associate players' : 'Save'}</Button>
    </DialogActions>
  </Dialog>;
}
