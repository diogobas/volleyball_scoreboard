import { useEffect, useReducer, useState } from 'react';
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Paper, Stack, Tab, Tabs, Typography } from '@mui/material';
import UndoRounded from '@mui/icons-material/UndoRounded';
import EditOutlined from '@mui/icons-material/EditOutlined';
import RestartAltRounded from '@mui/icons-material/RestartAltRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import SwapHorizRounded from '@mui/icons-material/SwapHorizRounded';
import { createMatch, matchReducer, restoreMatch, STORAGE_KEY, TEAM_IDS, teamScore } from './game/match';
import { Roster, ScorePanel } from './components/TeamPanel';
import EditTeamsDialog from './components/EditTeamsDialog';
import Statistics from './components/Statistics';

function loadMatch() {
  try { return { state: restoreMatch(localStorage.getItem(STORAGE_KEY)), warning: '' }; }
  catch { return { state: createMatch(), warning: 'The saved match could not be restored. A new match has been started.' }; }
}

export default function App() {
  const [initial] = useState(loadMatch);
  const [state, dispatch] = useReducer(matchReducer, initial.state);
  const [storageWarning, setStorageWarning] = useState(initial.warning);
  const [tab, setTab] = useState(0);
  const [editing, setEditing] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [saved, setSaved] = useState(false);
  const scoreA = teamScore(state.teams.A);
  const scoreB = teamScore(state.teams.B);
  const teamOrder = state.sidesSwapped ? ['B', 'A'] : TEAM_IDS;
  const [leftTeam, rightTeam] = teamOrder.map(id => state.teams[id]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      setSaved(true);
    } catch {
      setSaved(false);
      setStorageWarning('Local storage is unavailable or full. You can keep playing, but the match may be lost when you leave.');
    }
  }, [state]);

  const last = state.log.at(-1);
  const closing = confirmation === 'closeSet';
  return <Box component="main" className="app" aria-label="Volleyball Scoreboard">
    {storageWarning && <Alert severity="warning" onClose={() => setStorageWarning('')} sx={{ mx: 2, mb: 2 }}>{storageWarning}</Alert>}
    <Stack className="set-bar" direction="row" sx={{ alignItems: 'center', justifyContent: 'center', gap: 2 }}>
      <Typography variant="body2" aria-label={`Sets won by ${leftTeam.name}`}>{leftTeam.setsWon}</Typography>
      <Chip size="small" variant="outlined" label={`Set ${state.currentSet}`} />
      <Typography variant="body2" aria-label={`Sets won by ${rightTeam.name}`}>{rightTeam.setsWon}</Typography>
    </Stack>
    <Box className="score-panels">{teamOrder.map(id => <ScorePanel key={id} id={id} team={state.teams[id]} />)}</Box>
    <Box className="actions">
      <Button variant="outlined" size="small" startIcon={<UndoRounded />} disabled={!last}
        aria-label={last?.type === 'set' ? 'Undo last set' : 'Undo last point'} onClick={() => dispatch({ type: 'undo' })}>
        Undo
      </Button>
      <Button variant="contained" size="small" startIcon={<CheckRounded />} disabled={scoreA + scoreB === 0}
        onClick={() => setConfirmation('closeSet')}>Close set</Button>
      <Button size="small" startIcon={<EditOutlined />} onClick={() => setEditing(true)}>Edit names</Button>
      <Button size="small" startIcon={<SwapHorizRounded />} aria-pressed={state.sidesSwapped}
        onClick={() => dispatch({ type: 'switchSides' })}>Switch sides</Button>
    </Box>
    <Tabs value={tab} onChange={(_, value) => setTab(value)} variant="fullWidth" className="tabs" aria-label="Match view">
      <Tab id="game-tab" aria-controls="game-panel" label="Game" />
      <Tab id="stats-tab" aria-controls="stats-panel" label="Statistics" />
    </Tabs>
    <Box className="game-panel" role="tabpanel" id="game-panel" aria-labelledby="game-tab" hidden={tab !== 0}>
      {tab === 0 && <>
        <Box className="rosters">{teamOrder.map(id => <Roster key={id} id={id} team={state.teams[id]}
          onPoint={(team, playerId) => dispatch({ type: 'point', team, playerId })} />)}</Box>
        <Box component="details" className="log-wrap">
          <Box component="summary"><Typography component="span" variant="overline" color="text.secondary">Recent points ({state.log.length})</Typography></Box>
          <Box className="log-list">
            {state.log.length === 0 ? <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>No points scored yet. Tap a player to start.</Typography>
              : state.log.slice(-40).reverse().map((entry, i) => <Paper key={state.log.length - i} className="log-item" elevation={0}>
                <Typography variant="body2">{entry.type === 'set'
                  ? `Set ${entry.setNumber} · ${entry.teamAName} ${entry.scoreA} × ${entry.scoreB} ${entry.teamBName}`
                  : `${entry.teamName} · ${entry.playerId === 'err' ? 'Unfforced error' : entry.playerName}`}</Typography>
                {entry.type === 'point' && <Typography variant="body2" color="text.secondary">+1</Typography>}
              </Paper>)}
          </Box>
        </Box>
      </>}
    </Box>
    <Box role="tabpanel" id="stats-panel" aria-labelledby="stats-tab" hidden={tab !== 1}>
      {tab === 1 && <Statistics state={state} teamOrder={teamOrder} />}
    </Box>
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
