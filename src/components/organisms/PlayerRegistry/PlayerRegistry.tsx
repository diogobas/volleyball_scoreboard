import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useRef, useState } from 'react';
import { errorMessage } from '../../../game/errors';
import { positionLabel, sexLabel } from '../../../game/playerProfile';
import { normalizeName } from '../../../game/registry';
import { createLocalId } from '../../../game/storage';
import { publicPlayerHref } from '../../../public/routes';
import { dayRpc } from '../../../remote/gameDays';
import type * as Models from '../../../remote/models';
import { ListPagination } from '../../molecules/ListPagination';
import type { AsyncAction } from '../../types';
import { CommunityPlayerDialog } from '../CommunityPlayerDialog';
import { PlayerFormDialog } from '../PlayerFormDialog';
import type { PlayerDraft } from '../PlayerFormDialog/PlayerFormDialog';
export type PlayerRegistryProps = {
  client: SupabaseClient;
  groupId: string;
  group?: Models.Group;
  players: Models.RegisteredPlayer[];
  loading: boolean;
  onChanged: AsyncAction;
};

export const PlayerRegistry = ({
  client,
  groupId,
  group,
  players,
  loading,
  onChanged,
}: PlayerRegistryProps) => {
  const [importing, setImporting] = useState(false);
  const [form, setForm] = useState<PlayerDraft | null>(null);
  const [removing, setRemoving] = useState<Models.RegisteredPlayer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const saving = useRef(false);
  const visible = players
    .filter(
      (player) =>
        (normalizeName(player.name).includes(normalizeName(query)) ||
          player.display_id?.toLowerCase().includes(query.trim().toLowerCase())) &&
        (filter === 'all' || (player.category ?? 'sub') === filter),
    )
    .sort((a, b) => a.name.localeCompare(b.name, 'pt', { sensitivity: 'base' }));
  const currentPage = Math.min(page, Math.max(1, Math.ceil(visible.length / pageSize)));
  const rows = visible.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const open = (player: Models.RegisteredPlayer | null) => {
    setError('');
    setForm(player ? { ...player } : { id: createLocalId(), name: '', category: 'sub' });
  };
  const run = async (action: () => Promise<unknown>, success: string) => {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
      setForm(null);
      setRemoving(null);
      setMessage(success);
      try {
        await onChanged();
      } catch {
        setError('The change was saved. Refresh players to reload the registry.');
      }
    } catch (failure) {
      setError(errorMessage(failure) || 'The change could not be confirmed. Retry to confirm it.');
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  return (
    <Stack spacing={2}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Typography component="h3" variant="h5">
          Player registry
        </Typography>
        <Button variant="contained" disabled={busy || loading} onClick={() => open(null)}>
          Add player
        </Button>
      </Stack>
      {group?.can_import_community_players && (
        <Button
          variant="outlined"
          sx={{ alignSelf: 'start' }}
          disabled={busy || loading}
          onClick={() => setImporting(true)}
        >
          Add from community
        </Button>
      )}
      {importing && group && (
        <CommunityPlayerDialog
          client={client}
          group={group}
          onClose={() => setImporting(false)}
          onSaved={async () => {
            setImporting(false);
            setMessage('Community players added.');
            try {
              await onChanged();
            } catch {
              setError('Players were added. Refresh the registry to see the latest players.');
            }
          }}
        />
      )}
      <Typography variant="body2" color="text.secondary">
        Fixed players belong to the regular group. All other players are Subs.
      </Typography>
      {message && <Alert severity="success">{message}</Alert>}
      {error && !form && !removing && <Alert severity="warning">{error}</Alert>}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          label="Search players"
          placeholder="Name or player ID"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
          size="small"
          sx={{ flex: 1 }}
        />
        <TextField
          select
          label="Category"
          value={filter}
          size="small"
          sx={{ minWidth: 160 }}
          slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
          onChange={(event) => {
            setFilter(event.target.value);
            setPage(1);
          }}
        >
          <option value="all">All players</option>
          <option value="fixed">Fixed</option>
          <option value="sub">Sub</option>
        </TextField>
        <Button
          disabled={busy || loading}
          onClick={() =>
            run(async () => {
              await onChanged();
            }, 'Players refreshed.')
          }
        >
          Refresh players
        </Button>
      </Stack>
      <Typography variant="body2" color="text.secondary">
        {players.filter((player) => player.category === 'fixed').length} Fixed ·{' '}
        {players.filter((player) => player.category !== 'fixed').length} Subs
      </Typography>
      {loading && <Typography role="status">Loading players…</Typography>}
      {!loading && (
        <>
          <ListPagination
            total={visible.length}
            page={currentPage}
            pageSize={pageSize}
            count={rows.length}
            label="Players"
            disabled={busy}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
          {!visible.length && (
            <Typography>
              {players.length ? 'No players match this search.' : 'No registered players yet.'}
            </Typography>
          )}
          {rows.map((player) => (
            <Paper key={player.id} variant="outlined" sx={{ p: 2 }}>
              <Stack
                direction="row"
                sx={{
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 1,
                }}
              >
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>
                    {player.name}
                  </Typography>
                  {player.display_id && (
                    <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>
                      {player.display_id}
                    </Typography>
                  )}
                  <Chip
                    size="small"
                    label={player.category === 'fixed' ? 'Fixed' : 'Sub'}
                    color={player.category === 'fixed' ? 'primary' : 'default'}
                    sx={{ mt: 0.5 }}
                  />
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    {sexLabel(player.sex)} ·{' '}
                    {(player.preferred_positions ?? []).length
                      ? (player.preferred_positions ?? []).map(positionLabel).join(' · ')
                      : 'Positions not specified'}
                  </Typography>
                </Box>
                <Stack direction="row" sx={{ flexWrap: 'wrap' }}>
                  <Button
                    component="a"
                    href={publicPlayerHref(
                      group?.display_id ?? groupId,
                      player.display_id ?? player.id,
                    )}
                    aria-label={`View profile for ${player.name}`}
                  >
                    Profile
                  </Button>
                  <Button
                    color="warning"
                    disabled={busy}
                    aria-label={`Delete ${player.name}`}
                    onClick={() => {
                      setError('');
                      setRemoving(player);
                    }}
                  >
                    Delete
                  </Button>
                </Stack>
              </Stack>
            </Paper>
          ))}
        </>
      )}
      {form && (
        <PlayerFormDialog
          key={form.id}
          client={client}
          groupId={groupId}
          player={form}
          onClose={() => setForm(null)}
          onSaved={async () => {
            setForm(null);
            setMessage('Player saved.');
            try {
              await onChanged();
            } catch {
              setError('The change was saved. Refresh players to reload the registry.');
            }
          }}
        />
      )}
      <Dialog
        open={Boolean(removing)}
        onClose={() => {
          if (!busy) setRemoving(null);
        }}
        aria-labelledby="delete-player-title"
      >
        <DialogTitle id="delete-player-title">Delete {removing?.name}?</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          This removes the player from the registry and future lineups. Previously recorded matches
          and statistics are preserved.
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setRemoving(null)}>
            Cancel
          </Button>
          <Button
            color="warning"
            disabled={busy}
            onClick={() =>
              run(
                () =>
                  dayRpc(
                    'delete_group_player',
                    {
                      p_group_id: groupId,
                      p_player_id: removing!.id,
                      p_expected_version: removing!.version,
                    },
                    client,
                  ),
                'Player deleted.',
              )
            }
          >
            Delete player
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};
