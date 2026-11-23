import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { errorMessage } from '../../../game/errors';
import { publicGroupHref } from '../../../public/routes';
import { remoteGroups } from '../../../remote/groups';
import type * as Models from '../../../remote/models';
import { AdministrationPageHeader } from '../../molecules/AdministrationPageHeader';
import { SectionNavigation } from '../../molecules/SectionNavigation';
import type { AdministrationProps } from '../../types';
import { AdminGroupResults } from '../AdminGroupResults';
import { GameDayAdministration } from '../GameDayAdministration';
export type GroupAdministrationProps = AdministrationProps & {
  communities?: Models.Community[];
  community?: Models.Community | null;
  onSelectionChange?: (selected: boolean) => void;
};

export const GroupAdministration = ({
  client,
  userId,
  busy,
  setBusy,
  communities = [],
  community = null,
  onSelectionChange,
}: GroupAdministrationProps) => {
  const [view, setView] = useState('overview');
  const [playersView, setPlayersView] = useState('registry');
  const [registryVersion, setRegistryVersion] = useState(0);
  const [groups, setGroups] = useState<Models.Group[] | null>(null);
  const [selected, setSelected] = useState<Models.Group | null>(null);
  const [admins, setAdmins] = useState<Models.Administrator[] | null>(null);
  const [name, setName] = useState('');
  const [communityId, setCommunityId] = useState(community?.id ?? '');
  const [creating, setCreating] = useState(false);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [attempt, setAttempt] = useState(0);
  const selectGroup = (group: Models.Group | null) => {
    setSelected(group);
    onSelectionChange?.(Boolean(group));
  };

  const parentCommunityId = community?.id;
  useEffect(() => {
    let active = true;
    setError('');
    setGroups(null);
    remoteGroups(client)
      .list()
      .then((result) => {
        if (active)
          setGroups(
            parentCommunityId
              ? result.filter((group) => group.community_id === parentCommunityId)
              : result,
          );
      })
      .catch((failure) => {
        if (active)
          setError(errorMessage(failure) || 'Groups could not be loaded. Check your connection.');
      });
    return () => {
      active = false;
    };
  }, [client, parentCommunityId, attempt]);

  useEffect(() => {
    let active = true;
    setAdmins(null);
    if (selected)
      remoteGroups(client)
        .administrators(selected.id)
        .then((result) => {
          if (active) setAdmins(result);
        })
        .catch((failure) => {
          if (active) setError(errorMessage(failure) || 'Administrators could not be loaded.');
        });
    return () => {
      active = false;
    };
  }, [client, selected, attempt]);

  const run = async (action: (api: ReturnType<typeof remoteGroups>) => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action(remoteGroups(client));
    } catch (failure) {
      setError(
        errorMessage(failure) || 'The change could not be confirmed. Refresh before trying again.',
      );
    } finally {
      setBusy(false);
    }
  };

  const create = (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    run(async (api) => {
      const group = await api.createInCommunity(name, communityId);
      setGroups((previous) => [...(previous ?? []), group]);
      setName('');
      setCreating(false);
      setView('overview');
      selectGroup(group);
      setMessage('Group created. You are its first administrator.');
    });
  };

  const selectedGroup = selected
    ? {
        ...selected,
        can_import_community_players: communities.some((item) => item.id === selected.community_id),
      }
    : null;
  return (
    <Stack spacing={2}>
      {selected && (
        <SectionNavigation
          sticky
          value={view}
          onChange={setView}
          disabled={busy}
          label="Administration sections"
          sections={[
            { id: 'overview', label: 'Overview' },
            { id: 'players', label: 'Players' },
            { id: 'matches', label: 'Matches' },
            { id: 'days', label: 'Game days' },
            { id: 'access', label: 'Access' },
          ]}
        />
      )}
      {error && <Alert severity="error">{error}</Alert>}
      {message && <Alert severity="success">{message}</Alert>}
      {selected && selectedGroup ? (
        <>
          <AdministrationPageHeader
            title={selected.name}
            subtitle={selected.display_id}
            backLabel="Back to my groups"
            disabled={busy}
            onBack={() => {
              selectGroup(null);
              setError('');
              setMessage('');
            }}
            action={
              <Button component="a" href={publicGroupHref(selected.display_id ?? selected.id)}>
                Public group page
              </Button>
            }
          />
          {view === 'players' && (
            <SectionNavigation
              value={playersView}
              onChange={setPlayersView}
              label="Player sections"
              sections={[
                { id: 'registry', label: 'Registry' },
                { id: 'statistics', label: 'Statistics' },
              ]}
            />
          )}
          <GameDayAdministration
            key={selected.id}
            client={client}
            group={selectedGroup}
            view={view === 'players' && playersView !== 'registry' ? 'hidden' : view}
            onRegistryChanged={() => setRegistryVersion((value) => value + 1)}
          />
          <Box
            hidden={
              !['overview', 'players', 'matches'].includes(view) ||
              (view === 'players' && playersView === 'registry')
            }
          >
            <AdminGroupResults
              key={selected.id}
              client={client}
              group={selectedGroup}
              view={view}
              refreshKey={registryVersion}
              onViewChange={(next) => {
                if (next === 'players') setPlayersView('statistics');
                setView(next);
              }}
            />
          </Box>
          <Box hidden={view !== 'access'}>
            <Stack spacing={2}>
              <Typography component="h4" variant="h6">
                Administrators
              </Typography>
              <Button disabled={busy} onClick={() => setAttempt((value) => value + 1)}>
                Refresh access
              </Button>
              {!admins && !error && <Typography role="status">Loading administrators…</Typography>}
              {admins?.map((admin) => (
                <Paper key={admin.user_id} variant="outlined" sx={{ p: 1.5 }}>
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    sx={{ justifyContent: 'space-between', gap: 1 }}
                  >
                    <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                      {admin.email}
                      {admin.user_id === userId ? ' (you)' : ''}
                    </Typography>
                    <Button
                      color="warning"
                      size="small"
                      disabled={busy || admins.length <= 1}
                      onClick={() =>
                        run(async (api) => {
                          await api.revoke(selected.id, admin.user_id);
                          if (admin.user_id === userId) selectGroup(null);
                          setAttempt((value) => value + 1);
                          setMessage('Administrator access removed.');
                        })
                      }
                    >
                      Remove access
                    </Button>
                  </Stack>
                </Paper>
              ))}
              <Stack
                component="form"
                onSubmit={(event) => {
                  event.preventDefault();
                  run(async (api) => {
                    await api.authorize(selected.id, email);
                    setEmail('');
                    setAttempt((value) => value + 1);
                    setMessage('Administrator access granted.');
                  });
                }}
                spacing={2}
              >
                <TextField
                  label="Administrator email"
                  type="email"
                  required
                  value={email}
                  disabled={busy}
                  onChange={(event) => setEmail(event.target.value)}
                  helperText="The person must create an account and confirm their email first."
                />
                <Button type="submit" variant="outlined" disabled={busy}>
                  Add administrator
                </Button>
              </Stack>
            </Stack>
          </Box>
        </>
      ) : (
        <>
          <AdministrationPageHeader
            title={community ? `${community.name} groups` : 'My groups'}
            action={
              <Button disabled={busy} onClick={() => setAttempt((value) => value + 1)}>
                Refresh groups
              </Button>
            }
          />
          {groups === null && !error && <Typography role="status">Loading groups…</Typography>}
          {groups?.length === 0 && (
            <Typography variant="body2">
              You do not administer a group yet. Create one or ask a group administrator to
              authorize your email.
            </Typography>
          )}
          {groups?.map((group) => (
            <Paper key={group.id} variant="outlined" sx={{ p: 2 }}>
              <Typography sx={{ overflowWrap: 'anywhere' }}>{group.name}</Typography>
              <Typography variant="body2" color="text.secondary">
                {group.display_id}
              </Typography>
              <Button
                disabled={busy}
                onClick={() => {
                  setView('overview');
                  selectGroup(group);
                  setError('');
                  setMessage('');
                }}
              >
                Manage group
              </Button>
            </Paper>
          ))}
          <Button
            variant="contained"
            sx={{ alignSelf: 'start' }}
            disabled={busy || groups === null || !communities.length}
            onClick={() => {
              setName('');
              setCommunityId(community?.id ?? communities[0]?.id ?? '');
              setCreating(true);
            }}
          >
            Create group
          </Button>
          {!communities.length && (
            <Typography variant="body2" color="text.secondary">
              A community administrator can create a group. To start your own community, open My
              communities.
            </Typography>
          )}
          <Dialog
            open={creating}
            onClose={() => {
              if (!busy) setCreating(false);
            }}
            fullWidth
            maxWidth="xs"
            aria-labelledby="create-group-title"
          >
            <Box component="form" onSubmit={create}>
              <DialogTitle id="create-group-title">Create group</DialogTitle>
              <DialogContent>
                <Stack spacing={2} sx={{ pt: 1 }}>
                  {error && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                      {error}
                    </Alert>
                  )}
                  <TextField
                    select
                    label="Community"
                    required
                    value={communityId}
                    disabled={busy || Boolean(community)}
                    slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
                    onChange={(event) => setCommunityId(event.target.value)}
                  >
                    <option value="">Choose a community</option>
                    {communities.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </TextField>
                  <TextField
                    autoFocus
                    fullWidth
                    margin="dense"
                    label="Group name"
                    required
                    value={name}
                    disabled={busy}
                    onChange={(event) => setName(event.target.value)}
                    slotProps={{ htmlInput: { maxLength: 80 } }}
                  />
                </Stack>
              </DialogContent>
              <DialogActions>
                <Button disabled={busy} onClick={() => setCreating(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="contained"
                  disabled={busy || !name.trim() || !communityId}
                >
                  Create group
                </Button>
              </DialogActions>
            </Box>
          </Dialog>
        </>
      )}
    </Stack>
  );
};
