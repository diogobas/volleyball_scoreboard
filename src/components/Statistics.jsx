import { Box, LinearProgress, Paper, Stack, Typography } from '@mui/material';
import { teamColors } from '../theme';
import { TEAM_IDS } from '../game/match';

export default function Statistics({ state, teamOrder }) {
  const sets = state.log.filter(entry => entry.type === 'set');
  // Use team identity rather than screen position so tied players stay in order when sides switch.
  const topPlayers = TEAM_IDS.flatMap(id => state.teams[id].players
    .filter(player => !player.isError && player.matchPoints > 0)
    .map(player => ({ ...player, teamId: id, teamName: state.teams[id].name })))
    .sort((a, b) => b.matchPoints - a.matchPoints)
    .slice(0, 3);
  return <Box className="statistics">
    <Box component="section" className="top-three" aria-labelledby="top-three-title">
      <Typography component="h2" variant="h5" id="top-three-title">Top 3</Typography>
      <Typography variant="body2" color="text.secondary">Match points</Typography>
      {topPlayers.length === 0
        ? <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>No player points yet.</Typography>
        : <Box component="ol" className="top-three-list" aria-label="Top 3 players">
          {topPlayers.map(player => <Paper component="li" key={`${player.teamId}-${player.id}`}
            className="top-three-card" elevation={0} style={{ borderTopColor: teamColors[player.teamId] }}>
            <Typography component="span" className="top-three-rank" aria-label={`Rank ${topPlayers.findIndex(p => p.matchPoints === player.matchPoints) + 1}`}>
              #{topPlayers.findIndex(p => p.matchPoints === player.matchPoints) + 1}
            </Typography>
            <Typography component="h3" className="top-three-name">{player.name}</Typography>
            <Typography variant="caption" color="text.secondary">{player.teamName}</Typography>
            <Typography component="p" className="top-three-points">{player.matchPoints}</Typography>
            <Typography variant="caption" color="text.secondary">points</Typography>
          </Paper>)}
        </Box>}
    </Box>
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
