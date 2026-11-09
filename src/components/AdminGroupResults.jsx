import { useEffect, useState } from 'react';
import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import { publicGroupSummary } from '../remote/publicStats';
import { readRoute } from '../public/routes';
import { GroupSeason } from './GroupResults';
import MatchManager from './MatchManager';

export default function AdminGroupResults({ client, group, view, onViewChange, refreshKey }) {
  const [route, setRoute] = useState({ groupId: group.id, season: null, page: 1, pageSize: 5 });
  const [data, setData] = useState(null); const [loading, setLoading] = useState(false);
  const [error, setError] = useState(''); const [attempt, setAttempt] = useState(0);
  const refresh = () => setAttempt(value => value + 1);
  useEffect(() => {
    if (!['overview', 'players'].includes(view)) return;
    let active = true; setLoading(true); setError('');
    publicGroupSummary(group.id, route.season, 1, client).then(result => { if (active) setData(result); })
      .catch(failure => { if (active) setError(failure.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [client, group.id, route.season, view, attempt, refreshKey]);
  function navigate(href) { const next = readRoute(href); next.season ??= data?.season ?? null; setRoute(next); onViewChange(next.view); }
  return <Stack spacing={2}>
    <Box hidden={view === 'matches'}>
      {error && <Alert severity="warning" action={<Button onClick={refresh}>Retry</Button>}>{error}</Alert>}
      {loading && <Typography role="status">Loading results…</Typography>}
      {data && ['overview', 'players'].includes(view) && <GroupSeason data={data} route={{ ...route, view }} loading={loading} refresh={refresh} client={client} hideNavigation onNavigate={navigate} />}
    </Box>
    <Box hidden={view !== 'matches'}><MatchManager client={client} group={group} active={view === 'matches'} season={route.season}
      onSeasonChange={season => setRoute(previous => ({ ...previous, season }))} refreshKey={refreshKey} /></Box>
  </Stack>;
}
