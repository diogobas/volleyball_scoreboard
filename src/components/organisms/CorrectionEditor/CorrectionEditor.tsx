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
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useRef, useState } from 'react';
import { errorCode, errorMessage } from '../../../game/errors';
import { createLocalId } from '../../../game/storage';
import { correctionErrors } from '../../../public/corrections';
import { correctMatch, getMatchForEdit } from '../../../remote/matchAdministration';
import { samePayload } from '../../../remote/matchPayload';
import type * as Models from '../../../remote/models';
import type { AsyncAction } from '../../types';
import { RevisionHistory } from '../RevisionHistory';
import { SetEditor } from '../SetEditor';
import { SnapshotComparison } from '../SnapshotComparison';
export type CorrectionEditorProps = {
  client: SupabaseClient;
  groupId: string;
  matchId: string;
  busy: boolean;
  setBusy: Dispatch<SetStateAction<boolean>>;
  onDirty: (dirty: boolean) => void;
  onSaved: AsyncAction;
};

export const CorrectionEditor = ({
  client,
  groupId,
  matchId,
  busy,
  setBusy,
  onDirty,
  onSaved,
}: CorrectionEditorProps) => {
  const [context, setContext] = useState<Models.EditableMatch | null>(null);
  const [draft, setDraft] = useState<Models.MatchSubmission | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [reason, setReason] = useState('');
  const [review, setReview] = useState(false);
  const [reload, setReload] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  const submission = useRef<{ signature: string; id: string } | null>(null);
  const notice = useRef<HTMLDivElement | null>(null);
  const reviewNotice = useRef<HTMLDivElement | null>(null);
  const dirty = Boolean(context && draft && !samePayload(context.payload, draft));
  useEffect(() => {
    if (error || success)
      (review ? reviewNotice : notice).current?.scrollIntoView({ block: 'nearest' });
  }, [error, success, review]);
  useEffect(() => {
    onDirty(dirty || Boolean(reason.trim()));
  }, [dirty, reason, onDirty]);
  useEffect(() => {
    const change = () => setOnline(navigator.onLine !== false);
    window.addEventListener('online', change);
    window.addEventListener('offline', change);
    return () => {
      window.removeEventListener('online', change);
      window.removeEventListener('offline', change);
    };
  }, []);
  useEffect(() => {
    let active = true;
    getMatchForEdit(groupId, matchId, client)
      .then((result) => {
        if (active) {
          setContext(result);
          setDraft(structuredClone(result.payload));
        }
      })
      .catch((failure) => {
        if (active)
          setError(errorMessage(failure) || 'Administrator access could not be confirmed.');
      });
    return () => {
      active = false;
    };
  }, [client, groupId, matchId]);
  const change = (action: (payload: Models.MatchSubmission) => Models.MatchSubmission) => {
    if (!draft) return;
    try {
      setDraft(action(draft));
      setError('');
      setSuccess('');
    } catch (failure) {
      setError(errorMessage(failure));
    }
  };
  const loadLatest = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await getMatchForEdit(groupId, matchId, client);
      setContext(result);
      setDraft(structuredClone(result.payload));
      setReason('');
      setBlocked(false);
      setReview(false);
      setReload(false);
      submission.current = null;
    } catch (failure) {
      setError(
        errorMessage(failure) ||
          'The latest version could not be loaded. Your draft has been kept.',
      );
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if (busy || blocked || !online || !context || !draft) return;
    setBusy(true);
    setError('');
    setSuccess('');
    const signature = JSON.stringify({ version: context.version, draft, reason: reason.trim() });
    if (submission.current?.signature !== signature)
      submission.current = { signature, id: createLocalId() };
    try {
      const result = await correctMatch(
        {
          groupId,
          matchId,
          version: context.version,
          payload: draft,
          reason,
          revisionId: submission.current.id,
        },
        client,
      );
      setSuccess(
        `Correction confirmed online as version ${result.version}. Results and statistics are updated.`,
      );
      setReview(false);
      setBlocked(true);
      onSaved();
      onDirty(false);
      try {
        const latest = await getMatchForEdit(groupId, matchId, client);
        setContext(latest);
        setDraft(structuredClone(latest.payload));
        setReason('');
        setBlocked(false);
        submission.current = null;
      } catch {
        setError(
          'The correction was saved, but the latest version could not be loaded. Use Load latest version.',
        );
      }
      setHistoryVersion((value) => value + 1);
    } catch (failure) {
      setError(
        errorMessage(failure) ||
          'Save was not confirmed. Keep your draft and retry the same correction to confirm whether it was saved.',
      );
      if (['40001', '42501'].includes(errorCode(failure) ?? '')) {
        setBlocked(true);
        setReview(false);
      }
    } finally {
      setBusy(false);
    }
  };
  const errors = draft && context ? correctionErrors(draft, context.players) : [];
  return (
    <Stack spacing={2}>
      {error && (
        <Alert ref={notice} severity="warning">
          {error}
        </Alert>
      )}
      {success && (
        <Alert ref={error ? undefined : notice} severity="success">
          {success}
        </Alert>
      )}
      {!online && (
        <Alert severity="warning">
          Corrections require internet. Your current draft is kept while these tools remain open.
        </Alert>
      )}
      <Button
        disabled={busy || !online}
        onClick={() => {
          if (dirty || reason.trim()) setReload(true);
          else void loadLatest();
        }}
      >
        Load latest version
      </Button>
      {!context && !error && (
        <Typography role="status">Checking group permission and loading match…</Typography>
      )}
      {context && draft && (
        <>
          <Typography component="h2" variant="h5">
            Correct match · Version {context.version}
          </Typography>
          <Typography variant="body2">
            Replace participants, edit point authors and adjust set boundaries. Replacing a
            participant reassigns their points in that set. Review all changes before saving.
          </Typography>
          <Box
            component="fieldset"
            disabled={busy || blocked}
            sx={{ p: 0, m: 0, border: 0, minWidth: 0 }}
          >
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
              {(['team_a_name', 'team_b_name'] as const).map((key, index) => (
                <TextField
                  key={key}
                  label={`Team ${index + 1} name`}
                  value={draft[key]}
                  fullWidth
                  slotProps={{ htmlInput: { maxLength: 16 } }}
                  onChange={(event) =>
                    change((payload) => ({
                      ...payload,
                      [key]: event.target.value,
                      sets: payload.sets.map((set) => ({ ...set, [key]: event.target.value })),
                    }))
                  }
                />
              ))}
            </Stack>
            {draft.sets.map((set, index) => (
              <SetEditor
                key={`${index}-${draft.sets.length}`}
                set={set}
                index={index}
                payload={draft}
                players={context.players}
                change={change}
              />
            ))}
            <TextField
              label="Reason for correction"
              required
              multiline
              minRows={2}
              fullWidth
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              slotProps={{ htmlInput: { maxLength: 500 } }}
              sx={{ mt: 2 }}
            />
          </Box>
          {errors.length > 0 && (
            <Alert severity="warning">
              {errors.map((message) => (
                <Typography key={message} variant="body2">
                  {message}
                </Typography>
              ))}
            </Alert>
          )}
          <Button
            variant="contained"
            disabled={busy || blocked || !online || !dirty || !reason.trim() || errors.length > 0}
            onClick={() => setReview(true)}
          >
            Review correction
          </Button>
          <Button disabled={busy} onClick={() => setHistoryOpen((value) => !value)}>
            {historyOpen ? 'Hide private revision history' : 'Private revision history'}
          </Button>
          {historyOpen && (
            <RevisionHistory
              key={historyVersion}
              client={client!}
              groupId={groupId}
              matchId={matchId}
            />
          )}
        </>
      )}
      <Dialog
        open={review}
        fullWidth
        maxWidth="md"
        onClose={() => {
          if (!busy) setReview(false);
        }}
        aria-labelledby="review-correction-title"
      >
        <DialogTitle id="review-correction-title">Confirm correction</DialogTitle>
        <DialogContent dividers>
          <Typography sx={{ mb: 2 }}>Reason: {reason}</Typography>
          {error && (
            <Alert ref={reviewNotice} severity="warning" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          {context && draft && <SnapshotComparison before={context.payload} after={draft} />}
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setReview(false)}>
            Keep editing
          </Button>
          <Button variant="contained" disabled={busy || blocked || !online} onClick={save}>
            {busy ? 'Saving correction…' : 'Save correction'}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={reload}
        onClose={() => {
          if (!busy) setReload(false);
        }}
        aria-labelledby="reload-correction-title"
      >
        <DialogTitle id="reload-correction-title">Load the latest version?</DialogTitle>
        <DialogContent>
          Your draft and reason will be replaced after the current server version is successfully
          loaded.
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setReload(false)}>
            Keep draft
          </Button>
          <Button disabled={busy || !online} onClick={loadLatest}>
            Load latest
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};
