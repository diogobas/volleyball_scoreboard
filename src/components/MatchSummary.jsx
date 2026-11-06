import { Box, Stack, Typography } from '@mui/material';
import { TEAM_IDS } from '../game/match';

export default function MatchSummary({ state }) {
  const sets = state.log.filter(entry => entry.type === 'set');
  const { A, B } = state.teams;
  const winner = A.setsWon === B.setsWon ? null : A.setsWon > B.setsWon ? A : B;
  return <>
    <Typography variant="h6" sx={{ overflowWrap: 'anywhere' }}>{A.name} {A.setsWon} × {B.setsWon} {B.name}</Typography>
    <Typography sx={{ mb: 2 }}>{winner ? `Winner: ${winner.name}` : 'Result: Draw'}</Typography>
    <Typography component="h3" variant="subtitle2">Sets</Typography>
    {sets.map(set => <Typography key={set.setNumber} variant="body2" sx={{ overflowWrap: 'anywhere' }}>
      Set {set.setNumber} · {set.teamAName} {set.scoreA} × {set.scoreB} {set.teamBName}
    </Typography>)}
    <Typography component="h3" variant="subtitle2" sx={{ mt: 2 }}>Players · Match points</Typography>
    {TEAM_IDS.map(id => <Box key={id} sx={{ mt: 1.5 }}>
      <Typography variant="subtitle2">{state.teams[id].name}</Typography>
      {state.teams[id].players.map(player => <Stack key={player.id} direction="row" sx={{ justifyContent: 'space-between', gap: 2 }}>
        <Typography variant="body2" color={player.isError ? 'text.secondary' : 'text.primary'} sx={{ overflowWrap: 'anywhere' }}>{player.name}</Typography>
        <Typography variant="body2">{player.matchPoints}</Typography>
      </Stack>)}
    </Box>)}
  </>;
}
