import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Paper, Stack, Tab, Tabs, Typography } from '@mui/material';
import UndoRounded from '@mui/icons-material/UndoRounded';
import EditOutlined from '@mui/icons-material/EditOutlined';
import RestartAltRounded from '@mui/icons-material/RestartAltRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import SwapHorizRounded from '@mui/icons-material/SwapHorizRounded';
import { canCloseMatch, enableCourtMode, matchReducer, TEAM_IDS, teamScore } from './game/match';
import { closeStoredMatch, createLocalId, listStoredMatches, loadStoredMatch, openMatchDatabase, saveStoredMatch } from './game/storage';
import { Roster, ScorePanel } from './components/TeamPanel';
import EditTeamsDialog from './components/EditTeamsDialog';
import Statistics from './components/Statistics';
import DayCodeDialog from './components/DayCodeDialog';
import CloseMatchDialog from './components/CloseMatchDialog';
import { applyDayLineup, startIndependentMatch } from './game/gameDay';
import SavedMatchesDialog from './components/SavedMatchesDialog';
import { closeDayDatabaseWhenUploadsFinish, uploadReceivedMatch } from './remote/gameDays';

export default function App() {
  const [session, setSession] = useState(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let database;
    async function initialize() {
      try {
        database = await openMatchDatabase();
        const state = enableCourtMode(await loadStoredMatch(database));
        if (cancelled) { database.close(); return; }
        setSession({ database, state });
        // Best effort: unsupported/denied persistent storage must not prevent play.
        try { globalThis.navigator?.storage?.persist?.()?.catch(() => {}); } catch { /* optional API */ }
      } catch {
        database?.close();
        if (!cancelled) setError(true);
      }
    }
    initialize();
    return () => { cancelled = true; if (database) void closeDayDatabaseWhenUploadsFinish(database); };
  }, [attempt]);

  if (error) return <Box component="main" className="app">
    <Alert severity="error">The saved match could not be loaded. Existing data has been kept. Close other app tabs and retry. Do not clear app data.</Alert>
    <Button onClick={() => { setError(false); setAttempt(value => value + 1); }}>Retry</Button>
  </Box>;
  if (!session) return <Box component="main" className="app" role="status"><Typography>Loading saved match…</Typography></Box>;
  return <MatchApp database={session.database} initialState={session.state} />;
}

