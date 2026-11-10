import SeasonFilters from './SeasonFilters';
import { currentPeriod, periodTitle } from '../game/seasonPeriods';
import { percentage } from '../game/playerRates';
import { matchResult } from '../game/matchResult';
import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Link,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { publicMatchDetails } from '../remote/publicStats';
import StatisticsView from './StatisticsView';
import { publicMatchStatistics } from '../public/matchStatistics';
import { publicGroupHref, publicPlayerHref } from '../public/routes';
import { teamColors } from '../theme';
import SectionNavigation from './SectionNavigation';
import ListPagination from './ListPagination';
const matchTeamColors = { A: teamColors.B, B: teamColors.A };
function playedTime(match, timeZone) {
  if (match.played_on)
    return new Intl.DateTimeFormat('en', { timeZone: 'UTC', dateStyle: 'medium' }).format(
      new Date(`${match.played_on}T12:00:00Z`),
    );
  return new Intl.DateTimeFormat('en', {
    timeZone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(match.started_at ?? match.closed_at));
}
const winnerFor = (match) =>
  Object.hasOwn(match, 'winner') ? match.winner : matchResult(match.sets).winner;
const resultText = (match) =>
  match.ended_as_draw
    ? 'Draw · match ended early'
    : winnerFor(match)
      ? `Winner: ${winnerFor(match) === 'A' ? match.team_a_name : match.team_b_name}`
      : 'Match unfinished · no team has won three sets';
export function GroupSeason({
  data,
  route,
  loading,
  refresh,
  onNavigate,
  hideNavigation = false,
  client,
}) {
  const navigate = (href) => {
    if (onNavigate) onNavigate(href);
    else window.location.hash = href.slice(1);
  };
  const view = route.view ?? 'overview';
  const period = data.period ?? route.period ?? currentPeriod();
  const title = periodTitle(data.season, period);
  const groupHref = (groupId, options) => publicGroupHref(groupId, { period, ...options });
  return (
    <Box
      onClick={
        onNavigate
          ? (event) => {
              const link = event.target.closest('a[href^="#/groups/"]');
              if (
                link &&
                !link.getAttribute('href').includes('/players/') &&
                !event.ctrlKey &&
                !event.metaKey &&
                !event.shiftKey &&
                event.button === 0
              ) {
                event.preventDefault();
                onNavigate(link.getAttribute('href'));
              }
            }
          : undefined
      }
    >
      <Stack
        direction="row"
        spacing={2}
        sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 2, mb: 2 }}
      >
        <SeasonFilters
          years={data.seasons}
          year={data.season}
          period={period}
          onYearChange={(season) =>
            navigate(groupHref(route.groupId, { season, view, pageSize: route.pageSize }))
          }
          onPeriodChange={(next) =>
            navigate(
              groupHref(route.groupId, {
                season: data.season,
                period: next,
                view,
                pageSize: route.pageSize,
              }),
            )
          }
        />
        <Button disabled={loading} onClick={refresh}>
          Refresh results
        </Button>
      </Stack>
      {!hideNavigation && (
        <SectionNavigation
          idPrefix="group"
          value={view}
          label="Group sections"
          sections={['overview', 'players', 'matches'].map((id) => ({
            id,
            label: id[0].toUpperCase() + id.slice(1),
            href: groupHref(route.groupId, { ...route, view: id }),
          }))}
        />
      )}
      <Box
        role={hideNavigation ? undefined : 'tabpanel'}
        id={hideNavigation ? undefined : `group-section-${view}`}
        aria-labelledby={hideNavigation ? undefined : `group-tab-${view}`}
      >
        {view === 'overview' && (
          <>
            <Typography component="h2" variant="h5" sx={{ mb: 2 }}>
              Season overview · {title}
            </Typography>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: { xs: 1, sm: 2 },
                mb: 4,
              }}
            >
              {[
                [data.match_count, 'Matches', 'matches'],
                [data.participant_count, 'Players', 'players'],
                [data.point_count, 'Points played', null],
              ].map(([value, label, section]) => (
                <Paper
                  key={label}
                  variant="outlined"
                  component={section ? 'a' : 'div'}
                  href={
                    section
                      ? groupHref(route.groupId, {
                          season: route.season,
                          page: route.page,
                          pageSize: route.pageSize,
                          view: section,
                        })
                      : undefined
                  }
                  aria-label={section ? `View ${label.toLowerCase()}` : undefined}
                  sx={{
                    p: { xs: 1.5, sm: 2.5 },
                    display: 'block',
                    color: 'inherit',
                    textDecoration: 'none',
                    ...(section && {
                      '&:hover': { borderColor: 'primary.main' },
                      '&:focus-visible': {
                        outline: '2px solid',
                        outlineColor: 'primary.main',
                        outlineOffset: 2,
                      },
                    }),
                  }}
                >
                  <Typography sx={{ font: '700 2.5rem/1 "Barlow Condensed", sans-serif', mb: 1 }}>
                    {value}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {label}
                  </Typography>
                </Paper>
              ))}
            </Box>
            <Typography variant="body2" color="text.secondary">
              Choose Players for individual statistics or Matches to browse published results.
            </Typography>
          </>
        )}
        {view === 'players' && (
          <>
            <Typography component="h2" variant="h5" sx={{ mb: 2 }}>
              Player statistics · {title}
            </Typography>
            {data.unattributed_matches > 0 && (
              <Alert severity="info" sx={{ mb: 2 }}>
                {data.unattributed_matches} matches have set scores only and are excluded from
                individual points, attendance and wins.
              </Alert>
            )}
            <TableContainer component={Paper} variant="outlined">
              <Table
                size="small"
                aria-label={`Player statistics for season ${title}`}
                sx={{ minWidth: 640 }}
              >
                <TableHead>
                  <TableRow>
                    <TableCell>Player</TableCell>
                    {['Points', 'Matches', 'Wins', 'Win rate', 'Attendance'].map((label) => (
                      <TableCell key={label} align="right">
                        {label}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.players.map((player) => (
                    <TableRow key={player.id}>
                      <TableCell
                        component="th"
                        scope="row"
                        sx={{ overflowWrap: 'anywhere', maxWidth: 240 }}
                      >
                        <Link
                          href={publicPlayerHref(route.groupId, player.display_id ?? player.id, {
                            season: data.season,
                            period,
                            pageSize: route.pageSize,
                          })}
                        >
                          {player.name}
                        </Link>
                        {player.display_id && (
                          <Typography
                            component="span"
                            variant="caption"
                            color="text.secondary"
                            sx={{ ml: 1 }}
                          >
                            {player.display_id}
                          </Typography>
                        )}
                        {player.category && (
                          <Chip
                            size="small"
                            label={player.category === 'fixed' ? 'Fixed' : 'Sub'}
                            color={player.category === 'fixed' ? 'primary' : 'warning'}
                            sx={{ ml: 1 }}
                          />
                        )}
                        {player.removed && (
                          <Typography component="span" variant="caption" color="text.secondary">
                            {' '}
                            · Removed
                          </Typography>
                        )}
                      </TableCell>
                      {[
                        player.points,
                        player.matches,
                        player.wins,
                        percentage(player.wins, player.matches),
                        Number.isInteger(data.attendance_day_count) && data.attendance_day_count > 0
                          ? `${player.days} / ${data.attendance_day_count} · ${percentage(player.days, data.attendance_day_count)}`
                          : '—',
                      ].map((value, i) => (
                        <TableCell key={i} align="right">
                          {value}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            {data.players.length === 0 && (
              <Typography sx={{ mt: 1 }}>No registered players yet.</Typography>
            )}
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: { xs: 'block', sm: 'none' }, mt: 1 }}
            >
              Swipe the table sideways to see all columns.
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              Win rate = wins ÷ matches played. Attendance = days played ÷ days with recorded
              participants in this season, counting each recorded date once. Days without player
              records are excluded. A dash means there is no basis for a percentage. Playing for
              both teams during competitive sets gives no individual win. Training team changes do
              not affect victories. Unfinished matches grant no victory.
            </Typography>
            {data.fallback_dates > 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Older matches using their closing date: {data.fallback_dates}.
              </Typography>
            )}
          </>
        )}
        {view === 'matches' && (
          <>
            <Typography component="h2" variant="h5" sx={{ mb: 2 }}>
              Matches · {title}
            </Typography>
            {data.matches.length === 0 && (
              <Alert
                severity="info"
                action={
                  data.match_count ? (
                    <Button
                      component="a"
                      href={groupHref(route.groupId, {
                        season: data.season,
                        pageSize: data.page_size,
                        view: 'matches',
                      })}
                    >
                      First page
                    </Button>
                  ) : undefined
                }
              >
                {data.match_count
                  ? 'No matches on this page.'
                  : 'No confirmed matches in this season.'}
              </Alert>
            )}
            <ListPagination
              total={data.match_count}
              page={data.page}
              pageSize={data.page_size}
              count={data.matches.length}
              label="Matches"
              getPageHref={(page) =>
                groupHref(route.groupId, {
                  season: data.season,
                  page,
                  pageSize: data.page_size,
                  view: 'matches',
                })
              }
              onPageChange={(page) =>
                navigate(
                  groupHref(route.groupId, {
                    season: data.season,
                    page,
                    pageSize: data.page_size,
                    view: 'matches',
                  }),
                )
              }
              onPageSizeChange={(pageSize) =>
                navigate(
                  groupHref(route.groupId, { season: data.season, pageSize, view: 'matches' }),
                )
              }
            />
            <Stack spacing={2}>
              {data.matches.map((match) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  timeZone={data.group.time_zone}
                  groupId={data.group.id}
                  client={client}
                  actions={
                    <Button
                      component="a"
                      href={groupHref(route.groupId, {
                        season: data.season,
                        page: data.page,
                        pageSize: data.page_size,
                        matchId: match.id,
                      })}
                    >
                      View match
                    </Button>
                  }
                />
              ))}
            </Stack>
          </>
        )}
      </Box>
    </Box>
  );
}

function MatchTopScorers({ groupId, match, client }) {
  const [players, setPlayers] = useState(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setPlayers(null);
    setFailed(false);
    if (match.player_totals_recorded === false) {
      setPlayers([]);
      return;
    }
    publicMatchDetails(groupId, match.id, client)
      .then((data) => {
        if (active) setPlayers(publicMatchStatistics(data).topPlayers);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [groupId, match, client, attempt]);

  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography component="h4" variant="subtitle2" sx={{ mb: 1 }}>
        Top scorers
      </Typography>
      {failed ? (
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Scorers could not be loaded.
          </Typography>
          <Button size="small" onClick={() => setAttempt((value) => value + 1)}>
            Retry scorers
          </Button>
        </Stack>
      ) : players === null ? (
        <Typography variant="body2" color="text.secondary" role="status">
          Loading scorers…
        </Typography>
      ) : players.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {match.player_totals_recorded === false
            ? 'Player totals were not recorded.'
            : 'No player points recorded.'}
        </Typography>
      ) : (
        <Box
          component="ol"
          aria-label={`Top scorers for ${match.team_a_name} vs ${match.team_b_name}`}
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' },
            gap: 1,
            listStyle: 'none',
            p: 0,
            m: 0,
          }}
        >
          {players.map((player) => (
            <Box
              component="li"
              key={player.id}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                p: 1.25,
                bgcolor: 'action.hover',
                borderRadius: 1,
                minWidth: 0,
                borderTop: '4px solid',
                borderTopColor: matchTeamColors[player.teamId],
              }}
            >
              <Typography variant="body2" color="text.secondary">
                {players.findIndex((item) => item.points === player.points) + 1}.
              </Typography>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>
                  {player.name}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ overflowWrap: 'anywhere' }}
                >
                  {player.teamName}
                </Typography>
              </Box>
              <Typography variant="body2" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                {player.points} {player.points === 1 ? 'pt' : 'pts'}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

export function MatchDetails({ data, loading, refresh }) {
  const statistics = publicMatchStatistics(data);
  const result = matchResult(data.sets, {
    endedAsDraw: data.ended_as_draw,
    interruptedSet: data.draw_interrupted_set,
    rules: data.rules,
  });
  return (
    <>
      <Typography component="h1" variant="h4" sx={{ overflowWrap: 'anywhere' }}>
        {data.team_a_name} {result.setsA} × {result.setsB} {data.team_b_name}
      </Typography>
      <Stack direction="row" sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1, mt: 2, mb: 2 }}>
        <Chip label={resultText(data)} />
        <Button disabled={loading} onClick={refresh}>
          Refresh match
        </Button>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {playedTime(data, data.group.time_zone)}
        {!data.started_at && !data.played_on && ' · Closing date (start time unavailable)'}
      </Typography>
      {data.entry_mode === 'summary' && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {data.player_totals_recorded === false
            ? 'Historical match · set scores only. Player totals were not recorded.'
            : 'Historical match · individual points are totals for the whole match, including training sets.'}
        </Alert>
      )}
      {data.decided_at && data.sets.length > data.decided_at && (
        <Typography sx={{ mb: 2 }}>
          Match decided in set {data.decided_at}. The following {data.sets.length - data.decided_at}{' '}
          sets count only toward statistics.
        </Typography>
      )}
      <StatisticsView {...statistics} />
      <Typography variant="caption" color="text.secondary">
        {data.player_totals_recorded === false
          ? 'This match is included in group scores, but not individual points, attendance or wins.'
          : data.entry_mode === 'summary'
            ? 'Names and player points are whole-match totals. Individual rankings exclude opponent errors.'
            : 'Names and lineups are those recorded for each set. Player points exclude opponent errors.'}
      </Typography>
    </>
  );
}

