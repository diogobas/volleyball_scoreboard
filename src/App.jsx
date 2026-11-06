import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Paper, Stack, Tab, Tabs, Typography } from '@mui/material';
import UndoRounded from '@mui/icons-material/UndoRounded';
import EditOutlined from '@mui/icons-material/EditOutlined';
import RestartAltRounded from '@mui/icons-material/RestartAltRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import SwapHorizRounded from '@mui/icons-material/SwapHorizRounded';
import { canCloseMatch, matchReducer, TEAM_IDS, teamScore } from './game/match';
import { closeStoredMatch, createLocalId, loadStoredMatch, openMatchDatabase, saveStoredMatch } from './game/storage';
import { Roster, ScorePanel } from './components/TeamPanel';
import EditTeamsDialog from './components/EditTeamsDialog';
import Statistics from './components/Statistics';
import CloseMatchDialog from './components/CloseMatchDialog';
import MatchHistory from './components/MatchHistory';
import PlayerRegistryDialog from './components/PlayerRegistryDialog';
import { registryCache } from './game/registryCache';
import { uploadStoredMatch } from './remote/matchSync';
const AccountDialog = lazy(() => import('./components/AccountDialog').catch(() => ({ default: AccountLoadFailure })));

function AccountLoadFailure({ onClose }) {
  return <Dialog open onClose={onClose} aria-labelledby="account-load-title">
    <DialogTitle id="account-load-title">Account &amp; groups</DialogTitle>
    <DialogContent><Alert severity="warning">Account tools could not be loaded. You can keep playing. Reload the app when connected to try again.</Alert></DialogContent>
    <DialogActions><Button onClick={onClose}>Done</Button></DialogActions>
  </Dialog>;
}

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
        const state = await loadStoredMatch(database);
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
    return () => { cancelled = true; database?.close(); };
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
  const [editing, setEditing] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [registryOpen, setRegistryOpen] = useState(false);
  const [registryVersion, setRegistryVersion] = useState(0);
  const [registryNotice, setRegistryNotice] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [savedState, setSavedState] = useState(initialState);
  const saved = savedState === state;
  const scoreA = teamScore(state.teams.A);
  const scoreB = teamScore(state.teams.B);
  const teamOrder = state.sidesSwapped ? ['B', 'A'] : TEAM_IDS;
  const [leftTeam, rightTeam] = teamOrder.map(id => state.teams[id]);

  function dispatch(action) {
    const timedAction = action.type === 'point' ? { ...action, startedAt: new Date().toISOString() } : action;
    if (!closingRef.current) setState(previous => matchReducer(previous, timedAction));
  }

  async function registryChanged() {
    const current = await loadStoredMatch(database);
    setState(current); setSavedState(current); setRegistryVersion(value => value + 1);
  }

  async function sendClosedMatch(id, groupId) {
    try {
      const cache = await registryCache(database);
      if (cache.groups.find(group => group.id === groupId)?.localOnly !== false) return;
      setRegistryNotice('Uploading the closed match. Its local copy is kept until the server confirms it.');
      const result = await uploadStoredMatch(database, id);
      if (result.status === 'confirmed') {
        setCloseSuccess(false);
        setRegistryNotice('Match confirmed online. Its local copy has been removed; players remain available offline.');
      }
    } catch (error) {
      setRegistryNotice(`Match upload was not confirmed. Your match is kept on this device. ${error.message || ''} Use History → Sync pending matches to retry.`);
    } finally {
      setRegistryVersion(value => value + 1);
    }
  }

  async function finishMatch() {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosingMatch(true);
    setCloseError('');
    try {
      const id = createLocalId();
      const nextState = await closeStoredMatch(database, state, { id });
      setState(nextState);
      setSavedState(nextState);
      setStorageWarning('');
      setConfirmation(null);
      setTab(0);
      setCloseSuccess(true);
      if (nextState.groupId && globalThis.navigator?.onLine !== false) {
        void sendClosedMatch(id, nextState.groupId);
      }
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

  const last = state.log.at(-1);
  const closing = confirmation === 'closeSet';
  return <Box component="main" className="app" aria-label="Volleyball Scoreboard">
    {closeSuccess && <Alert severity="success" onClose={() => setCloseSuccess(false)} sx={{ mx: 2, mb: 2 }}>Match saved on this device, awaiting upload. A new match has started.</Alert>}
    {registryNotice && <Alert severity="info" onClose={() => setRegistryNotice('')} sx={{ mx: 2, mb: 2 }}>{registryNotice}</Alert>}
    {storageWarning && <Alert severity="warning" action={<Button color="inherit" size="small" onClick={retrySave}>Retry saving</Button>} sx={{ mx: 2, mb: 2 }}>{storageWarning}</Alert>}
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
      <Box role="tabpanel" id="history-panel" aria-labelledby="history-tab" hidden={tab !== 2}>
        {tab === 2 && <MatchHistory refreshVersion={registryVersion} database={database} />}
      </Box>
    </Box>
    {tab !== 2 && <><Box className="actions">
      <Button variant="outlined" color="inherit" size="small" startIcon={<UndoRounded />} disabled={!last}
        aria-label={last?.type === 'set' ? 'Undo last set' : last?.type === 'roster' ? 'Undo last roster change' : 'Undo last point'} onClick={() => dispatch({ type: 'undo' })}>
        Undo
      </Button>
      <Button variant="outlined" color="inherit" size="small" startIcon={<CheckRounded />} disabled={scoreA + scoreB === 0}
        onClick={() => setConfirmation('closeSet')}>Close set</Button>
      <Button variant="outlined" color="inherit" size="small" startIcon={<CheckRounded />} disabled={!canCloseMatch(state) || !saved}
        onClick={() => { setCloseError(''); setCloseSuccess(false); setConfirmation('closeMatch'); }}>Close match</Button>
      <Button variant="outlined" color="inherit" size="small" startIcon={<EditOutlined />} onClick={() => setEditing(true)}>Teams &amp; players</Button>
      <Button variant="outlined" color="inherit" size="small" startIcon={<SwapHorizRounded />} aria-pressed={state.sidesSwapped}
        onClick={() => dispatch({ type: 'switchSides' })}>Switch sides</Button>
    </Box>
    {scoreA + scoreB > 0 && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', px: 2 }}>Close the current set before closing the match.</Typography>}</>}
    <Tabs value={tab} onChange={changeTab} variant="fullWidth" className="tabs" aria-label="Match view">
      <Tab id="game-tab" aria-controls="game-panel" label="Game" />
      <Tab id="stats-tab" aria-controls="stats-panel" label="Statistics" />
      <Tab id="history-tab" aria-controls="history-panel" label="History" />
    </Tabs>
    <Box sx={{ px: 2, pb: 1 }}>
      <Button color="inherit" size="small" onClick={() => setAccountOpen(true)}>Account &amp; groups</Button>
      <Button color="inherit" size="small" onClick={() => setRegistryOpen(true)}>Players &amp; sync</Button>
    </Box>
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
    {tab !== 2 && <Box component="footer" className="footer">
      <Button color="inherit" size="small" startIcon={<RestartAltRounded />} onClick={() => setConfirmation('reset')}>Reset match</Button>
      <Typography variant="caption" color="text.secondary">{saved ? 'Saved on this device' : storageWarning ? 'Local saving unavailable' : 'Saving…'}</Typography>
    </Box>}
    {accountOpen && <Suspense fallback={<Typography role="status" sx={{ px: 2 }}>Loading account…</Typography>}>
      <AccountDialog database={database} onClose={() => setAccountOpen(false)} />
    </Suspense>}
    {registryOpen && <PlayerRegistryDialog database={database} preferredGroupId={state.groupId}
      onChanged={registryChanged} onClose={() => setRegistryOpen(false)} />}
    {editing && <EditTeamsDialog state={state} database={database} teamOrder={teamOrder} onClose={() => setEditing(false)}
      onSave={updated => { setState(updated); setSavedState(updated); setEditing(false); }} />}
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
