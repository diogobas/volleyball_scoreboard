import { Button, Paper, Stack, Typography } from '@mui/material';
import type { DayContext } from '../../../game/types';

export interface MatchSetupProps {
  context?: DayContext;
  onLoadLineup: () => void;
  onPlayIndependently: () => void;
}

export const MatchSetup = ({ context, onLoadLineup, onPlayIndependently }: MatchSetupProps) => {
  return (
    <Paper variant="outlined" sx={{ mx: 1.5, mb: 1.5, p: 1.5 }} aria-label="Match setup">
      <Typography variant="subtitle2">
        {context ? `${context.group_name} · ${context.play_date}` : 'Before the match'}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {context
          ? 'Game-day lineup loaded. You can start playing offline.'
          : 'Load the teams prepared by your administrator, or play without a code.'}
      </Typography>
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Button variant="outlined" size="small" onClick={onLoadLineup}>
          {context ? 'Change game-day code' : 'Use game-day code'}
        </Button>
        <Button size="small" onClick={onPlayIndependently}>
          Play independently
        </Button>
      </Stack>
    </Paper>
  );
};