function MatchApp({ database, initialState }) {
  const courtRef = useRef(null);
  const [state, setState] = useState(initialState);
  const closingRef = useRef(false);
  const [closingMatch, setClosingMatch] = useState(false);
  const [closeError, setCloseError] = useState('');
  const [closeSuccess, setCloseSuccess] = useState(false);
  const [storageWarning, setStorageWarning] = useState('');
  const [tab, setTab] = useState(0);
  const [setupDismissed, setSetupDismissed] = useState(Boolean(initialState.dayContext));
  const [lineupOpen, setLineupOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncNotice, setSyncNotice] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [savedState, setSavedState] = useState(initialState);
  const saved = savedState === state;
  const scoreA = teamScore(state.teams.A);
  const scoreB = teamScore(state.teams.B);
  const teamOrder = state.sidesSwapped ? ['B', 'A'] : TEAM_IDS;
  const [leftTeam, rightTeam] = teamOrder.map(id => state.teams[id]);

  function dispatch(action) {
    const timedAction = action.type === 'point' ? { ...action, startedAt: new Date().toISOString() } : action;
    if (!closingRef.current) {
      if (action.type === 'reset') setSetupDismissed(false);
      setState(previous => matchReducer(previous, timedAction));
    }
  }

  async function refreshPending() {
    try { setPendingCount((await listStoredMatches(database)).length); }
    catch { setSyncNotice('Saved matches could not be loaded. Existing data has been kept.'); }
  }
  useEffect(() => { void refreshPending(); }, [database]);

  async function sendClosedMatch(id) {
    try {
      setSyncNotice('Sending for administrator review. Local copy is kept until receipt is confirmed.');
      await uploadReceivedMatch(database, id);
      setCloseSuccess(false);
      setSyncNotice('Received for administrator review. Local copy removed.');
    } catch (error) {
      setSyncNotice(`Sync was not confirmed. Your match is kept on this device. ${error.message || ''} Open Saved matches to retry.`);
    } finally { void refreshPending(); }
  }

  async function finishMatch(sync = false, dayContext = null) {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosingMatch(true);
    setCloseError('');
    try {
      const id = createLocalId();
      const nextState = await closeStoredMatch(database, state, { id, dayContext });
      setSetupDismissed(Boolean(nextState.dayContext));
      setState(nextState);
      setSavedState(nextState);
      setStorageWarning('');
      setConfirmation(null);
      setTab(0);
      setCloseSuccess(true);
      void refreshPending();
      if (sync) void sendClosedMatch(id);
    } catch (error) {
      setCloseError(`The match could not be closed. Your current match has been kept. ${error.message} You can retry.`);
    } finally {
      closingRef.current = false;
      setClosingMatch(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    // IndexedDB serializes these read/write transactions in creation order.
    saveStoredMatch(database, state).then(current => {
      if (!cancelled) {
        if (JSON.stringify(current) !== JSON.stringify(state)) setState(previous => previous === state ? current : previous);
        setSavedState(current); setStorageWarning('');
      }
    }).catch(() => {
      if (!cancelled) setStorageWarning('Local saving failed. Keep the app open and retry saving before leaving.');
    });
    return () => { cancelled = true; };
  }, [database, state]);

  function retrySave() {
    if (closingRef.current) return;
    saveStoredMatch(database, state).then(current => {
      if (JSON.stringify(current) !== JSON.stringify(state)) setState(previous => previous === state ? current : previous);
      setSavedState(current);
      setStorageWarning('');
    }).catch(() => setStorageWarning('Local saving failed. Keep the app open and retry saving before leaving.'));
  }

  function changeTab(_, value) {
    setTab(value);
    // Wait for the selected panel to render before bringing it into view.
    requestAnimationFrame(() => courtRef.current?.scrollIntoView({ block: 'start' }));
  }

  const matchStarted = state.log.some(entry => entry.type === 'point');
  const last = state.log.at(-1);
  const closing = confirmation === 'closeSet';
  return <Box component="main" className="app" aria-label="Volleyball Scoreboard">
    {closeSuccess && <Alert severity="success" onClose={() => setCloseSuccess(false)} sx={{ mx: 2, mb: 2 }}>Match saved on this device, awaiting upload. A new match has started.</Alert>}
    {syncNotice && <Alert severity="info" onClose={() => setSyncNotice('')} sx={{ mx: 2, mb: 2 }}>{syncNotice}</Alert>}
    {storageWarning && <Alert severity="warning" action={<Button color="inherit" size="small" onClick={retrySave}>Retry saving</Button>} sx={{ mx: 2, mb: 2 }}>{storageWarning}</Alert>}
    {tab === 0 && !matchStarted && !setupDismissed && <Paper variant="outlined" sx={{ mx: 1.5, mb: 1.5, p: 1.5 }} aria-label="Match setup">
      <Typography variant="subtitle2">{state.dayContext ? `${state.dayContext.group_name} · ${state.dayContext.play_date}` : 'Before the match'}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {state.dayContext ? 'Game-day lineup loaded. You can start playing offline.' : 'Load the teams prepared by your administrator, or play without a code.'}
      </Typography>
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Button variant="outlined" size="small" onClick={() => setLineupOpen(true)}>{state.dayContext ? 'Change game-day code' : 'Use game-day code'}</Button>
        <Button size="small" onClick={() => {
          try { setState(startIndependentMatch(state)); setSetupDismissed(true); setSyncNotice(''); requestAnimationFrame(() => courtRef.current?.scrollIntoView({ block: 'start' })); }
          catch (error) { setSyncNotice(error.message); }
        }}>Play independently</Button>
      </Stack>
    </Paper>}
    <Box ref={courtRef} className={`court${tab !== 0 ? ' court--stats' : ''}`}>
      {tab === 0 && <Box className="scoreboard">
        <Stack className="set-bar" direction="row" sx={{ alignItems: 'center', justifyContent: 'center', gap: 2 }}>
          <Typography className="sets-won" variant="body2" aria-label={`Sets won by ${leftTeam.name}`}>{leftTeam.setsWon}</Typography>
          <Chip size="small" variant="outlined" label={`Set ${state.currentSet}`} />
          <Typography className="sets-won" variant="body2" aria-label={`Sets won by ${rightTeam.name}`}>{rightTeam.setsWon}</Typography>
        </Stack>
        <Box className="score-panels">{teamOrder.map(id => <ScorePanel key={id} id={id} team={state.teams[id]} />)}</Box>
      </Box>}
      <Box className="game-panel" role="tabpanel" id="game-panel" aria-labelledby="game-tab" hidden={tab !== 0}>
        {tab === 0 && <Box className="rosters">{teamOrder.map(id => <Roster key={id} id={id} team={state.teams[id]}
            onPoint={(team, playerId) => dispatch({ type: 'point', team, playerId })} />)}</Box>}
      </Box>
      <Box className="stats-panel" role="tabpanel" id="stats-panel" aria-labelledby="stats-tab" hidden={tab !== 1}>
        {tab === 1 && <Statistics state={state} teamOrder={teamOrder} />}
      </Box>
    </Box>
    <Box className="actions">
      <Button variant="outlined" color="inherit" size="small" startIcon={<UndoRounded />} disabled={!last}
        aria-label={last?.type === 'set' ? 'Undo last set' : last?.type === 'roster' ? 'Undo last roster change' : 'Undo last point'} onClick={() => dispatch({ type: 'undo' })}>
        Undo
      </Button>
      <Button variant="outlined" color="inherit" size="small" startIcon={<CheckRounded />} disabled={scoreA + scoreB === 0}
        onClick={() => setConfirmation('closeSet')}>Close set</Button>
      <Button variant="outlined" color="inherit" size="small" startIcon={<CheckRounded />} disabled={!canCloseMatch(state) || !saved}
        onClick={() => { setCloseError(''); setCloseSuccess(false); setConfirmation('closeMatch'); }}>Save match</Button>
      <Button color="inherit" size="small" onClick={() => setPendingOpen(true)}>Saved matches ({pendingCount})</Button>
      <Button variant="outlined" color="inherit" size="small" startIcon={<EditOutlined />} onClick={() => setEditing(true)}>Edit names</Button>
      <Button variant="outlined" color="inherit" size="small" startIcon={<SwapHorizRounded />} aria-pressed={state.sidesSwapped}
        onClick={() => dispatch({ type: 'switchSides' })}>Switch sides</Button>
    </Box>
    {scoreA + scoreB > 0 && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', px: 2 }}>Close the current set before closing the match.</Typography>}
    <Tabs value={tab} onChange={changeTab} variant="fullWidth" className="tabs" aria-label="Match view">
      <Tab id="game-tab" aria-controls="game-panel" label="Game" />
      <Tab id="stats-tab" aria-controls="stats-panel" label="Statistics" />
    </Tabs>
    {tab === 0 && <Box component="details" className="log-wrap">
      <Box component="summary"><Typography component="span" variant="overline" color="text.secondary">Recent points ({state.log.length})</Typography></Box>
      <Box className="log-list">
        {state.log.length === 0 ? <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>No points scored yet. Tap a player to start.</Typography>
          : state.log.slice(-40).reverse().map((entry, i) => <Paper key={state.log.length - i} className="log-item" elevation={0}>
            <Typography variant="body2">{entry.type === 'roster' ? `Lineup changed · Set ${entry.setNumber}` : entry.type === 'set'
              ? `Set ${entry.setNumber} · ${entry.teamAName} ${entry.scoreA} × ${entry.scoreB} ${entry.teamBName}`
              : `${entry.teamName} · ${entry.playerId === 'err' ? 'Opponent’s error' : entry.playerName}`}</Typography>
            {entry.type === 'point' && <Typography variant="body2" color="text.secondary">+1</Typography>}
          </Paper>)}
      </Box>
    </Box>}
    <Box component="footer" className="footer">
      <Button color="inherit" size="small" startIcon={<RestartAltRounded />} onClick={() => setConfirmation('reset')}>Reset match</Button>
      <Typography variant="caption" color="text.secondary">{saved ? 'Saved on this device' : storageWarning ? 'Local saving unavailable' : 'Saving…'}</Typography>
    </Box>
    {lineupOpen && <DayCodeDialog confirmLabel="Load lineup" onClose={() => setLineupOpen(false)} onConfirm={async context => {
      const next = applyDayLineup(state, context);
      const persisted = await saveStoredMatch(database, next);
      setSetupDismissed(true); setState(persisted); setSavedState(persisted); setStorageWarning(''); setSyncNotice(''); setLineupOpen(false);
      requestAnimationFrame(() => courtRef.current?.scrollIntoView({ block: 'start' }));
    }} />}
    {pendingOpen && <SavedMatchesDialog database={database} onChanged={refreshPending} onClose={() => setPendingOpen(false)} />}
    {editing && <EditTeamsDialog state={state} teamOrder={teamOrder} onClose={() => setEditing(false)}
      onSave={(teams, dayContext, imported) => {
        setState(previous => matchReducer(imported ? applyDayLineup(previous, dayContext) : previous, { type: 'edit', teams }));
        if (imported) {
          setSetupDismissed(true);
          requestAnimationFrame(() => courtRef.current?.scrollIntoView({ block: 'start' }));
        }
        setEditing(false);
      }} />}
    {confirmation === 'closeMatch' && <CloseMatchDialog state={state} saving={closingMatch} error={closeError}
      onClose={() => setConfirmation(null)} onConfirm={finishMatch} />}
    <Dialog open={confirmation === 'closeSet' || confirmation === 'reset'} onClose={() => setConfirmation(null)} aria-labelledby="confirm-title" aria-describedby="confirm-message">
      <DialogTitle id="confirm-title">{closing ? `Close set ${state.currentSet}?` : 'Reset match?'}</DialogTitle>
      <DialogContent><DialogContentText id="confirm-message">
        {closing ? `Final score: ${leftTeam.name} ${teamScore(leftTeam)} × ${teamScore(rightTeam)} ${rightTeam.name}. Set scores will reset; match statistics will be kept.${scoreA === scoreB ? ' The score is tied, so neither team will be awarded a set.' : ''}`
          : 'All points, sets, and statistics will be cleared. Names will be kept. This cannot be undone.'}
      </DialogContentText></DialogContent>
      <DialogActions><Button onClick={() => setConfirmation(null)}>Cancel</Button>
        <Button variant="contained" onClick={() => { dispatch({ type: confirmation }); setConfirmation(null); }}>{closing ? 'Close set' : 'Reset'}</Button>
      </DialogActions>
    </Dialog>
  </Box>;
}
