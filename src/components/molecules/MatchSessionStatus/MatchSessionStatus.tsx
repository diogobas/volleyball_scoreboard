import { Alert, Box, Button, Typography } from '@mui/material';

export interface MatchSessionStatusProps {
  error: boolean;
  onRetry: () => void;
}

export const MatchSessionStatus = ({ error, onRetry }: MatchSessionStatusProps) =>
  error ? (
    <Box component="main" className="app">
      <Alert severity="error">
        The saved match could not be loaded. Existing data has been kept. Close other app tabs and
        retry. Do not clear app data.
      </Alert>
      <Button onClick={onRetry}>Retry</Button>
    </Box>
  ) : (
    <Box component="main" className="app" role="status">
      <Typography>Loading saved match…</Typography>
    </Box>
  );
