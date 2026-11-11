import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Stack,
  Typography,
} from '@mui/material';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { errorMessage } from '../../../game/errors';
import { matchRevisionHistory } from '../../../remote/matchAdministration';
import type * as Models from '../../../remote/models';
import { SnapshotComparison } from '../SnapshotComparison';
export type RevisionHistoryProps = { client: SupabaseClient; groupId: string; matchId: string };

export const RevisionHistory = ({ client, groupId, matchId }: RevisionHistoryProps) => {
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<Models.RevisionHistory | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setData(null);
    setError('');
    matchRevisionHistory(groupId, matchId, page, client)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((failure) => {
        if (active) setError(errorMessage(failure) || 'Private history could not be loaded.');
      });
    return () => {
      active = false;
    };
  }, [client, groupId, matchId, page, attempt]);
  return (
    <Stack spacing={2}>
      <Typography component="h2" variant="h5">
        Private revision history
      </Typography>
      {error && (
        <Alert
          severity="warning"
          action={<Button onClick={() => setAttempt((value) => value + 1)}>Retry history</Button>}
        >
          {error}
        </Alert>
      )}
      {!data && !error && <Typography role="status">Loading private history…</Typography>}
      {data?.total === 0 && <Typography>No corrections recorded.</Typography>}
      {data?.revisions.map((revision) => (
        <Box
          key={revision.id}
          sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}
        >
          <Typography variant="subtitle1">Version {revision.version}</Typography>
          <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
            {revision.author_email ?? revision.author_id} ·{' '}
            {new Date(revision.created_at).toLocaleString()}
          </Typography>
          <Typography sx={{ my: 1, overflowWrap: 'anywhere' }}>{revision.reason}</Typography>
          <Accordion disableGutters slotProps={{ transition: { unmountOnExit: true } }}>
            <AccordionSummary expandIcon={<ExpandMoreRounded />}>
              <Typography>Before and after · Version {revision.version}</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <SnapshotComparison
                before={revision.previous_snapshot}
                after={revision.new_snapshot}
              />
            </AccordionDetails>
          </Accordion>
        </Box>
      ))}
      {data && data.total > 20 && (
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
            Previous revisions
          </Button>
          <Typography variant="body2">
            Page {page} of {Math.ceil(data.total / 20)}
          </Typography>
          <Button disabled={page * 20 >= data.total} onClick={() => setPage((value) => value + 1)}>
            Next revisions
          </Button>
        </Stack>
      )}
    </Stack>
  );
};
