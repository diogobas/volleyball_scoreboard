import { useEffect, useState } from 'react';
import { Alert, Button, Container, Divider, Paper, Stack, Typography } from '@mui/material';
import SportsVolleyballRounded from '@mui/icons-material/SportsVolleyballRounded';
import { listPublicGroups, publicGroupSummary, publicMatchDetails } from '../remote/publicStats';
import PrivacyLink from '../components/PrivacyLink';
import { publicGroupHref } from './routes';
import { GroupSeason, MatchDetails } from '../components/GroupResults';

export default function PublicResults({ route }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    if (route.kind === 'missing') { setLoading(false); return; }
    const request = route.kind === 'groups' ? listPublicGroups() : route.kind === 'match'
      ? publicMatchDetails(route.groupId, route.matchId) : publicGroupSummary(route.groupId, route.season, route.page, undefined, route.pageSize);
    request.then(result => { if (active) setData(result); }).catch(failure => {
      if (active) setError(failure.message || 'Public results could not be loaded. Check your connection and retry.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [route.kind, route.groupId, route.matchId, route.season, route.page, route.pageSize, attempt]);

  const group = route.kind === 'groups' ? null : data?.group;
  return <Container component="main" maxWidth="lg" sx={{ py: { xs: 2, sm: 4 }, pb: 6 }}>
    <Stack component="header" direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 4 }}>
      <Stack component="a" href="#/groups" direction="row" spacing={1} sx={{ alignItems: 'center', color: 'text.primary', textDecoration: 'none' }}>
        <SportsVolleyballRounded color="primary" /><Typography variant="overline" sx={{ lineHeight: 1.3 }}>Volleyball<br />Public results</Typography>
      </Stack>
      <Button component="a" href="#/admin" variant="outlined" size="small">Administration</Button>
    </Stack>
    {route.kind === 'missing' ? <><Typography component="h1" variant="h3">Page not found</Typography><Button component="a" href="#/groups">Browse groups</Button></> : <>
      {route.kind !== 'groups' && <Button component="a" href={route.kind === 'match' ? publicGroupHref(route.groupId, { season: route.season, page: route.page, pageSize: route.pageSize, view: 'matches' }) : '#/groups'} sx={{ mb: 2 }}>
        {route.kind === 'match' ? '← Back to matches' : '← All groups'}
      </Button>}
      {route.kind === 'groups' && <><Typography component="h1" variant="h3" sx={{ mb: 1 }}>Results &amp; seasons</Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>Choose a group to see published matches and player statistics. No sign-in required.</Typography></>}
      {group && <><Typography component={route.kind === 'match' ? 'p' : 'h1'} variant={route.kind === 'match' ? 'h5' : 'h3'} sx={{ overflowWrap: 'anywhere' }}>{group.name}</Typography>
        <Typography color="text.secondary" variant="body2" sx={{ mt: 1, mb: 3 }}>{group.display_id && `${group.display_id} · `}{group.time_zone} · Published results</Typography></>}
      {error && <Alert severity="warning" sx={{ mb: 2 }} action={<Button disabled={loading} onClick={() => setAttempt(value => value + 1)}>Retry</Button>}>
        {error}{data && ' Showing the last results received. Refresh when connected.'}
      </Alert>}
      {loading && <Typography role="status" sx={{ my: 2 }}>Loading confirmed results…</Typography>}
      {data && route.kind === 'groups' && <Stack spacing={2}>
        {data.length === 0 && <Alert severity="info">No groups have been created yet.</Alert>}
        {data.map(item => <Paper key={item.id} variant="outlined" sx={{ p: 3 }}>
          <Typography component="h2" variant="h5" sx={{ overflowWrap: 'anywhere' }}>{item.name}</Typography>
          <Typography color="text.secondary" variant="body2" sx={{ my: 1 }}>{item.display_id && `${item.display_id} · `}{item.time_zone}</Typography>
          <Button component="a" href={publicGroupHref(item.display_id ?? item.id)} aria-label={`View ${item.name}`}>View group →</Button>
        </Paper>)}
      </Stack>}
      {data && route.kind === 'group' && <GroupSeason data={data} route={route} loading={loading} refresh={() => setAttempt(value => value + 1)} />}
      {data && route.kind === 'match' && <MatchDetails data={data} loading={loading} refresh={() => setAttempt(value => value + 1)} />}
    </>}
    <Divider sx={{ mt: 5, mb: 2 }} />
    <Typography component="footer" variant="caption" color="text.secondary">Matches appear here as soon as they are saved and synced.</Typography>
    <Stack component="footer" sx={{ mt: 4, alignItems: 'center' }}><PrivacyLink /></Stack>
  </Container>;
}
