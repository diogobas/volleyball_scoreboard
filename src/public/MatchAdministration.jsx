import { useEffect, useRef, useState } from 'react';
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, Stack, TextField, Typography } from '@mui/material';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import { getAdminClient } from '../remote/client';
import { correctMatch, getMatchForEdit, matchRevisionHistory } from '../remote/matchAdministration';
import { createLocalId } from '../game/storage';
import { samePayload } from '../remote/matchPayload';
import { addPoint, correctionErrors, editPoint, mergeSets, moveBoundary, removeEmptySet, removePoint, replaceParticipant, splitSet } from './corrections';

export default function MatchAdministration({ groupId, matchId, onSaved, onClose }) {
  const [client] = useState(() => getAdminClient());
  const [session, setSession] = useState(null);
  const [owner, setOwner] = useState(null);
  const [loading, setLoading] = useState(Boolean(client));
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [error, setError] = useState(''); const [discard, setDiscard] = useState(null);
  useEffect(() => {
    if (!client) return;
    let active = true;
    const accept = next => { if (active) { setSession(next); if (next) setOwner(next.user.id); setLoading(false); } };
    const { data: listener } = client.auth.onAuthStateChange((_event, next) => accept(next));
    client.auth.getSession().then(({ data, error: failure }) => {
      if (!active) return;
      if (failure) { setError('Sign in again to restore administrator access.'); setLoading(false); }
      else accept(data.session);
    }).catch(() => { if (active) { setError('Sign-in could not be restored.'); setLoading(false); } });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, [client]);
  function ask(action) { if (dirty) setDiscard(() => action); else action(); }
  async function signIn(event) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try {
      const { data, error: failure } = await client.auth.signInWithPassword({ email: email.trim(), password });
      if (failure) throw failure;
      if (!data.session) throw new Error('Confirm your email before signing in.');
      setPassword(''); setSession(data.session); setOwner(data.session.user.id);
    } catch (failure) { setError(failure.message || 'Sign-in failed.'); }
    finally { setBusy(false); }
  }
  async function signOut() {
    setBusy(true); setError('');
    try {
      const { error: failure } = await client.auth.signOut({ scope: 'local' });
      if (failure) throw failure;
      setSession(null); setOwner(null); setDirty(false);
    } catch (failure) { setError(failure.message || 'Sign-out failed.'); }
    finally { setBusy(false); }
  }
  return <>
    <Dialog open fullWidth maxWidth="md" onClose={() => { if (!busy) ask(onClose); }} aria-labelledby="admin-match-title">
      <DialogTitle id="admin-match-title">Administrator tools</DialogTitle>
      <DialogContent dividers>
        {!client && <Alert severity="warning">Online administration is not configured for this build.</Alert>}
        {error && <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>}
        {loading && <Typography role="status">Restoring administrator sign-in…</Typography>}
        {!loading && client && !session && <Stack component="form" onSubmit={signIn} spacing={2}>
          <Typography>Sign in with an existing group administrator account to correct this match. Public results remain available without signing in.</Typography>
          {owner && <Alert severity="info">Sign in with the same account to return to your draft.</Alert>}
          <TextField required type="email" label="Administrator email" autoComplete="email" value={email} disabled={busy} onChange={event => setEmail(event.target.value)} />
          <TextField required type="password" label="Administrator password" autoComplete="current-password" value={password} disabled={busy} onChange={event => setPassword(event.target.value)} />
          <Button type="submit" variant="contained" disabled={busy}>Sign in</Button>
        </Stack>}
        {session && <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 2 }}>
          <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>Administrator session: {session.user.email}</Typography>
          <Button disabled={busy} onClick={() => ask(signOut)}>Sign out</Button>
        </Stack>}
        {owner && <Box hidden={session?.user.id !== owner}>
          <CorrectionEditor key={owner} client={client} groupId={groupId} matchId={matchId} setBusy={setBusy} busy={busy} onDirty={setDirty} onSaved={onSaved} />
        </Box>}
      </DialogContent>
      <DialogActions><Button disabled={busy} onClick={() => ask(onClose)}>Close tools</Button></DialogActions>
    </Dialog>
    <Dialog open={Boolean(discard)} onClose={() => setDiscard(null)} aria-labelledby="discard-correction-title">
      <DialogTitle id="discard-correction-title">Discard unsaved changes?</DialogTitle>
      <DialogContent>This closes the current draft. Check the latest saved version before making another correction.</DialogContent>
      <DialogActions><Button onClick={() => setDiscard(null)}>Keep editing</Button><Button color="warning" onClick={() => { const action = discard; setDiscard(null); action(); }}>Discard draft</Button></DialogActions>
    </Dialog>
  </>;
}

