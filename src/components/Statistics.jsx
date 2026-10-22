import { Box, LinearProgress, Paper, Stack, Typography } from '@mui/material';
import { teamColors } from '../theme';

export default function Statistics({ state, teamOrder }) {
  const sets = state.log.filter(entry => entry.type === 'set');
  return <Box className="statistics">
    <Box className="stats-grid">
      {teamOrder.map(id => {
        const team = state.teams[id];
        const max = Math.max(1, ...team.players.map(p => p.matchPoints));
        return <Box key={id}>
          <Typography variant="h5" sx={{ mb: 2, color: id === 'A' ? '#82b9f1' : '#ff998d' }}>{team.name}</Typography>
          {[...team.players].sort((a, b) => b.matchPoints - a.matchPoints).map(player => <Box key={player.id} sx={{ mb: 2 }}>
            <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1, mb: .5 }}>
              <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{player.name}</Typography>
              <Typography variant="body2">{player.matchPoints}</Typography>
            </Stack>
            <LinearProgress variant="determinate" value={player.matchPoints / max * 100}
              aria-label={`Points for ${player.name} — ${team.name}`} aria-valuetext={`${player.matchPoints} points`}
              sx={{ height: 8, borderRadius: 2, bgcolor: 'rgba(255,255,255,.08)', '& .MuiLinearProgress-bar': { bgcolor: teamColors[id] } }} />
          </Box>)}
        </Box>;
      })}
    </Box>
    {sets.length > 0 && <Box sx={{ mt: 3 }}><Typography variant="overline">Set history</Typography>
      {sets.map(entry => <Paper key={entry.setNumber} className="log-item" sx={{ mt: 1 }}>
        <Typography variant="body2">Set {entry.setNumber}</Typography>
        <Typography variant="body2">{entry.teamAName} {entry.scoreA} × {entry.scoreB} {entry.teamBName}</Typography>
      </Paper>)}
    </Box>}
  </Box>;
}
