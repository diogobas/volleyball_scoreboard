import SportsVolleyballRounded from '@mui/icons-material/SportsVolleyballRounded';
import { Alert, Button, Container, Divider, Paper, Stack, Typography } from '@mui/material';
import { PrivacyLink } from '../../components/atoms/PrivacyLink';
import { GroupSeason } from '../../components/organisms/GroupSeason';
import { MatchDetails } from '../../components/organisms/MatchDetails';
import { PlayerProfile } from '../../components/organisms/PlayerProfile';
import { usePublicResults } from '../../hooks/usePublicResults';
import { publicCommunityHref, publicGroupHref } from '../../public/routes';
import type { PublicRoute } from '../../public/routeTypes';

export const PublicResultsPage = ({ route }: { route: PublicRoute }) => {
  const { data, error, loading, period, refresh } = usePublicResults(route);
  const community =
    data && 'community' in data
      ? data.community
      : data && 'group' in data
        ? data.group.community
        : undefined;
  const group = data && 'group' in data ? data.group : undefined;
  const homeHref = community
    ? publicCommunityHref(community.display_id ?? community.id)
    : group
      ? publicGroupHref(group.display_id ?? group.id)
      : '#/groups';
  return (
    <Container component="main" maxWidth="lg" sx={{ py: { xs: 2, sm: 4 }, pb: 6 }}>
      <Stack
        component="header"
        direction="row"
        sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 4 }}
      >
        <Stack
          component="a"
          href={homeHref}
          direction="row"
          spacing={1}
          sx={{ alignItems: 'center', color: 'text.primary', textDecoration: 'none' }}
        >
          <SportsVolleyballRounded color="primary" />
          <Typography variant="overline" sx={{ lineHeight: 1.3 }}>
            Volleyball
            <br />
            Public results
          </Typography>
        </Stack>
        <Button component="a" href="#/admin" variant="outlined" size="small">
          Administration
        </Button>
      </Stack>
      {route.kind === 'directory' ? (
        <Stack spacing={2}>
          <Typography component="h1" variant="h3">
            Community results
          </Typography>
          <Typography>
            Open the link shared by your community or group to see its matches and statistics.
          </Typography>
          <Button component="a" href="#/admin" sx={{ alignSelf: 'start' }}>
            Sign in to manage your communities and groups
          </Button>
        </Stack>
      ) : route.kind === 'missing' ? (
        <Stack spacing={2}>
          <Typography component="h1" variant="h3">
            Page not found
          </Typography>
          <Typography>Check the community or group link you received.</Typography>
        </Stack>
      ) : (
        <>
          {route.kind === 'match' && (
            <Button
              component="a"
              href={publicGroupHref(route.groupId, {
                period,
                season: route.season,
                page: route.page,
                pageSize: route.pageSize,
                view: 'matches',
              })}
              sx={{ mb: 2 }}
            >
              ← Back to matches
            </Button>
          )}
          {route.kind === 'player' && (
            <Button
              component="a"
              href={publicGroupHref(route.groupId, {
                season: route.season,
                period,
                view: 'players',
              })}
              sx={{ mb: 2 }}
            >
              ← Back to players
            </Button>
          )}
          {route.kind === 'group' && community && (
            <Button component="a" href={homeHref} sx={{ mb: 2 }}>
              ← {community.name}
            </Button>
          )}
          {route.kind === 'community' && community && (
            <>
              <Typography component="h1" variant="h3" sx={{ overflowWrap: 'anywhere' }}>
                {community.name}
              </Typography>
              <Typography color="text.secondary" sx={{ mt: 1, mb: 3 }}>
                {community.region} · {community.display_id}
              </Typography>
            </>
          )}
          {group && (
            <>
              <Typography
                component={['match', 'player'].includes(route.kind) ? 'p' : 'h1'}
                variant={['match', 'player'].includes(route.kind) ? 'h5' : 'h3'}
                sx={{ overflowWrap: 'anywhere' }}
              >
                {group.name}
              </Typography>
              <Typography color="text.secondary" variant="body2" sx={{ mt: 1, mb: 3 }}>
                {group.display_id && `${group.display_id} · `}Published results
              </Typography>
            </>
          )}
          {error && (
            <Alert
              severity="warning"
              sx={{ mb: 2 }}
              action={
                <Button disabled={loading} onClick={refresh}>
                  Retry
                </Button>
              }
            >
              {error}
              {data && ' Showing the last results received.'}
            </Alert>
          )}
          {loading && (
            <Typography role="status" sx={{ my: 2 }}>
              Loading confirmed results…
            </Typography>
          )}
          {data && route.kind === 'community' && 'groups' in data && (
            <Stack spacing={2}>
              <Typography component="h2" variant="h5">
                Groups
              </Typography>
              {data.groups.length === 0 && (
                <Alert severity="info">No groups in this community yet.</Alert>
              )}
              {data.groups.map((item) => (
                <Paper key={item.id} variant="outlined" sx={{ p: 3 }}>
                  <Typography component="h3" variant="h5" sx={{ overflowWrap: 'anywhere' }}>
                    {item.name}
                  </Typography>
                  <Typography color="text.secondary" variant="body2" sx={{ my: 1 }}>
                    {item.display_id}
                  </Typography>
                  <Button
                    component="a"
                    href={publicGroupHref(item.display_id ?? item.id)}
                    aria-label={`View ${item.name}`}
                  >
                    View group →
                  </Button>
                </Paper>
              ))}
            </Stack>
          )}
          {data && route.kind === 'group' && 'point_count' in data && (
            <GroupSeason data={data} route={route} loading={loading} refresh={refresh} />
          )}
          {data && route.kind === 'player' && 'statistics' in data && (
            <PlayerProfile data={data} route={route} loading={loading} refresh={refresh} />
          )}
          {data && route.kind === 'match' && 'sets' in data && (
            <MatchDetails data={data} loading={loading} refresh={refresh} />
          )}
        </>
      )}
      <Divider sx={{ mt: 5, mb: 2 }} />
      <Typography component="footer" variant="caption" color="text.secondary">
        Matches appear here as soon as they are saved and synced.
      </Typography>
      <Stack component="footer" sx={{ mt: 4, alignItems: 'center' }}>
        <PrivacyLink />
      </Stack>
    </Container>
  );
};
