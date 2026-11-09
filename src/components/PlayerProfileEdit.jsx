import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Stack } from '@mui/material';
import { getAdminClient, getRemoteClient } from '../remote/client';
import { dayRpc } from '../remote/gameDays';
import PlayerFormDialog from './PlayerFormDialog';

export default function PlayerProfileEdit({ groupId, playerId, onSaved }) {
  const generation = useRef(0);
  const [clients] = useState(() => [...new Set([getAdminClient(), getRemoteClient()].filter(Boolean))]);
  const [access, setAccess] = useState(null);
  const [editing, setEditing] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => {
    const identities = new Map();
    const subscriptions = clients.map(client => client.auth.onAuthStateChange((_event, session) => {
      const identity = session?.user.id ?? null;
      if (identities.has(client) && identities.get(client) === identity) return;
      identities.set(client, identity); generation.current++;
      setAccess(null); setEditing(false); setError(''); setAttempt(value => value + 1);
    }).data.subscription);
    return () => subscriptions.forEach(subscription => subscription.unsubscribe());
  }, [clients]);
  useEffect(() => {
    let active = true; generation.current++;
    setAccess(null); setEditing(false);
    (async () => {
      for (const client of clients) {
        try {
          const { data, error } = await client.auth.getSession();
          if (error || !data.session) continue;
          const registry = await dayRpc('get_group_registry', { p_group_id: groupId }, client);
          const current = await client.auth.getSession();
          if (!active) return;
          if (current.error || current.data.session?.user.id !== data.session.user.id) continue;
          const player = registry?.group?.id === groupId && registry.players?.find(person => person.id === playerId);
          if (player) { setAccess({ client, player }); return; }
        } catch { /* Public profiles remain available without administrative access. */ }
      }
    })();
    return () => { active = false; generation.current++; };
  }, [clients, groupId, playerId, attempt]);
  if (!access) return null;
  return <Stack spacing={1} sx={{ alignItems: 'start' }}>
    {error && <Alert severity="warning">{error}</Alert>}
    <Button variant="outlined" onClick={async () => {
      setError('');
      const requestGeneration = generation.current;
      try {
        const registry = await dayRpc('get_group_registry', { p_group_id: groupId }, access.client);
        if (requestGeneration !== generation.current) return;
        const player = registry?.group?.id === groupId && registry.players?.find(person => person.id === playerId);
        if (!player) throw new Error('Player is no longer in this registry. Refresh the profile.');
        setAccess(previous => previous ? { ...previous, player } : null); setEditing(true);
      } catch (failure) { setError(failure.message); }
    }}>Edit player</Button>
    {editing && <PlayerFormDialog client={access.client} groupId={groupId} player={access.player} onClose={() => setEditing(false)} onSaved={() => {
      setEditing(false); setAttempt(value => value + 1); onSaved();
    }} />}
  </Stack>;
}
