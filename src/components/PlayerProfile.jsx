import PlayerProfileEdit from './PlayerProfileEdit';
import { Alert, Box, Button, Chip, Paper, Stack, Typography } from '@mui/material';
import { percentage } from '../game/playerRates';
import { periodTitle } from '../game/seasonPeriods';
import { positionLabel, sexLabel } from '../game/playerProfile';
import { publicGroupHref, publicPlayerHref } from '../public/routes';
import SeasonFilters from './SeasonFilters';
import ListPagination from './ListPagination';
import { MatchCard } from './GroupResults';

const resultLabels = {
  draw: 'Draw',
  win: 'Win',
  loss: 'Loss',
  mixed: 'Played for both teams · no individual win',
  unfinished: 'Unfinished · no individual win',
  training: 'Training only · no individual win',
  unassigned: 'No individual win · competitive team not assigned',
};
export default function PlayerProfile({ data, route, loading, refresh }) {
  const { player, statistics: stats } = data;
  const href = (options) =>
    publicPlayerHref(route.groupId, route.playerId, {
      season: data.season,
      period: data.period,
      pageSize: data.page_size,
      ...options,
    });
  const navigate = (options) => {
    window.location.hash = href(options).slice(1);
  };
  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography component="h1" variant="h3" sx={{ overflowWrap: 'anywhere' }}>
          {player.name}
        </Typography>
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            {player.display_id}
          </Typography>
          <Chip
            size="small"
            label={player.category === 'fixed' ? 'Fixed' : 'Sub'}
            color={player.category === 'fixed' ? 'primary' : 'warning'}
          />
          {player.removed && <Chip size="small" label="Removed from registry" variant="outlined" />}
        </Stack>
      </Stack>
      {!player.removed && (
        <PlayerProfileEdit groupId={data.group.id} playerId={player.id} onSaved={refresh} />
      )}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Sex
        </Typography>
        <Typography sx={{ mb: 2 }}>{sexLabel(player.sex)}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Preferred positions
        </Typography>
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
          {player.preferred_positions.length ? (
            player.preferred_positions.map((code) => (
              <Chip key={code} label={positionLabel(code)} variant="outlined" />
            ))
          ) : (
            <Typography>Not specified</Typography>
          )}
        </Stack>
      </Paper>
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
        <SeasonFilters
          years={data.seasons}
          year={data.season}
          period={data.period}
          onYearChange={(season) => navigate({ season })}
          onPeriodChange={(period) => navigate({ period })}
        />
        <Button disabled={loading} onClick={refresh}>
          Refresh player
        </Button>
      </Stack>
      <Box>
        <Typography component="h2" variant="h5" sx={{ mb: 2 }}>
          Statistics · {periodTitle(data.season, data.period)}
        </Typography>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: 'repeat(2, minmax(0, 1fr))',
              md: 'repeat(3, minmax(0, 1fr))',
            },
            gap: 2,
          }}
        >
          {[
            [stats.points, 'Points'],
            [stats.matches, 'Matches'],
            [stats.wins, 'Wins'],
            [percentage(stats.wins, stats.matches), 'Win rate'],
            [
              stats.attendance_day_count > 0
                ? `${stats.days} / ${stats.attendance_day_count} · ${percentage(stats.days, stats.attendance_day_count)}`
                : '—',
              'Attendance',
            ],
            [
              stats.matches > 0
                ? new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(
                    stats.points / stats.matches,
                  )
                : '—',
              'Points per match',
            ],
          ].map(([value, label]) => (
            <Paper key={label} variant="outlined" sx={{ p: 2 }}>
              <Typography variant="body2" color="text.secondary">
                {label}
              </Typography>
              <Typography
                sx={{
                  fontFamily: 'Barlow Condensed, sans-serif',
                  fontWeight: 700,
                  fontSize: '1.8rem',
                  overflowWrap: 'anywhere',
                }}
              >
                {value}
              </Typography>
            </Paper>
          ))}
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          Statistics cover this group and the selected period. Attendance counts dates with recorded
          participants. Training contributes points; individual wins follow the competitive sets.
          Matches without player records are excluded.
        </Typography>
      </Box>
      <Box>
        <Typography component="h2" variant="h5" sx={{ mb: 2 }}>
          Match history
        </Typography>
        <ListPagination
          label="Matches"
          total={data.match_count}
          page={data.page}
          pageSize={data.page_size}
          count={data.matches.length}
          disabled={loading}
          getPageHref={(page) => href({ page })}
          onPageChange={(page) => navigate({ page })}
          onPageSizeChange={(pageSize) => navigate({ pageSize })}
        />
        {!data.matches.length && (
          <Alert severity="info">
            {data.match_count
              ? 'No matches on this page.'
              : 'No recorded participation in this period.'}
            {data.match_count > 0 && (
              <Button component="a" href={href({ page: 1 })}>
                First page
              </Button>
            )}
          </Alert>
        )}
        <Stack spacing={2}>
          {data.matches.map((match) => (
            <MatchCard
              key={match.id}
              match={match}
              groupId={data.group.id}
              timeZone={data.group.time_zone}
              actions={
                <Stack spacing={1}>
                  <Typography variant="body2">
                    {match.player_points} points · {resultLabels[match.player_result]}
                  </Typography>
                  <Button
                    component="a"
                    sx={{ alignSelf: 'start' }}
                    href={publicGroupHref(route.groupId, {
                      season: data.season,
                      period: data.period,
                      matchId: match.id,
                    })}
                  >
                    View match
                  </Button>
                </Stack>
              }
            />
          ))}
        </Stack>
      </Box>
    </Stack>
  );
}
