import { useEffect, useId, useState } from 'react';
import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SectionNavigation from './SectionNavigation';
import GroupAdministration from './GroupAdministration';
import CommunityAdministration from './CommunityAdministration';
import { remoteCommunities } from '../remote/communities';

export default function AdministrationWorkspace({ client, userId, busy, setBusy }) {
  const [view, setView] = useState('groups');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
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
  return <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: '200px minmax(0, 1fr)' }, gap: { xs: 2, md: 3 }, alignItems: 'start' }}>
    <Box component="aside" sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 1, position: { md: 'sticky' }, top: { md: 16 } }}>
      <Button fullWidth onClick={() => setMenuOpen(open => !open)} aria-expanded={menuOpen} aria-controls={menuId}
        endIcon={<ExpandMoreIcon sx={{ transform: menuOpen ? 'rotate(180deg)' : undefined }} />}
        sx={{ display: { xs: 'flex', md: 'none' }, justifyContent: 'space-between', textAlign: 'left' }}>
        Administration · {view === 'groups' ? 'My groups' : 'My communities'}
      </Button>
      <Box id={menuId} sx={{ display: { xs: menuOpen ? 'block' : 'none', md: 'block' } }}>
        <Typography variant="overline" color="text.secondary" sx={{ display: { xs: 'none', md: 'block' }, px: 2, pb: 1 }}>Workspace</Typography>
        <SectionNavigation orientation="vertical" value={view} onChange={next => { setView(next); setMenuOpen(false); }} disabled={busy} label="Workspace sections" sections={[
          { id: 'groups', label: 'My groups' }, { id: 'communities', label: 'My communities' },
        ]} />
      </Box>
    </Box>
    <Stack spacing={2} sx={{ minWidth: 0 }}>
      {error && <Alert severity="warning" action={<Button onClick={refresh}>Retry</Button>}>{error}</Alert>}
      {!communities && !error && <Typography role="status">Loading community access…</Typography>}
      {view === 'groups' ? <GroupAdministration {...props} /> : <CommunityAdministration {...props} onChanged={refresh} />}
    </Stack>
  </Box>;
}
