import { Typography } from '@mui/material';
import { Suspense } from 'react';
import { useHashRoute } from './hooks/useHashRoute';
import { ScoreboardPage } from './pages/ScoreboardPage';
import type { PublicRoute } from './public/routeTypes';
import { AdministrationPage, PublicResultsPage } from './routes/lazyPages';

const publicRouteKey = (route: PublicRoute) =>
  [
    route.kind,
    'communityId' in route ? route.communityId : '',
    'groupId' in route ? route.groupId : '',
    'matchId' in route ? (route.matchId ?? '') : '',
    'playerId' in route ? route.playerId : '',
    'season' in route ? (route.season ?? '') : '',
    'page' in route ? route.page : '',
    'pageSize' in route ? route.pageSize : '',
  ].join(':');

const App = () => {
  const route = useHashRoute();
  if (route.kind === 'admin')
    return (
      <Suspense fallback={<Typography sx={{ p: 3 }}>Loading administration…</Typography>}>
        <AdministrationPage />
      </Suspense>
    );
  if (route.kind === 'app') return <ScoreboardPage />;
  return (
    <Suspense
      fallback={
        <Typography role="status" sx={{ p: 3 }}>
          Loading public results…
        </Typography>
      }
    >
      <PublicResultsPage key={publicRouteKey(route)} route={route} />
    </Suspense>
  );
};

export default App;
