import {
  Autocomplete,
  Box,
  Chip,
  Stack,
  TextField,
  Typography,
  createFilterOptions,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useState } from 'react';
import { lineupCoverage, lineupRoles } from '../../../game/lineupRoles';
import { playerPositions } from '../../../game/playerProfile';
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
const positionChipColors: Record<(typeof playerPositions)[number]['abbreviation'], string> = {
  S: '#93c5fd',
  MB: '#5eead4',
  OH: '#c4b5fd',
  O: '#fda4af',
  LB: '#fde68a',
};
const addPlayer: SelectablePlayer = { id: '__add_player__', name: '＋ Add player…' };
const filterPlayers = createFilterOptions<SelectablePlayer>({
  stringify: (player) => `${player.name} ${player.display_id ?? ''}`,
});
const label = (player: SelectablePlayer) =>
  `${player.name}${player.id === addPlayer.id ? '' : player.category === 'regular' ? ' · Regular' : ' · Sub'}`;
const preferredPositions = (player?: SelectablePlayer) =>
  playerPositions.filter(({ id }) => player?.preferred_positions?.includes(id));
const rolePreferences = (player?: SelectablePlayer) => {
  const positions = preferredPositions(player);
  return lineupRoles
    .filter(({ id }) => positions.some((p) => p.abbreviation === id))
    .map(({ id }) => id);
};

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
  const registry = new Map(players.map((player) => [player.id, player]));
  const updatePlayer = (
    team: Game.TeamId,
    position: number,
    player: Models.DayLineupPlayer | null,
  ) =>
    onChange({
      ...lineup,
      [team]: {
        ...lineup[team],
        players: lineup[team].players.map((person, index) =>
          index === position ? player : person,
        ),
      },
    });
  const assign = (team: Game.TeamId, position: number, player: Models.Participant | null) => {
    if (player && selected.has(player.id)) return;
    updatePlayer(team, position, player ? { id: player.id, name: player.name } : null);
  };
  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        Search by name or player ID. Players who can fill a missing role appear first. Use Role to
        override a suggestion. Player slots set the starting order on the court.
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
        {(['A', 'B'] as const).map((team) => {
          const candidates = lineup[team].players.map((person) =>
            person
              ? { role: person.role, preferences: rolePreferences(registry.get(person.id)) }
              : null,
          );
          const coverage = lineupCoverage(candidates);
          return (
            <Stack key={team} spacing={1} sx={{ minWidth: 0 }}>
              <TextField
                label={`Team ${team} name`}
                value={lineup[team].name}
                disabled={disabled}
                onChange={(event) =>
                  onChange({ ...lineup, [team]: { ...lineup[team], name: event.target.value } })
                }
                slotProps={{ htmlInput: { maxLength: 16 } }}
              />
              <Stack
                direction="row"
                role="group"
                aria-label={`Team ${team} role coverage`}
                sx={{ flexWrap: 'wrap', gap: 1, py: 0.75 }}
              >
                {lineupRoles.map(({ id, label, target }) => (
                  <Chip
                    key={id}
                    size="small"
                    label={`${id} ${coverage.counts[id]}/${target}`}
                    title={label}
                    color={coverage.counts[id] === target ? 'success' : 'warning'}
                    variant={coverage.counts[id] === target ? 'filled' : 'outlined'}
                  />
                ))}
              </Stack>
              {lineup[team].players.map((person, position) => (
                <Box
                  key={position}
                  sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 7.5rem', gap: 1 }}
                >
                  <Autocomplete<SelectablePlayer>
                    options={sorted}
                    value={(person && registry.get(person.id)) ?? person}
                    disabled={disabled}
                    getOptionLabel={label}
                    getOptionKey={(option) => option.id}
                    isOptionEqualToValue={(option, value) => option.id === value.id}
                    getOptionDisabled={(option) =>
                      option.id !== person?.id && selected.has(option.id)
                    }
                    filterOptions={(options, state) => {
                      const eligible = filterPlayers(options, state);
                      const next = candidates.slice();
                      next[position] = null;
                      const { filled } = lineupCoverage(next);
                      const suggested = new Set<string>();
                      for (const option of eligible) {
                        if (option.id === person?.id || selected.has(option.id)) continue;
                        const preferences = rolePreferences(option);
                        if (preferences.length === 0) continue;
                        next[position] = { role: undefined, preferences };
                        if (lineupCoverage(next).filled > filled) suggested.add(option.id);
                      }
                      return [
                        ...eligible.filter((option) => suggested.has(option.id)),
                        ...eligible.filter((option) => !suggested.has(option.id)),
                        addPlayer,
                      ];
                    }}
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
                          <Stack
                            direction="row"
                            sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 0.75 }}
                          >
                            <span>{label(option)}</span>
                            {preferredPositions(option).map(({ id, abbreviation, label }) => {
                              const color = positionChipColors[abbreviation];
                              return (
                                <Chip
                                  key={id}
                                  component="span"
                                  size="small"
                                  variant="outlined"
                                  label={abbreviation}
                                  title={label}
                                  sx={{
                                    color,
                                    backgroundColor: alpha(color, 0.15),
                                    borderColor: alpha(color, 0.45),
                                    fontWeight: 600,
                                  }}
                                />
                              );
                            })}
                            {assigned && <Typography variant="caption">· {assigned}</Typography>}
                          </Stack>
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
                  <TextField
                    select
                    label="Role"
                    disabled={disabled || !person}
                    value={person?.role ?? ''}
                    sx={{ '& .MuiNativeSelect-select': { fontSize: '0.875rem' } }}
                    slotProps={{
                      select: {
                        native: true,
                        inputProps: {
                          'aria-label': `Team ${team} · Role for player ${position + 1}`,
                        },
                      },
                      inputLabel: { shrink: true },
                    }}
                    onChange={(event) => {
                      if (!person) return;
                      const role = lineupRoles.find(({ id }) => id === event.target.value)?.id;
                      const { id, name } = person;
                      updatePlayer(team, position, role ? { id, name, role } : { id, name });
                    }}
                  >
                    <option value="">
                      {!person
                        ? '—'
                        : coverage.roles[position] && !person.role
                          ? `Auto · ${coverage.roles[position]}`
                          : 'Auto'}
                    </option>
                    {lineupRoles.map(({ id }) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                  </TextField>
                </Box>
              ))}
            </Stack>
          );
        })}
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
