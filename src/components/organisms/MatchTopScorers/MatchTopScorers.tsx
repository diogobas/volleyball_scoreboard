import { Box, Button, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import type * as Game from '../../../game/types';
import { matchTeamColors } from '../../../public/matchPresentation';
import { publicMatchStatistics } from '../../../public/matchStatistics';
import type * as Models from '../../../remote/models';
import { publicMatchDetails } from '../../../remote/publicStats';
import type { RpcClient } from '../../../remote/transport';

export const MatchTopScorers = ({
  groupId,
  match,
  client,
}: {
  groupId: string;
  match: Models.PublicMatch;
  client?: RpcClient;
}) => {
  const [players, setPlayers] = useState<Game.RankedPlayer[] | null>(null);
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
};