function CorrectionEditor({ client, groupId, matchId, busy, setBusy, onDirty, onSaved }) {
  const [context, setContext] = useState(null); const [draft, setDraft] = useState(null);
  const [error, setError] = useState(''); const [success, setSuccess] = useState('');
  const [reason, setReason] = useState(''); const [review, setReview] = useState(false);
  const [reload, setReload] = useState(false); const [blocked, setBlocked] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false); const [historyVersion, setHistoryVersion] = useState(0);
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  const submission = useRef(null);
  const notice = useRef(null); const reviewNotice = useRef(null);
  const dirty = Boolean(context && draft && !samePayload(context.payload, draft));
  useEffect(() => { if (error || success) (review ? reviewNotice : notice).current?.scrollIntoView({ block: 'nearest' }); }, [error, success, review]);
  useEffect(() => { onDirty(dirty || Boolean(reason.trim())); }, [dirty, reason, onDirty]);
  useEffect(() => {
    const change = () => setOnline(navigator.onLine !== false);
    window.addEventListener('online', change); window.addEventListener('offline', change);
    return () => { window.removeEventListener('online', change); window.removeEventListener('offline', change); };
  }, []);
  useEffect(() => {
    let active = true;
    getMatchForEdit(groupId, matchId, client).then(result => {
      if (active) { setContext(result); setDraft(structuredClone(result.payload)); }
    }).catch(failure => { if (active) setError(failure.message || 'Administrator access could not be confirmed.'); });
    return () => { active = false; };
  }, [client, groupId, matchId]);
  function change(action) {
    try { setDraft(action(draft)); setError(''); setSuccess(''); }
    catch (failure) { setError(failure.message); }
  }
  async function loadLatest() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const result = await getMatchForEdit(groupId, matchId, client);
      setContext(result); setDraft(structuredClone(result.payload)); setReason(''); setBlocked(false); setReview(false); setReload(false); submission.current = null;
    } catch (failure) { setError(failure.message || 'The latest version could not be loaded. Your draft has been kept.'); }
    finally { setBusy(false); }
  }
  async function save() {
    if (busy || blocked || !online) return;
    setBusy(true); setError(''); setSuccess('');
    const signature = JSON.stringify({ version: context.version, draft, reason: reason.trim() });
    if (submission.current?.signature !== signature) submission.current = { signature, id: createLocalId() };
    try {
      const result = await correctMatch({ groupId, matchId, version: context.version, payload: draft, reason, revisionId: submission.current.id }, client);
      setSuccess(`Correction confirmed online as version ${result.version}. Public results are being refreshed.`);
      setReview(false); setBlocked(true); onSaved(); onDirty(false);
      try {
        const latest = await getMatchForEdit(groupId, matchId, client);
        setContext(latest); setDraft(structuredClone(latest.payload)); setReason(''); setBlocked(false); submission.current = null;
      } catch { setError('The correction was saved, but the latest version could not be loaded. Use Load latest version.'); }
      setHistoryVersion(value => value + 1);
    } catch (failure) {
      setError(failure.message || 'Save was not confirmed. Keep your draft and retry the same correction to confirm whether it was saved.');
      if (['40001', '42501'].includes(failure.code)) { setBlocked(true); setReview(false); }
    } finally { setBusy(false); }
  }
  const errors = draft && context ? correctionErrors(draft, context.players) : [];
  return <Stack spacing={2}>
    {error && <Alert ref={notice} severity="warning">{error}</Alert>}
    {success && <Alert ref={error ? undefined : notice} severity="success">{success}</Alert>}
    {!online && <Alert severity="warning">Corrections require internet. Your current draft is kept while these tools remain open.</Alert>}
    <Button disabled={busy || !online} onClick={() => { if (dirty || reason.trim()) setReload(true); else void loadLatest(); }}>Load latest version</Button>
    {!context && !error && <Typography role="status">Checking group permission and loading match…</Typography>}
    {context && draft && <>
      <Typography component="h2" variant="h5">Correct match · Version {context.version}</Typography>
      <Typography variant="body2">Replace participants, edit point authors and adjust set boundaries. Replacing a participant reassigns their points in that set. Review all changes before saving.</Typography>
      <Box component="fieldset" disabled={busy || blocked} sx={{ p: 0, m: 0, border: 0, minWidth: 0 }}>
        {draft.sets.map((set, index) => <SetEditor key={`${index}-${draft.sets.length}`} set={set} index={index} payload={draft} players={context.players} change={change} />)}
        <TextField label="Reason for correction" required multiline minRows={2} fullWidth value={reason} onChange={event => setReason(event.target.value)} slotProps={{ htmlInput: { maxLength: 500 } }} sx={{ mt: 2 }} />
      </Box>
      {errors.length > 0 && <Alert severity="warning">{errors.map(message => <Typography key={message} variant="body2">{message}</Typography>)}</Alert>}
      <Button variant="contained" disabled={busy || blocked || !online || !dirty || !reason.trim() || errors.length > 0} onClick={() => setReview(true)}>Review correction</Button>
      <Button disabled={busy} onClick={() => setHistoryOpen(value => !value)}>{historyOpen ? 'Hide private revision history' : 'Private revision history'}</Button>
      {historyOpen && <RevisionHistory key={historyVersion} client={client} groupId={groupId} matchId={matchId} />}
    </>}
    <Dialog open={review} fullWidth maxWidth="md" onClose={() => { if (!busy) setReview(false); }} aria-labelledby="review-correction-title">
      <DialogTitle id="review-correction-title">Confirm correction</DialogTitle>
      <DialogContent dividers>
        <Typography sx={{ mb: 2 }}>Reason: {reason}</Typography>
        {error && <Alert ref={reviewNotice} severity="warning" sx={{ mb: 2 }}>{error}</Alert>}
        {context && draft && <SnapshotComparison before={context.payload} after={draft} />}
      </DialogContent>
      <DialogActions><Button disabled={busy} onClick={() => setReview(false)}>Keep editing</Button><Button variant="contained" disabled={busy || blocked || !online} onClick={save}>{busy ? 'Saving correction…' : 'Save correction'}</Button></DialogActions>
    </Dialog>
    <Dialog open={reload} onClose={() => { if (!busy) setReload(false); }} aria-labelledby="reload-correction-title">
      <DialogTitle id="reload-correction-title">Load the latest version?</DialogTitle>
      <DialogContent>Your draft and reason will be replaced after the current server version is successfully loaded.</DialogContent>
      <DialogActions><Button disabled={busy} onClick={() => setReload(false)}>Keep draft</Button><Button disabled={busy || !online} onClick={loadLatest}>Load latest</Button></DialogActions>
    </Dialog>
  </Stack>;
}

