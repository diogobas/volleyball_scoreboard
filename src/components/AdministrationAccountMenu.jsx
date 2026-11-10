import { useId, useState } from 'react';
import {
  Avatar,
  Badge,
  Box,
  Button,
  Divider,
  ListItemIcon,
  Menu,
  MenuItem,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import LogoutIcon from '@mui/icons-material/Logout';

export default function AdministrationAccountMenu({ user, busy, onSignOut }) {
  const [anchor, setAnchor] = useState(null);
  const id = useId();
  return (
    <>
      <Button
        id={`${id}-button`}
        aria-label="Account menu — signed in"
        aria-haspopup="menu"
        aria-expanded={Boolean(anchor)}
        aria-controls={anchor ? id : undefined}
        onClick={(event) => setAnchor(event.currentTarget)}
        endIcon={<ExpandMoreIcon />}
        sx={{ flexShrink: 0, gap: 1 }}
      >
        <Badge
          color="success"
          variant="dot"
          overlap="circular"
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        >
          <Avatar
            sx={{
              width: 36,
              height: 36,
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              fontSize: 16,
            }}
          >
            {user.email?.charAt(0).toUpperCase() || 'A'}
          </Avatar>
        </Badge>
        <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
          Signed in
        </Box>
      </Button>
      <Menu
        id={id}
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          list: { 'aria-labelledby': `${id}-button` },
          paper: { sx: { minWidth: 240, maxWidth: 'calc(100vw - 32px)' } },
        }}
      >
        <Box sx={{ px: 2, py: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Signed in as
          </Typography>
          <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
            {user.email}
          </Typography>
        </Box>
        <Divider />
        <MenuItem
          disabled={busy}
          onClick={() => {
            setAnchor(null);
            onSignOut();
          }}
        >
          <ListItemIcon>
            <LogoutIcon fontSize="small" />
          </ListItemIcon>
          Sign out
        </MenuItem>
      </Menu>
    </>
  );
}
