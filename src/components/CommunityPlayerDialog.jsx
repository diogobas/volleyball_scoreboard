import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Pagination,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { remoteCommunities } from '../remote/communities';

export default function CommunityPlayerDialog({ client, group, onClose, onSaved }) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState([]);
  const [category, setCategory] = useState('sub');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    remoteCommunities(client)
      .players(group.community_id, query, page)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((failure) => {
        if (active) setError(failure.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, group.community_id, query, page, attempt]);
  async function save() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await remoteCommunities(client).importPlayers(group.id, selected, category);
      await onSaved();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      fullWidth
      maxWidth="sm"
      onClose={() => {
        if (!busy) onClose();
      }}
      aria-labelledby="community-players-title"
    >
      <DialogTitle id="community-players-title">Add players from community</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography>
            Add existing community players to {group.name}. Their statistics and category in other
            groups stay separate.
          </Typography>
          {error && (
            <Alert
              severity="warning"
              action={
                <Button disabled={busy} onClick={() => setAttempt((value) => value + 1)}>
                  Retry
                </Button>
              }
            >
              {error}
            </Alert>
          )}
          <TextField
            label="Search community players"
            value={query}
            disabled={busy}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            slotProps={{ htmlInput: { maxLength: 120 } }}
          />
          <TextField
            select
            label="Category in this group"
            value={category}
            disabled={busy}
            slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="sub">Sub</option>
            <option value="fixed">Fixed</option>
          </TextField>
          {loading && <Typography role="status">Loading community players…</Typography>}
          {data && !loading && (
            <>
              {!data.players.length && <Typography>No community players found.</Typography>}
              {data.players.map((player) => {
                const alreadyAdded = player.groups.some((item) => item.id === group.id);
                return (
                  <Stack key={player.id}>
                    <FormControlLabel
                      label={`${player.name}${alreadyAdded ? ' · Already in this group' : ''}`}
                      control={
                        <Checkbox
                          disabled={
                            busy ||
                            alreadyAdded ||
                            (!selected.includes(player.id) && selected.length >= 100)
                          }
                          checked={alreadyAdded || selected.includes(player.id)}
                          onChange={(_, checked) =>
                            setSelected((previous) =>
                              checked
                                ? [...previous, player.id]
                                : previous.filter((id) => id !== player.id),
                            )
                          }
                        />
                      }
                    />
                    <Typography variant="caption" color="text.secondary" sx={{ ml: 4 }}>
                      {player.groups.map((item) => item.name).join(' · ')}
                    </Typography>
                  </Stack>
                );
              })}
              <Typography variant="body2">
                {data.total} community players · Page {page} of{' '}
                {Math.max(1, Math.ceil(data.total / 25))}
              </Typography>
              <Pagination
                count={Math.max(1, Math.ceil(data.total / 25))}
                page={page}
                disabled={busy}
                onChange={(_, next) => setPage(next)}
              />
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={busy} onClick={onClose}>
          Cancel
        </Button>
        <Button variant="contained" disabled={busy || loading || !selected.length} onClick={save}>
          Add selected players ({selected.length})
        </Button>
      </DialogActions>
    </Dialog>
  );
}
