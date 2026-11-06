import React from 'react';
import { createRoot } from 'react-dom/client';
import { CssBaseline, ThemeProvider } from '@mui/material';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource/barlow-condensed/latin-900.css';
import theme from './theme';
import Root from './Root';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode><ThemeProvider theme={theme}><CssBaseline /><Root /></ThemeProvider></React.StrictMode>,
);
