import { Box, ButtonBase, Chip, Typography } from '@mui/material';
import { teamColors } from '../theme';
import { teamScore } from '../game/match';

export function ScorePanel({ id, team }) {
  return <Box className="score-panel" sx={{ bgcolor: teamColors[id] }}>
    <Typography component="h2" className="team-heading">{team.name}</Typography>
    <Typography component="p" className="score" aria-label={`Score for ${team.name}`} aria-live="polite">{teamScore(team)}</Typography>
    <Typography variant="caption" sx={{ opacity: .75 }}>{team.setsWon} {team.setsWon === 1 ? 'set won' : 'sets won'}</Typography>
  </Box>;
}

export function Roster({ id, team, onPoint }) {
  return <Box className="roster" sx={{ bgcolor: teamColors[id] }} aria-label={`Players for ${team.name}`}>
    {team.players.map(player => <ButtonBase key={player.id}
      className={`player-button ${player.isError ? 'error-button' : ''}`}
      aria-label={`Add point to ${player.name} — ${team.name}`}
      onClick={() => onPoint(id, player.id)}>
      <span className="player-name">{player.name}</span>
      <Chip component="span" className="player-points" label={player.setPoints} />
    </ButtonBase>)}
  </Box>;
}
