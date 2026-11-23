import { Alert, Button, Chip, Stack, Typography } from '@mui/material';
import { matchResult } from '../../../game/matchResult';
import { playedTime, resultText } from '../../../public/matchPresentation';
import { publicMatchStatistics } from '../../../public/matchStatistics';
import type * as Models from '../../../remote/models';
import type { AsyncAction } from '../../types';
import { StatisticsView } from '../StatisticsView';
export type MatchDetailsProps = {
  data: Models.PublicMatch;
  loading: boolean;
  refresh: AsyncAction;
};
export const MatchDetails = ({ data, loading, refresh }: MatchDetailsProps) => {
  const statistics = publicMatchStatistics(data);
  const result = matchResult(data.sets, {
    endedAsDraw: data.ended_as_draw,
    interruptedSet: data.draw_interrupted_set,
    rules: data.rules,
  });
  return (
    <>
      <Typography component="h1" variant="h4" sx={{ overflowWrap: 'anywhere' }}>
        {data.team_a_name} {result.setsA} × {result.setsB} {data.team_b_name}
      </Typography>
      <Stack direction="row" sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1, mt: 2, mb: 2 }}>
        <Chip label={resultText(data)} />
        <Button disabled={loading} onClick={refresh}>
          Refresh match
        </Button>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {playedTime(data, data.group.time_zone)}
        {!data.started_at && !data.played_on && ' · Closing date (start time unavailable)'}
      </Typography>
      {data.entry_mode === 'summary' && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {data.player_totals_recorded === false
            ? 'Historical match · set scores only. Player totals were not recorded.'
            : 'Historical match · individual points are totals for the whole match, including training sets.'}
        </Alert>
      )}
      {data.decided_at && data.sets.length > data.decided_at && (
        <Typography sx={{ mb: 2 }}>
          Match decided in set {data.decided_at}. The following {data.sets.length - data.decided_at}{' '}
          sets count only toward statistics.
        </Typography>
      )}
      <StatisticsView {...statistics} />
      <Typography variant="caption" color="text.secondary">
        {data.player_totals_recorded === false
          ? 'This match is included in group scores, but not individual points, attendance or wins.'
          : data.entry_mode === 'summary'
            ? 'Names and player points are whole-match totals. Individual rankings exclude opponent errors.'
            : 'Names and lineups are those recorded for each set. Player points exclude opponent errors.'}
      </Typography>
    </>
  );
};
