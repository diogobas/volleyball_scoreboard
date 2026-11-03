import { useEffect, useReducer, useRef, useState } from 'react';
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Paper, Stack, Tab, Tabs, Typography } from '@mui/material';
import UndoRounded from '@mui/icons-material/UndoRounded';
import EditOutlined from '@mui/icons-material/EditOutlined';
import RestartAltRounded from '@mui/icons-material/RestartAltRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import SwapHorizRounded from '@mui/icons-material/SwapHorizRounded';
import { matchReducer, TEAM_IDS, teamScore } from './game/match';
import { loadStoredMatch, openMatchDatabase, saveStoredMatch } from './game/storage';
import { Roster, ScorePanel } from './components/TeamPanel';
import EditTeamsDialog from './components/EditTeamsDialog';
import Statistics from './components/Statistics';

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
  const [state, dispatch] = useReducer(matchReducer, initialState);
  const [storageWarning, setStorageWarning] = useState('');
  const [tab, setTab] = useState(0);
  const [editing, setEditing] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [savedState, setSavedState] = useState(initialState);
  const saved = savedState === state;
  const scoreA = teamScore(state.teams.A);
  const scoreB = teamScore(state.teams.B);
  const teamOrder = state.sidesSwapped ? ['B', 'A'] : TEAM_IDS;
  const [leftTeam, rightTeam] = teamOrder.map(id => state.teams[id]);

  useEffect(() => {
    let cancelled = false;
    // IndexedDB serializes these read/write transactions in creation order.
    saveStoredMatch(database, state).then(() => {
      if (!cancelled) { setSavedState(state); setStorageWarning(''); }
    }).catch(() => {
      if (!cancelled) setStorageWarning('Local saving failed. Keep the app open and retry saving before leaving.');
    });
    return () => { cancelled = true; };
  }, [database, state]);

  function retrySave() {
    saveStoredMatch(database, state).then(() => {
      setSavedState(state);
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
    {storageWarning && <Alert severity="warning" action={<Button color="inherit" size="small" onClick={retrySave}>Retry saving</Button>} sx={{ mx: 2, mb: 2 }}>{storageWarning}</Alert>}
    <Box ref={courtRef} className={`court${tab === 1 ? ' court--stats' : ''}`}>
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
        aria-label={last?.type === 'set' ? 'Undo last set' : 'Undo last point'} onClick={() => dispatch({ type: 'undo' })}>
        Undo
      </Button>
      <Button variant="outlined" color="inherit" size="small" startIcon={<CheckRounded />} disabled={scoreA + scoreB === 0}
        onClick={() => setConfirmation('closeSet')}>Close set</Button>
      <Button variant="outlined" color="inherit" size="small" startIcon={<EditOutlined />} onClick={() => setEditing(true)}>Edit names</Button>
      <Button variant="outlined" color="inherit" size="small" startIcon={<SwapHorizRounded />} aria-pressed={state.sidesSwapped}
        onClick={() => dispatch({ type: 'switchSides' })}>Switch sides</Button>
    </Box>
    <Tabs value={tab} onChange={changeTab} variant="fullWidth" className="tabs" aria-label="Match view">
      <Tab id="game-tab" aria-controls="game-panel" label="Game" />
      <Tab id="stats-tab" aria-controls="stats-panel" label="Statistics" />
    </Tabs>
    {tab === 0 && <Box component="details" className="log-wrap">
      <Box component="summary"><Typography component="span" variant="overline" color="text.secondary">Recent points ({state.log.length})</Typography></Box>
      <Box className="log-list">
        {state.log.length === 0 ? <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>No points scored yet. Tap a player to start.</Typography>
          : state.log.slice(-40).reverse().map((entry, i) => <Paper key={state.log.length - i} className="log-item" elevation={0}>
            <Typography variant="body2">{entry.type === 'set'
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
    {editing && <EditTeamsDialog teams={state.teams} teamOrder={teamOrder} onClose={() => setEditing(false)}
      onSave={teams => { dispatch({ type: 'edit', teams }); setEditing(false); }} />}
    <Dialog open={Boolean(confirmation)} onClose={() => setConfirmation(null)} aria-labelledby="confirm-title" aria-describedby="confirm-message">
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
