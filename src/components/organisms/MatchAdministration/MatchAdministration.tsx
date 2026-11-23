import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { errorMessage } from '../../../game/errors';
import { useAdminSession } from '../../../hooks/useAdminSession';
import { getAdminClient } from '../../../remote/client';
import type { AsyncAction } from '../../types';
import { CorrectionEditor } from '../CorrectionEditor';
export type MatchAdministrationProps = {
  groupId: string;
  matchId: string;
  onSaved: AsyncAction;
  onClose: () => void;
};

export const MatchAdministration = ({
  groupId,
  matchId,
  onSaved,
  onClose,
}: MatchAdministrationProps) => {
  const [client] = useState(() => getAdminClient());
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { session, setSession, owner, setOwner, loading, error, setError } = useAdminSession(
    client,
    {
      restoreError: 'Sign in again to restore administrator access.',
      networkError: 'Sign-in could not be restored.',
    },
  );
  const [discard, setDiscard] = useState<(() => void) | null>(null);

  const ask = (action: () => void) => {
    if (dirty) setDiscard(() => action);
    else action();
  };
  const signIn = async (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const { data, error: failure } = await client!.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (failure) throw failure;
      if (!data.session) throw new Error('Confirm your email before signing in.');
      setPassword('');
      setSession(data.session);
      setOwner(data.session.user.id);
    } catch (failure) {
      setError(errorMessage(failure) || 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  };
  const signOut = async () => {
    setBusy(true);
    setError('');
    try {
      const { error: failure } = await client!.auth.signOut({ scope: 'local' });
      if (failure) throw failure;
      setSession(null);
      setOwner(null);
      setDirty(false);
    } catch (failure) {
      setError(errorMessage(failure) || 'Sign-out failed.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Dialog
        open
        fullWidth
        maxWidth="md"
        onClose={() => {
          if (!busy) ask(onClose);
        }}
        aria-labelledby="admin-match-title"
      >
        <DialogTitle id="admin-match-title">Administrator tools</DialogTitle>
        <DialogContent dividers>
          {!client && (
            <Alert severity="warning">
              Online administration is not configured for this build.
            </Alert>
          )}
          {error && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          {loading && <Typography role="status">Restoring administrator sign-in…</Typography>}
          {!loading && client && !session && (
            <Stack component="form" onSubmit={signIn} spacing={2}>
              <Typography>
                Sign in with an existing group administrator account to correct this match. Public
                results remain available without signing in.
              </Typography>
              {owner && (
                <Alert severity="info">
                  Sign in with the same account to return to your draft.
                </Alert>
              )}
              <TextField
                required
                type="email"
                label="Administrator email"
                autoComplete="email"
                value={email}
                disabled={busy}
                onChange={(event) => setEmail(event.target.value)}
              />
              <TextField
                required
                type="password"
                label="Administrator password"
                autoComplete="current-password"
                value={password}
                disabled={busy}
                onChange={(event) => setPassword(event.target.value)}
              />
              <Button type="submit" variant="contained" disabled={busy}>
                Sign in
              </Button>
            </Stack>
          )}
          {session && (
            <Stack
              direction="row"
              sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 2 }}
            >
              <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                Administrator session: {session.user.email}
              </Typography>
              <Button disabled={busy} onClick={() => ask(signOut)}>
                Sign out
              </Button>
            </Stack>
          )}
          {owner && (
            <Box hidden={session?.user.id !== owner}>
              <CorrectionEditor
                key={owner}
                client={client!}
                groupId={groupId}
                matchId={matchId}
                setBusy={setBusy}
                busy={busy}
                onDirty={setDirty}
                onSaved={onSaved}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => ask(onClose)}>
            Close tools
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={Boolean(discard)}
        onClose={() => setDiscard(null)}
        aria-labelledby="discard-correction-title"
      >
        <DialogTitle id="discard-correction-title">Discard unsaved changes?</DialogTitle>
        <DialogContent>
          This closes the current draft. Check the latest saved version before making another
          correction.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDiscard(null)}>Keep editing</Button>
          <Button
            color="warning"
            onClick={() => {
              const action = discard;
              setDiscard(null);
              action?.();
            }}
          >
            Discard draft
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
