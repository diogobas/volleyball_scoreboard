import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material';
import DayCodeDialog from './DayCodeDialog';
import MatchSummary from './MatchSummary';

export default function CloseMatchDialog({ state, saving, error, onClose, onConfirm }) {
  const [linking, setLinking] = useState(false);
  const [online, setOnline] = useState(navigator.onLine !== false);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return (
    <Dialog
      open
      onClose={() => {
        if (!saving) onClose();
      }}
      fullWidth
      maxWidth="sm"
      aria-labelledby="close-match-title"
      aria-describedby="close-match-description"
    >
      <DialogTitle id="close-match-title">Save match?</DialogTitle>
      <DialogContent aria-busy={saving}>
        <DialogContentText id="close-match-description" sx={{ mb: 2 }}>
          Review the result. Saving locally works offline. Sync finalizes this match and updates
          results; its local copy is removed only after receipt is confirmed. A new match will start
          with the same players and sides. You cannot undo this closure.
        </DialogContentText>
        {online && !state.dayContext && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Save & sync will ask for a game-day code. You can also save locally and link a code
            later.
          </Alert>
        )}
        <MatchSummary state={state} />
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button disabled={saving} onClick={onClose}>
          Cancel
        </Button>
        <Button variant="contained" disabled={saving} onClick={() => onConfirm(false)}>
          {saving ? 'Saving match…' : 'Save locally'}
        </Button>
        {online && (
          <Button
            variant="contained"
            disabled={saving}
            onClick={() => {
              if (state.dayContext) onConfirm(true);
              else setLinking(true);
            }}
          >
            Save &amp; sync
          </Button>
        )}
      </DialogActions>
      {linking && (
        <DayCodeDialog
          onClose={() => setLinking(false)}
          onConfirm={(context) => {
            setLinking(false);
            onConfirm(true, context);
          }}
        />
      )}
    </Dialog>
  );
}
