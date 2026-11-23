import { Alert, Box, Button } from '@mui/material';

export const PublicLoadFailure = () => (
  <Box sx={{ p: 3 }}>
    <Alert severity="warning">
      Public results could not be loaded. Reconnect and reload this page.
    </Alert>
    <Button onClick={() => location.reload()}>Reload</Button>
    {import.meta.env.VITE_DEFAULT_VIEW !== 'public' && (
      <Button component="a" href="#/app">
        Open scoreboard
      </Button>
    )}
  </Box>
);