function SetEditor({ set, index, payload, players, change }) {
  const [boundary, setBoundary] = useState(String(Math.max(1, Math.floor(set.points.length / 2))));
  const count = Number(boundary); const next = payload.sets[index + 1];
  return <Accordion defaultExpanded={index === 0} disableGutters sx={{ mb: 1 }}>
    <AccordionSummary expandIcon={<ExpandMoreRounded />}><Typography>Set {index + 1} · {set.score_a} × {set.score_b}</Typography></AccordionSummary>
    <AccordionDetails>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', sm: 'repeat(2,minmax(0,1fr))' }, gap: 2, mb: 3 }}>
        {['A','B'].map(team => <Stack key={team} spacing={1}>
          <Typography variant="subtitle2">{team === 'A' ? set.team_a_name : set.team_b_name}</Typography>
          {set.rosters[team].map((person, position) => <TextField key={position} select fullWidth label={`Set ${index + 1} · Team ${team} · Player ${position + 1}`} value={person.id}
            helperText={`Recorded: ${person.name}`} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
            onChange={event => { const person = players.find(person => person.id === event.target.value); if (person) change(payload => replaceParticipant(payload,index,team,position,person)); }}>
            {players.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
          </TextField>)}
        </Stack>)}
      </Box>
      <Typography component="h3" variant="subtitle1">Points · Set {index + 1}</Typography>
      <Typography variant="caption" color="text.secondary">A: {set.team_a_name} · B: {set.team_b_name}</Typography>
      <Box sx={{ maxHeight: 420, overflowY: 'auto', mb: 2, pr: .5 }}>
        {set.points.map((point, pointIndex) => <Box key={pointIndex} sx={{ pt: 1.5, pb: 2 }}>
          <Typography variant="caption" sx={{ display: 'block', mb: 1.5 }}>Point {pointIndex + 1}</Typography>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <TextField select size="small" label="Team" value={point.team} sx={{ width: 90, flexShrink: 0 }} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
              onChange={event => change(payload => editPoint(payload,index,pointIndex,{ team: event.target.value }))}>
              <option value="A">A</option><option value="B">B</option>
            </TextField>
            <TextField select size="small" fullWidth label="Scorer" value={point.is_opponent_error ? 'err' : point.player_id ?? ''} sx={{ minWidth: 0 }}
              slotProps={{ select: { native: true }, inputLabel: { shrink: true } }} onChange={event => change(payload => editPoint(payload,index,pointIndex,{ scorer: event.target.value }))}>
              <option value="">Select scorer</option><option value="err">Opponent’s error</option>
              {set.rosters[point.team].map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
            </TextField>
            <IconButton aria-label={`Remove point ${pointIndex + 1} from set ${index + 1}`} onClick={() => change(payload => removePoint(payload,index,pointIndex))}><DeleteOutlineRounded /></IconButton>
          </Stack>
        </Box>)}
      </Box>
      <Button onClick={() => change(payload => addPoint(payload,index))}>Add point to set {index + 1}</Button>
      <Divider sx={{ my: 2 }} />
      <Typography component="h3" variant="subtitle1">Set boundary</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Point order is preserved. After moving a boundary, review both lineups and point authors.</Typography>
      <TextField type="number" size="small" label={`Boundary after point · Set ${index + 1}`} value={boundary} onChange={event => setBoundary(event.target.value)} slotProps={{ htmlInput: { min: 1, step: 1 } }} fullWidth />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1 }}>
        <Button disabled={!Number.isInteger(count) || count < 1 || count >= set.points.length} onClick={() => change(payload => splitSet(payload,index,count))}>Split set {index + 1}</Button>
        {next && <><Button disabled={count === set.points.length || !Number.isInteger(count) || count < 1 || count >= set.points.length + next.points.length} onClick={() => change(payload => moveBoundary(payload,index,count))}>Move boundary after set {index + 1}</Button>
          <Button onClick={() => change(payload => mergeSets(payload,index))}>Merge set {index + 1} with next</Button></>}
        {!set.points.length && payload.sets.length > 1 && <Button onClick={() => change(payload => removeEmptySet(payload,index))}>Remove empty set {index + 1}</Button>}
      </Stack>
    </AccordionDetails>
  </Accordion>;
}

