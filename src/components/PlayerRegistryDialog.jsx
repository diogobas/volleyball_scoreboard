import { useEffect, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Stack, TextField, Typography } from '@mui/material';
import { DEVELOPMENT_GROUP_ID } from '../game/registry';
import { cachedAdmin, linkDevelopmentData, registryCache, renamePendingPlayer, resolvePlayerIdentity, selectRegistryGroup } from '../game/registryCache';
import { listStoredMatches } from '../game/storage';
import { prepareRegistry, synchronizePlayers } from '../remote/playerRegistry';
import { publicGroupHref } from '../public/routes';

export default function PlayerRegistryDialog({ database, preferredGroupId, onChanged, onClose, onPending }) {
  const [cache, setCache] = useState(null);
  const [groupId, setGroupId] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [names, setNames] = useState({});
  const [linkCount, setLinkCount] = useState(null);
  const [resolveTarget, setResolveTarget] = useState(null);

  useEffect(() => {
    let active = true;
    prepareRegistry(database, groupId ?? preferredGroupId).then(result => {
      if (!active) return;
      const requested = groupId ?? preferredGroupId ?? result.cache.selectedGroupId;
      const current = result.cache.groups.find(group => group.id === requested);
      setGroupId(current?.linkedTo ?? current?.id ?? DEVELOPMENT_GROUP_ID);
      setCache(result.cache);
      setError(result.error);
    }).catch(failure => { if (active) setError(failure.message || 'Registry could not be loaded.'); });
    return () => { active = false; };
  }, [database, preferredGroupId, groupId, attempt]);

  async function run(action) {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await action();
      setCache(await registryCache(database));
      await onChanged();
    } catch (failure) { setError(failure.message || 'Registry update failed. Local data has been kept.'); }
    finally { setBusy(false); }
  }

  async function sync() {
    const result = await synchronizePlayers(database, groupId);
    setMessage(`${result.saved} players confirmed online · ${result.pending} pending · ${result.conflicts} need confirmation`);
    if (result.error) setError(result.error);
  }

  const group = cache?.groups.find(item => item.id === groupId);
  const allowed = group && cachedAdmin(cache, group);
  const players = cache?.players.filter(player => player.groupId === groupId && !player.canonicalId)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt')) ?? [];
  const groups = cache?.groups.filter(item => !item.linkedTo && (item.localOnly || cachedAdmin(cache, item) || item.id === preferredGroupId || item.id === groupId)) ?? [];
  return <>
    <Dialog open fullWidth maxWidth="sm" onClose={() => { if (!busy) onClose(); }} aria-labelledby="registry-title">
      <DialogTitle id="registry-title">Players &amp; sync</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography variant="body2">Players stay on this device for offline use. Newly closed matches in online groups upload automatically when connected. Use Pending uploads to send saved games; results and season statistics are on the public page.</Typography>
          <Button variant="outlined" disabled={busy} onClick={onPending}>Pending uploads</Button>
          {error && <Alert severity="warning">{error}</Alert>}
          {message && <Alert severity={error ? 'info' : 'success'}>{message}</Alert>}
          {!cache && !error && <Typography role="status">Loading registry…</Typography>}
          <Button disabled={busy} onClick={() => setAttempt(value => value + 1)}>Refresh groups and players</Button>
          {cache && <>
            {!cache.userId && <Alert severity="info">Sign in through Account &amp; groups to download your online groups.</Alert>}
            <TextField select label="Registry group" value={groupId ?? ''} disabled={busy}
              slotProps={{ select: { native: true }, inputLabel: { shrink: true } }} onChange={event => {
                setGroupId(event.target.value); setMessage(''); setError('');
                selectRegistryGroup(database, event.target.value).catch(failure => setError(failure.message));
              }}>
              {groups.map(item => <option key={item.id} value={item.id}>{item.name}{item.localOnly ? ' (local only)' : ''}</option>)}
            </TextField>
            {group && !group.localOnly && <>
              <Typography variant="body2">Last player update: {group.lastSyncedAt ? new Date(group.lastSyncedAt).toLocaleString() : 'Not downloaded yet'}</Typography>
              {!allowed && <Alert severity="warning">Your account is not authorized for this cached group. Sign in and refresh access to synchronize. Local matches are kept.</Alert>}
              <Button variant="contained" disabled={busy || !allowed} onClick={() => run(sync)}>Sync players</Button>
              <Button component="a" href={publicGroupHref(group.id)} disabled={busy}>Public group results</Button>
              {!cache.groups.find(item => item.id === DEVELOPMENT_GROUP_ID)?.linkedTo && <Button disabled={busy || !allowed} onClick={() => run(async () => {
                const matches = await listStoredMatches(database);
                setLinkCount(matches.filter(match => match.state?.groupId === DEVELOPMENT_GROUP_ID).length);
              })}>Link development data to this group</Button>}
            </>}
            <Typography component="h3" variant="subtitle1">Players ({players.length}) · {players.filter(player => player.syncStatus !== 'synced').length} pending</Typography>
            {players.length === 0 && <Typography variant="body2">No players in this group yet. Register them in Teams &amp; players, or synchronize an existing online registry.</Typography>}
            {players.map(player => <Paper key={player.id} variant="outlined" sx={{ p: 2 }}>
              <Typography sx={{ overflowWrap: 'anywhere' }}>{player.name}</Typography>
              <Typography variant="body2" color="text.secondary">{player.syncStatus === 'synced' ? 'Saved online' : player.syncStatus === 'conflict' ? 'Needs identity confirmation' : 'Pending upload'}</Typography>
              {player.syncStatus === 'conflict' && <Stack spacing={1} sx={{ mt: 1 }}>
                <Typography variant="body2">Existing registration: {player.remotePlayer?.name}. Choose whether this is the same person or a different person.</Typography>
                <Button disabled={busy || !allowed} onClick={() => setResolveTarget(player)}>Same person — use existing registration</Button>
                {player.remotePlayer?.id !== player.id && <>
                  <TextField label={`Full name for ${player.name}`} value={names[player.id] ?? ''} disabled={busy || !allowed}
                    onChange={event => setNames(previous => ({ ...previous, [player.id]: event.target.value }))} slotProps={{ htmlInput: { maxLength: 60 } }} />
                  <Button disabled={busy || !allowed || !names[player.id]?.trim()} onClick={() => run(async () => {
                    await renamePendingPlayer(database, player.id, names[player.id]);
                    setCache(await registryCache(database));
                    await sync();
                  })}>Different person — save name and retry</Button>
                </>}
              </Stack>}
            </Paper>)}
          </>}
        </Stack>
      </DialogContent>
      <DialogActions><Button disabled={busy} onClick={onClose}>Done</Button></DialogActions>
    </Dialog>
    <Dialog open={linkCount !== null} onClose={() => { if (!busy) setLinkCount(null); }} aria-labelledby="link-group-title">
      <DialogTitle id="link-group-title">Link development data?</DialogTitle>
      <DialogContent><Typography>Move the development registry and {linkCount} saved matches to {group?.name}. The current match will also move if it belongs to the development group. Points, names, dates and player IDs are preserved. This link cannot be changed here later.</Typography></DialogContent>
      <DialogActions><Button disabled={busy} onClick={() => setLinkCount(null)}>Cancel</Button>
        <Button disabled={busy} variant="contained" onClick={() => run(async () => {
          await linkDevelopmentData(database, groupId); setLinkCount(null); setMessage('Development data linked. Use Sync players to upload the registry.');
        })}>Confirm group link</Button>
      </DialogActions>
    </Dialog>
    <Dialog open={Boolean(resolveTarget)} onClose={() => { if (!busy) setResolveTarget(null); }} aria-labelledby="resolve-player-title">
      <DialogTitle id="resolve-player-title">Link these player identities?</DialogTitle>
      <DialogContent><Typography>Confirm that {resolveTarget?.name} and {resolveTarget?.remotePlayer?.name} are the same person. Their current and saved match points will use the existing online identity. Original names and scores are kept. A merge that duplicates a person in a set is rejected.</Typography></DialogContent>
      <DialogActions><Button disabled={busy} onClick={() => setResolveTarget(null)}>Cancel</Button>
        <Button disabled={busy} variant="contained" onClick={() => run(async () => {
          await resolvePlayerIdentity(database, resolveTarget.id, resolveTarget.remotePlayer.id); setResolveTarget(null); setMessage('Identity linked. Match data remains on this device.');
        })}>Confirm same person</Button>
      </DialogActions>
    </Dialog>
  </>;
}
