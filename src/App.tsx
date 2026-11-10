import { useMatchSession } from './hooks/useMatchSession';
import { MatchSessionStatus } from './components/molecules/MatchSessionStatus';
import { ScoreboardPage } from './pages/ScoreboardPage';

const App = () => {
  const { session, error, retry } = useMatchSession();
  if (error || !session) return <MatchSessionStatus error={error} onRetry={retry} />;
  return <ScoreboardPage database={session.database} initialState={session.state} />;
};

export default App;
