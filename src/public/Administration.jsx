import { useEffect, useState } from 'react';
import { Alert, Button, Container, Stack, TextField, Typography } from '@mui/material';
import { getAdminClient } from '../remote/client';
import GroupAdministration from '../components/GroupAdministration';

export default function Administration() {
  const [client] = useState(() => getAdminClient()); const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(Boolean(client)); const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [signup, setSignup] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  useEffect(() => {
    if (!client) return;
    let active = true;
    const { data: listener } = client.auth.onAuthStateChange((_event, next) => { if (active) { setSession(next); setLoading(false); } });
    client.auth.getSession().then(({ data, error }) => { if (active) { if (error) setError(error.message); else setSession(data.session); setLoading(false); } }).catch(failure => { if (active) { setError(failure.message); setLoading(false); } });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, [client]);
  async function authenticate(event) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const result = await client.auth[signup ? 'signUp' : 'signInWithPassword']({ email: email.trim(), password });
      if (result.error) throw result.error;
      setPassword(''); setSession(result.data.session);
      if (!result.data.session) setMessage('Confirm your email, then return to sign in.');
    } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }
  return <Container component="main" maxWidth="lg" sx={{ py: 3, pb: 6 }}><Stack spacing={2}>
    <Button component="a" href="#/groups" sx={{ alignSelf: 'start' }}>← Public results</Button>
    <Typography component="h1" variant="h4">Administration</Typography>
    {!client && <Alert severity="warning">Online administration is not configured for this build.</Alert>}
    {error && <Alert severity="warning">{error}</Alert>}{message && <Alert severity="info">{message}</Alert>}
    {loading && <Typography role="status">Restoring sign-in…</Typography>}
    {client && !loading && !session && <Stack component="form" onSubmit={authenticate} spacing={2}>
      <Typography>Sign in as a group administrator. A game-day code grants no administrative access.</Typography>
      <TextField required type="email" label="Email" autoComplete="email" value={email} disabled={busy} onChange={e => setEmail(e.target.value)} />
      <TextField required type="password" label="Password" autoComplete={signup ? 'new-password' : 'current-password'} value={password} disabled={busy} onChange={e => setPassword(e.target.value)} slotProps={{ htmlInput: { minLength: signup ? 8 : undefined } }} />
      <Button type="submit" variant="contained" disabled={busy}>{signup ? 'Create account' : 'Sign in'}</Button>
      <Button disabled={busy} onClick={() => setSignup(v => !v)}>{signup ? 'Already have an account? Sign in' : 'Create account'}</Button>
    </Stack>}
    {session && <><Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
      <Typography sx={{ overflowWrap: 'anywhere' }}>{session.user.email}</Typography>
      <Button disabled={busy} onClick={async () => { setBusy(true); try { const { error } = await client.auth.signOut({ scope: 'local' }); if (error) throw error; setSession(null); } catch (failure) { setError(failure.message); } finally { setBusy(false); } }}>Sign out</Button>
    </Stack><GroupAdministration key={session.user.id} client={client} userId={session.user.id} busy={busy} setBusy={setBusy} /></>}
  </Stack></Container>;
}
