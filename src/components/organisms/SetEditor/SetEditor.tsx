import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Divider,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import type { TeamId } from '../../../game/types';
import {
  addPoint,
  editPoint,
  mergeSets,
  moveBoundary,
  removeEmptySet,
  removePoint,
  replaceParticipant,
  splitSet,
} from '../../../public/corrections';
import type * as Models from '../../../remote/models';
export type SetEditorProps = {
  set: Models.SubmittedSet;
  index: number;
  payload: Models.MatchSubmission;
  players: Models.RegisteredPlayer[];
  change: (action: (payload: Models.MatchSubmission) => Models.MatchSubmission) => void;
};

export const SetEditor = ({ set, index, payload, players, change }: SetEditorProps) => {
  const [boundary, setBoundary] = useState(String(Math.max(1, Math.floor(set.points.length / 2))));
  const count = Number(boundary);
  const next = payload.sets[index + 1];
  return (
    <Accordion defaultExpanded={index === 0} disableGutters sx={{ mb: 1 }}>
      <AccordionSummary expandIcon={<ExpandMoreRounded />}>
        <Typography>
          Set {index + 1} · {set.score_a} × {set.score_b}
        </Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'minmax(0,1fr)', sm: 'repeat(2,minmax(0,1fr))' },
            gap: 2,
            mb: 3,
          }}
        >
          {(['A', 'B'] as const).map((team) => (
            <Stack key={team} spacing={1}>
              <Typography variant="subtitle2">
                {team === 'A' ? set.team_a_name : set.team_b_name}
              </Typography>
              {set.rosters[team].map((person, position) => (
                <TextField
                  key={position}
                  select
                  fullWidth
                  label={`Set ${index + 1} · Team ${team} · Player ${position + 1}`}
                  value={person.id}
                  helperText={`Recorded: ${person.name}`}
                  slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
                  onChange={(event) => {
                    const person = players.find((person) => person.id === event.target.value);
                    if (person)
                      change((payload) =>
                        replaceParticipant(payload, index, team, position, person),
                      );
                  }}
                >
                  {players.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </TextField>
              ))}
            </Stack>
          ))}
        </Box>
        <Typography component="h3" variant="subtitle1">
          Points · Set {index + 1}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          A: {set.team_a_name} · B: {set.team_b_name}
        </Typography>
        <Box sx={{ maxHeight: 420, overflowY: 'auto', mb: 2, pr: 0.5 }}>
          {set.points.map((point, pointIndex) => (
            <Box key={pointIndex} sx={{ pt: 1.5, pb: 2 }}>
              <Typography variant="caption" sx={{ display: 'block', mb: 1.5 }}>
                Point {pointIndex + 1}
              </Typography>
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                <TextField
                  select
                  size="small"
                  label="Team"
                  value={point.team}
                  sx={{ width: 90, flexShrink: 0 }}
                  slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
                  onChange={(event) =>
                    change((payload) =>
                      editPoint(payload, index, pointIndex, { team: event.target.value as TeamId }),
                    )
                  }
                >
                  <option value="A">A</option>
                  <option value="B">B</option>
                </TextField>
                <TextField
                  select
                  size="small"
                  fullWidth
                  label="Scorer"
                  value={point.is_opponent_error ? 'err' : (point.player_id ?? '')}
                  sx={{ minWidth: 0 }}
                  slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
                  onChange={(event) =>
                    change((payload) =>
                      editPoint(payload, index, pointIndex, { scorer: event.target.value }),
                    )
                  }
                >
                  <option value="">Select scorer</option>
                  <option value="err">Opponent’s error</option>
                  {set.rosters[point.team].map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </TextField>
                <IconButton
                  aria-label={`Remove point ${pointIndex + 1} from set ${index + 1}`}
                  onClick={() => change((payload) => removePoint(payload, index, pointIndex))}
                >
                  <DeleteOutlineRounded />
                </IconButton>
              </Stack>
            </Box>
          ))}
        </Box>
        <Button onClick={() => change((payload) => addPoint(payload, index))}>
          Add point to set {index + 1}
        </Button>
        <Divider sx={{ my: 2 }} />
        <Typography component="h3" variant="subtitle1">
          Set boundary
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Point order is preserved. After moving a boundary, review both lineups and point authors.
        </Typography>
        <TextField
          type="number"
          size="small"
          label={`Boundary after point · Set ${index + 1}`}
          value={boundary}
          onChange={(event) => setBoundary(event.target.value)}
          slotProps={{ htmlInput: { min: 1, step: 1 } }}
          fullWidth
        />
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1 }}>
          <Button
            disabled={!Number.isInteger(count) || count < 1 || count >= set.points.length}
            onClick={() => change((payload) => splitSet(payload, index, count))}
          >
            Split set {index + 1}
          </Button>
          {next && (
            <>
              <Button
                disabled={
                  count === set.points.length ||
                  !Number.isInteger(count) ||
                  count < 1 ||
                  count >= set.points.length + next.points.length
                }
                onClick={() => change((payload) => moveBoundary(payload, index, count))}
              >
                Move boundary after set {index + 1}
              </Button>
              <Button onClick={() => change((payload) => mergeSets(payload, index))}>
                Merge set {index + 1} with next
              </Button>
            </>
          )}
          {!set.points.length && payload.sets.length > 1 && (
            <Button onClick={() => change((payload) => removeEmptySet(payload, index))}>
              Remove empty set {index + 1}
            </Button>
          )}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
};
