import { Box, ButtonBase, Chip, Typography } from '@mui/material';
import { teamColors } from '../theme';
import { teamScore } from '../game/match';

const playerNames = new Intl.Collator('pt', { sensitivity: 'base', numeric: true });

export function ScorePanel({ id, team }) {
  const score = teamScore(team);
  return <Box className="score-panel" sx={{ bgcolor: teamColors[id] }}>
    <Typography component="p" className="score" aria-label={`Score for ${team.name}`} aria-live="polite" aria-atomic="true">{score}</Typography>
  </Box>;
}

export function Roster({ id, team, onPoint }) {
  const players = [...team.players].sort((a, b) =>
    Number(a.isError) - Number(b.isError) || playerNames.compare(a.name, b.name));
  return <Box className="roster" sx={{ bgcolor: teamColors[id] }} aria-label={`Players for ${team.name}`}>
    <Box className="player-list">{players.map(player => <ButtonBase key={player.id}
      className={`player-button ${player.isError ? 'error-button' : ''}`}
      aria-label={`Add point to ${player.name} — ${team.name}`}
      onClick={() => onPoint(id, player.id)}>
      <span className="player-name">{player.name}</span>
      <Chip component="span" className="player-points" label={player.setPoints} />
    </ButtonBase>)}</Box>
  </Box>;
}
