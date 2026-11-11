import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { Box, Button, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';
export type AdministrationPageHeaderProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  backLabel?: string;
  onBack?: () => void;
  disabled?: boolean;
};

export const AdministrationPageHeader = ({
  title,
  subtitle,
  action,
  backLabel,
  onBack,
  disabled = false,
}: AdministrationPageHeaderProps) => {
  return (
    <Box component="header">
      {onBack && (
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={onBack}
          disabled={disabled}
          size="small"
          sx={{ mb: 1, px: 0.5 }}
        >
          {backLabel}
        </Button>
      )}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        sx={{
          alignItems: { xs: 'flex-start', sm: 'center' },
          justifyContent: 'space-between',
          gap: 1.5,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography component="h2" variant="h5" sx={{ overflowWrap: 'anywhere' }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {subtitle}
            </Typography>
          )}
        </Box>
        {action && (
          <Box sx={{ flexShrink: 0, alignSelf: { xs: 'flex-end', sm: 'center' } }}>{action}</Box>
        )}
      </Stack>
    </Box>
  );
};
