import { useEffect, useState } from 'react';
import { Alert, Button, Stack, Typography } from '@mui/material';
import SectionNavigation from './SectionNavigation';
import GroupAdministration from './GroupAdministration';
import CommunityAdministration from './CommunityAdministration';
import { remoteCommunities } from '../remote/communities';

export default function AdministrationWorkspace({ client, userId, busy, setBusy }) {
  const [view, setView] = useState('groups');
  const [communities, setCommunities] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const refresh = () => setAttempt(value => value + 1);
  useEffect(() => {
    let active = true; setError('');
    remoteCommunities(client).list().then(data => { if (active) setCommunities(data); })
      .catch(failure => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [client, userId, attempt]);
  const props = { client, userId, busy, setBusy, communities: communities ?? [] };
  return <Stack spacing={2}>
    <SectionNavigation value={view} onChange={setView} disabled={busy} label="Workspace sections" sections={[
      { id: 'groups', label: 'My groups' }, { id: 'communities', label: 'My communities' },
    ]} />
    {error && <Alert severity="warning" action={<Button onClick={refresh}>Retry</Button>}>{error}</Alert>}
    {!communities && !error && <Typography role="status">Loading community access…</Typography>}
    {view === 'groups' ? <GroupAdministration {...props} /> : <CommunityAdministration {...props} onChanged={refresh} />}
  </Stack>;
}
