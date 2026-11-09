import { matchResult } from '../game/matchResult';
import { Box, Stack, Typography } from '@mui/material';
import { teamMatchPlayers, TEAM_IDS } from '../game/match';

export default function MatchSummary({ state }) {
  const sets = state.log.filter(entry => entry.type === 'set');
  const { A, B } = state.teams;
  const result = matchResult(sets);
  const winner = result.winner ? state.teams[result.winner] : null;
  return <>
    <Typography variant="h6" sx={{ overflowWrap: 'anywhere' }}>{A.name} {result.setsA} × {result.setsB} {B.name}</Typography>
    <Typography sx={{ mb: 2 }}>{winner ? `Winner: ${winner.name}` : 'Match unfinished · no team has won three sets'}</Typography>
    <Typography component="h3" variant="subtitle2">Sets</Typography>
    {sets.map(set => <Box key={set.setNumber} sx={{ mb: 1 }}><Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
      Set {set.setNumber}{result.decidedAt && set.setNumber > result.decidedAt ? ' · Training' : ''} · {set.teamAName} {set.scoreA} × {set.scoreB} {set.teamBName}
    </Typography>
      {set.rosters && TEAM_IDS.map(id => <Typography key={id} variant="caption" color="text.secondary" sx={{ display: 'block', overflowWrap: 'anywhere' }}>
        {id === 'A' ? set.teamAName : set.teamBName}: {set.rosters[id].map(player => player.name).join(', ')}
      </Typography>)}
    </Box>)}
    <Typography component="h3" variant="subtitle2" sx={{ mt: 2 }}>Players · Match points</Typography>
    {TEAM_IDS.map(id => <Box key={id} sx={{ mt: 1.5 }}>
      <Typography variant="subtitle2">{state.teams[id].name}</Typography>
      {teamMatchPlayers(state, id).map(player => <Stack key={player.id} direction="row" sx={{ justifyContent: 'space-between', gap: 2 }}>
        <Typography variant="body2" color={player.isError ? 'text.secondary' : 'text.primary'} sx={{ overflowWrap: 'anywhere' }}>{player.name}</Typography>
        <Typography variant="body2">{player.matchPoints}</Typography>
      </Stack>)}
    </Box>)}
  </>;
}
