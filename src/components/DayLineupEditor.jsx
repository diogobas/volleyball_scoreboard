import { useState } from 'react';
import { Autocomplete, Box, Stack, TextField, Typography, createFilterOptions } from '@mui/material';
import PlayerFormDialog from './PlayerFormDialog';

const addPlayer = { id: '__add_player__', name: '＋ Add player…' };
const filterPlayers = createFilterOptions({ stringify: player => `${player.name} ${player.display_id ?? ''}` });
const label = player => `${player.name}${player.id === addPlayer.id ? '' : player.category === 'fixed' ? ' · Fixed' : ' · Sub'}`;

export default function DayLineupEditor({ lineup, players, disabled, onChange, client, groupId, onPlayerAdded }) {
  const [adding, setAdding] = useState(null);
  const selected = new Map(['A', 'B'].flatMap(team => lineup[team].players.flatMap((person, position) => person ? [[person.id, `Team ${team} · Player ${position + 1}`]] : [])));
  const sorted = [...players].sort((a, b) => a.name.localeCompare(b.name, 'pt', { sensitivity: 'base' }));
  function assign(team, position, player) {
    if (player && player.id !== lineup[team].players[position]?.id && selected.has(player.id)) return;
    onChange({ ...lineup, [team]: { ...lineup[team], players: lineup[team].players.map((person, index) => index === position ? player ? { id: player.id, name: player.name } : null : person) } });
  }
  return <Stack spacing={2}>
    <Typography variant="body2" color="text.secondary">Replace a player directly: search all registered players, including Subs, by name or player ID. Players already assigned to another position are disabled. Choose “Add player…” if someone is missing.</Typography>
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>{['A', 'B'].map(team => <Stack key={team} spacing={1}>
      <TextField label={`Team ${team} name`} value={lineup[team].name} disabled={disabled} onChange={event => onChange({ ...lineup, [team]: { ...lineup[team], name: event.target.value } })} slotProps={{ htmlInput: { maxLength: 16 } }} />
      {lineup[team].players.map((person, position) => <Autocomplete key={position}
        options={sorted} value={players.find(player => player.id === person?.id) ?? person ?? null} disabled={disabled}
        getOptionLabel={label} isOptionEqualToValue={(option, value) => option.id === value.id}
        getOptionDisabled={option => option.id !== person?.id && selected.has(option.id)}
        filterOptions={(options, state) => [...filterPlayers(options, state), addPlayer]}
        onChange={(_, player) => player?.id === addPlayer.id ? setAdding({ team, position }) : assign(team, position, player)}
        renderOption={(props, option) => {
          const { key, ...rest } = props;
          const assigned = option.id !== person?.id && selected.get(option.id);
          return <li key={key} {...rest}>{label(option)}{assigned ? ` · ${assigned}` : ''}</li>;
        }}
        renderInput={params => <TextField {...params} label={`Team ${team} · Player ${position + 1}`} placeholder="Search or select player" />}
      />)}
    </Stack>)}</Box>
    {adding && <PlayerFormDialog client={client} groupId={groupId} onClose={() => setAdding(null)} onSaved={player => {
      onPlayerAdded(player); assign(adding.team, adding.position, player); setAdding(null);
    }} />}
  </Stack>;
}