export function MatchCard({ match, timeZone, groupId, client, actions }) {
  const result = matchResult(match.sets, {
    endedAsDraw: match.ended_as_draw,
    interruptedSet: match.draw_interrupted_set,
    rules: match.rules,
  });
  return (
    <Paper
      variant="outlined"
      sx={{
        p: { xs: 2, sm: 3 },
        display: 'grid',
        borderTop: '4px solid',
        borderTopColor: winnerFor(match) ? matchTeamColors[winnerFor(match)] : 'divider',
        gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(0, 1fr) minmax(0, 1.4fr)' },
        alignItems: 'center',
        gap: { xs: 2, sm: 3 },
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {playedTime(match, timeZone)}
          {!match.started_at && !match.played_on && ' · Closing date'}
        </Typography>
        <Typography component="h3" variant="h6" sx={{ overflowWrap: 'anywhere' }}>
          {match.team_a_name} {result.setsA} × {result.setsB} {match.team_b_name}
        </Typography>
        <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
          {resultText(match)}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ my: 1 }}>
          Sets:{' '}
          {result.sets
            .map((set) => `${set.training ? 'Training: ' : ''}${set.score_a} × ${set.score_b}`)
            .join(' · ')}
        </Typography>
        {actions}
      </Box>
      <MatchTopScorers groupId={groupId} match={match} client={client} />
    </Paper>
  );
}
