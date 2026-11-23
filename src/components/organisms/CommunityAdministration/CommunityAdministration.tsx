import type * as Models from '../../../remote/models';
import type { CommunityAdministrationProps } from '../../types';

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
import { publicCommunityHref } from '../../../public/routes';
import { remoteCommunities } from '../../../remote/communities';
import { AdministrationPageHeader } from '../../molecules/AdministrationPageHeader';
import { SectionNavigation } from '../../molecules/SectionNavigation';
import { GroupAdministration } from '../GroupAdministration';

export const CommunityAdministration = ({
  client,
  userId,
  busy,
  setBusy,
  communities,
  onChanged,
}: CommunityAdministrationProps) => {
  const [selected, setSelected] = useState<Models.Community | null>(null);
  const [view, setView] = useState('groups');
  const [groupSelected, setGroupSelected] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [region, setRegion] = useState('');
  const [admins, setAdmins] = useState<Models.Administrator[] | null>(null);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [attempt, setAttempt] = useState(0);
  const selectedId = selected?.id;
  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    setAdmins(null);
    remoteCommunities(client)
      .administrators(selectedId)
      .then((data) => {
        if (active) setAdmins(data);
      })
      .catch((failure) => {
        if (active) setError(errorMessage(failure));
      });
    return () => {
      active = false;
    };
  }, [client, selectedId, attempt]);
  const run = async (action: (api: ReturnType<typeof remoteCommunities>) => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action(remoteCommunities(client));
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Stack spacing={2}>
      {selected && !groupSelected && (
        <SectionNavigation
          sticky
          value={view}
          onChange={setView}
          disabled={busy}
          label="Community sections"
          sections={[
            { id: 'groups', label: 'Groups' },
            { id: 'access', label: 'Community access' },
          ]}
        />
      )}
      {!groupSelected && error && <Alert severity="warning">{error}</Alert>}
      {!groupSelected && message && <Alert severity="success">{message}</Alert>}
      {selected ? (
        <>
          {!groupSelected && (
            <AdministrationPageHeader
              title={selected.name}
              subtitle={`${selected.region} · ${selected.display_id}`}
              backLabel="Back to my communities"
              disabled={busy}
              onBack={() => {
                setSelected(null);
                setError('');
              }}
              action={
                <Button
                  component="a"
                  href={publicCommunityHref(selected.display_id ?? selected.id)}
                >
                  Public community page
                </Button>
              }
            />
          )}
          {view === 'groups' ? (
            <GroupAdministration
              key={selected.id}
              client={client}
              userId={userId}
              busy={busy}
              setBusy={setBusy}
              communities={communities}
              community={selected}
              onSelectionChange={setGroupSelected}
            />
          ) : (
            <Stack spacing={2}>
              <Typography component="h3" variant="h6">
                Community administrators
              </Typography>
              <Typography color="text.secondary">
                Community administrators manage all groups and can add existing community players to
                a group. Group administrators keep access to their own groups.
              </Typography>
              {!admins && <Typography role="status">Loading administrators…</Typography>}
              {admins?.map((admin) => (
                <Paper key={admin.user_id} variant="outlined" sx={{ p: 2 }}>
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    sx={{ justifyContent: 'space-between', gap: 1 }}
                  >
                    <Typography sx={{ overflowWrap: 'anywhere' }}>
                      {admin.email}
                      {admin.user_id === userId ? ' (you)' : ''}
                    </Typography>
                    <Button
                      color="warning"
                      disabled={busy || admins.length <= 1}
                      onClick={() =>
                        run(async (api) => {
                          await api.revoke(selected.id, admin.user_id);
                          if (admin.user_id === userId) setSelected(null);
                          setAttempt((value) => value + 1);
                          onChanged();
                          setMessage('Community access removed.');
                        })
                      }
                    >
                      Remove community access
                    </Button>
                  </Stack>
                </Paper>
              ))}
              <Stack
                component="form"
                spacing={2}
                onSubmit={(event) => {
                  event.preventDefault();
                  run(async (api) => {
                    await api.authorize(selected.id, email);
                    setEmail('');
                    setAttempt((value) => value + 1);
                    setMessage('Community access granted.');
                  });
                }}
              >
                <TextField
                  type="email"
                  label="Community administrator email"
                  required
                  value={email}
                  disabled={busy}
                  onChange={(event) => setEmail(event.target.value)}
                  helperText="The person must have a confirmed account."
                />
                <Button type="submit" variant="outlined" disabled={busy}>
                  Add community administrator
                </Button>
              </Stack>
            </Stack>
          )}
        </>
      ) : (
        <>
          <AdministrationPageHeader title="My communities" />
          {!communities.length && <Typography>You do not administer a community yet.</Typography>}
          {communities.map((community) => (
            <Paper key={community.id} variant="outlined" sx={{ p: 2 }}>
              <Typography variant="h6">{community.name}</Typography>
              <Typography color="text.secondary">
                {community.region} · {community.display_id}
              </Typography>
              <Button
                disabled={busy}
                onClick={() => {
                  setSelected(community);
                  setView('groups');
                  setError('');
                }}
              >
                Manage community
              </Button>
            </Paper>
          ))}
          <Button
            variant="contained"
            sx={{ alignSelf: 'start' }}
            disabled={busy}
            onClick={() => {
              setName('');
              setRegion('');
              setCreating(true);
            }}
          >
            Create community
          </Button>
          <Dialog
            open={creating}
            fullWidth
            maxWidth="xs"
            onClose={() => {
              if (!busy) setCreating(false);
            }}
            aria-labelledby="create-community-title"
          >
            <Box
              component="form"
              onSubmit={(event) => {
                event.preventDefault();
                run(async (api) => {
                  const created = await api.create(name, region);
                  setCreating(false);
                  setSelected(created);
                  setView('groups');
                  onChanged();
                });
              }}
            >
              <DialogTitle id="create-community-title">Create community</DialogTitle>
              <DialogContent>
                <Stack spacing={2} sx={{ pt: 1 }}>
                  {error && <Alert severity="warning">{error}</Alert>}
                  <TextField
                    label="Community name"
                    required
                    autoFocus
                    value={name}
                    disabled={busy}
                    onChange={(event) => setName(event.target.value)}
                    slotProps={{ htmlInput: { maxLength: 100 } }}
                  />
                  <TextField
                    label="Region"
                    required
                    value={region}
                    disabled={busy}
                    onChange={(event) => setRegion(event.target.value)}
                    slotProps={{ htmlInput: { maxLength: 100 } }}
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
                  disabled={busy || !name.trim() || !region.trim()}
                >
                  Create community
                </Button>
              </DialogActions>
            </Box>
          </Dialog>
        </>
      )}
    </Stack>
  );
};
