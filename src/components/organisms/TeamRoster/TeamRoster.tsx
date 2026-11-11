import { Box, ButtonBase, Chip } from '@mui/material';
import type { Team, TeamId } from '../../../game/types';
import { teamColors } from '../../../theme';

const playerNames = new Intl.Collator('pt', { sensitivity: 'base', numeric: true });
export interface TeamRosterProps {
  id: TeamId;
  team: Team;
  onPoint: (team: TeamId, playerId: string) => void;
}

export const TeamRoster = ({ id, team, onPoint }: TeamRosterProps) => {
  const players = [...team.players].sort(
    (a, b) => Number(a.isError) - Number(b.isError) || playerNames.compare(a.name, b.name),
  );

  return (
    <Box
      className="roster"
      sx={{ bgcolor: teamColors[id] }}
      aria-label={`Players for ${team.name}`}
    >
      <Box className="player-list">
        {players.map((player) => (
          <ButtonBase
            key={player.id}
            className={`player-button ${player.isError ? 'error-button' : ''}`}
            aria-label={`Add point to ${player.name} — ${team.name}`}
            onClick={() => onPoint(id, player.id)}
          >
            <span className="player-name">{player.name}</span>
            <Chip component="span" className="player-points" label={player.setPoints} />
          </ButtonBase>
        ))}
      </Box>
    </Box>
  );
};
