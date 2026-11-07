import { lazy, Suspense, useEffect, useState } from 'react';
import { Alert, Box, Button, Typography } from '@mui/material';
import App from './App';
import { readRoute } from './public/routes';

const Administration = lazy(() => import('./public/Administration'));
const PublicResults = lazy(() => import('./public/PublicResults').catch(() => ({ default: PublicLoadFailure })));
function PublicLoadFailure() {
  return <Box sx={{ p: 3 }}><Alert severity="warning">Public results could not be loaded. Reconnect and reload this page.</Alert>
    <Button onClick={() => location.reload()}>Reload</Button><Button component="a" href="#/app">Open scoreboard</Button></Box>;
}
export default function Root() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const change = () => { setHash(window.location.hash); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  const route = readRoute(hash, import.meta.env.VITE_DEFAULT_VIEW);
  if (route.kind === 'admin') return <Suspense fallback={<Typography sx={{ p: 3 }}>Loading administration…</Typography>}><Administration /></Suspense>;
  if (route.kind === 'app') return <App />;
  return <Suspense fallback={<Typography role="status" sx={{ p: 3 }}>Loading public results…</Typography>}>
    <PublicResults key={hash} route={route} />
  </Suspense>;
}
