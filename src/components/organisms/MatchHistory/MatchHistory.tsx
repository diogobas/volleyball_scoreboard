import { Box, Paper, Typography } from '@mui/material';
import type { MatchEvent } from '../../../game/types';

export interface MatchHistoryProps {
  log: MatchEvent[];
}

export const MatchHistory = ({ log }: MatchHistoryProps) => {
  return (
    <Box component="details" className="log-wrap">
      <Box component="summary">
        <Typography component="span" variant="overline" color="text.secondary">
          Recent points ({log.length})
        </Typography>
      </Box>
      <Box className="log-list">
        {log.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
            No points scored yet. Tap a player to start.
          </Typography>
        ) : (
          log
            .slice(-40)
            .reverse()
            .map((entry, i) => (
              <Paper key={log.length - i} className="log-item" elevation={0}>
                <Typography variant="body2">
                  {entry.type === 'roster'
                    ? `Lineup changed · Set ${entry.setNumber}`
                    : entry.type === 'set'
                      ? `Set ${entry.setNumber} · ${entry.teamAName} ${entry.scoreA} × ${entry.scoreB} ${entry.teamBName}`
                      : `${entry.teamName} · ${entry.playerId === 'err' ? 'Opponent’s error' : entry.playerName}`}
                </Typography>
                {entry.type === 'point' && (
                  <Typography variant="body2" color="text.secondary">
                    +1
                  </Typography>
                )}
              </Paper>
            ))
        )}
      </Box>
    </Box>
  );
};
