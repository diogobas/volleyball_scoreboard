import { useEffect, useState } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';
import { canChangeRoster, TEAM_IDS } from '../game/match';
import { listPlayers, loadSelectedGroup, registerPlayer, saveMatchPlayers } from '../game/registry';
import { cachedAdmin, selectRegistryGroup } from '../game/registryCache';
import { prepareRegistry } from '../remote/playerRegistry';

export default function EditTeamsDialog({ state, database, teamOrder = TEAM_IDS, archiveId = null, onClose, onSave }) {
  const [draft, setDraft] = useState(() => structuredClone(state.teams));
  const [group, setGroup] = useState(null);
  const [players, setPlayers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [allowed, setAllowed] = useState(true);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [existing, setExisting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [target, setTarget] = useState({ team: 'A', index: 0 });
  const locked = Boolean(state.groupId && !canChangeRoster(state));

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const prepared = await prepareRegistry(database, state.groupId);
        const result = await loadSelectedGroup(database, state.groupId);
        const registered = await listPlayers(database, result.id);
        if (!cancelled) {
          setGroup(result); setPlayers(registered); setError(prepared.error);
          setAllowed(cachedAdmin(prepared.cache, result));
          setGroups(prepared.cache.groups.filter(item => !item.linkedTo && (item.localOnly || cachedAdmin(prepared.cache, item) || item.id === result.id)));
        }
      } catch { if (!cancelled) setError('The player list could not be loaded. Retry to keep working.'); }
    }
    load();
    return () => { cancelled = true; };
  }, [database, attempt, state.groupId]);

  async function changeGroup(id) {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const prepared = await prepareRegistry(database, id);
      const selected = prepared.cache.groups.find(item => item.id === id);
      if (!selected) throw new Error('Group is unavailable. Refresh your online groups.');
      const registered = await listPlayers(database, id);
      await selectRegistryGroup(database, id);
      setGroup(selected); setPlayers(registered); setAllowed(cachedAdmin(prepared.cache, selected)); setError(prepared.error);
      setDraft(previous => Object.fromEntries(TEAM_IDS.map(team => [team, { ...previous[team],
        players: previous[team].players.map(player => player.isError ? player : { ...player, personId: undefined }),
      }])));
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  function choose(team, index, personId) {
    setDraft(previous => ({ ...previous, [team]: { ...previous[team],
      players: previous[team].players.map((player, i) => i === index ? { ...player, personId } : player),
    } }));
  }

  async function createPlayer() {
    if (!group || busy || !allowed) return;
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
    if (!group || busy || !allowed) return;
    setBusy(true); setError(''); setExisting(null);
    try { onSave(await saveMatchPlayers(database, state, group.id, draft, archiveId)); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  return <Dialog open fullWidth maxWidth="md" onClose={() => { if (!busy) onClose(); }} aria-labelledby="edit-title">
    <DialogTitle id="edit-title">{archiveId ? 'Associate saved match' : 'Teams and registered players'}</DialogTitle>
    <DialogContent dividers>
      <Alert severity="info" sx={{ mb: 2 }}>{group?.localOnly ? 'Local development registry. Use Players & sync to link existing data to an online group.' : 'Cached players are available offline. Use Players & sync to upload registrations and resolve conflicts.'}</Alert>
      {!group && !error && <Typography role="status">Loading registered players…</Typography>}
      {error && <Alert severity="warning" sx={{ mb: 2 }} action={!group ? <Button onClick={() => setAttempt(value => value + 1)}>Retry</Button> : undefined}>{error}</Alert>}
      {group && <>
      <TextField select fullWidth label="Match group" value={group.id} disabled={busy || Boolean(state.groupId && state.log.length)}
        onChange={event => changeGroup(event.target.value)} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }} sx={{ mb: 2 }}>
        {groups.map(item => <option key={item.id} value={item.id}>{item.name}{item.localOnly ? ' (local only)' : ''}</option>)}
      </TextField>
      {!allowed && <Alert severity="warning" sx={{ mb: 2 }}>Sign in and refresh your group access to edit this cached roster.</Alert>}
      {!state.groupId && <Typography sx={{ mb: 2 }}>Select who occupied each position. All recorded points in a position will be linked to the person you select. Review all 12 positions before saving. Existing points and historical names will be kept.</Typography>}
      {archiveId !== null && <Typography sx={{ mb: 2 }}>This association cannot be changed in this version. Scores and original names will remain unchanged.</Typography>}
      {locked && <Typography sx={{ mb: 2 }}>Close the current set before changing players. You can still edit team names.</Typography>}
      {!locked && state.groupId && <Typography sx={{ mb: 2 }}>You can swap players between teams or select a substitute before the next point. Keep six different players on each team.</Typography>}
      {players.length === 0 && <Typography sx={{ mb: 2 }}>No registered players yet. Register each participant above to make them available in the selectors.</Typography>}
      <Typography component="h3" variant="subtitle1">Registered players ({players.length})</Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ my: 2 }}>
        <TextField label="New player name" value={name} onChange={event => { setName(event.target.value); setExisting(null); }}
          slotProps={{ htmlInput: { maxLength: 60 } }} disabled={busy || !allowed} fullWidth />
        <Button variant="outlined" disabled={busy || !allowed || !name.trim()} onClick={createPlayer}
          sx={{ flexShrink: 0, whiteSpace: 'nowrap', px: 2 }}>Register player</Button>
      </Stack>
      {existing && <Button disabled={busy || locked || !allowed} onClick={() => { choose(target.team, target.index, existing.id); setExisting(null); setError(''); }}>
        Use {existing.name} for Team {TEAM_IDS.indexOf(target.team) + 1} · Player {target.index + 1}
      </Button>}
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Registered names are saved immediately on this device, even if you cancel the roster changes.</Typography>
      <Box className="edit-grid">
        {teamOrder.map(id => <Stack key={id} spacing={2}>
          <Typography variant="overline">Team {TEAM_IDS.indexOf(id) + 1}</Typography>
          <TextField label={`Team ${TEAM_IDS.indexOf(id) + 1} name`} value={draft[id].name} disabled={busy || archiveId !== null || !allowed}
            onChange={event => setDraft(previous => ({ ...previous, [id]: { ...previous[id], name: event.target.value } }))}
            slotProps={{ htmlInput: { maxLength: 16 } }} fullWidth />
          {draft[id].players.filter(p => !p.isError).map((player, i) =>
            <TextField key={player.id} select label={`Team ${TEAM_IDS.indexOf(id) + 1} · Player ${i + 1}`}
              helperText={!state.groupId ? `Previously: ${state.teams[id].players[i].name}` : undefined}
              value={player.personId ?? ''} disabled={busy || locked || !allowed}
              onFocus={() => setTarget({ team: id, index: i })}
              onChange={event => choose(id, i, event.target.value)}
              slotProps={{ select: { native: true }, inputLabel: { shrink: true } }} fullWidth>
              <option value="">Select player</option>
              {players.map(person => <option key={person.id} value={person.id}>{person.name}{person.syncStatus === 'conflict' ? ' (needs confirmation)' : ''}</option>)}
            </TextField>)}
        </Stack>)}
      </Box>
      </>}
    </DialogContent>
    <DialogActions><Button disabled={busy} onClick={onClose}>Cancel</Button>
      <Button variant="contained" disabled={!group || busy || !allowed} onClick={save}>{busy ? 'Saving…' : archiveId ? 'Associate players' : 'Save'}</Button>
    </DialogActions>
  </Dialog>;
}
