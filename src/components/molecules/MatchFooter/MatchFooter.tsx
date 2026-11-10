import { Box, Button, Typography } from '@mui/material';
import RestartAltRounded from '@mui/icons-material/RestartAltRounded';
import { PrivacyLink } from '../../atoms/PrivacyLink';

export interface MatchFooterProps {
  saved: boolean;
  storageWarning: string;
  onReset: () => void;
}

export const MatchFooter = ({ saved, storageWarning, onReset }: MatchFooterProps) => {
  return (
    <>
      <Box component="footer" className="footer">
        <Button color="inherit" size="small" startIcon={<RestartAltRounded />} onClick={onReset}>
          Reset match
        </Button>
        <Typography variant="caption" color="text.secondary">
          {saved ? 'Saved on this device' : storageWarning ? 'Local saving unavailable' : 'Saving…'}
        </Typography>
      </Box>
      <Box sx={{ textAlign: 'center', pb: 2 }}>
        <PrivacyLink />
      </Box>
    </>
  );
};
