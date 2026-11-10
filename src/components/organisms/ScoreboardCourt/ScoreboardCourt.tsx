import { Box, Chip, Stack, Typography } from '@mui/material';
import { matchResult } from '../../../game/matchResult';
import { ScorePanel } from '../../molecules/ScorePanel';
import { TeamRoster } from '../TeamRoster';
import { MatchStatistics } from '../MatchStatistics';
import type { RefObject } from 'react';
import type { MatchAction, MatchState, TeamId } from '../../../game/types';
import type { MatchView } from '../../molecules/MatchViewTabs';

export interface ScoreboardCourtProps {
  state: MatchState;
  teamOrder: TeamId[];
  tab: MatchView;
  courtRef: RefObject<HTMLDivElement | null>;
  onAction: (action: MatchAction) => void;
}

export const ScoreboardCourt = ({
  state,
  teamOrder,
  tab,
  courtRef,
  onAction,
}: ScoreboardCourtProps) => {
  const [leftTeam, rightTeam] = teamOrder.map((id) => state.teams[id]);
  const decided = matchResult(state.log.filter((entry) => entry.type === 'set'));
  return (
    <Box ref={courtRef} className={`court${tab !== 0 ? ' court--stats' : ''}`}>
      {tab === 0 && (
        <Box className="scoreboard">
          <Stack
            className="set-bar"
            direction="row"
            sx={{ alignItems: 'center', justifyContent: 'center', gap: 2 }}
          >
            <Typography
              className="sets-won"
              variant="body2"
              aria-label={`Sets won by ${leftTeam.name}`}
            >
              {leftTeam.setsWon}
            </Typography>
            <Chip
              size="small"
              variant="outlined"
              label={`${decided.winner ? 'Training · ' : ''}Set ${state.currentSet}`}
            />
            <Typography
              className="sets-won"
              variant="body2"
              aria-label={`Sets won by ${rightTeam.name}`}
            >
              {rightTeam.setsWon}
            </Typography>
          </Stack>
          <Box className="score-panels">
            {teamOrder.map((id) => (
              <ScorePanel key={id} id={id} team={state.teams[id]} />
            ))}
          </Box>
        </Box>
      )}
      <Box
        className="game-panel"
        role="tabpanel"
        id="game-panel"
        aria-labelledby="game-tab"
        hidden={tab !== 0}
      >
        {tab === 0 && (
          <Box className="rosters">
            {teamOrder.map((id) => (
              <TeamRoster
                key={id}
                id={id}
                team={state.teams[id]}
                onPoint={(team, playerId) => onAction({ type: 'point', team, playerId })}
              />
            ))}
          </Box>
        )}
      </Box>
      <Box
        className="stats-panel"
        role="tabpanel"
        id="stats-panel"
        aria-labelledby="stats-tab"
        hidden={tab !== 1}
      >
        {tab === 1 && <MatchStatistics state={state} teamOrder={teamOrder} />}
      </Box>
    </Box>
  );
};