function SnapshotComparison({ before, after }) {
  return <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', sm: 'repeat(2,minmax(0,1fr))' }, gap: 2 }}>
    {[[before,'Before'],[after,'After']].map(([payload,label]) => <Box key={label}>
      <Typography component="h3" variant="subtitle1">{label} · {payload.sets.length} sets</Typography>
      {payload.sets.map((set,index) => <Accordion key={index} disableGutters>
        <AccordionSummary expandIcon={<ExpandMoreRounded />}><Typography variant="body2">Set {index + 1} · {set.score_a} × {set.score_b}</Typography></AccordionSummary>
        <AccordionDetails>
          {['A','B'].map(team => <Typography key={team} variant="body2" sx={{ mb: 1, overflowWrap: 'anywhere' }}>{team}: {set.rosters[team].map(person => person.name).join(', ')}</Typography>)}
          <Box component="ol" sx={{ maxHeight: 260, overflowY: 'auto', pl: 3, m: 0 }}>{set.points.map((point,index) => <Typography component="li" variant="body2" key={index} sx={{ overflowWrap: 'anywhere' }}>{point.team} · {point.is_opponent_error ? 'Opponent’s error' : point.player_name}</Typography>)}</Box>
        </AccordionDetails>
      </Accordion>)}
    </Box>)}
  </Box>;
}

function RevisionHistory({ client, groupId, matchId }) {
  const [page, setPage] = useState(1); const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState(null); const [error, setError] = useState('');
  useEffect(() => {
    let active = true; setData(null); setError('');
    matchRevisionHistory(groupId,matchId,page,client).then(result => { if (active) setData(result); }).catch(failure => { if (active) setError(failure.message || 'Private history could not be loaded.'); });
    return () => { active = false; };
  }, [client,groupId,matchId,page,attempt]);
  return <Stack spacing={2}>
    <Typography component="h2" variant="h5">Private revision history</Typography>
    {error && <Alert severity="warning" action={<Button onClick={() => setAttempt(value => value + 1)}>Retry history</Button>}>{error}</Alert>}
    {!data && !error && <Typography role="status">Loading private history…</Typography>}
    {data?.total === 0 && <Typography>No corrections recorded.</Typography>}
    {data?.revisions.map(revision => <Box key={revision.id} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
      <Typography variant="subtitle1">Version {revision.version}</Typography>
      <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{revision.author_email ?? revision.author_id} · {new Date(revision.created_at).toLocaleString()}</Typography>
      <Typography sx={{ my: 1, overflowWrap: 'anywhere' }}>{revision.reason}</Typography>
      <Accordion disableGutters slotProps={{ transition: { unmountOnExit: true } }}>
        <AccordionSummary expandIcon={<ExpandMoreRounded />}><Typography>Before and after · Version {revision.version}</Typography></AccordionSummary>
        <AccordionDetails><SnapshotComparison before={revision.previous_snapshot} after={revision.new_snapshot} /></AccordionDetails>
      </Accordion>
    </Box>)}
    {data && data.total > 20 && <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
      <Button disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Previous revisions</Button>
      <Typography variant="body2">Page {page} of {Math.ceil(data.total / 20)}</Typography>
      <Button disabled={page * 20 >= data.total} onClick={() => setPage(value => value + 1)}>Next revisions</Button>
    </Stack>}
  </Stack>;
}
