import { Alert, Button, Container, Stack, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import { PrivacyLink } from '../../components/atoms/PrivacyLink';
import { AdministrationAccountMenu } from '../../components/molecules/AdministrationAccountMenu';
import { AdministrationWorkspace } from '../../components/organisms/AdministrationWorkspace';
import { errorMessage } from '../../game/errors';
import { useAdminSession } from '../../hooks/useAdminSession';
import { getAdminClient } from '../../remote/client';

export const AdministrationPage = () => {
  const [client] = useState(() => getAdminClient());
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signup, setSignup] = useState(false);
  const { session, setSession, loading, error, setError } = useAdminSession(client);
  const [message, setMessage] = useState('');

  const authenticate = async (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await client!.auth[signup ? 'signUp' : 'signInWithPassword']({
        email: email.trim(),
        password,
      });
      if (result.error) throw result.error;
      setPassword('');
      setSession(result.data.session);
      if (!result.data.session) setMessage('Confirm your email, then return to sign in.');
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Container component="main" maxWidth="lg" sx={{ py: 3, pb: 6 }}>
      <Stack spacing={2}>
        <Button component="a" href="#/groups" sx={{ alignSelf: 'start' }}>
          ← Community results
        </Button>
        <Stack
          direction="row"
          sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 2 }}
        >
          <Typography component="h1" variant="h4" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
            AdministrationPage
          </Typography>
          {session && (
            <AdministrationAccountMenu
              user={session.user}
              busy={busy}
              onSignOut={async () => {
                setBusy(true);
                try {
                  const { error } = await client!.auth.signOut({ scope: 'local' });
                  if (error) throw error;
                  setSession(null);
                } catch (failure) {
                  setError(errorMessage(failure));
                } finally {
                  setBusy(false);
                }
              }}
            />
          )}
        </Stack>
        {!client && (
          <Alert severity="warning">Online administration is not configured for this build.</Alert>
        )}
        {error && <Alert severity="warning">{error}</Alert>}
        {message && <Alert severity="info">{message}</Alert>}
        {loading && <Typography role="status">Restoring sign-in…</Typography>}
        {client && !loading && !session && (
          <Stack component="form" onSubmit={authenticate} spacing={2}>
            <Typography>
              Sign in as a community or group administrator. A game-day code grants no
              administrative access.
            </Typography>
            <TextField
              required
              type="email"
              label="Email"
              autoComplete="email"
              value={email}
              disabled={busy}
              onChange={(e) => setEmail(e.target.value)}
            />
            <TextField
              required
              type="password"
              label="Password"
              autoComplete={signup ? 'new-password' : 'current-password'}
              value={password}
              disabled={busy}
              onChange={(e) => setPassword(e.target.value)}
              slotProps={{ htmlInput: { minLength: signup ? 8 : undefined } }}
            />
            <Button type="submit" variant="contained" disabled={busy}>
              {signup ? 'Create account' : 'Sign in'}
            </Button>
            <Button disabled={busy} onClick={() => setSignup((v) => !v)}>
              {signup ? 'Already have an account? Sign in' : 'Create account'}
            </Button>
          </Stack>
        )}
        {session && (
          <AdministrationWorkspace
            key={session.user.id}
            client={client!}
            userId={session.user.id}
            busy={busy}
            setBusy={setBusy}
          />
        )}
        <PrivacyLink />
      </Stack>
    </Container>
  );
};
