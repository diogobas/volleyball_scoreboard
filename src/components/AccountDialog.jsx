import { useEffect, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';
import { getRemoteClient } from '../remote/client';
import GroupAdministration from './GroupAdministration';

export default function AccountDialog({ onClose }) {
  const [connection] = useState(() => {
    try { return { client: getRemoteClient() }; } catch { return { client: null }; }
  });
  const [busy, setBusy] = useState(false);
  return <Dialog open fullWidth maxWidth="sm" onClose={() => { if (!busy) onClose(); }} aria-labelledby="account-title">
    <DialogTitle id="account-title">Account &amp; groups</DialogTitle>
    <DialogContent dividers>
      {connection.client ? <Account client={connection.client} busy={busy} setBusy={setBusy} /> : <Alert severity="info">
        Online accounts are not configured for this build. Local matches and saved data remain available.
      </Alert>}
    </DialogContent>
    <DialogActions><Button disabled={busy} onClick={onClose}>Done</Button></DialogActions>
  </Dialog>;
}

function Account({ client, busy, setBusy }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [signingUp, setSigningUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    const { data: listener } = client.auth.onAuthStateChange((_event, next) => {
      if (active) { setSession(next); setLoading(false); }
    });
    client.auth.getSession().then(({ data, error: failure }) => {
      if (!active) return;
      setLoading(false);
      if (failure) setError('Sign-in could not be restored. Please sign in again.');
      else setSession(data.session);
    }).catch(() => { if (active) { setLoading(false); setError('Sign-in could not be restored. Please sign in again.'); } });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, [client]);

  async function authenticate(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const credentials = { email: email.trim(), password };
      const { data, error: failure } = signingUp
        ? await client.auth.signUp(credentials) : await client.auth.signInWithPassword(credentials);
      if (failure) throw failure;
      setPassword('');
      setSession(data.session);
      if (!data.session) setMessage('Check your email to confirm your account, then return here and sign in.');
    } catch (failure) { setError(failure.message || 'Sign-in failed. Check your connection and try again.'); }
    finally { setBusy(false); }
  }

  async function signOut() {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const { error: failure } = await client.auth.signOut({ scope: 'local' });
      if (failure) throw failure;
      setSession(null);
    } catch (failure) { setError(failure.message || 'Sign-out failed. Please try again.'); }
    finally { setBusy(false); }
  }

  if (loading) return <Typography role="status">Restoring sign-in…</Typography>;
  return <Stack spacing={2}>
    {error && <Alert severity="error">{error}</Alert>}
    {message && <Alert severity="info">{message}</Alert>}
    {session ? <>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
        <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>Signed in as {session.user.email}</Typography>
        <Button disabled={busy} onClick={signOut}>Sign out</Button>
      </Stack>
      <GroupAdministration key={session.user.id} client={client} userId={session.user.id} busy={busy} setBusy={setBusy} />
    </> : <Stack component="form" onSubmit={authenticate} spacing={2}>
      <Typography component="h3" variant="h6">{signingUp ? 'Create account' : 'Sign in'}</Typography>
      <Typography variant="body2" color="text.secondary">Sign in to create and administer online groups. Your local matches remain available without signing in.</Typography>
      <TextField label="Email" type="email" autoComplete="email" required value={email} disabled={busy} onChange={event => setEmail(event.target.value)} />
      <TextField label="Password" type="password" autoComplete={signingUp ? 'new-password' : 'current-password'} required value={password} disabled={busy}
        onChange={event => setPassword(event.target.value)} slotProps={{ htmlInput: { minLength: signingUp ? 8 : undefined } }} helperText={signingUp ? 'At least 8 characters.' : undefined} />
      <Button type="submit" variant="contained" disabled={busy}>{busy ? 'Please wait…' : signingUp ? 'Create account' : 'Sign in'}</Button>
      <Button disabled={busy} onClick={() => { setSigningUp(value => !value); setError(''); }}>{signingUp ? 'Already have an account? Sign in' : 'Create an account'}</Button>
    </Stack>}
  </Stack>;
}
