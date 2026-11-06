import { Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material';
import MatchSummary from './MatchSummary';

export default function CloseMatchDialog({ state, saving, error, onClose, onConfirm }) {
  return <Dialog open onClose={() => { if (!saving) onClose(); }} fullWidth maxWidth="sm"
    aria-labelledby="close-match-title" aria-describedby="close-match-description">
    <DialogTitle id="close-match-title">Close match?</DialogTitle>
    <DialogContent aria-busy={saving}>
      <DialogContentText id="close-match-description" sx={{ mb: 2 }}>
        Review the result before closing. This match will be saved on this device, awaiting upload.
        A new match will start with the same players and sides. You cannot undo this closure.
      </DialogContentText>
      <MatchSummary state={state} />
      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
    </DialogContent>
    <DialogActions>
      <Button disabled={saving} onClick={onClose}>Cancel</Button>
      <Button variant="contained" disabled={saving} onClick={onConfirm}>{saving ? 'Saving match…' : 'Save and start new match'}</Button>
    </DialogActions>
  </Dialog>;
}
