import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material';
import { useState } from 'react';
import { teamScore } from '../../../game/match';
import type { MatchState, TeamId } from '../../../game/types';

export type MatchConfirmation = 'closeSet' | 'reset';
export interface MatchConfirmationDialogProps {
  state: MatchState;
  teamOrder: TeamId[];
  confirmation: MatchConfirmation | null;
  onCancel: () => void;
  onConfirm: (type: MatchConfirmation) => void;
}

export const MatchConfirmationDialog = ({
  state,
  teamOrder,
  confirmation,
  onCancel,
  onConfirm,
}: MatchConfirmationDialogProps) => {
  const [display, setDisplay] = useState({
    confirmation: confirmation ?? 'closeSet',
    state,
    teamOrder,
  });
  // Keep the last open content while MUI animates the dialog out. Update during
  // render so a newly opened confirmation displays the right content immediately.
  if (
    confirmation !== null &&
    (display.confirmation !== confirmation ||
      display.state !== state ||
      display.teamOrder !== teamOrder)
  ) {
    setDisplay({ confirmation, state, teamOrder });
  }
  const closing = display.confirmation === 'closeSet';
  const [leftTeam, rightTeam] = display.teamOrder.map((id) => display.state.teams[id]);
  const scoreA = teamScore(display.state.teams.A);
  const scoreB = teamScore(display.state.teams.B);
  return (
    <Dialog
      open={confirmation === 'closeSet' || confirmation === 'reset'}
      onClose={onCancel}
      aria-labelledby="confirm-title"
      aria-describedby="confirm-message"
    >
      <DialogTitle id="confirm-title">
        {closing ? `Close set ${display.state.currentSet}?` : 'Reset match?'}
      </DialogTitle>
      <DialogContent>
        <DialogContentText id="confirm-message">
          {closing
            ? `Final score: ${leftTeam.name} ${teamScore(leftTeam)} × ${teamScore(rightTeam)} ${rightTeam.name}. Set scores will reset; match statistics will be kept.${scoreA === scoreB ? ' The score is tied, so neither team will be awarded a set.' : ''}`
            : 'All points, sets, and statistics will be cleared. Names will be kept. This cannot be undone.'}
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button
          variant="contained"
          onClick={() => {
            if (confirmation) onConfirm(confirmation);
          }}
        >
          {closing ? 'Close set' : 'Reset'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
