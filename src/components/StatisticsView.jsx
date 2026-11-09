import { Accordion, AccordionDetails, AccordionSummary, Box, LinearProgress, Paper, Stack, Typography } from '@mui/material';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import { teamColors } from '../theme';

export default function StatisticsView({ topPlayers, teams, sets, showPlayerTotals = true }) {
  return <Box className="statistics">
    {showPlayerTotals ? <>
    <Box component="section" className="top-three" aria-labelledby="top-three-title">
      <Typography component="h2" variant="h5" id="top-three-title">Top 3</Typography>
      <Typography variant="body2" color="text.secondary">Match points</Typography>
      {topPlayers.length === 0
        ? <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>No player points yet.</Typography>
        : <Box component="ol" className="top-three-list" aria-label="Top 3 players">
          {topPlayers.map(player => <Paper component="li" key={player.id}
            className="top-three-card" elevation={0} style={{ borderTopColor: teamColors[player.teamId] }}>
            <Typography component="span" className="top-three-rank" aria-label={`Rank ${topPlayers.findIndex(p => p.points === player.points) + 1}`}>
              #{topPlayers.findIndex(p => p.points === player.points) + 1}
            </Typography>
            <Typography component="h3" className="top-three-name">{player.name}</Typography>
            <Typography variant="caption" color="text.secondary">{player.teamName}</Typography>
            <Typography component="p" className="top-three-points">{player.points}</Typography>
            <Typography variant="caption" color="text.secondary">points</Typography>
          </Paper>)}
        </Box>}
    </Box>
    <Box className="stats-grid">
      {teams.map(team => {
        const { id, players } = team;
        const max = Math.max(1, ...players.map(player => player.points));
        return <Box key={id}>
          <Typography variant="h5" sx={{ mb: 2, color: id === 'A' ? '#82b9f1' : '#ff998d' }}>{team.name}</Typography>
          {[...players].sort((a, b) => b.points - a.points).map(player => <Box key={player.id} sx={{ mb: 2 }}>
            <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1, mb: .5 }}>
              <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{player.name}</Typography>
              <Typography variant="body2">{player.points}</Typography>
            </Stack>
            <LinearProgress variant="determinate" value={player.points / max * 100}
              aria-label={`Points for ${player.name} — ${team.name}`} aria-valuetext={`${player.points} points`}
              sx={{ height: 8, borderRadius: 2, bgcolor: 'rgba(255,255,255,.08)', '& .MuiLinearProgress-bar': { bgcolor: teamColors[id] } }} />
          </Box>)}
        </Box>;
      })}
    </Box>
    </> : <Typography color="text.secondary">Player totals were not recorded.</Typography>}
    {sets.length > 0 && <Box sx={{ mt: 3 }}><Typography variant="overline">Set history</Typography>
      {sets.map(entry => {
        const ranking = entry.ranking;
        return <Accordion key={entry.setNumber} disableGutters elevation={0} sx={{ mt: 1, bgcolor: '#ffffff08', backgroundImage: 'none' }}>
          <AccordionSummary expandIcon={<ExpandMoreRounded />} id={`set-${entry.setNumber}-summary`} aria-controls={`set-${entry.setNumber}-ranking`}>
            <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
              <Typography variant="body2">Set {entry.setNumber}{entry.training ? ' · Training' : ''}{entry.early_finish ? ' · Ended early' : ''}</Typography>
              <Typography variant="body2" color="text.secondary">{entry.teamAName} {entry.scoreA} × {entry.scoreB} {entry.teamBName}</Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            {entry.statisticsAvailable === false ? <Typography variant="body2" color="text.secondary">{showPlayerTotals ? 'Only match totals were recorded. Player points per set are unavailable.' : 'Player points per set were not recorded.'}</Typography> : <>
            {entry.rosters && ['A','B'].map(id => <Typography key={id} variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {id === 'A' ? entry.teamAName : entry.teamBName}: {entry.rosters[id].map(player => player.name).join(', ')}
            </Typography>)}
            <Typography component="h3" variant="subtitle2" sx={{ mb: 1 }}>Player ranking · Set {entry.setNumber}{entry.training ? ' · Training' : ''}{entry.early_finish ? ' · Ended early' : ''}</Typography>
            {ranking.length === 0
              ? <Typography variant="body2" color="text.secondary">No player points in this set.</Typography>
              : <Box component="ol" aria-label={`Player ranking for set ${entry.setNumber}`} sx={{ listStyle: 'none', p: 0, m: 0 }}>
                {ranking.map(player => <Box component="li" key={`${player.teamId}-${player.id}`} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1 }}>
                  <Typography variant="body2" sx={{ minWidth: '2ch' }}>#{ranking.findIndex(p => p.points === player.points) + 1}</Typography>
                  <Box sx={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
                    <Typography variant="body2">{player.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{player.teamName}</Typography>
                  </Box>
                  <Typography variant="body2">{player.points} {player.points === 1 ? 'point' : 'points'}</Typography>
                </Box>)}
              </Box>}
            </>}
          </AccordionDetails>
        </Accordion>;
      })}
    </Box>}
  </Box>;
}
