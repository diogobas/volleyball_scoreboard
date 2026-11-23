import { Box, Paper, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { matchResult } from '../../../game/matchResult';
import {
  matchTeamColors,
  playedTime,
  resultText,
  winnerFor,
} from '../../../public/matchPresentation';
import type * as Models from '../../../remote/models';
import type { RpcClient } from '../../../remote/transport';
import { MatchTopScorers } from '../MatchTopScorers';
export type MatchCardProps = {
  match: Models.PublicMatch;
  timeZone: string;
  groupId: string;
  client?: RpcClient;
  actions?: ReactNode;
};
export const MatchCard = ({ match, timeZone, groupId, client, actions }: MatchCardProps) => {
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
        borderTopColor: winnerFor(match) ? matchTeamColors[winnerFor(match)!] : 'divider',
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
};
