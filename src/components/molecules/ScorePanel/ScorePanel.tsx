import { Box, Typography } from '@mui/material';
import { teamScore } from '../../../game/match';
import type { Team, TeamId } from '../../../game/types';
import { teamColors } from '../../../theme';

export interface ScorePanelProps {
  id: TeamId;
  team: Team;
}

export const ScorePanel = ({ id, team }: ScorePanelProps) => {
  const score = teamScore(team);
  return (
    <Box className="score-panel" sx={{ bgcolor: teamColors[id] }}>
      <Typography
        component="p"
        className="score"
        aria-label={`Score for ${team.name}`}
        aria-live="polite"
        aria-atomic="true"
      >
        {score}
      </Typography>
    </Box>
  );
};
