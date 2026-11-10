import { Box, Button, Typography } from '@mui/material';
import UndoRounded from '@mui/icons-material/UndoRounded';
import EditOutlined from '@mui/icons-material/EditOutlined';
import CheckRounded from '@mui/icons-material/CheckRounded';
import SwapHorizRounded from '@mui/icons-material/SwapHorizRounded';
import { canCloseMatch, teamScore } from '../../../game/match';
import type { MatchAction, MatchState } from '../../../game/types';
import type { MatchView } from '../../molecules/MatchViewTabs';

export interface MatchActionsProps {
  state: MatchState;
  tab: MatchView;
  saved: boolean;
  pendingCount: number;
  onAction: (action: MatchAction) => void;
  onCloseSet: () => void;
  onEdit: () => void;
  onSaveMatch: () => void;
  onSavedMatches: () => void;
}

export const MatchActions = ({
  state,
  tab,
  saved,
  pendingCount,
  onAction,
  onCloseSet,
  onEdit,
  onSaveMatch,
  onSavedMatches,
}: MatchActionsProps) => {
  const last = state.log.at(-1);
  const scoreA = teamScore(state.teams.A);
  const scoreB = teamScore(state.teams.B);
  return (
    <>
      <Box className={`actions${tab === 1 ? ' actions--stats' : ''}`}>
        {tab === 0 ? (
          <>
            <Button
              variant="outlined"
              color="inherit"
              size="small"
              startIcon={<UndoRounded />}
              disabled={!last}
              aria-label={
                last?.type === 'set'
                  ? 'Undo last set'
                  : last?.type === 'roster'
                    ? 'Undo last roster change'
                    : 'Undo last point'
              }
              onClick={() => onAction({ type: 'undo' })}
            >
              Undo
            </Button>
            <Button
              variant="outlined"
              color="inherit"
              size="small"
              startIcon={<CheckRounded />}
              disabled={scoreA + scoreB === 0}
              onClick={onCloseSet}
            >
              Close set
            </Button>
            <Button
              variant="outlined"
              color="inherit"
              size="small"
              startIcon={<EditOutlined />}
              onClick={onEdit}
            >
              Edit names
            </Button>
            <Button
              variant="outlined"
              color="inherit"
              size="small"
              startIcon={<SwapHorizRounded />}
              aria-pressed={state.sidesSwapped}
              onClick={() => onAction({ type: 'switchSides' })}
            >
              Switch sides
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="outlined"
              color="inherit"
              size="small"
              startIcon={<CheckRounded />}
              disabled={!canCloseMatch(state) || !saved}
              onClick={onSaveMatch}
            >
              Save match
            </Button>
            <Button
              color="inherit"
              size="small"
              disabled={pendingCount === 0}
              onClick={onSavedMatches}
            >
              Saved matches ({pendingCount})
            </Button>
          </>
        )}
      </Box>
      {tab === 1 && scoreA + scoreB > 0 && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', textAlign: 'center', px: 2 }}
        >
          Close the current set in Game before saving the match.
        </Typography>
      )}
    </>
  );
};
