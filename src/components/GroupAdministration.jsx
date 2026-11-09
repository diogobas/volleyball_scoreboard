import { useEffect, useState } from 'react';
import { Alert, Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import GameDayAdministration from '../public/GameDayAdministration';
import SectionNavigation from './SectionNavigation';
import AdminGroupResults from './AdminGroupResults';
import { remoteGroups } from '../remote/groups';

export default function GroupAdministration({ client, userId, busy, setBusy }) {
  const [view, setView] = useState('overview');
  const [playersView, setPlayersView] = useState('registry');
  const [registryVersion, setRegistryVersion] = useState(0);
  const [groups, setGroups] = useState(null);
  const [selected, setSelected] = useState(null);
  const [admins, setAdmins] = useState(null);
  const [name, setName] = useState('');
  const [timeZone, setTimeZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setError('');
    setGroups(null);
    remoteGroups(client).list().then(result => { if (active) setGroups(result); })
      .catch(failure => { if (active) setError(failure.message || 'Groups could not be loaded. Check your connection.'); });
    return () => { active = false; };
  }, [client, attempt]);

  useEffect(() => {
    let active = true;
    setAdmins(null);
    if (selected) remoteGroups(client).administrators(selected.id).then(result => { if (active) setAdmins(result); })
      .catch(failure => { if (active) setError(failure.message || 'Administrators could not be loaded.'); });
    return () => { active = false; };
  }, [client, selected, attempt]);

  async function run(action) {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try { await action(remoteGroups(client)); }
    catch (failure) { setError(failure.message || 'The change could not be confirmed. Refresh before trying again.'); }
    finally { setBusy(false); }
  }

  function create(event) {
    event.preventDefault();
    run(async api => {
      const group = await api.create(name, timeZone);
      setGroups(previous => [...(previous ?? []), group]);
      setName(''); setView('overview'); setSelected(group); setMessage('Group created. You are its first administrator.');
    });
  }

  return <Stack spacing={2}>
    {error && <Alert severity="error">{error}</Alert>}
    {message && <Alert severity="success">{message}</Alert>}
    {!selected && <Button disabled={busy} onClick={() => setAttempt(value => value + 1)}>Refresh groups</Button>}
    {selected ? <>
      <Button sx={{ alignSelf: 'start' }} disabled={busy} onClick={() => { setSelected(null); setError(''); setMessage(''); }}>Back to my groups</Button>
      <Typography component="h3" variant="h6">{selected.name}</Typography>
      <Typography variant="body2" color="text.secondary">{selected.display_id && `${selected.display_id} · `}Time zone: {selected.time_zone}</Typography>
      <SectionNavigation value={view} onChange={setView} disabled={busy} label="Administration sections" sections={[
        { id: 'overview', label: 'Overview' }, { id: 'players', label: 'Players' }, { id: 'matches', label: 'Matches' },
        { id: 'days', label: 'Game days' }, { id: 'access', label: 'Access' },
      ]} />
      {view === 'players' && <SectionNavigation value={playersView} onChange={setPlayersView} label="Player sections" sections={[
        { id: 'registry', label: 'Registry' }, { id: 'statistics', label: 'Statistics' },
      ]} />}
      <GameDayAdministration key={selected.id} client={client} group={selected} view={view === 'players' && playersView !== 'registry' ? 'hidden' : view} onRegistryChanged={() => setRegistryVersion(value => value + 1)} />
      <Box hidden={!['overview', 'players', 'matches'].includes(view) || (view === 'players' && playersView === 'registry')}>
        <AdminGroupResults key={selected.id} client={client} group={selected} view={view} refreshKey={registryVersion} onViewChange={next => { if (next === 'players') setPlayersView('statistics'); setView(next); }} />
      </Box>
      <Box hidden={view !== 'access'}><Stack spacing={2}>
      <Typography component="h4" variant="h6">Administrators</Typography>
      <Button disabled={busy} onClick={() => setAttempt(value => value + 1)}>Refresh access</Button>
      {!admins && !error && <Typography role="status">Loading administrators…</Typography>}
      {admins?.map(admin => <Paper key={admin.user_id} variant="outlined" sx={{ p: 1.5 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ justifyContent: 'space-between', gap: 1 }}>
          <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{admin.email}{admin.user_id === userId ? ' (you)' : ''}</Typography>
          <Button color="warning" size="small" disabled={busy || admins.length <= 1} onClick={() => run(async api => {
            await api.revoke(selected.id, admin.user_id);
            if (admin.user_id === userId) setSelected(null);
            setAttempt(value => value + 1);
            setMessage('Administrator access removed.');
          })}>Remove access</Button>
        </Stack>
      </Paper>)}
      <Stack component="form" onSubmit={event => {
        event.preventDefault();
        run(async api => { await api.authorize(selected.id, email); setEmail(''); setAttempt(value => value + 1); setMessage('Administrator access granted.'); });
      }} spacing={2}>
        <TextField label="Administrator email" type="email" required value={email} disabled={busy} onChange={event => setEmail(event.target.value)}
          helperText="The person must create an account and confirm their email first." />
        <Button type="submit" variant="outlined" disabled={busy}>Add administrator</Button>
      </Stack>
      </Stack></Box>
    </> : <>
      <Typography component="h3" variant="h6">My groups</Typography>
      {groups === null && !error && <Typography role="status">Loading groups…</Typography>}
      {groups?.length === 0 && <Typography variant="body2">You do not administer a group yet. Create one or ask a group administrator to authorize your email.</Typography>}
      {groups?.map(group => <Paper key={group.id} variant="outlined" sx={{ p: 2 }}>
        <Typography sx={{ overflowWrap: 'anywhere' }}>{group.name}</Typography>
        <Typography variant="body2" color="text.secondary">{group.display_id && `${group.display_id} · `}{group.time_zone}</Typography>
        <Button disabled={busy} onClick={() => { setView('overview'); setSelected(group); setError(''); setMessage(''); }}>Manage group</Button>
      </Paper>)}
      <Box component="form" onSubmit={create}>
        <Typography component="h3" variant="h6" sx={{ mb: 2 }}>Create group</Typography>
        <Stack spacing={2}>
          <TextField label="Group name" required value={name} disabled={busy} onChange={event => setName(event.target.value)} slotProps={{ htmlInput: { maxLength: 80 } }} />
          <TextField label="Time zone" required value={timeZone} disabled={busy} onChange={event => setTimeZone(event.target.value)} helperText="For example: America/Toronto. Used for attendance and seasons." />
          <Button type="submit" variant="contained" disabled={busy || groups === null}>Create group</Button>
        </Stack>
      </Box>
    </>}
  </Stack>;
}
