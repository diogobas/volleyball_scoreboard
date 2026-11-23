import { Alert, Button } from '@mui/material';

export interface MatchNoticesProps {
  closeSuccess: boolean;
  syncNotice: string;
  storageWarning: string;
  retrySave: () => void;
  onDismissCloseSuccess: () => void;
  onDismissSyncNotice: () => void;
}

export const MatchNotices = ({
  closeSuccess,
  syncNotice,
  storageWarning,
  retrySave,
  onDismissCloseSuccess,
  onDismissSyncNotice,
}: MatchNoticesProps) => {
  return (
    <>
      {closeSuccess && (
        <Alert severity="success" onClose={onDismissCloseSuccess} sx={{ mx: 2, mb: 2 }}>
          Match saved on this device, awaiting upload. A new match has started.
        </Alert>
      )}
      {syncNotice && (
        <Alert severity="info" onClose={onDismissSyncNotice} sx={{ mx: 2, mb: 2 }}>
          {syncNotice}
        </Alert>
      )}
      {storageWarning && (
        <Alert
          severity="warning"
          action={
            <Button color="inherit" size="small" onClick={retrySave}>
              Retry saving
            </Button>
          }
          sx={{ mx: 2, mb: 2 }}
        >
          {storageWarning}
        </Alert>
      )}
    </>
  );
};
