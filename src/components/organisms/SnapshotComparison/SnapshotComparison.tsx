import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import { Accordion, AccordionDetails, AccordionSummary, Box, Typography } from '@mui/material';
import type * as Models from '../../../remote/models';
export type SnapshotComparisonProps = {
  before: Models.MatchSubmission;
  after: Models.MatchSubmission;
};

export const SnapshotComparison = ({ before, after }: SnapshotComparisonProps) => {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'minmax(0,1fr)', sm: 'repeat(2,minmax(0,1fr))' },
        gap: 2,
      }}
    >
      {(
        [
          [before, 'Before'],
          [after, 'After'],
        ] as const
      ).map(([payload, label]) => (
        <Box key={label}>
          <Typography component="h3" variant="subtitle1">
            {label} · {payload.sets.length} sets
          </Typography>
          {payload.sets.map((set, index) => (
            <Accordion key={index} disableGutters>
              <AccordionSummary expandIcon={<ExpandMoreRounded />}>
                <Typography variant="body2">
                  Set {index + 1} · {set.score_a} × {set.score_b}
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                {(['A', 'B'] as const).map((team) => (
                  <Typography key={team} variant="body2" sx={{ mb: 1, overflowWrap: 'anywhere' }}>
                    {team}: {set.rosters[team].map((person) => person.name).join(', ')}
                  </Typography>
                ))}
                <Box component="ol" sx={{ maxHeight: 260, overflowY: 'auto', pl: 3, m: 0 }}>
                  {set.points.map((point, index) => (
                    <Typography
                      component="li"
                      variant="body2"
                      key={index}
                      sx={{ overflowWrap: 'anywhere' }}
                    >
                      {point.team} ·{' '}
                      {point.is_opponent_error ? 'Opponent’s error' : point.player_name}
                    </Typography>
                  ))}
                </Box>
              </AccordionDetails>
            </Accordion>
          ))}
        </Box>
      ))}
    </Box>
  );
};
