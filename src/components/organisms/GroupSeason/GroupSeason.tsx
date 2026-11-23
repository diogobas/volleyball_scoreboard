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
import { percentage } from '../../../game/playerRates';
import { currentPeriod, periodTitle } from '../../../game/seasonPeriods';
import { publicGroupHref, publicPlayerHref } from '../../../public/routes';
import type { GroupHrefOptions, GroupRoute } from '../../../public/routeTypes';
import type * as Models from '../../../remote/models';
import type { RpcClient } from '../../../remote/transport';
import { ListPagination } from '../../molecules/ListPagination';
import { SeasonFilters } from '../../molecules/SeasonFilters';
import { SectionNavigation } from '../../molecules/SectionNavigation';
import type { AsyncAction } from '../../types';
import { MatchCard } from '../MatchCard';
export type GroupSeasonProps = {
  data: Models.PublicGroupSummary;
  route: GroupRoute;
  loading: boolean;
  refresh: AsyncAction;
  onNavigate?: (href: string) => void;
  hideNavigation?: boolean;
  client?: RpcClient;
};
export const GroupSeason = ({
  data,
  route,
  loading,
  refresh,
  onNavigate,
  hideNavigation = false,
  client,
}: GroupSeasonProps) => {
  const navigate = (href: string) => {
    if (onNavigate) onNavigate(href);
    else window.location.hash = href.slice(1);
  };
  const view = route.view ?? 'overview';
  const period = data.period ?? route.period ?? currentPeriod();
  const title = periodTitle(data.season, period);
  const groupHref = (groupId: string, options: GroupHrefOptions) =>
    publicGroupHref(groupId, { period, ...options });
  return (
    <Box
      onClick={
        onNavigate
          ? (event) => {
              const link =
                event.target instanceof Element
                  ? event.target.closest<HTMLAnchorElement>('a[href^="#/groups/"]')
                  : null;
              if (
                link &&
                !link.getAttribute('href')!.includes('/players/') &&
                !event.ctrlKey &&
                !event.metaKey &&
                !event.shiftKey &&
                event.button === 0
              ) {
                event.preventDefault();
                onNavigate(link.getAttribute('href')!);
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
              {(
                [
                  [data.match_count, 'Matches', 'matches'],
                  [data.participant_count, 'Players', 'players'],
                  [data.point_count, 'Points played', null],
                ] as const
              ).map(([value, label, section]) => (
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
};
