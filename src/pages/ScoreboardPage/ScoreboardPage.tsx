import { Box } from '@mui/material';
import type { SyntheticEvent } from 'react';
import { useRef, useState } from 'react';
import type { MatchConfirmation } from '../../components/molecules/MatchConfirmationDialog';
import { MatchConfirmationDialog } from '../../components/molecules/MatchConfirmationDialog';
import { MatchFooter } from '../../components/molecules/MatchFooter';
import { MatchNotices } from '../../components/molecules/MatchNotices';
import { MatchSessionStatus } from '../../components/molecules/MatchSessionStatus';
import { MatchSetup } from '../../components/molecules/MatchSetup';
import type { MatchView } from '../../components/molecules/MatchViewTabs';
import { MatchViewTabs } from '../../components/molecules/MatchViewTabs';
import { CloseMatchDialog } from '../../components/organisms/CloseMatchDialog';
import { DayCodeDialog } from '../../components/organisms/DayCodeDialog';
import { EditTeamsDialog } from '../../components/organisms/EditTeamsDialog';
import { MatchActions } from '../../components/organisms/MatchActions';
import { MatchHistory } from '../../components/organisms/MatchHistory';
import { SavedMatchesDialog } from '../../components/organisms/SavedMatchesDialog';
import { ScoreboardCourt } from '../../components/organisms/ScoreboardCourt';
import { errorMessage } from '../../game/errors';
import { TEAM_IDS } from '../../game/match';
import type { DayContext, MatchState, TeamId } from '../../game/types';
import { useMatchController } from '../../hooks/useMatchController';
import { useMatchSession } from '../../hooks/useMatchSession';
import { useSavedMatches } from '../../hooks/useSavedMatches';

interface ScoreboardContentProps {
  database: IDBDatabase;
  initialState: MatchState;
}

const ScoreboardContent = ({ database, initialState }: ScoreboardContentProps) => {
  const match = useMatchController(database, initialState);
  const savedMatches = useSavedMatches(database);
  const courtRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<MatchView>(0);
  const [lineupOpen, setLineupOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<MatchConfirmation | 'closeMatch' | null>(null);
  const { state } = match;
  const teamOrder: TeamId[] = state.sidesSwapped ? ['B', 'A'] : TEAM_IDS;
  const matchStarted = state.log.some((entry) => entry.type === 'point');

  const scrollToCourt = () => {
    requestAnimationFrame(() => courtRef.current?.scrollIntoView({ block: 'start' }));
  };

  const changeTab = (_event: SyntheticEvent, value: MatchView) => {
    setTab(value);
    scrollToCourt();
  };

  const playIndependently = () => {
    try {
      match.playIndependently();
      savedMatches.setSyncNotice('');
      scrollToCourt();
    } catch (error) {
      savedMatches.setSyncNotice(errorMessage(error));
    }
  };

  const loadLineup = async (context: DayContext) => {
    await match.loadLineup(context);
    savedMatches.setSyncNotice('');
    setLineupOpen(false);
    scrollToCourt();
  };

  const finishMatch = async (sync = false, context: DayContext | null = null) => {
    const closed = await match.finishMatch(context);
    if (!closed) return;
    setConfirmation(null);
    setTab(0);
    void savedMatches.refreshPending();
    if (sync) {
      const receipt = await savedMatches.sendClosedMatch(closed.id);
      if (receipt) match.dismissCloseSuccess();
    }
  };

  return (
    <Box component="main" className="app" aria-label="Volleyball Scoreboard">
      <MatchNotices
        closeSuccess={match.closeSuccess}
        syncNotice={savedMatches.syncNotice}
        storageWarning={match.storageWarning}
        retrySave={match.retrySave}
        onDismissCloseSuccess={match.dismissCloseSuccess}
        onDismissSyncNotice={() => savedMatches.setSyncNotice('')}
      />
      {tab === 0 && !matchStarted && !match.setupDismissed && (
        <MatchSetup
          context={state.dayContext}
          onLoadLineup={() => setLineupOpen(true)}
          onPlayIndependently={playIndependently}
        />
      )}
      <ScoreboardCourt
        state={state}
        teamOrder={teamOrder}
        tab={tab}
        courtRef={courtRef}
        onAction={match.dispatch}
      />
      <MatchActions
        state={state}
        tab={tab}
        saved={match.saved}
        pendingCount={savedMatches.pendingCount}
        onAction={match.dispatch}
        onCloseSet={() => setConfirmation('closeSet')}
        onEdit={() => setEditing(true)}
        onSaveMatch={() => {
          match.clearCloseFeedback();
          setConfirmation('closeMatch');
        }}
        onSavedMatches={() => setPendingOpen(true)}
      />
      <MatchViewTabs tab={tab} onChange={changeTab} />
      {tab === 0 && <MatchHistory log={state.log} />}
      <MatchFooter
        saved={match.saved}
        storageWarning={match.storageWarning}
        onReset={() => setConfirmation('reset')}
      />
      {lineupOpen && (
        <DayCodeDialog
          confirmLabel="Load lineup"
          onClose={() => setLineupOpen(false)}
          onConfirm={loadLineup}
        />
      )}
      {pendingOpen && (
        <SavedMatchesDialog
          database={database}
          onChanged={savedMatches.refreshPending}
          onClose={() => setPendingOpen(false)}
        />
      )}
      {editing && (
        <EditTeamsDialog
          state={state}
          teamOrder={teamOrder}
          onClose={() => setEditing(false)}
          onSave={(teams, context, imported) => {
            match.editTeams(teams, context, imported);
            if (imported) scrollToCourt();
            setEditing(false);
          }}
        />
      )}
      {confirmation === 'closeMatch' && (
        <CloseMatchDialog
          state={state}
          saving={match.closingMatch}
          error={match.closeError}
          onClose={() => setConfirmation(null)}
          onConfirm={finishMatch}
        />
      )}
      <MatchConfirmationDialog
        state={state}
        teamOrder={teamOrder}
        confirmation={confirmation === 'closeMatch' ? null : confirmation}
        onCancel={() => setConfirmation(null)}
        onConfirm={(type) => {
          match.dispatch({ type });
          setConfirmation(null);
        }}
      />
    </Box>
  );
};

export const ScoreboardPage = () => {
  const { session, error, retry } = useMatchSession();
  if (error || !session) return <MatchSessionStatus error={error} onRetry={retry} />;
  return <ScoreboardContent database={session.database} initialState={session.state} />;
};
