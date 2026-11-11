import {
  Autocomplete,
  Box,
  Stack,
  TextField,
  Typography,
  createFilterOptions,
} from '@mui/material';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useState } from 'react';
import type * as Game from '../../../game/types';
import type * as Models from '../../../remote/models';
import { PlayerFormDialog } from '../PlayerFormDialog';
export type DayLineupEditorProps = {
  lineup: Models.DayLineup;
  players: Models.RegisteredPlayer[];
  disabled: boolean;
  onChange: (lineup: Models.DayLineup) => void;
  client: SupabaseClient;
  groupId: string;
  onPlayerAdded: (player: Models.RegisteredPlayer) => void | Promise<void>;
};

type SelectablePlayer = Models.Participant & Partial<Models.RegisteredPlayer>;
const addPlayer: SelectablePlayer = { id: '__add_player__', name: '＋ Add player…' };
const filterPlayers = createFilterOptions<SelectablePlayer>({
  stringify: (player) => `${player.name} ${player.display_id ?? ''}`,
});
const label = (player: SelectablePlayer) =>
  `${player.name}${player.id === addPlayer.id ? '' : player.category === 'fixed' ? ' · Fixed' : ' · Sub'}`;

export const DayLineupEditor = ({
  lineup,
  players,
  disabled,
  onChange,
  client,
  groupId,
  onPlayerAdded,
}: DayLineupEditorProps) => {
  const [adding, setAdding] = useState<{ team: Game.TeamId; position: number } | null>(null);
  const selected = new Map<string, string>(
    (['A', 'B'] as const).flatMap((team) =>
      lineup[team].players.flatMap((person, position) =>
        person ? [[person.id, `Team ${team} · Player ${position + 1}`] as const] : [],
      ),
    ),
  );
  const sorted = [...players].sort((a, b) =>
    a.name.localeCompare(b.name, 'pt', { sensitivity: 'base' }),
  );
  const assign = (team: Game.TeamId, position: number, player: Models.Participant | null) => {
    if (player && player.id !== lineup[team].players[position]?.id && selected.has(player.id))
      return;
    onChange({
      ...lineup,
      [team]: {
        ...lineup[team],
        players: lineup[team].players.map((person, index) =>
          index === position ? (player ? { id: player.id, name: player.name } : null) : person,
        ),
      },
    });
  };
  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        Replace a player directly: search all registered players, including Subs, by name or player
        ID. Players already assigned to another position are disabled. Choose “Add player…” if
        someone is missing.
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
        {(['A', 'B'] as const).map((team) => (
          <Stack key={team} spacing={1}>
            <TextField
              label={`Team ${team} name`}
              value={lineup[team].name}
              disabled={disabled}
              onChange={(event) =>
                onChange({ ...lineup, [team]: { ...lineup[team], name: event.target.value } })
              }
              slotProps={{ htmlInput: { maxLength: 16 } }}
            />
            {lineup[team].players.map((person, position) => (
              <Autocomplete
                key={position}
                options={sorted}
                value={players.find((player) => player.id === person?.id) ?? person ?? null}
                disabled={disabled}
                getOptionLabel={label}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                getOptionDisabled={(option) => option.id !== person?.id && selected.has(option.id)}
                filterOptions={(options, state) => [...filterPlayers(options, state), addPlayer]}
                onChange={(_, player) =>
                  player?.id === addPlayer.id
                    ? setAdding({ team, position })
                    : assign(team, position, player)
                }
                renderOption={(props, option) => {
                  const { key, ...rest } = props;
                  const assigned = option.id !== person?.id && selected.get(option.id);
                  return (
                    <li key={key} {...rest}>
                      {label(option)}
                      {assigned ? ` · ${assigned}` : ''}
                    </li>
                  );
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label={`Team ${team} · Player ${position + 1}`}
                    placeholder="Search or select player"
                  />
                )}
              />
            ))}
          </Stack>
        ))}
      </Box>
      {adding && (
        <PlayerFormDialog
          client={client}
          groupId={groupId}
          onClose={() => setAdding(null)}
          onSaved={(player) => {
            onPlayerAdded(player);
            assign(adding.team, adding.position, player);
            setAdding(null);
          }}
        />
      )}
    </Stack>
  );
};
