import { useCallback, useEffect, useRef, useState } from 'react';
import { matchReducer } from '../game/match';
import { applyDayLineup, startIndependentMatch } from '../game/gameDay';
import { closeStoredMatch, createLocalId, saveStoredMatch } from '../game/storage';
import { errorMessage } from '../game/errors';
import type {
  CloseMatchOptions,
  DayContext,
  MatchAction,
  MatchState,
  Team,
  TeamMap,
} from '../game/types';

export interface MatchControllerServices {
  save: (database: IDBDatabase, state: MatchState) => Promise<MatchState>;
  close: (
    database: IDBDatabase,
    state: MatchState,
    options: CloseMatchOptions,
  ) => Promise<MatchState>;
  createId: () => string;
}

const services: MatchControllerServices = {
  save: saveStoredMatch,
  close: closeStoredMatch,
  createId: createLocalId,
};
const savingFailed = 'Local saving failed. Keep the app open and retry saving before leaving.';

export const useMatchController = (
  database: IDBDatabase,
  initialState: MatchState,
  dependencies: MatchControllerServices = services,
) => {
  const [state, setState] = useState(initialState);
  const [savedState, setSavedState] = useState(initialState);
  const [setupDismissed, setSetupDismissed] = useState(Boolean(initialState.dayContext));
  const [closingMatch, setClosingMatch] = useState(false);
  const [closeError, setCloseError] = useState('');
  const [closeSuccess, setCloseSuccess] = useState(false);
  const [storageWarning, setStorageWarning] = useState('');
  const closing = useRef(false);
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  const acceptSavedState = useCallback((snapshot: MatchState, current: MatchState) => {
    if (!active.current) return;
    if (JSON.stringify(current) !== JSON.stringify(snapshot))
      setState((previous) => (previous === snapshot ? current : previous));
    setSavedState(current);
    setStorageWarning('');
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Keep transaction creation in effect order, as in the original App.
    void dependencies
      .save(database, state)
      .then((current) => {
        if (!cancelled) acceptSavedState(state, current);
      })
      .catch(() => {
        if (!cancelled) setStorageWarning(savingFailed);
      });
    return () => {
      cancelled = true;
    };
  }, [database, state, dependencies, acceptSavedState]);

  const dispatch = useCallback((action: MatchAction) => {
    if (closing.current) return;
    const timedAction =
      action.type === 'point' ? { ...action, startedAt: new Date().toISOString() } : action;
    if (action.type === 'reset') setSetupDismissed(false);
    setState((previous) => matchReducer(previous, timedAction));
  }, []);

  const retrySave = useCallback(() => {
    if (closing.current) return;
    void dependencies
      .save(database, state)
      .then((current) => acceptSavedState(state, current))
      .catch(() => {
        if (active.current) setStorageWarning(savingFailed);
      });
  }, [database, state, dependencies, acceptSavedState]);

  const finishMatch = async (dayContext: DayContext | null = null) => {
    if (closing.current) return;
    closing.current = true;
    setClosingMatch(true);
    setCloseError('');
    try {
      const id = dependencies.createId();
      const nextState = await dependencies.close(database, state, { id, dayContext });
      if (active.current) {
        setState(nextState);
        setSavedState(nextState);
        setSetupDismissed(Boolean(nextState.dayContext));
        setStorageWarning('');
        setCloseSuccess(true);
      }
      return { id, state: nextState };
    } catch (error) {
      if (active.current)
        setCloseError(
          `The match could not be closed. Your current match has been kept. ${errorMessage(error)} You can retry.`,
        );
      return undefined;
    } finally {
      closing.current = false;
      if (active.current) setClosingMatch(false);
    }
  };

  const loadLineup = async (context: DayContext) => {
    const next = applyDayLineup(state, context);
    const persisted = await dependencies.save(database, next);
    if (!active.current) return;
    setSetupDismissed(true);
    setState(persisted);
    setSavedState(persisted);
    setStorageWarning('');
  };

  const playIndependently = () => {
    setState(startIndependentMatch(state));
    setSetupDismissed(true);
  };

  const editTeams = (teams: TeamMap<Team>, context: DayContext | undefined, imported: boolean) => {
    setState((previous) =>
      matchReducer(imported && context ? applyDayLineup(previous, context) : previous, {
        type: 'edit',
        teams,
      }),
    );
    if (imported) setSetupDismissed(true);
  };

  const clearCloseFeedback = () => {
    setCloseError('');
    setCloseSuccess(false);
  };
  const dismissCloseSuccess = () => setCloseSuccess(false);

  return {
    state,
    saved: savedState === state,
    setupDismissed,
    closingMatch,
    closeError,
    closeSuccess,
    storageWarning,
    dispatch,
    retrySave,
    finishMatch,
    loadLineup,
    playIndependently,
    editTeams,
    clearCloseFeedback,
    dismissCloseSuccess,
  };
};
