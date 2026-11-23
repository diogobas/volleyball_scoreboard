import { createTheme } from '@mui/material/styles';

export const teamColors = { A: '#1b5fa6', B: '#c0392b' };
export default createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#82b9f1' },
    background: { default: '#0e1220', paper: '#1b2338' },
  },
  typography: {
    fontFamily: 'Inter, system-ui, sans-serif',
    h1: { fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 700 },
    h5: { fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 700 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  shape: { borderRadius: 12 },
  components: {
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiDialog: { defaultProps: { fullWidth: true, maxWidth: 'sm' } },
  },
});
